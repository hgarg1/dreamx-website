
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Setup DB path
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'dreamx.db');
const dbRaw = new Database(dbPath);

// Create tables manually before requiring app db module
// because app db module assumes tables exist for migration checks
dbRaw.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'user',
  profile_picture TEXT,
  handle TEXT UNIQUE,
  account_status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER,
  following_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  content_type TEXT,
  text_content TEXT,
  media_url TEXT,
  is_reel INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Now we can require the app db module
const { db, createUser, createPost, followUser, getFollowing } = require('../db');

// Setup
const BENCHMARK_USER_EMAIL = 'bench@example.com';
const FOLLOWED_COUNT = 500;

async function setup() {
    console.log('Setting up benchmark data...');

    // Create benchmark user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(BENCHMARK_USER_EMAIL);
    let userId;
    if (!user) {
        // We use direct SQL if createUser fails or to be safe
        const info = db.prepare(`INSERT INTO users (full_name, email, password_hash, handle) VALUES (?, ?, ?, ?)`).run(
            'Benchmark User', BENCHMARK_USER_EMAIL, 'hash', 'benchuser'
        );
        userId = info.lastInsertRowid;
    } else {
        userId = user.id;
    }

    // Check existing follows
    const following = getFollowing(userId, 1000);
    if (following.length >= FOLLOWED_COUNT) {
        console.log(`Already following ${following.length} users. Skipping massive creation.`);
        return userId;
    }

    const needed = FOLLOWED_COUNT - following.length;
    console.log(`Creating ${needed} users and follows...`);

    const stmtUser = db.prepare('INSERT INTO users (full_name, email, password_hash, handle) VALUES (?, ?, ?, ?)');
    const stmtFollow = db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)');
    const stmtPost = db.prepare('INSERT INTO posts (user_id, is_reel, created_at) VALUES (?, ?, ?)');

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();

    db.transaction(() => {
        for (let i = 0; i < needed; i++) {
            const email = `bench_followed_${Date.now()}_${i}@example.com`;
            const handle = `bf_${Date.now()}_${i}`;
            const info = stmtUser.run(`Followed User ${i}`, email, 'hash', handle);
            const followedId = info.lastInsertRowid;

            stmtFollow.run(userId, followedId);

            // Add a reel for 50% of users
            if (i % 2 === 0) {
                stmtPost.run(followedId, 1, oneHourAgo);
            }
        }
    })();

    console.log('Setup complete.');
    return userId;
}

async function runBenchmark(userId) {
    console.log('Running benchmark...');

    const followed = getFollowing(userId, 500);

    // Original (N+1)
    console.log('--- Baseline (N+1) ---');
    const start1 = process.hrtime();
    const activeReels1 = followed.map(u => ({
        user_id: u.id,
        full_name: u.full_name,
        profile_picture: u.profile_picture,
        reelCount: require('../db').getActiveReelCount(u.id)
    })).filter(r => r.reelCount > 0).sort((a, b) => b.reelCount - a.reelCount);
    const end1 = process.hrtime(start1);
    const timeInMs1 = (end1[0] * 1000 + end1[1] / 1e6).toFixed(2);
    console.log(`Time: ${timeInMs1}ms`);
    console.log(`Found ${activeReels1.length} users with active reels.`);

    // Optimized (Batch)
    console.log('--- Optimized (Batch) ---');
    const start2 = process.hrtime();
    const userIds = followed.map(u => u.id);
    const reelCounts = require('../db').getActiveReelCountsForUsers(userIds);
    const activeReels2 = followed.map(u => ({
        user_id: u.id,
        full_name: u.full_name,
        profile_picture: u.profile_picture,
        reelCount: reelCounts[u.id] || 0
    })).filter(r => r.reelCount > 0).sort((a, b) => b.reelCount - a.reelCount);
    const end2 = process.hrtime(start2);
    const timeInMs2 = (end2[0] * 1000 + end2[1] / 1e6).toFixed(2);
    console.log(`Time: ${timeInMs2}ms`);
    console.log(`Found ${activeReels2.length} users with active reels.`);
}

async function main() {
    try {
        const userId = await setup();
        await runBenchmark(userId);
    } catch (e) {
        console.error(e);
    }
}

main();

const path = require('path');
const Database = require('better-sqlite3');

// Create / open persistent database file
const db = new Database(path.join(__dirname, 'dreamx.db'));

// Initialize schema if not exists
// Users table stores core account and onboarding data as JSON strings
// For simplicity passions/categories/goals stored as JSON text columns
// Passwords stored as bcrypt hash
// experience is a single string
// Additional columns can be added later via migrations

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  categories TEXT,
  goals TEXT,
  experience TEXT,
  bio TEXT,
  location TEXT,
  skills TEXT,
  profile_picture TEXT,
  banner_image TEXT,
  provider TEXT,
  provider_id TEXT,
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1,
  message_notifications INTEGER DEFAULT 1,
  email_verified INTEGER DEFAULT 0,
  verification_code TEXT,
  verification_code_expires DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  transports TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  is_group INTEGER DEFAULT 0,
  group_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user1_id) REFERENCES users(id),
  FOREIGN KEY (user2_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_type ON message_reactions(reaction_type);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  payment_provider TEXT DEFAULT NULL,
  provider_subscription_id TEXT DEFAULT NULL,
  provider_customer_id TEXT DEFAULT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME,
  auto_renew INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  payment_provider TEXT DEFAULT 'mock',
  provider_payment_method_id TEXT DEFAULT NULL,
  card_type TEXT NOT NULL,
  last_four TEXT NOT NULL,
  expiry_month INTEGER NOT NULL,
  expiry_year INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  payment_provider TEXT DEFAULT NULL,
  provider_payment_id TEXT DEFAULT NULL,
  amount REAL NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  payment_provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, payment_provider),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  price_per_hour REAL NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  experience_level TEXT,
  format TEXT,
  availability TEXT,
  location TEXT,
  tags TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
`);

// Lightweight migrations for existing databases (ensure new columns exist)
try {
  const cols = db.prepare("PRAGMA table_info('users')").all();
  const names = new Set(cols.map(c => c.name));
  if (!names.has('email_verified')) {
    db.prepare("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0").run();
  }
  if (!names.has('verification_code')) {
    db.prepare("ALTER TABLE users ADD COLUMN verification_code TEXT").run();
  }
  if (!names.has('verification_code_expires')) {
    db.prepare("ALTER TABLE users ADD COLUMN verification_code_expires DATETIME").run();
  }
} catch (e) {
  console.warn('Schema migration warning:', e.message);
}

// --- Services: Orders and Reviews (for verified purchaser ratings) ---
try {
  db.exec(`CREATE TABLE IF NOT EXISTS service_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_service_orders_service ON service_orders(service_id);
  CREATE INDEX IF NOT EXISTS idx_service_orders_buyer ON service_orders(buyer_id);
  CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
  `);
} catch (e) { /* table may already exist */ }

try {
  db.exec(`CREATE TABLE IF NOT EXISTS service_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, user_id),
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_service_reviews_service ON service_reviews(service_id);
  CREATE INDEX IF NOT EXISTS idx_service_reviews_user ON service_reviews(user_id);
  `);
} catch (e) { /* table may already exist */ }

// Migration: Add new columns if they don't exist
try {
  db.exec(`ALTER TABLE users ADD COLUMN profile_picture TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active';`);
} catch (e) {
  // Column already exists, ignore
}
// Ensure all existing users have account_status set
try {
  db.exec(`UPDATE users SET account_status = 'active' WHERE account_status IS NULL;`);
} catch (e) {
  // Ignore if fails
}

// Seed Global Admin account if it doesn't exist
try {
  const adminExists = db.prepare(`SELECT id FROM users WHERE email = ?`).get('admin@dreamx.local');
  if (!adminExists) {
    const bcrypt = require('bcrypt');
    const adminPassword = bcrypt.hashSync('DreamXAdmin2025!', 10);
    db.prepare(`INSERT INTO users (full_name, email, password_hash, role, account_status, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .run('Global Administrator', 'admin@dreamx.local', adminPassword, 'global_admin', 'active', 'Global Administrator - Full System Access');
    console.log('✅ Global Admin account created: admin@dreamx.local / DreamXAdmin2025!');
  } else {
    // Ensure existing admin has global_admin role
    const adminRole = db.prepare(`SELECT role FROM users WHERE email = ?`).get('admin@dreamx.local');
    if (adminRole && adminRole.role !== 'global_admin') {
      db.prepare(`UPDATE users SET role = 'global_admin' WHERE email = ?`).run('admin@dreamx.local');
      console.log('✅ Admin account upgraded to global_admin role');
    }
  }
} catch (e) {
  console.warn('Admin seed error:', e.message);
}

// Seed HR account if it doesn't exist
try {
  const hrExists = db.prepare(`SELECT id FROM users WHERE email = ?`).get('hr@dreamx.local');
  if (!hrExists) {
    const bcrypt = require('bcrypt');
    const hrPassword = bcrypt.hashSync('DreamXHR2025!', 10);
    db.prepare(`INSERT INTO users (full_name, email, password_hash, role, account_status, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .run('HR Manager', 'hr@dreamx.local', hrPassword, 'hr', 'active', 'Human Resources Department - Talent Acquisition and Employee Relations');
    console.log('✅ HR account created: hr@dreamx.local / DreamXHR2025!');
  }
} catch (e) {
  console.warn('HR seed error:', e.message);
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN suspension_until DATETIME;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN seller_privileges_frozen INTEGER DEFAULT 0;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bank_account_country TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bank_account_number TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bank_routing_number TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN suspension_reason TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN bio TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN location TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN skills TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN provider TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN provider_id TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
// Ensure oauth_accounts table exists (idempotent)
db.exec(`CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);
try {
  db.exec(`ALTER TABLE users ADD COLUMN push_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN message_notifications INTEGER DEFAULT 1;`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE users ADD COLUMN banner_image TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
// Normalize any previously stored absolute upload paths
try {
  // Strip leading '/uploads/' to keep DB paths relative
  db.exec(`UPDATE users SET profile_picture = substr(profile_picture, 10) WHERE profile_picture LIKE '/uploads/%';`);
  db.exec(`UPDATE users SET banner_image = substr(banner_image, 10) WHERE banner_image LIKE '/uploads/%';`);
} catch (e) {
  // ignore
}
// Posts reels support migration (idempotent)
try { db.exec(`ALTER TABLE posts ADD COLUMN is_reel INTEGER DEFAULT 0;`); } catch (e) {}
// Posts audio support migration (idempotent)
try { db.exec(`ALTER TABLE posts ADD COLUMN audio_url TEXT;`); } catch (e) {}
// Privacy settings migrations (idempotent)
try { db.exec(`ALTER TABLE users ADD COLUMN profile_visibility TEXT DEFAULT 'public';`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN allow_messages_from TEXT DEFAULT 'everyone';`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN discoverable_by_email INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN show_online_status INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN read_receipts INTEGER DEFAULT 1;`); } catch (e) {}
// Messages attachments migration (idempotent)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN attachment_url TEXT;`);
} catch (e) {
  // Column exists
}
try {
  db.exec(`ALTER TABLE messages ADD COLUMN attachment_mime TEXT;`);
} catch (e) {
  // Column exists
}
// Group conversations migration
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN is_group INTEGER DEFAULT 0;`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN group_name TEXT;`);
} catch (e) {}
// Handle column migration (can't add UNIQUE directly in ALTER TABLE)
try {
  db.exec(`ALTER TABLE users ADD COLUMN handle TEXT;`);
} catch (e) {
  // Column already exists, ignore
}
// Create unique index for handle if it doesn't exist
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle);`);
} catch (e) {
  // Index already exists, ignore
}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS conversation_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(conversation_id, user_id)
  );`);
} catch (e) {}

// Comments replies migration (idempotent)
try { db.exec(`ALTER TABLE post_comments ADD COLUMN parent_id INTEGER;`); } catch (e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);`); } catch (e) {}

// Comment moderation columns
try { db.exec(`ALTER TABLE post_comments ADD COLUMN is_hidden INTEGER DEFAULT 0;`); } catch (e) {}
try { db.exec(`ALTER TABLE post_comments ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch (e) {}

// Onboarding enhancements migration (idempotent)
try { db.exec(`ALTER TABLE users ADD COLUMN daily_time_commitment TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN best_time TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN reminder_frequency TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN accountability_style TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN progress_visibility TEXT DEFAULT 'public';`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN content_preferences TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN content_format_preference TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN open_to_mentoring TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN first_goal TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN first_goal_date TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN first_goal_metric TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN first_goal_public INTEGER DEFAULT 0;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_followers INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_likes_comments INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_milestones INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_inspiration INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_community INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_weekly_summary INTEGER DEFAULT 1;`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN notify_method TEXT DEFAULT 'both';`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0;`); } catch (e) {}

// Ensure audit logs table exists
try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`);
} catch (e) {}

// Follows table
db.exec(`CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
`);

// Posts table for rich feed content
db.exec(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content_type TEXT DEFAULT 'text',
  text_content TEXT,
  media_url TEXT,
  audio_url TEXT,
  is_reel INTEGER DEFAULT 0,
  activity_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);

// Reactions and comments for posts
db.exec(`CREATE TABLE IF NOT EXISTS post_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_type ON post_reactions(reaction_type);
`);

db.exec(`CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES post_comments(id)
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);
`);

db.exec(`CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES post_comments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
`);

// User blocks and reports
db.exec(`CREATE TABLE IF NOT EXISTS user_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);
`);

db.exec(`CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  reported_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status);
`);

db.exec(`CREATE TABLE IF NOT EXISTS user_moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  block_functionality_locked INTEGER DEFAULT 0,
  lock_reason TEXT,
  locked_by INTEGER,
  locked_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_moderation_locked ON user_moderation(block_functionality_locked);
`);

// Careers applications table
db.exec(`CREATE TABLE IF NOT EXISTS career_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cover_letter TEXT NOT NULL,
  resume_file TEXT,
  portfolio_file TEXT,
  status TEXT DEFAULT 'new',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Content appeals table
db.exec(`CREATE TABLE IF NOT EXISTS content_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_url TEXT,
  removal_reason TEXT,
  description TEXT,
  appeal_reason TEXT NOT NULL,
  additional_info TEXT,
  status TEXT DEFAULT 'open',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Account appeals table
db.exec(`CREATE TABLE IF NOT EXISTS account_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  account_action TEXT NOT NULL,
  action_date TEXT,
  violation_reason TEXT,
  appeal_reason TEXT NOT NULL,
  prevention_plan TEXT,
  additional_info TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'open',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Add moderation columns to service_reviews if they don't exist
try {
  db.exec(`ALTER TABLE service_reviews ADD COLUMN is_hidden INTEGER DEFAULT 0`);
} catch(e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE service_reviews ADD COLUMN is_deleted INTEGER DEFAULT 0`);
} catch(e) { /* Column already exists */ }

module.exports = {
  db,
  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  getUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
  getUserByHandle: (handle) => db.prepare('SELECT * FROM users WHERE handle = ?').get(handle),
  getUserByProvider: (provider, providerId) => db.prepare(`
      SELECT u.* FROM oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = ? AND oa.provider_id = ?
  `).get(provider, providerId),
  getLinkedAccountsForUser: (userId) => db.prepare(
    `SELECT provider, provider_id FROM oauth_accounts WHERE user_id = ?`
  ).all(userId),
  createUser: ({ fullName, email, passwordHash, handle }) => {
    const stmt = db.prepare(`INSERT INTO users (full_name, email, password_hash, handle) VALUES (?,?,?,?)`);
    const info = stmt.run(fullName, email, passwordHash, handle || null);
    return info.lastInsertRowid;
  },
  updateUserHandle: ({ userId, handle }) => {
    db.prepare(`UPDATE users SET handle = ? WHERE id = ?`).run(handle, userId);
  },
  updateUserRole: ({ userId, role }) => {
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
  },
  
  // Email Verification
  createVerificationCode: ({ userId, email, code, expiresAt }) => {
    const stmt = db.prepare(`INSERT INTO email_verification_codes (user_id, email, code, expires_at) VALUES (?,?,?,?)`);
    const info = stmt.run(userId, email, code, expiresAt);
    return info.lastInsertRowid;
  },
  getVerificationCode: ({ userId, code }) => {
    return db.prepare(`SELECT * FROM email_verification_codes WHERE user_id = ? AND code = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1`).get(userId, code);
  },
  markCodeAsVerified: ({ id }) => {
    db.prepare(`UPDATE email_verification_codes SET verified = 1 WHERE id = ?`).run(id);
  },
  markEmailAsVerified: ({ userId }) => {
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(userId);
  },
  deleteExpiredVerificationCodes: () => {
    db.prepare(`DELETE FROM email_verification_codes WHERE expires_at < datetime('now') AND verified = 0`).run();
  },
  
  getAllUsers: () => db.prepare(`SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC`).all(),
  // Paged users + total for admin
  getUsersPaged: ({ limit, offset, search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      return db.prepare(`
        SELECT id, full_name, email, role, account_status, created_at
        FROM users
        WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(s, s, limit, offset);
    }
    return db.prepare(`
      SELECT id, full_name, email, role, account_status, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  },
  getUsersCount: ({ search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      return db.prepare(`SELECT COUNT(*) as c FROM users WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?`).get(s, s).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
  },
  searchUsers: ({ query, limit = 10, excludeUserId }) => {
    const s = `%${(query || '').toLowerCase()}%`;
    if (excludeUserId) {
      return db.prepare(`
        SELECT id, full_name, email, profile_picture, bio, location, handle
        FROM users
        WHERE id != ? AND (
          LOWER(full_name) LIKE ? 
          OR LOWER(handle) LIKE ?
          OR (discoverable_by_email = 1 AND LOWER(email) LIKE ?)
        )
        ORDER BY full_name ASC
        LIMIT ?
      `).all(excludeUserId, s, s, s, limit);
    }
    return db.prepare(`
      SELECT id, full_name, email, profile_picture, bio, location, handle
      FROM users
      WHERE LOWER(full_name) LIKE ? 
        OR LOWER(handle) LIKE ?
        OR (discoverable_by_email = 1 AND LOWER(email) LIKE ?)
      ORDER BY full_name ASC
      LIMIT ?
    `).all(s, s, s, limit);
  },
  getStats: () => {
    const users = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
    const conv = db.prepare(`SELECT COUNT(*) as c FROM conversations`).get().c;
    const msgs = db.prepare(`SELECT COUNT(*) as c FROM messages`).get().c;
    return { users, conversations: conv, messages: msgs };
  },
  updateUserProvider: ({ userId, provider, providerId }) => {
    // Back-compat: also store on users table if columns exist
    try { db.prepare(`UPDATE users SET provider = ?, provider_id = ? WHERE id = ?`).run(provider, providerId, userId); } catch (e) {}
    // Preferred: link in oauth_accounts
    db.prepare(`INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_id) VALUES (?,?,?)`).run(userId, provider, providerId);
  },
  unlinkProvider: ({ userId, provider }) => {
    db.prepare(`DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?`).run(userId, provider);
  },
  updateOnboarding: ({
    userId, categories, goals, experience,
    daily_time_commitment, best_time, reminder_frequency,
    accountability_style, progress_visibility,
    content_preferences, content_format_preference,
    open_to_mentoring,
    first_goal, first_goal_date, first_goal_metric, first_goal_public,
    notify_followers, notify_likes_comments, notify_milestones,
    notify_inspiration, notify_community, notify_weekly_summary,
    notify_method, bio, profile_picture, onboarding_completed
  }) => {
    const updateStmt = db.prepare(`
      UPDATE users SET 
        categories = ?,
        goals = ?,
        experience = ?,
        daily_time_commitment = ?,
        best_time = ?,
        reminder_frequency = ?,
        accountability_style = ?,
        progress_visibility = ?,
        content_preferences = ?,
        content_format_preference = ?,
        open_to_mentoring = ?,
        first_goal = ?,
        first_goal_date = ?,
        first_goal_metric = ?,
        first_goal_public = ?,
        notify_followers = ?,
        notify_likes_comments = ?,
        notify_milestones = ?,
        notify_inspiration = ?,
        notify_community = ?,
        notify_weekly_summary = ?,
        notify_method = ?,
        bio = COALESCE(?, bio),
        profile_picture = COALESCE(?, profile_picture),
        onboarding_completed = ?
      WHERE id = ?
    `);
    
    updateStmt.run(
      JSON.stringify(categories || []),
      JSON.stringify(goals || []),
      experience,
      daily_time_commitment,
      best_time,
      reminder_frequency,
      accountability_style,
      progress_visibility,
      content_preferences,
      content_format_preference,
      open_to_mentoring,
      first_goal,
      first_goal_date,
      first_goal_metric,
      first_goal_public || 0,
      notify_followers || 0,
      notify_likes_comments || 0,
      notify_milestones || 0,
      notify_inspiration || 0,
      notify_community || 0,
      notify_weekly_summary || 0,
      notify_method,
      bio,
      profile_picture,
      onboarding_completed || 1,
      userId
    );
  },
  updateUserProfile: ({ userId, fullName, bio, location, skills }) => {
    db.prepare(`UPDATE users SET full_name = ?, bio = ?, location = ?, skills = ? WHERE id = ?`).run(
      fullName, bio, location, skills, userId
    );
  },
  updateProfilePicture: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET profile_picture = ? WHERE id = ?`).run(filename, userId);
  },
  updateBannerImage: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET banner_image = ? WHERE id = ?`).run(filename, userId);
  },
  updatePassword: ({ userId, passwordHash }) => {
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
  },
  updateNotificationSettings: ({ userId, emailNotifications, pushNotifications, messageNotifications }) => {
    db.prepare(`UPDATE users SET email_notifications = ?, push_notifications = ?, message_notifications = ? WHERE id = ?`).run(
      emailNotifications ? 1 : 0,
      pushNotifications ? 1 : 0,
      messageNotifications ? 1 : 0,
      userId
    );
  },
  updatePrivacySettings: ({ userId, profileVisibility, allowMessagesFrom, discoverableByEmail, showOnlineStatus, readReceipts }) => {
    db.prepare(`
      UPDATE users 
      SET profile_visibility = ?, 
          allow_messages_from = ?, 
          discoverable_by_email = ?, 
          show_online_status = ?, 
          read_receipts = ?
      WHERE id = ?
    `).run(
      (profileVisibility || 'public'),
      (allowMessagesFrom || 'everyone'),
      discoverableByEmail ? 1 : 0,
      showOnlineStatus ? 1 : 0,
      readReceipts ? 1 : 0,
      userId
    );
  },
  // Messaging functions
  getOrCreateConversation: ({ user1Id, user2Id }) => {
    const existing = db.prepare(`
      SELECT * FROM conversations 
      WHERE is_group = 0 AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
    `).get(user1Id, user2Id, user2Id, user1Id);
    if (existing) return existing;
    const stmt = db.prepare(`INSERT INTO conversations (user1_id, user2_id, is_group) VALUES (?,?,0)`);
    const info = stmt.run(user1Id, user2Id);
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  },
  createGroupConversation: ({ creatorId, participantIds, groupName }) => {
    const stmt = db.prepare(`INSERT INTO conversations (user1_id, user2_id, is_group, group_name) VALUES (?,?,1,?)`);
    const info = stmt.run(creatorId, creatorId, groupName || 'Group Chat');
    const convId = info.lastInsertRowid;
    const addStmt = db.prepare(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?,?)`);
    addStmt.run(convId, creatorId);
    participantIds.forEach(uid => addStmt.run(convId, uid));
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  },
  getConversationParticipants: (conversationId) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
    `).all(conversationId);
  },
  isUserInConversation: ({ conversationId, userId }) => {
    const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(conversationId);
    if (!conv) return false;
    if (conv.is_group) {
      const part = db.prepare(`SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId);
      return !!part;
    }
    return conv.user1_id === userId || conv.user2_id === userId;
  },
  getUserConversations: (userId) => {
    const direct = db.prepare(`
      SELECT c.*, 
        CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
        u.full_name as other_user_name,
        u.profile_picture as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = 0) as unread_count
      FROM conversations c
      JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND c.is_group = 0
    `).all(userId, userId, userId, userId, userId);
    const groups = db.prepare(`
      SELECT c.*,
        c.group_name as other_user_name,
        NULL as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = 0) as unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ? AND c.is_group = 1
    `).all(userId, userId);
    return [...direct, ...groups].sort((a, b) => {
      const ta = new Date(a.last_message_time || 0).getTime();
      const tb = new Date(b.last_message_time || 0).getTime();
      return tb - ta;
    });
  },
  getConversationMessages: (conversationId) => {
    return db.prepare(`
      SELECT m.*, u.full_name as sender_name, u.profile_picture as sender_picture
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(conversationId);
  },
  createMessage: ({ conversationId, senderId, content, attachmentUrl, attachmentMime }) => {
    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, content, attachment_url, attachment_mime)
      VALUES (?,?,?,?,?)
    `);
    const info = stmt.run(conversationId, senderId, content || '', attachmentUrl || null, attachmentMime || null);
    return info.lastInsertRowid;
  },
  markMessagesAsRead: ({ conversationId, userId }) => {
    db.prepare(`UPDATE messages SET read = 1 WHERE conversation_id = ? AND sender_id != ?`).run(conversationId, userId);
  },
  getUnreadMessageCount: (userId) => {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.read = 0
    `).get(userId, userId, userId);
    return result.count;
  },
  // Audit logs
  addAuditLog: ({ userId, action, details }) => {
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(userId || null, action, details || null);
  },
  getAuditLogsPaged: ({ limit, offset }) => {
    return db.prepare(`SELECT id, user_id, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getAuditLogCount: () => {
    return db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c;
  },
  // Posts
  createPost: ({ userId, contentType, textContent, mediaUrl, audioUrl, activityLabel, isReel }) => {
    const stmt = db.prepare(`INSERT INTO posts (user_id, content_type, text_content, media_url, audio_url, activity_label, is_reel) VALUES (?,?,?,?,?,?,?)`);
    const info = stmt.run(userId, contentType || 'text', textContent || null, mediaUrl || null, audioUrl || null, activityLabel || null, isReel ? 1 : 0);
    return info.lastInsertRowid;
  },
  getFeedPosts: ({ limit, offset }) => {
    return db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture,
        (SELECT COUNT(*) FROM posts) as total_count,
        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_reel = 0
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset).map(row => {
      const counts = db.prepare(`
        SELECT reaction_type, COUNT(*) as c
        FROM post_reactions
        WHERE post_id = ?
        GROUP BY reaction_type
      `).all(row.id);
      row.reactions = counts.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
      return row;
    });
  },
  getUserPosts: (userId) => {
    return db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(userId);
  },
  getUserReels: (userId) => {
    return db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ? AND p.is_reel = 1
      ORDER BY p.created_at DESC
    `).all(userId);
  },
  getPostById: (postId) => {
    const row = db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);
    if (!row) return null;
    const counts = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    row.reactions = counts.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    row.comments_count = db.prepare(`SELECT COUNT(*) as c FROM post_comments WHERE post_id = ?`).get(postId).c;
    return row;
  },
  // Reactions
  setPostReaction: ({ postId, userId, reactionType }) => {
    const existing = db.prepare(`SELECT id, reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(postId, userId);
    let status = 'set';
    if (!existing) {
      db.prepare(`INSERT INTO post_reactions (post_id, user_id, reaction_type) VALUES (?,?,?)`).run(postId, userId, reactionType);
      status = 'set';
    } else if (existing.reaction_type === reactionType) {
      db.prepare(`DELETE FROM post_reactions WHERE id = ?`).run(existing.id);
      status = 'cleared';
    } else {
      db.prepare(`UPDATE post_reactions SET reaction_type = ? WHERE id = ?`).run(reactionType, existing.id);
      status = 'updated';
    }
    const summary = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    const counts = summary.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    return { status, counts };
  },
  getPostReactionsSummary: (postId) => {
    const rows = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    return rows.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
  },
  getUserReactionForPost: ({ postId, userId }) => {
    const row = db.prepare(`SELECT reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(postId, userId);
    return row ? row.reaction_type : null;
  },
  // Comments
  addPostComment: ({ postId, userId, content, parentId = null }) => {
    const info = db.prepare(`INSERT INTO post_comments (post_id, user_id, parent_id, content) VALUES (?,?,?,?)`).run(postId, userId, parentId || null, content);
    return info.lastInsertRowid;
  },
  getPostComments: ({ postId, limit = 20, offset = 0, isAdmin = false }) => {
    const whereClause = isAdmin 
      ? 'WHERE c.post_id = ?' 
      : 'WHERE c.post_id = ? AND c.is_hidden = 0 AND c.is_deleted = 0';
    
    const comments = db.prepare(`
      SELECT c.*, u.full_name, u.profile_picture,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS star_count,
        pc.user_id as parent_author_id,
        pu.full_name as parent_author_name
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN post_comments pc ON pc.id = c.parent_id
      LEFT JOIN users pu ON pu.id = pc.user_id
      ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `).all(postId, limit, offset);
    return comments;
  },
  getCommentsCount: (postId, isAdmin = false) => {
    const whereClause = isAdmin 
      ? 'WHERE post_id = ?' 
      : 'WHERE post_id = ? AND is_hidden = 0 AND is_deleted = 0';
    return db.prepare(`SELECT COUNT(*) as c FROM post_comments ${whereClause}`).get(postId).c;
  },
  toggleCommentLike: ({ commentId, userId }) => {
    const existing = db.prepare(`SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?`).get(commentId, userId);
    let liked = false;
    if (existing) {
      db.prepare(`DELETE FROM comment_likes WHERE id = ?`).run(existing.id);
      liked = false;
    } else {
      db.prepare(`INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)`).run(commentId, userId);
      liked = true;
    }
    const starCount = db.prepare(`SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ?`).get(commentId).c;
    return { liked, starCount };
  },
  // WebAuthn helpers
  addWebAuthnCredential: ({ userId, credentialId, publicKey, counter, transports }) => {
    db.prepare(`INSERT OR REPLACE INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports) VALUES (?,?,?,?,?)`)
      .run(userId, credentialId, publicKey, counter || 0, transports || null);
  },
  getCredentialsForUser: (userId) => {
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE user_id = ?`).all(userId);
  },
  getCredentialById: (credentialId) => {
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`).get(credentialId);
  },
  updateCredentialCounter: ({ credentialId, counter }) => {
    db.prepare(`UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?`).run(counter, credentialId);
  },
  // Notification helpers
  createNotification: ({ userId, type, title, message, link }) => {
    const stmt = db.prepare(`INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`);
    const result = stmt.run(userId, type, title, message, link || null);
    return result.lastInsertRowid;
  },
  getUserNotifications: (userId, limit = 50) => {
    const stmt = db.prepare(`
      SELECT id, type, title, message, link, read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  },
  getUnreadNotificationCount: (userId) => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`);
    const row = stmt.get(userId);
    return row ? row.count : 0;
  },
  markNotificationAsRead: (notificationId) => {
    const stmt = db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`);
    stmt.run(notificationId);
  },
  markAllNotificationsAsRead: (userId) => {
    const stmt = db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`);
    stmt.run(userId);
  },
  deleteNotification: (notificationId) => {
    const stmt = db.prepare(`DELETE FROM notifications WHERE id = ?`);
    stmt.run(notificationId);
  },
  savePushSubscription: ({ userId, endpoint, p256dh, auth }) => {
    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
    `);
    stmt.run(userId, endpoint, p256dh, auth);
  },
  getPushSubscriptions: (userId) => {
    const stmt = db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`);
    return stmt.all(userId);
  },
  deletePushSubscription: (endpoint) => {
    const stmt = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
    stmt.run(endpoint);
  },
  // Subscription helpers
  getUserSubscription: (userId) => {
    const stmt = db.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?`);
    return stmt.get(userId);
  },
  createOrUpdateSubscription: ({ userId, tier, status = 'active', endsAt = null, autoRenew = 1, provider = null, providerSubscriptionId = null, providerCustomerId = null }) => {
    const existing = db.prepare(`SELECT id FROM user_subscriptions WHERE user_id = ?`).get(userId);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE user_subscriptions 
        SET tier = ?, status = ?, ends_at = ?, auto_renew = ?, payment_provider = ?, provider_subscription_id = ?, provider_customer_id = ?, started_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(tier, status, endsAt, autoRenew, provider, providerSubscriptionId, providerCustomerId, userId);
      return existing.id;
    } else {
      const stmt = db.prepare(`
        INSERT INTO user_subscriptions (user_id, tier, status, ends_at, auto_renew, payment_provider, provider_subscription_id, provider_customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(userId, tier, status, endsAt, autoRenew, provider, providerSubscriptionId, providerCustomerId);
      return result.lastInsertRowid;
    }
  },
  cancelSubscription: (userId) => {
    const stmt = db.prepare(`UPDATE user_subscriptions SET status = 'cancelled', auto_renew = 0 WHERE user_id = ?`);
    stmt.run(userId);
  },
  // Payment methods
  addPaymentMethod: ({ userId, cardType, lastFour, expiryMonth, expiryYear, isDefault = 0, provider = 'mock', providerPaymentMethodId = null }) => {
    // If this is the default, unset other defaults
    if (isDefault) {
      db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(userId);
    }
    const stmt = db.prepare(`
      INSERT INTO payment_methods (user_id, payment_provider, provider_payment_method_id, card_type, last_four, expiry_month, expiry_year, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, provider, providerPaymentMethodId, cardType, lastFour, expiryMonth, expiryYear, isDefault);
    return result.lastInsertRowid;
  },
  getPaymentMethods: (userId) => {
    const stmt = db.prepare(`SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`);
    return stmt.all(userId);
  },
  deletePaymentMethod: (id) => {
    const stmt = db.prepare(`DELETE FROM payment_methods WHERE id = ?`);
    stmt.run(id);
  },
  setDefaultPaymentMethod: (id, userId) => {
    db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE payment_methods SET is_default = 1 WHERE id = ?`).run(id);
  },
  // Invoices
  createInvoice: ({ userId, amount, tier, status = 'paid', provider = null, providerPaymentId = null }) => {
    const stmt = db.prepare(`
      INSERT INTO invoices (user_id, amount, tier, status, payment_provider, provider_payment_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, amount, tier, status, provider, providerPaymentId);
    return result.lastInsertRowid;
  },
  getInvoices: (userId) => {
    const stmt = db.prepare(`SELECT * FROM invoices WHERE user_id = ? ORDER BY invoice_date DESC`);
    return stmt.all(userId);
  },
  // Payment customers (for storing provider customer IDs)
  getPaymentCustomer: ({ userId, provider }) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ? AND payment_provider = ?`);
    return stmt.get(userId, provider);
  },
  createPaymentCustomer: ({ userId, provider, providerCustomerId }) => {
    const stmt = db.prepare(`
      INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, payment_provider) DO UPDATE SET 
        provider_customer_id = excluded.provider_customer_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(userId, provider, providerCustomerId);
  },
  getAllPaymentCustomers: (userId) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ?`);
    return stmt.all(userId);
  },
  // Follow helpers
  followUser: ({ followerId, followingId }) => {
    db.prepare(`INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?,?)`).run(followerId, followingId);
  },
  unfollowUser: ({ followerId, followingId }) => {
    db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(followerId, followingId);
  },
  isFollowing: ({ followerId, followingId }) => {
    const row = db.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`).get(followerId, followingId);
    return !!row;
  },
  getFollowerCount: (userId) => {
    return db.prepare(`SELECT COUNT(*) as c FROM follows WHERE following_id = ?`).get(userId).c;
  },
  getFollowingCount: (userId) => {
    return db.prepare(`SELECT COUNT(*) as c FROM follows WHERE follower_id = ?`).get(userId).c;
  },
  getFollowers: (userId, limit = 100) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.bio
      FROM follows f
      JOIN users u ON u.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  },
  getFollowing: (userId, limit = 100) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.bio
      FROM follows f
      JOIN users u ON u.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  },
  // Active reel count (last 48 hours)
  getActiveReelCount: (userId) => {
    // Assuming created_at stored in UTC; we use SQLite datetime subtraction
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM posts WHERE user_id = ? AND is_reel = 1 AND created_at >= datetime('now', '-48 hours')`).get(userId);
    return row ? row.cnt : 0;
  },
  // Account moderation helpers
  banUser: ({ userId, reason, bannedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'banned', suspension_reason = ? WHERE id = ?`).run(reason || 'Violation of community guidelines', userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      bannedBy,
      'ban_user',
      JSON.stringify({ targetUserId: userId, reason: reason || 'Violation of community guidelines' })
    );
  },
  suspendUser: ({ userId, until, reason, suspendedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'suspended', suspension_until = ?, suspension_reason = ? WHERE id = ?`).run(until, reason || 'Temporary suspension', userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      suspendedBy,
      'suspend_user',
      JSON.stringify({ targetUserId: userId, until, reason: reason || 'Temporary suspension' })
    );
  },
  unbanUser: ({ userId, unbannedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'active', suspension_until = NULL, suspension_reason = NULL WHERE id = ?`).run(userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      unbannedBy,
      'unban_user',
      JSON.stringify({ targetUserId: userId })
    );
  },
  checkAccountStatus: (userId) => {
    const user = db.prepare(`SELECT account_status, suspension_until, suspension_reason FROM users WHERE id = ?`).get(userId);
    if (!user) return { status: 'not_found' };
    
    // Check if suspension has expired
    if (user.account_status === 'suspended' && user.suspension_until) {
      const now = new Date();
      const suspensionEnd = new Date(user.suspension_until);
      if (now >= suspensionEnd) {
        db.prepare(`UPDATE users SET account_status = 'active', suspension_until = NULL, suspension_reason = NULL WHERE id = ?`).run(userId);
        return { status: 'active' };
      }
    }
    
    return {
      status: user.account_status || 'active',
      suspensionUntil: user.suspension_until,
      suspensionReason: user.suspension_reason
    };
  },
  // Careers helpers
  createCareerApplication: ({ position, name, email, phone, coverLetter, resumeFile, portfolioFile }) => {
    const stmt = db.prepare(`
      INSERT INTO career_applications (position, name, email, phone, cover_letter, resume_file, portfolio_file)
      VALUES (?,?,?,?,?,?,?)
    `);
    const info = stmt.run(position, name, email, phone || null, coverLetter, resumeFile || null, portfolioFile || null);
    return info.lastInsertRowid;
  },
  getCareerApplicationsPaged: ({ limit = 50, offset = 0, status }) => {
    if (status) {
      return db.prepare(`SELECT * FROM career_applications WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(status, limit, offset);
    }
    return db.prepare(`SELECT * FROM career_applications ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getCareerApplicationById: (id) => {
    return db.prepare(`SELECT * FROM career_applications WHERE id = ?`).get(id);
  },
  updateCareerApplicationStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE career_applications SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  getCareerApplicationCounts: () => {
    const all = db.prepare(`SELECT COUNT(*) as c FROM career_applications`).get().c;
    const open = db.prepare(`SELECT COUNT(*) as c FROM career_applications WHERE status IN ('new','under_review')`).get().c;
    return { all, open };
  },
  // Content appeals helpers
  createContentAppeal: ({ email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo }) => {
    const stmt = db.prepare(`
      INSERT INTO content_appeals (email, content_type, content_url, removal_reason, description, appeal_reason, additional_info)
      VALUES (?,?,?,?,?,?,?)
    `);
    const info = stmt.run(email, contentType, contentUrl || null, removalReason || null, description || null, appealReason, additionalInfo || null);
    return info.lastInsertRowid;
  },
  getContentAppealsPaged: ({ limit = 50, offset = 0, status }) => {
    if (status) return db.prepare(`SELECT * FROM content_appeals WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(status, limit, offset);
    return db.prepare(`SELECT * FROM content_appeals ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getContentAppealById: (id) => {
    return db.prepare(`SELECT * FROM content_appeals WHERE id = ?`).get(id);
  },
  updateContentAppealStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE content_appeals SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  // Account appeals helpers
  createAccountAppeal: ({ email, username, accountAction, actionDate, violationReason, appealReason, preventionPlan, additionalInfo, contactEmail }) => {
    const stmt = db.prepare(`
      INSERT INTO account_appeals (email, username, account_action, action_date, violation_reason, appeal_reason, prevention_plan, additional_info, contact_email)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const info = stmt.run(email, username, accountAction, actionDate || null, violationReason || null, appealReason, preventionPlan || null, additionalInfo || null, contactEmail || null);
    return info.lastInsertRowid;
  },
  getAccountAppealsPaged: ({ limit = 50, offset = 0, status }) => {
    if (status) return db.prepare(`SELECT * FROM account_appeals WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(status, limit, offset);
    return db.prepare(`SELECT * FROM account_appeals ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  getAccountAppealById: (id) => {
    return db.prepare(`SELECT * FROM account_appeals WHERE id = ?`).get(id);
  },
  updateAccountAppealStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE account_appeals SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  // Get recent activity for feed sidebar
  getRecentActivity: (limit = 5) => {
    const activities = [];
    
    // Get recent posts (with user info)
    const recentPosts = db.prepare(`
      SELECT p.created_at, u.full_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_reel = 0
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(limit);
    
    recentPosts.forEach(post => {
      activities.push({
        type: 'post',
        desc: `${post.full_name} published a new post`,
        time: post.created_at,
        timestamp: new Date(post.created_at).getTime()
      });
    });
    
    // Get recent follows
    const recentFollows = db.prepare(`
      SELECT f.created_at, 
             u1.full_name as follower_name,
             u2.full_name as following_name
      FROM follows f
      JOIN users u1 ON f.follower_id = u1.id
      JOIN users u2 ON f.following_id = u2.id
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(limit);
    
    recentFollows.forEach(follow => {
      activities.push({
        type: 'follow',
        desc: `${follow.follower_name} followed ${follow.following_name}`,
        time: follow.created_at,
        timestamp: new Date(follow.created_at).getTime()
      });
    });
    
    // Get recent profile updates (we'll check for recent updates based on created_at being close to current time)
    const recentUpdates = db.prepare(`
      SELECT created_at, full_name
      FROM users
      WHERE datetime(created_at) >= datetime('now', '-1 day')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    
    recentUpdates.forEach(update => {
      activities.push({
        type: 'update',
        desc: `${update.full_name} updated their profile`,
        time: update.created_at,
        timestamp: new Date(update.created_at).getTime()
      });
    });
    
    // Sort all activities by timestamp descending and format time
    activities.sort((a, b) => b.timestamp - a.timestamp);
    
    // Format time strings
    const now = Date.now();
    activities.forEach(act => {
      const diff = now - act.timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) {
        act.time = 'just now';
      } else if (minutes < 60) {
        act.time = `${minutes}m ago`;
      } else if (hours < 24) {
        act.time = `${hours}h ago`;
      } else {
        act.time = `${days}d ago`;
      }
      
      // Clean up internal fields
      delete act.timestamp;
    });
    
    return activities.slice(0, limit);
  },
  // Comment moderation
  hideComment: ({ commentId, hiddenBy }) => {
    db.prepare(`UPDATE post_comments SET is_hidden = 1 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      hiddenBy,
      'hide_comment',
      JSON.stringify({ commentId })
    );
  },
  deleteComment: ({ commentId, deletedBy }) => {
    db.prepare(`UPDATE post_comments SET is_deleted = 1 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      deletedBy,
      'delete_comment',
      JSON.stringify({ commentId })
    );
  },
  restoreComment: ({ commentId, restoredBy }) => {
    db.prepare(`UPDATE post_comments SET is_hidden = 0, is_deleted = 0 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      restoredBy,
      'restore_comment',
      JSON.stringify({ commentId })
    );
  },
  getSuggestedUsers: ({ currentUserId, limit = 4 }) => {
    // Get users that the current user is NOT following and exclude self
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories
      FROM users u
      WHERE u.id != ?
        AND u.id NOT IN (
          SELECT following_id FROM follows WHERE follower_id = ?
        )
      ORDER BY (
        SELECT COUNT(*) FROM posts WHERE user_id = u.id
      ) DESC, u.created_at DESC
      LIMIT ?
    `).all(currentUserId, currentUserId, limit);
  },
  // Message reactions
  setMessageReaction: ({ messageId, userId, reactionType = 'like' }) => {
    const existing = db.prepare(`SELECT id, reaction_type FROM message_reactions WHERE message_id = ? AND user_id = ?`).get(messageId, userId);
    let status = 'set';
    if (!existing) {
      db.prepare(`INSERT INTO message_reactions (message_id, user_id, reaction_type) VALUES (?,?,?)`).run(messageId, userId, reactionType);
      status = 'set';
    } else if (existing.reaction_type === reactionType) {
      db.prepare(`DELETE FROM message_reactions WHERE id = ?`).run(existing.id);
      status = 'cleared';
    } else {
      db.prepare(`UPDATE message_reactions SET reaction_type = ? WHERE id = ?`).run(reactionType, existing.id);
      status = 'updated';
    }
    const summary = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM message_reactions
      WHERE message_id = ?
      GROUP BY reaction_type
    `).all(messageId);
    const counts = summary.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    return { status, counts };
  },
  getMessageReactions: (messageId) => {
    const rows = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM message_reactions
      WHERE message_id = ?
      GROUP BY reaction_type
    `).all(messageId);
    return rows.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
  },
  getUserReactionForMessage: ({ messageId, userId }) => {
    const row = db.prepare(`SELECT reaction_type FROM message_reactions WHERE message_id = ? AND user_id = ?`).get(messageId, userId);
    return row ? row.reaction_type : null;
  },
  // Get comment with parent info for nested comments
  getCommentWithParent: (commentId) => {
    return db.prepare(`
      SELECT c.*, u.full_name, u.profile_picture,
             p.full_name as parent_author_name
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN post_comments pc ON pc.id = c.parent_id
      LEFT JOIN users p ON p.id = pc.user_id
      WHERE c.id = ?
    `).get(commentId);
  },

  // Service management functions
  createService: ({ userId, title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl }) => {
    const stmt = db.prepare(`
      INSERT INTO services (user_id, title, description, category, price_per_hour, duration_minutes, experience_level, format, availability, location, tags, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, title, description, category, pricePerHour, durationMinutes || 60, experienceLevel, format, availability, location, tags, imageUrl);
    return result.lastInsertRowid;
  },

  getUserServices: (userId) => {
    return db.prepare(`
      SELECT * FROM services
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(userId);
  },

  getAllServices: ({ category, priceRange, experienceLevel, format, limit = 100 }) => {
    let query = `
      SELECT 
        s.*, 
        u.full_name, u.profile_picture, u.categories,
        (
          SELECT ROUND(AVG(r.rating), 2) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_avg,
        (
          SELECT COUNT(*) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_count
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'
    `;
    const params = [];
    
    if (category) {
      query += ` AND s.category = ?`;
      params.push(category);
    }
    if (priceRange) {
      if (priceRange === 'under-25') query += ` AND s.price_per_hour < 25`;
      else if (priceRange === '25-50') query += ` AND s.price_per_hour BETWEEN 25 AND 50`;
      else if (priceRange === '50-75') query += ` AND s.price_per_hour BETWEEN 50 AND 75`;
      else if (priceRange === '75plus') query += ` AND s.price_per_hour >= 75`;
    }
    if (experienceLevel) {
      query += ` AND s.experience_level = ?`;
      params.push(experienceLevel);
    }
    if (format) {
      query += ` AND s.format = ?`;
      params.push(format);
    }
    
    query += ` ORDER BY s.created_at DESC LIMIT ?`;
    params.push(limit);
    
    return db.prepare(query).all(...params);
  },

  getService: (serviceId) => {
    return db.prepare(`
      SELECT 
        s.*, 
        u.full_name, u.profile_picture, u.email, u.bio, u.categories,
        (
          SELECT ROUND(AVG(r.rating), 2) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_avg,
        (
          SELECT COUNT(*) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_count
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.status = 'active'
    `).get(serviceId);
  },

  updateService: ({ serviceId, userId, title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl }) => {
    const stmt = db.prepare(`
      UPDATE services
      SET title = ?, description = ?, category = ?, price_per_hour = ?, duration_minutes = ?,
          experience_level = ?, format = ?, availability = ?, location = ?, tags = ?, image_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);
    const result = stmt.run(title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl, serviceId, userId);
    return result.changes > 0;
  },

  deleteService: ({ serviceId, userId }) => {
    const stmt = db.prepare(`UPDATE services SET status = 'deleted' WHERE id = ? AND user_id = ?`);
    const result = stmt.run(serviceId, userId);
    return result.changes > 0;
  },

  getServiceCount: (userId) => {
    const result = db.prepare(`SELECT COUNT(*) as count FROM services WHERE user_id = ? AND status = 'active'`).get(userId);
    return result.count;
  },

  // Service Orders (for purchase verification)
  addServiceOrder: ({ serviceId, buyerId, status = 'completed' }) => {
    const info = db.prepare(`INSERT INTO service_orders (service_id, buyer_id, status) VALUES (?,?,?)`).run(serviceId, buyerId, status);
    return info.lastInsertRowid;
  },
  isVerifiedPurchaser: ({ serviceId, userId }) => {
    const row = db.prepare(`SELECT 1 FROM service_orders WHERE service_id = ? AND buyer_id = ? AND status = 'completed' LIMIT 1`).get(serviceId, userId);
    return !!row;
  },

  // Service Reviews
  addOrUpdateServiceReview: ({ serviceId, userId, rating, comment }) => {
    // Upsert: if review exists for (serviceId, userId), update; else insert
    const existing = db.prepare(`SELECT id FROM service_reviews WHERE service_id = ? AND user_id = ?`).get(serviceId, userId);
    if (existing) {
      db.prepare(`UPDATE service_reviews SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`).run(rating, comment || null, existing.id);
      return existing.id;
    }
    const info = db.prepare(`INSERT INTO service_reviews (service_id, user_id, rating, comment) VALUES (?,?,?,?)`).run(serviceId, userId, rating, comment || null);
    return info.lastInsertRowid;
  },
  getServiceReviews: ({ serviceId, limit = 20, offset = 0, isAdmin = false }) => {
    const whereClause = isAdmin 
      ? 'WHERE r.service_id = ?' 
      : 'WHERE r.service_id = ? AND r.is_hidden = 0 AND r.is_deleted = 0';
    
    return db.prepare(`
      SELECT r.*, u.full_name, u.profile_picture
      FROM service_reviews r
      JOIN users u ON u.id = r.user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(serviceId, limit, offset);
  },
  getServiceRatingsSummary: (serviceId) => {
    const row = db.prepare(`SELECT ROUND(AVG(rating), 2) AS avg, COUNT(*) AS count FROM service_reviews WHERE service_id = ?`).get(serviceId);
    return { average: row?.avg || 0, count: row?.count || 0 };
  },

  // Admin service moderation helpers
  adminSetServiceStatus: ({ serviceId, status }) => {
    const stmt = db.prepare(`UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    const result = stmt.run(status, serviceId);
    return result.changes > 0;
  },
  adminUpdateServiceContent: ({ serviceId, fields }) => {
    const allowed = ['title','description','category','price_per_hour','duration_minutes','experience_level','format','availability','location','tags','image_url'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length === 0) return false;
    params.push(serviceId);
    const sql = `UPDATE services SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    const result = db.prepare(sql).run(...params);
    return result.changes > 0;
  },
  listAllServicesAdmin: ({ status, limit = 100, offset = 0, q }) => {
    let sql = `
      SELECT s.*, u.full_name, u.email
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND s.status = ?`; params.push(status); }
    if (q) {
      sql += ` AND (LOWER(s.title) LIKE ? OR LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)`;
      const sLike = `%${q.toLowerCase()}%`;
      params.push(sLike, sLike, sLike);
    }
    sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
  },

  // Service review moderation
  hideServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_hidden = 1 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'hide_service_review',
      JSON.stringify({ reviewId })
    );
  },
  deleteServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_deleted = 1 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'delete_service_review',
      JSON.stringify({ reviewId })
    );
  },
  restoreServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_hidden = 0, is_deleted = 0 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'restore_service_review',
      JSON.stringify({ reviewId })
    );
  },
  // Payment customer helpers
  getPaymentCustomer: ({ userId, provider }) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ? AND payment_provider = ?`);
    return stmt.get(userId, provider);
  },
  createPaymentCustomer: ({ userId, provider, providerCustomerId }) => {
    const stmt = db.prepare(`
      INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, payment_provider) DO UPDATE SET 
        provider_customer_id = excluded.provider_customer_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(userId, provider, providerCustomerId);
  },
  getAllPaymentCustomers: (userId) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ?`);
    return stmt.all(userId);
  },

  // User blocks
  blockUser: ({ blockerId, blockedId, reason }) => {
    // Check if blocker's block functionality is locked
    const modRow = db.prepare(`SELECT block_functionality_locked FROM user_moderation WHERE user_id = ?`).get(blockerId);
    if (modRow && modRow.block_functionality_locked === 1) {
      throw new Error('Block functionality is locked for this user');
    }
    const stmt = db.prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)`);
    const result = stmt.run(blockerId, blockedId, reason || null);
    // Log the action
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      blockerId,
      'block_user',
      JSON.stringify({ blockedId, reason })
    );
    return result.changes > 0;
  },
  unblockUser: ({ blockerId, blockedId }) => {
    const stmt = db.prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`);
    const result = stmt.run(blockerId, blockedId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      blockerId,
      'unblock_user',
      JSON.stringify({ blockedId })
    );
    return result.changes > 0;
  },
  isUserBlocked: ({ userId, targetId }) => {
    const row = db.prepare(`SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`).get(userId, targetId);
    return !!row;
  },
  getBlockedUsers: (userId) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, ub.created_at, ub.reason
      FROM user_blocks ub
      JOIN users u ON u.id = ub.blocked_id
      WHERE ub.blocker_id = ?
      ORDER BY ub.created_at DESC
    `).all(userId);
  },

  // User reports
  reportUser: ({ reporterId, reportedId, reason, description }) => {
    const stmt = db.prepare(`INSERT INTO user_reports (reporter_id, reported_id, reason, description) VALUES (?,?,?,?)`);
    const result = stmt.run(reporterId, reportedId, reason, description || null);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      reporterId,
      'report_user',
      JSON.stringify({ reportedId, reason })
    );
    return result.lastInsertRowid;
  },
  getUserReports: ({ limit = 50, offset = 0, status }) => {
    let sql = `
      SELECT r.*, 
             u1.handle as reporter_username, u1.full_name as reporter_name,
             u2.handle as reported_username, u2.full_name as reported_name,
             u3.full_name as reviewer_name
      FROM user_reports r
      JOIN users u1 ON u1.id = r.reporter_id
      JOIN users u2 ON u2.id = r.reported_id
      LEFT JOIN users u3 ON u3.id = r.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    sql += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
  },
  updateReportStatus: ({ reportId, status, reviewerId, adminNotes }) => {
    const stmt = db.prepare(`
      UPDATE user_reports 
      SET status = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(status, reviewerId, adminNotes || null, reportId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      reviewerId,
      'review_report',
      JSON.stringify({ reportId, status })
    );
    return result.changes > 0;
  },

  // User moderation (block functionality lock)
  lockUserBlockFunctionality: ({ userId, reason, lockedBy }) => {
    db.prepare(`
      INSERT OR REPLACE INTO user_moderation (user_id, block_functionality_locked, lock_reason, locked_by, locked_at)
      VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, reason || null, lockedBy);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      lockedBy,
      'lock_block_functionality',
      JSON.stringify({ targetUserId: userId, reason })
    );
  },
  unlockUserBlockFunctionality: ({ userId, unlockedBy }) => {
    db.prepare(`DELETE FROM user_moderation WHERE user_id = ?`).run(userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      unlockedBy,
      'unlock_block_functionality',
      JSON.stringify({ targetUserId: userId })
    );
  },
  getUserModerationStatus: (userId) => {
    return db.prepare(`SELECT * FROM user_moderation WHERE user_id = ?`).get(userId);
  },
  getAllBlocksAndReports: ({ limit = 100, offset = 0 }) => {
    const blocks = db.prepare(`
      SELECT ub.id, ub.blocker_id, ub.blocked_id, ub.reason, ub.created_at,
             u1.handle as blocker_username, u1.full_name as blocker_name,
             u2.handle as blocked_username, u2.full_name as blocked_name,
             mod.block_functionality_locked as blocker_locked
      FROM user_blocks ub
      JOIN users u1 ON u1.id = ub.blocker_id
      JOIN users u2 ON u2.id = ub.blocked_id
      LEFT JOIN user_moderation mod ON mod.user_id = ub.blocker_id
      ORDER BY ub.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    return blocks;
  }
};

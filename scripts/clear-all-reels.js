#!/usr/bin/env node
/**
 * One-time script to delete all existing reels from all users
 * Usage: node scripts/clear-all-reels.js [--dry-run]
 */

const { db } = require('../db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function run() {
  const reels = db.prepare('SELECT id, user_id, created_at FROM posts WHERE is_reel = 1').all();
  
  console.log(`Found ${reels.length} reel(s) to delete.`);
  
  if (dryRun) {
    console.log('Dry-run mode - no changes will be made.');
    reels.slice(0, 20).forEach(r => {
      console.log(`  - Reel #${r.id} by user ${r.user_id} (created: ${r.created_at})`);
    });
    if (reels.length > 20) {
      console.log(`  ... and ${reels.length - 20} more`);
    }
    return;
  }
  
  // Delete reels and their associated data (reactions, comments)
  const tx = db.transaction(() => {
    const deleteComments = db.prepare('DELETE FROM post_comments WHERE post_id = ?');
    const deleteReactions = db.prepare('DELETE FROM post_reactions WHERE post_id = ?');
    const deletePost = db.prepare('DELETE FROM posts WHERE id = ?');
    
    for (const reel of reels) {
      deleteComments.run(reel.id);
      deleteReactions.run(reel.id);
      deletePost.run(reel.id);
    }
  });
  
  tx();
  console.log(`✅ Deleted ${reels.length} reel(s) and associated data.`);
}

run();

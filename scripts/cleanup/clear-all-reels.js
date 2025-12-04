#!/usr/bin/env node
/**
 * One-time script to delete all existing reels from all users
 * Usage: node scripts/cleanup/clear-all-reels.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without making changes
 */

const path = require('path');
const { db } = require(path.join(__dirname, '..', '..', 'db'));
const logger = require(path.join(__dirname, '..', '..', 'services', 'logger'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function run() {
  try {
    const reels = db.prepare('SELECT id, user_id, created_at FROM posts WHERE is_reel = 1').all();
    
    console.log(`\nℹ️  Found ${reels.length} reel(s) to delete.`);
    
    if (dryRun) {
      console.log('🔄 Dry-run mode - no changes will be made.\n');
      reels.slice(0, 20).forEach(r => {
        console.log(`  - Reel #${r.id} by user ${r.user_id} (created: ${r.created_at})`);
      });
      if (reels.length > 20) {
        console.log(`  ... and ${reels.length - 20} more`);
      }
      console.log();
      return;
    }
    
    // Delete reels and their associated data (reactions, comments)
    const deleteComments = db.prepare('DELETE FROM post_comments WHERE post_id = ?');
    const deleteReactions = db.prepare('DELETE FROM post_reactions WHERE post_id = ?');
    const deletePost = db.prepare('DELETE FROM posts WHERE id = ?');
    
    const tx = db.transaction(() => {
      for (const reel of reels) {
        deleteComments.run(reel.id);
        deleteReactions.run(reel.id);
        deletePost.run(reel.id);
      }
    });
    
    tx();
    
    logger.info(`Deleted ${reels.length} reel(s) and associated data`);
    console.log(`\n✅ Deleted ${reels.length} reel(s) and associated data.\n`);
  } catch (err) {
    logger.error('Failed to clear reels', { error: err.message });
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

run();

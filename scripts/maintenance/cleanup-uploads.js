#!/usr/bin/env node
/**
 * Maintenance script to clean up orphaned upload files
 * Removes uploads that aren't referenced in the database
 * Usage: node scripts/maintenance/cleanup-uploads.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without making changes
 */

const fs = require('fs');
const path = require('path');
const { db } = require(path.join(__dirname, '..', '..', 'db'));
const logger = require(path.join(__dirname, '..', '..', 'services', 'logger'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');

async function run() {
  try {
    console.log('\n🧹 Starting upload cleanup...\n');
    
    // Get all files in uploads directory
    const allFiles = getAllFiles(uploadsDir);
    console.log(`Found ${allFiles.length} files in uploads directory`);
    
    // Get all referenced files from database
    const referencedFiles = new Set();
    const tables = [
      { table: 'users', column: 'profile_picture' },
      { table: 'users', column: 'banner_image' },
      { table: 'posts', column: 'media_url' },
      { table: 'services', column: 'image_url' }
    ];
    
    for (const { table, column } of tables) {
      try {
        const rows = db.prepare(`SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL`).all();
        rows.forEach(row => {
          if (row[column]) {
            referencedFiles.add(row[column]);
          }
        });
      } catch (err) {
        console.warn(`  ⚠️  Could not read ${table}.${column}: ${err.message}`);
      }
    }
    
    console.log(`Found ${referencedFiles.size} referenced files in database\n`);
    
    // Find orphaned files
    const orphaned = allFiles.filter(file => {
      const relative = path.relative(uploadsDir, file);
      return !Array.from(referencedFiles).some(ref => ref.includes(relative));
    });
    
    console.log(`Found ${orphaned.length} orphaned file(s):`);
    orphaned.forEach(file => {
      const relative = path.relative(uploadsDir, file);
      const stat = fs.statSync(file);
      const size = (stat.size / 1024).toFixed(2);
      console.log(`  - ${relative} (${size}KB)`);
    });
    
    if (dryRun) {
      console.log('\n🔄 Dry-run mode - no files deleted.\n');
      return;
    }
    
    // Delete orphaned files
    let totalSize = 0;
    for (const file of orphaned) {
      try {
        const stat = fs.statSync(file);
        totalSize += stat.size;
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`  ❌ Failed to delete ${file}: ${err.message}`);
      }
    }
    
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    logger.info(`Cleanup completed: deleted ${orphaned.length} files (${totalSizeMB}MB)`);
    console.log(`\n✅ Cleanup completed: deleted ${orphaned.length} files (${totalSizeMB}MB)\n`);
  } catch (err) {
    logger.error('Upload cleanup failed', { error: err.message });
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

function getAllFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    if (item === '.gitkeep') continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}

run();

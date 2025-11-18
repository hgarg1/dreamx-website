#!/usr/bin/env node
/**
 * One-time migration to normalize chat attachment paths to /uploads/chat/<filename>
 * Usage:
 *   node scripts/migrate-chat-attachments.js           (perform migration)
 *   node scripts/migrate-chat-attachments.js --dry-run (show changes only)
 *   node scripts/migrate-chat-attachments.js --report  (summary without modifying)
 */

const path = require('path');
const { db } = require('../db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reportOnly = args.includes('--report');

function normalize(u) {
  if (!u) return u;
  let v = String(u);
  // Strip leading public/ variants
  if (v.startsWith('public/')) v = v.replace(/^public\//, '/');
  if (v.startsWith('/public/')) v = v.replace(/^\/public\//, '/');
  if (!v.startsWith('/')) v = '/' + v;
  if (v.startsWith('/public/uploads/')) v = v.replace(/^\/public\/uploads\//, '/uploads/');
  // Already good?
  if (v.startsWith('/uploads/chat/')) return v;
  // Remove duplicate segments
  v = v.replace(/\/+uploads\/+chat\/+/, '/uploads/chat/');
  const fname = v.split('/').filter(Boolean).pop();
  if (!fname) return '/uploads/chat/unknown';
  return '/uploads/chat/' + fname;
}

function run() {
  const rows = db.prepare('SELECT id, attachment_url FROM messages WHERE attachment_url IS NOT NULL').all();
  let changed = 0;
  const updates = [];
  for (const r of rows) {
    const normalized = normalize(r.attachment_url);
    if (normalized !== r.attachment_url) {
      changed++;
      updates.push({ id: r.id, from: r.attachment_url, to: normalized });
    }
  }

  if (dryRun || reportOnly) {
    console.log(`Found ${updates.length} attachment(s) needing normalization.`);
    updates.slice(0, 50).forEach(u => console.log(`#${u.id}: ${u.from} -> ${u.to}`));
    if (updates.length > 50) console.log(`... ${updates.length - 50} more not shown.`);
    if (dryRun) console.log('Dry-run complete. No changes written.');
    return;
  }

  const stmt = db.prepare('UPDATE messages SET attachment_url = ? WHERE id = ?');
  const tx = db.transaction(changes => {
    for (const c of changes) stmt.run(c.to, c.id);
  });
  tx(updates);
  console.log(`Normalized ${updates.length} attachment path(s).`);
  console.log('Migration complete.');
}

run();

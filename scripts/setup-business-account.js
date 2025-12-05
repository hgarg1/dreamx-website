#!/usr/bin/env node

/**
 * Setup script for business account
 * Marks the business@dreamx.local account as:
 * - Email verified
 * - Onboarding completed
 * - No longer needing onboarding
 */

const { db, getUserByEmail } = require('../db');

try {
  const user = getUserByEmail('business@dreamx.local');
  
  if (!user) {
    console.error('❌ Business account not found');
    process.exit(1);
  }

  console.log(`📧 Updating account: ${user.email}`);
  
  // Mark email as verified and onboarding as completed
  db.prepare(`
    UPDATE users 
    SET 
      email_verified = 1,
      onboarding_completed = 1,
      needs_onboarding = 0
    WHERE email = ?
  `).run('business@dreamx.local');

  const updated = getUserByEmail('business@dreamx.local');
  
  console.log('✅ Account setup complete!');
  console.log(`   Email verified: ${updated.email_verified ? '✓' : '✗'}`);
  console.log(`   Onboarding completed: ${updated.onboarding_completed ? '✓' : '✗'}`);
  console.log(`   Needs onboarding: ${updated.needs_onboarding ? '✗' : '✓'}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

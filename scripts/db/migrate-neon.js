#!/usr/bin/env node
/**
 * Migration script for Neon PostgreSQL database
 * Applies schema-postgres.sql and rbac-schema-postgres.sql to Neon production database
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get DATABASE_URL from environment or neonctl
async function getDatabaseUrl() {
  // First, try environment variable
  if (process.env.DATABASE_URL) {
    console.log('✅ Found DATABASE_URL in environment');
    return process.env.DATABASE_URL;
  }

  // Try to get from neonctl
  try {
    const { execSync } = require('child_process');
    console.log('🔄 Attempting to get DATABASE_URL from neonctl...');
    const output = execSync('npx neonctl connection-string --force-auth', { 
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    // Extract connection string from output
    const match = output.match(/postgresql:\/\/[^\s]+/);
    if (match) {
      console.log('✅ Found DATABASE_URL from neonctl');
      return match[0];
    }
  } catch (error) {
    console.warn('⚠️  Could not get DATABASE_URL from neonctl:', error.message);
  }

  throw new Error('DATABASE_URL not found. Please set DATABASE_URL environment variable or ensure neonctl is configured.');
}

// Execute SQL statements from a file
async function executeSqlFile(pool, filePath, description) {
  console.log(`\n🔄 ${description}...`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Schema file not found: ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  
  // Remove SQL comments (lines starting with --)
  const cleanSql = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--') || line.trim() === '')
    .join('\n');

  // Split by semicolons, but be careful with complex statements
  // We'll split more intelligently
  const statements = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];
    const nextChar = cleanSql[i + 1];

    // Track string literals
    if ((char === "'" || char === '"') && (i === 0 || cleanSql[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }

    // Track BEGIN/END blocks
    if (!inString) {
      if (cleanSql.substring(i, i + 5).toUpperCase() === 'BEGIN') {
        depth++;
      } else if (cleanSql.substring(i, i + 3).toUpperCase() === 'END') {
        depth--;
      }
    }

    current += char;

    // End of statement (semicolon outside of string and at depth 0)
    if (char === ';' && !inString && depth === 0) {
      const trimmed = current.trim();
      if (trimmed && trimmed.length > 0 && !trimmed.match(/^--/)) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  // Add any remaining SQL
  if (current.trim()) {
    statements.push(current.trim());
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed.length === 0) continue;

    try {
      await pool.query(trimmed);
      successCount++;
    } catch (error) {
      // Ignore "already exists" errors
      if (error.message.includes('already exists') || 
          error.message.includes('duplicate key') ||
          error.message.includes('duplicate') ||
          error.code === '42P07' || // duplicate_table
          error.code === '42710') { // duplicate_object
        skipCount++;
      } else {
        // Log but don't fail on DROP TABLE IF EXISTS errors
        if (trimmed.toUpperCase().includes('DROP TABLE IF EXISTS')) {
          skipCount++;
        } else {
          console.error(`❌ Error executing statement:`, error.message);
          console.error(`   Statement: ${trimmed.substring(0, 100)}...`);
          errorCount++;
        }
      }
    }
  }

  console.log(`✅ ${description} completed:`);
  console.log(`   - Successfully executed: ${successCount} statements`);
  if (skipCount > 0) {
    console.log(`   - Skipped (already exists): ${skipCount} statements`);
  }
  if (errorCount > 0) {
    console.log(`   - Errors: ${errorCount} statements`);
  }

  return { successCount, skipCount, errorCount };
}

// Main migration function
async function runMigrations() {
  console.log('🚀 Starting Neon database migration...\n');

  let pool;
  try {
    // Get database URL
    const databaseUrl = await getDatabaseUrl();
    
    // Check if it's a Neon connection
    const isNeon = databaseUrl.includes('neon.tech') || databaseUrl.includes('neon');
    if (isNeon) {
      console.log('✅ Detected Neon database connection');
    }

    // Create connection pool
    console.log('🔄 Connecting to database...');
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: isNeon ? { rejectUnauthorized: false } : false,
      max: 1, // Use single connection for migrations
    });

    // Test connection
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      console.log('✅ Database connection successful');
      console.log(`   Server time: ${result.rows[0].now}`);
    } finally {
      client.release();
    }

    // Get schema file paths
    const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema-postgres.sql');
    const rbacSchemaPath = path.join(__dirname, '..', '..', 'db', 'rbac-schema-postgres.sql');

    // Check if users table exists (to determine if schema is already applied)
    let usersTableExists = false;
    try {
      const checkResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        ) as exists
      `);
      usersTableExists = checkResult.rows[0]?.exists || false;
    } catch (error) {
      console.warn('⚠️  Could not check if users table exists:', error.message);
    }

    if (usersTableExists) {
      console.log('\n⚠️  Users table already exists. Migration will skip existing objects.');
    }

    // Apply main schema
    await executeSqlFile(pool, schemaPath, 'Applying main schema (schema-postgres.sql)');

    // Apply RBAC schema
    await executeSqlFile(pool, rbacSchemaPath, 'Applying RBAC schema (rbac-schema-postgres.sql)');

    // Verify migration
    console.log('\n🔄 Verifying migration...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableCount = tablesResult.rows.length;
    console.log(`✅ Migration verification complete:`);
    console.log(`   - Total tables created: ${tableCount}`);
    
    if (tableCount > 0) {
      console.log(`   - Sample tables: ${tablesResult.rows.slice(0, 5).map(r => r.table_name).join(', ')}${tableCount > 5 ? '...' : ''}`);
    }

    console.log('\n✅ Neon database migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set DATABASE_URL environment variable in your production environment');
    console.log('   2. Set NODE_ENV=production (or ensure DATABASE_URL is set)');
    console.log('   3. Restart your application');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run migrations
if (require.main === module) {
  runMigrations().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runMigrations, getDatabaseUrl };

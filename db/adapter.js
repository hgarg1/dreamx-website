// Database Adapter - Abstracts SQLite and PostgreSQL
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Check for production mode - handle both 'production' and 'Production' (case-insensitive)
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const isProduction = (nodeEnv === 'production' || process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql');

// Log database mode detection for debugging (only in non-test environments)
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  const detectedMode = isProduction ? 'PostgreSQL' : 'SQLite';
  console.log(`🔍 Database mode: ${detectedMode} (NODE_ENV=${process.env.NODE_ENV || 'undefined'}, DB_TYPE=${process.env.DB_TYPE || 'undefined'}, isProduction=${isProduction})`);
}

let db = null;
let dbType = 'sqlite';
let pgPool = null;

// Ensure data directory exists
function ensureDataDirectory() {
  const dataDir = path.join(__dirname, '..', 'data');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✅ Created data directory: ${dataDir}`);
    } else {
      console.log(`✅ Data directory exists: ${dataDir}`);
    }
    
    // Verify write permissions
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log(`✅ Data directory is writable`);
  } catch (error) {
    console.error(`❌ Data directory issue:`, error.message);
    throw new Error(`Cannot access/create data directory: ${error.message}`);
  }
}

// Initialize database connection
async function initDatabase() {
  if (isProduction) {
    // PostgreSQL
    const { Pool } = require('pg');
    dbType = 'postgres';
    
    // Support Azure PostgreSQL connection string format
    let config;
    if (process.env.DATABASE_URL) {
      // Parse connection string (Azure often provides this)
      config = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PG_SSL !== 'false' ? { rejectUnauthorized: false } : false
      };
      console.log('📊 Using DATABASE_URL connection string');
    } else {
      // Use individual environment variables
      config = {
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
        database: process.env.PG_DATABASE || process.env.DB_NAME || 'dreamx',
        user: process.env.PG_USER || process.env.DB_USER || 'dreax_app',
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
        // Azure PostgreSQL requires SSL - default to requiring it unless explicitly disabled
        ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
        max: parseInt(process.env.PG_POOL_MAX || '10'),
        min: parseInt(process.env.PG_POOL_MIN || '0'),
        idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '30000')
      };
      console.log('📊 Using individual PostgreSQL connection parameters');
      console.log(`📊 Connecting to: ${config.host}:${config.port}/${config.database} as ${config.user}`);
    }

    try {
      console.log('🔄 Initializing PostgreSQL connection pool...');
      pgPool = new Pool(config);
      
      // Test connection with timeout
      const client = await Promise.race([
        pgPool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
        )
      ]);
      
      // Test query
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ PostgreSQL connection successful!');
      db = pgPool;
      
      // Set up error handlers
      pgPool.on('error', (err) => {
        console.error('❌ Unexpected PostgreSQL pool error:', err);
      });
      
      return db;
    } catch (err) {
      console.error('❌ PostgreSQL connection failed!');
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        host: config.host || 'from connection string',
        port: config.port || 'from connection string',
        database: config.database || 'from connection string',
        user: config.user || 'from connection string'
      });
      console.error('Full error:', err);
      throw new Error(`PostgreSQL connection failed: ${err.message}. Check your connection settings and ensure the database is accessible.`);
    }
  } else {
    // SQLite (local)
    ensureDataDirectory();
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'dreamx.db');
    db = new Database(dbPath);
    return db;
  }
}

// Initialize database synchronously (for SQLite) or return promise (for PostgreSQL)
function initDatabaseSync() {
  if (isProduction) {
    // Return a promise for PostgreSQL
    return initDatabase();
  } else {
    // SQLite can be initialized synchronously
    try {
      ensureDataDirectory();
      const Database = require('better-sqlite3');
      const dbPath = path.join(__dirname, '..', 'data', 'dreamx.db');
      const dataDir = path.dirname(dbPath);
      
      // Create database with proper options
      db = new Database(dbPath, { 
        fileMustExist: false,
        timeout: 5000,
        verbose: null
      });
      
      dbType = 'sqlite';
      return db;
    } catch (error) {
      console.error('❌ Failed to initialize SQLite database:', error.message);
      console.error('Error code:', error.code);
      console.error('Error errno:', error.errno);
      console.error('Full error:', error);
      throw error;
    }
  }
}

// Database wrapper class to abstract differences
class DatabaseWrapper {
  constructor(dbInstance, type) {
    this.db = dbInstance;
    this.type = type;
  }

  // Execute a query (for schema initialization)
  async exec(sql) {
    if (this.type === 'sqlite') {
      this.db.exec(sql);
    } else {
      // PostgreSQL - split by semicolons and execute each statement
      // Also convert boolean comparisons and remove SQL Server-specific syntax
      const sqlCompat = require('./sql-compat');
      let processedSql = sql;
      
      // Remove SQL Server-specific statements
      processedSql = processedSql
        .replace(/SET\s+ANSI_NULLS\s+ON/gi, '')
        .replace(/SET\s+QUOTED_IDENTIFIER\s+ON/gi, '')
        .replace(/GO\s*/gi, ';');
      
      // Convert SQL Server conditional logic (IF NOT EXISTS blocks, etc.)
      processedSql = sqlCompat.convertConditionalLogic(processedSql);
      
      // Convert boolean comparisons
      processedSql = sqlCompat.convertBooleanComparisons(processedSql);
      
      const statements = processedSql.split(';').filter(s => s.trim().length > 0);
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (!trimmed || trimmed.length === 0) continue;
        
        try {
          await this.db.query(trimmed);
        } catch (err) {
          // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS
          if (!err.message.includes('already exists') && 
              !err.message.includes('duplicate key') &&
              !err.message.includes('already exists')) {
            console.warn('SQL execution warning:', err.message);
            console.warn('SQL statement:', trimmed.substring(0, 200));
          }
        }
      }
    }
  }

  // Split SQL statements while respecting BEGIN/END blocks and MERGE statements
  splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let depth = 0; // Track BEGIN/END nesting
    let inMerge = false; // Track if we're inside a MERGE statement
    
    // Normalize line endings and split into tokens
    const normalized = sql.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim().toUpperCase();
      
      // Check for GO batch separator (SQL Server)
      if (trimmedLine === 'GO') {
        if (current.trim()) {
          statements.push(current.trim());
          current = '';
        }
        depth = 0;
        inMerge = false;
        continue;
      }
      
      // Track BEGIN/END blocks
      if (trimmedLine.includes('BEGIN') && !trimmedLine.includes('BEGIN TRANSACTION')) {
        depth++;
      }
      if (trimmedLine.includes('END') && !trimmedLine.includes('END TRANSACTION')) {
        depth = Math.max(0, depth - 1);
      }
      
      // Track MERGE statements (they end with a semicolon after the last WHEN clause)
      if (trimmedLine.startsWith('MERGE ') || trimmedLine.startsWith('MERGE\t')) {
        inMerge = true;
      }
      
      current += line + '\n';
      
      // Check if this line ends a statement (semicolon at the end, outside BEGIN/END)
      if (line.trim().endsWith(';') && depth === 0) {
        // For MERGE statements, the semicolon ends the statement
        if (inMerge || !this.isInsideBlock(current)) {
          if (current.trim()) {
            statements.push(current.trim());
            current = '';
          }
          inMerge = false;
        }
      }
    }
    
    // Add any remaining SQL
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements.filter(s => s.length > 0);
  }

  // Helper to check if we're inside a BEGIN/END block
  isInsideBlock(sql) {
    const upper = sql.toUpperCase();
    const beginCount = (upper.match(/\bBEGIN\b/g) || []).length;
    const endCount = (upper.match(/\bEND\b/g) || []).length;
    // Also count END; as END
    const endSemiCount = (upper.match(/\bEND\s*;/g) || []).length;
    return beginCount > endCount;
  }

  // Prepare a statement (returns a prepared statement wrapper)
  prepare(sql) {
    if (this.type === 'sqlite') {
      return new SQLitePreparedStatement(this.db.prepare(sql));
    } else {
      return new PostgresPreparedStatement(this.db, sql);
    }
  }

  // Get raw database instance
  getRaw() {
    return this.db;
  }
}

// SQLite prepared statement wrapper
class SQLitePreparedStatement {
  constructor(stmt) {
    this.stmt = stmt;
  }

  get(...params) {
    return this.stmt.get(...params);
  }

  all(...params) {
    return this.stmt.all(...params);
  }

  run(...params) {
    const result = this.stmt.run(...params);
    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes
    };
  }
}

// PostgreSQL prepared statement wrapper
class PostgresPreparedStatement {
  constructor(db, sql) {
    this.db = db;
    // Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2, etc.)
    // and convert boolean comparisons (0/1 to false/true)
    const sqlCompat = require('./sql-compat');
    this.sql = sqlCompat.convertBooleanComparisons(this.convertParameters(sql));
    this.paramCount = (sql.match(/\?/g) || []).length;
  }

  convertParameters(sql) {
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  convertBooleanParams(sql, params) {
    // For PostgreSQL, convert 0/1 parameter values to false/true when they're used with boolean columns
    const booleanColumns = [
      'verified', 'email_verified', 'phone_verified', 'read', 'is_hidden', 
      'is_deleted', 'is_reel', 'is_group', 'is_frozen', 'is_active', 
      'is_enabled', 'is_system_role', 'resolved', 'auto_renew', 'is_default', 
      'onboarding_completed', 'discoverable_by_email', 'used', 'revoked', 
      'is_pinned', 'is_public', 'email_notifications', 'push_notifications', 
      'message_notifications', 'show_online_status', 'read_receipts', 
      'chat_privileges_frozen', 'seller_privileges_frozen', 'first_goal_public', 
      'notify_followers', 'block_functionality_locked', 'recording_enabled', 
      'is_visible', 'is_archived', 'is_completed', 'is_cancelled', 
      'is_published', 'needs_onboarding'
    ];
    
    const convertedParams = [...params];
    
    // Extract column names from INSERT statements
    const insertMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    let insertColumns = [];
    if (insertMatch) {
      insertColumns = insertMatch[1].split(',').map(col => col.trim().toLowerCase());
    }
    
    // Extract column names from UPDATE statements
    const updateMatch = sql.match(/UPDATE\s+\w+\s+SET\s+([^WHERE]+)/i);
    let updateColumns = [];
    if (updateMatch) {
      updateMatch[1].split(',').forEach(assignment => {
        const colMatch = assignment.match(/(\w+)\s*=/);
        if (colMatch) {
          updateColumns.push(colMatch[1].trim().toLowerCase());
        }
      });
    }
    
    // Check each parameter position
    for (let i = 0; i < params.length; i++) {
      const paramValue = params[i];
      // If parameter is 0 or 1 (integer), check if it's used with a boolean column
      if (paramValue === 0 || paramValue === 1) {
        const paramIndex = i + 1; // PostgreSQL uses 1-based indexing
        
        // Check INSERT statement column mapping
        if (insertColumns.length > 0 && i < insertColumns.length) {
          const columnName = insertColumns[i].toLowerCase();
          if (booleanColumns.includes(columnName)) {
            convertedParams[i] = paramValue === 1 ? true : false;
            continue;
          }
        }
        
        // Check UPDATE statement column mapping
        if (updateColumns.length > 0) {
          // For UPDATE, we need to find which parameter corresponds to which column
          // This is trickier, so we'll use pattern matching
          for (const column of booleanColumns) {
            const pattern = new RegExp(`\\b${column}\\s*=\\s*\\$${paramIndex}\\b`, 'i');
            if (pattern.test(sql)) {
              convertedParams[i] = paramValue === 1 ? true : false;
              break;
            }
          }
        }
        
        // Check WHERE clause comparisons
        for (const column of booleanColumns) {
          const patterns = [
            new RegExp(`\\b${column}\\s*=\\s*\\$${paramIndex}\\b`, 'i'),
            new RegExp(`\\b${column}\\s*!=\\s*\\$${paramIndex}\\b`, 'i'),
            new RegExp(`\\b${column}\\s*<>\\s*\\$${paramIndex}\\b`, 'i')
          ];
          
          if (patterns.some(pattern => pattern.test(sql))) {
            convertedParams[i] = paramValue === 1 ? true : false;
            break;
          }
        }
      }
    }
    
    return convertedParams;
  }

  async get(...params) {
    // Convert boolean parameter values (0/1) to false/true for PostgreSQL
    const convertedParams = this.convertBooleanParams(this.sql, params);
    const result = await this.db.query(this.sql, convertedParams);
    return result.rows[0] || null;
  }

  async all(...params) {
    // Convert boolean parameter values (0/1) to false/true for PostgreSQL
    const convertedParams = this.convertBooleanParams(this.sql, params);
    const result = await this.db.query(this.sql, convertedParams);
    return result.rows || [];
  }

  async run(...params) {
    // Convert boolean parameter values (0/1) to false/true for PostgreSQL
    const convertedParams = this.convertBooleanParams(this.sql, params);
    const result = await this.db.query(this.sql, convertedParams);
    
    // For INSERT statements, get the inserted ID
    if (this.sql.trim().toUpperCase().startsWith('INSERT')) {
      // PostgreSQL returns the inserted row with RETURNING clause
      // If no RETURNING, we need to add it or use lastval()
      if (this.sql.toUpperCase().includes('RETURNING')) {
        return {
          lastInsertRowid: result.rows[0]?.id || null,
          changes: result.rowCount || 0
        };
      } else {
        // Try to get last inserted ID using lastval()
        const idResult = await this.db.query('SELECT lastval() AS id');
        return {
          lastInsertRowid: idResult.rows[0]?.id || null,
          changes: result.rowCount || 0
        };
      }
    } else {
      return {
        lastInsertRowid: null,
        changes: result.rowCount || 0
      };
    }
  }
}

// Initialize and export
let dbWrapper = null;

async function getDatabase() {
  if (!dbWrapper) {
    const dbInstance = await initDatabase();
    dbWrapper = new DatabaseWrapper(dbInstance, dbType);
  }
  return dbWrapper;
}

// For synchronous SQLite operations, we need a sync version
function getDatabaseSync() {
  if (isProduction) {
    // For PostgreSQL, we need to ensure connection is ready
    // This will throw if called before async init, but that's expected
    if (!dbWrapper) {
      console.warn('⚠️ getDatabaseSync() called in production before async initialization. PostgreSQL requires async init.');
      throw new Error('PostgreSQL requires async initialization. Call initDatabase() first or use getDatabase().');
    }
    return dbWrapper;
  }
  
  // SQLite initialization - only in development
  if (!dbWrapper) {
    ensureDataDirectory();
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'dreamx.db');
    const dbInstance = new Database(dbPath);
    dbType = 'sqlite';
    dbWrapper = new DatabaseWrapper(dbInstance, 'sqlite');
  }
  return dbWrapper;
}

// Initialize SQLite synchronously (for module-level initialization)
function initSync() {
  // Only initialize SQLite if we're NOT in production
  if (isProduction) {
    console.log('📊 Production mode detected - skipping SQLite initialization. PostgreSQL will be initialized asynchronously.');
    return null;
  }
  
  try {
    const dbInstance = initDatabaseSync();
    if (!dbWrapper) {
      dbWrapper = new DatabaseWrapper(dbInstance, 'sqlite');
      console.log('✅ Database wrapper initialized (SQLite)');
    }
    return dbWrapper;
  } catch (error) {
    console.error('❌ Critical error during database initialization:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = {
  getDatabase,
  getDatabaseSync,
  initSync,
  initDatabase,
  isProduction,
  get dbType() { return dbType; },
  get db() { return db; },
  get pgPool() { return pgPool; }
};

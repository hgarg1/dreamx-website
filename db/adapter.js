// Database Adapter - Abstracts SQLite and SQL Server
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'Production' || process.env.DB_TYPE === 'sqlserver';
let db = null;
let dbType = 'sqlite';
let sqlPool = null;

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
    // Azure SQL Server
    const sql = require('mssql');
    dbType = 'sqlserver';
    
    const config = {
      server: process.env.SQL_DB_URL || 'dream-x.database.windows.net',
      database: process.env.SQL_DB_NAME || 'Dream X',
      user: process.env.SQL_DB_UNAME || 'DreamX',
      password: process.env.SQL_DB_PWORD || '',
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectionTimeout: 30000,
        requestTimeout: 30000
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    try {
      sqlPool = await sql.connect(config);
      db = sql;
      console.log('✅ Connected to Azure SQL Server');
      return db;
    } catch (err) {
      console.error('❌ SQL Server connection error:', err);
      throw err;
    }
  } else {
    // SQLite (local)
    ensureDataDirectory();
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'dreamx.db');
    db = new Database(dbPath);
    console.log('✅ Connected to SQLite database');
    return db;
  }
}

// Initialize database synchronously (for SQLite) or return promise (for SQL Server)
function initDatabaseSync() {
  if (isProduction) {
    // Return a promise for SQL Server
    return initDatabase();
  } else {
    // SQLite can be initialized synchronously
    try {
      ensureDataDirectory();
      const Database = require('better-sqlite3');
      const dbPath = path.join(__dirname, '..', 'data', 'dreamx.db');
      const dataDir = path.dirname(dbPath);
      
      console.log(`📁 Database path: ${dbPath}`);
      console.log(`📁 Data directory: ${dataDir}`);
      console.log(`📁 Directory exists: ${fs.existsSync(dataDir)}`);
      console.log(`📁 Directory is writable:`, (() => {
        try {
          fs.accessSync(dataDir, fs.constants.W_OK);
          return true;
        } catch {
          return false;
        }
      })());
      
      // Create database with proper options
      db = new Database(dbPath, { 
        fileMustExist: false,
        timeout: 5000,
        verbose: null
      });
      
      dbType = 'sqlite';
      console.log('✅ Connected to SQLite database at:', dbPath);
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
      // SQL Server - split by semicolons and execute each statement
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      for (const statement of statements) {
        try {
          await this.db.request().query(statement);
        } catch (err) {
          // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS
          if (!err.message.includes('already exists') && !err.message.includes('There is already an object')) {
            console.warn('SQL execution warning:', err.message);
          }
        }
      }
    }
  }

  // Prepare a statement (returns a prepared statement wrapper)
  prepare(sql) {
    if (this.type === 'sqlite') {
      return new SQLitePreparedStatement(this.db.prepare(sql));
    } else {
      return new SQLServerPreparedStatement(this.db, sql);
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

// SQL Server prepared statement wrapper
class SQLServerPreparedStatement {
  constructor(db, sql) {
    this.db = db;
    // Convert SQLite parameter placeholders (?) to SQL Server (@p0, @p1, etc.)
    this.sql = this.convertParameters(sql);
    this.paramCount = (sql.match(/\?/g) || []).length;
  }

  convertParameters(sql) {
    let paramIndex = 0;
    return sql.replace(/\?/g, () => `@p${paramIndex++}`);
  }

  async get(...params) {
    const request = this.db.request();
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
    const result = await request.query(this.sql);
    return result.recordset[0] || null;
  }

  async all(...params) {
    const request = this.db.request();
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
    const result = await request.query(this.sql);
    return result.recordset || [];
  }

  async run(...params) {
    const request = this.db.request();
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
    
    // For INSERT statements, get the inserted ID
    if (this.sql.trim().toUpperCase().startsWith('INSERT')) {
      const insertSql = this.sql + '; SELECT SCOPE_IDENTITY() AS id;';
      const result = await request.query(insertSql);
      return {
        lastInsertRowid: result.recordset[0]?.id || null,
        changes: result.rowsAffected[0] || 0
      };
    } else {
      const result = await request.query(this.sql);
      return {
        lastInsertRowid: null,
        changes: result.rowsAffected[0] || 0
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
    // For SQL Server, we need to ensure connection is ready
    // This will throw if called before async init, but that's expected
    if (!dbWrapper) {
      throw new Error('SQL Server requires async initialization. Call initDatabase() first or use getDatabase().');
    }
    return dbWrapper;
  }
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
  if (!isProduction) {
    try {
      const dbInstance = initDatabaseSync();
      if (!dbWrapper) {
        dbWrapper = new DatabaseWrapper(dbInstance, 'sqlite');
        console.log('✅ Database wrapper initialized');
      }
      return dbWrapper;
    } catch (error) {
      console.error('❌ Critical error during database initialization:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }
  return null;
}

module.exports = {
  getDatabase,
  getDatabaseSync,
  initSync,
  initDatabase,
  isProduction,
  dbType,
  get db() { return db; },
  get sqlPool() { return sqlPool; }
};

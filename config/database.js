// Database configuration
const path = require('path');

// Check for production mode - handle both 'production' and 'Production' (case-insensitive)
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const isProduction = nodeEnv === 'production' || process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql';

module.exports = {
  isProduction,
  type: isProduction ? 'postgres' : 'sqlite',
  
  sqlite: {
    path: path.join(__dirname, '..', 'data', 'dreamx.db'),
    sessions: path.join(__dirname, '..', 'data', 'sessions.sqlite3')
  },
  
  postgres: {
    host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
    database: process.env.PG_DATABASE || process.env.DB_NAME || 'dreamx',
    user: process.env.PG_USER || process.env.DB_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
    // Azure PostgreSQL requires SSL - default to requiring it unless explicitly disabled
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
    pool: {
      max: parseInt(process.env.PG_POOL_MAX || '10'),
      min: parseInt(process.env.PG_POOL_MIN || '0'),
      idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '30000')
    }
  }
};

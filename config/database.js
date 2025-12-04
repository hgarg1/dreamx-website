// Database configuration
const path = require('path');

const isProduction = process.env.NODE_ENV === 'Production' || process.env.DB_TYPE === 'sqlserver';

module.exports = {
  isProduction,
  type: isProduction ? 'sqlserver' : 'sqlite',
  
  sqlite: {
    path: path.join(__dirname, '..', 'data', 'dreamx.db'),
    sessions: path.join(__dirname, '..', 'data', 'sessions.sqlite3')
  },
  
  sqlserver: {
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
  }
};

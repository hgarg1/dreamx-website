// Central configuration loader
require('dotenv').config();

module.exports = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 80,
    isProduction: process.env.NODE_ENV === 'Production'
  },
  database: require('./database'),
  oauth: require('./oauth'),
  payments: require('./payments'),
  email: require('./email'),
  storage: require('./storage'),
  session: {
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  }
};

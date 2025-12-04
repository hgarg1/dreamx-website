// Logger service using Winston
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let logger;
try {
  const winston = require('winston');
  
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'dream-x' },
    transports: [
      // Error logs
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      // Combined logs
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5
      })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV !== 'Production') {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            return `${timestamp} [${level}] (${service}): ${message}`;
          })
        )
      })
    );
  }
} catch (err) {
  // Fallback if winston not installed
  console.warn('Winston not installed, using console logging:', err.message);
  
  logger = {
    info: (msg, meta) => console.log('[INFO]', msg, meta || ''),
    warn: (msg, meta) => console.warn('[WARN]', msg, meta || ''),
    error: (msg, meta) => console.error('[ERROR]', msg, meta || ''),
    debug: (msg, meta) => console.log('[DEBUG]', msg, meta || ''),
    http: (msg, meta) => console.log('[HTTP]', msg, meta || '')
  };
}

module.exports = logger;

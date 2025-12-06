// Centralized error handling middleware
const logger = require('../services/logger');

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  logger.error('Application error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV !== 'Production';
  
  res.status(statusCode).render('errors/500', {
    title: 'Error - Dream X',
    currentPage: 'error',
    statusCode,
    message,
    details: isDevelopment ? err.stack : null,
    authUser: res.locals.authUser || null
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).render('errors/404', {
    title: '404 - Page Not Found - Dream X',
    currentPage: '404',
    authUser: res.locals.authUser || null
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

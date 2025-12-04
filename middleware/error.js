// Input validation and sanitization middleware
const { validationResult } = require('express-validator');

/**
 * Validation error handler middleware
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

/**
 * Sanitize common inputs
 */
function sanitizeInputs(req, res, next) {
  // Trim string values
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
}

module.exports = {
  handleValidationErrors,
  sanitizeInputs
};

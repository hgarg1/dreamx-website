// Input validation middleware using express-validator
const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
function checkValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors.array() 
        });
    }
    next();
}

/**
 * Email validation rules
 */
const validateEmail = () => {
    return body('email')
        .trim()
        .isEmail()
        .withMessage('Invalid email address')
        .normalizeEmail()
        .isLength({ max: 255 })
        .withMessage('Email too long');
};

/**
 * Password validation rules
 */
const validatePassword = (fieldName = 'password') => {
    return body(fieldName)
        .isString()
        .withMessage('Password must be a string')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be 8-128 characters')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/)
        .withMessage('Password must contain at least one special character');
};

/**
 * Username/Handle validation rules
 */
const validateHandle = () => {
    return body('handle')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Handle must be 3-30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Handle can only contain letters, numbers, underscores, and hyphens');
};

/**
 * Name validation rules
 */
const validateName = (fieldName = 'fullName') => {
    return body(fieldName)
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Name must be 1-100 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Name can only contain letters, spaces, hyphens, and apostrophes');
};

/**
 * Phone number validation rules
 */
const validatePhone = () => {
    return body('phone')
        .optional()
        .trim()
        .matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Invalid phone number format (E.164)');
};

/**
 * URL validation rules
 */
const validateUrl = (fieldName) => {
    return body(fieldName)
        .optional()
        .trim()
        .isURL({ 
            protocols: ['http', 'https'],
            require_protocol: true 
        })
        .withMessage('Invalid URL')
        .isLength({ max: 2048 })
        .withMessage('URL too long');
};

/**
 * ID parameter validation
 */
const validateId = (paramName = 'id') => {
    return param(paramName)
        .isInt({ min: 1 })
        .withMessage('Invalid ID');
};

/**
 * Pagination validation
 */
const validatePagination = () => {
    return [
        query('page')
            .optional()
            .isInt({ min: 1, max: 10000 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ];
};

/**
 * Text content validation (posts, comments, etc.)
 */
const validateTextContent = (fieldName, minLength = 1, maxLength = 10000) => {
    return body(fieldName)
        .trim()
        .isLength({ min: minLength, max: maxLength })
        .withMessage(`${fieldName} must be ${minLength}-${maxLength} characters`)
        .customSanitizer(value => {
            // Remove null bytes and control characters except newlines and tabs
            return value.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
        });
};

/**
 * Array validation
 */
const validateArray = (fieldName, maxItems = 100) => {
    return body(fieldName)
        .optional()
        .isArray({ max: maxItems })
        .withMessage(`${fieldName} must be an array with max ${maxItems} items`);
};

/**
 * Boolean validation
 */
const validateBoolean = (fieldName) => {
    return body(fieldName)
        .optional()
        .isBoolean()
        .withMessage(`${fieldName} must be a boolean`);
};

/**
 * Registration validation
 */
const validateRegistration = [
    validateName('fullName'),
    validateEmail(),
    validatePassword('password'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    validateHandle(),
    checkValidation
];

/**
 * Login validation
 */
const validateLogin = [
    validateEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    checkValidation
];

/**
 * Password reset request validation
 */
const validatePasswordResetRequest = [
    validateEmail(),
    checkValidation
];

/**
 * Password reset validation
 */
const validatePasswordReset = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required')
        .isLength({ min: 32, max: 128 })
        .withMessage('Invalid token format'),
    validatePassword('password'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    checkValidation
];

/**
 * Post creation validation
 */
const validatePost = [
    validateTextContent('content', 1, 5000),
    validateArray('hashtags', 20),
    validateArray('tags', 20),
    checkValidation
];

/**
 * Comment validation
 */
const validateComment = [
    validateTextContent('content', 1, 2000),
    checkValidation
];

/**
 * Message validation
 */
const validateMessage = [
    validateTextContent('content', 1, 5000),
    checkValidation
];

/**
 * Sanitize object to prevent prototype pollution
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    // Prevent prototype pollution
    const sanitized = {};
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (dangerousKeys.includes(key.toLowerCase())) {
                console.warn(`Blocked dangerous key: ${key}`);
                continue;
            }
            
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitized[key] = sanitizeObject(obj[key]);
            } else {
                sanitized[key] = obj[key];
            }
        }
    }
    
    return sanitized;
}

/**
 * Middleware to sanitize request body
 */
function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    next();
}

/**
 * Prevent SQL injection in raw queries
 */
function validateSqlParams(params) {
    if (!Array.isArray(params)) {
        throw new Error('SQL parameters must be an array');
    }
    
    // Ensure all params are safe types
    for (const param of params) {
        const type = typeof param;
        if (type !== 'string' && type !== 'number' && type !== 'boolean' && param !== null) {
            throw new Error(`Unsafe SQL parameter type: ${type}`);
        }
    }
    
    return params;
}

module.exports = {
    checkValidation,
    validateEmail,
    validatePassword,
    validateHandle,
    validateName,
    validatePhone,
    validateUrl,
    validateId,
    validatePagination,
    validateTextContent,
    validateArray,
    validateBoolean,
    validateRegistration,
    validateLogin,
    validatePasswordResetRequest,
    validatePasswordReset,
    validatePost,
    validateComment,
    validateMessage,
    sanitizeObject,
    sanitizeBody,
    validateSqlParams
};

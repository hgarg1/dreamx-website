// Security middleware configuration
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const crypto = require('crypto');

/**
 * Configure Helmet for HTTP security headers
 */
function configureHelmet() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'", // Required for inline scripts in EJS templates
                    "'unsafe-hashes'", // Required for inline event handlers (onclick, etc.)
                    "https://cdn.socket.io",
                    "https://api.mapbox.com",
                    "https://js.stripe.com",
                    "https://www.googletagmanager.com",
                    "https://www.google-analytics.com",
                    "https://cdnjs.cloudflare.com" // Required for Three.js on dynamic pages
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'", // Required for inline styles
                    "https://api.mapbox.com",
                    "https://fonts.googleapis.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:",
                    "http:" // For local development
                ],
                fontSrc: [
                    "'self'",
                    "data:",
                    "https://fonts.gstatic.com"
                ],
                connectSrc: [
                    "'self'",
                    "https://api.mapbox.com",
                    "https://events.mapbox.com",
                    "wss:",
                    "ws:" // For WebSocket connections
                ],
                frameSrc: [
                    "'self'",
                    "https://js.stripe.com",
                    "https://hooks.stripe.com"
                ],
                scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"], // Allow inline event handlers
                objectSrc: ["'none'"],
                mediaSrc: ["'self'", "blob:", "https:"],
                workerSrc: ["'self'", "blob:"],
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
            }
        },
        crossOriginEmbedderPolicy: false, // Allow embedding for OAuth flows
        crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources for media
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        frameguard: {
            action: 'sameorigin' // Prevent clickjacking
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },
        noSniff: true, // Prevent MIME type sniffing
        xssFilter: true, // Enable XSS filter
        hidePoweredBy: true // Hide X-Powered-By header
    });
}

/**
 * Extract IP address from request, handling Azure App Service proxy headers
 * Uses ipKeyGenerator helper for proper IPv6 support
 * 
 * Note: The validator checks that req.ip is used with ipKeyGenerator.
 * We extract the IP from X-Forwarded-For, set it on req.ip, then use ipKeyGenerator(req.ip).
 */
function getClientIp(req) {
    // Azure App Service uses X-Forwarded-For header
    const forwarded = req.headers['x-forwarded-for'];
    
    if (forwarded) {
        // X-Forwarded-For can contain multiple IPs, take the first one
        const firstIp = forwarded.split(',')[0].trim();
        let extractedIp = firstIp;
        
        // Remove port if present (e.g., "72.83.92.223:60964" -> "72.83.92.223")
        // For IPv6, the format is [::1]:port, so we need to handle brackets
        if (firstIp.startsWith('[') && firstIp.includes(']:')) {
            // IPv6 with port: [::1]:8080
            extractedIp = firstIp.split(']:')[0].substring(1);
        } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
            // IPv4 with port: 72.83.92.223:60964
            extractedIp = firstIp.split(':')[0];
        }
        
        // Set req.ip to our extracted IP so ipKeyGenerator can use it
        // This is important for the validator to detect that we're using ipKeyGenerator
        req.ip = extractedIp;
    }
    
    // Ensure req.ip is set (fallback if X-Forwarded-For not present)
    if (!req.ip) {
        req.ip = req.connection?.remoteAddress || 'unknown';
        // Remove port if present
        if (req.ip.includes(':') && !req.ip.startsWith('[')) {
            req.ip = req.ip.split(':')[0];
        }
    }
    
    // Use ipKeyGenerator helper to properly handle IPv6 normalization
    // This ensures IPv6 addresses are normalized correctly and prevents bypass
    // ipKeyGenerator masks IPv6 subnets to prevent rate limit bypass
    // Must use req.ip directly (not a local variable) for the validator to detect it
    return ipKeyGenerator(req.ip);
}

/**
 * Rate limiting for authentication endpoints
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        // Extract IP from X-Forwarded-For (Azure App Service)
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        // Use ipKeyGenerator with req.ip for proper IPv6 support
        return ipKeyGenerator(req.ip);
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many attempts. Please try again later.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

/**
 * Rate limiting for password reset endpoints
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: 'Too many password reset requests from this IP, please try again after an hour',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed requests
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        return ipKeyGenerator(req.ip);
    }
});

/**
 * Rate limiting for API endpoints
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many API requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        return ipKeyGenerator(req.ip);
    }
});

/**
 * Rate limiting for file upload endpoints
 */
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 uploads per windowMs
    message: 'Too many upload requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        return ipKeyGenerator(req.ip);
    }
});

/**
 * Strict rate limiting for registration
 */
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 registrations per hour
    message: 'Too many accounts created from this IP, please try again after an hour',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        return ipKeyGenerator(req.ip);
    }
});

/**
 * Rate limiting for sensitive operations (e.g., account deletion, admin actions)
 */
const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Very strict limit for sensitive operations
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const firstIp = forwarded.split(',')[0].trim();
            let extractedIp = firstIp;
            if (firstIp.startsWith('[') && firstIp.includes(']:')) {
                extractedIp = firstIp.split(']:')[0].substring(1);
            } else if (firstIp.includes(':') && !firstIp.startsWith('[')) {
                extractedIp = firstIp.split(':')[0];
            }
            req.ip = extractedIp;
        }
        return ipKeyGenerator(req.ip);
    },
    message: 'Too many sensitive requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * HTTP Parameter Pollution protection
 */
function configureHpp() {
    return hpp({
        whitelist: ['tags', 'hashtags', 'filters', 'sort'] // Allow these parameters to appear multiple times
    });
}

/**
 * NoSQL injection prevention (works for MongoDB-like syntax)
 */
function configureSanitizer() {
    return mongoSanitize({
        replaceWith: '_',
        onSanitize: ({ req, key }) => {
            console.warn(`Sanitized potentially malicious key: ${key} from ${req.ip}`);
        }
    });
}

/**
 * Additional security headers
 */
function additionalSecurityHeaders(req, res, next) {
    // Prevent browsers from MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable browser XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    
    // Remove server fingerprinting
    res.removeHeader('X-Powered-By');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy (formerly Feature-Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
    
    next();
}

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Basic XSS prevention - escape HTML special characters
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Middleware to sanitize request body, query, and params
 */
function sanitizeRequest(req, res, next) {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach(key => {
            // Skip password fields and other sensitive data that shouldn't be sanitized
            const skipFields = ['password', 'currentPassword', 'newPassword', 'confirmPassword', 'passwordHash'];
            if (!skipFields.includes(key) && typeof req.body[key] === 'string') {
                // Only sanitize if it looks like it might contain HTML
                if (/<[^>]*>/g.test(req.body[key])) {
                    req.body[key] = sanitizeInput(req.body[key]);
                }
            }
        });
    }
    
    next();
}

/**
 * Validate file uploads to prevent malicious files
 */
function validateFileUpload(req, res, next) {
    if (!req.file && !req.files) {
        return next();
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];
    
    for (const file of files) {
        if (!file) continue;
        
        // Check file size (already handled by multer, but double-check)
        const maxSize = 500 * 1024 * 1024; // 500MB max
        if (file.size > maxSize) {
            return res.status(400).json({ error: 'File too large' });
        }
        
        // Validate MIME type matches file extension
        const extension = file.originalname?.split('.').pop()?.toLowerCase();
        const mimeType = file.mimetype?.toLowerCase();
        
        // Prevent double extensions (e.g., file.jpg.exe)
        if (file.originalname && (file.originalname.match(/\./g) || []).length > 1) {
            const parts = file.originalname.split('.');
            // Allow multiple dots only for known safe patterns
            if (parts.length > 2 && !['tar.gz', 'tar.bz2'].includes(parts.slice(-2).join('.'))) {
                console.warn(`Suspicious filename detected: ${file.originalname} from ${req.ip}`);
            }
        }
        
        // Block executable files
        const dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'bin', 'run'];
        if (extension && dangerousExtensions.includes(extension)) {
            return res.status(400).json({ error: 'Executable files are not allowed' });
        }
        
        // Block scripts
        const scriptExtensions = ['js', 'jsx', 'ts', 'tsx', 'php', 'py', 'rb', 'pl', 'cgi'];
        if (extension && scriptExtensions.includes(extension)) {
            return res.status(400).json({ error: 'Script files are not allowed' });
        }
    }
    
    next();
}

/**
 * Log security events
 */
function logSecurityEvent(type, details, req) {
    const event = {
        timestamp: new Date().toISOString(),
        type,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
        userId: req.session?.userId,
        path: req.path,
        method: req.method,
        details
    };
    
    console.warn(`🔒 SECURITY EVENT [${type}]:`, JSON.stringify(event));
    
    // In production, you might want to send this to a security monitoring service
    // or write to a dedicated security log file
}

/**
 * Detect and block suspicious patterns in URLs
 */
function blockSuspiciousUrls(req, res, next) {
    const suspiciousPatterns = [
        /\.\.\//g,  // Directory traversal
        /%2e%2e/gi, // Encoded directory traversal
        /\0/g,      // Null bytes
        /%00/gi,    // Encoded null bytes
        /\/etc\/passwd/i,
        /\/proc\//i,
        /select.*from/i, // SQL injection attempts
        /union.*select/i,
        /insert.*into/i,
        /drop.*table/i,
        /<script/i,  // XSS attempts in URL
        /javascript:/i,
        /onerror=/i
    ];
    
    const url = req.originalUrl || req.url;
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(url)) {
            logSecurityEvent('SUSPICIOUS_URL', { url, pattern: pattern.toString() }, req);
            return res.status(400).json({ error: 'Invalid request' });
        }
    }
    
    next();
}

/**
 * Protect against timing attacks on sensitive comparisons
 */
function timingSafeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    const crypto = require('crypto');
    
    // Ensure both strings are of equal length for constant-time comparison
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    
    if (bufA.length !== bufB.length) {
        // Still do a comparison to prevent timing leak
        crypto.timingSafeEqual(
            Buffer.from(a.padEnd(32, '0')),
            Buffer.from(b.padEnd(32, '0'))
        );
        return false;
    }
    
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * CSRF Protection - Custom implementation using double submit cookie pattern
 */

/**
 * Generate CSRF token
 */
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and attach CSRF token to session and response locals
 */
function csrfProtection(req, res, next) {
    const setResponseToken = (token) => {
        // Expose token to templates and front-end fetch callers
        res.locals.csrfToken = token || '';
        try {
            res.cookie('XSRF-TOKEN', token || '', {
                httpOnly: false,
                sameSite: 'lax',
                secure: (process.env.NODE_ENV === 'production') || (process.env.BASE_URL || '').startsWith('https://'),
                path: '/',
                maxAge: 7 * 24 * 60 * 60 * 1000 // align with session lifespan
            });
        } catch (err) {
            console.warn('Failed to set CSRF cookie:', err?.message || err);
        }
    };

    // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        // Ensure session exists (Express creates it automatically when accessed)
        // Just accessing req.session creates it if it doesn't exist
        
        // Generate token for use in forms
        if (!req.session.csrfToken) {
            const token = generateCsrfToken();
            req.session.csrfToken = token;
            // Mark session as modified - express-session will automatically save it
            // and set the cookie when the response is sent
            req.session.csrfInitialized = true;
            
            // Log for debugging
            if (process.env.NODE_ENV !== 'production') {
                console.log('[CSRF] Generated token for session:', {
                    sessionId: req.sessionID?.substring(0, 8) + '...',
                    tokenPreview: token.substring(0, 8) + '...',
                    sessionKeys: Object.keys(req.session || {})
                });
            }
        }
        
        // Make token available to templates and set helper cookie for JS clients
        setResponseToken(req.session.csrfToken || '');
        
        // Verify cookie will be set (express-session does this automatically)
        // Hook into response to verify cookie is set
        if (process.env.NODE_ENV !== 'production' && !req.session.csrfTokenVerified) {
            req.session.csrfTokenVerified = true;
            const originalEnd = res.end;
            res.end = function(...args) {
                const setCookieHeader = res.getHeader('Set-Cookie');
                if (setCookieHeader) {
                    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
                    const sessionCookie = cookies.find(c => c.startsWith('sessionId='));
                    console.log('[CSRF] Response sent with cookie:', {
                        hasSetCookie: !!setCookieHeader,
                        hasSessionCookie: !!sessionCookie,
                        sessionCookiePreview: sessionCookie ? sessionCookie.substring(0, 60) + '...' : 'none',
                        sessionId: req.sessionID?.substring(0, 8) + '...'
                    });
                } else {
                    console.warn('[CSRF] WARNING: No Set-Cookie header in response!');
                }
                originalEnd.apply(res, args);
            };
        }
        
        return next();
        
        // Make token available to templates and set helper cookie for JS clients
        setResponseToken(req.session.csrfToken || '');
        return next();
    }

    // For state-changing methods, verify CSRF token
    // Ensure session exists
    if (!req.session) {
        req.session = {};
    }
    
    const sessionToken = req.session?.csrfToken;
    const requestToken = req.body?._csrf || req.headers['x-csrf-token'] || req.headers['csrf-token'];

    // Debug logging for troubleshooting
    if (!sessionToken) {
        // Parse cookies manually to check for session cookie
        const cookieHeader = req.headers.cookie || '';
        const sessionCookieMatch = cookieHeader.match(/sessionId=([^;]+)/);
        
        console.warn('[CSRF] Missing session token on POST:', {
            sessionId: req.sessionID?.substring(0, 8) + '...',
            sessionKeys: Object.keys(req.session || {}),
            hasSession: !!req.session,
            cookies: cookieHeader ? 'present' : 'missing',
            cookieHeader: cookieHeader.substring(0, 150),
            sessionCookieInHeader: sessionCookieMatch ? 'present (' + sessionCookieMatch[1].substring(0, 8) + '...)' : 'missing',
            sessionCookieName: 'sessionId'
        });
    }

    if (!sessionToken || !requestToken) {
        logSecurityEvent('CSRF_TOKEN_MISSING', { 
            method: req.method, 
            path: req.path,
            hasSession: !!req.session,
            hasSessionToken: !!sessionToken,
            hasRequestToken: !!requestToken,
            sessionId: req.sessionID?.substring(0, 8) + '...',
            sessionKeys: Object.keys(req.session || {})
        }, req);
        
        // Check if this is an HTML form submission (not an API call)
        const acceptsHtml = req.accepts('html');
        const isFormSubmission = req.get('content-type')?.includes('application/x-www-form-urlencoded') || 
                                 req.get('content-type')?.includes('multipart/form-data');
        
        if (acceptsHtml && isFormSubmission) {
            // For form submissions, redirect back to the login page with an error
            // This provides a better user experience than a JSON error
            if (req.path === '/login' || req.path === '/auth/login') {
                return res.redirect('/login?error=Please refresh the page and try again.');
            }
            // For other forms, return a generic error page
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Security Error</title></head>
                <body>
                    <h1>Security Error</h1>
                    <p>Your session may have expired. Please refresh the page and try again.</p>
                    <p><a href="${req.path}">Go back</a></p>
                </body>
                </html>
            `);
        }
        
        // For API calls, return JSON
        return res.status(403).json({ error: 'CSRF token missing' });
    }

    // Use timing-safe comparison
    if (!timingSafeCompare(sessionToken, requestToken)) {
        logSecurityEvent('CSRF_TOKEN_INVALID', { 
            method: req.method, 
            path: req.path 
        }, req);
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    // Token is valid
    setResponseToken(sessionToken);
    next();
}

/**
 * Middleware to exempt specific routes from CSRF protection
 */
function csrfExempt(req, res, next) {
    req.csrfExempt = true;
    next();
}

/**
 * Conditional CSRF protection (checks for exemption)
 */
function conditionalCsrfProtection(req, res, next) {
    if (req.csrfExempt) {
        return next();
    }
    return csrfProtection(req, res, next);
}

module.exports = {
    configureHelmet,
    authLimiter,
    passwordResetLimiter,
    apiLimiter,
    uploadLimiter,

    registrationLimiter,
    sensitiveLimiter,
    configureHpp,
    configureSanitizer,
    additionalSecurityHeaders,
    sanitizeInput,
    sanitizeRequest,
    validateFileUpload,
    logSecurityEvent,
    blockSuspiciousUrls,
    timingSafeCompare,
    generateCsrfToken,
    csrfProtection,
    csrfExempt,
    conditionalCsrfProtection
};

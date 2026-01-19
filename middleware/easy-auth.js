/**
 * Azure App Service Easy Auth Middleware
 * 
 * In production, Azure Easy Auth handles OAuth authentication and sets headers.
 * This middleware maps Easy Auth users to our application's user system.
 * 
 * In development, Passport.js handles OAuth directly.
 */

const { getUserByEmail, getUserByProvider, getUserByHandle, createUser, updateUserProvider, getUserById, markEmailAsVerified } = require('../db');
const bcrypt = require('bcrypt');

/**
 * Check if Easy Auth is enabled (production with Easy Auth headers present)
 */
function isEasyAuthEnabled(req) {
    return process.env.NODE_ENV === 'production' && 
           (req.headers['x-ms-client-principal'] || req.headers['x-ms-client-principal-name']);
}

/**
 * Parse Easy Auth principal from headers
 */
function parseEasyAuthPrincipal(req) {
    try {
        // Try to get from X-MS-CLIENT-PRINCIPAL header (base64 encoded JSON)
        if (req.headers['x-ms-client-principal']) {
            const principal = Buffer.from(req.headers['x-ms-client-principal'], 'base64').toString('utf-8');
            return JSON.parse(principal);
        }
        
        // Fallback to individual headers
        const provider = req.headers['x-ms-client-principal-idp'] || 'unknown';
        const email = req.headers['x-ms-client-principal-name'] || null;
        const azureId = req.headers['x-ms-client-principal-id'] || null;
        
        return {
            auth_typ: provider,
            claims: email ? [{ typ: 'email', val: email }] : [],
            name_typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
            role_typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
        };
    } catch (err) {
        console.error('Failed to parse Easy Auth principal:', err);
        return null;
    }
}

/**
 * Map Easy Auth provider name to our provider name
 */
function mapProviderName(easyAuthProvider) {
    const providerMap = {
        'google': 'google',
        'microsoft': 'microsoft',
        'twitter': 'twitter',
        'x': 'twitter', // Azure Easy Auth uses 'x' for Twitter/X
        'apple': 'apple',
        'aad': 'microsoft', // Azure AD
        'facebook': 'facebook'
    };
    return providerMap[easyAuthProvider?.toLowerCase()] || easyAuthProvider?.toLowerCase();
}

/**
 * Extract email from Easy Auth claims
 */
function extractEmail(principal) {
    if (!principal || !principal.claims) return null;
    
    // Look for email claim
    const emailClaim = principal.claims.find(c => 
        c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' ||
        c.typ === 'email' ||
        c.typ === 'preferred_username'
    );
    
    return emailClaim?.val || null;
}

/**
 * Extract display name from Easy Auth claims
 */
function extractDisplayName(principal) {
    if (!principal || !principal.claims) return null;
    
    // Look for name claim
    const nameClaim = principal.claims.find(c => 
        c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' ||
        c.typ === 'name' ||
        c.typ === 'displayname'
    );
    
    return nameClaim?.val || null;
}

/**
 * Generate a unique handle from email or name
 */
function generateBaseHandle(name, email) {
    if (name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);
    }
    if (email) {
        return email.split('@')[0].toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);
    }
    return 'user' + Date.now().toString().slice(-6);
}

/**
 * Generate unique handle
 */
function generateUniqueHandle(baseHandle) {
    let handle = baseHandle;
    let counter = 1;
    while (getUserByHandle(handle)) {
        handle = `${baseHandle}${counter}`;
        counter++;
        if (counter > 1000) {
            handle = `${baseHandle}${Date.now().toString().slice(-6)}`;
            break;
        }
    }
    return handle;
}

/**
 * Find or create user from Easy Auth principal
 */
async function findOrCreateEasyAuthUser(principal, provider) {
    const email = extractEmail(principal);
    const displayName = extractDisplayName(principal) || email || 'User';
    
    // Use provider ID from principal or generate from email
    const providerId = principal.claims?.find(c => c.typ === 'sub')?.val || 
                      principal.claims?.find(c => c.typ === 'oid')?.val ||
                      email ||
                      `easyauth-${provider}-${Date.now()}`;
    
    // Try to find user by provider
    let user = await getUserByProvider(provider, providerId);
    if (user) {
        return user;
    }
    
    // Try to find by email
    if (email) {
        const byEmail = await getUserByEmail(email);
        if (byEmail) {
            updateUserProvider({ userId: byEmail.id, provider, providerId });
            return await getUserById(byEmail.id);
        }
    }
    
    // Create new user
    const dummyHash = await bcrypt.hash(`easyauth-${provider}-${providerId}-${Date.now()}`, 10);
    const baseHandle = generateBaseHandle(displayName, email);
    const uniqueHandle = await generateUniqueHandle(baseHandle);
    
    const { createUser } = require('../db');
    const userId = await createUser({
        fullName: displayName,
        email: email || `${providerId}@${provider}.easyauth.local`,
        passwordHash: dummyHash,
        handle: uniqueHandle
    });
    if (!userId) {
        throw new Error('Failed to create user: no user ID returned');
    }
    updateUserProvider({ userId, provider, providerId });
    
    // Auto-verify email for Easy Auth users
    try {
        if (email) {
            markEmailAsVerified({ userId });
        }
    } catch (e) {
        console.warn('Failed to mark email as verified for Easy Auth user:', e.message);
    }
    
    return await getUserById(userId);
}

/**
 * Easy Auth middleware - maps Azure Easy Auth to application session
 */
async function easyAuthMiddleware(req, res, next) {
    // Only process in production
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }
    
    // Check if Easy Auth is enabled
    if (!isEasyAuthEnabled(req)) {
        return next();
    }
    
    try {
        // Parse Easy Auth principal
        const principal = parseEasyAuthPrincipal(req);
        if (!principal) {
            return next();
        }
        
        // Get provider
        const provider = mapProviderName(principal.auth_typ);
        if (!provider) {
            console.warn('Unknown Easy Auth provider:', principal.auth_typ);
            return next();
        }
        
        // Find or create user
        const user = await findOrCreateEasyAuthUser(principal, provider);
        
        if (user && user.id) {
            // Set session
            if (req.session) {
                req.session.userId = user.id;
                req.session.easyAuth = true;
                req.session.easyAuthProvider = provider;
            }
            
            // Set req.user for compatibility with Passport.js code
            req.user = user;
            
            // Set req.isEasyAuth flag
            req.isEasyAuth = true;
        }
    } catch (err) {
        console.error('Easy Auth middleware error:', err);
        // Don't block request if Easy Auth fails
    }
    
    next();
}

/**
 * Check if request is authenticated via Easy Auth
 */
function isEasyAuthAuthenticated(req) {
    return req.isEasyAuth && req.session?.userId;
}

/**
 * Conditionally skip Passport.js OAuth routes in production if Easy Auth is enabled
 */
function shouldUsePassportOAuth() {
    // Use Passport.js OAuth in development
    if (process.env.NODE_ENV !== 'production') {
        return true;
    }
    
    // In production, default to Easy Auth unless explicitly disabled
    // Set EASY_AUTH_ENABLED=false to force Passport.js OAuth
    return process.env.EASY_AUTH_ENABLED === 'false';
}

module.exports = {
    easyAuthMiddleware,
    isEasyAuthEnabled,
    isEasyAuthAuthenticated,
    shouldUsePassportOAuth
};

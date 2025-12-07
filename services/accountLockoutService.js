// Account lockout service to prevent brute force attacks
const crypto = require('crypto');

// In-memory store for failed login attempts
// In production, this should use Redis or a database
const failedAttempts = new Map();
const lockedAccounts = new Map();

// Configuration
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window to count attempts
const PROGRESSIVE_DELAYS = [0, 1000, 2000, 5000, 10000]; // Progressive delays in ms

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(identifier, ipAddress = null) {
    const key = normalizeKey(identifier);
    const now = Date.now();
    
    if (!failedAttempts.has(key)) {
        failedAttempts.set(key, []);
    }
    
    const attempts = failedAttempts.get(key);
    
    // Add new attempt
    attempts.push({
        timestamp: now,
        ip: ipAddress
    });
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(
        attempt => now - attempt.timestamp < ATTEMPT_WINDOW_MS
    );
    failedAttempts.set(key, recentAttempts);
    
    // Check if account should be locked
    if (recentAttempts.length >= MAX_FAILED_ATTEMPTS) {
        lockAccount(key, now);
        return {
            locked: true,
            remainingAttempts: 0,
            lockoutEndsAt: now + LOCKOUT_DURATION_MS
        };
    }
    
    return {
        locked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS - recentAttempts.length,
        attemptCount: recentAttempts.length
    };
}

/**
 * Lock an account
 */
function lockAccount(identifier, timestamp = Date.now()) {
    const key = normalizeKey(identifier);
    const lockoutEndsAt = timestamp + LOCKOUT_DURATION_MS;
    
    lockedAccounts.set(key, {
        lockedAt: timestamp,
        expiresAt: lockoutEndsAt
    });
    
    console.warn(`🔒 Account locked: ${identifier} until ${new Date(lockoutEndsAt).toISOString()}`);
    
    // Auto-unlock after duration
    setTimeout(() => {
        unlockAccount(identifier);
    }, LOCKOUT_DURATION_MS);
}

/**
 * Unlock an account
 */
function unlockAccount(identifier) {
    const key = normalizeKey(identifier);
    lockedAccounts.delete(key);
    failedAttempts.delete(key);
    console.log(`✅ Account unlocked: ${identifier}`);
}

/**
 * Check if account is locked
 */
function isAccountLocked(identifier) {
    const key = normalizeKey(identifier);
    const lockInfo = lockedAccounts.get(key);
    
    if (!lockInfo) {
        return { locked: false };
    }
    
    const now = Date.now();
    
    // Check if lockout has expired
    if (now >= lockInfo.expiresAt) {
        unlockAccount(identifier);
        return { locked: false };
    }
    
    return {
        locked: true,
        lockedAt: lockInfo.lockedAt,
        expiresAt: lockInfo.expiresAt,
        remainingMs: lockInfo.expiresAt - now
    };
}

/**
 * Reset failed attempts for an account (on successful login)
 */
function resetFailedAttempts(identifier) {
    const key = normalizeKey(identifier);
    failedAttempts.delete(key);
}

/**
 * Get progressive delay based on attempt count
 */
function getProgressiveDelay(identifier) {
    const key = normalizeKey(identifier);
    const attempts = failedAttempts.get(key) || [];
    const recentAttempts = attempts.filter(
        attempt => Date.now() - attempt.timestamp < ATTEMPT_WINDOW_MS
    );
    
    const attemptIndex = Math.min(recentAttempts.length, PROGRESSIVE_DELAYS.length - 1);
    return PROGRESSIVE_DELAYS[attemptIndex];
}

/**
 * Middleware to check if account is locked before login
 */
function checkAccountLockout(req, res, next) {
    const identifier = req.body.email || req.body.username || req.body.handle;
    
    if (!identifier) {
        return next();
    }
    
    const lockStatus = isAccountLocked(identifier);
    
    if (lockStatus.locked) {
        const remainingMinutes = Math.ceil(lockStatus.remainingMs / 60000);
        return res.status(429).json({
            error: 'Account temporarily locked due to multiple failed login attempts',
            message: `Please try again in ${remainingMinutes} minute(s)`,
            locked: true,
            retryAfter: Math.ceil(lockStatus.remainingMs / 1000)
        });
    }
    
    next();
}

/**
 * Middleware to add progressive delay before login attempt
 */
async function applyProgressiveDelay(req, res, next) {
    const identifier = req.body.email || req.body.username || req.body.handle;
    
    if (!identifier) {
        return next();
    }
    
    const delay = getProgressiveDelay(identifier);
    
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    next();
}

/**
 * Normalize identifier to prevent case sensitivity issues
 */
function normalizeKey(identifier) {
    return String(identifier).toLowerCase().trim();
}

/**
 * Get lockout statistics for monitoring
 */
function getStats() {
    return {
        totalLockedAccounts: lockedAccounts.size,
        totalAccountsWithFailures: failedAttempts.size,
        lockedAccountsList: Array.from(lockedAccounts.entries()).map(([key, info]) => ({
            account: key,
            lockedAt: new Date(info.lockedAt).toISOString(),
            expiresAt: new Date(info.expiresAt).toISOString()
        }))
    };
}

/**
 * Clean up expired lockouts (run periodically)
 */
function cleanupExpiredLockouts() {
    const now = Date.now();
    
    for (const [key, lockInfo] of lockedAccounts.entries()) {
        if (now >= lockInfo.expiresAt) {
            lockedAccounts.delete(key);
            failedAttempts.delete(key);
        }
    }
    
    // Also clean up old failed attempts
    for (const [key, attempts] of failedAttempts.entries()) {
        const recentAttempts = attempts.filter(
            attempt => now - attempt.timestamp < ATTEMPT_WINDOW_MS
        );
        
        if (recentAttempts.length === 0) {
            failedAttempts.delete(key);
        } else {
            failedAttempts.set(key, recentAttempts);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredLockouts, 5 * 60 * 1000);

module.exports = {
    recordFailedAttempt,
    lockAccount,
    unlockAccount,
    isAccountLocked,
    resetFailedAttempts,
    getProgressiveDelay,
    checkAccountLockout,
    applyProgressiveDelay,
    getStats,
    cleanupExpiredLockouts,
    MAX_FAILED_ATTEMPTS,
    LOCKOUT_DURATION_MS
};

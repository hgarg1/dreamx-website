// Shared utility functions for routes
const { db } = require('../db');

// Resolve the best-effort base URL for links sent to users
function getRequestBaseUrl(req) {
    const forwardedHost = (req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
    const rawHost = forwardedHost || (req?.get ? req.get('host') : req?.headers?.host || '').trim();
    const host = rawHost || '';
    const forwardedProto = (req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req?.protocol || 'https';

    if (host) {
        const lowerHost = host.toLowerCase();
        const isLocal = lowerHost.includes('localhost') || lowerHost.includes('127.0.0.1');
        if (isLocal) {
            return `http://${host}`;
        }
        // Use the actual request host (supports both dream-x.app and www.dream-x.app)
        const safeProto = protocol === 'http' ? 'http' : 'https';
        return `${safeProto}://${host}`;
    }

    // Fallback to production domain
    const isDevelopment = process.env.NODE_ENV !== 'production';
    return isDevelopment ? 'http://localhost' : 'https://dream-x.app';
}

// Check if user needs onboarding
function userNeedsOnboarding(user) {
    if (!user) return false;
    if (user.onboarding_completed === 1) return false;
    if (user.needs_onboarding === 0) return false;
    const categories = user.categories ? (Array.isArray(user.categories) ? user.categories : JSON.parse(user.categories || '[]')) : [];
    const goals = user.goals ? (Array.isArray(user.goals) ? user.goals : JSON.parse(user.goals || '[]')) : [];
    return categories.length === 0 || goals.length === 0;
}

// Resolve post-authentication redirect
function resolvePostAuthRedirect(user) {
    if (!user) return '/login';

    // Auto-verify and complete onboarding for admin/HR accounts
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin' || ['hr', 'super_hr', 'global_hr'].includes(user.role)) {
        if (user.email_verified !== 1 || user.onboarding_completed !== 1) {
            db.prepare('UPDATE users SET email_verified = 1, onboarding_completed = 1, needs_onboarding = 0 WHERE id = ?').run(user.id);
            user.email_verified = 1;
            user.onboarding_completed = 1;
            user.needs_onboarding = 0;
            console.log(`✅ Auto-verified and completed onboarding for ${user.role} account: ${user.email}`);
        }
    }

    if (user.email_verified !== 1) {
        return '/verify-email';
    }
    if (userNeedsOnboarding(user)) {
        return '/onboarding-empty';
    }
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin') {
        return '/admin';
    }
    if (['hr', 'super_hr', 'global_hr'].includes(user.role)) {
        return '/hr';
    }
    return '/feed';
}

// Password complexity validator
function validatePasswordComplexity(password) {
    const errors = [];
    if (password.length < 8) errors.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('one number');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('one special character');
    return { valid: errors.length === 0, errors };
}

module.exports = {
    getRequestBaseUrl,
    userNeedsOnboarding,
    resolvePostAuthRedirect,
    validatePasswordComplexity
};


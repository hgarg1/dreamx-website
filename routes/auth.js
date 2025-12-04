const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const passport = require('passport');
const {
    getUserById,
    getUserByEmail,
    getUserByHandle,
    getUserByProvider,
    createUser,
    updateUserProvider,
    updatePassword,
    checkAccountStatus,
    createVerificationCode,
    getVerificationCode,
    markCodeAsVerified,
    markEmailAsVerified,
    deleteExpiredVerificationCodes,
    createPasswordResetToken,
    getPasswordResetToken,
    markPasswordResetUsed,
    deleteExpiredPasswordResetTokens,
    invalidateUserResetTokens,
    createOrUpdateSubscription,
    addAuditLog,
    db
} = require('../db');
const { resolvePostAuthRedirect, getRequestBaseUrl, validatePasswordComplexity } = require('./utils');
const emailService = require('../services/emailService');

const router = express.Router();

// Helper functions
function generateBaseHandle(fullName, email) {
    if (fullName) {
        return fullName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    if (email) {
        return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    return 'user';
}

function generateUniqueHandle(baseHandle, excludeUserId = null) {
    let handle = baseHandle;
    let counter = 0;
    while (true) {
        const existing = getUserByHandle(handle);
        if (!existing || (excludeUserId && existing.id === excludeUserId)) {
            return handle;
        }
        counter++;
        handle = `${baseHandle}${counter}`;
    }
}

function getSuggestedHandles(baseHandle, count = 3) {
    const suggestions = [];
    const random = () => Math.floor(Math.random() * 999);
    suggestions.push(generateUniqueHandle(`${baseHandle}${random()}`));
    suggestions.push(generateUniqueHandle(`${baseHandle}_${random()}`));
    let num = 1;
    while (suggestions.length < count) {
        const candidate = `${baseHandle}${num}`;
        if (!getUserByHandle(candidate)) {
            suggestions.push(candidate);
        }
        num++;
    }
    return suggestions.slice(0, count);
}

async function findOrCreateOAuthUser({ provider, providerId, displayName, email }) {
    let user = getUserByProvider(provider, providerId);
    if (user) return user;
    if (email) {
        const byEmail = getUserByEmail(email);
        if (byEmail) {
            updateUserProvider({ userId: byEmail.id, provider, providerId });
            return getUserById(byEmail.id);
        }
    }
    const dummyHash = await bcrypt.hash(`oauth-${provider}-${providerId}-${Date.now()}`, 10);
    const baseHandle = generateBaseHandle(displayName, email);
    const uniqueHandle = generateUniqueHandle(baseHandle);
    const userId = createUser({
        fullName: displayName || (email || 'User'),
        email: email || `${providerId}@${provider}.oauth.local`,
        passwordHash: dummyHash,
        handle: uniqueHandle
    });
    updateUserProvider({ userId, provider, providerId });
    return getUserById(userId);
}

async function importProfilePhotoIfNeeded(user, photoUrl) {
    try {
        if (!photoUrl || !user || user.profile_picture) return;
        const fetch = require('node-fetch');
        const path = require('path');
        const fs = require('fs');
        const res = await fetch(photoUrl);
        if (!res || !res.ok) return;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const ext = (photoUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ext.length <= 5 ? ext : 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        const { updateProfilePicture } = require('../db');
        updateProfilePicture({ userId: user.id, filename: `profiles/${filename}` });
    } catch (e) {
        console.warn('Profile photo import failed:', e.message);
    }
}

// Registration page
router.get('/register', (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.session && req.session.userId) {
        const user = getUserById(req.session.userId);
        if (user) return res.redirect(resolvePostAuthRedirect(user));
    }
    res.render('register', {
        title: 'Register - Dream X',
        currentPage: 'register',
        error: null,
        suggestedHandles: null,
        formData: null
    });
});

// Handle registration
router.post('/register', async (req, res) => {
    const { fullName, email, password, confirmPassword, handle } = req.body;
    if (!fullName || !email || !password || !confirmPassword) {
        return res.status(400).render('register', {
            title: 'Register - Dream X',
            currentPage: 'register',
            error: 'All fields are required.',
            suggestedHandles: null,
            formData: req.body
        });
    }
    if (password !== confirmPassword) {
        return res.status(400).render('register', {
            title: 'Register - Dream X',
            currentPage: 'register',
            error: 'Passwords do not match.',
            suggestedHandles: null,
            formData: req.body
        });
    }
    const complexityCheck = validatePasswordComplexity(password);
    if (!complexityCheck.valid) {
        return res.status(400).render('register', {
            title: 'Register - Dream X',
            currentPage: 'register',
            error: `Password must contain ${complexityCheck.errors.join(', ')}.`,
            suggestedHandles: null,
            formData: req.body
        });
    }
    const existing = getUserByEmail(email.trim().toLowerCase());
    if (existing) {
        return res.status(400).render('register', {
            title: 'Register - Dream X',
            currentPage: 'register',
            error: 'Email already in use.',
            suggestedHandles: null,
            formData: req.body
        });
    }

    // Alt account detection
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    const emailDomain = email.split('@')[1];
    const emailUsername = email.split('@')[0];
    try {
        const suspiciousUsers = db.prepare(`
            SELECT u.id, u.email, u.full_name, u.account_status, u.created_at,
                   am.ban_reason, am.suspended_until
            FROM users u
            LEFT JOIN account_moderation am ON am.user_id = u.id
            WHERE (am.status IN ('banned', 'suspended') OR u.account_status IN ('banned', 'suspended'))
                AND (u.email LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
            ORDER BY u.created_at DESC
            LIMIT 1
        `).get(`%${emailUsername}%@${emailDomain}`, `%${fullName}%`, `${emailUsername}%@%`);
        if (suspiciousUsers) {
            console.warn(`[ALT ACCOUNT DETECTION] Potential alt account signup detected: ${email} (${fullName})`);
            try {
                addAuditLog({
                    userId: null,
                    action: 'suspicious_signup_detected',
                    details: JSON.stringify({
                        newEmail: email,
                        newName: fullName,
                        matchedUserId: suspiciousUsers.id,
                        matchedEmail: suspiciousUsers.email,
                        matchedStatus: suspiciousUsers.account_status,
                        ip: clientIp
                    })
                });
            } catch (e) { }
        }
    } catch (e) {
        console.warn('Alt account detection failed:', e.message);
    }

    // Handle validation
    let userHandle = handle ? handle.trim().toLowerCase() : '';
    if (!userHandle) {
        const baseHandle = generateBaseHandle(fullName, email);
        userHandle = generateUniqueHandle(baseHandle);
    } else {
        if (!/^[a-z0-9_]{3,20}$/.test(userHandle)) {
            return res.status(400).render('register', {
                title: 'Register - Dream X',
                currentPage: 'register',
                error: 'Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores.',
                suggestedHandles: null,
                formData: req.body
            });
        }
        const handleExists = getUserByHandle(userHandle);
        if (handleExists) {
            const baseHandle = generateBaseHandle(fullName, email);
            const suggestions = getSuggestedHandles(baseHandle);
            return res.status(400).render('register', {
                title: 'Register - Dream X',
                currentPage: 'register',
                error: `Handle "@${userHandle}" is already taken. Here are some suggestions:`,
                suggestedHandles: suggestions,
                formData: req.body
            });
        }
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const userId = createUser({
            fullName,
            email: email.trim().toLowerCase(),
            passwordHash: hash,
            handle: userHandle
        });
        try {
            createOrUpdateSubscription({ userId, tier: 'free', status: 'active' });
        } catch (subErr) {
            console.warn('Failed to initialize free subscription for user', userId, subErr.message);
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        createVerificationCode({
            userId,
            email: email.trim().toLowerCase(),
            code: verificationCode,
            expiresAt
        });

        const user = getUserById(userId);
        try {
            await emailService.sendVerificationCode(user, verificationCode, req);
            console.log(`✅ Verification email sent to ${user.email}`);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr);
        }

        req.login(user, (err) => {
            if (err) {
                console.error('Registration login error:', err);
                if (req.session) {
                    req.session.userId = userId;
                }
                return res.redirect('/verify-email');
            }
            if (req.session) {
                req.session.userId = userId;
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                    }
                    return res.redirect('/verify-email');
                });
            } else {
                return res.redirect('/verify-email');
            }
        });
    } catch (e) {
        console.error('Registration error', e);
        return res.status(500).render('register', { title: 'Register - Dream X', currentPage: 'register', error: 'Server error. Try again.' });
    }
});

// Email Verification Routes
router.get('/verify-email', (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/login');
    const user = getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    if (user.email_verified === 1) return res.redirect(resolvePostAuthRedirect(user));
    res.render('verify-email', {
        title: 'Verify Your Email - Dream X',
        currentPage: 'verify-email',
        user,
        error: null,
        success: null
    });
});

router.post('/verify-email', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.email_verified === 1) {
        return res.json({ success: true, redirect: resolvePostAuthRedirect(user) });
    }
    const { code } = req.body;
    if (!code || code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 6-digit code' });
    }
    try {
        deleteExpiredVerificationCodes();
    } catch (e) { }
    const verificationRecord = getVerificationCode({ userId: user.id, code });
    if (!verificationRecord) {
        return res.status(400).json({ success: false, error: 'Invalid or expired code. Please try again.' });
    }
    const now = new Date();
    const expiresAt = new Date(verificationRecord.expires_at);
    if (now > expiresAt) {
        return res.status(400).json({ success: false, error: 'Code expired. Request a new one.' });
    }
    try {
        markCodeAsVerified({ id: verificationRecord.id });
        markEmailAsVerified({ userId: user.id });
        console.log(`✅ Email verified for user ${user.id} (${user.email})`);
        const updatedUser = { ...user, email_verified: 1 };
        return res.json({ success: true, redirect: resolvePostAuthRedirect(updatedUser) });
    } catch (err) {
        console.error('Verification error:', err);
        return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
    }
});

router.post('/resend-verification', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.email_verified === 1) {
        return res.json({ success: true, message: 'Email already verified' });
    }
    try {
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        createVerificationCode({
            userId: user.id,
            email: user.email,
            code: verificationCode,
            expiresAt
        });
        await emailService.sendVerificationCode(user, verificationCode, req);
        return res.json({ success: true, message: 'New verification code sent!' });
    } catch (err) {
        console.error('Resend verification error:', err);
        return res.status(500).json({ success: false, error: 'Failed to send email. Please try again.' });
    }
});

// Forgot password
router.get('/forgot-password', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/feed');
    res.render('forgot-password', {
        title: 'Forgot Password - Dream X',
        currentPage: 'forgot-password',
        error: null,
        success: null
    });
});

router.post('/forgot-password', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const baseUrl = getRequestBaseUrl(req);
    const successMessage = 'If an account exists for that email, we\'ve sent reset instructions to your inbox.';
    if (!email) {
        return res.status(400).render('forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'forgot-password',
            error: 'Please enter your email address.',
            success: null
        });
    }
    try {
        deleteExpiredPasswordResetTokens();
    } catch (err) {
        console.error('Failed to cleanup reset tokens:', err.message);
    }
    const user = getUserByEmail(email);
    if (!user) {
        return res.render('forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'forgot-password',
            error: null,
            success: successMessage
        });
    }
    try {
        invalidateUserResetTokens({ userId: user.id });
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        createPasswordResetToken({
            userId: user.id,
            email: user.email,
            tokenHash,
            expiresAt
        });
        const resetLink = `${baseUrl}/reset-password?token=${token}`;
        const emailResult = await emailService.sendPasswordReset(user, resetLink, req);
        if (!emailResult?.success) {
            console.error('Password reset email reported failure', {
                userId: user.id,
                email: user.email,
                resetLink,
                redirectUri: emailService.getGmailRedirectUri ? emailService.getGmailRedirectUri(req) : 'unknown',
                error: emailResult?.error || 'Unknown error'
            });
        }
        return res.render('forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'forgot-password',
            error: null,
            success: successMessage
        });
    } catch (err) {
        console.error('Failed to start password reset:', {
            message: err?.message || err,
            stack: err?.stack,
            userId: user?.id,
            email: user?.email
        });
        return res.status(500).render('forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'forgot-password',
            error: 'Something went wrong while sending your reset email. Please try again shortly.',
            success: null
        });
    }
});

router.get('/reset-password', (req, res) => {
    const token = (req.query.token || '').trim();
    if (!token) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'This password reset link is invalid or has already been used.',
            success: null,
            token: null
        });
    }
    deleteExpiredPasswordResetTokens();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = getPasswordResetToken({ tokenHash });
    if (!record || record.used || new Date(record.expires_at) < new Date()) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'This password reset link is invalid or has expired.',
            success: null,
            token: null
        });
    }
    return res.render('reset-password', {
        title: 'Reset Password - Dream X',
        currentPage: 'reset-password',
        error: null,
        success: null,
        token
    });
});

router.post('/reset-password', async (req, res) => {
    const { token, password, confirmPassword } = req.body;
    if (!token) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'Reset token missing or invalid.',
            success: null,
            token: null
        });
    }
    if (!password || password.length < 8) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'Please choose a password that is at least 8 characters long.',
            success: null,
            token
        });
    }
    if (password !== confirmPassword) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'Passwords do not match. Please try again.',
            success: null,
            token
        });
    }
    deleteExpiredPasswordResetTokens();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = getPasswordResetToken({ tokenHash });
    if (!record || record.used || new Date(record.expires_at) < new Date()) {
        return res.status(400).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'This password reset link is invalid or has expired.',
            success: null,
            token: null
        });
    }
    const user = getUserById(record.user_id);
    if (!user) {
        markPasswordResetUsed({ id: record.id });
        return res.status(404).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'We could not find an account for this reset link.',
            success: null,
            token: null
        });
    }
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        updatePassword({ userId: user.id, passwordHash });
        markPasswordResetUsed({ id: record.id });
        invalidateUserResetTokens({ userId: user.id });
        if (req.session) {
            req.session.userId = user.id;
            req.session.save(() => {
                return res.redirect('/feed');
            });
        } else {
            return res.redirect('/feed');
        }
    } catch (err) {
        console.error('Failed to reset password:', err);
        return res.status(500).render('reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'reset-password',
            error: 'An unexpected error occurred while updating your password. Please try again.',
            success: null,
            token
        });
    }
});

// Login page
router.get('/login', (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.session && req.session.userId) {
        const user = getUserById(req.session.userId);
        if (user) return res.redirect(resolvePostAuthRedirect(user));
    }
    // Check if OAuth strategies are configured by checking environment variables
    const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const microsoftEnabled = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const appleEnabled = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://'));
    res.render('login', {
        title: 'Login - Dream X',
        currentPage: 'login',
        error: null,
        providers: { googleEnabled, microsoftEnabled, appleEnabled }
    });
});

// Handle login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail((email || '').trim().toLowerCase());
    const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const microsoftEnabled = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const appleEnabled = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://'));
    const providers = { googleEnabled, microsoftEnabled, appleEnabled };
    if (!user) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.', providers });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.', providers });
    }
    const accountStatus = checkAccountStatus(user.id);
    if (accountStatus.status === 'banned') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    if (accountStatus.status === 'suspended') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    req.login(user, (err) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).render('login', {
                title: 'Login - Dream X',
                currentPage: 'login',
                error: 'Login failed. Please try again.',
                providers
            });
        }
        if (req.session) {
            req.session.userId = user.id;
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                }
                const freshUser = getUserById(user.id);
                const redirectPath = resolvePostAuthRedirect(freshUser);
                return res.redirect(redirectPath);
            });
        } else {
            const freshUser = getUserById(user.id);
            const redirectPath = resolvePostAuthRedirect(freshUser);
            return res.redirect(redirectPath);
        }
    });
});

// Logout
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        if (req.session) {
            req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.redirect('/');
            });
        } else {
            res.clearCookie('connect.sid');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.redirect('/');
        }
    });
});

// Helper to get callback URL from request
function getCallbackURLFromRequest(req, path) {
    // Use explicit callback URL env var if set
    if (process.env.GOOGLE_CALLBACK_URL && path.includes('google')) return process.env.GOOGLE_CALLBACK_URL;
    if (process.env.MICROSOFT_CALLBACK_URL && path.includes('microsoft')) return process.env.MICROSOFT_CALLBACK_URL;
    if (process.env.APPLE_CALLBACK_URL && path.includes('apple')) return process.env.APPLE_CALLBACK_URL;
    
    // Use BASE_URL if set
    if (process.env.BASE_URL) {
        return `${process.env.BASE_URL}${path}`;
    }
    
    // Build from request headers (handles both direct requests and proxied requests)
    const forwardedHost = (req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
    const rawHost = forwardedHost || (req?.get ? req.get('host') : req?.headers?.host || '').trim();
    const forwardedProto = (req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req?.protocol || 'https';
    
    if (rawHost) {
        const lowerHost = rawHost.toLowerCase();
        const isLocal = lowerHost.includes('localhost') || lowerHost.includes('127.0.0.1') || lowerHost.includes('0.0.0.0');
        if (isLocal) {
            return `http://${rawHost}${path}`;
        }
        // For production domains (dream-x.app, www.dream-x.app, etc.), use https
        const safeProto = protocol === 'http' ? 'http' : 'https';
        return `${safeProto}://${rawHost}${path}`;
    }
    
    // Fallback to production domain (default to production since NODE_ENV is not available)
    return `https://dream-x.app${path}`;
}

// OAuth routes - these need to be set up in app.js with passport strategies
// They're included here for reference but need passport middleware
router.get('/auth/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).send('Google OAuth not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    console.log('🔍 Google OAuth - Request Host:', req.get('host'));
    console.log('🔍 Google OAuth - Protocol:', req.protocol);
    console.log('🔍 Google OAuth - Note: Google uses static callback URL from strategy initialization');
    passport.authenticate('google', { state: mode, scope: ['profile', 'email'] })(req, res, next);
});

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), async (req, res) => {
    const mode = req.query.state;
    if (mode === 'link' && req.session && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        if (req.authInfo.photoUrl) {
            const user = getUserById(req.session.userId);
            await importProfilePhotoIfNeeded(user, req.authInfo.photoUrl);
        }
        return res.redirect('/settings?success=Google connected');
    }
    if (req.user && req.user.id) {
        req.login(req.user, (err) => {
            if (err) {
                console.error('❌ Google login error:', err);
                return res.redirect('/login');
            }
            if (req.session) {
                req.session.userId = req.user.id;
                req.session.save((saveErr) => {
                    try {
                        const u = getUserById(req.user.id);
                        if (u && u.email_verified !== 1) {
                            markEmailAsVerified({ userId: u.id });
                        }
                        const redirectTarget = resolvePostAuthRedirect(u ? getUserById(u.id) : null);
                        return res.redirect(redirectTarget);
                    } catch (_) {
                        return res.redirect('/feed');
                    }
                });
            } else {
                return res.redirect('/feed');
            }
        });
    } else {
        res.redirect('/feed');
    }
});

router.get('/auth/microsoft', (req, res, next) => {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) return res.status(503).send('Microsoft OAuth not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    // Note: Microsoft uses static callback URL from strategy initialization
    passport.authenticate('microsoft', { state: mode })(req, res, next);
});

router.get('/auth/microsoft/callback', passport.authenticate('microsoft', { failureRedirect: '/login' }), async (req, res) => {
    const mode = req.query.state;
    if (mode === 'link' && req.session && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        return res.redirect('/settings?success=Microsoft connected');
    }
    if (req.user && req.user.id) {
        req.login(req.user, (err) => {
            if (err) {
                console.error('Microsoft login error:', err);
                return res.redirect('/login');
            }
            if (req.session) {
                req.session.userId = req.user.id;
                req.session.save((saveErr) => {
                    if (saveErr) console.error('Microsoft session save error:', saveErr);
                    try {
                        const u = getUserById(req.user.id);
                        if (u && u.email_verified !== 1) {
                            markEmailAsVerified({ userId: u.id });
                        }
                        const redirectTarget = resolvePostAuthRedirect(u ? getUserById(u.id) : null);
                        return res.redirect(redirectTarget);
                    } catch (_) {
                        return res.redirect('/feed');
                    }
                });
            } else {
                return res.redirect('/feed');
            }
        });
    } else {
        res.redirect('/feed');
    }
});

router.get('/auth/apple', (req, res, next) => {
    if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) return res.status(503).send('Apple Sign-In not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    const callbackURL = getCallbackURLFromRequest(req, '/auth/apple/callback');
    passport.authenticate('apple', { state: mode, callbackURL: callbackURL })(req, res, next);
});

router.post('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), async (req, res) => {
    const mode = req.query.state;
    if (mode === 'link' && req.session && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        return res.redirect('/settings?success=Apple connected');
    }
    if (req.user && req.user.id) {
        req.login(req.user, (err) => {
            if (err) {
                console.error('Apple login error:', err);
                return res.redirect('/login');
            }
            if (req.session) {
                req.session.userId = req.user.id;
                req.session.save((saveErr) => {
                    if (saveErr) console.error('Apple session save error:', saveErr);
                    try {
                        const u = getUserById(req.user.id);
                        if (u && u.email_verified !== 1) {
                            markEmailAsVerified({ userId: u.id });
                        }
                        const redirectTarget = resolvePostAuthRedirect(u ? getUserById(u.id) : null);
                        return res.redirect(redirectTarget);
                    } catch (_) {
                        return res.redirect('/feed');
                    }
                });
            } else {
                return res.redirect('/feed');
            }
        });
    } else {
        res.redirect('/feed');
    }
});

module.exports = router;


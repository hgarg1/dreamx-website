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
    createPhoneVerificationCode,
    getPhoneVerificationCode,
    getLatestPhoneVerificationCode,
    markPhoneCodeAsVerified,
    markPhoneAsVerified,
    updateUserPhoneNumber,
    deleteExpiredPhoneVerificationCodes,
    createDeviceFingerprint,
    db
} = require('../../db');
const { resolvePostAuthRedirect, getRequestBaseUrl, validatePasswordComplexity } = require('../../utils/route-helpers');
const { findOrCreateOAuthUser, importProfilePhotoIfNeeded } = require('../../utils/oauth-helpers');
const emailService = require('../../services/emailService');
const phoneService = require('../../services/phoneService');
const DeviceFingerprintService = require('../../services/deviceFingerprintService');
const AltAccountDetectionService = require('../../services/altAccountDetectionService');
const rateLimitService = require('../../services/rateLimitService');

// Import security middleware
const {
    authLimiter,
    passwordResetLimiter,
    registrationLimiter
} = require('../../middleware/security');

// Import account lockout service
const accountLockout = require('../../services/accountLockoutService');

const router = express.Router();

// Helper functions
const { generateBaseHandle, generateUniqueHandle } = require('../../utils/oauth-helpers');

async function getSuggestedHandles(baseHandle, count = 3) {
    const suggestions = [];
    const random = () => Math.floor(Math.random() * 999);
    suggestions.push(await generateUniqueHandle(`${baseHandle}${random()}`));
    suggestions.push(await generateUniqueHandle(`${baseHandle}_${random()}`));
    let num = 1;
    while (suggestions.length < count) {
        const candidate = `${baseHandle}${num}`;
        if (!(await getUserByHandle(candidate))) {
            suggestions.push(candidate);
        }
        num++;
    }
    return suggestions.slice(0, count);
}

// Registration page
router.get('/register', async (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (req.session && req.session.userId) {
        const user = await getUserById(req.session.userId);
        if (user) return res.redirect(resolvePostAuthRedirect(user));
    }
    res.render('auth/register', {
        title: 'Register - Dream X',
        currentPage: 'auth/register',
        error: null,
        suggestedHandles: null,
        formData: null
    });
});

// Handle registration
router.post('/register', registrationLimiter, async (req, res) => {
    const { fullName, email, password, confirmPassword, handle } = req.body;
    if (!fullName || !email || !password || !confirmPassword) {
        return res.status(400).render('auth/register', {
            title: 'Register - Dream X',
            currentPage: 'auth/register',
            error: 'All fields are required.',
            suggestedHandles: null,
            formData: req.body
        });
    }
    if (password !== confirmPassword) {
        return res.status(400).render('auth/register', {
            title: 'Register - Dream X',
            currentPage: 'auth/register',
            error: 'Passwords do not match.',
            suggestedHandles: null,
            formData: req.body
        });
    }
    const complexityCheck = validatePasswordComplexity(password);
    if (!complexityCheck.valid) {
        return res.status(400).render('auth/register', {
            title: 'Register - Dream X',
            currentPage: 'auth/register',
            error: `Password must contain ${complexityCheck.errors.join(', ')}.`,
            suggestedHandles: null,
            formData: req.body
        });
    }
    const existing = await getUserByEmail(email.trim().toLowerCase());
    if (existing) {
        return res.status(400).render('auth/register', {
            title: 'Register - Dream X',
            currentPage: 'auth/register',
            error: 'Email already in use.',
            suggestedHandles: null,
            formData: req.body
        });
    }

    // Enhanced alt account detection with multiple signals
    const clientIp = DeviceFingerprintService.getClientIP(req);
    const { hash: fingerprintHash, details: fingerprintDetails } = DeviceFingerprintService.generateFingerprint(req);
    const phoneNumber = req.body.phoneNumber ? req.body.phoneNumber.trim() : null;

    let normalizedPhone = null;
    if (phoneNumber) {
        const phoneValidation = phoneService.validatePhoneNumber(phoneNumber);
        if (phoneValidation.valid) {
            normalizedPhone = phoneValidation.e164;
        }
    }

    let altAccountAnalysis = { isAltAccount: false, riskLevel: 'low', detections: [] };
    try {
        altAccountAnalysis = await AltAccountDetectionService.analyzeSignup({
            email: email.trim().toLowerCase(),
            fullName,
            phoneNumber: normalizedPhone,
            ipAddress: clientIp,
            fingerprintHash,
            req
        });

        if (altAccountAnalysis.shouldFlagForReview || altAccountAnalysis.isAltAccount) {
            console.warn(`[ALT ACCOUNT DETECTION] ${altAccountAnalysis.recommendation}:`, {
                email,
                fullName,
                riskLevel: altAccountAnalysis.riskLevel,
                detections: altAccountAnalysis.detections.map(d => ({ type: d.type, severity: d.severity }))
            });

            // Block high-risk signups
            if (altAccountAnalysis.isAltAccount) {
                return res.status(403).render('auth/register', {
                    title: 'Register - Dream X',
                    currentPage: 'auth/register',
                    error: 'Unable to complete registration. Please contact support if you believe this is an error.',
                    suggestedHandles: null,
                    formData: req.body
                });
            }
        }
    } catch (error) {
        console.error('Alt account detection error:', error);
        // Don't block signup if detection fails, but log it
    }

    // Handle validation
    let userHandle = handle ? handle.trim().toLowerCase() : '';
    if (!userHandle) {
        const baseHandle = generateBaseHandle(fullName, email);
        userHandle = await generateUniqueHandle(baseHandle);
    } else {
        if (!/^[a-z0-9_]{3,20}$/.test(userHandle)) {
            return res.status(400).render('auth/register', {
                title: 'Register - Dream X',
                currentPage: 'auth/register',
                error: 'Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores.',
                suggestedHandles: null,
                formData: req.body
            });
        }
        const handleExists = await getUserByHandle(userHandle);
        if (handleExists) {
            const baseHandle = generateBaseHandle(fullName, email);
            const suggestions = await getSuggestedHandles(baseHandle);
            return res.status(400).render('auth/register', {
                title: 'Register - Dream X',
                currentPage: 'auth/register',
                error: `Handle "@${userHandle}" is already taken. Here are some suggestions:`,
                suggestedHandles: suggestions,
                formData: req.body
            });
        }
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const userId = await createUser({
            fullName,
            email: email.trim().toLowerCase(),
            passwordHash: hash,
            handle: userHandle,
            phoneNumber: normalizedPhone || null
        });

        try {
            createOrUpdateSubscription({ userId, tier: 'free', status: 'active' });
        } catch (subErr) {
            console.warn('Failed to initialize free subscription for user', userId, subErr.message);
        }

        // Store device fingerprint
        try {
            createDeviceFingerprint({
                userId,
                fingerprintHash,
                userAgent: req.headers['user-agent'] || '',
                ipAddress: clientIp,
                country: fingerprintDetails.country || 'unknown',
                deviceType: fingerprintDetails.deviceType || 'desktop',
                browser: fingerprintDetails.browser || 'unknown',
                os: fingerprintDetails.os || 'unknown'
            });
        } catch (fpError) {
            console.warn('Failed to store device fingerprint:', fpError.message);
        }

        // Log alt account detection if suspicious
        if (altAccountAnalysis.detections.length > 0) {
            altAccountAnalysis.detections.forEach(detection => {
                AltAccountDetectionService.logDetection(userId, detection);
            });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        createVerificationCode({
            userId,
            email: email.trim().toLowerCase(),
            code: verificationCode,
            expiresAt
        });

        // If phone provided, initiate phone verification
        let phoneVerificationRequired = false;
        if (normalizedPhone) {
            phoneVerificationRequired = true;
            const phoneCode = Math.floor(100000 + Math.random() * 900000).toString();
            const phoneExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            createPhoneVerificationCode({
                userId,
                phoneNumber: normalizedPhone,
                code: phoneCode,
                expiresAt: phoneExpiresAt
            });

            // Send SMS if Twilio is configured
            if (phoneService.isConfigured()) {
                const smsResult = await phoneService.sendOTPMessage(normalizedPhone, phoneCode);
                if (!smsResult.success) {
                    console.warn('Failed to send phone verification SMS:', smsResult.error);
                }
            }
        }

        const user = await getUserById(userId);
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
        return res.status(500).render('auth/register', { title: 'Register - Dream X', currentPage: 'auth/register', error: 'Server error. Try again.' });
    }
});

// Email Verification Routes
router.get('/verify-email', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/login');
    const user = await getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    const isVerified = user.email_verified === true || user.email_verified === 1 || user.email_verified === '1';
    if (isVerified) return res.redirect(resolvePostAuthRedirect(user));
    res.render('auth/verify-email', {
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
    const user = await getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    const isAlreadyVerified = user.email_verified === true || user.email_verified === 1 || user.email_verified === '1';
    if (isAlreadyVerified) {
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
        const freshUser = await getUserById(user.id);
        const updatedUser = freshUser || { ...user, email_verified: true };
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
    const user = await getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    const isVerified = user.email_verified === true || user.email_verified === 1 || user.email_verified === '1';
    if (isVerified) {
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
    res.render('auth/forgot-password', {
        title: 'Forgot Password - Dream X',
        currentPage: 'auth/forgot-password',
        error: null,
        success: null
    });
});

router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const baseUrl = getRequestBaseUrl(req);
    const successMessage = 'If an account exists for that email, we\'ve sent reset instructions to your inbox.';
    if (!email) {
        return res.status(400).render('auth/forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'auth/forgot-password',
            error: 'Please enter your email address.',
            success: null
        });
    }
    try {
        deleteExpiredPasswordResetTokens();
    } catch (err) {
        console.error('Failed to cleanup reset tokens:', err.message);
    }
    const user = await getUserByEmail(email);
    if (!user) {
        return res.render('auth/forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'auth/forgot-password',
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
        return res.render('auth/forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'auth/forgot-password',
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
        return res.status(500).render('auth/forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'auth/forgot-password',
            error: 'Something went wrong while sending your reset email. Please try again shortly.',
            success: null
        });
    }
});

router.get('/reset-password', (req, res) => {
    const token = (req.query.token || '').trim();
    if (!token) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'This password reset link is invalid or has already been used.',
            success: null,
            token: null
        });
    }
    deleteExpiredPasswordResetTokens();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = getPasswordResetToken({ tokenHash });
    if (!record || record.used || new Date(record.expires_at) < new Date()) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'This password reset link is invalid or has expired.',
            success: null,
            token: null
        });
    }
    return res.render('auth/reset-password', {
        title: 'Reset Password - Dream X',
        currentPage: 'auth/reset-password',
        error: null,
        success: null,
        token
    });
});

router.post('/reset-password', passwordResetLimiter, async (req, res) => {
    const { token, password, confirmPassword } = req.body;
    if (!token) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'Reset token missing or invalid.',
            success: null,
            token: null
        });
    }
    if (!password || password.length < 8) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'Please choose a password that is at least 8 characters long.',
            success: null,
            token
        });
    }
    if (password !== confirmPassword) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'Passwords do not match. Please try again.',
            success: null,
            token
        });
    }
    deleteExpiredPasswordResetTokens();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = getPasswordResetToken({ tokenHash });
    if (!record || record.used || new Date(record.expires_at) < new Date()) {
        return res.status(400).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'This password reset link is invalid or has expired.',
            success: null,
            token: null
        });
    }
    const user = await getUserById(record.user_id);
    if (!user) {
        markPasswordResetUsed({ id: record.id });
        return res.status(404).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
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
        return res.status(500).render('auth/reset-password', {
            title: 'Reset Password - Dream X',
            currentPage: 'auth/reset-password',
            error: 'An unexpected error occurred while updating your password. Please try again.',
            success: null,
            token
        });
    }
});

// Login page
router.get('/login', async (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // The CSRF middleware has already set req.session.csrfToken
    // express-session will automatically save the session and set the cookie
    // when the response is sent - no need to manually save here
    
    if (req.session && req.session.userId) {
        const user = await getUserById(req.session.userId);
        if (user) return res.redirect(resolvePostAuthRedirect(user));
    }
    // Check if OAuth strategies are configured by checking environment variables
    const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const microsoftEnabled = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const appleEnabled = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://'));
    const twitterEnabled = !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);

    // In production, prefer Azure Easy Auth endpoints directly for SSO buttons
    const useEasyAuth = !shouldUsePassportOAuth();
    const xLoginHref = useEasyAuth
        ? '/.auth/login/twitter?post_login_redirect_url=%2Ffeed'
        : '/auth/x';
    
    // Handle error from query parameter (e.g., from CSRF redirect)
    const error = req.query.error || null;
    
    res.render('auth/login', {
        title: 'Login - Dream X',
        currentPage: 'auth/login',
        error: error,
        providers: { googleEnabled, microsoftEnabled, appleEnabled, twitterEnabled },
        xLoginHref
    });
});

// Handle login
router.post('/login', authLimiter, accountLockout.checkAccountLockout, accountLockout.applyProgressiveDelay, async (req, res) => {
    const { email, password } = req.body;
    
    // Debug logging (remove in production if not needed)
    if (!password) {
        console.warn('Login attempt with missing password field:', {
            hasEmail: !!email,
            bodyKeys: Object.keys(req.body),
            contentType: req.get('content-type')
        });
    }
    
    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);
    const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const microsoftEnabled = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const appleEnabled = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://'));
    const twitterEnabled = !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);
    const providers = { googleEnabled, microsoftEnabled, appleEnabled, twitterEnabled };
    
    if (!user) {
        // Record failed attempt even for non-existent users to prevent user enumeration
        accountLockout.recordFailedAttempt(normalizedEmail, req.ip);
        return res.status(400).render('auth/login', { title: 'Login - Dream X', currentPage: 'auth/login', error: 'Invalid credentials.', providers });
    }
    
    // Validate that both password and password_hash are present
    // OAuth-only users may not have a password_hash set
    // Also check for empty strings (password.trim() would fail if password is null/undefined)
    const passwordProvided = password && typeof password === 'string' && password.trim().length > 0;
    const hasPasswordHash = user.password_hash && typeof user.password_hash === 'string' && user.password_hash.length > 0;
    
    if (!passwordProvided) {
        // Record failed attempt - password not provided
        accountLockout.recordFailedAttempt(normalizedEmail, req.ip);
        return res.status(400).render('auth/login', { 
            title: 'Login - Dream X', 
            currentPage: 'auth/login', 
            error: 'Password is required.', 
            providers 
        });
    }
    
    if (!hasPasswordHash) {
        // Record failed attempt - user may be OAuth-only account
        accountLockout.recordFailedAttempt(normalizedEmail, req.ip);
        return res.status(400).render('auth/login', { 
            title: 'Login - Dream X', 
            currentPage: 'auth/login', 
            error: 'This account does not have a password set. Please use your social login option instead.', 
            providers 
        });
    }
    
    // Final defensive check right before bcrypt.compare to prevent "data and hash arguments required" error
    // This should never be hit if validation above works, but adds extra safety
    const trimmedPassword = password.trim();
    const hashValue = user.password_hash;
    
    if (!trimmedPassword || !hashValue || typeof hashValue !== 'string' || hashValue.length === 0) {
        console.error('bcrypt.compare called with invalid arguments:', {
            hasPassword: !!trimmedPassword,
            passwordLength: trimmedPassword ? trimmedPassword.length : 0,
            hasHash: !!hashValue,
            hashType: typeof hashValue,
            hashLength: hashValue ? hashValue.length : 0,
            userEmail: normalizedEmail,
            userId: user.id
        });
        accountLockout.recordFailedAttempt(normalizedEmail, req.ip);
        return res.status(400).render('auth/login', { 
            title: 'Login - Dream X', 
            currentPage: 'auth/login', 
            error: 'Invalid credentials.', 
            providers 
        });
    }
    
    const ok = await bcrypt.compare(trimmedPassword, hashValue);
    if (!ok) {
        // Record failed login attempt
        const lockoutStatus = accountLockout.recordFailedAttempt(normalizedEmail, req.ip);
        
        // Log security event
        addAuditLog({
            userId: user.id,
            action: 'failed_login',
            details: JSON.stringify({ ip: req.ip, userAgent: req.get('user-agent') })
        });
        
        if (lockoutStatus.locked) {
            return res.status(429).render('auth/login', {
                title: 'Login - Dream X',
                currentPage: 'auth/login',
                error: `Account temporarily locked due to multiple failed login attempts. Please try again in ${Math.ceil((lockoutStatus.lockoutEndsAt - Date.now()) / 60000)} minute(s).`,
                providers
            });
        }
        
        return res.status(400).render('auth/login', { 
            title: 'Login - Dream X', 
            currentPage: 'auth/login', 
            error: 'Invalid credentials.', 
            providers 
        });
    }
    
    // Reset failed attempts on successful login
    accountLockout.resetFailedAttempts(normalizedEmail);
    
    const accountStatus = checkAccountStatus(user.id);
    if (accountStatus.status === 'banned') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    if (accountStatus.status === 'suspended') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    req.login(user, async (err) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).render('auth/login', {
                title: 'Login - Dream X',
                currentPage: 'auth/login',
                error: 'Login failed. Please try again.',
                providers
            });
        }
        if (req.session) {
            req.session.userId = user.id;
            req.session.ssoPasswordBootstrap = null;
            req.session.save(async (saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                }
                const freshUser = await getUserById(user.id);
                const redirectPath = resolvePostAuthRedirect(freshUser);
                return res.redirect(redirectPath);
            });
        } else {
            const freshUser = await getUserById(user.id);
            const redirectPath = resolvePostAuthRedirect(freshUser);
            return res.redirect(redirectPath);
        }
    });
});

// Logout
router.get('/logout', (req, res) => {
    // Set aggressive no-cache headers to prevent PWA/service worker caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Check if user is authenticated via Easy Auth
    if (req.session && req.session.easyAuth) {
        // Easy Auth logout - redirect to Azure's logout endpoint
        const baseUrl = getRequestBaseUrl(req);
        // Use query parameter if provided, otherwise redirect to home page
        const postLogoutRedirect = req.query.post_logout_redirect_uri || req.query.post_logout_redirect_url || '/';
        
        // Destroy local session first
        if (req.session) {
            req.session.destroy(() => {
                res.clearCookie('connect.sid', { path: '/', httpOnly: true });
                res.clearCookie('XSRF-TOKEN', { path: '/' });
                
                // Redirect to Azure Easy Auth logout endpoint
                // Azure Easy Auth uses post_logout_redirect_uri parameter
                const logoutUrl = `${baseUrl}/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`;
                console.log('🔓 Redirecting to Easy Auth logout:', logoutUrl);
                res.redirect(logoutUrl);
            });
        } else {
            res.clearCookie('connect.sid', { path: '/', httpOnly: true });
            res.clearCookie('XSRF-TOKEN', { path: '/' });
            const logoutUrl = `${baseUrl}/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`;
            res.redirect(logoutUrl);
        }
        return;
    }
    
    // Regular Passport.js logout
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        if (req.session) {
            req.session.destroy(() => {
                res.clearCookie('connect.sid', { path: '/', httpOnly: true });
                res.clearCookie('XSRF-TOKEN', { path: '/' });
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.redirect('/');
            });
        } else {
            res.clearCookie('connect.sid', { path: '/', httpOnly: true });
            res.clearCookie('XSRF-TOKEN', { path: '/' });
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
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
// Note: In production with Easy Auth enabled, these routes are skipped

const { shouldUsePassportOAuth } = require('../../middleware/easy-auth');

router.get('/auth/google', (req, res, next) => {
    // Redirect to Azure Easy Auth if enabled in production
    if (!shouldUsePassportOAuth()) {
        const baseUrl = getRequestBaseUrl(req);
        const postLoginRedirect = req.query.post_login_redirect_url || '/feed';
        return res.redirect(`${baseUrl}/.auth/login/google?post_login_redirect_url=${encodeURIComponent(postLoginRedirect)}`);
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).send('Google OAuth not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'auth/login';
    req.session.oauthMode = mode;
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) {
            console.error('❌ [Google] Passport authentication error:', err);
            return res.redirect('/login');
        }
        
        if (!user) {
            console.warn('⚠️ [Google] No user returned from Passport');
            return res.redirect('/login');
        }
        
        // Set req.user for use in handleOAuthCallback
        req.user = user;
        req.authInfo = info;
        
        // Handle the OAuth callback logic - await to catch any errors
        try {
            await handleOAuthCallback(req, res, 'google');
        } catch (e) {
            console.error('❌ [Google] handleOAuthCallback error:', e);
            return res.redirect('/login');
        }
    })(req, res, next);
});

/**
 * Simplified OAuth callback handler
 */
async function handleOAuthCallback(req, res, provider) {
    try {
        const mode = req.session?.oauthMode || 'auth/login';
        
        // Account linking mode
        if (mode === 'link' && req.session?.userId && req.authInfo) {
            updateUserProvider({ 
                userId: req.session.userId, 
                provider: req.authInfo.provider, 
                providerId: req.authInfo.providerId 
            });
            if (req.authInfo.photoUrl) {
                const user = await getUserById(req.session.userId);
                await importProfilePhotoIfNeeded(user, req.authInfo.photoUrl);
            }
            return res.redirect(`/settings?success=${provider.charAt(0).toUpperCase() + provider.slice(1)} connected`);
        }
        
        // Login mode
        if (!req.user?.id) {
            console.warn(`⚠️ ${provider} callback: req.user not populated`);
            return res.redirect('/login');
        }
        
        // Establish session
        req.login(req.user, async (err) => {
            if (err) {
                console.error(`❌ ${provider} login error:`, err);
                return res.redirect('/login');
            }
            
            // Ensure email is verified for OAuth users
            const user = await getUserById(req.user.id);
            if (user && user.email_verified !== true && user.email_verified !== 1) {
                try {
                    markEmailAsVerified({ userId: user.id });
                    user.email_verified = 1;
                } catch (e) {
                    console.warn('Email verification failed:', e.message);
                }
            }
            
            // Save session and redirect
            req.session.userId = req.user.id;
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error(`❌ ${provider} session save error:`, saveErr);
                    return res.redirect('/login');
                }
                
                const redirectTarget = resolvePostAuthRedirect(user || req.user);
                console.log(`✅ ${provider} login successful, redirecting to ${redirectTarget}`);
                res.redirect(redirectTarget);
            });
        });
    } catch (e) {
        console.error(`❌ ${provider} callback error:`, e.message);
        res.redirect('/login');
    }
}

/**
 * Create OAuth route handlers (factory function to reduce duplication)
 */
function createOAuthRoutes(provider, easyAuthProvider = null) {
    const providerName = provider.toLowerCase();
    const easyAuthName = easyAuthProvider || providerName;
    
    // Login route
    router.get(`/auth/${providerName}`, (req, res, next) => {
        if (!shouldUsePassportOAuth()) {
            const baseUrl = getRequestBaseUrl(req);
            const postLoginRedirect = req.query.post_login_redirect_url || '/feed';
            return res.redirect(`${baseUrl}/.auth/login/${easyAuthName}?post_login_redirect_url=${encodeURIComponent(postLoginRedirect)}`);
        }
        
        // Check credentials (handle special cases)
        let clientId, clientSecret;
        if (providerName === 'x') {
            clientId = process.env.TWITTER_CLIENT_ID;
            clientSecret = process.env.TWITTER_CLIENT_SECRET;
        } else if (providerName === 'apple') {
            if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) {
                return res.status(503).json({ error: 'Apple Sign-In not configured' });
            }
        } else {
            clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
            clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
        }
        
        if ((!clientId || !clientSecret) && providerName !== 'apple') {
            return res.status(503).json({ error: `${provider} OAuth not configured` });
        }
        
        req.session.oauthMode = req.query.mode === 'link' ? 'link' : 'auth/login';
        const strategyName = providerName === 'x' ? 'twitter' : providerName;
        const scope = providerName === 'google' ? { scope: ['profile', 'email'] } : {};
        
        // Apple needs special callback URL handling
        if (providerName === 'apple') {
            const callbackURL = getCallbackURLFromRequest(req, '/auth/apple/callback');
            passport.authenticate('apple', { callbackURL })(req, res, next);
        } else {
            passport.authenticate(strategyName, scope)(req, res, next);
        }
    });
    
    // Callback route (Apple uses POST, others use GET)
    const callbackMethod = providerName === 'apple' ? 'post' : 'get';
    router[callbackMethod](`/auth/${providerName}/callback`, (req, res, next) => {
        if (req.query.error) {
            console.error(`❌ [${provider}] OAuth error:`, req.query.error);
            return res.redirect('/login?error=oauth_failed');
        }
        
        const strategyName = providerName === 'x' ? 'twitter' : providerName;
        passport.authenticate(strategyName, async (err, user, info) => {
            if (err) {
                console.error(`❌ [${provider}] Passport error:`, err);
                return res.redirect('/login');
            }
            if (!user) {
                console.warn(`⚠️ [${provider}] No user returned`);
                return res.redirect('/login');
            }
            req.user = user;
            req.authInfo = info;
            await handleOAuthCallback(req, res, providerName);
        })(req, res, next);
    });
}

// Create OAuth routes
createOAuthRoutes('google');
createOAuthRoutes('microsoft', 'aad');
createOAuthRoutes('apple');
// Azure Easy Auth provider name is "twitter" (not "x") for Twitter/X
createOAuthRoutes('x', 'twitter');

// Phone Verification Routes
router.get('/verify-phone', async (req, res) => {
    if (!req.session || !req.session.userId) return res.redirect('/login');
    const user = await getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    if (user.phone_verified === 1) return res.redirect(resolvePostAuthRedirect(user));
    
    const latestCode = getLatestPhoneVerificationCode(req.session.userId);
    if (!latestCode) {
        return res.redirect('/settings?error=No phone verification in progress');
    }

    res.render('auth/verify-phone', {
        title: 'Verify Your Phone - Dream X',
        currentPage: 'verify-phone',
        user,
        phoneNumber: latestCode.phone_number,
        error: null,
        success: null
    });
});

router.post('/verify-phone', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.phone_verified === 1) {
        return res.json({ success: true, redirect: resolvePostAuthRedirect(user) });
    }

    const { code } = req.body;
    if (!code || code.length !== 6) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 6-digit code' });
    }

    // Check rate limit for verification attempts: 10 per 15 minutes
    const verifyRateLimit = rateLimitService.checkRateLimit(user.id, 'phone_verification_attempt', {
        maxAttempts: 10,
        windowMinutes: 15
    });

    if (!verifyRateLimit.allowed) {
        rateLimitService.recordAttempt(user.id, 'phone_verification_attempt', {
            action: 'verify_code',
            blocked: true,
            ip: req.ip
        });
        return res.status(429).json({
            success: false,
            error: 'Too many verification attempts. Please try again later.',
            rateLimited: true,
            waitSeconds: verifyRateLimit.waitSeconds
        });
    }

    try {
        deleteExpiredPhoneVerificationCodes();
    } catch (e) {
        console.warn('Failed to cleanup phone codes:', e);
    }

    const verificationRecord = getPhoneVerificationCode({ userId: user.id, code });
    if (!verificationRecord) {
        rateLimitService.recordAttempt(user.id, 'phone_verification_attempt', {
            action: 'verify_code',
            result: 'invalid_code',
            ip: req.ip
        });
        return res.status(400).json({ success: false, error: 'Invalid or expired code. Please try again.' });
    }

    const now = new Date();
    const expiresAt = new Date(verificationRecord.expires_at);
    if (now > expiresAt) {
        rateLimitService.recordAttempt(user.id, 'phone_verification_attempt', {
            action: 'verify_code',
            result: 'expired_code',
            ip: req.ip
        });
        return res.status(400).json({ success: false, error: 'Code expired. Request a new one.' });
    }

    try {
        markPhoneCodeAsVerified(verificationRecord.id);
        markPhoneAsVerified({ userId: user.id, phoneNumber: verificationRecord.phone_number });
        console.log(`✅ Phone verified for user ${user.id} (${verificationRecord.phone_number})`);
        
        const updatedUser = { ...user, phone_verified: 1 };
        return res.json({ success: true, redirect: resolvePostAuthRedirect(updatedUser) });
    } catch (err) {
        console.error('Phone verification error:', err);
        return res.status(500).json({ success: false, error: 'Failed to verify phone. Please try again.' });
    }
});

router.post('/resend-phone-code', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await getUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }

    try {
        // Check rate limit: 3 attempts per 60 minutes
        const rateLimit = rateLimitService.checkRateLimit(user.id, 'phone_verification', {
            maxAttempts: 3,
            windowMinutes: 60
        });

        if (!rateLimit.allowed) {
            // Log the rate limit attempt
            rateLimitService.recordAttempt(user.id, 'phone_verification', {
                action: 'resend_code',
                blocked: true,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            return res.json({
                success: false,
                rateLimited: true,
                error: 'Too many SMS attempts. Please try again later.',
                remaining: rateLimit.remaining,
                waitSeconds: rateLimit.waitSeconds,
                resetAt: rateLimit.resetAt
            });
        }

        const latestCode = getLatestPhoneVerificationCode(user.id);
        if (!latestCode) {
            return res.status(400).json({ success: false, error: 'No phone verification found' });
        }

        const phoneCode = Math.floor(100000 + Math.random() * 900000).toString();
        const phoneExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        
        createPhoneVerificationCode({
            userId: user.id,
            phoneNumber: latestCode.phone_number,
            code: phoneCode,
            expiresAt: phoneExpiresAt
        });

        // Record the successful attempt
        rateLimitService.recordAttempt(user.id, 'phone_verification', {
            action: 'resend_code',
            phone: latestCode.phone_number,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Send SMS if Twilio is configured
        if (phoneService.isConfigured()) {
            const smsResult = await phoneService.sendOTPMessage(latestCode.phone_number, phoneCode);
            if (smsResult.success) {
                return res.json({ success: true, message: 'Verification code sent to your phone' });
            }
        }

        return res.json({ success: true, message: 'Verification code has been sent' });
    } catch (err) {
        console.error('Resend phone code error:', err);
        return res.status(500).json({ success: false, error: 'Failed to resend code' });
    }
});

// Handle Azure Easy Auth callback redirects
// NOTE: This route ONLY handles callbacks (/.auth/login/{provider}/callback)
// Azure handles the login endpoints (/.auth/login/{provider}) directly - do NOT intercept those!
// Azure redirects to /.auth/login/{provider}/callback after authentication
// We need to process Easy Auth headers and redirect to post_login_redirect_url
router.get('/.auth/login/:provider/callback', async (req, res) => {
    const { provider } = req.params;
    const postLoginRedirect = req.query.post_login_redirect_url || req.query.redirect || '/feed';
    
    // Easy Auth middleware should have already processed the headers and set req.user
    // If user is authenticated, redirect to the intended destination
    if (req.user && req.session && req.session.userId) {
        const redirectTarget = resolvePostAuthRedirect(req.user) || postLoginRedirect;
        console.log(`✅ Easy Auth callback for ${provider}, redirecting to: ${redirectTarget}`);
        return res.redirect(redirectTarget);
    }
    
    // If not authenticated, redirect to login
    console.warn(`⚠️ Easy Auth callback for ${provider} but user not authenticated`);
    return res.redirect('/login');
});

// IMPORTANT: Do NOT add routes for /.auth/login/{provider} (without /callback)
// Those are Azure's endpoints and must be handled by Azure Easy Auth.
// If you see 503 on /.auth/login/x, it means Twitter/X isn't configured in Azure Portal.

module.exports = router;




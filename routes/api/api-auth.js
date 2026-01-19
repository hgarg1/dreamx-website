const express = require('express');
// const cors = require('cors'); // Not needed for Android native apps (CORS is browser-only)
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const {
    getUserById,
    getUserByEmail,
    getUserByHandle,
    createUser,
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
    storeRefreshToken,
    getRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    cleanupExpiredTokens
} = require('../../db');
const emailService = require('../../services/emailService');
const { generateAccessToken, generateRefreshToken, hashRefreshToken, verifyAccessToken, getRefreshTokenExpiry } = require('../../utils/auth-tokens');
const { getRequestBaseUrl, validatePasswordComplexity } = require('../../utils/route-helpers');
const { generateCsrfToken, csrfExempt } = require('../../middleware/security');

const router = express.Router();

// CORS not needed for Android native apps (CORS is a browser security feature)
// Uncomment below if you need to test from a web browser or enable for web clients:
/*
const corsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    maxAge: 86400
};
router.use(cors(corsOptions));
router.options('*', cors(corsOptions));
*/

// Helper function to generate base handle
function generateBaseHandle(fullName, email) {
    if (fullName) {
        return fullName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    if (email) {
        return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    }
    return 'user';
}

async function generateUniqueHandle(baseHandle, excludeUserId = null) {
    let handle = baseHandle;
    let counter = 0;
    while (true) {
        const existing = await getUserByHandle(handle);
        if (!existing || (excludeUserId && existing.id === excludeUserId)) {
            return handle;
        }
        counter++;
        handle = `${baseHandle}${counter}`;
    }
}

// Helper function to format user data for API response
function formatUserData(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        handle: user.handle || user.email.split('@')[0],
        profilePicture: user.profile_picture || null,
        bannerImage: user.banner_image || null,
        bio: user.bio || null,
        emailVerified: user.email_verified === 1,
        accountStatus: user.account_status || 'active',
        role: user.role || 'user',
        createdAt: user.created_at
    };
}

// Standard API response helper
function sendResponse(res, success, data = null, error = null, statusCode = 200) {
    const response = { success };
    if (data !== null) response.data = data;
    if (error !== null) response.error = error;
    return res.status(statusCode).json(response);
}

// Token authentication middleware
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return sendResponse(res, false, null, 'Access token required', 401);
    }

    const verification = verifyAccessToken(token);
    if (!verification.valid) {
        return sendResponse(res, false, null, 'Invalid or expired token', 401);
    }

    const user = await getUserById(verification.userId);
    if (!user) {
        return sendResponse(res, false, null, 'User not found', 404);
    }

    // Check account status
    const accountStatus = checkAccountStatus(user.id);
    if (accountStatus.status === 'banned' || accountStatus.status === 'suspended') {
        return sendResponse(res, false, null, `Account ${accountStatus.status}`, 403);
    }

    req.user = user;
    req.userId = user.id;
    next();
}

// POST /api/auth/login
router.post('/api/auth/login', express.json(), async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendResponse(res, false, null, 'Email and password are required', 400);
        }

        const user = await getUserByEmail(email.trim().toLowerCase());
        if (!user) {
            return sendResponse(res, false, null, 'Invalid credentials', 401);
        }

        // Validate that both password and password_hash are present
        // OAuth-only users may not have a password_hash set
        if (!password || !user.password_hash) {
            return sendResponse(res, false, null, 'This account does not have a password set. Please use your social login option instead.', 401);
        }

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return sendResponse(res, false, null, 'Invalid credentials', 401);
        }

        // Check account status
        const accountStatus = checkAccountStatus(user.id);
        if (accountStatus.status === 'banned') {
            return sendResponse(res, false, null, 'Account is banned', 403);
        }
        if (accountStatus.status === 'suspended') {
            return sendResponse(res, false, null, `Account is suspended until ${accountStatus.suspendedUntil}`, 403);
        }

        // Generate tokens
        const accessToken = generateAccessToken(user.id);
        const refreshToken = generateRefreshToken();
        const tokenHash = hashRefreshToken(refreshToken);
        const expiresAt = getRefreshTokenExpiry();

        // Store refresh token
        const deviceInfo = req.headers['user-agent'] || 'Unknown device';
        storeRefreshToken({
            userId: user.id,
            tokenHash,
            expiresAt,
            deviceInfo
        });

        // Cleanup expired tokens periodically
        try {
            cleanupExpiredTokens();
        } catch (e) {
            // Ignore cleanup errors
        }

        return sendResponse(res, true, {
            accessToken,
            refreshToken,
            user: formatUserData(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/refresh
router.post('/api/auth/refresh', express.json(), async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendResponse(res, false, null, 'Refresh token is required', 400);
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const tokenRecord = getRefreshToken({ tokenHash });

        if (!tokenRecord) {
            return sendResponse(res, false, null, 'Invalid refresh token', 401);
        }

        // Check if token is expired
        if (new Date(tokenRecord.expires_at) < new Date()) {
            return sendResponse(res, false, null, 'Refresh token expired', 401);
        }

        // Check if token is revoked
        if (tokenRecord.revoked === 1) {
            return sendResponse(res, false, null, 'Refresh token revoked', 401);
        }

        // Get user
        const user = await getUserById(tokenRecord.user_id);
        if (!user) {
            return sendResponse(res, false, null, 'User not found', 404);
        }

        // Check account status
        const accountStatus = checkAccountStatus(user.id);
        if (accountStatus.status === 'banned' || accountStatus.status === 'suspended') {
            // Revoke token if account is banned/suspended
            revokeRefreshToken({ tokenHash });
            return sendResponse(res, false, null, `Account ${accountStatus.status}`, 403);
        }

        // Generate new access token
        const accessToken = generateAccessToken(user.id);

        // Optionally rotate refresh token (generate new one and revoke old)
        // For now, we'll just return a new access token
        // Uncomment below to enable refresh token rotation:
        /*
        const newRefreshToken = generateRefreshToken();
        const newTokenHash = hashRefreshToken(newRefreshToken);
        const expiresAt = getRefreshTokenExpiry();
        storeRefreshToken({
            userId: user.id,
            tokenHash: newTokenHash,
            expiresAt,
            deviceInfo: tokenRecord.device_info
        });
        revokeRefreshToken({ tokenHash });
        */

        return sendResponse(res, true, {
            accessToken
            // Uncomment if using token rotation:
            // refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// GET /api/auth/me
router.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await getUserById(req.userId);
        if (!user) {
            return sendResponse(res, false, null, 'User not found', 404);
        }

        return sendResponse(res, true, {
            user: formatUserData(user)
        });
    } catch (error) {
        console.error('Get current user error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/logout
router.post('/api/auth/logout', express.json(), async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            const tokenHash = hashRefreshToken(refreshToken);
            revokeRefreshToken({ tokenHash });
        }

        return sendResponse(res, true, { message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/logout-all
router.post('/api/auth/logout-all', authenticateToken, async (req, res) => {
    try {
        revokeAllUserTokens({ userId: req.userId });
        return sendResponse(res, true, { message: 'Logged out from all devices' });
    } catch (error) {
        console.error('Logout all error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/register
router.post('/api/auth/register', express.json(), async (req, res) => {
    try {
        const { fullName, email, password, handle } = req.body;

        if (!fullName || !email || !password) {
            return sendResponse(res, false, null, 'Full name, email, and password are required', 400);
        }

        // Validate password complexity
        const complexityCheck = validatePasswordComplexity(password);
        if (!complexityCheck.valid) {
            return sendResponse(res, false, null, `Password must contain ${complexityCheck.errors.join(', ')}`, 400);
        }

        // Check if email already exists
        const existing = await getUserByEmail(email.trim().toLowerCase());
        if (existing) {
            return sendResponse(res, false, null, 'Email already in use', 400);
        }

        // Handle validation
        let userHandle = handle ? handle.trim().toLowerCase() : '';
        if (!userHandle) {
            const baseHandle = generateBaseHandle(fullName, email);
            userHandle = await generateUniqueHandle(baseHandle);
        } else {
            if (!/^[a-z0-9_]{3,20}$/.test(userHandle)) {
                return sendResponse(res, false, null, 'Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores', 400);
            }
            const handleExists = await getUserByHandle(userHandle);
            if (handleExists) {
                return sendResponse(res, false, null, `Handle "@${userHandle}" is already taken`, 400);
            }
        }

        // Create user
        const hash = await bcrypt.hash(password, 10);
        const userId = createUser({
            fullName,
            email: email.trim().toLowerCase(),
            passwordHash: hash,
            handle: userHandle
        });

        // Initialize free subscription
        try {
            createOrUpdateSubscription({ userId, tier: 'free', status: 'active' });
        } catch (subErr) {
            console.warn('Failed to initialize free subscription for user', userId, subErr.message);
        }

        // Create verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        createVerificationCode({
            userId,
            email: email.trim().toLowerCase(),
            code: verificationCode,
            expiresAt
        });

        // Send verification email
        const user = await getUserById(userId);
        try {
            await emailService.sendVerificationCode(user, verificationCode, req);
            console.log(`✅ Verification email sent to ${user.email}`);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr);
        }

        // Generate tokens for immediate login
        const accessToken = generateAccessToken(userId);
        const refreshToken = generateRefreshToken();
        const tokenHash = hashRefreshToken(refreshToken);
        const tokenExpiresAt = getRefreshTokenExpiry();
        const deviceInfo = req.headers['user-agent'] || 'Unknown device';
        storeRefreshToken({
            userId,
            tokenHash,
            expiresAt: tokenExpiresAt,
            deviceInfo
        });

        return sendResponse(res, true, {
            accessToken,
            refreshToken,
            user: formatUserData(user),
            message: 'Registration successful. Please verify your email.'
        }, null, 201);
    } catch (error) {
        console.error('Registration error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/forgot-password
router.post('/api/auth/forgot-password', express.json(), async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return sendResponse(res, false, null, 'Email is required', 400);
        }

        const baseUrl = getRequestBaseUrl(req);
        const user = await getUserByEmail(email.trim().toLowerCase());

        // Always return success message (security: don't reveal if email exists)
        if (!user) {
            return sendResponse(res, true, {
                message: 'If an account exists for that email, we\'ve sent reset instructions to your inbox.'
            });
        }

        try {
            deleteExpiredPasswordResetTokens();
        } catch (err) {
            console.error('Failed to cleanup reset tokens:', err.message);
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
            await emailService.sendPasswordReset(user, resetLink, req);
        } catch (err) {
            console.error('Failed to start password reset:', err);
        }

        return sendResponse(res, true, {
            message: 'If an account exists for that email, we\'ve sent reset instructions to your inbox.'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/reset-password
router.post('/api/auth/reset-password', express.json(), async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (!token || !password || !confirmPassword) {
            return sendResponse(res, false, null, 'Token, password, and confirm password are required', 400);
        }

        if (password !== confirmPassword) {
            return sendResponse(res, false, null, 'Passwords do not match', 400);
        }

        if (password.length < 8) {
            return sendResponse(res, false, null, 'Password must be at least 8 characters long', 400);
        }

        // Validate password complexity
        const complexityCheck = validatePasswordComplexity(password);
        if (!complexityCheck.valid) {
            return sendResponse(res, false, null, `Password must contain ${complexityCheck.errors.join(', ')}`, 400);
        }

        deleteExpiredPasswordResetTokens();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const record = getPasswordResetToken({ tokenHash });

        if (!record || record.used || new Date(record.expires_at) < new Date()) {
            return sendResponse(res, false, null, 'Invalid or expired reset token', 400);
        }

        const user = await getUserById(record.user_id);
        if (!user) {
            markPasswordResetUsed({ id: record.id });
            return sendResponse(res, false, null, 'User not found', 404);
        }

        const passwordHash = await bcrypt.hash(password, 10);
        updatePassword({ userId: user.id, passwordHash });
        markPasswordResetUsed({ id: record.id });
        invalidateUserResetTokens({ userId: user.id });

        return sendResponse(res, true, {
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/verify-email
router.post('/api/auth/verify-email', authenticateToken, express.json(), async (req, res) => {
    try {
        const { code } = req.body;
        const user = await getUserById(req.userId);

        if (!user) {
            return sendResponse(res, false, null, 'User not found', 404);
        }

        if (user.email_verified === 1) {
            return sendResponse(res, true, {
                message: 'Email already verified',
                verified: true
            });
        }

        if (!code || code.length !== 6) {
            return sendResponse(res, false, null, 'Please enter a valid 6-digit code', 400);
        }

        try {
            deleteExpiredVerificationCodes();
        } catch (e) {
            // Ignore
        }

        const verificationRecord = getVerificationCode({ userId: user.id, code });
        if (!verificationRecord) {
            return sendResponse(res, false, null, 'Invalid or expired code. Please try again.', 400);
        }

        const now = new Date();
        const expiresAt = new Date(verificationRecord.expires_at);
        if (now > expiresAt) {
            return sendResponse(res, false, null, 'Code expired. Request a new one.', 400);
        }

        markCodeAsVerified({ id: verificationRecord.id });
        markEmailAsVerified({ userId: user.id });

        console.log(`✅ Email verified for user ${user.id} (${user.email})`);

        return sendResponse(res, true, {
            message: 'Email verified successfully',
            verified: true,
            user: formatUserData(await getUserById(user.id))
        });
    } catch (error) {
        console.error('Verify email error:', error);
        return sendResponse(res, false, null, 'Internal server error', 500);
    }
});

// POST /api/auth/resend-verification
router.post('/api/auth/resend-verification', authenticateToken, express.json(), async (req, res) => {
    try {
        const user = await getUserById(req.userId);

        if (!user) {
            return sendResponse(res, false, null, 'User not found', 404);
        }

        if (user.email_verified === 1) {
            return sendResponse(res, true, {
                message: 'Email already verified'
            });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        createVerificationCode({
            userId: user.id,
            email: user.email,
            code: verificationCode,
            expiresAt
        });

        await emailService.sendVerificationCode(user, verificationCode, req);

        return sendResponse(res, true, {
            message: 'New verification code sent!'
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        return sendResponse(res, false, null, 'Failed to send email. Please try again.', 500);
    }
});

// GET /api/csrf-token - Fetch CSRF token for Android app on startup
router.get('/api/csrf-token', csrfExempt, (req, res) => {
    try {
        // Generate and store token in session if not already present
        if (!req.session.csrfToken) {
            req.session.csrfToken = generateCsrfToken();
        }
        
        const token = req.session.csrfToken;
        
        // Save session to ensure token persists
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return sendResponse(res, false, null, 'Failed to save session', 500);
            }
            
            // Return token in both response body and header
            res.setHeader('X-CSRF-Token', token);
            return sendResponse(res, true, { csrfToken: token });
        });
    } catch (error) {
        console.error('Error generating CSRF token:', error);
        return sendResponse(res, false, null, 'Failed to generate CSRF token', 500);
    }
});

// Export router and middleware for use in other routes
const apiAuthRouter = router;
apiAuthRouter.authenticateToken = authenticateToken;
module.exports = apiAuthRouter;


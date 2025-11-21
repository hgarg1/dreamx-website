// Import required modules
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const AppleStrategy = require('passport-apple');
const crypto = require('crypto');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const http = require('http');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const socketIo = require('socket.io');
let webpush;

// Import email service
const emailService = require('./services/emailService');

// Import payment service
const paymentService = require('./services/payments');

const { 
    db, getUserById, getUserByEmail, getUserByHandle, getUserByProvider, createUser, updateUserProvider, updateOnboarding, updateUserProfile,
    updateProfilePicture, updateBannerImage, updatePassword, updateUserHandle, updateNotificationSettings, getLinkedAccountsForUser, unlinkProvider,
    getOrCreateConversation, getUserConversations, getConversationMessages, getMessageWithContext,
    createMessage, markMessagesAsRead, getUnreadMessageCount,
    updateUserRole, updateAdminPermissions, getAllUsers, getStats,
    // New admin helpers
    getUsersPaged, getUsersCount, searchUsers,
    // Audit logs
    addAuditLog, getAuditLogsPaged, getAuditLogCount,
    // Email Verification
    createVerificationCode, getVerificationCode, markCodeAsVerified, markEmailAsVerified, deleteExpiredVerificationCodes,
    // Password resets
    createPasswordResetToken, getPasswordResetToken, markPasswordResetUsed, deleteExpiredPasswordResetTokens, invalidateUserResetTokens,
    // Posts
    createPost, getFeedPosts, getUserPosts,
    // Post reactions & comments
    setPostReaction, getPostReactionsSummary, getUserReactionForPost,
    addPostComment, getPostComments, getCommentsCount, toggleCommentLike,
    // WebAuthn
    addWebAuthnCredential, getCredentialsForUser, getCredentialById, updateCredentialCounter,
    // Groups
    createGroupConversation, getConversationParticipants, isUserInConversation,
    // Notifications
    createNotification, getUserNotifications, getUnreadNotificationCount,
    markNotificationAsRead, markAllNotificationsAsRead, deleteNotification,
    savePushSubscription, getPushSubscriptions, deletePushSubscription,
    // Subscriptions
    getUserSubscription, createOrUpdateSubscription, cancelSubscription,
    addPaymentMethod, getPaymentMethods, deletePaymentMethod, setDefaultPaymentMethod,
    createInvoice, getInvoices,
    getPaymentCustomer, createPaymentCustomer, getAllPaymentCustomers,
    updatePrivacySettings,
    // Follow system
    followUser, unfollowUser, isFollowing, getFollowerCount, getFollowingCount, getFollowers, getFollowing,
    // Account moderation
    banUser, suspendUser, unbanUser, checkAccountStatus,
    // Recent activity
    getRecentActivity,
    // Comment moderation
    hideComment, deleteComment, restoreComment,
    // Suggested users
    getSuggestedUsers,
    // Message reactions
    setMessageReaction, getMessageReactions, getUserReactionForMessage,
    // Comment parent info
    getCommentWithParent,
    // Services
    createService, getUserServices, getAllServices, getService, getServiceCount, updateService, deleteService,
    getServiceReviews, addOrUpdateServiceReview, isVerifiedPurchaser, getServiceRatingsSummary,
    hideServiceReview, deleteServiceReview, restoreServiceReview,
    // User blocks and reports
    blockUser, unblockUser, isUserBlocked, getBlockedUsers,
    reportUser, getUserReports, updateReportStatus,
    lockUserBlockFunctionality, unlockUserBlockFunctionality, getUserModerationStatus, getAllBlocksAndReports,
    // Billing & Refunds
    getUserCharges, createRefundRequest, getRefundRequest, getUserRefundRequests, updateRefundRequestStatus,
    // Admin notes
    addUserAdminNote, getUserAdminNotes,
    // User locations for MapBox
    saveUserLocation, getUserLocation, getAllUserLocations, shouldUpdateLocation
 } = require('./db');
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    // Node 18+ has global fetch; fallback
    fetch = global.fetch;
}

// Optional: configure Web Push if VAPID keys are provided
try {
    webpush = require('web-push');
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT,
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } else {
        webpush = null;
        console.warn('Web Push not configured (missing VAPID env vars).');
    }
} catch (e) {
    console.warn('web-push not installed or failed to load:', e.message);
    webpush = null;
}

// Helper to generate full callback URL for OAuth
function getCallbackURL(path) {
    // Use BASE_URL if explicitly set, otherwise detect environment
    if (process.env.BASE_URL) {
        return `${process.env.BASE_URL}${path}`;
    }
    
    // Auto-detect: use localhost in development, production URL otherwise
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const baseUrl = isDevelopment ? 'http://localhost:3000' : 'https://dreamx-website.onrender.com';
    return `${baseUrl}${path}`;
}

// Resolve the best-effort base URL for links sent to users (prefers the request host)
function getRequestBaseUrl(req) {
    const configuredBaseUrl = (process.env.BASE_URL || '').trim();
    if (configuredBaseUrl) return configuredBaseUrl;

    const host = req?.get ? req.get('host') : req?.headers?.host;
    if (!host) return 'http://localhost:3000';

    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    const protocol = (forwardedProto ? forwardedProto.split(',')[0].trim() : req?.protocol) || 'http';

    return `${protocol}://${host}`;
}

// Initialize Express app
const app = express();
// Trust proxy headers (needed on Render/other proxies for correct host/proto)
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.BASE_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true
});
const PORT = 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads', 'profiles'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile/banner images
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

// Separate multer for chat attachments (modest size, broader types)
const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads', 'chat'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for chat
  fileFilter: (req, file, cb) => {
    const m = (file.mimetype || '').toLowerCase();
    if (m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/') || m === 'application/pdf' || m === 'text/plain') {
      return cb(null, true);
    }
    cb(new Error('Unsupported file type for chat'));
  }
});

// Refund request uploads (screenshots/receipts - images only)
const refundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'uploads', 'refunds');
        try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'refund-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const refundUpload = multer({
    storage: refundStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for screenshots
    fileFilter: (req, file, cb) => {
        if ((file.mimetype || '').toLowerCase().startsWith('image/')) return cb(null, true);
        return cb(new Error('Only image files are allowed for screenshots'));
    }
});

// Posts/media uploads (supports images for image posts, videos/GIFs for reels)
const postStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads', 'posts'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'post-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const postUpload = multer({
    storage: postStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        if (m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/')) return cb(null, true);
        cb(new Error('Unsupported media type for post'));
    }
});

// Career application uploads (resume/portfolio)
const careerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads', 'careers'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'career-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const careerUpload = multer({
    storage: careerStorage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/x-zip-compressed',
            'image/png','image/jpeg','image/jpg','image/webp'
        ];
        if (allowed.includes(m)) return cb(null, true);
        cb(new Error('Unsupported file type for application'));
    }
});

// Service uploads (images, videos, documents for service listings)
const serviceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads', 'services'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'service-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const serviceUpload = multer({
    storage: serviceStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for service media
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        const allowed = [
            // Images
            'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
            // Videos
            'video/mp4', 'video/webm', 'video/quicktime',
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];
        if (allowed.includes(m)) return cb(null, true);
        cb(new Error('Unsupported file type for service'));
    }
});

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve the SimpleWebAuthn browser bundle directly from node_modules
const simpleWebAuthnBundlePath = path.join(
    __dirname,
    'node_modules',
    '@simplewebauthn',
    'browser',
    'dist',
    'bundle'
);
app.use('/webauthn', express.static(simpleWebAuthnBundlePath));

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration (SQLiteStore for production safety)
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite3' }),
    secret: process.env.SESSION_SECRET || 'your secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        // Secure cookies in production or when BASE_URL is https
        secure: (process.env.NODE_ENV === 'production') || (process.env.BASE_URL || '').startsWith('https://'),
        sameSite: 'lax'
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Minimal serialize/deserialize (not strictly used since we set req.session.userId)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    try {
        const user = getUserById(id);
        done(null, user || null);
    } catch (e) {
        done(e);
    }
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// Helper: send browser push notifications (if configured)
async function sendBrowserPush(userId, title, body, url) {
    try {
        if (!webpush) return; // Not configured
        const user = getUserById(userId);
        if (!user || user.push_notifications !== 1) return;
        const subs = getPushSubscriptions(userId) || [];
        const payload = JSON.stringify({ title: title || 'Dream X', body: body || '', url: url || '/', icon: '/img/icon-192x192.png', badge: '/img/badge-72x72.png' });
        for (const s of subs) {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
            } catch (err) {
                const status = err?.statusCode || err?.statusCode === 0 ? err.statusCode : err?.statusCode;
                if (status === 404 || status === 410) {
                    try { deletePushSubscription(s.endpoint); } catch (_) {}
                } else {
                    console.warn('Web push send error:', err.message);
                }
            }
        }
    } catch (e) {
        console.warn('sendBrowserPush error:', e.message);
    }
}

// Expose VAPID public key to clients (for subscription)
app.get('/api/push/public-key', (req, res) => {
    res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

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

// Generate a base handle from full name or email
function generateBaseHandle(fullName, email) {
    // Try full name first
    if (fullName) {
        return fullName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);
    }
    // Fallback to email username
    if (email) {
        return email.split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);
    }
    return 'user';
}

// Generate unique handle with collision resolution
function generateUniqueHandle(baseHandle, excludeUserId = null) {
    let handle = baseHandle;
    let counter = 0;
    
    while (true) {
        const existing = getUserByHandle(handle);
        // Handle is available if it doesn't exist or belongs to the current user
        if (!existing || (excludeUserId && existing.id === excludeUserId)) {
            return handle;
        }
        // Try with incrementing number
        counter++;
        handle = `${baseHandle}${counter}`;
    }
}

// Get suggested handles when collision occurs
function getSuggestedHandles(baseHandle, count = 3) {
    const suggestions = [];
    const random = () => Math.floor(Math.random() * 999);
    
    // Suggestion 1: base + random number
    suggestions.push(generateUniqueHandle(`${baseHandle}${random()}`));
    
    // Suggestion 2: base + underscore + random number
    suggestions.push(generateUniqueHandle(`${baseHandle}_${random()}`));
    
    // Suggestion 3: base + sequential number
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

// Helper to find or create a user from OAuth profile
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
        const res = await fetch(photoUrl);
        if (!res || !res.ok) return;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const uploadsDir = path.join(__dirname, 'public', 'uploads', 'profiles');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const ext = (photoUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ext.length <= 5 ? ext : 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        updateProfilePicture({ userId: user.id, filename: `profiles/${filename}` });
    } catch (e) {
        console.warn('Profile photo import failed:', e.message);
    }
}

async function importBinaryPhotoIfNeeded(user, buffer, extHint) {
    try {
        if (!buffer || !user || user.profile_picture) return;
        const uploadsDir = path.join(__dirname, 'public', 'uploads', 'profiles');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const safeExt = (extHint && extHint.length <= 5 ? extHint : 'jpg') || 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        updateProfilePicture({ userId: user.id, filename: `profiles/${filename}` });
    } catch (e) {
        console.warn('Binary photo import failed:', e.message);
    }
}

// Google OAuth
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        passReqToCallback: true,
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || getCallbackURL('/auth/google/callback')
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : null;
            const photoUrl = Array.isArray(profile.photos) && profile.photos[0] ? profile.photos[0].value : null;
            const user = await findOrCreateOAuthUser({ provider: 'google', providerId: profile.id, displayName: profile.displayName, email });
            await importProfilePhotoIfNeeded(user, photoUrl);
            done(null, user, { provider: 'google', providerId: profile.id, photoUrl });
        } catch (e) { done(e); }
    }));
} else {
    console.warn('Google OAuth not configured');
}

// Microsoft OAuth
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use(new MicrosoftStrategy({
        passReqToCallback: true,
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || getCallbackURL('/auth/microsoft/callback'),
        scope: ['openid', 'profile', 'email', 'User.Read']
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : (profile._json && (profile._json.mail || profile._json.userPrincipalName)) || null;
            const name = profile.displayName || (profile.name && ((profile.name.givenName || '') + ' ' + (profile.name.familyName || '')).trim()) || email;
            const user = await findOrCreateOAuthUser({ provider: 'microsoft', providerId: profile.id, displayName: name, email });
            // Try to fetch Graph profile photo (binary)
            try {
                if (accessToken && !user.profile_picture) {
                    const resp = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', { headers: { Authorization: `Bearer ${accessToken}` } });
                    if (resp && resp.ok) {
                        const arrayBuffer = await resp.arrayBuffer();
                        await importBinaryPhotoIfNeeded(user, Buffer.from(arrayBuffer), 'jpg');
                    }
                }
            } catch (e) { /* ignore photo errors */ }
            done(null, user, { provider: 'microsoft', providerId: profile.id, photoUrl: null });
        } catch (e) { done(e); }
    }));
} else {
    console.warn('Microsoft OAuth not configured');
}

// Apple Sign-In
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    passport.use(new AppleStrategy({
        passReqToCallback: true,
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        callbackURL: process.env.APPLE_CALLBACK_URL || getCallbackURL('/auth/apple/callback'),
        privateKeyString: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scope: ['name', 'email']
    }, async (req, accessToken, refreshToken, idToken, profile, done) => {
        try {
            const email = profile && profile.email ? profile.email : null;
            const name = profile && profile.name ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim() : email;
            const user = await findOrCreateOAuthUser({ provider: 'apple', providerId: profile.id, displayName: name, email });
            done(null, user, { provider: 'apple', providerId: profile.id, photoUrl: null });
        } catch (e) { done(e); }
    }));
} else {
    console.warn('Apple Sign-In not configured');
}

// Seed a default super admin if missing
(async () => {
    try {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@dreamx.local';
        const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin!123';
        const existing = getUserByEmail(adminEmail);
        if (!existing) {
            const hash = await bcrypt.hash(adminPass, 10);
            const id = createUser({ fullName: 'Super Admin', email: adminEmail, passwordHash: hash });
            updateUserRole({ userId: id, role: 'super_admin' });
            // Ensure seeded super admin is verified
            try { markEmailAsVerified({ userId: id }); } catch(_) {}
            console.log(`Seeded super admin: ${adminEmail} / ${adminPass}`);
        } else if (String(process.env.DEFAULT_ADMIN_FORCE_RESET || '').toLowerCase() === 'true') {
            // Optional: force reset password for existing default admin
            const newPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin!123';
            const hash = await bcrypt.hash(newPass, 10);
            db.prepare(`UPDATE users SET password_hash = ? WHERE email = ?`).run(hash, adminEmail);
            console.log(`Reset super admin password for ${adminEmail}`);
            // Ensure existing super admin is verified
            try { markEmailAsVerified({ userId: existing.id }); } catch(_) {}
        }
        // Auto-verify any global admin accounts (prevent lockout)
        try {
            const globalAdmins = db.prepare('SELECT id, email_verified FROM users WHERE role = ?').all('global_admin');
            for (const ga of globalAdmins) {
                if (ga.email_verified !== 1) {
                    markEmailAsVerified({ userId: ga.id });
                }
            }
        } catch(e) {
            console.warn('Global admin verification scan failed:', e.message);
        }
    } catch (e) {
        console.warn('Admin seed failed:', e.message);
    }
})();

// Initialize payment processors
(async () => {
    try {
        console.log('🔧 Initializing payment processors...');
        paymentService.initializeAll();
        const configured = paymentService.getConfiguredProviders();
        if (configured.length > 0) {
            console.log(`✅ Payment processors ready: ${configured.join(', ')}`);
        } else {
            console.log('⚠️  No payment processors configured (running in mock mode)');
        }
    } catch (e) {
        console.warn('Payment service initialization warning:', e.message);
    }
})();

// Attach auth context to templates
app.use((req, res, next) => {
    let user = null;
    let unreadCount = 0;
    
    // Debug logging for session status
    const isServicesOrFeed = req.path === '/services' || req.path === '/feed';
    if (isServicesOrFeed) {
        console.log(`📍 ${req.path} - Session ID:`, req.sessionID);
        console.log(`📍 ${req.path} - req.session.userId:`, req.session.userId);
        console.log(`📍 ${req.path} - req.user:`, req.user ? req.user.id : 'none');
        console.log(`📍 ${req.path} - Session cookie:`, req.headers.cookie);
    }
    
    if (req.session.userId) {
        const row = getUserById(req.session.userId);
        if (row) {
            // Check account status - invalidate session if banned/suspended
            const accountStatus = checkAccountStatus(row.id);
            if (accountStatus.status === 'banned' || accountStatus.status === 'suspended') {
                req.session.destroy(() => {
                    return res.redirect(`/account-status?userId=${row.id}`);
                });
                return;
            }
            user = {
                ...row,
                displayName: row.full_name
            };
            unreadCount = getUnreadMessageCount(req.session.userId);
        }
    }
    res.locals.authUser = user;
    res.locals.unreadMessageCount = unreadCount;
    next();
});

// Force email verification for authenticated users
app.use((req, res, next) => {
    try {
        if (!req.session.userId) return next();
        const user = getUserById(req.session.userId);
        if (!user) return next();
        if (user.email_verified === 1) return next();

        // Allowlist: verification flow, logout, auth, static assets, and essential files
        const p = req.path || '';
        const isStatic = p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/img/') || p.startsWith('/uploads/') || p.startsWith('/fonts/') || p === '/favicon.ico' || p === '/robots.txt' || p.startsWith('/manifest') || p.startsWith('/service-worker');
        const allowedExact = new Set(['/verify-email', '/resend-verification', '/logout', '/api/push/public-key']);
        const isAuthPath = p === '/login' || p === '/register' || p.startsWith('/auth/') || p.startsWith('/webauthn/');
        if (isStatic || allowedExact.has(p) || isAuthPath) return next();

        if (p.startsWith('/api/')) {
            return res.status(403).json({ error: 'Email verification required', redirect: '/verify-email' });
        }
        return res.redirect('/verify-email');
    } catch (e) {
        return next();
    }
});

const userNeedsOnboarding = (user) => {
    if (!user) return false;
    if (user.needs_onboarding !== undefined && user.needs_onboarding !== null) {
        return Number(user.needs_onboarding) === 1;
    }
    return Number(user.onboarding_completed) !== 1;
};

// After verification: gently prompt onboarding if not completed (once per session)
app.use((req, res, next) => {
    try {
        if (!req.session || !req.session.userId) return next();
        const user = getUserById(req.session.userId);
        if (!user) return next();
        // Only prompt if email is verified but onboarding not completed
        if (user.email_verified === 1 && userNeedsOnboarding(user)) {
            const p = req.path || '';
            const isStatic = p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/img/') || p.startsWith('/uploads/') || p.startsWith('/fonts/') || p === '/favicon.ico' || p === '/robots.txt' || p.startsWith('/manifest') || p.startsWith('/service-worker');
        const allowedExact = new Set(['/onboarding', '/onboarding/start', '/logout', '/verify-email', '/onboarding-empty', '/api/onboarding']);
            const isAuthPath = p === '/login' || p === '/register' || p.startsWith('/auth/') || p.startsWith('/webauthn/');
            if (!isStatic && !isAuthPath && !allowedExact.has(p) && !req.session.seenOnboardingPrompt) {
                return res.redirect('/onboarding-empty');
            }
        }
        return next();
    } catch (e) {
        return next();
    }
});

// Shared helper to normalize post-authentication redirects and admin conveniences
const resolvePostAuthRedirect = (user) => {
    if (!user) return '/login';

    // Auto-verify and complete onboarding for admin/HR accounts
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin' || user.role === 'hr') {
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
    if (user.role === 'hr') {
        return '/hr';
    }
    return '/feed';
};

// Onboarding reminder page (sets session flag so we don't loop in same session)
app.get('/onboarding-empty', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    // If they already finished, just go to feed
    if (!userNeedsOnboarding(user)) return res.redirect('/feed');
    req.session.seenOnboardingPrompt = true;
    res.render('onboarding-empty', {
        title: 'Onboarding - Let\'s Get Started | Dream X',
        currentPage: 'onboarding-empty'
    });
});

app.post('/onboarding/start', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    if (!userNeedsOnboarding(user)) return res.redirect('/feed');
    req.session.seenOnboardingPrompt = true;
    return res.redirect('/onboarding');
});

// RBAC helpers
const roleRank = { user: 1, admin: 2, hr: 2, super_admin: 3, global_admin: 4 };
const parseAdminMeta = (user) => {
    try {
        return {
            permissions: JSON.parse(user.admin_permissions || '[]'),
            scopes: JSON.parse(user.admin_scopes || '[]')
        };
    } catch (_) {
        return { permissions: [], scopes: [] };
    }
};
const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isHR = (user) => user && user.role === 'hr';
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';
const hasPermission = (user, permission) => {
    if (!user) return false;
    const { permissions } = parseAdminMeta(user);
    return permissions.includes(permission);
};
const requireAdmin = (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isAdmin(user)) return res.redirect('/');
    next();
};
const requireSuperAdmin = (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isSuperAdmin(user)) return res.redirect('/admin?error=Insufficient+permissions');
    next();
};
const requireHR = (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isHR(user)) return res.redirect('/');
    next();
};
const requireAdminOrHR = (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isAdmin(user) && !isHR(user)) return res.redirect('/');
    next();
};

// ===== ROUTES =====

// ---------- WebAuthn (Passkeys) ----------
const getEnvRpHost = () => {
    if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
    if (process.env.BASE_URL) {
        try {
            return new URL(process.env.BASE_URL).hostname;
        } catch (_) { /* ignore */ }
    }
    return null;
};

function rpIDFromReq(req){
    try {
        // Prefer explicit configuration to ensure the RP ID stays stable across environments
        const envHost = getEnvRpHost();
        if (envHost) return envHost;

        // Prefer forwarded host when behind proxies
        const xfHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
        const rawHost = xfHost || req.headers.host || '';
        const hostname = rawHost.split(':')[0].trim();
        if (hostname) return hostname;

        return 'localhost';
    } catch { return 'localhost'; }
}

const webauthnExpectedOrigins = (req, rpID) => {
    const origins = new Set();

    const envOrigin = process.env.WEBAUTHN_ORIGIN || process.env.BASE_URL;
    if (envOrigin) {
        try {
            origins.add(new URL(envOrigin).origin);
        } catch (_) { /* ignore */ }
    }

    const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    if (forwardedHost) {
        const proto = forwardedProto || 'https';
        origins.add(`${proto}://${forwardedHost}`);
    }

    if (req.headers.host) {
        origins.add(`${req.protocol}://${req.headers.host}`);
    }

    origins.add(`https://${rpID}`);
    origins.add(`http://${rpID}`);
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
    origins.add('https://dreamx-website.onrender.com');

    return Array.from(origins);
};

// Begin Registration (user must be logged in or provide email via body)
app.get('/webauthn/registration/options', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required to create a passkey' });
    const user = getUserById(req.session.userId);
    const rpID = rpIDFromReq(req);
    const existingCreds = getCredentialsForUser(user.id, rpID);
    try {
        const options = await generateRegistrationOptions({
            rpName: 'Dream X',
            rpID,
            userID: Buffer.from(String(user.id)),
            userName: user.email,
            userDisplayName: user.full_name,
            attestationType: 'none',
            // Require discoverable credentials so sign-in can work without a username prompt
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
                requireResidentKey: true,
            },
            excludeCredentials: existingCreds.map(c => ({
                id: c.credential_id.toString('base64url'),
                type: 'public-key',
            })),
        });
        req.session.webauthnChallenge = options.challenge;
        req.session.webauthnUserId = user.id;
        res.json(options);
    } catch (err) {
        console.error('WebAuthn registration options error:', err);
        res.status(400).json({ error: 'Passkey setup is currently unavailable. Please try again later.' });
    }
});

app.post('/webauthn/registration/verify', async (req, res) => {
    if (!req.session.userId || !req.session.webauthnChallenge) return res.status(400).json({ error: 'No registration in progress' });
    const expectedChallenge = req.session.webauthnChallenge;
    const rpID = rpIDFromReq(req);
    try {
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: webauthnExpectedOrigins(req, rpID),
            expectedRPID: rpID,
        });
        const { verified, registrationInfo } = verification;
        if (verified && registrationInfo) {
            const { credentialPublicKey, credentialID, counter, credentialDeviceType, credentialBackedUp } = registrationInfo;
            addWebAuthnCredential({
                userId: req.session.webauthnUserId,
                credentialId: Buffer.from(credentialID).toString('base64url'),
                publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
                counter: counter || 0,
                transports: (req.body.response && req.body.response.transports) ? JSON.stringify(req.body.response.transports) : null,
                rpId: rpID,
            });
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.json({ verified: true });
        }
        req.session.webauthnUserId = null;
        return res.status(400).json({ verified: false });
    } catch (e) {
        console.error('WebAuthn registration verify error', e);
        req.session.webauthnUserId = null;
        return res.status(400).json({ error: 'Verification failed' });
    }
});

// Begin Authentication (username-less)
app.get('/webauthn/authentication/options', async (req, res) => {
    const rpID = rpIDFromReq(req);
    const email = (req.query.email || '').trim().toLowerCase();
    let allowCredentials = [];
    let hintedUserId = null;
    try {
        if (email) {
            const user = getUserByEmail(email);
            if (!user) {
                return res.status(404).json({ error: 'No passkeys found for that email. Please sign in with your password.' });
            }

            const creds = getCredentialsForUser(user.id, rpID);
            if (!creds || creds.length === 0) {
                return res.status(404).json({ error: 'No passkeys found for that email. Please sign in with your password.' });
            }

            allowCredentials = creds.map((c) => ({
                id: c.credential_id.toString('base64url'),
                type: 'public-key',
                transports: c.transports ? JSON.parse(c.transports) : undefined,
            }));
            hintedUserId = user.id;
        }

        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'preferred',
            allowCredentials,
        });

        req.session.webauthnChallenge = options.challenge;
        req.session.webauthnUserId = hintedUserId;
        res.json(options);
    } catch (err) {
        console.error('WebAuthn authentication options error:', err);
        res.status(400).json({ error: 'Passkey sign-in is currently unavailable. Please try again later.' });
    }
});

app.post('/webauthn/authentication/verify', async (req, res) => {
    const expectedChallenge = req.session.webauthnChallenge;
    const hintedUserId = req.session.webauthnUserId;
    const rpID = rpIDFromReq(req);
    if (!expectedChallenge) return res.status(400).json({ error: 'No auth in progress' });
    try {
        const body = req.body;
        const credIdB64 = body.id;
        const stored = getCredentialById(credIdB64, rpID);
        if (!stored) {
            // Return a soft failure so the client can show a helpful message instead of a 404 page
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(200).json({ verified: false, error: 'Passkey not found. Please sign in normally and re-register your passkey.' });
        }

        if (stored.rp_id && stored.rp_id !== rpID) {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false, error: `Passkey is registered for ${stored.rp_id}. Please sign in on that domain to use it.` });
        }

        if (hintedUserId && Number(stored.user_id) !== Number(hintedUserId)) {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false, error: 'Passkey does not belong to that account.' });
        }

        const authenticator = stored ? {
            credentialID: Buffer.from(stored.credential_id, 'base64url'),
            credentialPublicKey: Buffer.from(stored.public_key, 'base64url'),
            counter: stored.counter || 0,
        } : null;
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: webauthnExpectedOrigins(req, rpID),
            expectedRPID: rpID,
            authenticator,
        });
        const { verified, authenticationInfo } = verification;
        if (verified && stored) {
            updateCredentialCounter({ credentialId: stored.credential_id, counter: authenticationInfo.newCounter || stored.counter });
            // Log user in using Passport
            const user = getUserById(stored.user_id);
            if (user) {
                req.login(user, (err) => {
                    if (err) {
                        console.error('WebAuthn login error:', err);
                        return res.status(500).json({ error: 'Login failed' });
                    }
                    req.session.userId = stored.user_id;
                    req.session.webauthnChallenge = null;
                    req.session.webauthnUserId = null;
                    return res.json({ verified: true });
                });
            } else {
                return res.status(400).json({ verified: false, error: 'User not found' });
            }
        } else {
            req.session.webauthnChallenge = null;
            req.session.webauthnUserId = null;
            return res.status(400).json({ verified: false });
        }
    } catch (e) {
        console.error('WebAuthn authentication verify error', e);
        req.session.webauthnChallenge = null;
        req.session.webauthnUserId = null;
        return res.status(400).json({ error: 'Verification failed' });
    }
});

// OAuth routes (Google)
app.get('/auth/google', (req, res, next) => {
    if (!passport._strategy('google')) return res.status(503).send('Google OAuth not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    const options = { scope: ['profile', 'email'], state: mode };
    passport.authenticate('google', options)(req, res, next);
});
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), async (req, res) => {
    
    const mode = req.query.state;
    if (mode === 'link' && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        if (req.authInfo.photoUrl) {
            const user = getUserById(req.session.userId);
            await importProfilePhotoIfNeeded(user, req.authInfo.photoUrl);
        }
        return res.redirect('/settings?success=Google connected');
    }
    // Use req.login() to properly serialize user into session
    if (req.user && req.user.id) {  
        req.login(req.user, (err) => {
            if (err) {
                console.error('❌ Google login error:', err);
                return res.redirect('/login');
            }
            req.session.userId = req.user.id;
            req.session.save((saveErr) => {
                try {
                    // Auto-verify email for SSO logins
                    const u = getUserById(req.user.id);
                    if (u && u.email_verified !== 1) {
                        markEmailAsVerified({ userId: u.id });
                    }
                    const redirectTarget = resolvePostAuthRedirect(u ? getUserById(u.id) : null);
                    return res.redirect(redirectTarget);
                } catch(_) {
                    return res.redirect('/feed');
                }
            });
        });
    } else {
        res.redirect('/feed');
    }
});

// OAuth routes (Microsoft)
app.get('/auth/microsoft', (req, res, next) => {
    if (!passport._strategy('microsoft')) return res.status(503).send('Microsoft OAuth not configured');
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    passport.authenticate('microsoft', { state: mode })(req, res, next);
});
app.get('/auth/microsoft/callback', passport.authenticate('microsoft', { failureRedirect: '/login' }), async (req, res) => {
    const mode = req.query.state;
    if (mode === 'link' && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        return res.redirect('/settings?success=Microsoft connected');
    }
    // Use req.login() to properly serialize user into session
    if (req.user && req.user.id) {
        req.login(req.user, (err) => {
            if (err) {
                console.error('Microsoft login error:', err);
                return res.redirect('/login');
            }
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
                } catch(_) {
                    return res.redirect('/feed');
                }
            });
        });
    } else {
        res.redirect('/feed');
    }
});

// OAuth routes (Apple)
app.get('/auth/apple', (req, res, next) => {
    if (!passport._strategy('apple')) return res.status(503).send('Apple Sign-In not configured');
    if (!process.env.APPLE_CALLBACK_URL || !process.env.APPLE_CALLBACK_URL.startsWith('https://')) {
        return res.status(503).send('Apple Sign-In requires HTTPS callback. Configure APPLE_CALLBACK_URL to an HTTPS URL (try ngrok for local).');
    }
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    passport.authenticate('apple', { state: mode })(req, res, next);
});
app.post('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), async (req, res) => {
    const mode = req.query.state;
    if (mode === 'link' && req.session.userId && req.authInfo) {
        updateUserProvider({ userId: req.session.userId, provider: req.authInfo.provider, providerId: req.authInfo.providerId });
        return res.redirect('/settings?success=Apple connected');
    }
    // Use req.login() to properly serialize user into session
    if (req.user && req.user.id) {
        req.login(req.user, (err) => {
            if (err) {
                console.error('Apple login error:', err);
                return res.redirect('/login');
            }
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
                } catch(_) {
                    return res.redirect('/feed');
                }
            });
        });
    } else {
        res.redirect('/feed');
    }
});

// Home page
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Home - Dream X',
        currentPage: 'home'
    });
});

const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string' && val.length) return [val.trim()];
    return [];
};

// Admin dashboard with pagination, audit logs, and queues
app.get('/admin', requireAdmin, (req, res) => {
    const stats = getStats();
    // Users tab pagination
    const pageSize = 20;
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const q = (req.query.q || '').trim();
    const total = getUsersCount({ search: q || null });
    const offset = (page - 1) * pageSize;
    const usersRaw = getUsersPaged({ limit: pageSize, offset, search: q || null });
    const users = usersRaw.map(u => {
        let perms = [];
        let scopes = [];
        try { perms = normalizeArray(u.admin_permissions ? JSON.parse(u.admin_permissions) : []); } catch (_) { perms = []; }
        try { scopes = normalizeArray(u.admin_scopes ? JSON.parse(u.admin_scopes) : []); } catch (_) { scopes = []; }
        return {
            ...u,
            admin_permissions: perms,
            admin_scopes: scopes
        };
    });

    // Super admins can see recent audit logs
    const me = req.session.userId ? getUserById(req.session.userId) : null;
    const logs = (me && (me.role === 'super_admin' || me.role === 'global_admin')) ? getAuditLogsPaged({ limit: 50, offset: 0 }) : [];

    // Queue pagination (server-side, hasMore style)
    const qLimit = 20;
    const cPage = Math.max(parseInt(req.query.cPage || '1', 10) || 1, 1);
    const caPage = Math.max(parseInt(req.query.caPage || '1', 10) || 1, 1);
    const aaPage = Math.max(parseInt(req.query.aaPage || '1', 10) || 1, 1);
    const cStatus = (req.query.cStatus || '').toLowerCase() || undefined;
    const caStatus = (req.query.caStatus || '').toLowerCase() || undefined;
    const aaStatus = (req.query.aaStatus || '').toLowerCase() || undefined;

    let careers = [], contentAppeals = [], accountAppeals = [];
    let cHasMore = false, caHasMore = false, aaHasMore = false;
    try {
        const cOffset = (cPage - 1) * qLimit;
        const caOffset = (caPage - 1) * qLimit;
        const aaOffset = (aaPage - 1) * qLimit;
        const dbm = require('./db');
        careers = dbm.getCareerApplicationsPaged({ limit: qLimit + 1, offset: cOffset, status: cStatus });
        contentAppeals = dbm.getContentAppealsPaged({ limit: qLimit + 1, offset: caOffset, status: caStatus });
        accountAppeals = dbm.getAccountAppealsPaged({ limit: qLimit + 1, offset: aaOffset, status: aaStatus });
        // hasMore detection
        if (careers.length > qLimit) { cHasMore = true; careers = careers.slice(0, qLimit); }
        if (contentAppeals.length > qLimit) { caHasMore = true; contentAppeals = contentAppeals.slice(0, qLimit); }
        if (accountAppeals.length > qLimit) { aaHasMore = true; accountAppeals = accountAppeals.slice(0, qLimit); }
    } catch(e) { console.warn('Queue fetch error:', e.message); }

    // Get refund requests with pagination
    const rPage = Math.max(parseInt(req.query.rPage || '1', 10) || 1, 1);
    const rStatus = (req.query.rStatus || '').toLowerCase() || undefined;
    const rOffset = (rPage - 1) * qLimit;
    let refundRequests = [];
    let rHasMore = false;
    try {
        const dbm = require('./db');
        refundRequests = dbm.getAllRefundRequests({ 
            limit: qLimit + 1, 
            offset: rOffset, 
            status: rStatus 
        }) || [];
        if (refundRequests.length > qLimit) { 
            rHasMore = true; 
            refundRequests = refundRequests.slice(0, qLimit); 
        }
    } catch(e) { 
        console.warn('Refund requests fetch error:', e.message); 
    }

    res.render('admin-consolidated', {
        title: 'Admin Dashboard - Dream X',
        currentPage: 'admin',
        authUser: me,
        stats,
        users,
        page,
        pageSize,
        total,
        q,
        logs,
        careers,
        contentAppeals,
        accountAppeals,
        refundRequests,
        cPage, caPage, aaPage, rPage,
        cHasMore, caHasMore, aaHasMore, rHasMore,
        cStatus, caStatus, aaStatus, rStatus,
        error: req.query.error,
        success: req.query.success
    });
});

// Admin: create users/admins via wizard
app.post('/admin/users/wizard', requireAdmin, async (req, res) => {
    const actor = req.session.userId ? getUserById(req.session.userId) : null;
    if (!actor) return res.status(403).json({ error: 'Unauthorized' });

    const roleOrder = roleRank;
    const targetRole = (req.body.role || 'user').toLowerCase();
    const targetRank = roleOrder[targetRole] || 1;
    const actorRank = roleOrder[actor.role] || 0;
    if (actorRank < targetRank || (actor.role === 'admin' && targetRole !== 'user' && !hasPermission(actor, 'manage_admins'))) {
        return res.status(403).json({ error: 'Insufficient permissions to assign role' });
    }

    const fullName = (req.body.fullName || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const permissions = normalizeArray(req.body.permissions);
    const scopes = normalizeArray(req.body.scopes);

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (getUserByEmail(email)) {
        return res.status(409).json({ error: 'User with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUserId = createUser({ fullName, email, passwordHash });
    if (targetRole !== 'user') {
        updateUserRole({ userId: newUserId, role: targetRole });
    }
    updateAdminPermissions({ userId: newUserId, permissions, scopes });
    addAuditLog({
        userId: actor.id,
        action: 'user_created',
        details: JSON.stringify({ targetRole, email })
    });
    return res.json({ success: true, userId: newUserId });
});

// Admin: adjust permissions/scopes
app.post('/admin/users/:id/permissions', requireAdmin, (req, res) => {
    const actor = req.session.userId ? getUserById(req.session.userId) : null;
    const targetId = parseInt(req.params.id, 10);
    const targetUser = getUserById(targetId);
    if (!actor || !targetUser) return res.status(404).json({ error: 'User not found' });
    const actorRank = roleRank[actor.role] || 0;
    const targetRank = roleRank[targetUser.role] || 0;
    if (actorRank <= targetRank) {
        return res.status(403).json({ error: 'You can only edit lower-tier admins' });
    }
    const permissions = normalizeArray(req.body.permissions);
    const scopes = normalizeArray(req.body.scopes);
    updateAdminPermissions({ userId: targetId, permissions, scopes });
    addAuditLog({ userId: actor.id, action: 'permissions_updated', details: JSON.stringify({ target: targetUser.email }) });
    return res.json({ success: true });
});

// Admin: Services moderation portal
app.get('/admin/services', requireAdmin, (req, res) => {
    const status = (req.query.status || '').toLowerCase() || null; // active|hidden|deleted
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    const q = (req.query.q || '').trim();
    const rows = require('./db').listAllServicesAdmin({ status, limit: pageSize, offset, q: q || null });
    const me = req.session.userId ? getUserById(req.session.userId) : null;
    res.render('admin-services', {
        title: 'Services Moderation - Dream X',
        currentPage: 'admin',
        services: rows,
        status,
        page,
        pageSize,
        q,
        authUser: me,
        success: req.query.success,
        error: req.query.error
    });
});

app.post('/admin/services/:id/hide', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const notifyEmail = !!req.body.notifyEmail;
    const notifyInApp = !!req.body.notifyInApp;
    try {
        const ok = require('./db').adminSetServiceStatus({ serviceId: id, status: 'hidden' });
        if (ok) {
            const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
            if (s) {
                if (notifyInApp) {
                    createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service hidden', message: `Your service "${s.title}" was hidden by admins.`, link: `/services/${id}` });
                    // Push (if enabled)
                    await sendBrowserPush(s.user_id, 'Service hidden', `Your service "${s.title}" was hidden by admins.`, `/services/${id}`);
                }
                let emailSuppressed = false;
                if (notifyEmail) {
                    const owner = getUserById(s.user_id);
                    if (owner && owner.email_notifications === 1) {
                        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                        await emailService.sendServiceModerationEmail(owner, s, 'hidden', null, baseUrl, req);
                    } else {
                        emailSuppressed = true;
                    }
                }
                const msg = 'Service hidden' + (emailSuppressed ? ' (email suppressed by user settings)' : '');
                return res.redirect('/admin/services?success=' + encodeURIComponent(msg));
            }
        }
        res.redirect('/admin/services?success=Service+hidden');
    } catch (e) {
        console.error('hide service error', e);
        res.redirect('/admin/services?error=Failed+to+hide');
    }
});

app.post('/admin/services/:id/unhide', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const notifyEmail = !!req.body.notifyEmail;
    const notifyInApp = !!req.body.notifyInApp;
    try {
        const ok = require('./db').adminSetServiceStatus({ serviceId: id, status: 'active' });
        if (ok) {
            const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
            if (s) {
                if (notifyInApp) {
                    createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service restored', message: `Your service "${s.title}" is visible again.`, link: `/services/${id}` });
                    // Push (if enabled)
                    await sendBrowserPush(s.user_id, 'Service restored', `Your service "${s.title}" is visible again.`, `/services/${id}`);
                }
                let emailSuppressed = false;
                if (notifyEmail) {
                    const owner = getUserById(s.user_id);
                    if (owner && owner.email_notifications === 1) {
                        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                        await emailService.sendServiceModerationEmail(owner, s, 'restored', null, baseUrl, req);
                    } else {
                        emailSuppressed = true;
                    }
                }
                const msg = 'Service restored' + (emailSuppressed ? ' (email suppressed by user settings)' : '');
                return res.redirect('/admin/services?success=' + encodeURIComponent(msg));
            }
        }
        res.redirect('/admin/services?success=Service+restored');
    } catch (e) {
        console.error('unhide service error', e);
        res.redirect('/admin/services?error=Failed+to+restore');
    }
});

app.post('/admin/services/:id/delete', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const notifyEmail = !!req.body.notifyEmail;
    const notifyInApp = !!req.body.notifyInApp;
    const reason = (req.body.reason || '').trim() || null;
    try {
        const ok = require('./db').adminSetServiceStatus({ serviceId: id, status: 'deleted' });
        if (ok) {
            const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
            if (s) {
                if (notifyInApp) {
                    createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service deleted', message: `Your service "${s.title}" was removed by admins.`, link: `/profile` });
                    // Push (if enabled)
                    await sendBrowserPush(s.user_id, 'Service deleted', `Your service "${s.title}" was removed by admins.`, `/profile`);
                }
                let emailSuppressed = false;
                if (notifyEmail) {
                    const owner = getUserById(s.user_id);
                    if (owner && owner.email_notifications === 1) {
                        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                        await emailService.sendServiceModerationEmail(owner, s, 'deleted', reason, baseUrl, req);
                    } else {
                        emailSuppressed = true;
                    }
                }
                const msg = 'Service deleted' + (emailSuppressed ? ' (email suppressed by user settings)' : '');
                return res.redirect('/admin/services?success=' + encodeURIComponent(msg));
            }
        }
        res.redirect('/admin/services?success=Service+deleted');
    } catch (e) {
        console.error('delete service error', e);
        res.redirect('/admin/services?error=Failed+to+delete');
    }
});

app.post('/admin/services/:id/edit', requireSuperAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        const s = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
        if (!s) return res.redirect('/admin/services?error=Service+not+found');
        const fields = {};
        const map = {
            title: 'title', description: 'description', category: 'category', price_per_hour: 'price_per_hour', duration_minutes: 'duration_minutes',
            experience_level: 'experience_level', format: 'format', availability: 'availability', location: 'location', tags: 'tags'
        };
        for (const k in map) {
            if (Object.prototype.hasOwnProperty.call(req.body, k)) {
                fields[map[k]] = req.body[k];
            }
        }
        const ok = require('./db').adminUpdateServiceContent({ serviceId: id, fields });
        if (ok && (req.body.notifyEmail || req.body.notifyInApp)) {
            const owner = getUserById(s.user_id);
            let emailSuppressed = false;
            if (req.body.notifyInApp) {
                createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service edited by admin', message: `Your service "${s.title}" was edited for compliance.`, link: `/services/${id}` });
                await sendBrowserPush(s.user_id, 'Service edited by admin', `Your service "${s.title}" was edited for compliance.`, `/services/${id}`);
            }
            if (req.body.notifyEmail) {
                if (owner && owner.email_notifications === 1) {
                    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                    await emailService.sendServiceEditedByAdminEmail(owner, { ...s, ...fields }, baseUrl, req);
                } else {
                    emailSuppressed = true;
                }
            }
            const msg = 'Service updated' + (emailSuppressed ? ' (email suppressed by user settings)' : '');
            return res.redirect('/admin/services?success=' + encodeURIComponent(msg));
        }
        res.redirect(ok ? '/admin/services?success=Service+updated' : '/admin/services?error=Update+failed');
    } catch (e) {
        console.error('admin edit service error', e);
        res.redirect('/admin/services?error=Update+failed');
    }
});

// Update user role (super admin only)
app.post('/admin/users/:id/role', requireSuperAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const role = (req.body.role || 'user').toLowerCase();
    const me = getUserById(req.session.userId);
    
    // Validate role
    if (!['user','admin','super_admin','global_admin','hr'].includes(role)) {
        return res.redirect('/admin?error=Invalid+role');
    }
    
    // Only global_admin can create other global_admins
    if (role === 'global_admin' && (!me || me.role !== 'global_admin')) {
        return res.redirect('/admin?error=Only+global+admins+can+promote+to+global+admin');
    }
    
    // Prevent demoting self from global_admin or super_admin accidentally
    if (me && me.id === id && me.role === 'global_admin' && role !== 'global_admin') {
        return res.redirect('/admin?error=Cannot+demote+yourself+from+global+admin');
    }
    if (me && me.id === id && me.role === 'super_admin' && role !== 'super_admin' && role !== 'global_admin') {
        return res.redirect('/admin?error=Cannot+demote+yourself');
    }
    
    // Ensure at least one global_admin remains (if any exist)
    const all = getAllUsers();
    const globalAdmins = all.filter(u => u.role === 'global_admin');
    if (globalAdmins.length === 1 && globalAdmins[0].id === id && role !== 'global_admin') {
        return res.redirect('/admin?error=At+least+one+global+admin+required');
    }
    
    // Ensure at least one super_admin remains (if no global_admins exist)
    const superAdmins = all.filter(u => u.role === 'super_admin');
    if (globalAdmins.length === 0 && superAdmins.length === 1 && superAdmins[0].id === id && role !== 'super_admin') {
        return res.redirect('/admin?error=At+least+one+super+admin+required');
    }
    
    updateUserRole({ userId: id, role });
    try {
        addAuditLog({ userId: me ? me.id : null, action: 'role_change', details: JSON.stringify({ targetUserId: id, newRole: role }) });
    } catch (e) {}
    res.redirect('/admin?success=Role+updated');
});

// User statistics page
app.get('/admin/users/:id/stats', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const user = getUserById(userId);
    if (!user) {
        return res.redirect('/admin?error=User+not+found');
    }

    // Get user stats
    const postsCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId)?.count || 0;
    const commentsCount = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE user_id = ?').get(userId)?.count || 0;
    const followersCount = getFollowerCount(userId);
    const followingCount = getFollowingCount(userId);
    const conversationsCount = db.prepare('SELECT COUNT(DISTINCT conversation_id) as count FROM conversation_participants WHERE user_id = ?').get(userId)?.count || 0;
    const messagesCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE sender_id = ?').get(userId)?.count || 0;

    // Get recent posts
    const recentPosts = db.prepare(`
        SELECT p.*, 
               (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as reactions_count,
               (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
        FROM posts p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT 5
    `).all(userId);

    // Calculate account age
    const accountAge = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));

    // Get account status
    const accountStatus = checkAccountStatus(userId);

    res.render('admin-user-stats', {
        title: `${user.full_name} - User Statistics - Dream X`,
        currentPage: 'admin',
        user: req.session.user,
        targetUser: user,
        stats: {
            posts: postsCount,
            comments: commentsCount,
            followers: followersCount,
            following: followingCount,
            conversations: conversationsCount,
            messages: messagesCount,
            accountAge: accountAge
        },
        recentPosts: recentPosts,
        accountStatus: accountStatus
    });
});

// CSV Exports
app.get('/admin/export/users.csv', requireAdmin, (req, res) => {
    try { addAuditLog({ userId: req.session.userId, action: 'export_users', details: null }); } catch (e) {}
    const rows = getAllUsers();
    const header = 'id,full_name,email,role,created_at\n';
    const csv = header + rows.map(r => `${r.id},"${(r.full_name||'').replace(/"/g,'""')}",${r.email},${r.role},${r.created_at}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
});

app.get('/admin/export/messages.csv', requireAdmin, (req, res) => {
    try { addAuditLog({ userId: req.session.userId, action: 'export_messages', details: null }); } catch (e) {}
    const rows = db.prepare(`SELECT m.id, m.conversation_id, m.sender_id, u.email as sender_email, m.content, m.read, m.created_at
                             FROM messages m JOIN users u ON u.id = m.sender_id
                             ORDER BY m.created_at DESC`).all();
    const header = 'id,conversation_id,sender_id,sender_email,content,read,created_at\n';
    const csv = header + rows.map(r => `${r.id},${r.conversation_id},${r.sender_id},${r.sender_email},"${(r.content||'').replace(/"/g,'""')}",${r.read},${r.created_at}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="messages.csv"');
    res.send(csv);
});

// HR review portal
app.get('/hr', requireHR, (req, res) => {
    const me = getUserById(req.session.userId);
    const careers = require('./db').getCareerApplicationsPaged({ limit: 100, offset: 0 });
    
    // Calculate counts for each status
    const totalApps = careers.length;
    const newApps = careers.filter(c => c.status === 'new' || !c.status).length;
    const reviewApps = careers.filter(c => c.status === 'under_review').length;
    const acceptedApps = careers.filter(c => c.status === 'accepted').length;
    const rejectedApps = careers.filter(c => c.status === 'rejected').length;
    
    res.render('hr', {
        title: 'HR Review - Dream X',
        currentPage: 'hr',
        authUser: me,
        careers,
        totalApps,
        newApps,
        reviewApps,
        acceptedApps,
        rejectedApps,
        success: req.query.success,
        error: req.query.error
    });
});

// HR Contact Email Route
app.post('/hr/send-email', requireHR, async (req, res) => {
    try {
        const { applicantId, applicantEmail, applicantName, subject, message } = req.body;
        
        if (!applicantEmail || !applicantName || !subject || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields (email, name, subject, message) are required' 
            });
        }
        
        const hrUser = getUserById(req.session.userId);
        const fromHR = hrUser.full_name || hrUser.email;
        
        await emailService.sendHRContactEmail(
            applicantEmail,
            applicantName,
            subject,
            message,
            fromHR,
            req
        );
        
        // Log the action
        try {
            addAuditLog({
                userId: req.session.userId,
                action: 'hr_email_sent',
                details: JSON.stringify({ applicantEmail, subject, applicantId })
            });
        } catch (e) {}
        
        res.json({ 
            success: true, 
            message: 'Email sent successfully to ' + applicantEmail 
        });
    } catch (error) {
        console.error('HR email error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send email. Please try again.' 
        });
    }
});

// CSV export for career applications
app.get('/admin/export/careers.csv', requireHR, (req, res) => {
    const careers = require('./db').getCareerApplicationsPaged({ limit: 10000, offset: 0 });
    
    // CSV headers
    let csv = 'ID,Name,Email,Phone,Position,Status,Applied Date,Cover Letter\n';
    
    // CSV rows
    careers.forEach(c => {
        const coverLetter = (c.cover_letter || '').replace(/"/g, '""').replace(/\n/g, ' ');
        csv += `${c.id},"${c.name}","${c.email}","${c.phone || ''}","${c.position}","${c.status || 'new'}","${c.created_at}","${coverLetter}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=career_applications.csv');
    res.send(csv);
});

// Status update endpoints
app.post('/admin/careers/:id/status', requireAdminOrHR, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toLowerCase();
    const valid = ['new','under_review','accepted','rejected'];
    const isJson = req.headers['content-type']?.includes('application/x-www-form-urlencoded') && req.headers['accept']?.includes('application/json');
    
    if (!valid.includes(status)) {
        if (isJson || req.xhr) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        return res.redirect('/admin?error=Invalid+status');
    }
    
    // Get application details before updating
    const application = db.getCareerApplicationById(id);
    
    require('./db').updateCareerApplicationStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'career_status_update', details: JSON.stringify({ id, status }) }); } catch(e){}
    
    // Send email notification for status changes
    if (application && status !== 'new') {
        try {
            await emailService.sendCareerStatusUpdateEmail(
                application.email,
                application.name,
                application.position,
                status,
                req
            );
        } catch (emailError) {
            console.error('Failed to send career status email:', emailError);
        }
    }
    
    if (isJson || req.xhr) {
        return res.json({ success: true });
    }
    res.redirect('/admin?success=Career+application+updated');
});
app.post('/admin/appeals/content/:id/status', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toLowerCase();
    const valid = ['open','under_review','approved','denied'];
    if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');
    
    // Get appeal details before updating
    const appeal = db.getContentAppealById(id);
    
    require('./db').updateContentAppealStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'content_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch(e){}
    
    // Send email notification for approved/denied appeals
    if (appeal && (status === 'approved' || status === 'denied')) {
        if (status === 'approved') {
            await emailService.sendContentApprovalEmail(appeal.email, appeal, req);
        } else {
            await emailService.sendContentDenialEmail(appeal.email, appeal, req);
        }
    }
    
    res.redirect('/admin?success=Content+appeal+updated');
});
app.post('/admin/appeals/account/:id/status', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toLowerCase();
    const valid = ['open','under_review','approved','denied'];
    if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');
    
    // Get appeal details before updating
    const appeal = db.getAccountAppealById(id);
    
    require('./db').updateAccountAppealStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'account_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch(e){}
    
    // Send email notification for approved/denied appeals
    if (appeal && (status === 'approved' || status === 'denied')) {
        if (status === 'approved') {
            await emailService.sendAccountApprovalEmail(appeal.email, appeal, req);
        } else {
            await emailService.sendAccountDenialEmail(appeal.email, appeal, req);
        }
    }
    
    res.redirect('/admin?success=Account+appeal+updated');
});

// Admin: Get refund request details (for modal)
app.get('/admin/refund-requests/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    
    try {
        const refundRequest = getRefundRequest(id);
        
        if (!refundRequest) {
            return res.status(404).json({ success: false, error: 'Refund request not found' });
        }
        // Fetch audit trail for this refund from audit_logs
        let audit = [];
        try {
            audit = db.prepare(`
              SELECT a.created_at, a.action, a.details, u.full_name AS admin_name, u.email AS admin_email
              FROM audit_logs a
              LEFT JOIN users u ON u.id = a.user_id
              WHERE a.action IN ('review_refund_request','refund_request_update')
                AND (a.details LIKE ? OR a.details LIKE ?)
              ORDER BY a.created_at DESC
            `).all(`%"requestId":${id}%`, `%"id":${id}%`);
        } catch (e) {
            console.warn('Audit trail fetch failed:', e.message);
        }

        res.json({ success: true, data: refundRequest, audit });
    } catch (error) {
        console.error('Error fetching refund request:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch refund request' });
    }
});

// Admin: Update refund request status
app.post('/admin/refund-requests/:id/update', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status, adminNotes, refundAmount } = req.body;
    
    const valid = ['pending', 'processing', 'approved', 'denied', 'refunded'];
    if (!valid.includes(status)) {
        return res.json({ success: false, error: 'Invalid status' });
    }
    
    try {
        // Get refund request details for notifications
        const refundRequest = getRefundRequest(id);
        
        if (!refundRequest) {
            return res.json({ success: false, error: 'Refund request not found' });
        }
        
        // Update the refund request
        updateRefundRequestStatus({
            id,
            status,
            reviewedBy: req.session.userId,
            adminNotes: adminNotes || null,
            refundAmount: refundAmount ? parseFloat(refundAmount) : null
        });
        
        // Add audit log
        try {
            addAuditLog({
                userId: req.session.userId,
                action: 'refund_request_update',
                details: JSON.stringify({ id, status, refundAmount })
            });
        } catch(e) {
            console.warn('Audit log failed:', e);
        }
        
        // Send email notification to user
        const user = await getUserById(refundRequest.user_id);
        if (user && user.email) {
            try {
                // TODO: Implement refund status email templates
                if (status === 'approved') {
                    // await emailService.sendRefundApprovedEmail(user.email, refundRequest, refundAmount);
                    console.log('📧 Would send approval email to:', user.email);
                } else if (status === 'denied') {
                    // await emailService.sendRefundDeniedEmail(user.email, refundRequest, adminNotes);
                    console.log('📧 Would send denial email to:', user.email);
                }
            } catch (emailError) {
                console.error('Email notification failed:', emailError);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating refund request:', error);
        res.json({ success: false, error: 'Failed to update refund request' });
    }
});

// Admin: User account notes
app.get('/admin/users/:id/notes', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    try {
        const notes = getUserAdminNotes(userId) || [];
        res.json({ success: true, notes });
    } catch (e) {
        console.error('Error fetching user notes:', e);
        res.status(500).json({ success: false, error: 'Failed to load notes' });
    }
});

app.post('/admin/users/:id/notes', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const adminId = req.session.userId;
    const { note } = req.body;
    if (!note || !note.trim()) {
        return res.status(400).json({ success: false, error: 'Note is required' });
    }
    try {
        const id = addUserAdminNote({ userId, adminId, note: note.trim() });
        addAuditLog({ userId: adminId, action: 'add_user_note', details: JSON.stringify({ targetUserId: userId, noteId: id }) });
        const created = getUserAdminNotes(userId)[0];
        res.json({ success: true, note: created });
    } catch (e) {
        console.error('Error adding user note:', e);
        res.status(500).json({ success: false, error: 'Failed to add note' });
    }
});

// Registration page
app.get('/register', (req, res) => {
    if (req.session.userId) {
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
app.post('/register', async (req, res) => {
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
    
    // Alt account detection - check for banned/suspended users with similar patterns
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    const emailDomain = email.split('@')[1];
    const emailUsername = email.split('@')[0];
    
    // Check for suspicious patterns
    try {
        const suspiciousUsers = db.prepare(`
            SELECT u.id, u.email, u.full_name, u.account_status, u.created_at,
                   am.ban_reason, am.suspended_until
            FROM users u
            LEFT JOIN account_moderation am ON am.user_id = u.id
            WHERE (am.status IN ('banned', 'suspended') OR u.account_status IN ('banned', 'suspended'))
                AND (
                    u.email LIKE ? OR
                    u.full_name LIKE ? OR
                    u.email LIKE ?
                )
            ORDER BY u.created_at DESC
            LIMIT 1
        `).get(
            `%${emailUsername}%@${emailDomain}`,
            `%${fullName}%`,
            `${emailUsername}%@%`
        );
        
        if (suspiciousUsers) {
            // Flag for admin review
            console.warn(`[ALT ACCOUNT DETECTION] Potential alt account signup detected:`);
            console.warn(`  New signup: ${email} (${fullName})`);
            console.warn(`  Similar to banned/suspended user: ${suspiciousUsers.email} (ID: ${suspiciousUsers.id})`);
            console.warn(`  IP: ${clientIp}`);
            
            // Log to audit (if available)
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
            } catch(e) {}
            
            // For now, allow registration but flag it
            // In production, you might want to block or require additional verification
        }
    } catch(e) {
        console.warn('Alt account detection failed:', e.message);
    }
    
    // Handle validation
    let userHandle = handle ? handle.trim().toLowerCase() : '';
    if (!userHandle) {
        // Auto-generate if not provided
        const baseHandle = generateBaseHandle(fullName, email);
        userHandle = generateUniqueHandle(baseHandle);
    } else {
        // Validate format
        if (!/^[a-z0-9_]{3,20}$/.test(userHandle)) {
            return res.status(400).render('register', {
                title: 'Register - Dream X',
                currentPage: 'register',
                error: 'Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores.',
                suggestedHandles: null,
                formData: req.body
            });
        }
        // Check for collision
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
        // Ensure a default free subscription is created for every new account
        try {
            createOrUpdateSubscription({ userId, tier: 'free', status: 'active' });
        } catch (subErr) {
            console.warn('Failed to initialize free subscription for user', userId, subErr.message);
        }
        
        // Generate 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
        
        // Save verification code to database
        createVerificationCode({
            userId,
            email: email.trim().toLowerCase(),
            code: verificationCode,
            expiresAt
        });
        
        // Send verification email
        const user = getUserById(userId);
        try {
            await emailService.sendVerificationCode(user, verificationCode, req);
            console.log(`✅ Verification email sent to ${user.email}`);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr);
            // Don't block registration if email fails
        }
        
        // Log user in using Passport but don't redirect to onboarding yet
        req.login(user, (err) => {
            if (err) {
                console.error('Registration login error:', err);
                req.session.userId = userId; // Fallback to manual session
                return res.redirect('/verify-email');
            }
            req.session.userId = userId;
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                }
                return res.redirect('/verify-email');
            });
        });
    } catch (e) {
        console.error('Registration error', e);
        return res.status(500).render('register', { title: 'Register - Dream X', currentPage: 'register', error: 'Server error. Try again.' });
    }
});

// Email Verification Routes
app.get('/verify-email', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
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

app.post('/verify-email', async (req, res) => {
    if (!req.session.userId) {
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
    
    // Clean up expired codes
    try {
        deleteExpiredVerificationCodes();
    } catch(e) {}
    
    // Check verification code
    const verificationRecord = getVerificationCode({ userId: user.id, code });
    
    if (!verificationRecord) {
        return res.status(400).json({ success: false, error: 'Invalid or expired code. Please try again.' });
    }
    
    // Check if expired
    const now = new Date();
    const expiresAt = new Date(verificationRecord.expires_at);
    if (now > expiresAt) {
        return res.status(400).json({ success: false, error: 'Code expired. Request a new one.' });
    }
    
    // Mark as verified
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

app.post('/resend-verification', async (req, res) => {
    if (!req.session.userId) {
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
        // Generate new code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        
        createVerificationCode({
            userId: user.id,
            email: user.email,
            code: verificationCode,
            expiresAt
        });
        
        // Send email
        await emailService.sendVerificationCode(user, verificationCode, req);
        
        return res.json({ success: true, message: 'New verification code sent!' });
    } catch (err) {
        console.error('Resend verification error:', err);
        return res.status(500).json({ success: false, error: 'Failed to send email. Please try again.' });
    }
});

// Forgot password
app.get('/forgot-password', (req, res) => {
    if (req.session.userId) return res.redirect('/feed');

    res.render('forgot-password', {
        title: 'Forgot Password - Dream X',
        currentPage: 'forgot-password',
        error: null,
        success: null
    });
});

app.post('/forgot-password', async (req, res) => {
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
            email: user?.email,
            resetLink,
            redirectUri: emailService.getGmailRedirectUri ? emailService.getGmailRedirectUri(req) : 'unknown'
        });
        return res.status(500).render('forgot-password', {
            title: 'Forgot Password - Dream X',
            currentPage: 'forgot-password',
            error: 'Something went wrong while sending your reset email. Please try again shortly.',
            success: null
        });
    }
});

app.get('/reset-password', (req, res) => {
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

app.post('/reset-password', async (req, res) => {
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

        req.session.userId = user.id;
        req.session.save(() => {
            return res.redirect('/feed');
        });
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
app.get('/login', (req, res) => {
    if (req.session.userId) {
        const user = getUserById(req.session.userId);
        if (user) return res.redirect(resolvePostAuthRedirect(user));
    }
    const googleEnabled = !!passport._strategy('google');
    const microsoftEnabled = !!passport._strategy('microsoft');
    const appleEnabled = !!passport._strategy('apple') && !!process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://');
    res.render('login', {
        title: 'Login - Dream X',
        currentPage: 'login',
        error: null,
        providers: { googleEnabled, microsoftEnabled, appleEnabled }
    });
});

// Handle login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail((email || '').trim().toLowerCase());
    // Ensure OAuth provider flags are always available to the template
    const googleEnabled = !!passport._strategy('google');
    const microsoftEnabled = !!passport._strategy('microsoft');
    const appleEnabled = !!passport._strategy('apple') && !!process.env.APPLE_CALLBACK_URL && process.env.APPLE_CALLBACK_URL.startsWith('https://');
    const providers = { googleEnabled, microsoftEnabled, appleEnabled };
    if (!user) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.', providers });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.', providers });
    }
    
    // Check account status before allowing login
    const accountStatus = checkAccountStatus(user.id);
    if (accountStatus.status === 'banned') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    if (accountStatus.status === 'suspended') {
        return res.redirect(`/account-status?userId=${user.id}`);
    }
    
    // Use req.login() to properly serialize user into session
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
        req.session.userId = user.id;
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('Session save error:', saveErr);
            }
            const freshUser = getUserById(user.id);
            const redirectPath = resolvePostAuthRedirect(freshUser);
            return res.redirect(redirectPath);
        });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        req.session.destroy(() => {
            // Clear cookies to ensure complete logout
            res.clearCookie('connect.sid');
            // Add cache control headers to prevent caching of authenticated pages
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.redirect('/');
        });
    });
});

// Feed page (main social feed)
app.get('/feed', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    // Prevent caching of feed to ensure fresh content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const posts = getFeedPosts({ limit: 50, offset: 0 }).map(p => {
        try {
            p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
            // Ensure reactions object exists even if empty
            p.reactions = p.reactions || {};
            // Normalize media_url to new uploads structure for legacy rows
            if (p.media_url) {
                let m = String(p.media_url);
                if (m.startsWith('public/')) m = m.replace(/^public\//, '/');
                if (m.startsWith('uploads/')) m = '/' + m; // ensure leading slash
                if (m.startsWith('posts/')) m = '/uploads/' + m;
                if (!m.startsWith('/')) m = '/' + m;
                // Constrain to uploads only
                if (!m.startsWith('/uploads/')) {
                    // last resort: assume it's a posts asset name
                    m = '/uploads/posts/' + m.replace(/^\/+/, '');
                }
                p.media_url = m;
            }
            // Normalize profile picture to store relative path like 'profiles/...' for template prefix
            if (p.profile_picture) {
                let pic = String(p.profile_picture);
                if (pic.startsWith('/uploads/')) pic = pic.replace(/^\/uploads\//, '');
                if (pic.startsWith('public/uploads/')) pic = pic.replace(/^public\/uploads\//, '');
                p.profile_picture = pic;
            }
        } catch(e) {}
        return p;
    });
    // Active reels from followed users (last 48h)
    let activeReels = [];
    try {
        const followed = getFollowing(req.session.userId, 500);
        activeReels = followed.map(u => ({
            user_id: u.id,
            full_name: u.full_name,
            profile_picture: u.profile_picture,
            reelCount: require('./db').getActiveReelCount(u.id)
        })).filter(r => r.reelCount > 0).sort((a,b) => b.reelCount - a.reelCount);
    } catch(e) { activeReels = []; }
    
    // Get real suggested users with smart fallback logic
    let suggestions = [];
    try {
        // First, try to get users based on recent post activity (last 7 days)
        const activeUsersQuery = db.prepare(`
            SELECT DISTINCT u.id, u.full_name, u.email, u.profile_picture, u.categories,
                   COUNT(p.id) as recent_posts
            FROM users u
            LEFT JOIN posts p ON u.id = p.user_id AND p.created_at >= datetime('now', '-7 days')
            WHERE u.id != ?
              AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
              AND u.account_status = 'active'
            GROUP BY u.id
            ORDER BY recent_posts DESC, u.created_at DESC
            LIMIT 10
        `);
        const activeUsers = activeUsersQuery.all(req.session.userId, req.session.userId);
        
        // If we got active users, pick top 3-4 based on post count
        if (activeUsers.length >= 3) {
            // On busy days (users with 3+ posts), use higher threshold
            const busyUsers = activeUsers.filter(u => u.recent_posts >= 3);
            const moderateUsers = activeUsers.filter(u => u.recent_posts >= 1 && u.recent_posts < 3);
            
            if (busyUsers.length >= 3) {
                // Busy day - pick users with most posts
                suggestions = busyUsers.slice(0, 3);
            } else if (busyUsers.length > 0 && moderateUsers.length > 0) {
                // Mixed activity - combine busy and moderate users
                suggestions = [...busyUsers.slice(0, 2), ...moderateUsers.slice(0, 2)];
            } else {
                // Light day - pick any users with recent activity
                suggestions = activeUsers.slice(0, 3);
            }
        }
        
        // If still not enough suggestions, get users with most total posts ever
        if (suggestions.length < 3) {
            const topCreatorsQuery = db.prepare(`
                SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories,
                       COUNT(p.id) as total_posts
                FROM users u
                LEFT JOIN posts p ON u.id = p.user_id
                WHERE u.id != ?
                  AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                  AND u.account_status = 'active'
                GROUP BY u.id
                HAVING total_posts > 0
                ORDER BY total_posts DESC
                LIMIT ?
            `);
            const needed = 3 - suggestions.length;
            const topCreators = topCreatorsQuery.all(req.session.userId, req.session.userId, needed);
            suggestions = [...suggestions, ...topCreators];
        }
        
        // Last resort: if still empty, get ANY real users (newest first)
        if (suggestions.length === 0) {
            const anyUsersQuery = db.prepare(`
                SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories
                FROM users u
                WHERE u.id != ?
                  AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                  AND u.account_status = 'active'
                ORDER BY u.created_at DESC
                LIMIT 3
            `);
            suggestions = anyUsersQuery.all(req.session.userId, req.session.userId);
        }
        
        // Transform to expected format
        suggestions = suggestions.map(u => {
            let passion = 'Community Member';
            if (u.categories) {
                try {
                    const categories = JSON.parse(u.categories);
                    if (Array.isArray(categories) && categories.length > 0) {
                        passion = categories[0];
                    }
                } catch(e) {}
            }
            return {
                id: u.id,
                user: u.full_name,
                email: u.email,
                passion: passion,
                profile_picture: u.profile_picture
            };
        }).slice(0, 3); // Ensure we show exactly 3 (or fewer if not available)
        
    } catch (error) {
        console.error('Error fetching suggested users:', error);
        suggestions = [];
    }
    
    // Get real trending posts from database (most recent posts with activity)
    // TODO: Implement proper trending algorithm based on likes, comments, and recency
    let trendingPosts = [];
    try {
        const trendingQuery = db.prepare(`
            SELECT 
                p.id as post_id,
                p.text_content,
                p.activity_label,
                p.created_at,
                u.id as user_id,
                u.full_name,
                u.profile_picture,
                0 as likes_count,
                0 as comments_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.created_at >= datetime('now', '-7 days') AND p.is_reel = 0
            ORDER BY p.created_at DESC
            LIMIT 5
        `);
        const trendingResults = trendingQuery.all();
        
        trendingPosts = trendingResults.map(post => ({
            post_id: post.post_id,
            user: post.full_name,
            full_name: post.full_name,
            userId: post.user_id,
            user_id: post.user_id,
            title: post.activity_label || (post.text_content ? post.text_content.substring(0, 60) + '...' : 'View post'),
            text_content: post.text_content,
            profile_picture: post.profile_picture,
            likes_count: post.likes_count,
            comments_count: post.comments_count
        }));
    } catch (err) {
        console.error('Error fetching trending posts:', err);
        // Fallback to sample data if database query fails
        trendingPosts = [
            { user: 'Nora Fields', userId: 1, title: 'How I wrote 10k words in a week' },
            { user: 'Ethan Brooks', userId: 2, title: 'Startup launch tips' },
            { user: 'Clara Dawson', userId: 3, title: 'Best nature photos of 2025' }
        ];
    }
    
    // Get recent activity from database
    let recentActivity = [];
    try {
        recentActivity = getRecentActivity(5) || [];
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        recentActivity = [];
    }
    
    const authUser = getUserById(req.session.userId);
    
    // Get top passions from actual user data
    let topPassions = [];
    try {
        const passionsQuery = db.prepare(`
            SELECT categories FROM users WHERE categories IS NOT NULL AND categories != ''
        `);
        const usersWithCategories = passionsQuery.all();
        
        const passionCounts = {};
        usersWithCategories.forEach(user => {
            try {
                const categories = JSON.parse(user.categories);
                if (Array.isArray(categories)) {
                    categories.forEach(category => {
                        if (category && typeof category === 'string') {
                            passionCounts[category] = (passionCounts[category] || 0) + 1;
                        }
                    });
                }
            } catch(e) {}
        });
        
        // Sort by count and get top 5
        topPassions = Object.entries(passionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([passion]) => passion);
        
        // If no passions found, use default popular passions
        if (topPassions.length === 0) {
            topPassions = ['Entrepreneurship', 'Technology', 'Design', 'Writing', 'Art'];
        }
    } catch (error) {
        console.error('Error fetching top passions:', error);
        topPassions = ['Entrepreneurship', 'Technology', 'Design', 'Writing', 'Art'];
    }
    
    res.render('feed', {
        title: 'Your Feed - Dream X',
        currentPage: 'feed',
        authUser,
        posts,
        suggestions,
        trendingPosts,
        recentActivity,
        topPassions,
        activeReels,
        success: req.query.success
    });
});

// Unified search page
app.get('/search', (req, res) => {
    const q = (req.query.q || '').trim();
    const authUser = req.session.userId ? getUserById(req.session.userId) : null;
    let users = [];
    try {
        if (q) {
            users = searchUsers({ query: q, limit: 20, excludeUserId: req.session.userId });
        }
    } catch (e) {
        console.error('Search route error:', e);
    }

    if (!q || users.length === 0) {
        return res.status(200).render('search-zero-results', {
            title: 'Search - Dream X',
            currentPage: 'search',
            authUser,
            query: q
        });
    }

    res.render('search', {
        title: `Search: ${q} - Dream X`,
        currentPage: 'search',
        authUser,
        q,
        users
    });
});

// Create post
app.post('/feed/post', postUpload.fields([{ name: 'media', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { contentType, textContent, activityLabel } = req.body;
    const mediaUrl = req.files && req.files['media'] ? `/uploads/posts/${req.files['media'][0].filename}` : null;
    const audioUrl = req.files && req.files['audio'] ? `/uploads/posts/${req.files['audio'][0].filename}` : null;
    // Server-side validation: no images in reels (allow GIF), enforce media type
    const mime = (req.files && req.files['media'] && req.files['media'][0].mimetype ? req.files['media'][0].mimetype.toLowerCase() : null);
    if (contentType === 'video') {
        if (!mime || !(mime.startsWith('video/') || mime === 'image/gif')) {
            return res.status(400).send('Reels require a video or GIF.');
        }
    }
    if (contentType === 'image') {
        if (!mime || !mime.startsWith('image/')) {
            return res.status(400).send('Image posts require an image file.');
        }
    }
    // Treat 'video' button as Reel; images stay images; text stays text
    const isReel = contentType === 'video' ? 1 : 0;
    createPost({
        userId: req.session.userId,
        contentType: contentType || 'text',
        textContent,
        mediaUrl,
        audioUrl,
        activityLabel,
        isReel
    });
    res.redirect('/feed');
});

// Get following users with reel counts (MUST be before /api/users/:id/reels to avoid route collision)
app.get('/api/users/following/reels', (req, res) => {
    console.log('🎬 Reels endpoint hit - Session userId:', req.session.userId);
    if (!req.session.userId) {
        console.log('❌ Reels endpoint: No session userId, returning 401');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '12', 10), 1), 200); // cap
        console.log('🎬 Reels query params - page:', page, 'pageSize:', pageSize);
        
        let rawFollowing;
        try {
            console.log('🎬 Fetching following list for user:', req.session.userId);
            rawFollowing = getFollowing(req.session.userId, 500);
            console.log('🎬 Following list count:', rawFollowing ? rawFollowing.length : 0);
        } catch (err) {
            console.error('❌ Error getting following list:', err);
            console.error('❌ Stack:', err.stack);
            rawFollowing = null;
        }
        
        // Handle case when user follows no one or following fetch failed
        if (!rawFollowing || !Array.isArray(rawFollowing) || rawFollowing.length === 0) {
            console.log('🎬 No following users found, returning empty result');
            return res.json({ users: [], page: 1, pageSize, total: 0, totalPages: 0 });
        }
        
        // Map users with reel counts and filter out users with no active reels
        console.log('🎬 Processing reel counts for', rawFollowing.length, 'users');
        const usersWithReels = rawFollowing.map(u => {
            try {
                const reelCount = require('./db').getActiveReelCount(u.id) || 0;
                if (reelCount > 0) {
                    console.log(`  ✓ User ${u.id} (${u.full_name}): ${reelCount} reels`);
                }
                return {
                    id: u.id,
                    full_name: u.full_name,
                    profile_picture: u.profile_picture,
                    reelCount
                };
            } catch (err) {
                console.error(`❌ Error getting reel count for user ${u.id}:`, err);
                return null;
            }
        }).filter(u => u !== null && u.reelCount > 0); // Only include users with active reels
        
        console.log('🎬 Users with active reels:', usersWithReels.length);
        
        // Sort by reel count (descending) so most active are first
        usersWithReels.sort((a, b) => b.reelCount - a.reelCount);
        
        // Paginate the filtered results
        const startIndex = (page - 1) * pageSize;
        const users = usersWithReels.slice(startIndex, startIndex + pageSize);
        const total = usersWithReels.length;
        const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
        
        console.log('🎬 Returning', users.length, 'users, page', page, 'of', totalPages);
        res.json({ users, page, pageSize, total, totalPages });
    } catch (error) {
        console.error('❌ Get following reels error:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ error: 'Failed to retrieve following reels' });
    }
});

// API: get reels for a user, filtering 48h expiry based on client timezone offset
app.get('/api/users/:id/reels', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const uid = parseInt(req.params.id, 10);
    if (!uid) return res.status(400).json({ error: 'Invalid user id' });
    const tzOffsetMin = parseInt(req.query.tzOffset || '0', 10); // minutes difference from UTC
    try {
        const rows = db.prepare(`
            SELECT p.*, u.full_name, u.profile_picture
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = ? AND p.is_reel = 1 AND p.created_at >= datetime('now', '-48 hours')
            ORDER BY p.created_at DESC
        `).all(uid);
        // Apply 48h expiry based on user's local time (client-provided offset) as a double-check
        const now = new Date();
        const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
        const active = rows.filter(r => {
            const createdUTC = new Date(r.created_at).getTime();
            const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
            return (nowLocalMs - createdLocal) < (48 * 60 * 60 * 1000);
        });
        res.json({ reels: active });
    } catch (e) {
        console.error('list reels error', e);
        res.status(500).json({ error: 'Failed to load reels' });
    }
});

// API: count reels (active within 48h) for avatar dot and click behavior
app.get('/api/users/:id/reels/count', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const uid = parseInt(req.params.id, 10);
    if (!uid) return res.status(400).json({ error: 'Invalid user id' });
    const tzOffsetMin = parseInt(req.query.tzOffset || '0', 10);
    try {
        const rows = db.prepare(`SELECT created_at FROM posts WHERE user_id = ? AND is_reel = 1 AND created_at >= datetime('now', '-48 hours') ORDER BY created_at DESC`).all(uid);
        const now = new Date();
        const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
        const count = rows.filter(r => {
            const createdUTC = new Date(r.created_at).getTime();
            const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
            return (nowLocalMs - createdLocal) < (48 * 60 * 60 * 1000);
        }).length;
        res.json({ count });
    } catch (e) {
        res.json({ count: 0 });
    }
});

    // View single post page
    app.get('/post/:id', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const postId = parseInt(req.params.id, 10);
        if (!postId) return res.redirect('/feed');
        try {
            const post = require('./db').getPostById(postId);
            if (!post) return res.redirect('/feed');
            // augment with current user's reaction
            try { post.user_reaction = getUserReactionForPost({ postId, userId: req.session.userId }); } catch(e) {}
            res.render('post-detail', {
                title: 'Post - Dream X',
                currentPage: 'feed',
                post
            });
        } catch (e) {
            console.error('get post error', e);
            return res.redirect('/feed');
        }
    });

// Get reactions summary for a post
app.get('/api/posts/:postId/reactions', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.postId, 10);
    const counts = getPostReactionsSummary(postId);
    const userReaction = getUserReactionForPost({ postId, userId: req.session.userId });
    res.json({ counts, userReaction });
});

// React to a post (toggle if same type)
app.post('/api/posts/:postId/react', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.postId, 10);
    const { type } = req.body;
    const allowed = ['like','love','clap','fire','rocket','celebrate'];
    if (!allowed.includes(type)) return res.status(400).json({ error: 'Invalid reaction' });
    try {
        const result = setPostReaction({ postId, userId: req.session.userId, reactionType: type });
        
        // Get post details for notification
        const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
        
        // Send notification to post author (if not reacting to own post and reaction was set/updated)
        if (post && post.user_id !== req.session.userId && result.status !== 'cleared') {
            const reactor = getUserById(req.session.userId);
            createNotification({
                userId: post.user_id,
                type: 'reaction',
                title: 'New reaction',
                message: `${reactor.full_name} reacted ${type} to your post`,
                link: `/post/${postId}`
            });
            
            io.to(`user-${post.user_id}`).emit('notification', {
                type: 'reaction',
                title: 'New reaction',
                message: `${reactor.full_name} reacted ${type} to your post`,
                link: `/post/${postId}`,
                timestamp: new Date().toISOString()
            });
            
            // Send email notification if enabled
            const author = getUserById(post.user_id);
            if (author && author.email_notifications === 1) {
                const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                await emailService.sendPostReactionEmail(author, reactor, type, postId, baseUrl, req);
            }
        }
        
        io.emit('post-reaction', { postId, userId: req.session.userId, type, status: result.status, counts: result.counts });
        res.json({ success: true, status: result.status, counts: result.counts });
    } catch (e) {
        console.error('react error', e);
        res.status(500).json({ error: 'Failed to react' });
    }
});

// List comments for a post (paged)
app.get('/api/posts/:postId/comments', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.postId, 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const offset = parseInt(req.query.offset || '0', 10);
    try {
        const comments = getPostComments({ postId, limit, offset }).map(c => {
            const liked = !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(c.id, req.session.userId);
            return { ...c, user_starred: liked };
        });
        const total = getCommentsCount(postId);
        res.json({ comments, total });
    } catch (e) {
        console.error('list comments error', e);
        res.status(500).json({ error: 'Failed to load comments' });
    }
});

// Add a comment to a post
app.post('/api/posts/:postId/comments', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.postId, 10);
    const content = (req.body.content || '').trim();
    const parentId = req.body.parentId ? parseInt(req.body.parentId, 10) : null;
    if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
    try {
        // Validate parent if provided
        let parentAuthorId = null;
        if (parentId) {
            const parent = db.prepare('SELECT id, post_id, user_id FROM post_comments WHERE id = ?').get(parentId);
            if (!parent || Number(parent.post_id) !== Number(postId)) {
                return res.status(400).json({ error: 'Invalid parent comment' });
            }
            parentAuthorId = parent.user_id;
        }
        
        const commentId = addPostComment({ postId, userId: req.session.userId, content, parentId: parentId || null });
        const comment = db.prepare(`
          SELECT c.*, u.full_name, u.profile_picture,
            (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS star_count,
            pc.user_id as parent_author_id,
            pu.full_name as parent_author_name
          FROM post_comments c
          JOIN users u ON u.id = c.user_id
          LEFT JOIN post_comments pc ON pc.id = c.parent_id
          LEFT JOIN users pu ON pu.id = pc.user_id
          WHERE c.id = ?
        `).get(commentId);
        
        // Get post details for notification
        const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
        const commenter = getUserById(req.session.userId);
        
        // Send notification to post author (if not commenting on own post)
        if (post && post.user_id !== req.session.userId && !parentId) {
            createNotification({
                userId: post.user_id,
                type: 'comment',
                title: 'New comment',
                message: `${commenter.full_name} commented on your post`,
                link: `/post/${postId}`
            });
            
            io.to(`user-${post.user_id}`).emit('notification', {
                type: 'comment',
                title: 'New comment',
                message: `${commenter.full_name} commented on your post`,
                link: `/post/${postId}`,
                timestamp: new Date().toISOString()
            });
            
            // Send email notification if enabled
            const author = getUserById(post.user_id);
            if (author && author.email_notifications === 1) {
                const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                await emailService.sendPostCommentEmail(author, commenter, content, postId, baseUrl, req);
            }
        }
        
        // Send notification to parent comment author (if replying to someone else's comment)
        if (parentAuthorId && parentAuthorId !== req.session.userId) {
            createNotification({
                userId: parentAuthorId,
                type: 'reply',
                title: 'New reply',
                message: `${commenter.full_name} replied to your comment`,
                link: `/post/${postId}`
            });
            
            io.to(`user-${parentAuthorId}`).emit('notification', {
                type: 'reply',
                title: 'New reply',
                message: `${commenter.full_name} replied to your comment`,
                link: `/post/${postId}`,
                timestamp: new Date().toISOString()
            });
            
            // Send email notification if enabled
            const parentAuthor = getUserById(parentAuthorId);
            if (parentAuthor && parentAuthor.email_notifications === 1) {
                const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                await emailService.sendCommentReplyEmail(parentAuthor, commenter, content, postId, baseUrl, req);
            }
        }
        
        io.emit('post-comment', { postId, comment });
        res.json({ success: true, comment });
    } catch (e) {
        console.error('add comment error', e);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Star (like) a comment (toggle)
app.post('/api/comments/:commentId/star', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = parseInt(req.params.commentId, 10);
    try {
        const result = toggleCommentLike({ commentId, userId: req.session.userId });
        
        // Get comment details for notification
        const comment = db.prepare('SELECT post_id, user_id FROM post_comments WHERE id = ?').get(commentId);
        
        // Send notification to comment author (if liking someone else's comment and it was liked, not unliked)
        if (comment && comment.user_id !== req.session.userId && result.liked) {
            const liker = getUserById(req.session.userId);
            createNotification({
                userId: comment.user_id,
                type: 'like',
                title: 'Comment liked',
                message: `${liker.full_name} liked your comment`,
                link: `/post/${comment.post_id}`
            });
            
            io.to(`user-${comment.user_id}`).emit('notification', {
                type: 'like',
                title: 'Comment liked',
                message: `${liker.full_name} liked your comment`,
                link: `/post/${comment.post_id}`,
                timestamp: new Date().toISOString()
            });
            
            // Send email notification if enabled
            const author = getUserById(comment.user_id);
            if (author && author.email_notifications === 1) {
                const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                await emailService.sendCommentLikeEmail(author, liker, comment.post_id, baseUrl, req);
            }
        }
        
        io.emit('comment-star', { postId: comment?.post_id, commentId, liked: result.liked, starCount: result.starCount });
        res.json({ success: true, liked: result.liked, starCount: result.starCount });
    } catch (e) {
        console.error('star comment error', e);
        res.status(500).json({ error: 'Failed to star comment' });
    }
});

// Profile page (current user)
app.get('/profile', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    // Prevent caching of profile to ensure fresh content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const goals = row.goals ? JSON.parse(row.goals) : [];
    const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
    let userPosts = getUserPosts(req.session.userId).filter(p => !p.is_reel);
    // enrich posts with current user's reaction and ensure reactions map exists
    userPosts = userPosts.map(p => {
        try {
            p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
            p.reactions = p.reactions || {};
        } catch (e) {}
        return p;
    });
    
    const followerCount = getFollowerCount(req.session.userId);
    const followingCount = getFollowingCount(req.session.userId);
    
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
        passions,
        skills: skillsList,
        stats: { posts: userPosts.length, followers: followerCount, following: followingCount, sessions: 0 },
        isSeller: false,
        bannerImage: row.banner_image,
        onboarding: {
            first_goal: row.first_goal || null,
            first_goal_date: row.first_goal_date || null,
            first_goal_metric: row.first_goal_metric || null,
            first_goal_public: Number(row.first_goal_public) === 1,
            progress_visibility: row.progress_visibility || 'public',
            daily_time_commitment: row.daily_time_commitment || null,
            best_time: row.best_time || null,
            reminder_frequency: row.reminder_frequency || null,
            accountability_style: (function(){ try { return row.accountability_style ? JSON.parse(row.accountability_style) : []; } catch(e) { return []; } })(),
            content_preferences: (function(){ try { return row.content_preferences ? JSON.parse(row.content_preferences) : []; } catch(e) { return []; } })(),
            content_format_preference: row.content_format_preference || null,
            open_to_mentoring: row.open_to_mentoring || null
        }
    };
    const projects = [];
    const services = getUserServices(req.session.userId);
    const me = getUserById(req.session.userId);
    const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');
    
    res.render('profile', {
        title: `${user.displayName} - Profile - Dream X`,
        currentPage: 'profile',
        user,
        authUser: me,
        projects,
        services,
        userPosts,
        profileUserId: row.id,
        profilePicture: row.profile_picture || null,
        isOwnProfile: true,
        isFollowing: false,
        isSuperAdmin
    });
});
// Public profile by ID (view others) — only match numeric IDs to avoid catching '/profile/edit'
app.get('/profile/:id(\\d+)', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const uid = parseInt(req.params.id, 10);
    if (!uid || isNaN(uid)) return res.redirect('/feed');
    const row = getUserById(uid);
    if (!row) {
        return res.status(404).render('profile-not-found', {
            title: 'Profile Not Found - Dream X',
            currentPage: 'profile',
            userId: uid
        });
    }
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const goals = row.goals ? JSON.parse(row.goals) : [];
    const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
    let userPosts = getUserPosts(uid).filter(p => !p.is_reel);
    userPosts = userPosts.map(p => {
        try {
            p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
            p.reactions = p.reactions || {};
        } catch (e) {}
        return p;
    });
    
    // Check if viewing own profile
    const viewingOwnProfile = (uid === req.session.userId);
    const isBlockedByViewer = viewingOwnProfile ? false : isUserBlocked({ userId: req.session.userId, targetId: uid });
    
    const followerCount = getFollowerCount(uid);
    const followingCount = getFollowingCount(uid);
    const isFollowingUser = isFollowing({ followerId: req.session.userId, followingId: uid });
    
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
        passions,
        skills: skillsList,
        stats: { posts: userPosts.length, followers: followerCount, following: followingCount, sessions: 0 },
        isSeller: false,
        bannerImage: row.banner_image,
        onboarding: {
            first_goal: row.first_goal || null,
            first_goal_date: row.first_goal_date || null,
            first_goal_metric: row.first_goal_metric || null,
            first_goal_public: Number(row.first_goal_public) === 1,
            progress_visibility: row.progress_visibility || 'public',
            daily_time_commitment: row.daily_time_commitment || null,
            best_time: row.best_time || null,
            reminder_frequency: row.reminder_frequency || null,
            accountability_style: (function(){ try { return row.accountability_style ? JSON.parse(row.accountability_style) : []; } catch(e) { return []; } })(),
            content_preferences: (function(){ try { return row.content_preferences ? JSON.parse(row.content_preferences) : []; } catch(e) { return []; } })(),
            content_format_preference: row.content_format_preference || null,
            open_to_mentoring: row.open_to_mentoring || null
        }
    };
    const projects = [];
    const services = getUserServices(uid);
    const me = getUserById(req.session.userId);
    const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');
    
    res.render('profile', {
        title: `${user.displayName} - Profile - Dream X`,
        currentPage: 'profile',
        user,
        authUser: me,
        projects,
        services,
        userPosts,
        profileUserId: uid,
        profilePicture: row.profile_picture || null,
        isOwnProfile: viewingOwnProfile,
        isFollowing: isFollowingUser,
        isSuperAdmin,
        isBlockedByViewer
    });
});

// Edit Profile form (placeholder values pulled from same user object shape)
app.get('/profile/edit', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const authUser = { id: row.id, full_name: row.full_name, email: row.email, profile_picture: row.profile_picture, banner_image: row.banner_image, handle: row.handle };
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || '',
        passions,
        skills: row.skills || '',
        location: row.location || ''
    };
    const allPassions = ['Coding','Design','Music','Fitness','Writing','Academics','Entrepreneurship','Art','Photography','Public Speaking','Languages'];
    res.render('edit-profile', {
        title: 'Edit Profile - Dream X',
        currentPage: 'profile',
        authUser,
        user,
        allPassions
    });
});

// Handle edit profile submission with banner support
app.post('/profile/edit', upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]), (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { displayName, bio, passions, skills, location } = req.body;
    const selectedPassions = Array.isArray(passions) ? passions : (passions ? [passions] : []);
    
    // Update profile data
    updateUserProfile({
        userId: req.session.userId,
        fullName: displayName,
        bio,
        location,
        skills
    });
    
    // Update passions
    updateOnboarding({
        userId: req.session.userId,
        categories: selectedPassions,
        goals: [],
        experience: null
    });
    
    // Update profile picture if uploaded
    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
        updateProfilePicture({
            userId: req.session.userId,
            filename: `profiles/${req.files.profilePicture[0].filename}`
        });
    }
    
    // Update banner image if uploaded
    if (req.files && req.files.bannerImage && req.files.bannerImage[0]) {
        updateBannerImage({
            userId: req.session.userId,
            filename: `profiles/${req.files.bannerImage[0].filename}`
        });
    }
    
    console.log('🛠️ Profile update submitted:', {
        displayName,
        bio,
        passions: selectedPassions,
        skills,
        location,
        picture: req.files && req.files.profilePicture ? req.files.profilePicture[0].filename : 'no change',
        banner: req.files && req.files.bannerImage ? req.files.bannerImage[0].filename : 'no change'
    });
    res.redirect('/profile');
});

// Services marketplace page
app.get('/services', (req, res) => {
    console.log('🟢 SERVICES PAGE LOADED');
    console.log('🟢 Session ID:', req.sessionID);
    console.log('🟢 req.session.userId:', req.session.userId);
    console.log('🟢 req.user:', req.user ? req.user.id : 'none');
    console.log('🟢 Cookie header:', req.headers.cookie);
    console.log('🟢 Full session object:', req.session);
    
    const categories = [
        'Tutoring',
        'Mentorship',
        'Coaching',
        'Workshops',
        'Consulting',
        'Design Services',
        'Development',
        'Writing & Content',
        'Marketing & SEO',
        'Video & Photography',
        'Audio & Music',
        'Business Strategy',
        'Legal Services',
        'Financial Planning',
        'Health & Wellness',
        'Language Learning',
        'Career Services',
        'Data & Analytics',
        'Virtual Assistance',
        'Project Management',
        'Other'
    ];
    const { category, priceRange, experience, format } = req.query;
    
    const services = getAllServices({
        category,
        priceRange,
        experienceLevel: experience,
        format,
        limit: 100
    });
    
    res.render('services', {
        title: 'Services Marketplace - Dream X',
        currentPage: 'services',
        categories,
        services
    });
});

// Create service page
app.get('/services/new', ensureAuthenticated, (req, res) => {
    res.render('create-service', {
        title: 'Create Service - Dream X',
        currentPage: 'services'
    });
});

// Service details page (real data + reviews)
app.get('/services/:id', (req, res) => {
    const { id } = req.params;
    const service = getService(id);
    
    if (!service) {
        return res.status(404).render('404', { title: 'Service Not Found' });
    }

    // Calculate session price and decorate object for template
    service.pricePerSession = (service.price_per_hour * (service.duration_minutes / 60)).toFixed(2);
    service.name = service.title;
    service.provider = {
        name: service.full_name,
        passion: service.category
    };
    service.rating = service.rating_avg || 0;
    service.reviewsCount = service.rating_count || 0;
    service.about = service.description;
    service.included = [
        `${service.duration_minutes}-minute live session`,
        'Personalized feedback & refactor suggestions',
        'Actionable next steps roadmap',
        'Follow-up summary notes'
    ];
    service.idealFor = [
        'Self-taught developers seeking structure',
        'Junior engineers preparing for interviews',
        'Makers refining MVP architecture'
    ];

    // Load latest reviews
    let reviews = [];
    try {
        const authUserId = req.session.userId || null;
        const authUser = authUserId ? getUserById(authUserId) : null;
        const isAdmin = authUser && ['admin', 'super_admin', 'global_admin'].includes(authUser.role);
        reviews = db.getServiceReviews({ serviceId: id, limit: 20, offset: 0, isAdmin }).map(r => ({
            id: r.id,
            user: r.full_name,
            rating: r.rating,
            comment: r.comment,
            profile_picture: r.profile_picture
        }));
    } catch (e) { reviews = []; }

    // Determine permissions
    const authUserId = req.session.userId || null;
    const isOwner = authUserId ? (Number(service.user_id) === Number(authUserId)) : false;
    let canReview = false;
    if (authUserId && !isOwner) {
        try {
            canReview = require('./db').isVerifiedPurchaser({ serviceId: Number(id), userId: authUserId });
        } catch (e) { canReview = false; }
    }

    res.render('service-details', {
        title: `${service.name} - Service - Dream X`,
        currentPage: 'services',
        service,
        reviews,
        canReview,
        isOwner
    });
});

// Edit service (owner)
app.get('/services/:id/edit', ensureAuthenticated, (req, res) => {
    const { id } = req.params;
    const service = getService(id);
    if (!service) return res.status(404).render('404', { title: 'Service Not Found' });
    if (Number(service.user_id) !== Number(req.session.userId) && !isAdmin(getUserById(req.session.userId))) {
        return res.redirect(`/services/${id}`);
    }
    res.render('edit-service', { title: `Edit Service - ${service.title}`, currentPage: 'services', service });
});

app.post('/services/:id/edit', ensureAuthenticated, (req, res) => {
    const { id } = req.params;
    const service = getService(id);
    if (!service) return res.redirect('/services');
    const me = getUserById(req.session.userId);
    const isOwner = Number(service.user_id) === Number(req.session.userId);
    const canAdminEdit = isSuperAdmin(me) || isGlobalAdmin(me);
    const allowed = ['title','description','category','pricePerHour','durationMinutes','experienceLevel','format','availability','location','tags'];
    const payload = {};
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k];
    if (isOwner) {
        const ok = updateService({
            serviceId: Number(id), userId: req.session.userId,
            title: payload.title || service.title,
            description: payload.description || service.description,
            category: payload.category || service.category,
            pricePerHour: payload.pricePerHour ? parseFloat(payload.pricePerHour) : service.price_per_hour,
            durationMinutes: payload.durationMinutes ? parseInt(payload.durationMinutes) : service.duration_minutes,
            experienceLevel: payload.experienceLevel ?? service.experience_level,
            format: payload.format || service.format,
            availability: payload.availability ?? service.availability,
            location: payload.location ?? service.location,
            tags: payload.tags ?? service.tags,
            imageUrl: service.image_url || null
        });
        return res.redirect(ok ? `/services/${id}` : `/services/${id}/edit?error=Update+failed`);
    }
    if (canAdminEdit) {
        const ok = require('./db').adminUpdateServiceContent({
            serviceId: Number(id),
            fields: {
                title: payload.title || service.title,
                description: payload.description || service.description,
                category: payload.category || service.category,
                price_per_hour: payload.pricePerHour ? parseFloat(payload.pricePerHour) : service.price_per_hour,
                duration_minutes: payload.durationMinutes ? parseInt(payload.durationMinutes) : service.duration_minutes,
                experience_level: payload.experienceLevel ?? service.experience_level,
                format: payload.format || service.format,
                availability: payload.availability ?? service.availability,
                location: payload.location ?? service.location,
                tags: payload.tags ?? service.tags
            }
        });
        return res.redirect(ok ? `/services/${id}` : `/services/${id}/edit?error=Admin+update+failed`);
    }
    return res.redirect(`/services/${id}`);
});

// API: Service reviews
app.get('/api/services/:id/reviews', (req, res) => {
    const serviceId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const offset = parseInt(req.query.offset || '0', 10);
    try {
        const authUserId = req.session.userId || null;
        const authUser = authUserId ? getUserById(authUserId) : null;
        const isAdmin = authUser && ['admin', 'super_admin', 'global_admin'].includes(authUser.role);
        const reviews = getServiceReviews({ serviceId, limit, offset, isAdmin });
        const summary = getServiceRatingsSummary(serviceId);
        res.json({ success: true, reviews, summary });
    } catch (e) {
        console.error('list service reviews error', e);
        res.status(500).json({ success: false, error: 'Failed to load reviews' });
    }
});

app.post('/api/services/:id/reviews', ensureAuthenticated, async (req, res) => {
    const serviceId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    const { rating, comment } = req.body;
    const r = parseInt(rating, 10);
    if (!(r >= 1 && r <= 5)) return res.status(400).json({ success: false, error: 'Invalid rating' });
    try {
        const service = getService(serviceId);
        if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
        if (Number(service.user_id) === Number(userId)) return res.status(403).json({ success: false, error: 'Owners cannot review their own service' });
        const verified = isVerifiedPurchaser({ serviceId, userId });
        if (!verified) return res.status(403).json({ success: false, error: 'Only verified purchasers can review' });

        const reviewId = addOrUpdateServiceReview({ serviceId, userId, rating: r, comment: (comment || '').trim() });

        // Notify service owner
        try {
            const owner = getUserById(service.user_id);
            const reviewer = getUserById(userId);
            createNotification({
                userId: service.user_id,
                type: 'service_review',
                title: 'New service review',
                message: `${reviewer.full_name} rated your service ${r}★`,
                link: `/services/${serviceId}`
            });
            io.to(`user-${service.user_id}`).emit('notification', {
                type: 'service_review',
                title: 'New service review',
                message: `${reviewer.full_name} rated your service ${r}★`,
                link: `/services/${serviceId}`,
                timestamp: new Date().toISOString()
            });
            if (owner && owner.email_notifications === 1) {
                const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
                await emailService.sendServiceReviewEmail(owner, reviewer, service, r, (comment || ''), baseUrl, req);
            }
        } catch (e) { /* noop */ }

        const summary = getServiceRatingsSummary(serviceId);
        res.json({ success: true, reviewId, summary });
    } catch (e) {
        console.error('add service review error', e);
        res.status(500).json({ success: false, error: 'Failed to submit review' });
    }
});

// Moderate service review (admin only)
app.post('/api/reviews/:id/moderate', ensureAuthenticated, (req, res) => {
    const reviewId = parseInt(req.params.id, 10);
    const { action } = req.body;
    const moderatorId = req.session.userId;
    
    try {
        const moderator = getUserById(moderatorId);
        if (!moderator || !['admin', 'super_admin', 'global_admin'].includes(moderator.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        if (action === 'hide') {
            hideServiceReview({ reviewId, moderatorId });
        } else if (action === 'delete') {
            deleteServiceReview({ reviewId, moderatorId });
        } else if (action === 'restore') {
            restoreServiceReview({ reviewId, moderatorId });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        res.json({ success: true });
    } catch (e) {
        console.error('moderate service review error', e);
        res.status(500).json({ success: false, error: 'Failed to moderate review' });
    }
});

// Start a chat with a user (create or open conversation) and redirect
app.get('/messages/start/:userId', ensureAuthenticated, (req, res) => {
    const otherId = parseInt(req.params.userId, 10);
    if (isNaN(otherId) || otherId <= 0) return res.redirect('/messages');
    if (otherId === req.session.userId) return res.redirect('/messages');
    const conv = getOrCreateConversation({ user1Id: req.session.userId, user2Id: otherId });
    return res.redirect(`/messages?conversation=${conv.id}`);
});

// Book a service (placeholder: creates a completed order; integrate Stripe later)
app.post('/services/:id/book', ensureAuthenticated, (req, res) => {
    const serviceId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    try {
        const s = getService(serviceId);
        if (!s) return res.status(404).json({ success: false, error: 'Service not found' });
        if (Number(s.user_id) === Number(userId)) return res.status(400).json({ success: false, error: 'Cannot book your own service' });

        // Ensure payment method exists (default card or bank info)
        const methods = getPaymentMethods(userId) || [];
        const hasCard = methods.length > 0;
        const user = getUserById(userId);
        const hasBank = !!(user && user.bank_account_number && user.bank_routing_number);
        if (!hasCard && !hasBank) {
            return res.status(402).json({
                success: false,
                requirePayment: true,
                error: 'Payment method required to complete booking.'
            });
        }

        // Compute amount based on selected session length (minutes)
        const sessionLength = parseInt((req.body.sessionLength || s.duration_minutes), 10);
        const hours = Math.max(0.5, (sessionLength || 60) / 60);
        const amount = Math.round((s.price_per_hour * hours) * 100) / 100; // 2 decimals

        // Mock charge and record order
        const orderId = require('./db').addServiceOrder({ serviceId, buyerId: userId, status: 'completed' });
        try {
            createInvoice({ userId, amount, tier: 'service-booking', status: 'paid' });
        } catch (e) { /* non-blocking */ }
        return res.json({ success: true, orderId, amount });
    } catch (e) {
        console.error('book service error', e);
        return res.status(500).json({ success: false, error: 'Booking failed' });
    }
});

// Messages page - Real messaging with database
app.get('/messages', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    // Prevent caching of messages to ensure fresh content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const conversations = getUserConversations(req.session.userId);
    let currentConversation = null;
    let messages = [];
    let participants = [];
    let moderationTarget = null;
    let blockState = null;

    if (conversations.length > 0) {
        const requestedId = parseInt(req.query.conversation || '', 10);
        if (!isNaN(requestedId)) {
            currentConversation = conversations.find(c => c.id === requestedId) || conversations[0];
        } else {
            currentConversation = conversations[0];
        }
        messages = getConversationMessages(currentConversation.id);
        if (currentConversation.is_group) {
            participants = getConversationParticipants(currentConversation.id);
        }
        if (!currentConversation.is_group) {
            const otherParticipantId = currentConversation.other_user_id || (currentConversation.user1_id === req.session.userId ? currentConversation.user2_id : currentConversation.user1_id);
            const otherUser = getUserById(otherParticipantId);
            if (otherUser) {
                moderationTarget = {
                    id: otherUser.id,
                    full_name: otherUser.full_name,
                    account_status: otherUser.account_status || 'active',
                    suspension_until: otherUser.suspension_until || null,
                    chat_privileges_frozen: otherUser.chat_privileges_frozen === 1
                };
            }
            blockState = {
                viewerBlocked: isUserBlocked({ userId: req.session.userId, targetId: otherParticipantId }),
                blockedByOther: isUserBlocked({ userId: otherParticipantId, targetId: req.session.userId })
            };
        }
        // Mark messages as read
        markMessagesAsRead({ conversationId: currentConversation.id, userId: req.session.userId });
        // Emit read receipt if enabled and direct chat
        try {
            const reader = getUserById(req.session.userId);
            if (reader && reader.read_receipts === 1 && !currentConversation.is_group) {
                const lastReadMessage = db.prepare(`
                  SELECT MAX(id) as maxId
                  FROM messages
                  WHERE conversation_id = ? AND sender_id != ?
                `).get(currentConversation.id, req.session.userId);
                const lastReadMessageId = lastReadMessage && lastReadMessage.maxId ? lastReadMessage.maxId : null;
                if (lastReadMessageId) {
                    io.to(`conversation-${currentConversation.id}`).emit('read-receipt', {
                        conversationId: currentConversation.id,
                        readerId: req.session.userId,
                        lastReadMessageId,
                        at: new Date().toISOString()
                    });
                }
            }
        } catch (e) { /* noop */ }
    }
    
    res.render('messages', {
        title: 'Messages - Dream X',
        currentPage: 'messages',
        conversations,
        currentConversation,
        messages,
        participants,
        moderationTarget,
        blockState,
        currentUserId: req.session.userId
    });
});

// Create group conversation
app.post('/messages/group/create', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { participantIds, groupName } = req.body;
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ error: 'At least one participant required' });
    }
    try {
        const conv = createGroupConversation({
            creatorId: req.session.userId,
            participantIds: participantIds.map(id => parseInt(id, 10)),
            groupName: groupName || 'Group Chat'
        });
        res.json({ success: true, conversationId: conv.id });
    } catch (e) {
        console.error('Group creation error:', e);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// Update group name
app.post('/messages/group/:conversationId/name', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversationId = parseInt(req.params.conversationId, 10);
    const { groupName } = req.body;
    
    if (!groupName || !groupName.trim()) {
        return res.status(400).json({ error: 'Group name required' });
    }
    
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
        return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    try {
        db.prepare('UPDATE conversations SET group_name = ? WHERE id = ? AND is_group = 1').run(groupName.trim(), conversationId);
        res.json({ success: true });
    } catch (e) {
        console.error('Update group name error:', e);
        res.status(500).json({ error: 'Failed to update group name' });
    }
});

// Add member to group
app.post('/messages/group/:conversationId/add', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversationId = parseInt(req.params.conversationId, 10);
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
        return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    try {
        // Check if user is already in the conversation
        const existing = db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
        if (existing) {
            return res.status(400).json({ error: 'User is already in this group' });
        }
        
        db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userId);
        res.json({ success: true });
    } catch (e) {
        console.error('Add member error:', e);
        res.status(500).json({ error: 'Failed to add member' });
    }
});

// Remove member from group
app.post('/messages/group/:conversationId/remove', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversationId = parseInt(req.params.conversationId, 10);
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
        return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    try {
        db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(conversationId, userId);
        res.json({ success: true });
    } catch (e) {
        console.error('Remove member error:', e);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// Leave group
app.post('/messages/group/:conversationId/leave', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversationId = parseInt(req.params.conversationId, 10);
    
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
        return res.status(403).json({ error: 'Not a member of this group' });
    }
    
    try {
        db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(conversationId, req.session.userId);
        res.json({ success: true });
    } catch (e) {
        console.error('Leave group error:', e);
        res.status(500).json({ error: 'Failed to leave group' });
    }
});

// Get conversation messages API (for switching conversations)
app.get('/api/messages/:conversationId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const { conversationId } = req.params;
    const messages = getConversationMessages(conversationId);
    markMessagesAsRead({ conversationId, userId: req.session.userId });
    
    res.json({ messages, userId: req.session.userId });
});

// Start or get a conversation with a user, then redirect
app.get('/messages/start/:userId', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const otherId = parseInt(req.params.userId, 10);
    if (!otherId || isNaN(otherId) || otherId === req.session.userId) return res.redirect('/messages');
    // Respect recipient privacy: allow_messages_from
    const target = getUserById(otherId);
    if (target && (target.allow_messages_from || 'everyone') === 'no_one') {
        return res.redirect('/messages?error=User+is+not+accepting+messages');
    }
    const conv = getOrCreateConversation({ user1Id: req.session.userId, user2Id: otherId });
    res.redirect(`/messages?conversation=${conv.id}`);
});

// User search API for feed search box
app.get('/api/users/search', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    try {
        const results = searchUsers({ query: q, limit: 10, excludeUserId: req.session.userId });
        res.json({ results });
    } catch (e) {
        console.error('User search error:', e);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Send message API (supports optional single or multiple file attachments)
app.post('/api/messages/send', chatUpload.any(), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const sender = getUserById(req.session.userId);
        if (sender && sender.chat_privileges_frozen === 1) {
            return res.status(403).json({ error: 'Chat privileges are currently frozen by an admin.' });
        }
    } catch (e) { /* ignore and continue */ }

    const conversationId = parseInt(req.body.conversationId, 10);
    const replyToMessageId = req.body.replyToMessageId ? parseInt(req.body.replyToMessageId, 10) : null;
    const content = (req.body.content || '').trim();
        // Multer .any() -> files in req.files; support both 'file' and 'files' fields
        let files = Array.isArray(req.files) ? req.files : [];
        // Filter to only accepted field names (support common variants)
        files = files.filter(f => (f.fieldname === 'file' || f.fieldname === 'files' || f.fieldname === 'files[]'));

        if ((!content || content.length === 0) && files.length === 0) {
      return res.status(400).json({ error: 'Message must include text or a file' });
    }

    // Check user is in conversation
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // Fetch conversation for privacy and notifications
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    // Validate reply target belongs to conversation
    let replyContext = null;
    if (replyToMessageId) {
        replyContext = db.prepare('SELECT id, conversation_id FROM messages WHERE id = ?').get(replyToMessageId);
        if (!replyContext || replyContext.conversation_id !== conversationId) {
            return res.status(400).json({ error: 'Invalid reply target' });
        }
    }

    // If direct conversation, enforce recipient privacy setting
    if (!conv.is_group) {
        const otherId = (conv.user1_id === req.session.userId) ? conv.user2_id : conv.user1_id;
        const other = getUserById(otherId);
        if (other && (other.allow_messages_from || 'everyone') === 'no_one' && otherId !== req.session.userId) {
            return res.status(403).json({ error: 'Recipient is not accepting messages' });
        }
    }

    const createdMessageIds = [];
    const createdPayloads = [];

    // If text content provided, send as a standalone message first
    if (content && content.length > 0) {
        const messageId = createMessage({
            conversationId,
            senderId: req.session.userId,
            content,
            attachmentUrl: null,
            attachmentMime: null,
            replyToMessageId
        });
        createdMessageIds.push(messageId);
        const payload = getMessageWithContext(messageId) || {
            id: messageId,
            conversation_id: conversationId,
            sender_id: req.session.userId,
            content,
            attachment_url: null,
            attachment_mime: null,
            reply_to_message_id: replyToMessageId,
            created_at: new Date().toISOString()
        };
        createdPayloads.push(payload);
        io.to(`conversation-${conversationId}`).emit('new-message', payload);
    }

    // Create one message per attachment
    for (const f of files) {
        const attachmentUrl = `/uploads/chat/${f.filename}`;
        const attachmentMime = f.mimetype;
        const messageId = createMessage({
            conversationId,
            senderId: req.session.userId,
            content: '',
            attachmentUrl,
            attachmentMime,
            replyToMessageId: replyToMessageId && !content ? replyToMessageId : null
        });
        createdMessageIds.push(messageId);
        const payload = getMessageWithContext(messageId) || {
            id: messageId,
            conversation_id: conversationId,
            sender_id: req.session.userId,
            content: '',
            attachment_url: attachmentUrl,
            attachment_mime: attachmentMime,
            reply_to_message_id: replyToMessageId,
            created_at: new Date().toISOString()
        };
        createdPayloads.push(payload);
        io.to(`conversation-${conversationId}`).emit('new-message', payload);
    }

    // Get conversation details and participants to send notifications
    const participants = getConversationParticipants(conversationId);
    const sender = getUserById(req.session.userId);
    
    // Create notifications for other participants
    participants.forEach(participant => {
        if (participant.user_id !== req.session.userId) {
            const notifTitle = conv.is_group 
                ? `New message in ${conv.group_name || 'Group Chat'}`
                : `New message from ${sender.full_name}`;
            const notifMessage = content || (files.length > 1 ? `📎 Sent ${files.length} attachments` : '📎 Sent an attachment');
            
            createNotification({
                userId: participant.user_id,
                type: 'message',
                title: notifTitle,
                message: notifMessage,
                link: `/messages?conversation=${conversationId}`
            });
            
            // Emit notification via socket
            io.to(`user-${participant.user_id}`).emit('notification', {
                type: 'message',
                title: notifTitle,
                message: notifMessage,
                link: `/messages?conversation=${conversationId}`,
                timestamp: new Date().toISOString()
            });
        }
    });

    res.json({ success: true, messageIds: createdMessageIds, messages: createdPayloads });
});

// Protected file download
app.get('/uploads/:filename', (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    const filename = req.params.filename;
    // Check if file is a chat attachment
    if (filename.startsWith('chat-')) {
        const msg = db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url = ?`).get(`/uploads/${filename}`);
        if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
            return res.status(403).send('Forbidden');
        }
    }
    res.sendFile(path.join(__dirname, 'public', 'uploads', filename));
});

// Mark messages as read
app.post('/api/messages/:conversationId/read', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const conversationId = parseInt(req.params.conversationId);
    markMessagesAsRead({ conversationId, userId: req.session.userId });
    // Emit read receipt if enabled and direct chat
    try {
        const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
        if (conv && !conv.is_group) {
            const reader = getUserById(req.session.userId);
            if (reader && reader.read_receipts === 1) {
                const lastReadMessage = db.prepare(`
                  SELECT MAX(id) as maxId
                  FROM messages
                  WHERE conversation_id = ? AND sender_id != ?
                `).get(conversationId, req.session.userId);
                const lastReadMessageId = lastReadMessage && lastReadMessage.maxId ? lastReadMessage.maxId : null;
                if (lastReadMessageId) {
                    io.to(`conversation-${conversationId}`).emit('read-receipt', {
                        conversationId,
                        readerId: req.session.userId,
                        lastReadMessageId,
                        at: new Date().toISOString()
                    });
                }
            }
        }
    } catch (e) { /* noop */ }
    
    res.json({ success: true });
});

// React to a message
app.post('/api/messages/:messageId/react', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const messageId = parseInt(req.params.messageId);
    const { reactionType = 'like' } = req.body;
    
    // Verify message exists and user has access
    const msg = db.prepare('SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.id = ?').get(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
        return res.status(403).json({ error: 'Not authorized' });
    }
    
    const result = setMessageReaction({ messageId, userId: req.session.userId, reactionType });
    
    // Emit reaction event to conversation
    io.to(`conversation-${msg.conversation_id}`).emit('message-reaction', {
        conversationId: msg.conversation_id,
        messageId,
        userId: req.session.userId,
        status: result.status,
        counts: result.counts,
        reactionCounts: result.counts
    });
    
    // Create notification for message sender if someone else reacted
    if (result.status !== 'cleared' && msg.sender_id !== req.session.userId) {
        const reactor = getUserById(req.session.userId);
        createNotification({
            userId: msg.sender_id,
            type: 'reaction',
            title: 'Message reaction',
            message: `${reactor.full_name} reacted ${reactionType} to your message`,
            link: `/messages?conversation=${msg.conversation_id}`
        });
        
        io.to(`user-${msg.sender_id}`).emit('notification', {
            type: 'reaction',
            title: 'Message reaction',
            message: `${reactor.full_name} reacted ${reactionType} to your message`,
            link: `/messages?conversation=${msg.conversation_id}`,
            timestamp: new Date().toISOString()
        });
    }
    
    res.json({ success: true, ...result });
});

// Get reactions for a message
app.get('/api/messages/:messageId/reactions', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const messageId = parseInt(req.params.messageId);
    const reactions = getMessageReactions(messageId);
    const userReaction = getUserReactionForMessage({ messageId, userId: req.session.userId });
    
    res.json({ reactions, userReaction });
});

// Map page - authenticated users only
app.get('/map', ensureAuthenticated, (req, res) => {
    const authUser = getUserById(req.session.userId);
    if (!authUser) return res.redirect('/login');
    
    // Check if user needs to update their location
    const needsLocationUpdate = shouldUpdateLocation(req.session.userId);
    
    // Get all user locations for the map
    const userLocations = getAllUserLocations();
    
    // Get current user's location
    const userLocation = getUserLocation(req.session.userId);
    
    res.render('map', {
        title: 'Map - Dream X',
        currentPage: 'map',
        authUser: {
            ...authUser,
            displayName: authUser.full_name,
            role: authUser.role
        },
        unreadMessageCount: getUnreadMessageCount(req.session.userId),
        userLocations: JSON.stringify(userLocations),
        currentUserLocation: userLocation ? JSON.stringify(userLocation) : null,
        needsLocationUpdate,
        mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || ''
    });
});

// Save user location
app.post('/location', ensureAuthenticated, (req, res) => {
    try {
        const { city, latitude, longitude } = req.body;
        
        // Basic validation
        if (!city || !latitude || !longitude) {
            return res.status(400).json({ error: 'City, latitude, and longitude are required' });
        }
        
        // Validate latitude/longitude ranges
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return res.status(400).json({ error: 'Invalid latitude or longitude values' });
        }
        
        // Sanitize city name
        const sanitizedCity = city.trim().substring(0, 100);
        
        // Save location
        saveUserLocation({
            userId: req.session.userId,
            city: sanitizedCity,
            latitude: lat,
            longitude: lon
        });
        
        res.json({ success: true, message: 'Location saved successfully' });
    } catch (error) {
        console.error('Error saving location:', error);
        res.status(500).json({ error: 'Failed to save location' });
    }
});

// Settings page with full functionality
app.get('/settings', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    // Prevent caching of settings to ensure fresh content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const authUser = { 
        id: row.id,
        email: row.email, 
        fullName: row.full_name,
        displayName: row.full_name,
        handle: row.handle || '',
        emailNotifications: row.email_notifications === 1,
        pushNotifications: row.push_notifications === 1,
        messageNotifications: row.message_notifications === 1,
        email_notifications: row.email_notifications === 1,
        push_notifications: row.push_notifications === 1,
        message_notifications: row.message_notifications === 1,
        account_status: row.account_status,
        suspension_until: row.suspension_until,
        suspension_reason: row.suspension_reason,
        profile_visibility: row.profile_visibility,
        allow_messages_from: row.allow_messages_from,
        discoverable_by_email: row.discoverable_by_email === 1,
        show_online_status: row.show_online_status === 1,
        read_receipts: row.read_receipts === 1,
        bank_account_country: row.bank_account_country,
        bank_account_number: row.bank_account_number
    };
    const linked = { google: false, microsoft: false, apple: false };
    try {
        const accounts = getLinkedAccountsForUser(req.session.userId) || [];
        accounts.forEach(a => { if (a.provider && linked.hasOwnProperty(a.provider)) linked[a.provider] = true; });
    } catch (e) {}
    
    // Get subscription and billing data
    const subscription = getUserSubscription(req.session.userId) || { tier: 'free', status: 'active' };
    const paymentMethods = getPaymentMethods(req.session.userId) || [];
    const invoices = getInvoices(req.session.userId) || [];
    
    // Get billing charges
    const { getUserCharges } = require('./db');
    const charges = getUserCharges({ userId: req.session.userId, limit: 50, offset: 0 }) || [];
    const blockedUsers = getBlockedUsers(req.session.userId) || [];
    
    res.render('settings', {
        title: 'Settings - Dream X',
        currentPage: 'settings',
        authUser,
        linked,
        getUserById,
        subscription,
        paymentMethods,
        invoices,
        charges,
        blockedUsers,
        success: req.query.success,
        refund_submitted: req.query.refund_submitted === 'true',
        error: req.query.error
    });
});

// Billing page
app.get('/billing', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    // Load subscription from dedicated table; default to free if none
    const subscription = getUserSubscription(req.session.userId) || { tier: 'free', status: 'active' };
    const userTier = (subscription.tier || 'free');
    
    res.render('billing', {
        title: 'Billing - Dream X',
        currentPage: 'billing',
        userTier,
        subscription,
        authUser: row
    });
});

// Update account settings
app.post('/settings/account', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { displayName, email, handle } = req.body;
    const fullName = displayName;
    
    if (!fullName || !email || !handle) {
        return res.redirect('/settings?error=All fields required');
    }
    
    // Validate handle format
    const cleanHandle = handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanHandle)) {
        return res.redirect('/settings?error=Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores');
    }
    
    // Check for handle collision (excluding current user)
    const existingHandle = getUserByHandle(cleanHandle);
    if (existingHandle && existingHandle.id !== req.session.userId) {
        return res.redirect('/settings?error=Handle is already taken. Please choose another one');
    }
    
    try {
        updateUserProfile({
            userId: req.session.userId,
            fullName,
            bio: getUserById(req.session.userId).bio || '',
            location: getUserById(req.session.userId).location || '',
            skills: getUserById(req.session.userId).skills || ''
        });
        updateUserHandle({
            userId: req.session.userId,
            handle: cleanHandle
        });
        res.redirect('/settings?success=Account updated successfully');
    } catch (e) {
        console.error('Account update error:', e);
        res.redirect('/settings?error=Failed to update account');
    }
});

// Change password
app.post('/settings/password', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.redirect('/settings?error=All password fields required');
    }
    
    if (newPassword !== confirmPassword) {
        return res.redirect('/settings?error=New passwords do not match');
    }
    
    const complexityCheck = validatePasswordComplexity(newPassword);
    if (!complexityCheck.valid) {
        return res.redirect(`/settings?error=Password must contain ${complexityCheck.errors.join(', ')}.`);
    }
    
    const user = getUserById(req.session.userId);
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!validPassword) {
        return res.redirect('/settings?error=Current password incorrect');
    }
    
    try {
        const hash = await bcrypt.hash(newPassword, 10);
        updatePassword({ userId: req.session.userId, passwordHash: hash });
        res.redirect('/settings?success=Password changed successfully');
    } catch (e) {
        console.error('Password change error', e);
        res.redirect('/settings?error=Failed to change password');
    }
});

// Update notification settings
app.post('/settings/notifications', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    
    // Support both camelCase and snake_case form names
    const emailNotifications = (req.body.email_notifications || req.body.emailNotifications) === 'on';
    const pushNotifications = (req.body.push_notifications || req.body.pushNotifications) === 'on';
    const messageNotifications = (req.body.message_notifications || req.body.messageNotifications) === 'on';
    
    try {
        updateNotificationSettings({
            userId: req.session.userId,
            emailNotifications,
            pushNotifications,
            messageNotifications
        });
        res.redirect('/settings?success=Notification preferences updated');
    } catch (e) {
        console.error('Notification update error:', e);
        res.redirect('/settings?error=Failed to update notifications');
    }
});

// Update privacy settings
app.post('/settings/privacy', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const profileVisibility = (req.body.profile_visibility || 'public').toLowerCase();
    const allowMessagesFrom = (req.body.allow_messages_from || 'everyone').toLowerCase();
    const discoverableByEmail = (req.body.discoverable_by_email === 'on');
    const showOnlineStatus = (req.body.show_online_status === 'on');
    const readReceipts = (req.body.read_receipts === 'on');

    const validVis = ['public','members','private'];
    const validDM = ['everyone','no_one'];
    const vis = validVis.includes(profileVisibility) ? profileVisibility : 'public';
    const dm = validDM.includes(allowMessagesFrom) ? allowMessagesFrom : 'everyone';
    try {
        updatePrivacySettings({
            userId: req.session.userId,
            profileVisibility: vis,
            allowMessagesFrom: dm,
            discoverableByEmail,
            showOnlineStatus,
            readReceipts
        });
        res.redirect('/settings?success=Privacy+settings+updated');
    } catch (e) {
        console.error('Privacy update error:', e);
        res.redirect('/settings?error=Failed+to+update+privacy+settings');
    }
});

// Unlink connected provider with safety guard (must have password or another provider)
app.post('/settings/connections/unlink', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const provider = (req.body.provider || '').toLowerCase();
    if (!['google','microsoft','apple'].includes(provider)) {
        return res.redirect('/settings?error=Unknown provider');
    }
    try {
        const user = getUserById(req.session.userId);
        const accounts = getLinkedAccountsForUser(req.session.userId) || [];
        const remaining = accounts.filter(a => (a.provider || '').toLowerCase() !== provider);
        const isLastLinked = accounts.length <= 1 || remaining.length === 0;
        const hasPassword = !!(user && user.password_hash);
        if (isLastLinked && !hasPassword) {
            return res.redirect('/settings?error=Set+a+password+before+disconnecting+your+last+sign-in+method');
        }
        unlinkProvider({ userId: req.session.userId, provider });
        return res.redirect(`/settings?success=${provider.charAt(0).toUpperCase()+provider.slice(1)}+disconnected`);
    } catch (e) {
        console.error('Unlink error:', e);
        return res.redirect('/settings?error=Failed+to+disconnect+provider');
    }
});

// Billing: Add payment method
app.post('/settings/billing/payment-methods/add', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { cardType, lastFour, expiryMonth, expiryYear, isDefault } = req.body;
    
    if (!cardType || !lastFour || !expiryMonth || !expiryYear) {
        return res.redirect('/settings?error=All payment method fields required');
    }
    
    try {
        addPaymentMethod({
            userId: req.session.userId,
            cardType,
            lastFour,
            expiryMonth: parseInt(expiryMonth),
            expiryYear: parseInt(expiryYear),
            isDefault: isDefault === 'on' ? 1 : 0
        });
        res.redirect('/settings?success=Payment method added');
    } catch (e) {
        console.error('Add payment method error:', e);
        res.redirect('/settings?error=Failed to add payment method');
    }
});

// Billing: Delete payment method
app.post('/settings/billing/payment-methods/:id/delete', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        deletePaymentMethod(parseInt(req.params.id));
        res.redirect('/settings?success=Payment method removed');
    } catch (e) {
        console.error('Delete payment method error:', e);
        res.redirect('/settings?error=Failed to remove payment method');
    }
});

// Billing: Set default payment method
app.post('/settings/billing/payment-methods/:id/set-default', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        setDefaultPaymentMethod(parseInt(req.params.id), req.session.userId);
        res.redirect('/settings?success=Default payment method updated');
    } catch (e) {
        console.error('Set default payment method error:', e);
        res.redirect('/settings?error=Failed to update default payment method');
    }
});

// Billing: Cancel subscription
app.post('/settings/billing/subscription/cancel', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        cancelSubscription(req.session.userId);
        res.redirect('/settings?success=Subscription cancelled');
    } catch (e) {
        console.error('Cancel subscription error:', e);
        res.redirect('/settings?error=Failed to cancel subscription');
    }
});

// Checkout: Process subscription purchase
app.post('/api/checkout/subscribe', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const { tier, cardType, cardNumber, expiryMonth, expiryYear, cvv, saveCard } = req.body;
    
    // Validate tier
    const validTiers = ['free', 'pro-buyer', 'pro-seller', 'elite-seller'];
    if (!validTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier selected' });
    }
    
    // For free tier, no payment needed
    if (tier === 'free') {
        try {
            createOrUpdateSubscription({
                userId: req.session.userId,
                tier: 'free',
                status: 'active'
            });
            return res.json({ success: true, message: 'Downgraded to free tier' });
        } catch (e) {
            console.error('Subscription update error:', e);
            return res.status(500).json({ error: 'Failed to update subscription' });
        }
    }
    
    // Validate payment info for paid tiers
    if (!cardType || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
        return res.status(400).json({ error: 'All payment fields required' });
    }
    
    // Mock payment processing - in production, integrate with Stripe/PayPal
    try {
        // Simulate payment processing delay
        const lastFour = cardNumber.slice(-4);
        
        // Calculate amount based on tier
        const amounts = {
            'pro-buyer': 5.99,
            'pro-seller': 9.99,
            'elite-seller': 29.99
        };
        const amount = amounts[tier] || 0;
        
        // Save payment method if requested
        if (saveCard) {
            addPaymentMethod({
                userId: req.session.userId,
                cardType,
                lastFour,
                expiryMonth: parseInt(expiryMonth),
                expiryYear: parseInt(expiryYear),
                isDefault: 1
            });
        }
        
        // Create subscription
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        createOrUpdateSubscription({
            userId: req.session.userId,
            tier,
            status: 'active',
            endsAt: nextMonth.toISOString()
        });
        
        // Create invoice
        createInvoice({
            userId: req.session.userId,
            amount,
            tier,
            status: 'paid'
        });
        
        res.json({ 
            success: true, 
            message: 'Subscription activated successfully',
            tier,
            amount
        });
    } catch (e) {
        console.error('Checkout error:', e);
        res.status(500).json({ error: 'Payment processing failed. Please try again.' });
    }
});

// Cancel subscription endpoint
app.post('/api/subscription/cancel', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const { reason } = req.body;
    
    try {
        // Log the cancellation reason
        addAuditLog({
            userId: req.session.userId,
            action: 'cancel_subscription',
            details: JSON.stringify({ reason: reason || 'No reason provided' })
        });
        
        // Update subscription to cancelled status
        // In a real app, this would keep access until billing period ends
        createOrUpdateSubscription({
            userId: req.session.userId,
            tier: 'free',
            status: 'cancelled'
        });
        
        res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// API: Add payment method (JSON)
app.post('/api/payment-methods/add', ensureAuthenticated, (req, res) => {
    try {
        const { cardType, cardNumber, expiryMonth, expiryYear, setDefault } = req.body || {};
        if (!cardType || !cardNumber || !expiryMonth || !expiryYear) {
            return res.status(400).json({ success: false, error: 'All card fields required' });
        }
        const lastFour = String(cardNumber).slice(-4);
        addPaymentMethod({
            userId: req.session.userId,
            cardType,
            lastFour,
            expiryMonth: parseInt(expiryMonth, 10),
            expiryYear: parseInt(expiryYear, 10),
            isDefault: setDefault ? 1 : 0
        });
        return res.json({ success: true });
    } catch (e) {
        console.error('API add payment method error:', e);
        return res.status(500).json({ success: false, error: 'Failed to save payment method' });
    }
});

// API: Save bank info (JSON)
app.post('/api/banking/save', ensureAuthenticated, (req, res) => {
    try {
        const { bankCountry, bankAccount, routingNumber } = req.body || {};
        if (!bankCountry || !bankAccount || !routingNumber) {
            return res.status(400).json({ success: false, error: 'All bank fields required' });
        }
        db.prepare('UPDATE users SET bank_account_country = ?, bank_account_number = ?, bank_routing_number = ? WHERE id = ?')
          .run(bankCountry, bankAccount, routingNumber, req.session.userId);
        return res.json({ success: true });
    } catch (e) {
        console.error('API banking save error:', e);
        return res.status(500).json({ success: false, error: 'Failed to save bank info' });
    }
});

// ===== PAYMENT WEBHOOK ROUTES =====
// These routes handle webhook notifications from payment processors

// Stripe webhook endpoint
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    
    try {
        const event = paymentService.verifyWebhook('stripe', {
            rawBody: req.body,
            signature: signature
        });

        console.log('✅ Stripe webhook verified:', event.type);

        // Handle the event
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log('💰 Payment succeeded:', paymentIntent.id);
                // Update invoice status, send confirmation email, etc.
                break;

            case 'payment_intent.payment_failed':
                console.log('❌ Payment failed:', event.data.object.id);
                // Notify user of payment failure
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                const subscription = event.data.object;
                console.log('📦 Subscription updated:', subscription.id);
                // Update user_subscriptions table
                break;

            case 'customer.subscription.deleted':
                const cancelledSub = event.data.object;
                console.log('🚫 Subscription cancelled:', cancelledSub.id);
                // Mark subscription as cancelled
                break;

            case 'invoice.paid':
                const invoice = event.data.object;
                console.log('📄 Invoice paid:', invoice.id);
                // Create invoice record, send receipt
                break;

            case 'invoice.payment_failed':
                console.log('❌ Invoice payment failed:', event.data.object.id);
                // Notify user of failed payment
                break;

            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Lemon Squeezy webhook endpoint
app.post('/webhooks/lemonsqueezy', express.json(), async (req, res) => {
    const signature = req.headers['x-signature'];
    
    try {
        const isValid = paymentService.verifyWebhook('lemonsqueezy', {
            payload: JSON.stringify(req.body),
            signature: signature
        });

        if (!isValid) {
            return res.status(401).send('Invalid signature');
        }

        console.log('✅ Lemon Squeezy webhook verified:', req.body.meta?.event_name);

        const eventName = req.body.meta?.event_name;
        const data = req.body.data;

        switch (eventName) {
            case 'order_created':
                console.log('💰 Order created:', data.id);
                // Process order, create invoice
                break;

            case 'subscription_created':
            case 'subscription_updated':
                console.log('📦 Subscription updated:', data.id);
                // Update user_subscriptions table
                break;

            case 'subscription_cancelled':
                console.log('🚫 Subscription cancelled:', data.id);
                // Mark subscription as cancelled
                break;

            case 'subscription_payment_success':
                console.log('💰 Subscription payment succeeded:', data.id);
                // Create invoice, send receipt
                break;

            case 'subscription_payment_failed':
                console.log('❌ Subscription payment failed:', data.id);
                // Notify user
                break;

            default:
                console.log(`Unhandled Lemon Squeezy event: ${eventName}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Lemon Squeezy webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Square webhook endpoint
app.post('/webhooks/square', express.json(), async (req, res) => {
    const signature = req.headers['x-square-signature'];
    const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    try {
        const isValid = paymentService.verifyWebhook('square', {
            body: JSON.stringify(req.body),
            signature: signature,
            url: webhookUrl
        });

        if (!isValid) {
            return res.status(401).send('Invalid signature');
        }

        console.log('✅ Square webhook verified:', req.body.type);

        const eventType = req.body.type;
        const data = req.body.data?.object;

        switch (eventType) {
            case 'payment.created':
            case 'payment.updated':
                console.log('💰 Payment event:', data?.payment?.id);
                // Update payment status
                break;

            case 'subscription.created':
            case 'subscription.updated':
                console.log('📦 Subscription event:', data?.subscription?.id);
                // Update user_subscriptions table
                break;

            case 'subscription.canceled':
                console.log('🚫 Subscription cancelled:', data?.subscription?.id);
                // Mark subscription as cancelled
                break;

            case 'invoice.published':
            case 'invoice.payment_made':
                console.log('📄 Invoice event:', data?.invoice?.id);
                // Create invoice record
                break;

            default:
                console.log(`Unhandled Square event: ${eventType}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Square webhook error:', error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// API: Create service with subscription check
app.post('/api/services/create', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags } = req.body;
        
        // Check if seller privileges are frozen
        const user = getUserById(userId);
        if (user.seller_privileges_frozen === 1) {
            return res.json({
                success: false,
                error: 'Your seller privileges have been frozen by an administrator. Please contact support.',
                frozen: true
            });
        }
        
        // Get user's subscription
        const subscription = getUserSubscription(userId);
        const tier = subscription ? subscription.tier : 'free';
        
        // Check service limits based on tier
        const serviceLimits = {
            'free': 0,
            'pro-buyer': 0,
            'pro-seller': 5,
            'elite-seller': 999,
            'enterprise': 999
        };
        
        const currentCount = getServiceCount(userId);
        const maxServices = serviceLimits[tier] || 0;
        
        if (currentCount >= maxServices) {
            return res.json({
                success: false,
                error: 'Service limit reached',
                requiresUpgrade: true,
                currentTier: tier,
                currentCount,
                maxServices
            });
        }
        
        // Validate required fields
        if (!title || !description || !category || !pricePerHour || !format) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Create the service
        const serviceId = createService({
            userId,
            title,
            description,
            category,
            pricePerHour: parseFloat(pricePerHour),
            durationMinutes: parseInt(durationMinutes) || 60,
            experienceLevel,
            format,
            availability,
            location,
            tags,
            imageUrl: null
        });
        
        res.json({ success: true, serviceId });
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ success: false, error: 'Failed to create service' });
    }
});

// API: Check service creation eligibility
app.get('/api/services/check-eligibility', ensureAuthenticated, (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Check if seller privileges are frozen
        const user = getUserById(userId);
        if (user.seller_privileges_frozen === 1) {
            return res.json({
                success: false,
                canCreate: false,
                frozen: true,
                error: 'Your seller privileges have been frozen by an administrator.'
            });
        }
        
        const subscription = getUserSubscription(userId);
        const tier = subscription ? subscription.tier : 'free';
        
        const serviceLimits = {
            'free': 0,
            'pro-buyer': 0,
            'pro-seller': 5,
            'elite-seller': 999,
            'enterprise': 999
        };
        
        const currentCount = getServiceCount(userId);
        const maxServices = serviceLimits[tier] || 0;
        const canCreate = currentCount < maxServices;
        
        res.json({
            success: true,
            canCreate,
            tier,
            currentCount,
            maxServices,
            requiresUpgrade: !canCreate
        });
    } catch (error) {
        console.error('Error checking eligibility:', error);
        res.status(500).json({ success: false, error: 'Failed to check eligibility' });
    }
});

// Settings: Update banking info
app.post('/settings/banking', ensureAuthenticated, (req, res) => {
    try {
        const { bankCountry, bankAccount, routingNumber } = req.body;
        const userId = req.session.userId;
        
        // Only update if values provided
        if (bankCountry) {
            db.prepare('UPDATE users SET bank_account_country = ? WHERE id = ?').run(bankCountry, userId);
        }
        if (bankAccount && !bankAccount.includes('••••')) {
            db.prepare('UPDATE users SET bank_account_number = ? WHERE id = ?').run(bankAccount, userId);
        }
        if (routingNumber) {
            db.prepare('UPDATE users SET bank_routing_number = ? WHERE id = ?').run(routingNumber, userId);
        }
        
        res.redirect('/settings?success=Banking+info+updated');
    } catch (error) {
        console.error('Banking update error:', error);
        res.redirect('/settings?error=Failed+to+update+banking+info');
    }
});

// Settings: Delete account
app.post('/settings/delete-account', ensureAuthenticated, async (req, res) => {
    try {
        const { confirmation } = req.body;
        const userId = req.session.userId;
        
        if (confirmation !== 'DELETE') {
            return res.redirect('/settings?error=Invalid+confirmation');
        }
        
        // Get user info before deletion
        const user = getUserById(userId);
        
        // Cancel any active subscriptions
        try {
            cancelSubscription(userId);
        } catch (e) {}
        
        // Perform all deletes in a single transaction to avoid FK violations
        const runDelete = db.transaction((uid) => {
            // Posts and related dependencies (comments/reactions from anyone)
            db.prepare(`DELETE FROM comment_likes WHERE comment_id IN (
                SELECT pc.id FROM post_comments pc WHERE pc.post_id IN (SELECT p.id FROM posts p WHERE p.user_id = ?)
            )`).run(uid);
            db.prepare(`DELETE FROM post_comments WHERE post_id IN (
                SELECT p.id FROM posts p WHERE p.user_id = ?
            )`).run(uid);
            db.prepare(`DELETE FROM post_reactions WHERE post_id IN (
                SELECT p.id FROM posts p WHERE p.user_id = ?
            )`).run(uid);
            // Also remove the user's own comments/reactions on others' posts
            db.prepare('DELETE FROM comment_likes WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM post_comments WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM post_reactions WHERE user_id = ?').run(uid);
            // Finally remove posts created by the user
            db.prepare('DELETE FROM posts WHERE user_id = ?').run(uid);

            // Services and dependent tables
            db.prepare(`DELETE FROM service_reviews WHERE service_id IN (
                SELECT s.id FROM services s WHERE s.user_id = ?
            )`).run(uid);
            db.prepare(`DELETE FROM service_orders WHERE service_id IN (
                SELECT s.id FROM services s WHERE s.user_id = ?
            )`).run(uid);
            // User-authored service artifacts
            db.prepare('DELETE FROM service_reviews WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM service_orders WHERE buyer_id = ?').run(uid);
            // Remove services after dependents are gone
            db.prepare('DELETE FROM services WHERE user_id = ?').run(uid);

            // Messages and conversations: remove reactions/messages in any conversation involving the user
            db.prepare(`DELETE FROM message_reactions WHERE message_id IN (
                SELECT m.id FROM messages m WHERE m.conversation_id IN (
                    SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
                )
            )`).run(uid, uid);
            db.prepare(`DELETE FROM messages WHERE conversation_id IN (
                SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
            )`).run(uid, uid);
            // Remove participants for those conversations, then delete conversations
            db.prepare(`DELETE FROM conversation_participants WHERE conversation_id IN (
                SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
            )`).run(uid, uid);
            // Also in case: remove any participant rows directly tied to the user
            db.prepare('DELETE FROM conversation_participants WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?').run(uid, uid);
            
            // Payments & subscriptions
            db.prepare('DELETE FROM invoices WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM payment_methods WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').run(uid);
            
            // Social and notifications
            db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(uid, uid);
            db.prepare('DELETE FROM notifications WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(uid);
            
            // User blocks and reports
            db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').run(uid, uid);
            db.prepare('DELETE FROM user_reports WHERE reporter_id = ? OR reported_user_id = ?').run(uid, uid);
            db.prepare('DELETE FROM user_moderation WHERE user_id = ?').run(uid);
            
            // Livestreams and related data
            db.prepare('DELETE FROM livestream_chat WHERE livestream_id IN (SELECT id FROM livestreams WHERE user_id = ?)').run(uid);
            db.prepare('DELETE FROM livestream_viewers WHERE livestream_id IN (SELECT id FROM livestreams WHERE user_id = ?)').run(uid);
            db.prepare('DELETE FROM livestream_viewers WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM livestream_chat WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM livestreams WHERE user_id = ?').run(uid);
            
            // Payment customers
            db.prepare('DELETE FROM payment_customers WHERE user_id = ?').run(uid);
            
            // Auth and credentials
            db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM oauth_accounts WHERE user_id = ?').run(uid);
            db.prepare('DELETE FROM email_verification_codes WHERE user_id = ?').run(uid);
            
            // Appeals (set reviewer_id to NULL instead of deleting)
            db.prepare('UPDATE career_applications SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);
            db.prepare('UPDATE content_appeals SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);
            db.prepare('UPDATE account_appeals SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);
            
            // Audit logs (set user_id to NULL for record keeping)
            db.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(uid);
            
            // Finally, delete user account
            db.prepare('DELETE FROM users WHERE id = ?').run(uid);
        });
        runDelete(userId);
        
        // Send confirmation email
        if (user && user.email) {
            await emailService.sendAccountDeletionEmail(user.email, user.full_name, req);
        }
        
        // Destroy session
        req.session.destroy(() => {
            res.redirect('/?message=Account+deleted+successfully');
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.redirect('/settings?error=Failed+to+delete+account');
    }
});

// Admin: Freeze/unfreeze seller privileges
app.post('/admin/users/:id/freeze-seller', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { action, reason } = req.body; // 'freeze' or 'unfreeze'
        const adminId = req.session.userId;
        
        const frozenValue = action === 'freeze' ? 1 : 0;
        db.prepare('UPDATE users SET seller_privileges_frozen = ? WHERE id = ?').run(frozenValue, userId);
        
        // Get user details for email notification
        const user = getUserById(userId);
        
        // Log the action
        try {
            addAuditLog({
                userId: adminId,
                action: action === 'freeze' ? 'freeze_seller_privileges' : 'unfreeze_seller_privileges',
                details: JSON.stringify({ targetUserId: userId, reason })
            });
        } catch (e) {}
        
        // Deactivate all services if freezing
        if (action === 'freeze') {
            db.prepare('UPDATE services SET status = \'frozen\' WHERE user_id = ? AND status = \'active\'').run(userId);
        } else {
            db.prepare('UPDATE services SET status = \'active\' WHERE user_id = ? AND status = \'frozen\'').run(userId);
        }
        
        // Send email notification
        if (user) {
            try {
                if (action === 'freeze') {
                    await emailService.sendSellerFreezeEmail(user, reason || 'Policy violation', req);
                } else {
                    await emailService.sendSellerUnfreezeEmail(user, req);
                }
            } catch (emailError) {
                console.error('Failed to send seller status email:', emailError);
            }
        }
        
        const message = action === 'freeze' ? 'Seller+privileges+frozen' : 'Seller+privileges+restored';
        res.redirect(`/admin?success=${message}`);
    } catch (error) {
        console.error('Freeze seller error:', error);
        res.redirect('/admin?error=Failed+to+update+seller+status');
    }
});

// Admin: Freeze/unfreeze chat privileges for a user
app.post('/admin/users/:id/freeze-chat', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { action, reason } = req.body;
    const freeze = action === 'freeze' ? 1 : 0;

    try {
        const user = getUserById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        db.prepare('UPDATE users SET chat_privileges_frozen = ? WHERE id = ?').run(freeze, userId);

        try {
            addAuditLog({
                userId: req.session.userId,
                action: freeze ? 'freeze_chat' : 'unfreeze_chat',
                details: JSON.stringify({ targetUserId: userId, reason: reason || null })
            });
        } catch (e) {}

        const message = freeze ? 'Chat privileges frozen' : 'Chat privileges restored';

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({ success: true, frozen: !!freeze, message });
        }

        return res.redirect(`/profile/${userId}?success=${encodeURIComponent(message)}`);
    } catch (e) {
        console.error('freeze-chat error', e);
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({ success: false, error: 'Failed to update chat privileges' });
        }
        return res.redirect(`/profile/${userId}?error=Unable+to+update+chat+privileges`);
    }
});

// Pricing page (tiers)
app.get('/pricing', (req, res) => {
    const tiers = [
        { 
            id: 'free', 
            name: 'Free User', 
            price: '$0/mo', 
            tagline: 'Social home for productive passions.', 
            features: [
                'Post photos, videos, project updates',
                'Follow creators, mentors, students, professionals',
                'Rich profiles (skills, passions, portfolio, achievements)',
                'Up to 10 Project Collections',
                'Book sessions, basic messaging, post analytics (views + likes)',
                'Ads from Fortune 100 brands only'
            ]
        },
        { 
            id: 'pro-buyer', 
            name: 'Pro Buyer', 
            price: '$5.99/mo', 
            tagline: 'Power user of the social side.', 
            features: [
                'Ad-free experience',
                'Enhanced discovery filters (top rising creators, people near you, people who match interests)',
                'Unlimited Project Collections',
                'Priority messaging',
                'Post up to 3 one-time request listings per month',
                'Early access to premium sellers',
                'Basic AI mentor/creator recommendations'
            ]
        },
        { 
            id: 'pro-seller', 
            name: 'Pro Seller', 
            price: '$9.99/mo', 
            tagline: 'Turn your craft into a brand.', 
            highlight: true, 
            features: [
                'Pro badge + priority in discovery',
                'Pin 3 posts to profile',
                'Weekly insights (reach, audience interests, followers by profession/skill)',
                'Custom profile banner & theme',
                '5 service listings, unlimited messaging',
                'Payment tools, basic CRM',
                'Scheduling, reminders, custom availability',
                'Coupons, discounts, basic buyer analytics'
            ]
        },
        { 
            id: 'elite-seller', 
            name: 'Elite Seller', 
            price: '$29.99/mo', 
            tagline: 'You\'re a top creator — build a full microbrand.', 
            features: [
                'Verified status, full portfolio builder, video banners',
                'In-depth analytics (peak times, demographics, top-performing categories)',
                'Cross-platform link hub, featured on Discover when trending',
                'Unlimited listings, recurring subscriptions',
                'Advanced analytics & automation',
                'CRM + workflow automation',
                'Custom storefront page, tax reports',
                'Integrations, auto-responses, Smart rebooking AI'
            ]
        },
        { 
            id: 'enterprise', 
            name: 'Enterprise Creator', 
            price: '$99.99/mo', 
            tagline: 'Dream X is your community\'s social + learning hub.', 
            features: [
                'Multi-user team posting',
                'Event pages, showcase collections',
                'Custom homepage blocks, co-branded community page',
                'Invite followers to events, livestreams, seminars',
                'Multi-instructor scheduling, team-wide analytics',
                'Bulk payouts, shared CRM',
                'Dedicated account manager',
                'Featured category placement, sponsored creator onboarding'
            ],
            note: 'Best for tutoring companies, mentorship orgs, clubs, and studios.'
        }
    ];

    // Determine current user subscription tier if logged in
    let userTier = null;
    if (req.session.userId) {
        try {
            const sub = getUserSubscription(req.session.userId);
            if (sub && sub.tier) userTier = sub.tier.replace(/_/g,'-'); else userTier = 'free';
        } catch (e) {
            userTier = 'free';
        }
    }

    res.render('pricing', {
        title: 'Pricing - Dream X',
        currentPage: 'pricing',
        tiers,
        userTier
    });
});

// Help Center (FAQ / Support)
app.get('/help-center', (req, res) => {
    const faqs = [
        { q: 'What is Dream X?', a: 'Dream X is a social platform focused on productive passions—helping you share progress, discover new niches, and grow consistently.' },
        { q: 'How does the Reverse Algorithm work?', a: 'You begin with ultra-specific passion inputs. Over time the feed broadens intelligently, exposing adjacent skills and creators once you establish depth in your core interests.' },
        { q: 'How do I start offering services?', a: 'Upgrade to a seller tier, create service listings, set availability, and start accepting bookings through your public profile.' },
        { q: 'How do I upgrade my plan?', a: 'Visit the Pricing page, choose a tier, and follow the upgrade flow (coming soon). Your features unlock instantly after confirmation.' },
        { q: 'How do I report a problem or a user?', a: 'Use the in-app report option on posts or profiles, or contact support directly for urgent issues.' },
        { q: 'How do I create my first post?', a: 'Click the "Create Post" button on your feed, add your photo or video, write a caption about your progress, and select relevant passions or skills. Your post will appear on your profile and in the feeds of your followers.' },
        { q: 'What are passions and how do I choose them?', a: 'Passions are the core interests that define your profile. Choose 3-5 primary passions from our curated list during onboarding. These help the algorithm show you relevant content and connect you with like-minded creators.' },
        { q: 'Can I change my username or handle?', a: 'Yes! Go to Edit Profile and update your username/handle. Note that your old handle will become available for others to claim, and all your existing links will redirect to your new handle for 30 days.' },
        { q: 'How do streaks work?', a: 'Streaks track consecutive days of posting or activity in specific skills. Post at least once per day to maintain your streak. Streaks are displayed on your profile and in the feed, showing your commitment to consistent growth.' },
        { q: 'What makes Dream X different from other social platforms?', a: 'Dream X is built around productivity and growth, not endless scrolling. Our Reverse Algorithm expands your interests gradually, our dopamine loop rewards progress, and our community celebrates skill-building over vanity metrics.' },
        { q: 'Is my data secure on Dream X?', a: 'Absolutely. We use industry-standard encryption, secure password hashing, and strict access controls. We never sell your personal data. Read our Privacy Policy for full details on how we protect your information.' },
        { q: 'How do I delete my account?', a: 'Visit Settings > Account > Delete Account. Your data will be permanently deleted within 30 days. Some information may be retained for legal or security purposes as outlined in our Privacy Policy.' },
        { q: 'Can I use Dream X for free?', a: 'Yes! Dream X offers a robust free tier with full social feed access, unlimited posts, passion portfolios, and basic achievement tracking. Upgrade to Pro or Elite tiers for advanced features and monetization.' },
        { q: 'How does the marketplace work?', a: 'Pro Seller and Elite Seller tiers can create service listings for tutoring, coaching, or consultations. Buyers can browse, book sessions, and pay directly through the platform. Dream X handles scheduling, payments, and invoicing.' },
        { q: 'What payment methods are accepted?', a: 'We accept major credit cards, debit cards, and digital wallets through our secure payment processor. Sellers receive payouts via bank transfer or PayPal on a regular schedule.' }
    ];
    res.render('help-center', {
        title: 'Help Center - Dream X',
        currentPage: 'help-center',
        faqs
    });
});



// About page
app.get('/about', (req, res) => {
    res.render('about', { 
        title: 'About - Dream X',
        currentPage: 'about'
    });
});

// Team page
app.get('/team', (req, res) => {
    res.render('team', { 
        title: 'Our Team - Dream X',
        currentPage: 'team'
    });
});

// Features page
app.get('/features', (req, res) => {

    res.render('features', { 
        title: 'Features - Dream X',
        currentPage: 'features'
    });
});

// Contact page
app.get('/contact', (req, res) => {
    res.render('contact', { 
        title: 'Contact - Dream X',
        currentPage: 'contact'
    });
});

// Careers page
app.get('/careers', (req, res) => {
    res.render('careers', { 
        title: 'Careers - Dream X',
        currentPage: 'careers'
    });
});

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.render('privacy', { 
        title: 'Privacy Policy - Dream X',
        currentPage: 'privacy'
    });
});

// Terms of Service page
app.get('/terms', (req, res) => {
    res.render('terms', {
        title: 'Terms of Service - Dream X',
        currentPage: 'terms',
        authUser: req.session.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) : null
    });
});

// Community Guidelines page
app.get('/community-guidelines', (req, res) => {
    res.render('community-guidelines', { 
        title: 'Community Guidelines - Dream X',
        currentPage: 'community-guidelines',
        authUser: req.session.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) : null
    });
});

// Content Appeal page
app.get('/content-appeal', (req, res) => {
    res.render('content-appeal', { 
        title: 'Content Appeal - Dream X',
        currentPage: 'content-appeal'
    });
});

// Account Appeal page
app.get('/account-appeal', (req, res) => {
    res.render('account-appeal', { 
        title: 'Account Appeal - Dream X',
        currentPage: 'account-appeal'
    });
});

// Refund Request page
app.get('/refund-request', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        // Get user's charges to populate the form
        const charges = getUserCharges({ 
            userId: req.session.userId, 
            limit: 100, 
            offset: 0 
        }) || [];

        // Get user's recent refund requests for spam prevention
        const recentRefunds = getUserRefundRequests(req.session.userId) || [];

        // Mark charges that have pending/recent refund requests
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

        charges.forEach(charge => {
            const recentRefund = recentRefunds.find(refund => {
                const refundDate = new Date(refund.created_at);
                return refund.charge_id === charge.id && refundDate > fiveDaysAgo;
            });
            charge.hasRecentRefund = !!recentRefund;
            charge.refundStatus = recentRefund?.status;
        });

        const user = await getUserById(req.session.userId);

        res.render('refund-request', {
            title: 'Refund Request - Dream X',
            currentPage: 'refund-request',
            charges: charges,
            recentRefunds: recentRefunds,
            user: user
        });
    } catch (error) {
        console.error('Error loading refund request page:', error);
        res.status(500).send('Error loading refund request page');
    }
});

// Handle refund request submission
app.post('/refund-request', refundUpload.single('screenshot'), (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const {
        charge_id,
        chargeId,
        amount,
        reason,
        description,
        order_date,
        orderDate,
        transaction_id,
        transactionId,
        preferred_method,
        preferredMethod,
        account_email,
        accountEmail,
        account_last_four,
        accountLastFour
    } = req.body;

    const finalChargeId = (charge_id || chargeId) ? parseInt(charge_id || chargeId) : null;
    const finalTransactionId = transaction_id || transactionId;

    // Check for recent duplicate refund requests (spam prevention)
    try {
        const recentRefunds = getUserRefundRequests(req.session.userId);
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

        // Check for duplicate based on charge_id or transaction_id
        const duplicateRefund = recentRefunds.find(refund => {
            const refundDate = new Date(refund.created_at);
            const isRecent = refundDate > fiveDaysAgo;
            
            // Check if same charge_id or transaction_id within 5 days
            if (isRecent) {
                if (finalChargeId && refund.charge_id === finalChargeId) {
                    return true;
                }
                if (finalTransactionId && refund.transaction_id === finalTransactionId) {
                    return true;
                }
            }
            return false;
        });

        if (duplicateRefund) {
            const daysSince = Math.ceil((new Date() - new Date(duplicateRefund.created_at)) / (1000 * 60 * 60 * 24));
            const daysRemaining = 5 - daysSince;
            return res.status(429).json({ 
                success: false, 
                error: `You have already submitted a refund request for this transaction. Please wait ${daysRemaining} more day(s) before submitting another request.`,
                waitDays: daysRemaining
            });
        }

        // Get screenshot path if uploaded
        let screenshotPath = null;
        if (req.file) {
            // Store under /uploads/refunds for static serving
            screenshotPath = 'uploads/refunds/' + req.file.filename;
        }

        // Create refund request
        const refundRequestId = createRefundRequest({
            userId: req.session.userId,
            chargeId: finalChargeId,
            amount: parseFloat(amount),
            reason: reason,
            description: description,
            orderDate: order_date || orderDate,
            transactionId: finalTransactionId,
            preferredMethod: preferred_method || preferredMethod,
            accountEmail: account_email || accountEmail || null,
            accountLastFour: account_last_four || accountLastFour || null,
            screenshot: screenshotPath
        });

        console.log('✅ Refund request created:', refundRequestId);

        // TODO: Send confirmation email to user
        // TODO: Send notification to admin

        res.json({ success: true, message: 'Refund request submitted successfully', requestId: refundRequestId });
    } catch (error) {
        console.error('Error creating refund request:', error);
        res.status(500).json({ success: false, error: 'Failed to submit refund request. Please try again.' });
    }
});

// Login page
// (Original login route replaced by new auth-aware version above)

// Onboarding page (collect user passions/interests for Reverse Algorithm)
app.get('/onboarding', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    if (!userNeedsOnboarding(user)) return res.redirect(resolvePostAuthRedirect(user));
    res.render('onboarding', {
        title: 'Start with your passions',
        currentPage: 'onboarding'
    });
});

// Handle onboarding form submission with file upload
const onboardingUpload = upload.fields([
    { name: 'profilePicture', maxCount: 1 }
]);

const persistOnboarding = (req, res, { respondWithJson } = { respondWithJson: false }) => {
    if (!req.session.userId) {
        return respondWithJson ? res.status(401).json({ success: false, error: 'Not authenticated' }) : res.redirect('/login');
    }

    const user = getUserById(req.session.userId);
    if (!user) {
        return respondWithJson ? res.status(404).json({ success: false, error: 'User not found' }) : res.redirect('/login');
    }

    if (!userNeedsOnboarding(user)) {
        const redirectTarget = resolvePostAuthRedirect(user);
        return respondWithJson ? res.json({ success: true, redirect: redirectTarget }) : res.redirect(redirectTarget);
    }

    const {
        categories, goals, experience,
        daily_time_commitment, best_time, reminder_frequency,
        accountability_style, progress_visibility,
        content_preferences, content_format_preference,
        open_to_mentoring,
        first_goal, first_goal_date, first_goal_metric, first_goal_public,
        notify_followers, notify_likes_comments, notify_milestones,
        notify_inspiration, notify_community, notify_weekly_summary,
        notify_method, bio
    } = req.body;

    // Process arrays
    const selectedCategories = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const selectedGoals = Array.isArray(goals) ? goals : (goals ? [goals] : []);
    const selectedAccountability = Array.isArray(accountability_style) ? accountability_style : (accountability_style ? [accountability_style] : []);
    const selectedContentPrefs = Array.isArray(content_preferences) ? content_preferences : (content_preferences ? [content_preferences] : []);

    // Profile picture handling
    let profilePicturePath = null;
    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
        profilePicturePath = 'profiles/' + req.files.profilePicture[0].filename;
    }

    try {
        // Update user with comprehensive onboarding data
        const onboardingData = {
            userId: req.session.userId,
            categories: selectedCategories,
            goals: selectedGoals,
            experience: experience || null,
            daily_time_commitment: daily_time_commitment || null,
            best_time: best_time || null,
            reminder_frequency: reminder_frequency || null,
            accountability_style: selectedAccountability.length > 0 ? JSON.stringify(selectedAccountability) : null,
            progress_visibility: progress_visibility || 'public',
            content_preferences: selectedContentPrefs.length > 0 ? JSON.stringify(selectedContentPrefs) : null,
            content_format_preference: content_format_preference || 'Mixed',
            open_to_mentoring: open_to_mentoring || null,
            first_goal: first_goal || null,
            first_goal_date: first_goal_date || null,
            first_goal_metric: first_goal_metric || null,
            first_goal_public: first_goal_public ? 1 : 0,
            notify_followers: notify_followers ? 1 : 0,
            notify_likes_comments: notify_likes_comments ? 1 : 0,
            notify_milestones: notify_milestones ? 1 : 0,
            notify_inspiration: notify_inspiration ? 1 : 0,
            notify_community: notify_community ? 1 : 0,
            notify_weekly_summary: notify_weekly_summary ? 1 : 0,
            notify_method: notify_method || 'both',
            bio: bio || null,
            profile_picture: profilePicturePath,
            onboarding_completed: 1,
            needs_onboarding: 0
        };

        updateOnboarding(onboardingData);
        req.session.seenOnboardingPrompt = true;
        console.log('📝 Complete onboarding saved for user', req.session.userId);

        const redirectTarget = '/feed';
        return respondWithJson ? res.json({ success: true, redirect: redirectTarget }) : res.redirect(redirectTarget);
    } catch (err) {
        console.error('Failed to save onboarding data', err);
        return respondWithJson
            ? res.status(500).json({ success: false, error: 'Unable to save onboarding data' })
            : res.status(500).render('onboarding', { title: 'Start with your passions', currentPage: 'onboarding', error: 'Unable to save onboarding data' });
    }
};

app.post('/api/onboarding', onboardingUpload, (req, res) => persistOnboarding(req, res, { respondWithJson: true }));
app.post('/onboarding', onboardingUpload, (req, res) => persistOnboarding(req, res, { respondWithJson: false }));

// === NOTIFICATION API ROUTES ===
// Get user profile counts (posts, services)
app.get('/api/users/:userId/profile-counts', (req, res) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const postsCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId).count;
        const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services WHERE user_id = ?').get(userId).count;
        res.json({ 
            success: true,
            posts: postsCount,
            services: servicesCount
        });
    } catch (error) {
        console.error('Error fetching profile counts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch counts' });
    }
});

// Get user notifications
app.get('/api/notifications', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const notifications = getUserNotifications(req.session.userId);
        const unreadCount = getUnreadNotificationCount(req.session.userId);
        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
app.post('/api/notifications/:id/read', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        markNotificationAsRead(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        markAllNotificationsAsRead(req.session.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// Delete notification
app.delete('/api/notifications/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        deleteNotification(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Save push subscription
app.post('/api/push/subscribe', express.json(), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ error: 'Invalid subscription data' });
        }
        savePushSubscription({
            userId: req.session.userId,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save push subscription' });
    }
});

// Unsubscribe from push
app.post('/api/push/unsubscribe', express.json(), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
        deletePushSubscription(endpoint);
        res.json({ success: true });
    } catch (error) {
        console.error('Error unsubscribing from push:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// === APPEAL ROUTES ===
// Submit career application (with file upload)
app.post('/api/careers/apply', careerUpload.fields([{ name: 'resumeFile', maxCount: 1 }, { name: 'portfolioFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { position, name, email, phone, coverLetter } = req.body;
        if (!position || !name || !email || !coverLetter) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const resumeFile = (req.files && req.files.resumeFile && req.files.resumeFile[0]) ? `/uploads/careers/${req.files.resumeFile[0].filename}` : null;
        const portfolioFile = (req.files && req.files.portfolioFile && req.files.portfolioFile[0]) ? `/uploads/careers/${req.files.portfolioFile[0].filename}` : null;
        const id = require('./db').createCareerApplication({ position, name, email, phone, coverLetter, resumeFile, portfolioFile });
        try { addAuditLog({ userId: req.session.userId || null, action: 'career_application_submitted', details: JSON.stringify({ id, email, position }) }); } catch(e) {}
        
        // Send confirmation email
        try {
            await emailService.sendCareerApplicationEmail(email, name, position, req);
        } catch (emailError) {
            console.error('Failed to send career application confirmation:', emailError);
        }
        
        res.json({ success: true, message: 'Your application has been submitted successfully. We will review it and get back to you soon.', applicationId: `JOB-${id}` });
    } catch (error) {
        console.error('Error processing career application:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
});

// === FOLLOW/UNFOLLOW ROUTES ===
// Follow a user
app.post('/api/users/:id/follow', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || targetUserId === req.session.userId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        followUser({ followerId: req.session.userId, followingId: targetUserId });
        
        // Create notification for the followed user
        const follower = getUserById(req.session.userId);
        createNotification({
            userId: targetUserId,
            type: 'follow',
            title: 'New Follower',
            message: `${follower.full_name} started following you`,
            link: `/profile/${req.session.userId}`
        });
        
        // Emit notification via socket
        io.to(`user-${targetUserId}`).emit('notification', {
            type: 'follow',
            title: 'New Follower',
            message: `${follower.full_name} started following you`,
            link: `/profile/${req.session.userId}`,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, following: true });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
});

// Unfollow a user
app.post('/api/users/:id/unfollow', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || targetUserId === req.session.userId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        unfollowUser({ followerId: req.session.userId, followingId: targetUserId });
        res.json({ success: true, following: false });
    } catch (error) {
        console.error('Unfollow error:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
});

// Block a user
app.post('/api/users/:id/block', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || targetUserId === req.session.userId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { reason } = req.body;
    try {
        blockUser({ blockerId: req.session.userId, blockedId: targetUserId, reason });
        res.json({ success: true });
    } catch (error) {
        if (error.message.includes('locked')) {
            return res.status(403).json({ error: 'Your blocking functionality has been restricted by an administrator' });
        }
        console.error('Block error:', error);
        res.status(500).json({ error: 'Failed to block user' });
    }
});

// Unblock a user
app.post('/api/users/:id/unblock', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user ID' });
    try {
        unblockUser({ blockerId: req.session.userId, blockedId: targetUserId });
        res.json({ success: true });
    } catch (error) {
        console.error('Unblock error:', error);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

// Report a user
app.post('/api/users/:id/report', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || targetUserId === req.session.userId) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { reason, description } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required' });
    try {
        reportUser({ reporterId: req.session.userId, reportedId: targetUserId, reason, description });
        res.json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

// Get blocked users
app.get('/api/users/blocked', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const blocked = getBlockedUsers(req.session.userId);
        res.json({ blocked });
    } catch (error) {
        console.error('Get blocked error:', error);
        res.status(500).json({ error: 'Failed to retrieve blocked users' });
    }
});

// Check if user is blocked
app.get('/api/users/:id/is-blocked', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user ID' });
    try {
        const blocked = isUserBlocked({ userId: req.session.userId, targetId: targetUserId });
        res.json({ blocked });
    } catch (error) {
        console.error('Check blocked error:', error);
        res.status(500).json({ error: 'Failed to check block status' });
    }
});

// === ADMIN MODERATION ROUTES ===
// Admin: View all user blocks and reports
app.get('/admin/moderation/user-actions', requireSuperAdmin, (req, res) => {
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    
    try {
        const blocks = getAllBlocksAndReports({ limit: pageSize, offset });
        const reports = getUserReports({ limit: pageSize, offset: 0, status: req.query.status });
        const me = getUserById(req.session.userId);
        
        res.render('admin-user-actions', {
            title: 'User Actions Moderation - Dream X',
            currentPage: 'admin',
            authUser: me,
            blocks,
            reports,
            page,
            pageSize,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Admin moderation error:', error);
        if (error && error.stack) console.error('Admin moderation stack:', error.stack);
        res.redirect('/admin?error=Failed+to+load+moderation+data');
    }
});

// Admin: Update report status
app.post('/admin/moderation/reports/:id/status', requireSuperAdmin, (req, res) => {
    const reportId = parseInt(req.params.id, 10);
    const { status, adminNotes } = req.body;
    const validStatuses = ['pending', 'reviewing', 'resolved', 'dismissed'];
    
    if (!validStatuses.includes(status)) {
        return res.redirect('/admin/moderation/user-actions?error=Invalid+status');
    }
    
    try {
        updateReportStatus({ reportId, status, reviewerId: req.session.userId, adminNotes });
        res.redirect('/admin/moderation/user-actions?success=Report+updated');
    } catch (error) {
        console.error('Update report error:', error);
        res.redirect('/admin/moderation/user-actions?error=Failed+to+update+report');
    }
});

// Admin: Lock user's block functionality
app.post('/admin/moderation/users/:id/lock-blocking', requireSuperAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    
    try {
        lockUserBlockFunctionality({ userId, reason, lockedBy: req.session.userId });
        res.redirect('/admin/moderation/user-actions?success=Block+functionality+locked');
    } catch (error) {
        console.error('Lock blocking error:', error);
        res.redirect('/admin/moderation/user-actions?error=Failed+to+lock+blocking');
    }
});

// Admin: Unlock user's block functionality
app.post('/admin/moderation/users/:id/unlock-blocking', requireSuperAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    
    try {
        unlockUserBlockFunctionality({ userId, unlockedBy: req.session.userId });
        res.redirect('/admin/moderation/user-actions?success=Block+functionality+unlocked');
    } catch (error) {
        console.error('Unlock blocking error:', error);
        res.redirect('/admin/moderation/user-actions?error=Failed+to+unlock+blocking');
    }
});

// Ban a user
app.post('/admin/users/:id/ban', requireSuperAdmin, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { reason, notifyUser } = req.body;
    const banReason = reason || 'Violation of community guidelines';
    const isJson = req.headers['content-type']?.includes('application/json');
    
    try {
        const targetUser = getUserById(userId);
        banUser({ userId, reason: banReason, bannedBy: req.session.userId });
        
        // Send email notification if requested
        if (notifyUser && targetUser && targetUser.email) {
            await emailService.sendAccountBannedEmail(targetUser, banReason, req);
        }
        
        // Create in-app notification
        const { createNotification } = require('./db');
        createNotification({
            userId: userId,
            type: 'account_action',
            title: '🚫 Account Banned',
            message: `Your account has been permanently banned. Reason: ${banReason}. You can submit an appeal if you believe this is a mistake.`,
            link: '/account-appeal'
        });
        
        // Emit real-time notification
        io.to(`user-${userId}`).emit('notification', {
            type: 'account_action',
            title: '🚫 Account Banned',
            message: `Your account has been permanently banned. Reason: ${banReason}.`
        });
        
        // Invalidate all sessions for this user
        const Database = require('better-sqlite3');
        const dbPath = path.join(__dirname, 'sessions.sqlite3');
        const sessDb = new Database(dbPath);
        try {
            sessDb.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${userId}%`);
        } catch(e) {
            console.warn('Session cleanup failed:', e.message);
        }
        sessDb.close();
        
        if (isJson) {
            return res.json({ success: true });
        }
        res.redirect('/admin?success=User+banned+successfully');
    } catch (error) {
        console.error('Ban user error:', error);
        if (isJson) {
            return res.status(500).json({ success: false, error: 'Failed to ban user' });
        }
        res.redirect('/admin?error=Failed+to+ban+user');
    }
});

// Suspend a user
app.post('/admin/users/:id/suspend', requireSuperAdmin, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { duration, days, reason, notifyUser } = req.body;
    const suspendReason = reason || 'Temporary suspension';
    
    // Support both 'days' (from JSON requests) and 'duration' (from form requests)
    const isJson = req.headers['content-type']?.includes('application/json');
    
    if (!duration && !days) {
        if (isJson) {
            return res.status(400).json({ success: false, error: 'Suspension duration required' });
        }
        return res.redirect('/admin?error=Suspension+duration+required');
    }
    
    try {
        const targetUser = getUserById(userId);
        const now = new Date();
        let until;
        let durationText = '';
        
        if (days) {
            // Handle days as integer (from JSON modal)
            const numDays = parseInt(days, 10);
            until = new Date(now.getTime() + numDays * 24 * 60 * 60 * 1000);
            durationText = `${numDays} day${numDays !== 1 ? 's' : ''}`;
        } else if (duration) {
            // Parse duration (e.g., "1d", "7d", "30d", "1h")
            const match = duration.match(/^(\d+)([hdwm])$/);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2];
                
                switch(unit) {
                    case 'h': 
                        until = new Date(now.getTime() + value * 60 * 60 * 1000);
                        durationText = `${value} hour${value !== 1 ? 's' : ''}`;
                        break;
                    case 'd': 
                        until = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
                        durationText = `${value} day${value !== 1 ? 's' : ''}`;
                        break;
                    case 'w': 
                        until = new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
                        durationText = `${value} week${value !== 1 ? 's' : ''}`;
                        break;
                    case 'm': 
                        until = new Date(now.getTime() + value * 30 * 24 * 60 * 60 * 1000);
                        durationText = `${value} month${value !== 1 ? 's' : ''}`;
                        break;
                    default: 
                        until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                        durationText = '7 days';
                }
            } else {
                // Default to 7 days if invalid format
                until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                durationText = '7 days';
            }
        }
        
        suspendUser({ 
            userId, 
            until: until.toISOString(), 
            reason: suspendReason, 
            suspendedBy: req.session.userId 
        });

        // Send email notification if requested
        if (notifyUser && targetUser && targetUser.email) {
            await emailService.sendAccountSuspendedEmail(targetUser, suspendReason, until, durationText, req);
        }
        
        // Create in-app notification
        const { createNotification } = require('./db');
        createNotification({
            userId: userId,
            type: 'account_action',
            title: '⏸️ Account Suspended',
            message: `Your account has been suspended for ${durationText}. Reason: ${suspendReason}. Suspension ends: ${until.toLocaleString()}.`,
            link: '/account-appeal'
        });
        
        // Emit real-time notification
        io.to(`user-${userId}`).emit('notification', {
            type: 'account_action',
            title: '⏸️ Account Suspended',
            message: `Your account has been suspended for ${durationText}.`
        });
        
        // Invalidate all sessions for this user
        const Database = require('better-sqlite3');
        const dbPath = path.join(__dirname, 'sessions.sqlite3');
        const sessDb = new Database(dbPath);
        try {
            sessDb.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${userId}%`);
        } catch(e) {
            console.warn('Session cleanup failed:', e.message);
        }
        sessDb.close();
        
        if (isJson) {
            return res.json({ success: true });
        }
        res.redirect('/admin?success=User+suspended+successfully');
    } catch (error) {
        console.error('Suspend user error:', error);
        if (isJson) {
            return res.status(500).json({ success: false, error: 'Failed to suspend user' });
        }
        res.redirect('/admin?error=Failed+to+suspend+user');
    }
});

// Unban/unsuspend a user
app.post('/admin/users/:id/unban', requireSuperAdmin, (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const isJson = req.headers['content-type']?.includes('application/json');
    
    try {
        const targetUser = getUserById(userId);
        unbanUser({ userId, unbannedBy: req.session.userId });
        
        // Create in-app notification
        const { createNotification } = require('./db');
        createNotification({
            userId: userId,
            type: 'account_action',
            title: '✅ Account Restored',
            message: 'Your account has been restored and you can now access all features again.',
            link: '/feed'
        });
        
        // Emit real-time notification
        io.to(`user-${userId}`).emit('notification', {
            type: 'account_action',
            title: '✅ Account Restored',
            message: 'Your account has been restored!'
        });
        
        if (isJson) {
            return res.json({ success: true });
        }
        res.redirect('/admin?success=User+account+restored');
    } catch (error) {
        console.error('Unban user error:', error);
        if (isJson) {
            return res.status(500).json({ success: false, error: 'Failed to restore account' });
        }
        res.redirect('/admin?error=Failed+to+restore+account');
    }
});

// Delete post (admin action)
app.post('/admin/posts/:id/delete', requireAdmin, (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.id, 10);
    
    try {
        db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
        addAuditLog({ 
            userId: req.session.userId, 
            action: 'delete_post', 
            details: JSON.stringify({ postId }) 
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// Hide post (admin action)
app.post('/admin/posts/:id/hide', requireAdmin, (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const postId = parseInt(req.params.id, 10);
    
    try {
        // Add a hidden flag column if it doesn't exist
        try {
            db.exec(`ALTER TABLE posts ADD COLUMN hidden INTEGER DEFAULT 0;`);
        } catch (e) { /* Column exists */ }
        
        db.prepare(`UPDATE posts SET hidden = 1 WHERE id = ?`).run(postId);
        addAuditLog({ 
            userId: req.session.userId, 
            action: 'hide_post', 
            details: JSON.stringify({ postId }) 
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Hide post error:', error);
        res.status(500).json({ error: 'Failed to hide post' });
    }
});

// Hide comment (admin action)
app.post('/admin/comments/:id/hide', requireAdmin, (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = parseInt(req.params.id, 10);
    
    try {
        hideComment({ commentId, hiddenBy: req.session.userId });
        res.json({ success: true, message: 'Comment hidden successfully' });
    } catch (error) {
        console.error('Hide comment error:', error);
        res.status(500).json({ error: 'Failed to hide comment' });
    }
});

// Delete comment (admin action)
app.post('/admin/comments/:id/delete', requireAdmin, (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = parseInt(req.params.id, 10);
    
    try {
        deleteComment({ commentId, deletedBy: req.session.userId });
        res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// Restore comment (admin action)
app.post('/admin/comments/:id/restore', requireAdmin, (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = parseInt(req.params.id, 10);
    
    try {
        restoreComment({ commentId, restoredBy: req.session.userId });
        res.json({ success: true, message: 'Comment restored successfully' });
    } catch (error) {
        console.error('Restore comment error:', error);
        res.status(500).json({ error: 'Failed to restore comment' });
    }
});

// Account status page
app.get('/account-status', (req, res) => {
    const userId = parseInt(req.query.userId, 10);
    if (!userId) return res.redirect('/login');
    
    const accountStatus = checkAccountStatus(userId);
    const user = getUserById(userId);
    
    res.render('account-status', {
        title: 'Account Status - Dream X',
        currentPage: 'account-status',
        accountStatus,
        user,
        authUser: null
    });
});

// Submit content appeal
app.post('/api/appeals/content', (req, res) => {
    try {
        const { email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo } = req.body;
        
        // Validate required fields
        if (!email || !contentType || !appealReason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const id = require('./db').createContentAppeal({ email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo });
        try { addAuditLog({ userId: req.session.userId || null, action: 'content_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch(e) {}
        res.json({ success: true, message: 'Your appeal has been submitted. You will receive a response within 3-5 business days.', caseNumber: `CA-${id}` });
    } catch (error) {
        console.error('Error processing content appeal:', error);
        res.status(500).json({ error: 'Failed to submit appeal' });
    }
});

// Submit account appeal
app.post('/api/appeals/account', (req, res) => {
    try {
        const { 
            email, 
            username, 
            accountAction, 
            actionDate, 
            violationReason, 
            appealReason, 
            preventionPlan, 
            additionalInfo,
            contactEmail 
        } = req.body;
        
        // Validate required fields
        if (!email || !username || !accountAction || !appealReason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const id = require('./db').createAccountAppeal({ email, username, accountAction, actionDate, violationReason, appealReason, preventionPlan, additionalInfo, contactEmail });
        try { addAuditLog({ userId: req.session.userId || null, action: 'account_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch(e) {}
        res.json({ success: true, message: 'Your account appeal has been submitted. You will receive a decision within 3-5 business days.', caseNumber: `AA-${id}` });
    } catch (error) {
        console.error('Error processing account appeal:', error);
        res.status(500).json({ error: 'Failed to submit appeal' });
    }
});

// ============= LIVESTREAM API ROUTES =============

const { 
    createLivestream, getLivestream, getLivestreamByKey, getActiveLivestreams,
    getUserLivestreams, startLivestream, endLivestream,
    addLivestreamViewer, removeLivestreamViewer, getLivestreamViewers,
    updateLivestreamPeakViewers, addLivestreamChatMessage, getLivestreamChat
} = require('./db');

const livestreamServices = require('./services/livestream');

// Create a new livestream
app.post('/api/livestream/create', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { title, description, recordingEnabled } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const result = createLivestream({
            userId: req.session.userId,
            title,
            description,
            recordingEnabled: recordingEnabled ? 1 : 0
        });

        res.json({
            success: true,
            streamId: result.id,
            streamKey: result.streamKey
        });
    } catch (error) {
        console.error('Error creating livestream:', error);
        res.status(500).json({ error: 'Failed to create livestream' });
    }
});

// Get active livestreams
app.get('/api/livestream/active', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const streams = getActiveLivestreams({ limit, offset });
        res.json({ streams });
    } catch (error) {
        console.error('Error fetching active streams:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

// Get user's livestreams
app.get('/api/livestream/user/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const streams = getUserLivestreams(userId);
        res.json({ streams });
    } catch (error) {
        console.error('Error fetching user streams:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
    }
});

// Get livestream details
app.get('/api/livestream/:streamId', (req, res) => {
    try {
        const streamId = parseInt(req.params.streamId);
        const stream = getLivestream(streamId);
        
        if (!stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        
        res.json({ stream });
    } catch (error) {
        console.error('Error fetching stream:', error);
        res.status(500).json({ error: 'Failed to fetch stream' });
    }
});

// Start livestream
app.post('/api/livestream/:streamId/start', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const streamId = parseInt(req.params.streamId);
        const stream = getLivestream(streamId);
        
        if (!stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized to start this stream' });
        }
        
        startLivestream(streamId);
        
        res.json({ success: true, message: 'Stream started' });
    } catch (error) {
        console.error('Error starting stream:', error);
        res.status(500).json({ error: 'Failed to start stream' });
    }
});

// End livestream
app.post('/api/livestream/:streamId/end', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const streamId = parseInt(req.params.streamId);
        const { recordingUrl } = req.body;
        const stream = getLivestream(streamId);
        
        if (!stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized to end this stream' });
        }
        
        endLivestream({ streamId, recordingUrl });
        
        res.json({ success: true, message: 'Stream ended' });
    } catch (error) {
        console.error('Error ending stream:', error);
        res.status(500).json({ error: 'Failed to end stream' });
    }
});

// Join livestream as viewer
app.post('/api/livestream/:streamId/join', (req, res) => {
    try {
        const streamId = parseInt(req.params.streamId);
        const userId = req.session.userId || null;
        
        const stream = getLivestream(streamId);
        
        if (!stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        
        if (stream.status !== 'live') {
            return res.status(400).json({ error: 'Stream is not live' });
        }
        
        addLivestreamViewer({ streamId, userId });
        
        // Update peak viewer count
        const viewers = getLivestreamViewers(streamId);
        updateLivestreamPeakViewers({ streamId, count: viewers.length });
        
        res.json({
            success: true,
            iceServers: livestreamServices.webrtc.getIceServers()
        });
    } catch (error) {
        console.error('Error joining stream:', error);
        res.status(500).json({ error: 'Failed to join stream' });
    }
});

// Leave livestream
app.post('/api/livestream/:streamId/leave', (req, res) => {
    try {
        const streamId = parseInt(req.params.streamId);
        const userId = req.session.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        removeLivestreamViewer({ streamId, userId });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error leaving stream:', error);
        res.status(500).json({ error: 'Failed to leave stream' });
    }
});

// Get livestream chat
app.get('/api/livestream/:streamId/chat', (req, res) => {
    try {
        const streamId = parseInt(req.params.streamId);
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const messages = getLivestreamChat({ streamId, limit, offset });
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({ error: 'Failed to fetch chat' });
    }
});

// Send chat message
app.post('/api/livestream/:streamId/chat', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const streamId = parseInt(req.params.streamId);
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        const messageId = addLivestreamChatMessage({
            streamId,
            userId: req.session.userId,
            message
        });
        
        // Emit chat message via Socket.IO
        io.to(`livestream_${streamId}`).emit('chat:message', {
            id: messageId,
            userId: req.session.userId,
            message,
            timestamp: new Date()
        });
        
        res.json({ success: true, messageId });
    } catch (error) {
        console.error('Error sending chat message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Error handler for 503 errors
app.use((req, res, next) => {
    res.status(503).render('503', { title: 'Service Unavailable - Dream X' });
});

// Error handler for 500 errors
app.use((err, req, res, next) => {
    res.status(500).render('500', { title: 'Server Error - Dream X' });
});

// 404 handler - must be last route
app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found - Dream X' });
});

// Socket.IO for real-time messaging and notifications
// Initialize livestream signaling service
livestreamServices.signaling.initialize(io);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Join user's personal notification room
    socket.on('join-user-room', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`Socket ${socket.id} joined user room ${userId}`);
    });
    
    socket.on('join-conversation', (conversationId) => {
        socket.join(`conversation-${conversationId}`);
        console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
    });
    
    // Livestream socket handlers
    socket.on('join-livestream', (streamId) => {
        socket.join(`livestream_${streamId}`);
        console.log(`Socket ${socket.id} joined livestream ${streamId}`);
    });
    
    socket.on('leave-livestream', (streamId) => {
        socket.leave(`livestream_${streamId}`);
        console.log(`Socket ${socket.id} left livestream ${streamId}`);
    });
    
    socket.on('leave-conversation', (conversationId) => {
        socket.leave(`conversation-${conversationId}`);
    });

    // Typing indicators within a conversation
    socket.on('typing', (payload) => {
        // payload: { conversationId, userId, name }
        if (!payload || !payload.conversationId) return;
        socket.to(`conversation-${payload.conversationId}`).emit('typing', payload);
    });
    socket.on('stop-typing', (payload) => {
        if (!payload || !payload.conversationId) return;
        socket.to(`conversation-${payload.conversationId}`).emit('stop-typing', payload);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`✨ Dream X server running on http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop the server`);
});

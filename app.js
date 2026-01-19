// ...existing code...
// Import required modules
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const AppleStrategy = require('passport-apple');
const TwitterStrategy = require('@superfaceai/passport-twitter-oauth2');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const pgSession = require('connect-pg-simple')(session);
const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const bcrypt = require('bcrypt');
const multer = require('multer');
const https = require('https');
const http = require('http');
const robots = require('express-robots-txt');
const { SitemapStream, streamToPromise } = require('sitemap');

// Import security middleware
const {
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
    sanitizeRequest,
    validateFileUpload,
    blockSuspiciousUrls,
    csrfProtection,
    csrfExempt
} = require('./middleware/security');


if(process.env.NODE_ENV !== 'Production'){
    require('dotenv').config();
}

// Ensure required directories exist before any file operations
function ensureDirectories() {
    const directories = [
        path.join(__dirname, 'data'),
        path.join(__dirname, 'logs'),
        path.join(__dirname, 'public', 'uploads')
    ];
    
    for (const dir of directories) {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ Created directory: ${dir}`);
            }
        } catch (error) {
            console.error(`❌ Failed to create directory ${dir}:`, error.message);
        }
    }
}

// Call this immediately
ensureDirectories();


// Configure Multer for Career Assets


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
const livestreamServices = require('./services/livestream');

// Import payment service
const paymentService = require('./services/payments');

const {
    db, initializeDatabase, ensureSessionTable, seedDatabase, getUserById, getUserByEmail, getUserByHandle, getUserByProvider, createUser, updateUserProvider, updateOnboarding, updateUserProfile,
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
    createPost, getFeedPosts, getUserPosts, getPostHashtags, getPostTags, attachHashtagsToPost, attachTagsToPost, getPopularHashtags, getPopularTags,
    getUserReposts, getRepostInfo,
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
    saveUserLocation, getUserLocation, getAllUserLocations, shouldUpdateLocation,
    // Career jobs
    createCareerJob, updateCareerJob, getCareerJobById, setCareerJobStatus,
    addCareerJobAsset, removeCareerJobAsset, getCareerJobAssets,
    getCareerJobsForAdmin, getPublicCareerJobs, getCareerApplicationsPaged, getHrTeam
} = require('./db');
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    // Node 18+ has global fetch; fallback
    fetch = global.fetch;
}

// Centralized media configuration for feed posts
const MEDIA_LIMITS = {
    MAX_IMAGE_SIZE_MB: 10,
    MAX_VIDEO_SIZE_MB: 400,
    MAX_AUDIO_SIZE_MB: 25,
    MAX_VIDEO_DURATION_SECONDS: 300
};

// Common upload MIME helpers so server acceptance stays consistent with the UI
const COMMON_IMAGE_MIME_TYPES = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'
];
const COMMON_VIDEO_MIME_TYPES = [
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/x-ms-wmv', 'video/x-m4v', 'video/mpeg'
];
const COMMON_AUDIO_MIME_TYPES = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/x-m4a', 'audio/flac'
];
const COMMON_DOCUMENT_MIME_TYPES = [
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const COMMON_UPLOAD_MIME_TYPES = new Set([
    ...COMMON_IMAGE_MIME_TYPES,
    ...COMMON_VIDEO_MIME_TYPES,
    ...COMMON_AUDIO_MIME_TYPES,
    ...COMMON_DOCUMENT_MIME_TYPES
]);

function isCommonUploadMime(mime) {
    if (!mime) return false;
    const lower = mime.toLowerCase();
    if (COMMON_UPLOAD_MIME_TYPES.has(lower)) return true;
    // Fallback: allow broad image/video/audio categories for variants not listed explicitly
    return lower.startsWith('image/') || lower.startsWith('video/') || lower.startsWith('audio/');
}

if (ffprobeStatic?.path) {
    try {
        ffmpeg.setFfprobePath(ffprobeStatic.path);
    } catch (err) {
        console.warn('Could not set ffprobe path', err.message);
    }
}

function getVideoDurationSeconds(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath) return resolve(0);
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata?.format?.duration;
            resolve(Number.isFinite(duration) ? Number(duration) : 0);
        });
    });
}

function deleteUploadFile(file) {
    if (!file) return;
    const target = file.path || path.join(file.destination || '', file.filename || '');
    if (!target) return;
    fs.unlink(target, () => { });
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
// Note: This is only used as a fallback when strategies are initialized.
// The actual callback URL is determined dynamically from the request in routes/auth.js
function getCallbackURL(path) {
    // Use explicit callback URL env var if set (provider-specific)
    // Otherwise use BASE_URL if explicitly set
    if (process.env.BASE_URL) {
        return `${process.env.BASE_URL}${path}`;
    }

    // Default to production domain (dream-x.app or www.dream-x.app)
    // The actual callback URL will be determined dynamically from the request
    return `https://dream-x.app${path}`;
}

// Resolve the best-effort base URL for links sent to users (prefers request host; defaults to production domain for emails)
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

    // No host available (e.g., background job): assume production domain
    const isDevelopment = process.env.NODE_ENV !== 'production';
    return isDevelopment ? 'http://localhost' : 'https://dream-x.app';
}

function safeParseArray(value, fallback = []) {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
        console.warn('Failed to parse JSON array value:', err.message);
        return fallback;
    }
}

function extractHashtags(text = '') {
    const tags = new Set();
    const regex = /#([A-Za-z0-9_][A-Za-z0-9_-]{0,38})/g;
    let match;
    while ((match = regex.exec(text))) {
        const value = (match[1] || '').toLowerCase();
        if (value) tags.add(value);
    }
    return Array.from(tags);
}

function parseTagInput(input) {
    if (!input) return [];
    const raw = Array.isArray(input) ? input : String(input).split(',');
    return raw
        .map((v) => (v || '').toString().trim())
        .filter(Boolean)
        .map((v) => v.replace(/^#/, ''));
}


// getAllEjsRoutes moved to routes/static.js

// Initialize Express app
const app = express();
// Trust proxy headers (needed on Render/other proxies for correct host/proto)
app.set('trust proxy', 1);

// ===== SECURITY MIDDLEWARE =====
// Apply security headers first
app.use(configureHelmet());
app.use(additionalSecurityHeaders);
app.use(blockSuspiciousUrls);

// HTTP Parameter Pollution protection
app.use(configureHpp());

// NoSQL injection prevention
app.use(configureSanitizer());

// Request size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/*app.use((req, res, next) => {
  if (!req.secure) {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});*/

/*const httpsServer = https.createServer({
    key: fs.readFileSync('./localhost+2-key.pem'),
    cert: fs.readFileSync('./localhost+2.pem'),
},app);*/
const httpServer = http.createServer(app);

const io = socketIo(httpServer, {
    cors: {
        origin: process.env.BASE_URL || 'http://localhost',
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

// Configure multer for file uploads using unified storage
const createStorageAdapter = require('./services/storage/multer-storage');

const upload = multer({
    storage: createStorageAdapter('profiles', 'profile-'),
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
const chatUpload = multer({
    storage: createStorageAdapter('chat', 'chat-'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for chat
    fileFilter: (req, file, cb) => {
        if (isCommonUploadMime(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Unsupported file type for chat'));
    }
});

// Refund request uploads (screenshots/receipts - images only)
const refundUpload = multer({
    storage: createStorageAdapter('refunds', 'refund-'),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for screenshots
    fileFilter: (req, file, cb) => {
        if ((file.mimetype || '').toLowerCase().startsWith('image/')) return cb(null, true);
        return cb(new Error('Only image files are allowed for screenshots'));
    }
});

// Posts/media uploads (supports images for image posts, videos/GIFs for reels)
const postUpload = multer({
    storage: createStorageAdapter('posts', 'post-'),
    limits: { fileSize: MEDIA_LIMITS.MAX_VIDEO_SIZE_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (isCommonUploadMime(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported media type for post'));
    }
});

// Career application uploads (resume/portfolio)
const careerUpload = multer({
    storage: createStorageAdapter('careers', 'career-'),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        const allowed = new Set([
            ...COMMON_DOCUMENT_MIME_TYPES,
            ...COMMON_IMAGE_MIME_TYPES,
            'application/zip',
            'application/x-zip-compressed'
        ]);
        if (allowed.has(m)) return cb(null, true);
        cb(new Error('Unsupported file type for application'));
    }
});

// Project uploads - handles project files and comment attachments
const projectUpload = multer({
    storage: createStorageAdapter('projects', 'project-'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for project files
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        // Allow images, PDFs, documents, and videos
        const allowed = new Set([
            ...COMMON_DOCUMENT_MIME_TYPES,
            ...COMMON_IMAGE_MIME_TYPES,
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/zip', 'application/x-zip-compressed'
        ]);
        if (allowed.has(m)) return cb(null, true);
        cb(new Error('Unsupported file type for projects'));
    }
});

// Career job asset uploads (role descriptions, compensation PDFs, etc.)
const careerAssetUpload = multer({
    storage: createStorageAdapter('career-assets', 'career-asset-'),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        const allowed = new Set([
            ...COMMON_DOCUMENT_MIME_TYPES,
            ...COMMON_IMAGE_MIME_TYPES,
            'application/zip', 'application/x-zip-compressed'
        ]);
        if (allowed.has(m)) return cb(null, true);
        cb(new Error('Unsupported file type for career asset'));
    }
});

// Service uploads (images, videos, documents for service listings)
const serviceUpload = multer({
    storage: createStorageAdapter('services', 'service-'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for service media
    fileFilter: (req, file, cb) => {
        const m = (file.mimetype || '').toLowerCase();
        const allowed = new Set([
            ...COMMON_IMAGE_MIME_TYPES,
            ...COMMON_VIDEO_MIME_TYPES,
            ...COMMON_DOCUMENT_MIME_TYPES
        ]);
        if (allowed.has(m)) return cb(null, true);
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

// Serve webauthn files with correct MIME type
app.use('/webauthn', express.static(simpleWebAuthnBundlePath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Import route modules
const staticRoutes = require('./routes/static/static');
const uploadsRoutes = require('./routes/static/uploads');
const webauthnRoutes = require('./routes/auth/webauthn');
const authRoutes = require('./routes/auth/auth');
const apiAuthRoutes = require('./routes/api/api-auth');
const webhookRoutes = require('./routes/payments/webhooks');
const initAdminRoutes = require('./routes/admin/admin');
const initFeedRoutes = require('./routes/feed/feed');
const initProfileRoutes = require('./routes/profile/profile');
const initMessagesRoutes = require('./routes/messages/messages');
const initSettingsRoutes = require('./routes/settings/settings');
const initServicesRoutes = require('./routes/services/services');
const initHrRoutes = require('./routes/hr/hr');
const initOnboardingRoutes = require('./routes/onboarding/onboarding');
const initBusinessRoutes = require('./routes/business/business');
const projectRoutes = require('./routes/projects/projects');
const initApiRoutes = require('./routes/api/api');
const initMiscRoutes = require('./routes/feed/misc');
const initLivestreamRoutes = require('./routes/api/livestream');

// Mount static routes (manifest, service worker, sitemap)
app.use('/', staticRoutes);

// Mount WebAuthn routes (passkey registration/authentication)
app.use('/passkey', webauthnRoutes);

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(robots({
  UserAgent: '*',
  Disallow: '',
  Sitemap: 'https://dream-x.app/sitemap.xml'
}));

// Note: express.json() and express.urlencoded() are already configured above with security middleware

// Input sanitization middleware (applied after parsing)
app.use(sanitizeRequest);

// Session configuration - Use PostgreSQL in production, SQLite locally
// Check for production mode - handle both 'production' and 'Production' (case-insensitive)
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const isProductionDB = nodeEnv === 'production' && (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql');

let sessionStore;
if (isProductionDB) {
    // Production: Use PostgreSQL for sessions
    // Note: createTableIfMissing is disabled - we handle table creation/migration via ensureSessionTable()
    // This ensures the table has the correct schema (sess/expire columns) for connect-pg-simple
    const { Pool } = require('pg');
    const pgPool = new Pool({
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: process.env.PG_PORT || process.env.DB_PORT || 5432,
        database: process.env.PG_DATABASE || process.env.DB_NAME || 'dreamx',
        user: process.env.PG_USER || process.env.DB_USER || 'postgres',
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
        // Azure PostgreSQL requires SSL - default to requiring it unless explicitly disabled
        ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    sessionStore = new pgSession({
        pool: pgPool,
        tableName: 'sessions',
        createTableIfMissing: false  // Disabled - ensureSessionTable() handles this
    });
} else {
    // Development: Use SQLite for sessions
    sessionStore = new SQLiteStore({ db: 'sessions.sqlite3', dir: './data' });
}

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    name: 'sessionId', // Rename session cookie to prevent fingerprinting
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        // Secure cookies in production or when BASE_URL is https
        secure: (process.env.NODE_ENV === 'production') || (process.env.BASE_URL || '').startsWith('https://'),
        sameSite: 'lax'
    },
    rolling: true, // Reset session expiration on each request
    unset: 'destroy' // Destroy session when unset
}));
app.use(passport.initialize());
app.use(passport.session());

// Azure Easy Auth middleware (production only) - Must be after session middleware
const { easyAuthMiddleware, shouldUsePassportOAuth } = require('./middleware/easy-auth');
app.use(easyAuthMiddleware);

// CSRF Protection - Applied after session middleware
// Generates tokens for GET requests and validates on POST/PUT/DELETE
app.use(csrfProtection);

// Use route modules - MUST be after session middleware
// Route initializations are handled below to avoid redeclaration

// RBAC Admin API routes
const rbacApiRoutes = require('./routes/admin/rbac');
app.use('/admin/rbac', rbacApiRoutes);

// RBAC Admin Dashboard routes
const rbacDashboardRoutes = require('./routes/admin/rbac-dashboard');
app.use('/rbac', rbacDashboardRoutes);

// Theme management routes
const themeRoutes = require('./routes/admin/theme');
app.use('/admin/theme', themeRoutes);

// Theme middleware - inject active theme CSS into all pages
const themeService = require('./services/theme');
app.use(themeService.themeMiddleware);

// Mount authentication routes (login, register, OAuth, password reset, email verification)
app.use('/', authRoutes);

// Mount mobile API authentication routes (token-based)
app.use('/', apiAuthRoutes);

// Mount project routes
app.use('/', projectRoutes);

// Mobile API authentication routes (token-based)

// Minimal serialize/deserialize (not strictly used since we set req.session.userId)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await getUserById(id);
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
        const user = await getUserById(userId);
        if (!user || user.push_notifications !== 1) return;
        const subs = getPushSubscriptions(userId) || [];
        const payload = JSON.stringify({ title: title || 'Dream X', body: body || '', url: url || '/', icon: '/img/icon-192x192.png', badge: '/img/badge-72x72.png' });
        for (const s of subs) {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
            } catch (err) {
                const status = err?.statusCode || err?.statusCode === 0 ? err.statusCode : err?.statusCode;
                if (status === 404 || status === 410) {
                    try { deletePushSubscription(s.endpoint); } catch (_) { }
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

async function handlePasswordChange({ userId, currentPassword, newPassword, confirmPassword }) {
    if (!currentPassword || !newPassword || !confirmPassword) {
        return { ok: false, message: 'All password fields required' };
    }

    if (newPassword !== confirmPassword) {
        return { ok: false, message: 'New passwords do not match' };
    }

    const complexityCheck = validatePasswordComplexity(newPassword);
    if (!complexityCheck.valid) {
        return { ok: false, message: `Password must contain ${complexityCheck.errors.join(', ')}.` };
    }

    const user = await getUserById(userId);
    if (!user) {
        return { ok: false, message: 'User not found' };
    }

    // Check if user has linked SSO accounts
    const linkedAccounts = await getLinkedAccountsForUser(userId) || [];
    const hasLinkedAccounts = linkedAccounts.length > 0;
    
    if (!user.password_hash) {
        return { ok: false, message: 'No password set for this account. Please set a password first.' };
    }
    
    // Validate that currentPassword is provided
    if (!currentPassword) {
        return { ok: false, message: 'Current password is required' };
    }
    
    // Verify current password
    const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    // If password verification fails and user has linked accounts, they're likely SSO-only
    // (SSO users have dummy passwords they don't know)
    if (!passwordValid && hasLinkedAccounts) {
        return { ok: false, message: 'Password changes are not available for SSO-only accounts. Your account is managed through SSO. Please use your SSO provider to sign in.' };
    }
    
    if (!passwordValid) {
        return { ok: false, message: 'Current password incorrect' };
    }

    const hash = await bcrypt.hash(newPassword, 10);
    updatePassword({ userId, passwordHash: hash });
    return { ok: true, message: 'Password changed successfully' };
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
async function generateUniqueHandle(baseHandle, excludeUserId = null) {
    let handle = baseHandle;
    let counter = 0;

    while (true) {
        const existing = await getUserByHandle(handle);
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
async function getSuggestedHandles(baseHandle, count = 3) {
    const suggestions = [];
    const random = () => Math.floor(Math.random() * 999);

    // Suggestion 1: base + random number
    suggestions.push(await generateUniqueHandle(`${baseHandle}${random()}`));

    // Suggestion 2: base + underscore + random number
    suggestions.push(await generateUniqueHandle(`${baseHandle}_${random()}`));

    // Suggestion 3: base + sequential number
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

// Use unified OAuth helpers (replaces duplicate functions)
const { findOrCreateOAuthUser, importProfilePhotoIfNeeded } = require('./utils/oauth-helpers');

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

// Google OAuth (only if not using Easy Auth in production)
if (shouldUsePassportOAuth() && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    // Note: Google OAuth doesn't support per-request callback URL override like Microsoft
    // Must whitelist all callback URLs in Google Cloud Console
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || (process.env.BASE_URL ? `${process.env.BASE_URL}/auth/google/callback` : 'http://localhost/auth/google/callback');
    passport.use('google', new GoogleStrategy({
        passReqToCallback: true,
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
        skipUserProfile: false
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : null;
            const photoUrl = Array.isArray(profile.photos) && profile.photos[0] ? profile.photos[0].value : null;
            const user = await findOrCreateOAuthUser({ provider: 'google', providerId: profile.id, displayName: profile.displayName, email });
            await importProfilePhotoIfNeeded(user, photoUrl);
            done(null, user, { provider: 'google', providerId: profile.id, photoUrl });
        } catch (e) { 
            console.error('❌ [Google] OAuth error:', e.message);
            done(e); 
        }
    }));
} else {
    console.warn('Google OAuth not configured');
}

// Microsoft OAuth (only if not using Easy Auth in production)
if (shouldUsePassportOAuth() && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    // Note: Microsoft OAuth callback URL is set at initialization
    // Must whitelist all callback URLs in Azure AD app configuration
    const callbackURL = process.env.MICROSOFT_CALLBACK_URL || (process.env.BASE_URL ? `${process.env.BASE_URL}/auth/microsoft/callback` : 'http://localhost/auth/microsoft/callback');
    passport.use(new MicrosoftStrategy({
        passReqToCallback: true,
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: callbackURL,
        scope: ['openid', 'profile', 'email', 'User.Read'],
        tenant: 'consumers' // Use 'consumers' for personal Microsoft accounts, 'common' for all account types
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

// X (Twitter) OAuth 2.0 (only if not using Easy Auth in production)
if (shouldUsePassportOAuth() && process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
    // Twitter OAuth 2.0 callback URL MUST match exactly what's registered in Twitter Developer Console
    // This URL is static - it's set when the strategy is initialized
    // If you change where you access the app, update this environment variable
    
    // Build the callback URL - try to be smart about detecting the environment
    let callbackURL = process.env.TWITTER_CALLBACK_URL;
    
    if (!callbackURL) {
        // If not explicitly set, use sensible defaults
        if (process.env.BASE_URL) {
            callbackURL = `${process.env.BASE_URL}/auth/x/callback`;
        } else {
            // Default for local development
            callbackURL = 'http://localhost/auth/x/callback';
        }
    }
    
    passport.use('twitter', new TwitterStrategy({
        clientType: 'confidential',
        clientID: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        callbackURL: callbackURL,
        passReqToCallback: true,
        // Twitter OAuth 2.0 scopes - must be enabled in Twitter Developer Console
        scope: ['tweet.read', 'users.read']
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            const photoUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
            const displayName = profile.displayName || profile.username || email || 'Twitter User';
            const user = await findOrCreateOAuthUser({ provider: 'twitter', providerId: profile.id, displayName: displayName, email });
            await importProfilePhotoIfNeeded(user, photoUrl);
            done(null, user, { provider: 'twitter', providerId: profile.id, photoUrl });
        } catch (e) { 
            console.error('❌ [Twitter] OAuth error:', e.message);
            done(e); 
        }
    }));
} else {
    if (process.env.TWITTER_CLIENT_ID && !process.env.TWITTER_CLIENT_SECRET) {
        console.warn('⚠️ TWITTER_CLIENT_ID is set but TWITTER_CLIENT_SECRET is empty! Twitter OAuth will not work.');
    } else {
        console.warn('X (Twitter) OAuth 2.0 not configured - missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET');
    }
}

// Functions to seed data - will be called after database is initialized
async function seedAdminUser() {
    try {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@dreamx.local';
        const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin!123';
        const existing = await getUserByEmail(adminEmail);
        if (!existing) {
            const hash = await bcrypt.hash(adminPass, 10);
            const id = await createUser({ fullName: 'Super Admin', email: adminEmail, passwordHash: hash });
            if (!id) {
                console.error('Failed to create admin user: no ID returned');
                return;
            }
            updateUserRole({ userId: id, role: 'super_admin' });
            // Ensure seeded super admin is verified
            try { markEmailAsVerified({ userId: id }); } catch (_) { }
            console.log(`✅ Seeded super admin: ${adminEmail} / ${adminPass}`);
        } else if (String(process.env.DEFAULT_ADMIN_FORCE_RESET || '').toLowerCase() === 'true') {
            // Optional: force reset password for existing default admin
            const newPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin!123';
            const hash = await bcrypt.hash(newPass, 10);
            db.prepare(`UPDATE users SET password_hash = ? WHERE email = ?`).run(hash, adminEmail);
            console.log(`✅ Reset super admin password for ${adminEmail}`);
            // Ensure existing super admin is verified
            try { markEmailAsVerified({ userId: existing.id }); } catch (_) { }
        }
        // Auto-verify any global admin accounts (prevent lockout)
        try {
            const globalAdmins = db.prepare('SELECT id, email_verified FROM users WHERE role = ?').all('global_admin');
            for (const ga of globalAdmins) {
                if (ga.email_verified !== 1) {
                    markEmailAsVerified({ userId: ga.id });
                }
            }
        } catch (e) {
            console.warn('Global admin verification scan failed:', e.message);
        }
    } catch (e) {
        console.warn('Admin seed failed:', e.message);
    }
}

// Initialize payment processors
function initializePaymentProcessors() {
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
}

// Attach auth context to templates
app.use(async (req, res, next) => {
    try {
        let user = null;
        let unreadCount = 0;

        // Debug logging for session status
        const isServicesOrFeed = req.path === '/services' || req.path === '/feed';

        if (req.session && req.session.userId) {
            const row = await getUserById(req.session.userId);
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
        // Always set these values, even if null/undefined, to prevent EJS ReferenceError
        res.locals.authUser = user || null;
        res.locals.unreadMessageCount = unreadCount || 0;
        next();
    } catch (err) {
        console.error('Error in auth middleware:', err);
        // Set defaults on error to prevent template errors
        res.locals.authUser = null;
        res.locals.unreadMessageCount = 0;
        next();
    }
});

// Attach RBAC context middleware
const { attachRbacContext } = require('./middleware/rbac');
app.use(attachRbacContext);

// Force email verification for authenticated users
app.use(async (req, res, next) => {
    try {
        if (!req.session.userId) return next();
        const user = await getUserById(req.session.userId);
        if (!user) return next();
        const isVerified = user.email_verified === true || user.email_verified === 1 || user.email_verified === '1';
        if (isVerified) return next();

        // Allowlist: verification flow, logout, auth, static assets, and essential files
        const p = req.path || '';
        const isStatic = p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/img/') || p.startsWith('/uploads/') || p.startsWith('/fonts/') || p === '/favicon.ico' || p === '/robots.txt' || p.startsWith('/manifest') || p.startsWith('/service-worker');
        const allowedExact = new Set(['/verify-email', '/resend-verification', '/logout', '/api/push/public-key']);
        const isAuthPath = p === '/login' || p === '/register' || p.startsWith('/auth/') || p.startsWith('/webauthn/') || p.startsWith('/.auth/'); // Allow Azure Easy Auth endpoints
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
app.use(async (req, res, next) => {
    try {
        if (!req.session || !req.session.userId) return next();
        const user = await getUserById(req.session.userId);
        if (!user) return next();
        // Only prompt if email is verified but onboarding not completed
        const isVerified = user.email_verified === true || user.email_verified === 1 || user.email_verified === '1';
        if (isVerified && userNeedsOnboarding(user)) {
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
};

// Onboarding routes are now in routes/onboarding/onboarding.js

// RBAC helpers
const ADMIN_PERMISSION_DEFINITIONS = [
    { key: 'manage_users', label: 'Manage Users', desc: 'Invite, suspend, and verify community accounts.' },
    { key: 'manage_admins', label: 'Manage Admins', desc: 'Promote admins and adjust their access.' },
    { key: 'moderate_content', label: 'Moderate Content', desc: 'Review feed posts, livestreams, and reported media.' },
    { key: 'billing', label: 'Billing & Refunds', desc: 'Process payments, disputes, and invoices.' },
    { key: 'services_moderation', label: 'Services Moderation', desc: 'Hide, restore, or delete services listings.' },
    { key: 'refunds', label: 'Refund Desk', desc: 'Approve or deny refund requests.' },
    { key: 'careers', label: 'Careers & Recruiting', desc: 'Manage career applications and hiring funnels.' },
    { key: 'appeals', label: 'Appeals & Support', desc: 'Handle account and content appeal queues.' },
    { key: 'announcements', label: 'Communications', desc: 'Publish announcements and send notifications.' },
    { key: 'feature_flags', label: 'Feature Flags', desc: 'Control experiments and gated rollouts.' },
    { key: 'audit_logs', label: 'Audit Logs', desc: 'Inspect privileged actions and access history.' },
    { key: 'user_moderation', label: 'User Moderation', desc: 'Ban or reinstate accounts and enforce policies.' },
    { key: 'platform_metrics', label: 'Platform Metrics', desc: 'View KPIs and real-time operational stats.' }
];
const ADMIN_PERMISSION_KEYS = new Set(ADMIN_PERMISSION_DEFINITIONS.map(p => p.key));

// Business Admin Permission Definitions - 10+ permissions for enterprise sales/business operations
const BUSINESS_ADMIN_PERMISSION_DEFINITIONS = [
    { key: 'sales_inquiries_view', label: 'View Sales Inquiries', desc: 'View enterprise sales inquiry submissions.' },
    { key: 'sales_inquiries_manage', label: 'Manage Sales Inquiries', desc: 'Assign, update status, and close sales inquiries.' },
    { key: 'sales_inquiries_contact', label: 'Contact Prospects', desc: 'Send follow-up emails to sales leads.' },
    { key: 'business_team_view', label: 'View Business Team', desc: 'View other business admins in the organization.' },
    { key: 'business_team_manage', label: 'Manage Business Team', desc: 'Create and manage subordinate business admins.' },
    { key: 'enterprise_accounts', label: 'Enterprise Accounts', desc: 'View and manage enterprise customer accounts.' },
    { key: 'sales_analytics', label: 'Sales Analytics', desc: 'View sales pipeline metrics and conversion data.' },
    { key: 'contract_management', label: 'Contract Management', desc: 'Create and manage enterprise contracts.' },
    { key: 'pricing_customization', label: 'Custom Pricing', desc: 'Create custom pricing packages for enterprises.' },
    { key: 'partner_management', label: 'Partner Management', desc: 'Manage business partners and affiliates.' },
    { key: 'revenue_reports', label: 'Revenue Reports', desc: 'Access revenue and financial reports.' },
    { key: 'customer_success', label: 'Customer Success', desc: 'Manage customer onboarding and success programs.' }
];
const BUSINESS_ADMIN_PERMISSION_KEYS = new Set(BUSINESS_ADMIN_PERMISSION_DEFINITIONS.map(p => p.key));

const HR_PERMISSION_DEFINITIONS = [
    { key: 'hr_applications', label: 'Applications & Review', desc: 'View and triage candidate submissions.' },
    { key: 'hr_pipeline', label: 'Pipeline Moves', desc: 'Advance, reject, and tag candidates in the pipeline.' },
    { key: 'hr_jobs', label: 'Job Posts', desc: 'Create and update open roles and publishing status.' },
    { key: 'hr_messages', label: 'Candidate Outreach', desc: 'Email and message candidates from the HR desk.' },
    { key: 'hr_team', label: 'HR Team Management', desc: 'Create HR teammates and assign their scopes.' },
    { key: 'hr_scopes', label: 'Scope Stewardship', desc: 'Add or retire scopes for downstream HR workflows.' }
];
const HR_PERMISSION_KEYS = new Set(HR_PERMISSION_DEFINITIONS.map(p => p.key));
const HR_PAGE_SCOPES = ['hr-dashboard', 'candidate-pipeline', 'career-applications', 'job-board', 'hr-org', 'talent-outreach'];

// Role ranks - business_admin sits between admin and super_admin in hierarchy
const roleRank = { user: 1, hr: 2, super_hr: 3, global_hr: 4, business_admin: 5, admin: 6, super_admin: 7, global_admin: 8 };
const hrRoleRank = { hr: 1, super_hr: 2, global_hr: 3 };
const businessAdminRoleRank = { business_admin: 1 };

const parseAdminMeta = (user) => {
    try {
        const cleanPerms = normalizeArray(user.admin_permissions ? JSON.parse(user.admin_permissions) : [])
            .filter(p => ADMIN_PERMISSION_KEYS.has(p) || BUSINESS_ADMIN_PERMISSION_KEYS.has(p));
        return {
            permissions: cleanPerms,
            scopes: normalizeArray(user.admin_scopes ? JSON.parse(user.admin_scopes) : [])
        };
    } catch (_) {
        return { permissions: [], scopes: [] };
    }
};

const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isBusinessAdmin = (user) => user && user.role === 'business_admin';
const isHR = (user) => user && ['hr', 'super_hr', 'global_hr'].includes(user.role);
const isSuperHR = (user) => user && (user.role === 'super_hr' || user.role === 'global_hr');
const isGlobalHR = (user) => user && user.role === 'global_hr';
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';

const hasPermission = (user, permission) => {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    const { permissions } = parseAdminMeta(user);
    return permissions.includes(permission);
};

const hasBusinessPermission = (user, permission) => {
    if (!user) return false;
    if (isSuperAdmin(user) || isGlobalAdmin(user)) return true;
    if (!isBusinessAdmin(user)) return false;
    const { permissions } = parseAdminMeta(user);
    return permissions.includes(permission);
};

const canManageHrRole = (actor, targetRole) => {
    if (!actor || !isHR(actor)) return false;
    const actorRank = hrRoleRank[actor.role] || 0;
    const targetRank = hrRoleRank[targetRole] || 0;
    return actorRank > targetRank && actorRank >= 2;
};

const requireAdmin = async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!isAdmin(user)) return res.redirect('/');
    next();
};
const requireSuperAdmin = async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!isSuperAdmin(user)) return res.redirect('/admin?error=Insufficient+permissions');
    next();
};
const requireHR = async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!isHR(user)) return res.redirect('/');
    next();
};
const requireAdminOrHR = async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!isAdmin(user) && !isHR(user)) return res.redirect('/');
    next();
};
const requireBusinessAdmin = async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!isBusinessAdmin(user) && !isSuperAdmin(user) && !isGlobalAdmin(user)) {
        return res.redirect('/?error=Access+denied');
    }
    next();
};
const requireBusinessAdminPermission = (permission) => async (req, res, next) => {
    const user = req.session.userId ? await getUserById(req.session.userId) : null;
    if (!hasBusinessPermission(user, permission)) {
        return res.status(403).json({ error: 'Insufficient business admin permissions' });
    }
    next();
};

// ===== ROUTES =====
// Routes are now organized in the routes/ directory.
// Each route module is initialized with the necessary dependencies and mounted below.

// Initialize and mount route modules that require dependencies
// Admin routes
const adminRoutes = initAdminRoutes({ io, webpush });
app.use('/', adminRoutes);

// Feed routes (posts, search, hashtags, reels, reactions, comments)
const feedRoutes = initFeedRoutes({ postUpload, io });
app.use('/', feedRoutes);

// Profile routes
const profileRoutes = initProfileRoutes({ upload, io });
app.use('/', profileRoutes);

// Messages routes
const messagesRoutes = initMessagesRoutes({ chatUpload, io });
app.use('/', messagesRoutes);

// Settings routes
const settingsRoutes = initSettingsRoutes();
app.use('/', settingsRoutes);

// Services routes
const servicesRoutes = initServicesRoutes({ io });
app.use('/', servicesRoutes);

// HR routes
const hrRoutes = initHrRoutes({ emailService, careerAssetUpload });
app.use('/', hrRoutes);

// Onboarding routes
const onboardingRoutes = initOnboardingRoutes({ upload });
app.use('/', onboardingRoutes);

// Business routes
const businessRoutes = initBusinessRoutes({ emailService });
app.use('/', businessRoutes);

// API routes
const apiRoutes = initApiRoutes({ io, careerUpload });
app.use('/', apiRoutes);

// Misc routes (map, location, pricing, etc.)
const miscRoutes = initMiscRoutes();
app.use('/', miscRoutes);

// Livestream routes
const livestreamRoutes = initLivestreamRoutes({ io });
app.use('/', livestreamRoutes);

// Payment webhook routes
app.use('/', webhookRoutes);

// Upload file serving routes
app.use('/', uploadsRoutes);

// Home page
app.get('/', (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.render('index', {
        title: 'Home - Dream X',
        currentPage: 'home',
        authUser: res.locals.authUser
    });
});


// Error handler for 503 errors (catch-all for unmatched routes)
// IMPORTANT: Exclude Azure Easy Auth endpoints (/.auth/*) - those are handled by Azure, not the app
app.use((req, res, next) => {
    // Skip Azure Easy Auth endpoints - let Azure handle them
    // Azure handles /.auth/login/{provider} and /.auth/logout at the platform level
    // The app only handles /.auth/login/{provider}/callback
    if (req.path.startsWith('/.auth/') && !req.path.endsWith('/callback')) {
        // If we're here, Azure Easy Auth isn't handling this request at the platform level
        // This means the provider (e.g., Twitter/X) isn't configured in Azure Portal
        // Skip this catch-all and let the 404 handler provide a helpful error
        return next();
    }
    
    // If response was already sent (e.g., by Azure Easy Auth), don't send another
    if (res.headersSent || res.finished) {
        return next();
    }
    res.status(503).render('errors/503', { title: 'Service Unavailable - Dream X' });
});

// Error handler for 500 errors
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    console.error('Error Stack:', err.stack);
    console.error('Request Path:', req.path);
    console.error('Request Method:', req.method);
    res.status(500).render('errors/500', { title: 'Server Error - Dream X' });
});

// 404 handler - must be last route
// IMPORTANT: Skip Azure Easy Auth endpoints (/.auth/*) - those are handled by Azure, not the app
app.use((req, res) => {
    // Skip Azure Easy Auth endpoints (except callbacks which we handle)
    // Azure handles /.auth/login/{provider} and /.auth/logout at the platform level
    if (req.path.startsWith('/.auth/') && !req.path.endsWith('/callback')) {
        // If we're here, Azure Easy Auth isn't handling this request
        // This means the provider (e.g., Twitter/X) isn't configured in Azure Portal
        // Return a helpful error instead of 404
        console.warn(`⚠️ Azure Easy Auth endpoint ${req.path} reached the app - provider may not be configured in Azure Portal`);
        return res.status(503).json({
            error: 'Authentication provider not configured',
            message: `The authentication provider for ${req.path} is not configured in Azure App Service. Please configure it in Azure Portal → Authentication → Identity providers.`,
            path: req.path
        });
    }
    res.status(404).render('errors/404', { title: 'Page Not Found - Dream X' });
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


/*httpsServer.listen(443, () => {
    console.log(`✨ Dream X server running on https://localhost:443`);
    console.log(`Press Ctrl+C to stop the server`);
    console.log(`HTTPS server running at https://localhost:443`);
});*/

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database connection (required for PostgreSQL in production)
        // Check for production mode - handle both 'production' and 'Production' (case-insensitive)
        const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
        if (nodeEnv === 'production' || process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
            console.log('🔄 Initializing PostgreSQL database...');
            try {
                await initializeDatabase();
                console.log('✅ Database initialization complete');
            } catch (err) {
                console.error('❌ Database initialization failed:', err);
                console.error('This is a critical error. The application may not function correctly.');
                // Don't exit - let the app start but log the error
            }
            await ensureSessionTable();
            console.log('✅ Database initialized for production');
        }
        
        // Seed built-in accounts (admin, HR, business admin) - always run
        await seedDatabase();
        
        // Seed data and initialize processors after database is ready
        await seedAdminUser();
        initializePaymentProcessors();
        
        httpServer.listen(process.env.PORT || 80, () => {
            console.log(`HTTP server running at http://localhost`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();


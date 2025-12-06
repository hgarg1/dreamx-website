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
const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const bcrypt = require('bcrypt');
const multer = require('multer');
const https = require('https');
const http = require('http');
const robots = require('express-robots-txt');
const { SitemapStream, streamToPromise } = require('sitemap');


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

// Import payment service
const paymentService = require('./services/payments');

const {
    db, initializeDatabase, seedDatabase, getUserById, getUserByEmail, getUserByHandle, getUserByProvider, createUser, updateUserProvider, updateOnboarding, updateUserProfile,
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


app.use('/webauthn', express.static(simpleWebAuthnBundlePath));

// Import route modules
const staticRoutes = require('./routes/static/static');
const webauthnRoutes = require('./routes/auth/webauthn');

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

// Parse URL-encoded bodies (for form submissions) - MUST be before session middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration (SQLiteStore for production safety) - MUST be before routes
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite3', dir: './data' }),
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

// Use route modules - MUST be after session middleware
// Route initializations are handled below to avoid redeclaration

// RBAC Admin API routes
const rbacApiRoutes = require('./routes/admin/rbac');
app.use('/admin/rbac', rbacApiRoutes);

// RBAC Admin Dashboard routes
const rbacDashboardRoutes = require('./routes/admin/rbac-dashboard');
app.use('/rbac', rbacDashboardRoutes);

// Mobile API authentication routes (token-based)

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

    const user = getUserById(userId);
    if (!user) {
        return { ok: false, message: 'User not found' };
    }

    // Check if user has linked SSO accounts
    const linkedAccounts = getLinkedAccountsForUser(userId) || [];
    const hasLinkedAccounts = linkedAccounts.length > 0;
    
    if (!user.password_hash) {
        return { ok: false, message: 'No password set for this account. Please set a password first.' };
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

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash || '');
    if (!validPassword) {
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

// Microsoft OAuth
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
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

// X (Twitter) OAuth 2.0
if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
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
        const existing = getUserByEmail(adminEmail);
        if (!existing) {
            const hash = await bcrypt.hash(adminPass, 10);
            const id = createUser({ fullName: 'Super Admin', email: adminEmail, passwordHash: hash });
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
app.use((req, res, next) => {
    try {
        let user = null;
        let unreadCount = 0;

        // Debug logging for session status
        const isServicesOrFeed = req.path === '/services' || req.path === '/feed';

        if (req.session && req.session.userId) {
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

// Onboarding reminder page (sets session flag so we don't loop in same session)
app.get('/onboarding-empty', (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (!req.session.userId) return res.redirect('/login');
    const user = getUserById(req.session.userId);
    if (!user) return res.redirect('/login');
    // If they already finished, just go to feed
    if (!userNeedsOnboarding(user)) return res.redirect('/feed');
    req.session.seenOnboardingPrompt = true;
    res.render('user/onboarding-empty', {
        title: 'Onboarding - Let\'s Get Started | Dream X',
        currentPage: 'onboarding-empty',
        authUser: res.locals.authUser || user
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
const requireBusinessAdmin = (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isBusinessAdmin(user) && !isSuperAdmin(user) && !isGlobalAdmin(user)) {
        return res.redirect('/?error=Access+denied');
    }
    next();
};
const requireBusinessAdminPermission = (permission) => (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!hasBusinessPermission(user, permission)) {
        return res.status(403).json({ error: 'Insufficient business admin permissions' });
    }
    next();
};

// ===== ROUTES =====
// Routes are now organized in the routes/ directory:
// - routes/static.js: Static files (manifest, service-worker, sitemap)
// - routes/webauthn.js: WebAuthn/Passkey routes
// Additional route files should be created for:
// - routes/auth.js: Authentication routes (login, register, OAuth, password reset)
// - routes/settings.js: Settings routes
// - routes/feed.js: Feed and post routes
// - routes/profile.js: Profile routes
// - routes/messages.js: Messages routes
// - routes/services.js: Services routes
// - routes/admin.js: Admin routes
// - routes/hr.js: HR routes
// - routes/api.js: API routes

// WebAuthn routes are now in routes/webauthn.js

// OAuth routes are now in routes/auth.js

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

const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (val && typeof val === 'object' && Array.isArray(val.scopes)) return val.scopes.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string' && val.length) return [val.trim()];
    return [];
};
const sanitizePermissions = (val) => normalizeArray(val).filter(p => ADMIN_PERMISSION_KEYS.has(p));
const sanitizeHrPermissions = (val) => normalizeArray(val).filter(p => HR_PERMISSION_KEYS.has(p));
const parseHrMeta = (user) => {
    let scopes = [];
    let locked = false;
    try {
        const raw = user.admin_scopes ? JSON.parse(user.admin_scopes) : [];
        if (Array.isArray(raw)) {
            scopes = normalizeArray(raw);
        } else if (raw && typeof raw === 'object') {
            scopes = normalizeArray(raw.scopes || []);
            locked = !!raw.locked;
        }
    } catch (_) {
        scopes = [];
    }

    let hrPermissions = [];
    try {
        hrPermissions = sanitizeHrPermissions(user.admin_permissions ? JSON.parse(user.admin_permissions) : []);
    } catch (_) {
        hrPermissions = [];
    }

    return { scopes, locked, hrPermissions };
};
const defaultPermissionsForRole = (role) => {
    if (role === 'global_admin' || role === 'super_admin') return Array.from(ADMIN_PERMISSION_KEYS);
    if (role === 'admin') return ['manage_users', 'moderate_content', 'billing', 'services_moderation', 'refunds', 'careers', 'appeals'];
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
        try { perms = sanitizePermissions(u.admin_permissions ? JSON.parse(u.admin_permissions) : []); } catch (_) { perms = []; }
        try {
            const rawScopes = u.admin_scopes ? JSON.parse(u.admin_scopes) : [];
            scopes = Array.isArray(rawScopes) ? normalizeArray(rawScopes) : normalizeArray(rawScopes.scopes || []);
        } catch (_) { scopes = []; }
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
    } catch (e) { console.warn('Queue fetch error:', e.message); }

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
    } catch (e) {
        console.warn('Refund requests fetch error:', e.message);
    }

    res.render('admin/admin-consolidated', {
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
        adminPermissions: ADMIN_PERMISSION_DEFINITIONS,
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
    let permissions = sanitizePermissions(req.body.permissions);
    let scopes = normalizeArray(req.body.scopes);

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (getUserByEmail(email)) {
        return res.status(409).json({ error: 'User with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (targetRole === 'user') {
        permissions = [];
    } else if (!permissions.length) {
        permissions = defaultPermissionsForRole(targetRole);
    }
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
    if (targetUser.role === 'user') {
        return res.status(400).json({ error: 'Cannot assign admin permissions to standard users' });
    }
    if (actor.role === 'admin' && !hasPermission(actor, 'manage_admins')) {
        return res.status(403).json({ error: 'Missing manage_admins permission' });
    }
    const permissions = sanitizePermissions(req.body.permissions);
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
    res.render('admin/admin-services', {
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
                        const baseUrl = getRequestBaseUrl(req);
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
                        const baseUrl = getRequestBaseUrl(req);
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
                        const baseUrl = getRequestBaseUrl(req);
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
                    const baseUrl = getRequestBaseUrl(req);
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
    if (!['user', 'admin', 'super_admin', 'global_admin', 'hr', 'super_hr', 'global_hr'].includes(role)) {
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
    } catch (e) { }
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

    res.render('admin/admin-user-stats', {
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
    try { addAuditLog({ userId: req.session.userId, action: 'export_users', details: null }); } catch (e) { }
    const rows = getAllUsers();
    const header = 'id,full_name,email,role,created_at\n';
    const csv = header + rows.map(r => `${r.id},"${(r.full_name || '').replace(/"/g, '""')}",${r.email},${r.role},${r.created_at}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
});

app.get('/admin/export/messages.csv', requireAdmin, (req, res) => {
    try { addAuditLog({ userId: req.session.userId, action: 'export_messages', details: null }); } catch (e) { }
    const rows = db.prepare(`SELECT m.id, m.conversation_id, m.sender_id, u.email as sender_email, m.content, m.read, m.created_at
                             FROM messages m JOIN users u ON u.id = m.sender_id
                             ORDER BY m.created_at DESC`).all();
    const header = 'id,conversation_id,sender_id,sender_email,content,read,created_at\n';
    const csv = header + rows.map(r => `${r.id},${r.conversation_id},${r.sender_id},${r.sender_email},"${(r.content || '').replace(/"/g, '""')}",${r.read},${r.created_at}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="messages.csv"');
    res.send(csv);
});

// HR leadership APIs
app.get('/api/hr/team', requireHR, (req, res) => {
    const team = (getHrTeam() || []).map(member => {
        const hrMeta = parseHrMeta(member);
        return { ...member, admin_scopes: hrMeta.scopes, hr_permissions: hrMeta.hrPermissions, scope_locked: hrMeta.locked };
    });
    res.json({ success: true, team });
});

app.post('/api/hr/accounts', requireHR, async (req, res) => {
    const actor = req.session.userId ? getUserById(req.session.userId) : null;
    if (!actor) return res.status(403).json({ error: 'Unauthorized' });
    if (!isSuperHR(actor)) return res.status(403).json({ error: 'Only senior HR can create team members' });

    const fullName = (req.body.fullName || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const targetRole = (req.body.role || 'hr').toLowerCase();
    const scopes = normalizeArray(req.body.scopes);
    let hrPermissions = sanitizeHrPermissions(req.body.hrPermissions || req.body.hr_permissions);

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    }
    if (!['hr', 'super_hr'].includes(targetRole)) {
        return res.status(400).json({ error: 'Role must be HR or Super HR' });
    }
    if (!canManageHrRole(actor, targetRole)) {
        return res.status(403).json({ error: 'You can only create roles below your tier' });
    }
    if (!scopes.length) {
        scopes = HR_PAGE_SCOPES;
    }
    if (!hrPermissions.length) {
        hrPermissions = targetRole === 'super_hr'
            ? Array.from(HR_PERMISSION_KEYS)
            : ['hr_applications', 'hr_pipeline', 'hr_jobs', 'hr_messages'];
    }
    if (getUserByEmail(email)) {
        return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUserId = createUser({ fullName, email, passwordHash });
    updateUserRole({ userId: newUserId, role: targetRole });
    updateAdminPermissions({ userId: newUserId, permissions: hrPermissions, scopes: { scopes, locked: false } });
    addAuditLog({ userId: actor.id, action: 'hr_created_account', details: JSON.stringify({ email, role: targetRole }) });

    const created = getUserById(newUserId);
    res.json({
        success: true,
        user: {
            id: created.id,
            full_name: created.full_name,
            email: created.email,
            role: created.role,
            admin_scopes: scopes,
            hr_permissions: hrPermissions,
            scope_locked: false,
            created_at: created.created_at
        }
    });
});

app.post('/api/hr/accounts/:id/scopes', requireHR, (req, res) => {
    const actor = req.session.userId ? getUserById(req.session.userId) : null;
    const targetId = parseInt(req.params.id, 10);
    const targetUser = getUserById(targetId);
    if (!actor || !targetUser || !isHR(targetUser)) {
        return res.status(404).json({ error: 'HR account not found' });
    }
    if (!canManageHrRole(actor, targetUser.role)) {
        return res.status(403).json({ error: 'You can only adjust scopes for lower-tier HR accounts' });
    }
    const hrMeta = parseHrMeta(targetUser);
    if (hrMeta.locked && !isGlobalHR(actor)) {
        return res.status(403).json({ error: 'Scopes are locked by Global HR' });
    }
    const scopes = normalizeArray(req.body.scopes);
    const nextLock = req.body.lock === true ? true : (req.body.lock === false ? false : hrMeta.locked);
    const shouldLock = isGlobalHR(actor) ? nextLock : hrMeta.locked;
    const hrPermissions = hrMeta.hrPermissions;
    updateAdminPermissions({ userId: targetId, permissions: hrPermissions, scopes: { scopes, locked: shouldLock } });
    addAuditLog({ userId: actor.id, action: 'hr_scopes_updated', details: JSON.stringify({ target: targetUser.email, scopes, locked: shouldLock }) });
    return res.json({ success: true, scopes, locked: shouldLock });
});

app.post('/api/hr/accounts/:id/permissions', requireHR, (req, res) => {
    const actor = req.session.userId ? getUserById(req.session.userId) : null;
    const targetId = parseInt(req.params.id, 10);
    const targetUser = getUserById(targetId);
    if (!actor || !targetUser || !isHR(targetUser)) {
        return res.status(404).json({ error: 'HR account not found' });
    }
    if (!canManageHrRole(actor, targetUser.role)) {
        return res.status(403).json({ error: 'You can only adjust permissions for lower-tier HR accounts' });
    }
    const hrMeta = parseHrMeta(targetUser);
    const hrPermissions = sanitizeHrPermissions(req.body.hrPermissions || req.body.permissions);
    updateAdminPermissions({ userId: targetId, permissions: hrPermissions, scopes: { scopes: hrMeta.scopes, locked: hrMeta.locked } });
    addAuditLog({ userId: actor.id, action: 'hr_permissions_updated', details: JSON.stringify({ target: targetUser.email, hrPermissions }) });
    return res.json({ success: true, hrPermissions });
});

// HR review portal
app.get('/hr', requireHR, (req, res) => {
    const me = getUserById(req.session.userId);
    const careers = getCareerApplicationsPaged({ limit: 100, offset: 0 });
    const jobPostings = getCareerJobsForAdmin();
    const hrTeam = (getHrTeam() || []).map(member => {
        const hrMeta = parseHrMeta(member);
        return { ...member, admin_scopes: hrMeta.scopes, hr_permissions: hrMeta.hrPermissions, scope_locked: hrMeta.locked };
    });

    // Calculate counts for each status
    const totalApps = careers.length;
    const newApps = careers.filter(c => c.status === 'new' || !c.status).length;
    const reviewApps = careers.filter(c => c.status === 'under_review').length;
    const acceptedApps = careers.filter(c => c.status === 'accepted').length;
    const rejectedApps = careers.filter(c => c.status === 'rejected').length;

    res.render('hr/hr', {
        title: 'HR Review - Dream X',
        currentPage: 'hr',
        authUser: me,
        careers,
        totalApps,
        newApps,
        reviewApps,
        acceptedApps,
        rejectedApps,
        jobPostings,
        hrTeam,
        hrPermissionDefinitions: HR_PERMISSION_DEFINITIONS,
        defaultHrScopes: HR_PAGE_SCOPES,
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
        } catch (e) { }

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

const parseJobTags = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(r => String(r).trim()).filter(Boolean).slice(0, 10);
    return String(raw).split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
};

const resolveJobStatus = ({ requestedStatus, goLiveAt, freezeUntil }) => {
    const now = Date.now();
    const liveAt = goLiveAt ? new Date(goLiveAt).getTime() : null;
    const freezeUntilTs = freezeUntil ? new Date(freezeUntil).getTime() : null;
    if (requestedStatus === 'closed') return 'closed';
    if (freezeUntilTs && freezeUntilTs > now) return 'frozen';
    if (requestedStatus === 'frozen') return 'frozen';
    if (liveAt && liveAt > now) return 'scheduled';
    return requestedStatus || 'live';
};

// HR job management APIs
app.get('/api/hr/career-jobs', requireHR, (req, res) => {
    const jobs = getCareerJobsForAdmin();
    res.json({ success: true, jobs });
});

app.post('/api/hr/career-jobs', requireHR, careerAssetUpload.array('assetFiles', 6), (req, res) => {
    try {
        const { title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, goLiveAt, freezeUntil, status, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority } = req.body;
        if (!title || !description) {
            return res.status(400).json({ success: false, error: 'Title and description are required' });
        }
        const goLiveIso = goLiveAt && !isNaN(new Date(goLiveAt)) ? new Date(goLiveAt).toISOString() : null;
        const freezeUntilIso = freezeUntil && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : null;
        const computedStatus = resolveJobStatus({ requestedStatus: status, goLiveAt: goLiveIso, freezeUntil: freezeUntilIso });
        const jobId = createCareerJob({
            title,
            location,
            team,
            employmentType,
            seniority,
            headline,
            description,
            responsibilities,
            requirements,
            perks,
            tags: parseJobTags(tags),
            salaryMin: salaryMin ? Number(salaryMin) : null,
            salaryMax: salaryMax ? Number(salaryMax) : null,
            salaryCurrency: salaryCurrency || null,
            applyUrl: applyUrl || null,
            workplaceType: workplaceType || null,
            visibility: visibility || 'public',
            priority: priority || null,
            status: computedStatus,
            goLiveAt: goLiveIso,
            freezeUntil: freezeUntilIso,
            isFrozen: computedStatus === 'frozen'
        });
        if (req.files && req.files.length) {
            req.files.forEach(file => {
                addCareerJobAsset({
                    jobId,
                    label: file.originalname,
                    fileName: file.originalname,
                    filePath: file.url || `/uploads/${file.path || `career-assets/${file.filename}`}`,
                    fileSize: file.size,
                    mimeType: file.mimetype
                });
            });
        }
        const job = getCareerJobById(jobId);
        try { addAuditLog({ userId: req.session.userId, action: 'career_job_created', details: JSON.stringify({ jobId, title }) }); } catch (_) { }
        res.json({ success: true, job });
    } catch (error) {
        console.error('Failed to create career job', error);
        res.status(500).json({ success: false, error: 'Could not create job posting' });
    }
});

app.patch('/api/hr/career-jobs/:id', requireHR, careerAssetUpload.array('assetFiles', 6), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = getCareerJobById(id);
        if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
        const { title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, goLiveAt, freezeUntil, status, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority } = req.body;
        const goLiveIso = goLiveAt !== undefined && goLiveAt !== null && goLiveAt !== '' && !isNaN(new Date(goLiveAt)) ? new Date(goLiveAt).toISOString() : existing.go_live_at;
        const freezeUntilIso = freezeUntil !== undefined && freezeUntil !== null && freezeUntil !== '' && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : existing.freeze_until;
        const computedStatus = resolveJobStatus({ requestedStatus: status || existing.status, goLiveAt: goLiveIso, freezeUntil: freezeUntilIso });
        const updated = updateCareerJob({
            id,
            title,
            location,
            team,
            employmentType,
            seniority,
            headline,
            description,
            responsibilities,
            requirements,
            perks,
            tags: tags !== undefined ? parseJobTags(tags) : undefined,
            salaryMin: salaryMin !== undefined ? (salaryMin ? Number(salaryMin) : null) : undefined,
            salaryMax: salaryMax !== undefined ? (salaryMax ? Number(salaryMax) : null) : undefined,
            salaryCurrency: salaryCurrency !== undefined ? salaryCurrency : undefined,
            applyUrl: applyUrl !== undefined ? applyUrl : undefined,
            workplaceType: workplaceType !== undefined ? workplaceType : undefined,
            visibility: visibility !== undefined ? visibility : undefined,
            priority: priority !== undefined ? priority : undefined,
            status: computedStatus,
            goLiveAt: goLiveIso,
            freezeUntil: freezeUntilIso,
            isFrozen: computedStatus === 'frozen'
        });
        if (req.files && req.files.length) {
            req.files.forEach(file => {
                addCareerJobAsset({
                    jobId: id,
                    label: file.originalname,
                    fileName: file.originalname,
                    filePath: file.url || `/uploads/${file.path || `career-assets/${file.filename}`}`,
                    fileSize: file.size,
                    mimeType: file.mimetype
                });
            });
        }
        const job = getCareerJobById(id) || updated;
        try { addAuditLog({ userId: req.session.userId, action: 'career_job_updated', details: JSON.stringify({ jobId: id, status: computedStatus }) }); } catch (_) { }
        res.json({ success: true, job });
    } catch (error) {
        console.error('Failed to update career job', error);
        res.status(500).json({ success: false, error: 'Could not update job posting' });
    }
});

app.patch('/api/hr/career-jobs/:id/status', requireHR, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status, freezeUntil } = req.body;
        if (!['draft', 'scheduled', 'live', 'frozen', 'closed'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        const existing = getCareerJobById(id);
        if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
        const freezeUntilIso = freezeUntil && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : null;
        const job = setCareerJobStatus({ id, status, freezeUntil: freezeUntilIso });
        try { addAuditLog({ userId: req.session.userId, action: 'career_job_status', details: JSON.stringify({ id, status }) }); } catch (_) { }
        res.json({ success: true, job });
    } catch (error) {
        console.error('Failed to set job status', error);
        res.status(500).json({ success: false, error: 'Could not update job status' });
    }
});

app.delete('/api/hr/career-jobs/:jobId/assets/:assetId', requireHR, (req, res) => {
    const assetId = parseInt(req.params.assetId, 10);
    const jobId = parseInt(req.params.jobId, 10);
    try {
        const removed = removeCareerJobAsset({ assetId, jobId });
        if (!removed) return res.status(404).json({ success: false, error: 'Asset not found' });
        try { addAuditLog({ userId: req.session.userId, action: 'career_job_asset_removed', details: JSON.stringify({ jobId, assetId }) }); } catch (_) { }
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete asset', error);
        res.status(500).json({ success: false, error: 'Could not remove attachment' });
    }
});

// CSV export for career applications
app.get('/admin/export/careers.csv', requireHR, (req, res) => {
    const careers = getCareerApplicationsPaged({ limit: 10000, offset: 0 });

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
    const valid = ['new', 'under_review', 'accepted', 'rejected'];
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
    try { addAuditLog({ userId: req.session.userId, action: 'career_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

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
    const valid = ['open', 'under_review', 'approved', 'denied'];
    if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');

    // Get appeal details before updating
    const appeal = db.getContentAppealById(id);

    require('./db').updateContentAppealStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'content_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

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
    const valid = ['open', 'under_review', 'approved', 'denied'];
    if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');

    // Get appeal details before updating
    const appeal = db.getAccountAppealById(id);

    require('./db').updateAccountAppealStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'account_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

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
        } catch (e) {
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

// Auth routes (register, login, logout, OAuth, password reset, email verification) are now in routes/auth.js

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
            // Prefer explicit media fields while maintaining legacy support
            if (!p.media_url && p.image_url) p.media_url = p.image_url;
            if (!p.media_url && p.video_url) p.media_url = p.video_url;
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
        } catch (e) { }
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
        })).filter(r => r.reelCount > 0).sort((a, b) => b.reelCount - a.reelCount);
    } catch (e) { activeReels = []; }

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
                } catch (e) { }
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
                p.title,
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
            title: post.title || post.activity_label || (post.text_content ? post.text_content.substring(0, 60) + '...' : 'View post'),
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

    const authUser = res.locals.authUser;

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
            } catch (e) { }
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

    res.render('feed/feed', {
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
    const authUser = res.locals.authUser;
    let users = [];
    try {
        if (q) {
            users = searchUsers({ query: q, limit: 20, excludeUserId: req.session.userId });
        }
    } catch (e) {
        console.error('Search route error:', e);
    }

    if (!q || users.length === 0) {
        // Prevent caching to ensure fresh session data
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.status(200).render('feed/search-zero-results', {
            title: 'Search - Dream X',
            currentPage: 'search',
            authUser,
            query: q
        });
    }

    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.render('feed/search', {
        title: `Search: ${q} - Dream X`,
        currentPage: 'search',
        authUser,
        q,
        users
    });
});

// Create post
app.post('/feed/post', postUpload.fields([{ name: 'media', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { contentType, textContent, activityLabel, externalVideoUrl } = req.body;
        const title = (req.body.title || '').trim();
        const postTagsInput = req.body.postTags;
        const mediaFile = req.files && req.files['media'] ? req.files['media'][0] : null;
        const audioFile = req.files && req.files['audio'] ? req.files['audio'][0] : null;
        // Use path from storage adapter (includes folder), fallback to filename for backward compatibility
        const mediaUrl = mediaFile ? (mediaFile.url || `/uploads/${mediaFile.path || `posts/${mediaFile.filename}`}`) : null;
        const audioUrl = audioFile ? (audioFile.url || `/uploads/${audioFile.path || `posts/${audioFile.filename}`}`) : null;
        const externalVideo = (externalVideoUrl || '').trim();
        let parsedDuration = Number(req.body.mediaDuration || 0);
        const mediaSizeMb = mediaFile ? mediaFile.size / (1024 * 1024) : 0;
        const audioSizeMb = audioFile ? audioFile.size / (1024 * 1024) : 0;
        const cleanUpInvalidUploads = () => {
            deleteUploadFile(mediaFile);
            deleteUploadFile(audioFile);
        };

        if (audioFile && audioSizeMb > MEDIA_LIMITS.MAX_AUDIO_SIZE_MB) {
            cleanUpInvalidUploads();
            return res.status(400).send(`Audio too large. Max size is ${MEDIA_LIMITS.MAX_AUDIO_SIZE_MB} MB.`);
        }
        if (mediaFile) {
            const mime = (mediaFile.mimetype || '').toLowerCase();
            if (mime.startsWith('image/') && mediaSizeMb > MEDIA_LIMITS.MAX_IMAGE_SIZE_MB) {
                cleanUpInvalidUploads();
                return res.status(400).send(`Image too large. Max size is ${MEDIA_LIMITS.MAX_IMAGE_SIZE_MB} MB.`);
            }
            if (mime.startsWith('video/') && mediaSizeMb > MEDIA_LIMITS.MAX_VIDEO_SIZE_MB) {
                cleanUpInvalidUploads();
                return res.status(400).send(`Video too large. Max size is ${MEDIA_LIMITS.MAX_VIDEO_SIZE_MB} MB.`);
            }
            if (mime.startsWith('video/')) {
                try {
                    // For video duration, use buffer if available, or try to get from storage
                    let videoPath = null;
                    if (mediaFile.buffer) {
                        // Write to temp file for ffprobe
                        const tempPath = path.join(__dirname, 'temp', `temp-${Date.now()}-${mediaFile.filename}`);
                        const tempDir = path.dirname(tempPath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        fs.writeFileSync(tempPath, mediaFile.buffer);
                        videoPath = tempPath;
                    } else if (mediaFile.path) {
                        // Try to get from storage if needed
                        videoPath = path.join(__dirname, 'public', 'uploads', mediaFile.path);
                    }
                    const probedDuration = await getVideoDurationSeconds(videoPath);
                    if (Number.isFinite(probedDuration) && probedDuration > 0) parsedDuration = probedDuration;
                } catch (err) {
                    console.warn('Failed to probe video duration, using client duration if provided.', err.message);
                }
                if (parsedDuration > MEDIA_LIMITS.MAX_VIDEO_DURATION_SECONDS) {
                    cleanUpInvalidUploads();
                    return res.status(400).send(`Video too long. Max length is ${MEDIA_LIMITS.MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
                }
            }
        }
        // Server-side validation: no images in reels (allow GIF), enforce media type
        const mime = mediaFile && mediaFile.mimetype ? mediaFile.mimetype.toLowerCase() : null;
        if (contentType === 'video') {
            if (!mime || !(mime.startsWith('video/') || mime === 'image/gif')) {
                cleanUpInvalidUploads();
                return res.status(400).send('Reels require a video or GIF.');
            }
        }
        if (contentType === 'image') {
            if (!mime || !mime.startsWith('image/')) {
                cleanUpInvalidUploads();
                return res.status(400).send('Image posts require an image file.');
            }
        }
        // Treat 'video' button as Reel; images stay images; text stays text
        const isReel = contentType === 'video' ? 1 : 0;
        let imageUrl = null;
        let videoUrl = null;
        let externalVideoClean = null;

        if (mediaUrl) {
            if (contentType === 'image') imageUrl = mediaUrl; else videoUrl = mediaUrl;
        }
        if (externalVideo) {
            if (videoUrl) {
                cleanUpInvalidUploads();
                return res.status(400).send('Please choose either a local video or an external video link, not both.');
            }
            const ytMatch = externalVideo.match(/(?:v=|youtu\.be\/)([\w-]{6,})/i);
            const vimeoMatch = externalVideo.match(/vimeo\.com\/(\d+)/i);
            if (ytMatch) {
                externalVideoClean = `https://www.youtube.com/embed/${ytMatch[1]}`;
            } else if (vimeoMatch) {
                externalVideoClean = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
            } else {
                externalVideoClean = externalVideo;
            }
        }
        const hashtags = extractHashtags(textContent || '');
        const parsedTags = parseTagInput(postTagsInput);
        const postId = createPost({
            userId: req.session.userId,
            title,
            contentType: contentType || 'text',
            textContent,
            mediaUrl,
            audioUrl,
            activityLabel,
            isReel,
            imageUrl,
            videoUrl,
            externalVideoUrl: externalVideoClean
        });
        if (hashtags.length) {
            attachHashtagsToPost({ postId, hashtags });
        }
        if (parsedTags.length) {
            attachTagsToPost({ postId, tags: parsedTags });
        }
        res.redirect('/feed');
    } catch (error) {
        console.error('Failed to create post with media', error);
        res.status(500).send('Unable to create post right now. Please try again.');
    }
});

app.get('/api/hashtags/popular', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const q = (req.query.q || '').toString();
    const limit = req.query.limit || 8;
    try {
        const hashtags = getPopularHashtags({ search: q, limit }) || [];
        res.json({ success: true, hashtags });
    } catch (error) {
        console.error('Error fetching hashtag suggestions', error);
        res.status(500).json({ error: 'Failed to load hashtags' });
    }
});

app.get('/api/tags/popular', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const q = (req.query.q || '').toString();
    const limit = req.query.limit || 8;
    try {
        const tags = getPopularTags({ search: q, limit }) || [];
        res.json({ success: true, tags });
    } catch (error) {
        console.error('Error fetching tag suggestions', error);
        res.status(500).json({ error: 'Failed to load tags' });
    }
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
        try { post.user_reaction = getUserReactionForPost({ postId, userId: req.session.userId }); } catch (e) { }
        res.render('feed/post-detail', {
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
    const allowed = ['like', 'love', 'clap', 'fire', 'rocket', 'celebrate'];
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
                const baseUrl = getRequestBaseUrl(req);
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
                const baseUrl = getRequestBaseUrl(req);
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
                const baseUrl = getRequestBaseUrl(req);
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
                const baseUrl = getRequestBaseUrl(req);
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
    try {
        // Prevent caching of profile to ensure fresh content
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const row = getUserById(req.session.userId);
        if (!row) return res.redirect('/login');

        const passions = safeParseArray(row.categories);
        const goals = safeParseArray(row.goals);
        const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
        let userPosts = getUserPosts(req.session.userId).filter(p => !p.is_reel);

        // enrich posts with current user's reaction and ensure reactions map exists
        userPosts = userPosts.map(p => {
            try {
                p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                p.reactions = p.reactions || {};
            } catch (e) { }
            return p;
        });
        
        // Get user reposts
        let userReposts = [];
        try {
            userReposts = getUserReposts(req.session.userId) || [];
            userReposts = userReposts.map(p => {
                try {
                    p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                    p.reactions = p.reactions || {};
                    const repostInfo = getRepostInfo(p.id);
                    if (repostInfo) {
                        p.repost_info = repostInfo;
                    }
                } catch (e) { }
                return p;
            });
        } catch (error) {
            console.error('Error fetching user reposts:', error);
            userReposts = [];
        }

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
                accountability_style: safeParseArray(row.accountability_style),
                content_preferences: safeParseArray(row.content_preferences),
                content_format_preference: row.content_format_preference || null,
                open_to_mentoring: row.open_to_mentoring || null
            }
        };
        const projects = [];
        const services = getUserServices(req.session.userId);
        const me = getUserById(req.session.userId);
        const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');

        res.render('user/profile', {
            title: `${user.displayName} - Profile - Dream X`,
            currentPage: 'profile',
            user,
            authUser: me,
            projects,
            services,
            userPosts,
            userReposts,
            profileUserId: row.id,
            profilePicture: row.profile_picture || null,
            isOwnProfile: true,
            isFollowing: false,
            isSuperAdmin,
            isBlockedByViewer: false
        });
    } catch (error) {
        console.error('Error rendering own profile:', error);
        res.status(500).render('500', { title: 'Server Error - Dream X', currentPage: 'profile' });
    }
});
// Public profile by ID (view others) — only match numeric IDs to avoid catching '/profile/edit'
app.get('/profile/:id(\\d+)', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const uid = parseInt(req.params.id, 10);
        if (!uid || isNaN(uid)) return res.redirect('/feed');
        const row = getUserById(uid);
        if (!row) {
            return res.status(404).render('user/profile-not-found', {
                title: 'Profile Not Found - Dream X',
                currentPage: 'profile',
                userId: uid
            });
        }
        const passions = safeParseArray(row.categories);
        const goals = safeParseArray(row.goals);
        const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
        let userPosts = getUserPosts(uid).filter(p => !p.is_reel);
        userPosts = userPosts.map(p => {
            try {
                p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                p.reactions = p.reactions || {};
            } catch (e) { }
            return p;
        });
        
        // Get user reposts
        let userReposts = [];
        try {
            userReposts = getUserReposts(uid) || [];
            userReposts = userReposts.map(p => {
                try {
                    p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                    p.reactions = p.reactions || {};
                    const repostInfo = getRepostInfo(p.id);
                    if (repostInfo) {
                        p.repost_info = repostInfo;
                    }
                } catch (e) { }
                return p;
            });
        } catch (error) {
            console.error('Error fetching user reposts:', error);
            userReposts = [];
        }

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
                accountability_style: safeParseArray(row.accountability_style),
                content_preferences: safeParseArray(row.content_preferences),
                content_format_preference: row.content_format_preference || null,
                open_to_mentoring: row.open_to_mentoring || null
            }
        };
        const projects = [];
        const services = getUserServices(uid);
        const me = getUserById(req.session.userId);
        const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');

        res.render('user/profile', {
            title: `${user.displayName} - Profile - Dream X`,
            currentPage: 'profile',
            user,
            authUser: me,
            projects,
            services,
            userPosts,
            userReposts,
            profileUserId: uid,
            profilePicture: row.profile_picture || null,
            isOwnProfile: viewingOwnProfile,
            isFollowing: isFollowingUser,
            isSuperAdmin,
            isBlockedByViewer
        });
    } catch (error) {
        console.error('Error rendering user profile:', error);
        res.status(500).render('500', { title: 'Server Error - Dream X', currentPage: 'profile' });
    }
});

// Edit Profile form (placeholder values pulled from same user object shape)
app.get('/profile/edit', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const authUser = { id: row.id, full_name: row.full_name, email: row.email, profile_picture: row.profile_picture, banner_image: row.banner_image, handle: row.handle };
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const defaultPassions = ['Coding', 'Design', 'Music', 'Fitness', 'Writing', 'Academics', 'Entrepreneurship', 'Art', 'Photography', 'Public Speaking', 'Languages'];

    // Promote popular custom interests into the regular list
    let popularCommunityInterests = [];
    try {
        const passionCounts = {};
        const passionsQuery = db.prepare(`
            SELECT categories FROM users WHERE categories IS NOT NULL AND categories != ''
        `);
        const usersWithCategories = passionsQuery.all();

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
            } catch (e) { }
        });

        popularCommunityInterests = Object.entries(passionCounts)
            .filter(([passion, count]) => !defaultPassions.includes(passion) && count >= 5)
            .sort((a, b) => b[1] - a[1])
            .map(([passion]) => passion)
            .slice(0, 10);
    } catch (err) {
        console.error('Failed to compute popular custom interests:', err.message);
        popularCommunityInterests = [];
    }

    const allPassions = Array.from(new Set([...defaultPassions, ...popularCommunityInterests]));
    const customPassions = passions.filter(p => !allPassions.includes(p));

    const passionGroups = [
        {
            label: 'Technology & Building',
            options: ['Coding', 'Entrepreneurship', 'Writing']
        },
        {
            label: 'Creativity & Media',
            options: ['Design', 'Art', 'Photography', 'Public Speaking', 'Languages']
        },
        {
            label: 'Performance & Wellbeing',
            options: ['Music', 'Fitness', 'Academics']
        }
    ].map(group => ({
        ...group,
        options: group.options.filter(option => allPassions.includes(option))
    }));

    if (popularCommunityInterests.length) {
        passionGroups.push({
            label: 'Community Favorites',
            options: popularCommunityInterests
        });
    }

    // Ensure no empty groups are rendered
    const filteredPassionGroups = passionGroups.filter(group => group.options.length > 0);
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || '',
        passions,
        skills: row.skills || '',
        location: row.location || ''
    };
    res.render('user/edit-profile', {
        title: 'Edit Profile - Dream X',
        currentPage: 'profile',
        authUser,
        user,
        allPassions,
        customPassions,
        passionGroups: filteredPassionGroups
    });
});

// Handle edit profile submission with banner support
app.post('/profile/edit', upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]), (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { displayName, bio, passions, skills, location, customInterests } = req.body;
    const selectedPassions = Array.isArray(passions) ? passions : (passions ? [passions] : []);
    const customInterestList = (customInterests || '')
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    const uniquePassions = Array.from(new Set([...selectedPassions, ...customInterestList]));

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
        categories: uniquePassions,
        goals: [],
        experience: null
    });

    // Update profile picture if uploaded
    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
        const profileFile = req.files.profilePicture[0];
        updateProfilePicture({
            userId: req.session.userId,
            filename: profileFile.path || `profiles/${profileFile.filename}`
        });
    }

    // Update banner image if uploaded
    if (req.files && req.files.bannerImage && req.files.bannerImage[0]) {
        const bannerFile = req.files.bannerImage[0];
        updateBannerImage({
            userId: req.session.userId,
            filename: bannerFile.path || `profiles/${bannerFile.filename}`
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

    res.render('services/services', {
        title: 'Services Marketplace - Dream X',
        currentPage: 'services',
        authUser: res.locals.authUser,
        categories,
        services
    });
});

// Create service page
app.get('/services/new', ensureAuthenticated, (req, res) => {
    res.render('services/create-service', {
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
        const authUser = res.locals.authUser;
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

    res.render('services/service-details', {
        title: `${service.name} - Service - Dream X`,
        currentPage: 'services',
        authUser: res.locals.authUser,
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
    res.render('services/edit-service', { title: `Edit Service - ${service.title}`, currentPage: 'services', service });
});

app.post('/services/:id/edit', ensureAuthenticated, (req, res) => {
    const { id } = req.params;
    const service = getService(id);
    if (!service) return res.redirect('/services');
    const me = getUserById(req.session.userId);
    const isOwner = Number(service.user_id) === Number(req.session.userId);
    const canAdminEdit = isSuperAdmin(me) || isGlobalAdmin(me);
    const allowed = ['title', 'description', 'category', 'pricePerHour', 'durationMinutes', 'experienceLevel', 'format', 'availability', 'location', 'tags'];
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
                const baseUrl = getRequestBaseUrl(req);
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

    res.render('user/messages', {
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
        // Use path from storage adapter (includes folder), fallback to filename for backward compatibility
        const attachmentUrl = f.url || `/uploads/${f.path || `chat/${f.filename}`}`;
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

// Protected file download - uses unified storage service
const storageService = require('./services/storage');

app.get('/uploads/:folder?/:filename', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    
    const folder = req.params.folder || '';
    const filename = req.params.filename;
    
    // Construct file path
    let filePath = filename;
    if (folder) {
        filePath = `${folder}/${filename}`;
    }
    
    // Check if file is a chat attachment
    if (filename && filename.startsWith('chat-')) {
        const msg = db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url LIKE ?`).get(`%/uploads/${filePath}%`);
        if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
            return res.status(403).send('Forbidden');
        }
    }
    
    try {
        // Get file from storage (Azure Blob or filesystem)
        const fileResult = await storageService.getFile(filePath);
        
        if (!fileResult.success) {
            return res.status(404).send('File not found');
        }
        
        // Set content type and send file
        res.setHeader('Content-Type', fileResult.contentType || 'application/octet-stream');
        res.send(fileResult.data);
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).send('Error serving file');
    }
});

// Legacy route for files without folder prefix (backward compatibility)
app.get('/uploads/:filename', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    
    const filename = req.params.filename;
    
    // Try to find file in common folders
    const folders = ['profiles', 'posts', 'chat', 'careers', 'career-assets', 'services', 'refunds'];
    
    for (const folder of folders) {
        const filePath = `${folder}/${filename}`;
        const fileResult = await storageService.getFile(filePath);
        
        if (fileResult.success) {
            // Check if file is a chat attachment
            if (filename.startsWith('chat-')) {
                const msg = db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url LIKE ?`).get(`%/uploads/${filePath}%`);
                if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
                    return res.status(403).send('Forbidden');
                }
            }
            
            res.setHeader('Content-Type', fileResult.contentType || 'application/octet-stream');
            return res.send(fileResult.data);
        }
    }
    
    res.status(404).send('File not found');
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

    res.render('static/map', {
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
    } catch (e) { }

    // Check if user has linked SSO accounts
    const linkedAccounts = getLinkedAccountsForUser(req.session.userId) || [];
    const hasLinkedAccounts = linkedAccounts.length > 0;
    const hasPassword = !!(row.password_hash);
    // User is SSO-only if they have linked accounts but no password hash
    // (SSO users get dummy password hashes, but if password_hash is null/empty, they're truly SSO-only)
    const isSSOOnly = hasLinkedAccounts && !hasPassword;

    // Get subscription and billing data
    const subscription = getUserSubscription(req.session.userId) || { tier: 'free', status: 'active' };
    const paymentMethods = getPaymentMethods(req.session.userId) || [];
    const invoices = getInvoices(req.session.userId) || [];

    // Get billing charges
    const { getUserCharges } = require('./db');
    const charges = getUserCharges({ userId: req.session.userId, limit: 50, offset: 0 }) || [];
    const blockedUsers = getBlockedUsers(req.session.userId) || [];

    res.render('user/settings', {
        title: 'Settings - Dream X',
        currentPage: 'settings',
        authUser,
        linked,
        hasPassword,
        isSSOOnly,
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

    res.render('user/billing', {
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

    try {
        const result = await handlePasswordChange({
            userId: req.session.userId,
            currentPassword,
            newPassword,
            confirmPassword
        });

        if (!result.ok) {
            return res.redirect(`/settings?error=${encodeURIComponent(result.message)}`);
        }

        res.redirect('/settings?success=Password changed successfully');
    } catch (e) {
        console.error('Password change error', e);
        res.redirect('/settings?error=Failed to change password');
    }
});

// API: Change password (JSON)
app.post('/api/settings/password', ensureAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    try {
        const result = await handlePasswordChange({
            userId: req.session.userId,
            currentPassword,
            newPassword,
            confirmPassword
        });

        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (e) {
        console.error('API password change error', e);
        res.status(500).json({ success: false, message: 'Failed to change password' });
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

    const validVis = ['public', 'members', 'private'];
    const validDM = ['everyone', 'no_one'];
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
    if (!['google', 'microsoft', 'apple'].includes(provider)) {
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
        return res.redirect(`/settings?success=${provider.charAt(0).toUpperCase() + provider.slice(1)}+disconnected`);
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
        } catch (e) { }

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
        } catch (e) { }

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
        } catch (e) { }

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
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
            if (sub && sub.tier) userTier = sub.tier.replace(/_/g, '-'); else userTier = 'free';
        } catch (e) {
            userTier = 'free';
        }
    }

    res.render('static/pricing', {
        title: 'Pricing - Dream X',
        currentPage: 'pricing',
        tiers,
        userTier
    });
});

// Help Center (FAQ / Support)
app.get('/help-center', (req, res) => {
    // Prevent caching to ensure fresh session data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
    res.render('static/help-center', {
        title: 'Help Center - Dream X',
        currentPage: 'help-center',
        faqs
    });
});

// About, Team, Features, Contact, and Careers pages are now in routes/misc.js

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.render('static/privacy', {
        title: 'Privacy Policy - Dream X',
        currentPage: 'privacy'
    });
});

// Terms of Service page
app.get('/terms', (req, res) => {
    res.render('static/terms', {
        title: 'Terms of Service - Dream X',
        currentPage: 'terms',
        authUser: req.session.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) : null
    });
});

// Community Guidelines page
app.get('/community-guidelines', (req, res) => {
    res.render('static/community-guidelines', {
        title: 'Community Guidelines - Dream X',
        currentPage: 'community-guidelines',
        authUser: req.session.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) : null
    });
});

// Content Appeal page
app.get('/content-appeal', (req, res) => {
    res.render('appeals/content-appeal', {
        title: 'Content Appeal - Dream X',
        currentPage: 'content-appeal'
    });
});

// Account Appeal page
app.get('/account-appeal', (req, res) => {
    res.render('appeals/account-appeal', {
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

        res.render('user/refund-request', {
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
            screenshotPath = req.file.path || `refunds/${req.file.filename}`;
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
    res.render('user/onboarding', {
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
        profilePicturePath = req.files.profilePicture[0].path || `profiles/${req.files.profilePicture[0].filename}`;
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
            : res.status(500).render('user/onboarding', { title: 'Start with your passions', currentPage: 'onboarding', error: 'Unable to save onboarding data' });
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
        const resumeFileObj = req.files && req.files.resumeFile && req.files.resumeFile[0];
        const portfolioFileObj = req.files && req.files.portfolioFile && req.files.portfolioFile[0];
        const resumeFile = resumeFileObj ? (resumeFileObj.url || `/uploads/${resumeFileObj.path || `careers/${resumeFileObj.filename}`}`) : null;
        const portfolioFile = portfolioFileObj ? (portfolioFileObj.url || `/uploads/${portfolioFileObj.path || `careers/${portfolioFileObj.filename}`}`) : null;
        const id = require('./db').createCareerApplication({ position, name, email, phone, coverLetter, resumeFile, portfolioFile });
        try { addAuditLog({ userId: req.session.userId || null, action: 'career_application_submitted', details: JSON.stringify({ id, email, position }) }); } catch (e) { }

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

        res.render('admin/admin-user-actions', {
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
        const dbPath = path.join(__dirname, 'data', 'sessions.sqlite3');
        const sessDb = new Database(dbPath);
        try {
            sessDb.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${userId}%`);
        } catch (e) {
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

                switch (unit) {
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
        const dbPath = path.join(__dirname, 'data', 'sessions.sqlite3');
        const sessDb = new Database(dbPath);
        try {
            sessDb.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${userId}%`);
        } catch (e) {
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

    res.render('user/account-status', {
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
        try { addAuditLog({ userId: req.session.userId || null, action: 'content_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch (e) { }
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
        try { addAuditLog({ userId: req.session.userId || null, action: 'account_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch (e) { }
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
const { buffer } = require('stream/consumers');

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
app.use((req, res) => {
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
        // Initialize database connection (required for SQL Server in production)
        if (process.env.NODE_ENV === 'Production' || process.env.DB_TYPE === 'sqlserver') {
            await initializeDatabase();
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


// Import required modules
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const AppleStrategy = require('passport-apple');
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

// Import email service
const emailService = require('./emailService');

const { 
    db, getUserById, getUserByEmail, getUserByHandle, getUserByProvider, createUser, updateUserProvider, updateOnboarding, updateUserProfile,
    updateProfilePicture, updateBannerImage, updatePassword, updateUserHandle, updateNotificationSettings, getLinkedAccountsForUser, unlinkProvider,
    getOrCreateConversation, getUserConversations, getConversationMessages,
    createMessage, markMessagesAsRead, getUnreadMessageCount,
    updateUserRole, getAllUsers, getStats,
    // New admin helpers
    getUsersPaged, getUsersCount,
    // Audit logs
    addAuditLog, getAuditLogsPaged, getAuditLogCount,
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
    createService, getUserServices, getAllServices, getServiceCount, updateService, deleteService
 } = require('./db');
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    // Node 18+ has global fetch; fallback
    fetch = global.fetch;
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
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
    cb(null, path.join(__dirname, 'public', 'uploads'));
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

// Posts/media uploads (supports images for image posts, videos/GIFs for reels)
const postStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads'));
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
        if (m.startsWith('image/') || m.startsWith('video/')) return cb(null, true);
        cb(new Error('Unsupported media type for post'));
    }
});

// Career application uploads (resume/portfolio)
const careerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads'));
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

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));
app.use(passport.initialize());
// If you want Passport-managed sessions, also enable the next line and add serialize/deserialize below
// app.use(passport.session());

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
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const ext = (photoUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ext.length <= 5 ? ext : 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        updateProfilePicture({ userId: user.id, filename });
    } catch (e) {
        console.warn('Profile photo import failed:', e.message);
    }
}

async function importBinaryPhotoIfNeeded(user, buffer, extHint) {
    try {
        if (!buffer || !user || user.profile_picture) return;
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const safeExt = (extHint && extHint.length <= 5 ? extHint : 'jpg') || 'jpg';
        const filename = `profile-oauth-${user.id}-${Date.now()}.${safeExt}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        updateProfilePicture({ userId: user.id, filename });
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
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
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
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
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
        callbackURL: process.env.APPLE_CALLBACK_URL || '/auth/apple/callback',
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
            console.log(`Seeded super admin: ${adminEmail} / ${adminPass}`);
        }
    } catch (e) {
        console.warn('Admin seed failed:', e.message);
    }
})();

// Attach auth context to templates
app.use((req, res, next) => {
    let user = null;
    let unreadCount = 0;
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

// RBAC helpers
const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isHR = (user) => user && user.role === 'hr';
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';
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
function rpIDFromReq(req){
    try {
        const host = (req.headers.host || '').split(':')[0];
        return host || 'localhost';
    } catch { return 'localhost'; }
}

// Begin Registration (user must be logged in or provide email via body)
app.get('/webauthn/registration/options', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required to create a passkey' });
    const user = getUserById(req.session.userId);
    const rpID = rpIDFromReq(req);
    const existingCreds = getCredentialsForUser(user.id);
    
    // Convert user ID to Uint8Array as required by @simplewebauthn/server v9+
    const userIDBuffer = Buffer.from(String(user.id), 'utf-8');
    
    const options = generateRegistrationOptions({
        rpName: 'Dream X',
        rpID,
        userID: userIDBuffer,
        userName: user.email,
        userDisplayName: user.full_name,
        attestationType: 'none',
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            requireResidentKey: false,
        },
        excludeCredentials: existingCreds.map(c => ({
            id: Buffer.from(c.credential_id, 'base64url'),
            type: 'public-key',
        })),
    });
    req.session.webauthnChallenge = options.challenge;
    req.session.webauthnUserId = user.id;
    res.json(options);
});

app.post('/webauthn/registration/verify', async (req, res) => {
    if (!req.session.userId || !req.session.webauthnChallenge) return res.status(400).json({ error: 'No registration in progress' });
    const expectedChallenge = req.session.webauthnChallenge;
    const rpID = rpIDFromReq(req);
    try {
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: [
                `https://${rpID}`,
                `http://${rpID}`,
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ],
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
            });
            req.session.webauthnChallenge = null;
            return res.json({ verified: true });
        }
        return res.status(400).json({ verified: false });
    } catch (e) {
        console.error('WebAuthn registration verify error', e);
        return res.status(400).json({ error: 'Verification failed' });
    }
});

// Begin Authentication (username-less)
app.get('/webauthn/authentication/options', (req, res) => {
    const rpID = rpIDFromReq(req);
    const options = generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
    });
    req.session.webauthnChallenge = options.challenge;
    res.json(options);
});

app.post('/webauthn/authentication/verify', async (req, res) => {
    const expectedChallenge = req.session.webauthnChallenge;
    const rpID = rpIDFromReq(req);
    if (!expectedChallenge) return res.status(400).json({ error: 'No auth in progress' });
    try {
        const body = req.body;
        const credIdB64 = body.id;
        const stored = getCredentialById(credIdB64);
        const authenticator = stored ? {
            credentialID: Buffer.from(stored.credential_id, 'base64url'),
            credentialPublicKey: Buffer.from(stored.public_key, 'base64url'),
            counter: stored.counter || 0,
        } : null;
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: [
                `https://${rpID}`,
                `http://${rpID}`,
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ],
            expectedRPID: rpID,
            authenticator,
        });
        const { verified, authenticationInfo } = verification;
        if (verified && stored) {
            updateCredentialCounter({ credentialId: stored.credential_id, counter: authenticationInfo.newCounter || stored.counter });
            // Log user in
            req.session.userId = stored.user_id;
            return res.json({ verified: true });
        }
        return res.status(400).json({ verified: false });
    } catch (e) {
        console.error('WebAuthn authentication verify error', e);
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
    if (req.user && req.user.id) req.session.userId = req.user.id;
    res.redirect('/feed');
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
    if (req.user && req.user.id) req.session.userId = req.user.id;
    res.redirect('/feed');
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
    if (req.user && req.user.id) req.session.userId = req.user.id;
    res.redirect('/feed');
});

// Home page
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Home - Dream X',
        currentPage: 'home'
    });
});

// Admin dashboard with pagination, audit logs, and queues
app.get('/admin', requireAdmin, (req, res) => {
    const stats = getStats();
    // Users tab pagination
    const pageSize = 20;
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const q = (req.query.q || '').trim();
    const total = getUsersCount({ search: q || null });
    const offset = (page - 1) * pageSize;
    const users = getUsersPaged({ limit: pageSize, offset, search: q || null });

    // Super admins can see recent audit logs
    const me = req.session.userId ? getUserById(req.session.userId) : null;
    const logs = (me && me.role === 'super_admin') ? getAuditLogsPaged({ limit: 50, offset: 0 }) : [];

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
        cPage, caPage, aaPage,
        cHasMore, caHasMore, aaHasMore,
        cStatus, caStatus, aaStatus,
        error: req.query.error,
        success: req.query.success
    });
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
app.post('/admin/careers/:id/status', requireAdminOrHR, (req, res) => {
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
    
    require('./db').updateCareerApplicationStatus({ id, status, reviewerId: req.session.userId });
    try { addAuditLog({ userId: req.session.userId, action: 'career_status_update', details: JSON.stringify({ id, status }) }); } catch(e){}
    
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
            await emailService.sendContentApprovalEmail(appeal.email, appeal);
        } else {
            await emailService.sendContentDenialEmail(appeal.email, appeal);
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
            await emailService.sendAccountApprovalEmail(appeal.email, appeal);
        } else {
            await emailService.sendAccountDenialEmail(appeal.email, appeal);
        }
    }
    
    res.redirect('/admin?success=Account+appeal+updated');
});

// Registration page
app.get('/register', (req, res) => {
    if (req.session.userId) return res.redirect('/onboarding');
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
        req.session.userId = userId;
        return res.redirect('/onboarding');
    } catch (e) {
        console.error('Registration error', e);
        return res.status(500).render('register', { title: 'Register - Dream X', currentPage: 'register', error: 'Server error. Try again.' });
    }
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/feed');
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
    
    req.session.userId = user.id;
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin') {
        return res.redirect('/admin');
    }
    if (user.role === 'hr') {
        return res.redirect('/hr');
    }
    res.redirect('/feed');
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Feed page (main social feed)
app.get('/feed', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const posts = getFeedPosts({ limit: 50, offset: 0 }).map(p => {
        try {
            p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
            // Ensure reactions object exists even if empty
            p.reactions = p.reactions || {};
        } catch(e) {}
        return p;
    });
    
    // Get real suggested users with fallback to dummy data
    let suggestions = [];
    try {
        const suggestedUsers = getSuggestedUsers({ currentUserId: req.session.userId, limit: 4 });
        suggestions = suggestedUsers.map(u => {
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
        });
        
        // Fallback to dummy data if no suggestions found
        if (suggestions.length === 0) {
            suggestions = [
                { user: 'Nora Fields', passion: 'Writing' },
                { user: 'Ethan Brooks', passion: 'Entrepreneurship' },
                { user: 'Clara Dawson', passion: 'Photography' },
                { user: 'Jun Park', passion: 'Design' }
            ];
        }
    } catch (error) {
        console.error('Error fetching suggested users:', error);
        // Fallback to dummy data on error
        suggestions = [
            { user: 'Nora Fields', passion: 'Writing' },
            { user: 'Ethan Brooks', passion: 'Entrepreneurship' },
            { user: 'Clara Dawson', passion: 'Photography' },
            { user: 'Jun Park', passion: 'Design' }
        ];
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
    
    // Get recent activity from database with fallback to dummy data
    let recentActivity;
    try {
        recentActivity = getRecentActivity(5);
        // If no real activity, use dummy data
        if (!recentActivity || recentActivity.length === 0) {
            recentActivity = [
                { desc: 'Nora Fields published a new post', time: '2m ago' },
                { desc: 'Ethan Brooks commented on a post', time: '10m ago' },
                { desc: 'Jun Park updated their profile', time: '1h ago' }
            ];
        }
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        // Fallback to dummy data on error
        recentActivity = [
            { desc: 'Nora Fields published a new post', time: '2m ago' },
            { desc: 'Ethan Brooks commented on a post', time: '10m ago' },
            { desc: 'Jun Park updated their profile', time: '1h ago' }
        ];
    }
    
    const topPassions = ['Writing', 'Entrepreneurship', 'Photography', 'Design', 'Coding'];
    const authUser = getUserById(req.session.userId);
    res.render('feed', {
        title: 'Your Feed - Dream X',
        currentPage: 'feed',
        authUser,
        posts,
        suggestions,
        trendingPosts,
        recentActivity,
        topPassions
    });
});

// Create post
app.post('/feed/post', postUpload.single('media'), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { contentType, textContent, activityLabel } = req.body;
    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    // Server-side validation: no images in reels (allow GIF), enforce media type
    const mime = (req.file && req.file.mimetype ? req.file.mimetype.toLowerCase() : null);
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
        activityLabel,
        isReel
    });
    res.redirect('/feed');
});

// API: get reels for a user, filtering 24h expiry based on client timezone offset
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
            WHERE p.user_id = ? AND p.is_reel = 1
            ORDER BY p.created_at DESC
        `).all(uid);
        // Apply 24h expiry based on user's local time (client-provided offset)
        const now = new Date();
        const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
        const active = rows.filter(r => {
            const createdUTC = new Date(r.created_at).getTime();
            const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
            return (nowLocalMs - createdLocal) < (24 * 60 * 60 * 1000);
        });
        res.json({ reels: active });
    } catch (e) {
        console.error('list reels error', e);
        res.status(500).json({ error: 'Failed to load reels' });
    }
});

// API: count reels (active within 24h) for avatar dot and click behavior
app.get('/api/users/:id/reels/count', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const uid = parseInt(req.params.id, 10);
    if (!uid) return res.status(400).json({ error: 'Invalid user id' });
    const tzOffsetMin = parseInt(req.query.tzOffset || '0', 10);
    try {
        const rows = db.prepare(`SELECT created_at FROM posts WHERE user_id = ? AND is_reel = 1 ORDER BY created_at DESC`).all(uid);
        const now = new Date();
        const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
        const count = rows.filter(r => {
            const createdUTC = new Date(r.created_at).getTime();
            const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
            return (nowLocalMs - createdLocal) < (24 * 60 * 60 * 1000);
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
                await emailService.sendPostReactionEmail(author, reactor, type, postId, baseUrl);
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
                await emailService.sendPostCommentEmail(author, commenter, content, postId, baseUrl);
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
                await emailService.sendCommentReplyEmail(parentAuthor, commenter, content, postId, baseUrl);
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
                await emailService.sendCommentLikeEmail(author, liker, comment.post_id, baseUrl);
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
        bannerImage: row.banner_image
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
    if (!row) return res.redirect('/feed');
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
        bannerImage: row.banner_image
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
        isOwnProfile: false,
        isFollowing: isFollowingUser,
        isSuperAdmin
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
            filename: req.files.profilePicture[0].filename
        });
    }
    
    // Update banner image if uploaded
    if (req.files && req.files.bannerImage && req.files.bannerImage[0]) {
        updateBannerImage({
            userId: req.session.userId,
            filename: req.files.bannerImage[0].filename
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
    const categories = ['Tutoring','Mentorship','Coaching','Workshops','Consulting','Other'];
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
        services,
        authUser: req.user
    });
});

// Create service page
app.get('/services/new', ensureAuthenticated, (req, res) => {
    res.render('create-service', {
        title: 'Create Service - Dream X',
        currentPage: 'services'
    });
});

// Service details page (single service placeholder)
app.get('/services/:id', (req, res) => {
    const { id } = req.params;
    const service = db.getService(id);
    
    if (!service) {
        return res.status(404).render('404', { title: 'Service Not Found' });
    }
    
    // Calculate session price
    service.pricePerSession = (service.price_per_hour * (service.duration_minutes / 60)).toFixed(2);
    service.name = service.title;
    service.provider = {
        name: service.full_name,
        passion: service.category
    };
    service.rating = 4.8;
    service.reviewsCount = 0;
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
    
    const reviews = [
        { user: 'Leo Martinez', rating: 5, comment: 'Actionable feedback and clear improvement steps. Immediately leveled up my project structure.' },
        { user: 'Sofia Patel', rating: 5, comment: 'Great mentorship energy—supportive and direct. Loved the follow‑up notes.' },
        { user: 'Marcus Lee', rating: 4, comment: 'Helpful session. Would have liked a bit more time on testing strategy, but overall excellent.' }
    ];
    res.render('service-details', {
        title: `${service.name} - Service - Dream X`,
        currentPage: 'services',
        service,
        reviews
    });
});

// Messages page - Real messaging with database
app.get('/messages', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    
    const conversations = getUserConversations(req.session.userId);
    let currentConversation = null;
    let messages = [];
    let participants = [];

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
        const results = require('./db').searchUsers({ query: q, limit: 10, excludeUserId: req.session.userId });
        res.json({ results });
    } catch (e) {
        console.error('User search error:', e);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Send message API (supports optional single or multiple file attachments)
app.post('/api/messages/send', chatUpload.any(), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversationId = parseInt(req.body.conversationId, 10);
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
            attachmentMime: null
        });
        createdMessageIds.push(messageId);
        const payload = {
            id: messageId,
            conversation_id: conversationId,
            sender_id: req.session.userId,
            content,
            attachment_url: null,
            attachment_mime: null,
            created_at: new Date().toISOString()
        };
        createdPayloads.push(payload);
        io.to(`conversation-${conversationId}`).emit('new-message', payload);
    }

    // Create one message per attachment
    for (const f of files) {
        const attachmentUrl = `/uploads/${f.filename}`;
        const attachmentMime = f.mimetype;
        const messageId = createMessage({
            conversationId,
            senderId: req.session.userId,
            content: '',
            attachmentUrl,
            attachmentMime
        });
        createdMessageIds.push(messageId);
        const payload = {
            id: messageId,
            conversation_id: conversationId,
            sender_id: req.session.userId,
            content: '',
            attachment_url: attachmentUrl,
            attachment_mime: attachmentMime,
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

    res.json({ success: true, messageIds: createdMessageIds });
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
        messageId,
        userId: req.session.userId,
        status: result.status,
        counts: result.counts
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

// Settings page with full functionality
app.get('/settings', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const user = { 
        email: row.email, 
        fullName: row.full_name,
        handle: row.handle || '',
        emailNotifications: row.email_notifications === 1,
        pushNotifications: row.push_notifications === 1,
        messageNotifications: row.message_notifications === 1
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
    
    res.render('settings', {
        title: 'Settings - Dream X',
        currentPage: 'settings',
        user,
        linked,
        getUserById,
        subscription,
        paymentMethods,
        invoices,
        success: req.query.success,
        error: req.query.error
    });
});

// Billing page
app.get('/billing', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    
    // Default to 'pro_seller' for demo purposes, or use user's actual tier from database
    const userTier = row.subscription_tier || 'pro_seller';
    
    res.render('billing', {
        title: 'Billing - Dream X',
        currentPage: 'billing',
        userTier,
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

// API: Create service with subscription check
app.post('/api/services/create', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags } = req.body;
        
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
    res.render('pricing', {
        title: 'Pricing - Dream X',
        currentPage: 'pricing',
        tiers
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
        currentPage: 'terms'
    });
});

// Community Guidelines page
app.get('/community-guidelines', (req, res) => {
    res.render('community-guidelines', { 
        title: 'Community Guidelines - Dream X',
        currentPage: 'community-guidelines'
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

// Login page
// (Original login route replaced by new auth-aware version above)

// Onboarding page (collect user passions/interests for Reverse Algorithm)
app.get('/onboarding', (req, res) => {
    if (!req.session.userId) return res.redirect('/register');
    res.render('onboarding', {
        title: 'Start with your passions',
        currentPage: 'onboarding'
    });
});

// Handle onboarding form submission
app.post('/onboarding', (req, res) => {
    if (!req.session.userId) return res.redirect('/register');
    const { categories, goals, experience } = req.body;
    const selectedCategories = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const selectedGoals = Array.isArray(goals) ? goals : (goals ? [goals] : []);
    const experienceLevel = experience || null;
    updateOnboarding({ userId: req.session.userId, categories: selectedCategories, goals: selectedGoals, experience: experienceLevel });
    console.log('📝 Onboarding saved for user', req.session.userId);
    res.redirect('/profile');
});

// === NOTIFICATION API ROUTES ===
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
app.post('/api/careers/apply', careerUpload.fields([{ name: 'resumeFile', maxCount: 1 }, { name: 'portfolioFile', maxCount: 1 }]), (req, res) => {
    try {
        const { position, name, email, phone, coverLetter } = req.body;
        if (!position || !name || !email || !coverLetter) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const resumeFile = (req.files && req.files.resumeFile && req.files.resumeFile[0]) ? `/uploads/${req.files.resumeFile[0].filename}` : null;
        const portfolioFile = (req.files && req.files.portfolioFile && req.files.portfolioFile[0]) ? `/uploads/${req.files.portfolioFile[0].filename}` : null;
        const id = require('./db').createCareerApplication({ position, name, email, phone, coverLetter, resumeFile, portfolioFile });
        try { addAuditLog({ userId: req.session.userId || null, action: 'career_application_submitted', details: JSON.stringify({ id, email, position }) }); } catch(e) {}
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

// === ADMIN MODERATION ROUTES ===
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
            await emailService.sendAccountBannedEmail(targetUser, banReason);
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
            await emailService.sendAccountSuspendedEmail(targetUser, suspendReason, until, durationText);
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

// 404 handler - must be last route
app.use((req, res) => {
    res.status(404).send('<h1>404 - Page Not Found</h1>');
});

// Socket.IO for real-time messaging and notifications
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

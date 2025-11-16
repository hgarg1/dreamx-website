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
    createInvoice, getInvoices
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

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration (MemoryStore fine for local dev)
app.use(session({
    secret: 'dev-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
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
const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin');
const isSuperAdmin = (user) => user && user.role === 'super_admin';
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
    const options = generateRegistrationOptions({
        rpName: 'Dream X',
        rpID,
        userID: String(user.id),
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

// Admin dashboard with pagination and audit logs
app.get('/admin', requireAdmin, (req, res) => {
    const stats = getStats();
    const pageSize = 20;
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const q = (req.query.q || '').trim();
    const total = getUsersCount({ search: q || null });
    const offset = (page - 1) * pageSize;
    const users = getUsersPaged({ limit: pageSize, offset, search: q || null });

    // Super admins can see recent audit logs
    const me = req.session.userId ? getUserById(req.session.userId) : null;
    const logs = (me && me.role === 'super_admin') ? getAuditLogsPaged({ limit: 50, offset: 0 }) : [];

    res.render('admin', {
        title: 'Admin Dashboard - Dream X',
        currentPage: 'admin',
        stats,
        users,
        page,
        pageSize,
        total,
        q,
        logs,
        error: req.query.error,
        success: req.query.success
    });
});

// Update user role (super admin only)
app.post('/admin/users/:id/role', requireSuperAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const role = (req.body.role || 'user').toLowerCase();
    if (!['user','admin','super_admin'].includes(role)) {
        return res.redirect('/admin?error=Invalid+role');
    }
    // Prevent demoting self from super_admin accidentally
    const me = getUserById(req.session.userId);
    if (me && me.id === id && me.role === 'super_admin' && role !== 'super_admin') {
        return res.redirect('/admin?error=Cannot+demote+yourself');
    }
    // Ensure at least one super_admin remains
    const all = getAllUsers();
    const superAdmins = all.filter(u => u.role === 'super_admin');
    if (superAdmins.length === 1 && superAdmins[0].id === id && role !== 'super_admin') {
        return res.redirect('/admin?error=At+least+one+super+admin+required');
    }
    updateUserRole({ userId: id, role });
    try {
        addAuditLog({ userId: me ? me.id : null, action: 'role_change', details: JSON.stringify({ targetUserId: id, newRole: role }) });
    } catch (e) {}
    res.redirect('/admin?success=Role+updated');
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
    if (!user) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        return res.status(400).render('login', { title: 'Login - Dream X', currentPage: 'login', error: 'Invalid credentials.' });
    }
    req.session.userId = user.id;
    if (user.role === 'admin' || user.role === 'super_admin') {
        return res.redirect('/admin');
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
    const posts = getFeedPosts({ limit: 50, offset: 0 });
    const suggestions = [
        { user: 'Nora Fields', passion: 'Writing' },
        { user: 'Ethan Brooks', passion: 'Entrepreneurship' },
        { user: 'Clara Dawson', passion: 'Photography' },
        { user: 'Jun Park', passion: 'Design' }
    ];
    res.render('feed', {
        title: 'Your Feed - Dream X',
        currentPage: 'feed',
        posts,
        suggestions
    });
});

// Create post
app.post('/feed/post', upload.single('media'), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { contentType, textContent, activityLabel } = req.body;
    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    createPost({
        userId: req.session.userId,
        contentType: contentType || 'text',
        textContent,
        mediaUrl,
        activityLabel
    });
    res.redirect('/feed');
});

// Profile page (current user)
app.get('/profile', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const goals = row.goals ? JSON.parse(row.goals) : [];
    const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
    const userPosts = getUserPosts(req.session.userId);
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
        passions,
        skills: skillsList,
        stats: { posts: userPosts.length, followers: 0, following: 0, sessions: 0 },
        isSeller: false,
        bannerImage: row.banner_image
    };
    const projects = [];
    const services = [];
    res.render('profile', {
        title: `${user.displayName} - Profile - Dream X`,
        currentPage: 'profile',
        user,
        projects,
        services
    });
});
// Public profile by ID (view others)
app.get('/profile/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const uid = parseInt(req.params.id, 10);
    if (!uid || isNaN(uid)) return res.redirect('/feed');
    const row = getUserById(uid);
    if (!row) return res.redirect('/feed');
    const passions = row.categories ? JSON.parse(row.categories) : [];
    const goals = row.goals ? JSON.parse(row.goals) : [];
    const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
    const userPosts = getUserPosts(uid);
    const user = {
        displayName: row.full_name,
        handle: row.handle || row.email.split('@')[0],
        bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
        passions,
        skills: skillsList,
        stats: { posts: userPosts.length, followers: 0, following: 0, sessions: 0 },
        isSeller: false,
        bannerImage: row.banner_image
    };
    const projects = [];
    const services = [];
    res.render('profile', {
        title: `${user.displayName} - Profile - Dream X`,
        currentPage: 'profile',
        user,
        projects,
        services
    });
});

// Edit Profile form (placeholder values pulled from same user object shape)
app.get('/profile/edit', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const row = getUserById(req.session.userId);
    if (!row) return res.redirect('/login');
    const authUser = { id: row.id, full_name: row.full_name, email: row.email, profile_picture: row.profile_picture, handle: row.handle };
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
    const categories = ['Tutoring','Mentorship','Coaching','Workshops','Other'];
    const services = [
        { id: 123, user: 'Nora Fields', passion: 'Writing', desc: 'Story structure & clarity coaching session', rating: 4.8, price: 30 },
        { id: 124, user: 'Ethan Brooks', passion: 'Entrepreneurship', desc: 'Idea validation & lean MVP strategy', rating: 4.9, price: 45 },
        { id: 125, user: 'Clara Dawson', passion: 'Photography', desc: 'Portrait lighting fundamentals workshop', rating: 4.7, price: 35 },
        { id: 126, user: 'Jun Park', passion: 'Design', desc: 'UX audit + actionable redesign guidance', rating: 4.6, price: 40 },
        { id: 127, user: 'Marcus Lee', passion: 'Art', desc: 'Gesture and anatomy critique session', rating: 4.8, price: 32 },
    ];
    res.render('services', {
        title: 'Services Marketplace - Dream X',
        currentPage: 'services',
        categories,
        services
    });
});

// Service details page (single service placeholder)
app.get('/services/:id', (req, res) => {
    const { id } = req.params;
    // Placeholder service and reviews data
    const service = {
        id,
        name: '1:1 Coding Mentorship',
        provider: { name: 'Ava Chen', passion: 'Coding' },
        rating: 4.8,
        reviewsCount: 37,
        pricePerSession: 40,
        about: 'A focused one‑on‑one session designed to accelerate your learning loop. We will review current blockers, walk through code clarity improvements, and map a sustainable progression path.',
        included: [
            '60‑minute live session',
            'Personalized feedback & refactor suggestions',
            'Actionable next steps roadmap',
            'Follow‑up summary notes'
        ],
        idealFor: [
            'Self‑taught developers seeking structure',
            'Junior engineers preparing for interviews',
            'Makers refining MVP architecture'
        ]
    };
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

// Send message API (supports optional file attachment)
app.post('/api/messages/send', chatUpload.single('file'), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversationId = parseInt(req.body.conversationId, 10);
    const content = (req.body.content || '').trim();
    const file = req.file || null;

    if ((!content || content.length === 0) && !file) {
      return res.status(400).json({ error: 'Message must include text or a file' });
    }

    // Check user is in conversation
    if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const attachmentUrl = file ? `/uploads/${file.filename}` : null;
    const attachmentMime = file ? file.mimetype : null;

    const messageId = createMessage({
        conversationId,
        senderId: req.session.userId,
        content: content || '',
        attachmentUrl,
        attachmentMime
    });

    // Get conversation details and participants to send notifications
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    const participants = getConversationParticipants(conversationId);
    const sender = getUserById(req.session.userId);
    
    // Create notifications for other participants
    participants.forEach(participant => {
        if (participant.user_id !== req.session.userId) {
            const notifTitle = conv.is_group 
                ? `New message in ${conv.group_name || 'Group Chat'}`
                : `New message from ${sender.full_name}`;
            const notifMessage = content || '📎 Sent an attachment';
            
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

    // Emit to socket for real-time delivery
    io.to(`conversation-${conversationId}`).emit('new-message', {
        id: messageId,
        conversation_id: conversationId,
        sender_id: req.session.userId,
        content: content || '',
        attachment_url: attachmentUrl,
        attachment_mime: attachmentMime,
        created_at: new Date().toISOString()
    });

    res.json({ success: true, messageId, attachmentUrl, attachmentMime });
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
    
    res.json({ success: true });
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
        console.error('Password change error:', e);
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

// Pricing page (tiers)
app.get('/pricing', (req, res) => {
    const tiers = [
        { id: 'free', name: 'Free', price: '$0/mo', tagline: 'Start building & connecting', features: [
            'Social feed + basic posting', 'Follow creators', 'Book services'
        ]},
        { id: 'pro-buyer', name: 'Pro Buyer', price: '$5.99/mo', tagline: 'Enhanced discovery power', features: [
            'Ad-free experience', 'Enhanced discovery', 'Limited one-time request listings'
        ]},
        { id: 'pro-seller', name: 'Pro Seller', price: '$9.99/mo', tagline: 'Launch your service offerings', highlight: true, features: [
            'Offer services', 'Basic analytics & scheduling', 'Priority in search'
        ]},
        { id: 'elite-seller', name: 'Elite Seller', price: '$29.99/mo', tagline: 'Scale with advanced tools', features: [
            'Full business suite', 'Advanced analytics', 'Brand-level customization'
        ]}
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
        { q: 'How do I report a problem or a user?', a: 'Use the in-app report option on posts or profiles, or contact support directly for urgent issues.' }
    ];
    res.render('help-center', {
        title: 'Help Center - Dream X',
        currentPage: 'help-center',
        faqs
    });
});

// Admin dashboard (internal-only placeholder)
app.get('/admin', (req, res) => {
    const metrics = {
        totalUsers: 4821,
        activeToday: 763,
        servicesListed: 188,
        sessionsBooked: 942
    };
    const recentSignups = [
        { name: 'Ava Chen', email: 'ava@example.com', date: '2025-11-14' },
        { name: 'Leo Martinez', email: 'leo@example.com', date: '2025-11-14' },
        { name: 'Sofia Patel', email: 'sofia@example.com', date: '2025-11-13' },
        { name: 'Marcus Lee', email: 'marcus@example.com', date: '2025-11-13' },
    ];
    const flaggedContent = [
        { user: 'Clara Dawson', reason: 'Inappropriate language', date: '2025-11-14', status: 'Pending' },
        { user: 'Jun Park', reason: 'Spam links', date: '2025-11-13', status: 'Reviewed' },
        { user: 'Nora Fields', reason: 'Off-topic promotion', date: '2025-11-12', status: 'Resolved' },
    ];
    res.render('admin-dashboard', {
        title: 'Admin Dashboard - Dream X',
        currentPage: null, // intentionally no nav highlight
        metrics,
        recentSignups,
        flaggedContent
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
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`✨ Dream X server running on http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop the server`);
});

const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    getUserById,
    getUserByHandle,
    getUserByEmail,
    getLinkedAccountsForUser,
    getUserSubscription,
    getPaymentMethods,
    getInvoices,
    getUserCharges,
    getBlockedUsers,
    updateUserProfile,
    updateUserHandle,
    updatePassword,
    updateNotificationSettings,
    updatePrivacySettings,
    unlinkProvider,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    cancelSubscription,
    createOrUpdateSubscription,
    createInvoice,
    addAuditLog,
    getUserRefundRequests,
    createRefundRequest,
    createPhoneVerificationCode,
    getLatestPhoneVerificationCode,
    updateUserPhoneNumber,
    db
} = require('../../db');
const phoneService = require('../../services/phoneService');
const rateLimitService = require('../../services/rateLimitService');

// Multer config for refund screenshots
const refundUploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'refunds');
if (!fs.existsSync(refundUploadDir)) {
    fs.mkdirSync(refundUploadDir, { recursive: true });
}

const refundStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, refundUploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `refund-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const refundUpload = multer({
    storage: refundStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mime = file.mimetype;
        if (allowedTypes.test(ext) && (mime.startsWith('image/') || mime === 'application/pdf')) {
            return cb(null, true);
        }
        cb(new Error('Only image and PDF files are allowed'));
    }
});
const emailService = require('../../services/emailService');
const { validatePasswordComplexity } = require('../../utils/route-helpers');

const router = express.Router();
const SSO_BOOTSTRAP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isSsoBootstrapActive(session, userId) {
    if (!session || !session.ssoPasswordBootstrap) return false;
    const { userId: bootstrapUserId, grantedAt } = session.ssoPasswordBootstrap;
    if (bootstrapUserId !== userId) return false;
    return (Date.now() - (grantedAt || 0)) < SSO_BOOTSTRAP_WINDOW_MS;
}

function ensureAuthenticated(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

async function handlePasswordChange({ userId, currentPassword, newPassword, confirmPassword, session }) {
    if (!newPassword || !confirmPassword) {
        return { ok: false, message: 'New password and confirmation required' };
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

    const linkedAccounts = await getLinkedAccountsForUser(userId) || [];
    const hasLinkedAccounts = linkedAccounts.length > 0;
    const hasPassword = !!(user.password_hash);
    const bootstrapActive = hasLinkedAccounts && isSsoBootstrapActive(session, userId);
    const providedCurrent = typeof currentPassword === 'string' && currentPassword.length > 0;
    
    // If user has a password set, verify current password unless SSO bootstrap is active
    if (hasPassword) {
        if (providedCurrent) {
            // Defensive check - ensure both password and hash are present before comparing
            if (!currentPassword || !user.password_hash) {
                return { ok: false, message: 'Current password is required' };
            }
            const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
            if (!passwordValid) {
                return { ok: false, message: 'Current password incorrect' };
            }
        } else if (!bootstrapActive) {
            return { ok: false, message: 'Current password is required when changing an existing password' };
        }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    updatePassword({ userId, passwordHash: hash });
    if (session && session.ssoPasswordBootstrap) {
        session.ssoPasswordBootstrap = null;
    }
    return { ok: true, message: hasPassword ? 'Password changed successfully' : 'Password set successfully. You can now sign in with email and password.' };
}

// Initialize router with dependencies
function initSettingsRoutes() {
    // Settings page
    router.get('/settings', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        const row = await getUserById(req.session.userId);
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
        const linked = { google: false, microsoft: false, apple: false, twitter: false };
        try {
            const accounts = await getLinkedAccountsForUser(req.session.userId) || [];
            accounts.forEach(a => { 
                if (a.provider && linked.hasOwnProperty(a.provider)) {
                    linked[a.provider] = true;
                }
            });
        } catch (e) { 
            console.error('Error fetching linked accounts:', e);
        }

        const linkedAccounts = getLinkedAccountsForUser(req.session.userId) || [];
        const hasLinkedAccounts = linkedAccounts.length > 0;
        const hasPassword = !!(row.password_hash);
        const isSSOOnly = hasLinkedAccounts && !hasPassword;
        const ssoBootstrapActive = hasLinkedAccounts && isSsoBootstrapActive(req.session, req.session.userId);
        const ssoBootstrapProvider = ssoBootstrapActive && req.session && req.session.ssoPasswordBootstrap
            ? req.session.ssoPasswordBootstrap.provider
            : null;

        const subscription = getUserSubscription(req.session.userId) || { tier: 'free', status: 'active' };
        const paymentMethods = getPaymentMethods(req.session.userId) || [];
        const invoices = getInvoices(req.session.userId) || [];
        const { getUserCharges } = require('../../db');
        const charges = getUserCharges({ userId: req.session.userId, limit: 50, offset: 0 }) || [];
        const blockedUsers = getBlockedUsers(req.session.userId) || [];

        res.render('user/settings', {
            title: 'Settings - Dream X',
            currentPage: 'settings',
            user: authUser,
            authUser,
            linked,
            hasPassword,
            isSSOOnly,
            ssoBootstrapActive,
            ssoBootstrapProvider,
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
    router.get('/billing', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const row = await getUserById(req.session.userId);
        if (!row) return res.redirect('/login');
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
    router.post('/settings/account', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const { displayName, email, handle } = req.body;
        const fullName = displayName;

        if (!fullName || !email || !handle) {
            return res.redirect('/settings?error=All fields required');
        }

        const cleanHandle = handle.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(cleanHandle)) {
            return res.redirect('/settings?error=Handle must be 3-20 characters and contain only lowercase letters, numbers, and underscores');
        }

        const existingHandle = await getUserByHandle(cleanHandle);
        if (existingHandle && existingHandle.id !== req.session.userId) {
            return res.redirect('/settings?error=Handle is already taken. Please choose another one');
        }

        try {
            const currentUser = await getUserById(req.session.userId);
            updateUserProfile({
                userId: req.session.userId,
                fullName,
                bio: currentUser?.bio || '',
                location: currentUser?.location || '',
                skills: currentUser?.skills || ''
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
    router.post('/settings/password', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const { currentPassword, newPassword, confirmPassword } = req.body;

        try {
            const result = await handlePasswordChange({
                userId: req.session.userId,
                currentPassword,
                newPassword,
                confirmPassword,
                session: req.session
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
    router.post('/api/settings/password', ensureAuthenticated, async (req, res) => {
        const { currentPassword, newPassword, confirmPassword } = req.body || {};

        try {
            const result = await handlePasswordChange({
                userId: req.session.userId,
                currentPassword,
                newPassword,
                confirmPassword,
                session: req.session
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
    router.post('/settings/notifications', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');

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
    router.post('/settings/privacy', (req, res) => {
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
            res.redirect('/settings?error=Failed+to+update+privacy');
        }
    });

    // Unlink OAuth provider
    router.post('/settings/connections/unlink', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const provider = (req.body.provider || '').toLowerCase();
        if (!['google', 'microsoft', 'apple'].includes(provider)) {
            return res.redirect('/settings?error=Unknown provider');
        }
        try {
            const user = await getUserById(req.session.userId);
            const accounts = await getLinkedAccountsForUser(req.session.userId) || [];
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
    router.post('/settings/billing/payment-methods/add', (req, res) => {
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
    router.post('/settings/billing/payment-methods/:id/delete', (req, res) => {
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
    router.post('/settings/billing/payment-methods/:id/set-default', (req, res) => {
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
    router.post('/settings/billing/subscription/cancel', (req, res) => {
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
    router.post('/api/checkout/subscribe', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const { tier, cardType, cardNumber, expiryMonth, expiryYear, cvv, saveCard } = req.body;

        const validTiers = ['free', 'pro-buyer', 'pro-seller', 'elite-seller'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ error: 'Invalid tier selected' });
        }

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

        if (!cardType || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
            return res.status(400).json({ error: 'All payment fields required' });
        }

        try {
            const lastFour = cardNumber.slice(-4);
            const amounts = {
                'pro-buyer': 5.99,
                'pro-seller': 9.99,
                'elite-seller': 29.99
            };
            const amount = amounts[tier] || 0;

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

            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            createOrUpdateSubscription({
                userId: req.session.userId,
                tier,
                status: 'active',
                endsAt: nextMonth.toISOString()
            });

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
    router.post('/api/subscription/cancel', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const { reason } = req.body;

        try {
            const { addAuditLog } = require('../../db');
            addAuditLog({
                userId: req.session.userId,
                action: 'cancel_subscription',
                details: JSON.stringify({ reason: reason || 'No reason provided' })
            });

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
    router.post('/api/payment-methods/add', ensureAuthenticated, (req, res) => {
        const { cardType, lastFour, expiryMonth, expiryYear, isDefault } = req.body;

        if (!cardType || !lastFour || !expiryMonth || !expiryYear) {
            return res.status(400).json({ error: 'All payment method fields required' });
        }

        try {
            addPaymentMethod({
                userId: req.session.userId,
                cardType,
                lastFour,
                expiryMonth: parseInt(expiryMonth),
                expiryYear: parseInt(expiryYear),
                isDefault: isDefault ? 1 : 0
            });
            res.json({ success: true, message: 'Payment method added' });
        } catch (e) {
            console.error('Add payment method error:', e);
            res.status(500).json({ error: 'Failed to add payment method' });
        }
    });

    // Settings: Banking
    router.post('/settings/banking', ensureAuthenticated, async (req, res) => {
        try {
            const { bankCountry, bankAccount, routingNumber } = req.body;
            const userId = req.session.userId;

            if (bankCountry) {
                await db.prepare('UPDATE users SET bank_account_country = ? WHERE id = ?').run(bankCountry, userId);
            }
            if (bankAccount && !bankAccount.includes('••••')) {
                await db.prepare('UPDATE users SET bank_account_number = ? WHERE id = ?').run(bankAccount, userId);
            }
            if (routingNumber) {
                await db.prepare('UPDATE users SET bank_routing_number = ? WHERE id = ?').run(routingNumber, userId);
            }

            res.redirect('/settings?success=Banking+info+updated');
        } catch (error) {
            console.error('Banking update error:', error);
            res.redirect('/settings?error=Failed+to+update+banking+info');
        }
    });

    // Settings: Delete account
    router.post('/settings/delete-account', ensureAuthenticated, async (req, res) => {
        try {
            const { confirmation } = req.body;
            const userId = req.session.userId;

            if (confirmation !== 'DELETE') {
                return res.redirect('/settings?error=Invalid+confirmation');
            }

            const user = await getUserById(userId);

            try {
                cancelSubscription(userId);
            } catch (e) { }

            const runDelete = db.transaction(async (uid) => {
                await db.prepare(`DELETE FROM comment_likes WHERE comment_id IN (
                    SELECT pc.id FROM post_comments pc WHERE pc.post_id IN (SELECT p.id FROM posts p WHERE p.user_id = ?)
                )`).run(uid);
                await db.prepare(`DELETE FROM post_comments WHERE post_id IN (
                    SELECT p.id FROM posts p WHERE p.user_id = ?
                )`).run(uid);
                await db.prepare(`DELETE FROM post_reactions WHERE post_id IN (
                    SELECT p.id FROM posts p WHERE p.user_id = ?
                )`).run(uid);
                await db.prepare('DELETE FROM comment_likes WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM post_comments WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM post_reactions WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM posts WHERE user_id = ?').run(uid);

                await db.prepare(`DELETE FROM service_reviews WHERE service_id IN (
                    SELECT s.id FROM services s WHERE s.user_id = ?
                )`).run(uid);
                await db.prepare(`DELETE FROM service_orders WHERE service_id IN (
                    SELECT s.id FROM services s WHERE s.user_id = ?
                )`).run(uid);
                await db.prepare('DELETE FROM service_reviews WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM service_orders WHERE buyer_id = ?').run(uid);
                await db.prepare('DELETE FROM services WHERE user_id = ?').run(uid);

                await db.prepare(`DELETE FROM message_reactions WHERE message_id IN (
                    SELECT m.id FROM messages m WHERE m.conversation_id IN (
                        SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
                    )
                )`).run(uid, uid);
                await db.prepare(`DELETE FROM messages WHERE conversation_id IN (
                    SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
                )`).run(uid, uid);
                await db.prepare(`DELETE FROM conversation_participants WHERE conversation_id IN (
                    SELECT c.id FROM conversations c WHERE c.user1_id = ? OR c.user2_id = ?
                )`).run(uid, uid);
                await db.prepare('DELETE FROM conversation_participants WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?').run(uid, uid);

                await db.prepare('DELETE FROM invoices WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM payment_methods WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(uid, uid);
                await db.prepare('DELETE FROM notifications WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').run(uid, uid);
                await db.prepare('DELETE FROM user_reports WHERE reporter_id = ? OR reported_user_id = ?').run(uid, uid);
                await db.prepare('DELETE FROM user_moderation WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM livestream_chat WHERE livestream_id IN (SELECT id FROM livestreams WHERE user_id = ?)').run(uid);
                await db.prepare('DELETE FROM livestream_viewers WHERE livestream_id IN (SELECT id FROM livestreams WHERE user_id = ?)').run(uid);
                await db.prepare('DELETE FROM livestream_viewers WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM livestream_chat WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM livestreams WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM payment_customers WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM oauth_accounts WHERE user_id = ?').run(uid);
                await db.prepare('DELETE FROM email_verification_codes WHERE user_id = ?').run(uid);

                await db.prepare('UPDATE career_applications SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);
                await db.prepare('UPDATE content_appeals SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);
                await db.prepare('UPDATE account_appeals SET reviewer_id = NULL WHERE reviewer_id = ?').run(uid);

                await db.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(uid);

                await db.prepare('DELETE FROM users WHERE id = ?').run(uid);
            });
            await runDelete(userId);

            if (user && user.email) {
                await emailService.sendAccountDeletionEmail(user.email, user.full_name, req);
            }

            req.session.destroy(() => {
                res.redirect('/?message=Account+deleted+successfully');
            });
        } catch (error) {
            console.error('Account deletion error:', error);
            res.redirect('/settings?error=Failed+to+delete+account');
        }
    });

    // Refund Request page
    router.get('/refund-request', async (req, res) => {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        try {
            const charges = getUserCharges({
                userId: req.session.userId,
                limit: 100,
                offset: 0
            }) || [];

            const recentRefunds = getUserRefundRequests(req.session.userId) || [];

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
    router.post('/refund-request', refundUpload.single('screenshot'), (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const {
            charge_id, chargeId, amount, reason, description,
            order_date, orderDate, transaction_id, transactionId,
            preferred_method, preferredMethod, account_email, accountEmail,
            account_last_four, accountLastFour
        } = req.body;

        const finalChargeId = (charge_id || chargeId) ? parseInt(charge_id || chargeId) : null;
        const finalTransactionId = transaction_id || transactionId;

        try {
            const recentRefunds = getUserRefundRequests(req.session.userId);
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            const duplicateRefund = recentRefunds.find(refund => {
                const refundDate = new Date(refund.created_at);
                const isRecent = refundDate > fiveDaysAgo;
                if (isRecent) {
                    if (finalChargeId && refund.charge_id === finalChargeId) return true;
                    if (finalTransactionId && refund.transaction_id === finalTransactionId) return true;
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

            let screenshotPath = null;
            if (req.file) {
                screenshotPath = req.file.path || `refunds/${req.file.filename}`;
            }

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

            res.json({ success: true, message: 'Refund request submitted successfully', requestId: refundRequestId });
        } catch (error) {
            console.error('Error creating refund request:', error);
            res.status(500).json({ success: false, error: 'Failed to submit refund request. Please try again.' });
        }
    });

    // Phone number management
    router.post('/settings/phone/request', ensureAuthenticated, async (req, res) => {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Phone number required' });
        }

        // Check rate limit: 3 attempts per 60 minutes
        const rateLimit = rateLimitService.checkRateLimit(req.session.userId, 'phone_verification', {
            maxAttempts: 3,
            windowMinutes: 60
        });

        if (!rateLimit.allowed) {
            rateLimitService.recordAttempt(req.session.userId, 'phone_verification', {
                action: 'request_code_settings',
                blocked: true,
                ip: req.ip
            });
            return res.json({
                success: false,
                rateLimited: true,
                error: 'Too many SMS requests. Please try again later.',
                remaining: rateLimit.remaining,
                waitSeconds: rateLimit.waitSeconds
            });
        }

        // Validate phone number
        const validation = phoneService.validatePhoneNumber(phoneNumber);
        if (!validation.valid) {
            return res.status(400).json({ success: false, error: validation.error || 'Invalid phone number' });
        }

        const normalizedPhone = validation.e164;

        try {
            // Check if phone is already in use by another verified account
            const existingUser = db.prepare(`
                SELECT id FROM users 
                WHERE phone_number = ? AND phone_verified = 1 AND id != ?
            `).get(normalizedPhone, req.session.userId);

            if (existingUser) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'This phone number is already associated with another account' 
                });
            }

            // Create verification code
            const phoneCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

            createPhoneVerificationCode({
                userId: req.session.userId,
                phoneNumber: normalizedPhone,
                code: phoneCode,
                expiresAt
            });

            // Record the attempt
            rateLimitService.recordAttempt(req.session.userId, 'phone_verification', {
                action: 'request_code_settings',
                phone: normalizedPhone,
                ip: req.ip
            });

            // Send SMS if Twilio configured
            if (phoneService.isConfigured()) {
                const smsResult = await phoneService.sendOTPMessage(normalizedPhone, phoneCode);
                if (!smsResult.success) {
                    console.warn('Failed to send SMS:', smsResult.error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to send verification code. Please try again.' 
                    });
                }
            }

            res.json({ 
                success: true, 
                message: 'Verification code sent to your phone',
                phoneNumber: normalizedPhone.slice(0, 3) + '***' + normalizedPhone.slice(-4)
            });
        } catch (error) {
            console.error('Phone verification request error:', error);
            res.status(500).json({ success: false, error: 'Failed to request verification' });
        }
    });

    router.post('/settings/phone/verify', ensureAuthenticated, async (req, res) => {
        const { code } = req.body;

        if (!code || code.length !== 6) {
            return res.status(400).json({ success: false, error: 'Invalid verification code format' });
        }

        // Check rate limit for verification attempts: 10 per 15 minutes
        const verifyLimit = rateLimitService.checkRateLimit(req.session.userId, 'phone_verification_attempt', {
            maxAttempts: 10,
            windowMinutes: 15
        });

        if (!verifyLimit.allowed) {
            rateLimitService.recordAttempt(req.session.userId, 'phone_verification_attempt', {
                action: 'verify_code_settings',
                blocked: true,
                ip: req.ip
            });
            return res.status(429).json({
                success: false,
                error: 'Too many verification attempts. Please try again later.',
                rateLimited: true,
                waitSeconds: verifyLimit.waitSeconds
            });
        }

        try {
            const verificationRecord = db.prepare(`
                SELECT * FROM phone_verification_codes 
                WHERE user_id = ? AND code = ? AND verified = 0
                ORDER BY created_at DESC LIMIT 1
            `).get(req.session.userId, code);

            if (!verificationRecord) {
                rateLimitService.recordAttempt(req.session.userId, 'phone_verification_attempt', {
                    action: 'verify_code_settings',
                    result: 'invalid_code',
                    ip: req.ip
                });
                return res.status(400).json({ success: false, error: 'Invalid or expired code' });
            }

            const now = new Date();
            const expiresAt = new Date(verificationRecord.expires_at);
            if (now > expiresAt) {
                rateLimitService.recordAttempt(req.session.userId, 'phone_verification_attempt', {
                    action: 'verify_code_settings',
                    result: 'expired_code',
                    ip: req.ip
                });
                return res.status(400).json({ success: false, error: 'Code has expired. Request a new one.' });
            }

            // Update phone number and mark as verified
            updateUserPhoneNumber({ 
                userId: req.session.userId, 
                phoneNumber: verificationRecord.phone_number 
            });

            db.prepare(`
                UPDATE phone_verification_codes 
                SET verified = 1 
                WHERE id = ?
            `).run(verificationRecord.id);

            db.prepare(`
                UPDATE users 
                SET phone_verified = 1, phone_verified_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(req.session.userId);

            console.log(`✅ Phone verified for user ${req.session.userId}`);

            res.json({ 
                success: true, 
                message: 'Phone number verified successfully' 
            });
        } catch (error) {
            console.error('Phone verification error:', error);
            res.status(500).json({ success: false, error: 'Verification failed' });
        }
    });

    router.post('/settings/phone/resend', ensureAuthenticated, async (req, res) => {
        // Check rate limit: 3 attempts per 60 minutes
        const rateLimit = rateLimitService.checkRateLimit(req.session.userId, 'phone_verification', {
            maxAttempts: 3,
            windowMinutes: 60
        });

        if (!rateLimit.allowed) {
            rateLimitService.recordAttempt(req.session.userId, 'phone_verification', {
                action: 'resend_code_settings',
                blocked: true,
                ip: req.ip
            });
            return res.json({
                success: false,
                rateLimited: true,
                error: 'Too many SMS requests. Please try again later.',
                remaining: rateLimit.remaining,
                waitSeconds: rateLimit.waitSeconds
            });
        }

        try {
            const latestCode = getLatestPhoneVerificationCode(req.session.userId);
            if (!latestCode) {
                return res.status(400).json({ success: false, error: 'No phone verification in progress' });
            }

            const phoneCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

            createPhoneVerificationCode({
                userId: req.session.userId,
                phoneNumber: latestCode.phone_number,
                code: phoneCode,
                expiresAt
            });

            // Record the attempt
            rateLimitService.recordAttempt(req.session.userId, 'phone_verification', {
                action: 'resend_code_settings',
                phone: latestCode.phone_number,
                ip: req.ip
            });

            if (phoneService.isConfigured()) {
                await phoneService.sendOTPMessage(latestCode.phone_number, phoneCode);
            }

            res.json({ 
                success: true, 
                message: 'Verification code resent' 
            });
        } catch (error) {
            console.error('Resend phone code error:', error);
            res.status(500).json({ success: false, error: 'Failed to resend code' });
        }
    });

    return router;
}

module.exports = initSettingsRoutes;


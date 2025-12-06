const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const {
    getUserById,
    getAllUsers,
    getUsersPaged,
    getUsersCount,
    getUserByEmail,
    createUser,
    updateUserRole,
    updateAdminPermissions,
    getStats,
    getAuditLogsPaged,
    getCareerApplicationsPaged,
    getCareerJobsForAdmin,
    getHrTeam,
    getFollowerCount,
    getFollowingCount,
    checkAccountStatus,
    addAuditLog,
    createNotification,
    getRefundRequest,
    updateRefundRequestStatus,
    getUserAdminNotes,
    addUserAdminNote,
    banUser,
    suspendUser,
    unbanUser,
    hideComment,
    deleteComment,
    restoreComment,
    getPushSubscriptions,
    deletePushSubscription,
    getAllBlocksAndReports,
    getUserReports,
    updateReportStatus,
    lockUserBlockFunctionality,
    unlockUserBlockFunctionality,
    getSalesInquiryStats,
    getSalesInquiriesPaged,
    db
} = require('../../db');
const { getRequestBaseUrl } = require('../../utils/route-helpers');
const emailService = require('../../services/emailService');

const router = express.Router();

// Constants and helper functions
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
const roleRank = { user: 1, hr: 2, super_hr: 3, global_hr: 4, admin: 5, super_admin: 6, global_admin: 7 };
const hrRoleRank = { hr: 1, super_hr: 2, global_hr: 3 };

function normalizeArray(val) {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (val && typeof val === 'object' && Array.isArray(val.scopes)) return val.scopes.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string' && val.length) return [val.trim()];
    return [];
}

function sanitizePermissions(val) {
    return normalizeArray(val).filter(p => ADMIN_PERMISSION_KEYS.has(p));
}

function sanitizeHrPermissions(val) {
    return normalizeArray(val).filter(p => HR_PERMISSION_KEYS.has(p));
}

function parseAdminMeta(user) {
    try {
        const cleanPerms = normalizeArray(user.admin_permissions ? JSON.parse(user.admin_permissions) : [])
            .filter(p => ADMIN_PERMISSION_KEYS.has(p));
        return {
            permissions: cleanPerms,
            scopes: normalizeArray(user.admin_scopes ? JSON.parse(user.admin_scopes) : [])
        };
    } catch (_) {
        return { permissions: [], scopes: [] };
    }
}

function parseHrMeta(user) {
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
}

function defaultPermissionsForRole(role) {
    if (role === 'global_admin' || role === 'super_admin') return Array.from(ADMIN_PERMISSION_KEYS);
    if (role === 'admin') return ['manage_users', 'moderate_content', 'billing', 'services_moderation', 'refunds', 'careers', 'appeals'];
    return [];
}

const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isHR = (user) => user && ['hr', 'super_hr', 'global_hr'].includes(user.role);
const isSuperHR = (user) => user && (user.role === 'super_hr' || user.role === 'global_hr');
const isGlobalHR = (user) => user && user.role === 'global_hr';
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';

function hasPermission(user, permission) {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    const { permissions } = parseAdminMeta(user);
    return permissions.includes(permission);
}

function canManageHrRole(actor, targetRole) {
    if (!actor || !isHR(actor)) return false;
    const actorRank = hrRoleRank[actor.role] || 0;
    const targetRank = hrRoleRank[targetRole] || 0;
    return actorRank > targetRank && actorRank >= 2;
}

function requireAdmin(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isAdmin(user)) return res.redirect('/');
    next();
}

function requireSuperAdmin(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isSuperAdmin(user)) return res.redirect('/admin?error=Insufficient+permissions');
    next();
}

function requireHR(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isHR(user)) return res.redirect('/');
    next();
}

function requireAdminOrHR(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!isAdmin(user) && !isHR(user)) return res.redirect('/');
    next();
}

async function sendBrowserPush(userId, title, body, url, { getPushSubscriptions, deletePushSubscription, getUserById }) {
    try {
        const webpush = require('web-push');
        if (!webpush) return;
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

// Initialize router with dependencies
function initAdminRoutes({ io, webpush }) {
    // Admin dashboard
    router.get('/admin', requireAdmin, (req, res) => {
        const stats = getStats();
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

        const me = req.session.userId ? getUserById(req.session.userId) : null;
        const logs = (me && (me.role === 'super_admin' || me.role === 'global_admin')) ? getAuditLogsPaged({ limit: 50, offset: 0 }) : [];

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
            const dbm = require('../../db');
            careers = dbm.getCareerApplicationsPaged({ limit: qLimit + 1, offset: cOffset, status: cStatus });
            contentAppeals = dbm.getContentAppealsPaged({ limit: qLimit + 1, offset: caOffset, status: caStatus });
            accountAppeals = dbm.getAccountAppealsPaged({ limit: qLimit + 1, offset: aaOffset, status: aaStatus });
            if (careers.length > qLimit) { cHasMore = true; careers = careers.slice(0, qLimit); }
            if (contentAppeals.length > qLimit) { caHasMore = true; contentAppeals = contentAppeals.slice(0, qLimit); }
            if (accountAppeals.length > qLimit) { aaHasMore = true; accountAppeals = accountAppeals.slice(0, qLimit); }
        } catch (e) { console.warn('Queue fetch error:', e.message); }

        const rPage = Math.max(parseInt(req.query.rPage || '1', 10) || 1, 1);
        const rStatus = (req.query.rStatus || '').toLowerCase() || undefined;
        const rOffset = (rPage - 1) * qLimit;
        let refundRequests = [];
        let rHasMore = false;
        try {
            const dbm = require('../../db');
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

        // Sales inquiries stats for admin overview
        let salesInquiryStats = { total: 0, new: 0, urgent: 0 };
        let recentSalesInquiries = [];
        try {
            salesInquiryStats = getSalesInquiryStats();
            recentSalesInquiries = getSalesInquiriesPaged({ limit: 5, offset: 0, status: 'new' });
        } catch (e) {
            console.warn('Sales inquiries fetch error:', e.message);
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
            salesInquiryStats,
            recentSalesInquiries,
            adminPermissions: ADMIN_PERMISSION_DEFINITIONS,
            error: req.query.error,
            success: req.query.success
        });
    });

    // Admin: create users/admins via wizard
    router.post('/admin/users/wizard', requireAdmin, async (req, res) => {
        const actor = req.session.userId ? getUserById(req.session.userId) : null;
        if (!actor) return res.status(403).json({ error: 'Unauthorized' });

        const targetRole = (req.body.role || 'user').toLowerCase();
        const targetRank = roleRank[targetRole] || 1;
        const actorRank = roleRank[actor.role] || 0;
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
    router.post('/admin/users/:id/permissions', requireAdmin, (req, res) => {
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
    router.get('/admin/services', requireAdmin, (req, res) => {
        const status = (req.query.status || '').toLowerCase() || null;
        const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
        const pageSize = 25;
        const offset = (page - 1) * pageSize;
        const q = (req.query.q || '').trim();
        const rows = require('../../db').listAllServicesAdmin({ status, limit: pageSize, offset, q: q || null });
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

    router.post('/admin/services/:id/hide', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const notifyEmail = !!req.body.notifyEmail;
        const notifyInApp = !!req.body.notifyInApp;
        try {
            const ok = require('../../db').adminSetServiceStatus({ serviceId: id, status: 'hidden' });
            if (ok) {
                const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
                if (s) {
                    if (notifyInApp) {
                        createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service hidden', message: `Your service "${s.title}" was hidden by admins.`, link: `/services/${id}` });
                        await sendBrowserPush(s.user_id, 'Service hidden', `Your service "${s.title}" was hidden by admins.`, `/services/${id}`, { getPushSubscriptions, deletePushSubscription, getUserById });
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

    router.post('/admin/services/:id/unhide', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const notifyEmail = !!req.body.notifyEmail;
        const notifyInApp = !!req.body.notifyInApp;
        try {
            const ok = require('../../db').adminSetServiceStatus({ serviceId: id, status: 'active' });
            if (ok) {
                const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
                if (s) {
                    if (notifyInApp) {
                        createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service restored', message: `Your service "${s.title}" is visible again.`, link: `/services/${id}` });
                        await sendBrowserPush(s.user_id, 'Service restored', `Your service "${s.title}" is visible again.`, `/services/${id}`, { getPushSubscriptions, deletePushSubscription, getUserById });
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

    router.post('/admin/services/:id/delete', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const notifyEmail = !!req.body.notifyEmail;
        const notifyInApp = !!req.body.notifyInApp;
        const reason = (req.body.reason || '').trim() || null;
        try {
            const ok = require('../../db').adminSetServiceStatus({ serviceId: id, status: 'deleted' });
            if (ok) {
                const s = db.prepare('SELECT s.*, u.email, u.full_name FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(id);
                if (s) {
                    if (notifyInApp) {
                        createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service deleted', message: `Your service "${s.title}" was removed by admins.`, link: `/profile` });
                        await sendBrowserPush(s.user_id, 'Service deleted', `Your service "${s.title}" was removed by admins.`, `/profile`, { getPushSubscriptions, deletePushSubscription, getUserById });
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

    router.post('/admin/services/:id/edit', requireSuperAdmin, async (req, res) => {
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
            const ok = require('../../db').adminUpdateServiceContent({ serviceId: id, fields });
            if (ok && (req.body.notifyEmail || req.body.notifyInApp)) {
                const owner = getUserById(s.user_id);
                let emailSuppressed = false;
                if (req.body.notifyInApp) {
                    createNotification({ userId: s.user_id, type: 'service_moderation', title: 'Service edited by admin', message: `Your service "${s.title}" was edited for compliance.`, link: `/services/${id}` });
                    await sendBrowserPush(s.user_id, 'Service edited by admin', `Your service "${s.title}" was edited for compliance.`, `/services/${id}`, { getPushSubscriptions, deletePushSubscription, getUserById });
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
    router.post('/admin/users/:id/role', requireSuperAdmin, (req, res) => {
        const id = parseInt(req.params.id);
        const role = (req.body.role || 'user').toLowerCase();
        const me = getUserById(req.session.userId);

        if (!['user', 'admin', 'super_admin', 'global_admin', 'hr', 'super_hr', 'global_hr'].includes(role)) {
            return res.redirect('/admin?error=Invalid+role');
        }

        if (role === 'global_admin' && (!me || me.role !== 'global_admin')) {
            return res.redirect('/admin?error=Only+global+admins+can+promote+to+global+admin');
        }

        if (me && me.id === id && me.role === 'global_admin' && role !== 'global_admin') {
            return res.redirect('/admin?error=Cannot+demote+yourself+from+global+admin');
        }
        if (me && me.id === id && me.role === 'super_admin' && role !== 'super_admin' && role !== 'global_admin') {
            return res.redirect('/admin?error=Cannot+demote+yourself');
        }

        const all = getAllUsers();
        const globalAdmins = all.filter(u => u.role === 'global_admin');
        if (globalAdmins.length === 1 && globalAdmins[0].id === id && role !== 'global_admin') {
            return res.redirect('/admin?error=At+least+one+global+admin+required');
        }

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
    router.get('/admin/users/:id/stats', requireAdmin, async (req, res) => {
        const userId = parseInt(req.params.id);
        const user = getUserById(userId);
        if (!user) {
            return res.redirect('/admin?error=User+not+found');
        }

        const postsCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId)?.count || 0;
        const commentsCount = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE user_id = ?').get(userId)?.count || 0;
        const followersCount = getFollowerCount(userId);
        const followingCount = getFollowingCount(userId);
        const conversationsCount = db.prepare('SELECT COUNT(DISTINCT conversation_id) as count FROM conversation_participants WHERE user_id = ?').get(userId)?.count || 0;
        const messagesCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE sender_id = ?').get(userId)?.count || 0;

        const recentPosts = db.prepare(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as reactions_count,
                   (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
            FROM posts p
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT 5
        `).all(userId);

        const accountAge = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
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
    router.get('/admin/export/users.csv', requireAdmin, (req, res) => {
        try { addAuditLog({ userId: req.session.userId, action: 'export_users', details: null }); } catch (e) { }
        const rows = getAllUsers();
        const header = 'id,full_name,email,role,created_at\n';
        const csv = header + rows.map(r => `${r.id},"${(r.full_name || '').replace(/"/g, '""')}",${r.email},${r.role},${r.created_at}`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
        res.send(csv);
    });

    router.get('/admin/export/messages.csv', requireAdmin, (req, res) => {
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

    // CSV export for career applications
    router.get('/admin/export/careers.csv', requireHR, (req, res) => {
        const careers = getCareerApplicationsPaged({ limit: 10000, offset: 0 });
        let csv = 'ID,Name,Email,Phone,Position,Status,Applied Date,Cover Letter\n';
        careers.forEach(c => {
            const coverLetter = (c.cover_letter || '').replace(/"/g, '""').replace(/\n/g, ' ');
            csv += `${c.id},"${c.name}","${c.email}","${c.phone || ''}","${c.position}","${c.status || 'new'}","${c.created_at}","${coverLetter}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=career_applications.csv');
        res.send(csv);
    });

    // Status update endpoints
    router.post('/admin/careers/:id/status', requireAdminOrHR, async (req, res) => {
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

        const application = db.getCareerApplicationById(id);
        require('../../db').updateCareerApplicationStatus({ id, status, reviewerId: req.session.userId });
        try { addAuditLog({ userId: req.session.userId, action: 'career_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

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

    router.post('/admin/appeals/content/:id/status', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const status = (req.body.status || '').toLowerCase();
        const valid = ['open', 'under_review', 'approved', 'denied'];
        if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');

        const appeal = db.getContentAppealById(id);
        require('../../db').updateContentAppealStatus({ id, status, reviewerId: req.session.userId });
        try { addAuditLog({ userId: req.session.userId, action: 'content_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

        if (appeal && (status === 'approved' || status === 'denied')) {
            if (status === 'approved') {
                await emailService.sendContentApprovalEmail(appeal.email, appeal, req);
            } else {
                await emailService.sendContentDenialEmail(appeal.email, appeal, req);
            }
        }

        res.redirect('/admin?success=Content+appeal+updated');
    });

    router.post('/admin/appeals/account/:id/status', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const status = (req.body.status || '').toLowerCase();
        const valid = ['open', 'under_review', 'approved', 'denied'];
        if (!valid.includes(status)) return res.redirect('/admin?error=Invalid+status');

        const appeal = db.getAccountAppealById(id);
        require('../../db').updateAccountAppealStatus({ id, status, reviewerId: req.session.userId });
        try { addAuditLog({ userId: req.session.userId, action: 'account_appeal_status_update', details: JSON.stringify({ id, status }) }); } catch (e) { }

        if (appeal && (status === 'approved' || status === 'denied')) {
            if (status === 'approved') {
                await emailService.sendAccountApprovalEmail(appeal.email, appeal, req);
            } else {
                await emailService.sendAccountDenialEmail(appeal.email, appeal, req);
            }
        }

        res.redirect('/admin?success=Account+appeal+updated');
    });

    // Admin: Get refund request details
    router.get('/admin/refund-requests/:id', requireAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        try {
            const refundRequest = getRefundRequest(id);
            if (!refundRequest) {
                return res.status(404).json({ success: false, error: 'Refund request not found' });
            }
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
    router.post('/admin/refund-requests/:id/update', requireAdmin, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { status, adminNotes, refundAmount } = req.body;
        const valid = ['pending', 'processing', 'approved', 'denied', 'refunded'];
        if (!valid.includes(status)) {
            return res.json({ success: false, error: 'Invalid status' });
        }
        try {
            const refundRequest = getRefundRequest(id);
            if (!refundRequest) {
                return res.json({ success: false, error: 'Refund request not found' });
            }
            updateRefundRequestStatus({
                id,
                status,
                reviewedBy: req.session.userId,
                adminNotes: adminNotes || null,
                refundAmount: refundAmount ? parseFloat(refundAmount) : null
            });
            try {
                addAuditLog({
                    userId: req.session.userId,
                    action: 'refund_request_update',
                    details: JSON.stringify({ id, status, refundAmount })
                });
            } catch (e) {
                console.warn('Audit log failed:', e);
            }
            const user = getUserById(refundRequest.user_id);
            if (user && user.email) {
                try {
                    if (status === 'approved') {
                        console.log('📧 Would send approval email to:', user.email);
                    } else if (status === 'denied') {
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
    router.get('/admin/users/:id/notes', requireAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        try {
            const notes = getUserAdminNotes(userId) || [];
            res.json({ success: true, notes });
        } catch (e) {
            console.error('Error fetching user notes:', e);
            res.status(500).json({ success: false, error: 'Failed to load notes' });
        }
    });

    router.post('/admin/users/:id/notes', requireAdmin, (req, res) => {
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

    // Admin: Freeze/unfreeze seller privileges
    router.post('/admin/users/:id/freeze-seller', requireAdmin, async (req, res) => {
        try {
            const userId = parseInt(req.params.id, 10);
            const { action, reason } = req.body;
            const adminId = req.session.userId;
            const frozenValue = action === 'freeze' ? 1 : 0;
            db.prepare('UPDATE users SET seller_privileges_frozen = ? WHERE id = ?').run(frozenValue, userId);
            const user = getUserById(userId);
            try {
                addAuditLog({
                    userId: adminId,
                    action: action === 'freeze' ? 'freeze_seller_privileges' : 'unfreeze_seller_privileges',
                    details: JSON.stringify({ targetUserId: userId, reason })
                });
            } catch (e) { }
            if (action === 'freeze') {
                db.prepare('UPDATE services SET status = \'frozen\' WHERE user_id = ? AND status = \'active\'').run(userId);
            } else {
                db.prepare('UPDATE services SET status = \'active\' WHERE user_id = ? AND status = \'frozen\'').run(userId);
            }
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

    // Admin: Freeze/unfreeze chat privileges
    router.post('/admin/users/:id/freeze-chat', requireAdmin, (req, res) => {
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

    // Admin: View all user blocks and reports
    router.get('/admin/moderation/user-actions', requireSuperAdmin, (req, res) => {
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
            res.redirect('/admin?error=Failed+to+load+moderation+data');
        }
    });

    // Admin: Update report status
    router.post('/admin/moderation/reports/:id/status', requireSuperAdmin, (req, res) => {
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
    router.post('/admin/moderation/users/:id/lock-blocking', requireSuperAdmin, (req, res) => {
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
    router.post('/admin/moderation/users/:id/unlock-blocking', requireSuperAdmin, (req, res) => {
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
    router.post('/admin/users/:id/ban', requireSuperAdmin, async (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const { reason, notifyUser } = req.body;
        const banReason = reason || 'Violation of community guidelines';
        const isJson = req.headers['content-type']?.includes('application/json');
        try {
            const targetUser = getUserById(userId);
            banUser({ userId, reason: banReason, bannedBy: req.session.userId });
            if (notifyUser && targetUser && targetUser.email) {
                await emailService.sendAccountBannedEmail(targetUser, banReason, req);
            }
            const { createNotification } = require('../../db');
            createNotification({
                userId: userId,
                type: 'account_action',
                title: '🚫 Account Banned',
                message: `Your account has been permanently banned. Reason: ${banReason}. You can submit an appeal if you believe this is a mistake.`,
                link: '/account-appeal'
            });
            if (io) {
                io.to(`user-${userId}`).emit('notification', {
                    type: 'account_action',
                    title: '🚫 Account Banned',
                    message: `Your account has been permanently banned. Reason: ${banReason}.`
                });
            }
            const Database = require('better-sqlite3');
            const dbPath = path.join(__dirname, '..', '..', 'data', 'sessions.sqlite3');
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
    router.post('/admin/users/:id/suspend', requireSuperAdmin, async (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const { duration, days, reason, notifyUser } = req.body;
        const suspendReason = reason || 'Temporary suspension';
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
                const numDays = parseInt(days, 10);
                until = new Date(now.getTime() + numDays * 24 * 60 * 60 * 1000);
                durationText = `${numDays} day${numDays !== 1 ? 's' : ''}`;
            } else if (duration) {
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
                    until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    durationText = '7 days';
                }
            }
            suspendUser({ userId, until, reason: suspendReason, suspendedBy: req.session.userId });
            if (notifyUser && targetUser && targetUser.email) {
                await emailService.sendAccountSuspendedEmail(targetUser, suspendReason, durationText, until, req);
            }
            const { createNotification } = require('../../db');
            createNotification({
                userId: userId,
                type: 'account_action',
                title: '⏸️ Account Suspended',
                message: `Your account has been suspended until ${until.toLocaleDateString()}. Reason: ${suspendReason}.`,
                link: '/account-appeal'
            });
            if (io) {
                io.to(`user-${userId}`).emit('notification', {
                    type: 'account_action',
                    title: '⏸️ Account Suspended',
                    message: `Your account has been suspended until ${until.toLocaleDateString()}.`
                });
            }
            const Database = require('better-sqlite3');
            const dbPath = path.join(__dirname, '..', '..', 'data', 'sessions.sqlite3');
            const sessDb = new Database(dbPath);
            try {
                sessDb.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${userId}%`);
            } catch (e) {
                console.warn('Session cleanup failed:', e.message);
            }
            sessDb.close();
            if (isJson) {
                return res.json({ success: true, until: until.toISOString() });
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
    router.post('/admin/users/:id/unban', requireSuperAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const isJson = req.headers['content-type']?.includes('application/json');
        try {
            const targetUser = getUserById(userId);
            unbanUser({ userId, unbannedBy: req.session.userId });
            const { createNotification } = require('../../db');
            createNotification({
                userId: userId,
                type: 'account_action',
                title: '✅ Account Restored',
                message: 'Your account has been restored and you can now access all features again.',
                link: '/feed'
            });
            if (io) {
                io.to(`user-${userId}`).emit('notification', {
                    type: 'account_action',
                    title: '✅ Account Restored',
                    message: 'Your account has been restored!'
                });
            }
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
    router.post('/admin/posts/:id/delete', requireAdmin, (req, res) => {
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
    router.post('/admin/posts/:id/hide', requireAdmin, (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.id, 10);
        try {
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
    router.post('/admin/comments/:id/hide', requireAdmin, (req, res) => {
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
    router.post('/admin/comments/:id/delete', requireAdmin, (req, res) => {
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
    router.post('/admin/comments/:id/restore', requireAdmin, (req, res) => {
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

    return router;
}

module.exports = initAdminRoutes;


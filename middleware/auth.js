// Authentication and authorization middleware
const { getUserById } = require('../db');

/**
 * Ensure user is authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

/**
 * Ensure user is admin
 */
function requireAdmin(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  if (!user || !isAdmin(user)) {
    return res.redirect('/');
  }
  next();
}

/**
 * Ensure user is super admin
 */
function requireSuperAdmin(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  if (!isSuperAdmin(user)) {
    return res.redirect('/admin?error=Insufficient+permissions');
  }
  next();
}

/**
 * Ensure user is HR
 */
function requireHR(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  if (!isHR(user)) {
    return res.redirect('/');
  }
  next();
}

/**
 * Ensure user is admin or HR
 */
function requireAdminOrHR(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  if (!isAdmin(user) && !isHR(user)) {
    return res.redirect('/');
  }
  next();
}

/**
 * Attach auth context to template locals
 */
function attachAuthContext(req, res, next) {
  try {
    let user = null;
    let unreadCount = 0;

    if (req.session && req.session.userId) {
      const row = getUserById(req.session.userId);
      if (row) {
        user = row;
        const { getUnreadMessageCount } = require('../db');
        unreadCount = getUnreadMessageCount(req.session.userId) || 0;
      }
    }

    res.locals.authUser = user || null;
    res.locals.unreadMessageCount = unreadCount || 0;
    next();
  } catch (err) {
    console.error('Error in auth middleware:', err);
    res.locals.authUser = null;
    res.locals.unreadMessageCount = 0;
    next();
  }
}

/**
 * Role and permission checking helper functions
 */
const roleRank = { user: 1, hr: 2, super_hr: 3, global_hr: 4, admin: 5, super_admin: 6, global_admin: 7 };
const ADMIN_PERMISSION_KEYS = new Set([
  'manage_users', 'manage_admins', 'moderate_content', 'billing', 'services_moderation',
  'refunds', 'careers', 'appeals', 'announcements', 'feature_flags', 'audit_logs',
  'user_moderation', 'platform_metrics'
]);

const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isHR = (user) => user && ['hr', 'super_hr', 'global_hr'].includes(user.role);
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');

const parseAdminMeta = (user) => {
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
};

const normalizeArray = (val) => {
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  if (typeof val === 'string' && val.length) return [val.trim()];
  return [];
};

const hasPermission = (user, permission) => {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const { permissions } = parseAdminMeta(user);
  return permissions.includes(permission);
};

module.exports = {
  ensureAuthenticated,
  requireAdmin,
  requireSuperAdmin,
  requireHR,
  requireAdminOrHR,
  attachAuthContext,
  isAdmin,
  isHR,
  isSuperAdmin,
  hasPermission,
  parseAdminMeta,
  roleRank
};

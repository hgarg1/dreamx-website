// Role-Based Access Control (RBAC) middleware
const { getUserById } = require('../db');
const { isAdmin, isSuperAdmin, isHR } = require('./auth');

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

const HR_PERMISSION_DEFINITIONS = [
  { key: 'hr_applications', label: 'Applications & Review', desc: 'View and triage candidate submissions.' },
  { key: 'hr_pipeline', label: 'Pipeline Moves', desc: 'Advance, reject, and tag candidates in the pipeline.' },
  { key: 'hr_jobs', label: 'Job Posts', desc: 'Create and update open roles and publishing status.' },
  { key: 'hr_messages', label: 'Candidate Outreach', desc: 'Email and message candidates from the HR desk.' },
  { key: 'hr_team', label: 'HR Team Management', desc: 'Create HR teammates and assign their scopes.' },
  { key: 'hr_scopes', label: 'Scope Stewardship', desc: 'Add or retire scopes for downstream HR workflows.' }
];

/**
 * Check if user has specific permission
 */
function hasPermission(user, permission) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  try {
    const perms = user.admin_permissions ? JSON.parse(user.admin_permissions) : [];
    return Array.isArray(perms) && perms.includes(permission);
  } catch {
    return false;
  }
}

/**
 * Middleware factory for permission checking
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!hasPermission(user, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Middleware factory for scope checking
 */
function requireScope(scope) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!user || !isHR(user)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    try {
      const scopes = user.admin_scopes ? JSON.parse(user.admin_scopes) : [];
      if (!Array.isArray(scopes) || !scopes.includes(scope)) {
        return res.status(403).json({ error: `Scope '${scope}' required` });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid scope configuration' });
    }
    next();
  };
}

module.exports = {
  hasPermission,
  requirePermission,
  requireScope,
  ADMIN_PERMISSION_DEFINITIONS,
  HR_PERMISSION_DEFINITIONS
};

/**
 * Role-Based Access Control (RBAC) middleware
 * 
 * This module provides middleware functions for permission and role checking.
 * It supports both the new SQL-backed RBAC system and legacy permission checking
 * for backward compatibility during migration.
 */

const { getUserById } = require('../db');
const { isAdmin, isSuperAdmin, isHR } = require('./auth');

// Import RBAC service (lazy load to avoid circular dependencies)
let rbacService = null;
let rbacInitialized = false;

/**
 * Get the RBAC service instance
 */
function getRbacService() {
  if (!rbacService) {
    try {
      rbacService = require('../services/rbac');
    } catch (error) {
      console.warn('RBAC service not available:', error.message);
    }
  }
  return rbacService;
}

/**
 * Check if RBAC service is initialized and ready
 */
function isRbacReady() {
  const service = getRbacService();
  if (!service) return false;
  
  try {
    // Check if RBAC tables exist by attempting a simple query
    service.getStats();
    rbacInitialized = true;
    return true;
  } catch (error) {
    return false;
  }
}

// Legacy permission definitions (kept for backward compatibility)
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

const BUSINESS_PERMISSION_DEFINITIONS = [
  { key: 'sales_inquiries_view', label: 'View Sales Inquiries', desc: 'View incoming sales and enterprise inquiries.' },
  { key: 'sales_inquiries_manage', label: 'Manage Sales Inquiries', desc: 'Assign, update, and close sales inquiries.' },
  { key: 'sales_inquiries_contact', label: 'Contact Leads', desc: 'Send communications to sales leads.' },
  { key: 'business_team_view', label: 'View Business Team', desc: 'View business team members and their assignments.' },
  { key: 'business_team_manage', label: 'Manage Business Team', desc: 'Add, remove, and manage business team members.' },
  { key: 'enterprise_accounts', label: 'Enterprise Accounts', desc: 'Manage enterprise customer accounts.' },
  { key: 'sales_analytics', label: 'Sales Analytics', desc: 'View sales metrics and reports.' },
  { key: 'contract_management', label: 'Contract Management', desc: 'Create and manage contracts.' },
  { key: 'pricing_customization', label: 'Pricing Customization', desc: 'Create custom pricing for enterprise clients.' },
  { key: 'partner_management', label: 'Partner Management', desc: 'Manage partner relationships and programs.' },
  { key: 'revenue_reports', label: 'Revenue Reports', desc: 'Access revenue and financial reports.' },
  { key: 'customer_success', label: 'Customer Success', desc: 'Manage customer success activities.' }
];

/**
 * Check if user has specific permission using new RBAC system with legacy fallback
 * @param {Object} user - User object or user ID
 * @param {string} permission - Permission key to check
 * @param {Object} options - Optional settings (scope, etc.)
 * @returns {boolean}
 */
function hasPermission(user, permission, options = {}) {
  if (!user) return false;
  
  // Get user object if ID was passed
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return false;
  
  // Super admins always have all permissions
  if (isSuperAdmin(userObj)) return true;
  
  // Try new RBAC system first
  if (isRbacReady()) {
    try {
      const service = getRbacService();
      
      // Try exact permission name match
      if (service.hasPermission(userObj.id, permission, options)) {
        return true;
      }
      
      // Try with module prefix (e.g., 'manage_users' -> 'admin.manage_users')
      const prefixedVariants = [
        `admin.${permission}`,
        `hr.${permission}`,
        `business.${permission}`,
        `content.${permission}`
      ];
      
      for (const variant of prefixedVariants) {
        if (service.hasPermission(userObj.id, variant, options)) {
          return true;
        }
      }
    } catch (error) {
      console.warn('RBAC permission check failed, falling back to legacy:', error.message);
    }
  }
  
  // Legacy fallback: check admin_permissions JSON field
  try {
    const perms = userObj.admin_permissions ? JSON.parse(userObj.admin_permissions) : [];
    return Array.isArray(perms) && perms.includes(permission);
  } catch {
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
function hasAnyPermission(user, permissions, options = {}) {
  if (!user) return false;
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return false;
  
  if (isSuperAdmin(userObj)) return true;
  
  return permissions.some(perm => hasPermission(userObj, perm, options));
}

/**
 * Check if user has all of the specified permissions
 */
function hasAllPermissions(user, permissions, options = {}) {
  if (!user) return false;
  if (!Array.isArray(permissions) || permissions.length === 0) return true;
  
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return false;
  
  if (isSuperAdmin(userObj)) return true;
  
  return permissions.every(perm => hasPermission(userObj, perm, options));
}

/**
 * Check if user has a specific role
 */
function hasRole(user, roleName) {
  if (!user) return false;
  
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return false;
  
  // Try new RBAC system first
  if (isRbacReady()) {
    try {
      const service = getRbacService();
      return service.hasRole(userObj.id, roleName);
    } catch (error) {
      console.warn('RBAC role check failed, falling back to legacy:', error.message);
    }
  }
  
  // Legacy fallback: check role field
  return userObj.role === roleName;
}

/**
 * Get all effective permissions for a user
 */
function getEffectivePermissions(user, options = {}) {
  if (!user) return [];
  
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return [];
  
  // Try new RBAC system first
  if (isRbacReady()) {
    try {
      const service = getRbacService();
      return service.getEffectivePermissions(userObj.id, options);
    } catch (error) {
      console.warn('RBAC getEffectivePermissions failed, falling back to legacy:', error.message);
    }
  }
  
  // Legacy fallback
  const permissions = [];
  
  // Super admins have all admin permissions
  if (isSuperAdmin(userObj)) {
    ADMIN_PERMISSION_DEFINITIONS.forEach(p => {
      permissions.push({ name: p.key, displayName: p.label, description: p.desc, source: 'role' });
    });
    HR_PERMISSION_DEFINITIONS.forEach(p => {
      permissions.push({ name: p.key, displayName: p.label, description: p.desc, source: 'role' });
    });
    BUSINESS_PERMISSION_DEFINITIONS.forEach(p => {
      permissions.push({ name: p.key, displayName: p.label, description: p.desc, source: 'role' });
    });
    return permissions;
  }
  
  // Parse admin_permissions JSON
  try {
    const perms = userObj.admin_permissions ? JSON.parse(userObj.admin_permissions) : [];
    if (Array.isArray(perms)) {
      perms.forEach(key => {
        const adminDef = ADMIN_PERMISSION_DEFINITIONS.find(p => p.key === key);
        const hrDef = HR_PERMISSION_DEFINITIONS.find(p => p.key === key);
        const bizDef = BUSINESS_PERMISSION_DEFINITIONS.find(p => p.key === key);
        const def = adminDef || hrDef || bizDef;
        
        if (def) {
          permissions.push({ name: key, displayName: def.label, description: def.desc, source: 'legacy' });
        } else {
          permissions.push({ name: key, source: 'legacy' });
        }
      });
    }
  } catch {
    // Ignore parse errors
  }
  
  return permissions;
}

/**
 * Get all roles for a user
 */
function getUserRoles(user) {
  if (!user) return [];
  
  const userObj = typeof user === 'number' ? getUserById(user) : user;
  if (!userObj) return [];
  
  // Try new RBAC system first
  if (isRbacReady()) {
    try {
      const service = getRbacService();
      return service.getUserRoles(userObj.id);
    } catch (error) {
      console.warn('RBAC getUserRoles failed, falling back to legacy:', error.message);
    }
  }
  
  // Legacy fallback: return role field as single-element array
  if (userObj.role) {
    return [{ name: userObj.role, displayName: userObj.role, source: 'legacy' }];
  }
  
  return [];
}

/**
 * Middleware factory for permission checking
 */
function requirePermission(permission, options = {}) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    
    if (!hasPermission(user, permission, options)) {
      // Log the failed permission check for audit
      if (isRbacReady() && user) {
        try {
          const service = getRbacService();
          service.createAuditLog({
            action: 'permission.denied',
            actorId: user.id,
            targetType: 'permission',
            targetName: permission,
            metadata: { path: req.path, method: req.method },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            sessionId: req.sessionID
          });
        } catch (error) {
          // Ignore audit log failures
        }
      }
      
      // Return appropriate response based on request type
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Insufficient permissions', permission });
      }
      return res.redirect('/dashboard?error=Insufficient+permissions');
    }
    
    next();
  };
}

/**
 * Middleware factory for requiring any of the specified permissions
 */
function requireAnyPermission(permissions, options = {}) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    
    if (!hasAnyPermission(user, permissions, options)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Insufficient permissions', requiredAny: permissions });
      }
      return res.redirect('/dashboard?error=Insufficient+permissions');
    }
    
    next();
  };
}

/**
 * Middleware factory for requiring all specified permissions
 */
function requireAllPermissions(permissions, options = {}) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    
    if (!hasAllPermissions(user, permissions, options)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Insufficient permissions', requiredAll: permissions });
      }
      return res.redirect('/dashboard?error=Insufficient+permissions');
    }
    
    next();
  };
}

/**
 * Middleware factory for role checking
 */
function requireRole(roleName) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    
    if (!hasRole(user, roleName)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Role required', role: roleName });
      }
      return res.redirect('/dashboard?error=Insufficient+permissions');
    }
    
    next();
  };
}

/**
 * Middleware factory for scope checking (legacy HR scopes)
 */
function requireScope(scope) {
  return (req, res, next) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    
    if (!user || !isHR(user)) {
      return res.status(403).json({ error: 'HR access required' });
    }
    
    // Check for scope in new RBAC system
    if (isRbacReady()) {
      try {
        const service = getRbacService();
        // Scopes are stored as role assignments with scope field
        const userRoles = service.getUserRoles(user.id);
        const hasScope = userRoles.some(r => r.scope === scope);
        
        if (hasScope) {
          return next();
        }
      } catch (error) {
        // Fall through to legacy check
      }
    }
    
    // Legacy fallback
    try {
      const scopes = user.admin_scopes ? JSON.parse(user.admin_scopes) : [];
      const scopeArray = Array.isArray(scopes) ? scopes : (scopes.scopes || []);
      
      if (!scopeArray.includes(scope)) {
        return res.status(403).json({ error: `Scope '${scope}' required` });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid scope configuration' });
    }
    
    next();
  };
}

/**
 * Middleware to attach RBAC context to request
 */
function attachRbacContext(req, res, next) {
  if (req.session.userId) {
    const user = getUserById(req.session.userId);
    
    if (user) {
      // Attach RBAC helper functions to request
      req.rbac = {
        hasPermission: (perm, opts) => hasPermission(user, perm, opts),
        hasAnyPermission: (perms, opts) => hasAnyPermission(user, perms, opts),
        hasAllPermissions: (perms, opts) => hasAllPermissions(user, perms, opts),
        hasRole: (role) => hasRole(user, role),
        getEffectivePermissions: (opts) => getEffectivePermissions(user, opts),
        getUserRoles: () => getUserRoles(user)
      };
      
      // Also attach to response locals for templates
      res.locals.rbac = req.rbac;
    }
  }
  
  next();
}

module.exports = {
  // Permission checking functions
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  getEffectivePermissions,
  getUserRoles,
  
  // Middleware factories
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireRole,
  requireScope,
  attachRbacContext,
  
  // RBAC service access
  getRbacService,
  isRbacReady,
  
  // Legacy permission definitions (for backward compatibility)
  ADMIN_PERMISSION_DEFINITIONS,
  HR_PERMISSION_DEFINITIONS,
  BUSINESS_PERMISSION_DEFINITIONS
};

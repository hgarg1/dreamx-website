/**
 * RBAC Admin Dashboard Routes
 * 
 * Provides enhanced admin dashboard functionality:
 * - Role management with inheritance visualization
 * - Permission group management
 * - User-role assignment with bulk operations
 * - Version history and diff views
 * - Active overrides with expiration timers
 * - System audit logs viewer
 * - Security alerts and analytics
 * - AI permission manifest
 * - Developer tools (when in development mode)
 */

const express = require('express');
const router = express.Router();

// Import dependencies
const { getUserById } = require('../../db');
const rbacService = require('../../services/rbac');
const { hasPermission, isRbacReady } = require('../../middleware/rbac');
const { isSuperAdmin, isAdmin, isGlobalAdmin } = require('../../middleware/auth');
const sqlCompat = require('../../db/sql-compat');

// Import extended services
let rbacCache, rbacAnalytics, rbacMigration, rbacDevtools;
try {
  rbacCache = require('../../services/rbac-cache');
  rbacAnalytics = require('../../services/rbac-analytics');
  rbacMigration = require('../../services/rbac-migration');
  rbacDevtools = require('../../services/rbac-devtools');
} catch (e) {
  console.warn('Some RBAC extended services not available:', e.message);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Ensure RBAC service is initialized
 */
function ensureRbacReady(req, res, next) {
  try {
    if (!isRbacReady()) {
      return res.status(503).json({ error: 'RBAC service not available' });
    }
    next();
  } catch (error) {
    return res.status(503).json({ error: 'RBAC service not available', message: error.message });
  }
}

/**
 * Require RBAC dashboard access
 */
function requireRbacDashboardAccess(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  
  if (!user) {
    return res.redirect('/login');
  }
  
  // Super admins and global admins always have access
  if (isSuperAdmin(user) || isGlobalAdmin(user)) {
    req.rbacUser = user;
    return next();
  }
  
  // Check for RBAC view permissions
  if (hasPermission(user, 'rbac.roles.view') || 
      hasPermission(user, 'rbac.permissions.view') ||
      hasPermission(user, 'manage_admins')) {
    req.rbacUser = user;
    return next();
  }
  
  return res.redirect('/admin?error=RBAC+dashboard+access+required');
}

/**
 * Require RBAC management access
 */
function requireRbacManagement(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (isSuperAdmin(user) || isGlobalAdmin(user)) {
    req.rbacUser = user;
    return next();
  }
  
  if (hasPermission(user, 'rbac.roles.edit') || hasPermission(user, 'rbac.permissions.edit')) {
    req.rbacUser = user;
    return next();
  }
  
  return res.status(403).json({ error: 'RBAC management access required' });
}

// =============================================================================
// DASHBOARD VIEWS
// =============================================================================

/**
 * Main RBAC Dashboard
 */
router.get('/dashboard', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const stats = rbacService.getStats();
    const roles = rbacService.getRoles({ includeDisabled: false });
    const groups = rbacService.getPermissionGroups({ includeDisabled: false });
    
    // Get recent audit logs
    let recentLogs = [];
    try {
      recentLogs = rbacService.getAuditLogs({ limit: 20 });
    } catch (e) {
      console.warn('Failed to get audit logs:', e.message);
    }
    
    // Get security alerts if available
    let alerts = [];
    if (rbacAnalytics && rbacAnalytics.securityAlerts) {
      try {
        alerts = rbacAnalytics.securityAlerts.getAlerts();
      } catch (e) {
        console.warn('Failed to get security alerts:', e.message);
      }
    }
    
    // Get cache stats if available
    let cacheStats = null;
    if (rbacCache && rbacCache.cache) {
      cacheStats = rbacCache.cache.getStats();
    }
    
    res.render('rbac/rbac-dashboard', {
      title: 'RBAC Dashboard - Dream X',
      currentPage: 'admin',
      activePage: 'dashboard',
      authUser: req.rbacUser,
      stats,
      roles,
      groups,
      recentLogs,
      alerts,
      cacheStats,
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.roles.edit')
    });
  } catch (error) {
    console.error('RBAC Dashboard error:', error);
    res.redirect('/admin?error=Failed+to+load+RBAC+dashboard');
  }
});

/**
 * Role Management Page
 */
router.get('/roles', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const { includeDisabled, includeDeleted, search } = req.query;
    
    const roles = rbacService.getRoles({
      includeDisabled: includeDisabled === 'true',
      includeDeleted: includeDeleted === 'true',
      search: search || null
    });
    
    // Build inheritance tree
    const roleTree = buildRoleTree(roles);
    
    res.render('rbac/rbac-roles', {
      title: 'Role Management - Dream X',
      currentPage: 'admin',
      activePage: 'roles',
      authUser: req.rbacUser,
      roles,
      roleTree,
      filters: { includeDisabled, includeDeleted, search },
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.roles.edit')
    });
  } catch (error) {
    console.error('Role management error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+roles');
  }
});

/**
 * Role Detail/Edit Page
 */
router.get('/roles/:id', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const role = rbacService.getRoleById(roleId);
    
    if (!role) {
      return res.redirect('/rbac/roles?error=Role+not+found');
    }
    
    const permissions = rbacService.getRolePermissions(roleId, { includeInherited: true });
    const directPermissions = rbacService.getRolePermissions(roleId, { includeInherited: false });
    const inheritanceChain = rbacService.getRoleInheritanceChain(roleId);
    const history = rbacService.getVersionHistory('role', roleId, { limit: 20 });
    
    // Get all permissions for assignment UI
    const allPermissions = rbacService.getPermissions();
    const permissionGroups = rbacService.getPermissionGroups();
    
    // Get users with this role
    let usersWithRole = [];
    try {
      usersWithRole = rbacService.getUsersWithRole(roleId, { limit: 50 });
    } catch (e) {
      console.warn('Failed to get users with role:', e.message);
    }
    
    res.render('rbac/rbac-role-detail', {
      activePage: 'roles',
      title: `${role.display_name || role.name} - Role Details - Dream X`,
      currentPage: 'admin',
      authUser: req.rbacUser,
      role,
      permissions,
      directPermissions,
      inheritanceChain,
      history,
      allPermissions,
      permissionGroups,
      usersWithRole,
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.roles.edit')
    });
  } catch (error) {
    console.error('Role detail error:', error);
    res.redirect('/rbac/roles?error=Failed+to+load+role');
  }
});

/**
 * Permission Groups Page
 */
router.get('/permissions', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const { groupId, module, includeDisabled, search } = req.query;
    
    const groups = rbacService.getPermissionGroups({
      includeDisabled: includeDisabled === 'true'
    });
    
    const permissions = rbacService.getPermissions({
      groupId: groupId ? parseInt(groupId) : null,
      module: module || null,
      includeDisabled: includeDisabled === 'true',
      search: search || null
    });
    
    // Get unique modules
    const modules = [...new Set(permissions.map(p => p.module).filter(Boolean))];
    
    res.render('rbac/rbac-permissions', {
      activePage: 'permissions',
      title: 'Permission Management - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      groups,
      permissions,
      modules,
      filters: { groupId, module, includeDisabled, search },
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.permissions.edit')
    });
  } catch (error) {
    console.error('Permission management error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+permissions');
  }
});

/**
 * User-Role Assignment Page
 */
router.get('/users', requireRbacDashboardAccess, ensureRbacReady, async (req, res) => {
  try {
    const { search, role, page } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = 50;
    
    // Get users with their roles
    const { db } = require('../../db');
    let users = [];
    let total = 0;
    
    let query = `
      SELECT u.id, u.full_name, u.email, u.role as legacy_role, u.created_at
      FROM users u
    `;
    const params = [];
    
    if (search) {
      query += ` WHERE (u.full_name LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    const { sql, limit: offsetVal, offset: fetchVal } = sqlCompat.convertLimitOffset(query, pageSize, (pageNum - 1) * pageSize);
    
    users = await db.prepare(sql).all(...params, offsetVal, fetchVal) || [];
    
    // Get RBAC roles for each user
    for (const user of users) {
      user.rbacRoles = rbacService.getUserRoles(user.id);
    }
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users';
    if (search) {
      countQuery += ` WHERE (full_name LIKE ? OR email LIKE ?)`;
      const totalRow = await db.prepare(countQuery).get(`%${search}%`, `%${search}%`);
      total = totalRow ? totalRow.count : 0;
    } else {
      const totalRow = await db.prepare(countQuery).get();
      total = totalRow ? totalRow.count : 0;
    }
    
    // Get all roles for assignment dropdown
    const allRoles = rbacService.getRoles({ includeDisabled: false });
    
    res.render('rbac/rbac-users', {
      activePage: 'users',
      title: 'User-Role Assignment - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      users,
      allRoles,
      pagination: {
        page: pageNum,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      },
      filters: { search, role },
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.roles.assign')
    });
  } catch (error) {
    console.error('User assignment error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+users');
  }
});

/**
 * Active Overrides Page
 */
router.get('/overrides', requireRbacDashboardAccess, ensureRbacReady, async (req, res) => {
  try {
    const { includeExpired, userId } = req.query;
    const { db } = require('../../db');
    
    let query = `
      SELECT uo.*, p.name as permission_name, p.display_name as permission_display_name,
             u.full_name as user_name, u.email as user_email,
             g.full_name as granted_by_name
      FROM rbac_user_overrides uo
      JOIN rbac_permissions p ON p.id = uo.permission_id
      JOIN users u ON u.id = uo.user_id
      LEFT JOIN users g ON g.id = uo.granted_by
    `;
    
    const conditions = [];
    const params = [];
    
    if (includeExpired !== 'true') {
      conditions.push(`(uo.expires_at IS NULL OR uo.expires_at > CURRENT_TIMESTAMP)`);
    }
    
    if (userId) {
      conditions.push(`uo.user_id = ?`);
      params.push(parseInt(userId));
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY uo.expires_at IS NULL, uo.expires_at ASC, uo.granted_at DESC`;
    
    const overrides = await db.prepare(query).all(...params) || [];
    
    // Categorize overrides
    const expiringWithin24h = overrides.filter(o => {
      if (!o.expires_at) return false;
      const expires = new Date(o.expires_at);
      const now = new Date();
      const diff = expires - now;
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    });
    
    res.render('rbac/rbac-overrides', {
      activePage: 'overrides',
      title: 'Active Overrides - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      overrides,
      expiringWithin24h,
      filters: { includeExpired, userId },
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.overrides.manage')
    });
  } catch (error) {
    console.error('Overrides page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+overrides');
  }
});

/**
 * Version History Page
 */
router.get('/history', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const { entityType, entityId, page } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = 50;
    
    const history = rbacService.getVersionHistory(
      entityType || null,
      entityId ? parseInt(entityId) : null,
      { limit: pageSize, offset: (pageNum - 1) * pageSize }
    );
    
    res.render('rbac/rbac-history', {
      activePage: 'history',
      title: 'Version History - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      history,
      filters: { entityType, entityId },
      pagination: { page: pageNum, pageSize }
    });
  } catch (error) {
    console.error('History page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+history');
  }
});

/**
 * Audit Logs Page
 */
router.get('/audit', requireRbacDashboardAccess, ensureRbacReady, async (req, res) => {
  try {
    const { action, actorId, targetType, startDate, endDate, page } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = 100;
    
    const logs = rbacService.getAuditLogs({
      action: action || null,
      actorId: actorId ? parseInt(actorId) : null,
      targetType: targetType || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: pageSize,
      offset: (pageNum - 1) * pageSize
    });
    
    // Get unique actions for filter dropdown
    const { db } = require('../../db');
    const actionRows = await db.prepare(`
      SELECT DISTINCT action FROM rbac_audit_logs ORDER BY action
    `).all();
    const uniqueActions = (Array.isArray(actionRows) ? actionRows : (actionRows?.rows || [])).map(r => r.action);
    
    res.render('rbac/rbac-audit', {
      activePage: 'audit',
      title: 'RBAC Audit Logs - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      logs,
      uniqueActions,
      filters: { action, actorId, targetType, startDate, endDate },
      pagination: { page: pageNum, pageSize }
    });
  } catch (error) {
    console.error('Audit page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+audit+logs');
  }
});

// =============================================================================
// ANALYTICS & SECURITY
// =============================================================================

/**
 * Security Alerts Page
 */
router.get('/security', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    let alerts = [];
    let suggestions = null;
    
    if (rbacAnalytics) {
      alerts = rbacAnalytics.securityAlerts.getAlerts();
      suggestions = rbacAnalytics.suggestionEngine.getFullReport();
    }
    
    res.render('rbac/rbac-security', {
      activePage: 'security',
      title: 'Security & Analytics - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      alerts,
      suggestions,
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser)
    });
  } catch (error) {
    console.error('Security page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+security');
  }
});

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generated Documentation Page
 */
router.get('/docs', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    let documentation = null;
    let changelog = null;
    
    if (rbacAnalytics) {
      documentation = rbacAnalytics.DocumentationGenerator.generate();
      changelog = rbacAnalytics.DocumentationGenerator.generateChangelog({ limit: 50 });
    }
    
    res.render('rbac/rbac-docs', {
      activePage: 'docs',
      title: 'RBAC Documentation - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      documentation,
      changelog
    });
  } catch (error) {
    console.error('Docs page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+generate+documentation');
  }
});

// =============================================================================
// MIGRATION TOOLS
// =============================================================================

/**
 * Migration Status Page
 */
router.get('/migration', requireRbacManagement, ensureRbacReady, (req, res) => {
  // Only allow in development mode or for global admins
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isGlobalAdmin(req.rbacUser)) {
    return res.redirect('/rbac/dashboard?error=Migration+tools+not+available+in+production');
  }
  
  try {
    let migrationReport = null;
    let codeScanResults = null;
    let recommendations = [];
    
    if (rbacMigration) {
      migrationReport = rbacMigration.LegacyMigration.generateReport();
      
      // Only run code scan if explicitly requested (it's slow)
      if (req.query.scan === 'true') {
        codeScanResults = rbacMigration.codeScanner.scanCodebase();
        recommendations = rbacMigration.codeScanner.getRecommendations(codeScanResults);
      }
    }
    
    res.render('rbac/rbac-migration', {
      activePage: 'migration',
      title: 'RBAC Migration - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      migrationReport,
      codeScanResults,
      recommendations,
      scanRequested: req.query.scan === 'true'
    });
  } catch (error) {
    console.error('Migration page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+migration+status');
  }
});

/**
 * Run migration for unmigrated users
 */
router.post('/migration/run', requireRbacManagement, ensureRbacReady, (req, res) => {
  // Only allow in development mode or for global admins
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isGlobalAdmin(req.rbacUser)) {
    return res.status(403).json({ error: 'Migration not available in production' });
  }
  
  try {
    if (!rbacMigration) {
      return res.status(503).json({ error: 'Migration service not available' });
    }
    
    const { userId } = req.body;
    
    if (userId) {
      // Migrate single user
      const result = rbacMigration.LegacyMigration.migrateUser(parseInt(userId));
      return res.json(result);
    } else {
      // Migrate all unmigrated users
      const result = rbacMigration.LegacyMigration.migrateAllUsers();
      return res.json(result);
    }
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', message: error.message });
  }
});

// =============================================================================
// DEVELOPER TOOLS (only in development mode)
// =============================================================================

/**
 * Developer Tools Page
 */
router.get('/devtools', requireRbacManagement, ensureRbacReady, (req, res) => {
  // Only allow in development mode or for global admins
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isGlobalAdmin(req.rbacUser)) {
    return res.redirect('/rbac/dashboard?error=Developer+tools+not+available');
  }
  
  try {
    let validationResults = null;
    let cacheStats = null;
    
    if (rbacDevtools) {
      validationResults = rbacDevtools.ValidationSuite.runFullValidation();
    }
    
    if (rbacCache && rbacCache.cache) {
      cacheStats = rbacCache.cache.getStats();
    }
    
    res.render('rbac/rbac-devtools', {
      activePage: 'devtools',
      title: 'RBAC Developer Tools - Dream X',
      currentPage: 'admin',
      authUser: req.rbacUser,
      validationResults,
      cacheStats,
      isDevelopment: isDev
    });
  } catch (error) {
    console.error('Devtools page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+developer+tools');
  }
});

/**
 * Create test users
 */
router.post('/devtools/seed-users', requireRbacManagement, ensureRbacReady, (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isGlobalAdmin(req.rbacUser)) {
    return res.status(403).json({ error: 'Not available in production' });
  }
  
  try {
    if (!rbacDevtools) {
      return res.status(503).json({ error: 'Dev tools not available' });
    }
    
    const users = rbacDevtools.testUserSeeder.createTestUserSet();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to seed users', message: error.message });
  }
});

/**
 * Cleanup test users
 */
router.post('/devtools/cleanup-users', requireRbacManagement, ensureRbacReady, (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isGlobalAdmin(req.rbacUser)) {
    return res.status(403).json({ error: 'Not available in production' });
  }
  
  try {
    if (!rbacDevtools) {
      return res.status(503).json({ error: 'Dev tools not available' });
    }
    
    const result = rbacDevtools.testUserSeeder.cleanupTestUsers();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cleanup users', message: error.message });
  }
});

/**
 * Invalidate RBAC cache
 */
router.post('/devtools/invalidate-cache', requireRbacManagement, ensureRbacReady, (req, res) => {
  try {
    if (rbacCache && rbacCache.cache) {
      rbacCache.cache.invalidateAll();
      res.json({ success: true, message: 'Cache invalidated' });
    } else {
      res.json({ success: false, message: 'Cache not available' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to invalidate cache', message: error.message });
  }
});

/**
 * Take RBAC snapshot
 */
router.post('/devtools/snapshot', requireRbacManagement, ensureRbacReady, (req, res) => {
  try {
    if (!rbacDevtools) {
      return res.status(503).json({ error: 'Dev tools not available' });
    }
    
    const snapshot = rbacDevtools.MismatchDetector.takeSnapshot();
    res.json({ success: true, snapshot });
  } catch (error) {
    res.status(500).json({ error: 'Failed to take snapshot', message: error.message });
  }
});

// =============================================================================
// API ENDPOINTS FOR DASHBOARD AJAX
// =============================================================================

/**
 * Get role inheritance tree as JSON
 */
router.get('/api/roles/tree', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const roles = rbacService.getRoles({ includeDisabled: false });
    const tree = buildRoleTree(roles);
    res.json({ success: true, tree });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get role tree', message: error.message });
  }
});

/**
 * Get permission diff between versions
 */
router.get('/api/versions/:id/diff', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const versionId = parseInt(req.params.id);
    const { db } = require('../../db');
    
    // Get the version
    const version = db.prepare(`
      SELECT * FROM rbac_versions WHERE id = ?
    `).get(versionId);
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    // Get previous version
    const previousVersion = db.prepare(`
      SELECT * FROM rbac_versions 
      WHERE entity_type = ? AND entity_id = ? AND id < ?
      ORDER BY id DESC LIMIT 1
    `).get(version.entity_type, version.entity_id, versionId);
    
    const current = JSON.parse(version.snapshot);
    const previous = previousVersion ? JSON.parse(previousVersion.snapshot) : null;
    
    res.json({
      success: true,
      version,
      current,
      previous,
      diff: generateDiff(previous, current)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get diff', message: error.message });
  }
});

/**
 * Bulk operations preview
 */
router.post('/api/bulk/preview', requireRbacManagement, ensureRbacReady, (req, res) => {
  try {
    const { operation, targets, data } = req.body;
    
    const preview = {
      operation,
      affectedCount: targets.length,
      changes: []
    };
    
    for (const targetId of targets) {
      let change = { targetId };
      
      switch (operation) {
        case 'assign_role':
          const user = getUserById(targetId);
          change.target = user?.email;
          change.description = `Assign role "${data.roleName}" to ${user?.full_name}`;
          break;
        case 'revoke_role':
          const user2 = getUserById(targetId);
          change.target = user2?.email;
          change.description = `Revoke role "${data.roleName}" from ${user2?.full_name}`;
          break;
        case 'grant_permission':
          const role = rbacService.getRoleById(targetId);
          change.target = role?.name;
          change.description = `Grant permission "${data.permissionName}" to role ${role?.display_name}`;
          break;
      }
      
      preview.changes.push(change);
    }
    
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate preview', message: error.message });
  }
});

/**
 * Execute bulk operation
 */
router.post('/api/bulk/execute', requireRbacManagement, ensureRbacReady, (req, res) => {
  try {
    const { operation, targets, data } = req.body;
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const targetId of targets) {
      try {
        switch (operation) {
          case 'assign_role':
            rbacService.assignRoleToUser(targetId, data.roleId, {
              assignedBy: req.rbacUser.id
            });
            break;
          case 'revoke_role':
            rbacService.revokeRoleFromUser(targetId, data.roleId, req.rbacUser.id);
            break;
          case 'grant_permission':
            rbacService.assignPermissionToRole(targetId, data.permissionId, {
              grantedBy: req.rbacUser.id
            });
            break;
          case 'revoke_permission':
            rbacService.revokePermissionFromRole(targetId, data.permissionId, req.rbacUser.id);
            break;
        }
        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({ targetId, error: e.message });
      }
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: 'Bulk operation failed', message: error.message });
  }
});

/**
 * Get AI permission manifest
 */
router.get('/api/manifest', requireRbacDashboardAccess, ensureRbacReady, async (req, res) => {
  try {
    if (!rbacAnalytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }
    
    const manifest = await rbacAnalytics.AIPermissionManifest.generate();
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate manifest', message: error.message });
  }
});

// =============================================================================
// ROLE COMPARISON PAGE
// =============================================================================

/**
 * Role Comparison Page
 */
router.get('/compare', requireRbacDashboardAccess, ensureRbacReady, (req, res) => {
  try {
    const { role1, role2 } = req.query;
    const allRoles = rbacService.getRoles({ includeDisabled: false });
    
    let comparison = null;
    if (role1 && role2) {
      try {
        comparison = rbacService.compareRoles(parseInt(role1), parseInt(role2));
      } catch (e) {
        console.warn('Role comparison failed:', e.message);
      }
    }
    
    res.render('rbac/rbac-compare', {
      title: 'Role Comparison - Dream X',
      currentPage: 'admin',
      activePage: 'compare',
      authUser: req.rbacUser,
      allRoles,
      comparison,
      selectedRole1: role1 ? parseInt(role1) : null,
      selectedRole2: role2 ? parseInt(role2) : null,
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser) || hasPermission(req.rbacUser, 'rbac.roles.edit')
    });
  } catch (error) {
    console.error('Role comparison page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+comparison+page');
  }
});

// =============================================================================
// CLEANUP TOOLS PAGE
// =============================================================================

/**
 * Cleanup Tools Page
 */
router.get('/cleanup', requireRbacManagement, ensureRbacReady, (req, res) => {
  try {
    const expiredCounts = rbacService.getExpiredItemsCount();
    
    // Get recent cleanup audit logs
    let cleanupHistory = [];
    try {
      cleanupHistory = rbacService.getAuditLogs({
        action: 'batch.cleanup',
        limit: 20
      });
    } catch (e) {
      // Try broader search
      try {
        const allLogs = rbacService.getAuditLogs({ limit: 100 });
        cleanupHistory = allLogs.filter(log => log.action && log.action.startsWith('batch.cleanup'));
      } catch (e2) {
        console.warn('Failed to get cleanup history:', e2.message);
      }
    }
    
    res.render('rbac/rbac-cleanup', {
      title: 'RBAC Cleanup Tools - Dream X',
      currentPage: 'admin',
      activePage: 'cleanup',
      authUser: req.rbacUser,
      expiredCounts,
      cleanupHistory,
      canManage: isSuperAdmin(req.rbacUser) || isGlobalAdmin(req.rbacUser)
    });
  } catch (error) {
    console.error('Cleanup tools page error:', error);
    res.redirect('/rbac/dashboard?error=Failed+to+load+cleanup+tools');
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build role tree for visualization
 */
function buildRoleTree(roles) {
  const roleMap = new Map();
  const roots = [];
  
  // Index by ID
  for (const role of roles) {
    roleMap.set(role.id, { ...role, children: [] });
  }
  
  // Build tree
  for (const role of roles) {
    const node = roleMap.get(role.id);
    if (role.parent_role_id && roleMap.has(role.parent_role_id)) {
      roleMap.get(role.parent_role_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  
  return roots;
}

/**
 * Generate diff between two snapshots
 */
function generateDiff(previous, current) {
  if (!previous) {
    return { type: 'created', changes: current };
  }
  
  const diff = { type: 'modified', changes: {} };
  
  for (const key of Object.keys(current)) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      diff.changes[key] = {
        before: previous[key],
        after: current[key]
      };
    }
  }
  
  for (const key of Object.keys(previous)) {
    if (!(key in current)) {
      diff.changes[key] = {
        before: previous[key],
        after: undefined
      };
    }
  }
  
  return diff;
}

module.exports = router;

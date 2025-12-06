/**
 * RBAC Admin API Routes
 * 
 * Provides administrative APIs for managing the RBAC system:
 * - Role management (CRUD, enable/disable, soft delete/restore)
 * - Permission management
 * - User role assignments
 * - User permission overrides
 * - Bulk operations
 * - Audit logs and version history
 * - Search and filter capabilities
 */

const express = require('express');
const router = express.Router();

const { getUserById } = require('../../db');
const rbacService = require('../../services/rbac');
const { requirePermission, requireAnyPermission, hasPermission } = require('../../middleware/rbac');
const { isSuperAdmin, isAdmin } = require('../../middleware/auth');

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Ensure RBAC service is initialized
 */
function ensureRbacReady(req, res, next) {
  try {
    rbacService.getStats();
    next();
  } catch (error) {
    return res.status(503).json({ error: 'RBAC service not available', message: error.message });
  }
}

/**
 * Require RBAC admin access
 */
function requireRbacAdmin(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Super admins always have access
  if (isSuperAdmin(user)) {
    return next();
  }
  
  // Check for RBAC management permissions
  if (hasPermission(user, 'rbac.roles.view') || 
      hasPermission(user, 'rbac.permissions.view') ||
      hasPermission(user, 'manage_admins')) {
    return next();
  }
  
  return res.status(403).json({ error: 'RBAC admin access required' });
}

/**
 * Require full RBAC management access
 */
function requireRbacManager(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (isSuperAdmin(user)) {
    return next();
  }
  
  // Check for full RBAC management permissions
  if (hasPermission(user, 'rbac.roles.edit') || hasPermission(user, 'rbac.permissions.edit')) {
    return next();
  }
  
  return res.status(403).json({ error: 'RBAC management access required' });
}

// Apply middleware to all routes
router.use(ensureRbacReady);
router.use(requireRbacAdmin);

// =============================================================================
// DASHBOARD AND STATS
// =============================================================================

/**
 * Get RBAC dashboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = rbacService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

/**
 * Search roles, permissions, and users
 */
router.get('/search', (req, res) => {
  try {
    const { q, types, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const results = rbacService.search(q, {
      types: types ? types.split(',') : ['role', 'permission', 'user'],
      limit: parseInt(limit) || 20
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// =============================================================================
// ROLE MANAGEMENT
// =============================================================================

/**
 * Get all roles
 */
router.get('/roles', (req, res) => {
  try {
    const { includeDisabled, includeDeleted, search, limit, offset } = req.query;
    
    const roles = rbacService.getRoles({
      includeDisabled: includeDisabled === 'true',
      includeDeleted: includeDeleted === 'true',
      search: search || null,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    res.json({ success: true, roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get roles', message: error.message });
  }
});

/**
 * Get a specific role
 */
router.get('/roles/:id', (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const role = rbacService.getRoleById(roleId);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Get role permissions
    const permissions = rbacService.getRolePermissions(roleId);
    
    // Get inheritance chain
    const inheritanceChain = rbacService.getRoleInheritanceChain(roleId);
    
    res.json({ 
      success: true, 
      role,
      permissions,
      inheritanceChain: inheritanceChain.map(r => ({ id: r.id, name: r.name, displayName: r.display_name }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get role', message: error.message });
  }
});

/**
 * Create a new role
 */
router.post('/roles', requireRbacManager, (req, res) => {
  try {
    const { name, displayName, description, priority, parentRoleId, metadata } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    const roleId = rbacService.createRole({
      name,
      displayName,
      description,
      priority: parseInt(priority) || 0,
      parentRoleId: parentRoleId ? parseInt(parentRoleId) : null,
      metadata,
      createdBy: req.session.userId
    });
    
    const role = rbacService.getRoleById(roleId);
    res.status(201).json({ success: true, role });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create role', message: error.message });
  }
});

/**
 * Update a role
 */
router.patch('/roles/:id', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const updates = req.body;
    
    const role = rbacService.updateRole(roleId, updates, req.session.userId);
    res.json({ success: true, role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update role', message: error.message });
  }
});

/**
 * Delete a role (soft delete)
 */
router.delete('/roles/:id', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    
    rbacService.deleteRole(roleId, req.session.userId);
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role', message: error.message });
  }
});

/**
 * Restore a deleted role
 */
router.post('/roles/:id/restore', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    
    const role = rbacService.restoreRole(roleId, req.session.userId);
    res.json({ success: true, role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore role', message: error.message });
  }
});

/**
 * Enable/disable a role
 */
router.post('/roles/:id/toggle', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const { enabled } = req.body;
    
    const role = rbacService.updateRole(roleId, { isEnabled: enabled }, req.session.userId);
    res.json({ success: true, role });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle role', message: error.message });
  }
});

/**
 * Get role version history
 */
router.get('/roles/:id/history', (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const { limit, offset } = req.query;
    
    const history = rbacService.getVersionHistory('role', roleId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get version history', message: error.message });
  }
});

// =============================================================================
// PERMISSION MANAGEMENT
// =============================================================================

/**
 * Get all permissions
 */
router.get('/permissions', (req, res) => {
  try {
    const { groupId, module, resource, includeDisabled, includeDeleted, search, limit, offset } = req.query;
    
    const permissions = rbacService.getPermissions({
      groupId: groupId ? parseInt(groupId) : null,
      module: module || null,
      resource: resource || null,
      includeDisabled: includeDisabled === 'true',
      includeDeleted: includeDeleted === 'true',
      search: search || null,
      limit: parseInt(limit) || 1000,
      offset: parseInt(offset) || 0
    });
    
    res.json({ success: true, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get permissions', message: error.message });
  }
});

/**
 * Get a specific permission
 */
router.get('/permissions/:id', (req, res) => {
  try {
    const permissionId = parseInt(req.params.id);
    const permission = rbacService.getPermissionById(permissionId);
    
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    
    res.json({ success: true, permission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get permission', message: error.message });
  }
});

/**
 * Create a new permission
 */
router.post('/permissions', requireRbacManager, (req, res) => {
  try {
    const { name, displayName, description, groupId, module, resource, action, requiresPermissions, metadata } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Permission name is required' });
    }
    
    const permissionId = rbacService.createPermission({
      name,
      displayName,
      description,
      groupId: groupId ? parseInt(groupId) : null,
      module,
      resource,
      action,
      requiresPermissions,
      metadata,
      createdBy: req.session.userId
    });
    
    const permission = rbacService.getPermissionById(permissionId);
    res.status(201).json({ success: true, permission });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A permission with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create permission', message: error.message });
  }
});

/**
 * Update a permission
 */
router.patch('/permissions/:id', requireRbacManager, (req, res) => {
  try {
    const permissionId = parseInt(req.params.id);
    const updates = req.body;
    
    const permission = rbacService.updatePermission(permissionId, updates, req.session.userId);
    res.json({ success: true, permission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update permission', message: error.message });
  }
});

/**
 * Delete a permission (soft delete)
 */
router.delete('/permissions/:id', requireRbacManager, (req, res) => {
  try {
    const permissionId = parseInt(req.params.id);
    
    rbacService.deletePermission(permissionId, req.session.userId);
    res.json({ success: true, message: 'Permission deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete permission', message: error.message });
  }
});

/**
 * Restore a deleted permission
 */
router.post('/permissions/:id/restore', requireRbacManager, (req, res) => {
  try {
    const permissionId = parseInt(req.params.id);
    
    const permission = rbacService.restorePermission(permissionId, req.session.userId);
    res.json({ success: true, permission });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore permission', message: error.message });
  }
});

// =============================================================================
// PERMISSION GROUPS
// =============================================================================

/**
 * Get all permission groups
 */
router.get('/groups', (req, res) => {
  try {
    const { includeDisabled, includeDeleted } = req.query;
    
    const groups = rbacService.getPermissionGroups({
      includeDisabled: includeDisabled === 'true',
      includeDeleted: includeDeleted === 'true'
    });
    
    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get permission groups', message: error.message });
  }
});

/**
 * Create a permission group
 */
router.post('/groups', requireRbacManager, (req, res) => {
  try {
    const { name, displayName, description, module, parentGroupId, displayOrder } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const groupId = rbacService.createPermissionGroup({
      name,
      displayName,
      description,
      module,
      parentGroupId: parentGroupId ? parseInt(parentGroupId) : null,
      displayOrder: parseInt(displayOrder) || 0,
      createdBy: req.session.userId
    });
    
    res.status(201).json({ success: true, groupId });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create group', message: error.message });
  }
});

// =============================================================================
// ROLE-PERMISSION ASSIGNMENTS
// =============================================================================

/**
 * Assign permission to role
 */
router.post('/roles/:roleId/permissions/:permissionId', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId);
    const permissionId = parseInt(req.params.permissionId);
    const { expiresAt, isDenied } = req.body;
    
    rbacService.assignPermissionToRole(roleId, permissionId, {
      grantedBy: req.session.userId,
      expiresAt,
      isDenied: isDenied === true
    });
    
    res.json({ success: true, message: 'Permission assigned to role' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign permission', message: error.message });
  }
});

/**
 * Revoke permission from role
 */
router.delete('/roles/:roleId/permissions/:permissionId', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId);
    const permissionId = parseInt(req.params.permissionId);
    
    rbacService.revokePermissionFromRole(roleId, permissionId, req.session.userId);
    
    res.json({ success: true, message: 'Permission revoked from role' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke permission', message: error.message });
  }
});

/**
 * Bulk assign permissions to role
 */
router.post('/roles/:roleId/permissions/bulk', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId);
    const { permissionIds, expiresAt } = req.body;
    
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'permissionIds must be an array' });
    }
    
    let success = 0;
    let failed = 0;
    
    for (const permissionId of permissionIds) {
      try {
        rbacService.assignPermissionToRole(roleId, parseInt(permissionId), {
          grantedBy: req.session.userId,
          expiresAt
        });
        success++;
      } catch (error) {
        failed++;
      }
    }
    
    res.json({ success: true, assigned: success, failed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk assign permissions', message: error.message });
  }
});

// =============================================================================
// USER ROLE ASSIGNMENTS
// =============================================================================

/**
 * Get user's roles
 */
router.get('/users/:userId/roles', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { includeExpired } = req.query;
    
    const roles = rbacService.getUserRoles(userId, {
      includeExpired: includeExpired === 'true'
    });
    
    res.json({ success: true, roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user roles', message: error.message });
  }
});

/**
 * Assign role to user
 */
router.post('/users/:userId/roles/:roleId', requireRbacManager, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const roleId = parseInt(req.params.roleId);
    const { expiresAt, isPrimary, scope } = req.body;
    
    rbacService.assignRoleToUser(userId, roleId, {
      assignedBy: req.session.userId,
      expiresAt,
      isPrimary: isPrimary === true,
      scope
    });
    
    res.json({ success: true, message: 'Role assigned to user' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role', message: error.message });
  }
});

/**
 * Revoke role from user
 */
router.delete('/users/:userId/roles/:roleId', requireRbacManager, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const roleId = parseInt(req.params.roleId);
    const { scope } = req.query;
    
    rbacService.revokeRoleFromUser(userId, roleId, req.session.userId, scope || null);
    
    res.json({ success: true, message: 'Role revoked from user' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke role', message: error.message });
  }
});

/**
 * Bulk assign role to multiple users
 */
router.post('/roles/:roleId/users/bulk', requireRbacManager, (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId);
    const { userIds, expiresAt } = req.body;
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }
    
    const result = rbacService.bulkAssignRole(userIds.map(id => parseInt(id)), roleId, {
      assignedBy: req.session.userId,
      expiresAt
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk assign role', message: error.message });
  }
});

// =============================================================================
// USER PERMISSION OVERRIDES
// =============================================================================

/**
 * Get user's permission overrides
 */
router.get('/users/:userId/overrides', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { includeExpired } = req.query;
    
    const overrides = rbacService.getUserOverrides(userId, {
      includeExpired: includeExpired === 'true'
    });
    
    res.json({ success: true, overrides });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user overrides', message: error.message });
  }
});

/**
 * Get user's effective permissions
 */
router.get('/users/:userId/permissions', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { scope } = req.query;
    
    const permissions = rbacService.getEffectivePermissions(userId, { scope });
    
    res.json({ success: true, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get effective permissions', message: error.message });
  }
});

/**
 * Grant permission override to user
 */
router.post('/users/:userId/overrides/:permissionId/grant', requireRbacManager, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const permissionId = parseInt(req.params.permissionId);
    const { isTemporary, expiresAt, reason, scope } = req.body;
    
    rbacService.grantUserOverride(userId, permissionId, {
      grantedBy: req.session.userId,
      isTemporary: isTemporary === true,
      expiresAt,
      reason,
      scope
    });
    
    res.json({ success: true, message: 'Permission granted to user' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to grant permission', message: error.message });
  }
});

/**
 * Deny permission for user
 */
router.post('/users/:userId/overrides/:permissionId/deny', requireRbacManager, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const permissionId = parseInt(req.params.permissionId);
    const { isTemporary, expiresAt, reason, scope } = req.body;
    
    rbacService.denyUserOverride(userId, permissionId, {
      grantedBy: req.session.userId,
      isTemporary: isTemporary === true,
      expiresAt,
      reason,
      scope
    });
    
    res.json({ success: true, message: 'Permission denied for user' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deny permission', message: error.message });
  }
});

/**
 * Remove permission override from user
 */
router.delete('/users/:userId/overrides/:permissionId', requireRbacManager, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const permissionId = parseInt(req.params.permissionId);
    const { scope } = req.query;
    
    rbacService.removeUserOverride(userId, permissionId, req.session.userId, scope || null);
    
    res.json({ success: true, message: 'Override removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove override', message: error.message });
  }
});

// =============================================================================
// AUDIT LOGS
// =============================================================================

/**
 * Get RBAC audit logs
 */
router.get('/audit', (req, res) => {
  try {
    const { action, actorId, targetType, targetId, affectedUserId, startDate, endDate, limit, offset } = req.query;
    
    const logs = rbacService.getAuditLogs({
      action: action || null,
      actorId: actorId ? parseInt(actorId) : null,
      targetType: targetType || null,
      targetId: targetId ? parseInt(targetId) : null,
      affectedUserId: affectedUserId ? parseInt(affectedUserId) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audit logs', message: error.message });
  }
});

// =============================================================================
// MODULE REGISTRATION
// =============================================================================

/**
 * Get registered modules
 */
router.get('/modules', (req, res) => {
  try {
    const modules = rbacService.getRegisteredModules();
    res.json({ success: true, modules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get modules', message: error.message });
  }
});

/**
 * Register a new module
 */
router.post('/modules', requireRbacManager, (req, res) => {
  try {
    const { moduleName, displayName, description, version, permissionsSchema } = req.body;
    
    if (!moduleName || !displayName) {
      return res.status(400).json({ error: 'Module name and display name are required' });
    }
    
    const moduleId = rbacService.registerModule({
      moduleName,
      displayName,
      description,
      version,
      permissionsSchema,
      createdBy: req.session.userId
    });
    
    res.status(201).json({ success: true, moduleId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register module', message: error.message });
  }
});

module.exports = router;

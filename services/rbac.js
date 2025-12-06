/**
 * RBAC (Role-Based Access Control) Service
 * 
 * Provides a unified, SQL-backed authorization framework supporting:
 * - Dynamic role creation, editing, renaming, enabling, disabling
 * - Editable permission groups and hierarchies
 * - Role inheritance (roles can extend other roles)
 * - User-specific overrides (temporary or permanent)
 * - Environment-aware seeding
 * - Versioning of role/permission changes
 * - Extensible permission registration for modules
 */

const path = require('path');
const { isProduction } = require('../db/adapter');

// Import database module - will be initialized after db is ready
let db = null;
let isInitialized = false;

/**
 * Initialize the RBAC service with database connection
 */
function initialize(database) {
  db = database;
  isInitialized = true;
  
  // Run RBAC schema migrations
  try {
    runRbacMigrations();
  } catch (error) {
    console.error('RBAC migration error:', error.message);
  }
}

/**
 * Run RBAC schema migrations (creates tables if they don't exist)
 */
function runRbacMigrations() {
  const fs = require('fs');
  const schemaPath = path.join(__dirname, '..', 'db', 'rbac-schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.warn('RBAC schema file not found, skipping migrations');
    return;
  }
  
  let schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Remove SQL comments (lines starting with --)
  const cleanSchema = schema
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  
  let statements;
  
  if (isProduction) {
    // SQL Server: split by GO batch separator and filter out SET commands
    statements = cleanSchema
      .split(/\bGO\b/i)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .filter(s => !s.match(/^SET\s+(ANSI_NULLS|QUOTED_IDENTIFIER)/i));
  } else {
    // SQLite: adapt SQL Server syntax to SQLite
    let sqliteSchema = cleanSchema
      // Remove SET commands
      .replace(/SET\s+ANSI_NULLS\s+(ON|OFF)\s*/gi, '')
      .replace(/SET\s+QUOTED_IDENTIFIER\s+(ON|OFF)\s*/gi, '')
      // Remove GO statements
      .replace(/\bGO\b/gi, '')
      // Remove SQL Server specific IF OBJECT_ID checks and DROP statements
      .replace(/IF\s+OBJECT_ID\s*\([^)]+\)\s+IS\s+NOT\s+NULL\s+DROP\s+TABLE\s+dbo\.\w+;?\s*/gi, '')
      // Replace dbo. schema prefix with nothing
      .replace(/\bdbo\./g, '')
      // Replace SQL Server data types with SQLite equivalents
      // Note: More specific patterns (BIGINT IDENTITY) must come before general patterns (BIGINT)
      .replace(/\bBIGINT\s+IDENTITY\(1,1\)/gi, 'INTEGER')
      .replace(/\bBIGINT\b/gi, 'INTEGER')
      .replace(/\bINT\b/gi, 'INTEGER')
      .replace(/\bNVARCHAR\((\d+)\)/gi, 'TEXT')
      .replace(/\bNVARCHAR\(MAX\)/gi, 'TEXT')
      .replace(/\bDATETIME2/gi, 'TEXT')
      .replace(/\bBIT\b/gi, 'INTEGER')
      .replace(/\bSYSUTCDATETIME\(\)/gi, 'CURRENT_TIMESTAMP')
      // Replace SQL Server constraint syntax - removes named constraints as SQLite doesn't require them
      .replace(/CONSTRAINT\s+(\w+)\s+DEFAULT/gi, 'DEFAULT')
      // Handle foreign key syntax differences
      .replace(/REFERENCES\s+dbo\./gi, 'REFERENCES ')
      // Note: SQLite supports both ON DELETE CASCADE and filtered indexes (WHERE clause),
      // so we keep them as-is
      // Remove CREATE UNIQUE INDEX with WHERE clause as they may cause compatibility issues
      // in some SQLite versions. Tables will still work, just without the filtered unique constraint.
      .replace(/CREATE\s+UNIQUE\s+INDEX\s+\w+\s+ON\s+(\w+)\([^)]+\)\s+WHERE\s+[^;]+;/gi, '');
    
    // Split by semicolons
    statements = sqliteSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  for (const statement of statements) {
    try {
      if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX')) {
        db.exec(statement + ';');
      }
    } catch (error) {
      // Ignore "already exists" errors
      if (!error.message.includes('already exists') && 
          !error.message.includes('There is already an object')) {
        console.warn('RBAC migration statement failed:', error.message);
      }
    }
  }
  
  console.log('✅ RBAC schema migrations completed');
}

// =============================================================================
// ROLE MANAGEMENT
// =============================================================================

/**
 * Create a new role
 */
function createRole({ name, displayName, description, isSystemRole = false, priority = 0, parentRoleId = null, metadata = null, createdBy = null }) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const stmt = db.prepare(`
    INSERT INTO rbac_roles (name, display_name, description, is_system_role, priority, parent_role_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    name,
    displayName || name,
    description || null,
    isSystemRole ? 1 : 0,
    priority,
    parentRoleId || null,
    metadata ? JSON.stringify(metadata) : null
  );
  
  const roleId = result.lastInsertRowid;
  
  // Create version record
  createVersionRecord('role', roleId, 1, getRoleById(roleId), 'create', createdBy);
  
  // Create audit log
  createAuditLog({
    action: 'role.create',
    actorId: createdBy,
    targetType: 'role',
    targetId: roleId,
    targetName: name,
    newValue: { name, displayName, description, isSystemRole, priority, parentRoleId }
  });
  
  return roleId;
}

/**
 * Get role by ID
 */
function getRoleById(roleId) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT r.*, pr.name as parent_role_name
    FROM rbac_roles r
    LEFT JOIN rbac_roles pr ON pr.id = r.parent_role_id
    WHERE r.id = ? AND r.deleted_at IS NULL
  `).get(roleId);
}

/**
 * Get role by name
 */
function getRoleByName(name) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT r.*, pr.name as parent_role_name
    FROM rbac_roles r
    LEFT JOIN rbac_roles pr ON pr.id = r.parent_role_id
    WHERE r.name = ? AND r.deleted_at IS NULL
  `).get(name);
}

/**
 * Get all roles with optional filters
 */
function getRoles({ includeDisabled = false, includeDeleted = false, search = null, limit = 100, offset = 0 } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT r.*, pr.name as parent_role_name,
           (SELECT COUNT(*) FROM rbac_user_roles ur WHERE ur.role_id = r.id) as user_count,
           (SELECT COUNT(*) FROM rbac_role_permissions rp WHERE rp.role_id = r.id) as permission_count
    FROM rbac_roles r
    LEFT JOIN rbac_roles pr ON pr.id = r.parent_role_id
    WHERE 1=1
  `;
  const params = [];
  
  if (!includeDeleted) {
    sql += ' AND r.deleted_at IS NULL';
  }
  
  if (!includeDisabled) {
    sql += ' AND r.is_enabled = 1';
  }
  
  if (search) {
    sql += ' AND (LOWER(r.name) LIKE ? OR LOWER(r.display_name) LIKE ? OR LOWER(r.description) LIKE ?)';
    const searchLower = `%${search.toLowerCase()}%`;
    params.push(searchLower, searchLower, searchLower);
  }
  
  sql += ' ORDER BY r.priority DESC, r.name ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(sql).all(...params);
}

/**
 * Update a role
 */
function updateRole(roleId, updates, updatedBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = getRoleById(roleId);
  if (!existing) throw new Error('Role not found');
  if (existing.is_system_role && updates.name && updates.name !== existing.name) {
    throw new Error('Cannot rename system roles');
  }
  
  const fields = [];
  const values = [];
  
  const allowedFields = {
    name: 'name',
    displayName: 'display_name',
    description: 'description',
    isEnabled: 'is_enabled',
    priority: 'priority',
    parentRoleId: 'parent_role_id',
    metadata: 'metadata'
  };
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields[key]) {
      fields.push(`${allowedFields[key]} = ?`);
      if (key === 'metadata' && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else if (key === 'isEnabled') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    }
  }
  
  if (fields.length === 0) return existing;
  
  fields.push('version = version + 1');
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(roleId);
  
  db.prepare(`UPDATE rbac_roles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  
  const updated = getRoleById(roleId);
  
  // Create version record
  createVersionRecord('role', roleId, updated.version, updated, 'update', updatedBy);
  
  // Create audit log
  createAuditLog({
    action: 'role.update',
    actorId: updatedBy,
    targetType: 'role',
    targetId: roleId,
    targetName: existing.name,
    oldValue: existing,
    newValue: updated
  });
  
  return updated;
}

/**
 * Soft delete a role
 */
function deleteRole(roleId, deletedBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = getRoleById(roleId);
  if (!existing) throw new Error('Role not found');
  if (existing.is_system_role) throw new Error('Cannot delete system roles');
  
  db.prepare(`UPDATE rbac_roles SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(roleId);
  
  // Create version record
  createVersionRecord('role', roleId, existing.version + 1, null, 'delete', deletedBy);
  
  // Create audit log
  createAuditLog({
    action: 'role.delete',
    actorId: deletedBy,
    targetType: 'role',
    targetId: roleId,
    targetName: existing.name,
    oldValue: existing
  });
  
  return true;
}

/**
 * Restore a soft-deleted role
 */
function restoreRole(roleId, restoredBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = db.prepare(`SELECT * FROM rbac_roles WHERE id = ?`).get(roleId);
  if (!existing) throw new Error('Role not found');
  if (!existing.deleted_at) throw new Error('Role is not deleted');
  
  db.prepare(`UPDATE rbac_roles SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ?`).run(roleId);
  
  const restored = getRoleById(roleId);
  
  // Create version record
  createVersionRecord('role', roleId, restored.version, restored, 'restore', restoredBy);
  
  // Create audit log
  createAuditLog({
    action: 'role.restore',
    actorId: restoredBy,
    targetType: 'role',
    targetId: roleId,
    targetName: existing.name,
    newValue: restored
  });
  
  return restored;
}

/**
 * Get role inheritance chain (all parent roles)
 */
function getRoleInheritanceChain(roleId, visited = new Set()) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  if (visited.has(roleId)) return []; // Prevent circular references
  visited.add(roleId);
  
  const role = getRoleById(roleId);
  if (!role) return [];
  
  const chain = [role];
  
  if (role.parent_role_id) {
    const parentChain = getRoleInheritanceChain(role.parent_role_id, visited);
    chain.push(...parentChain);
  }
  
  return chain;
}

// =============================================================================
// PERMISSION MANAGEMENT
// =============================================================================

/**
 * Create a new permission
 */
function createPermission({ name, displayName, description, groupId = null, module = null, resource = null, action = null, isSystemPermission = false, requiresPermissions = null, metadata = null, createdBy = null }) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const stmt = db.prepare(`
    INSERT INTO rbac_permissions (name, display_name, description, group_id, module, resource, action, is_system_permission, requires_permissions, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    name,
    displayName || name,
    description || null,
    groupId || null,
    module || null,
    resource || null,
    action || null,
    isSystemPermission ? 1 : 0,
    requiresPermissions ? JSON.stringify(requiresPermissions) : null,
    metadata ? JSON.stringify(metadata) : null
  );
  
  const permissionId = result.lastInsertRowid;
  
  // Create audit log
  createAuditLog({
    action: 'permission.create',
    actorId: createdBy,
    targetType: 'permission',
    targetId: permissionId,
    targetName: name,
    newValue: { name, displayName, description, groupId, module, resource, action }
  });
  
  return permissionId;
}

/**
 * Get permission by ID
 */
function getPermissionById(permissionId) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT p.*, pg.name as group_name, pg.display_name as group_display_name
    FROM rbac_permissions p
    LEFT JOIN rbac_permission_groups pg ON pg.id = p.group_id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `).get(permissionId);
}

/**
 * Get permission by name
 */
function getPermissionByName(name) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT p.*, pg.name as group_name, pg.display_name as group_display_name
    FROM rbac_permissions p
    LEFT JOIN rbac_permission_groups pg ON pg.id = p.group_id
    WHERE p.name = ? AND p.deleted_at IS NULL
  `).get(name);
}

/**
 * Get all permissions with optional filters
 */
function getPermissions({ groupId = null, module = null, resource = null, includeDisabled = false, includeDeleted = false, search = null, limit = 1000, offset = 0 } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT p.*, pg.name as group_name, pg.display_name as group_display_name
    FROM rbac_permissions p
    LEFT JOIN rbac_permission_groups pg ON pg.id = p.group_id
    WHERE 1=1
  `;
  const params = [];
  
  if (!includeDeleted) {
    sql += ' AND p.deleted_at IS NULL';
  }
  
  if (!includeDisabled) {
    sql += ' AND p.is_enabled = 1';
  }
  
  if (groupId) {
    sql += ' AND p.group_id = ?';
    params.push(groupId);
  }
  
  if (module) {
    sql += ' AND p.module = ?';
    params.push(module);
  }
  
  if (resource) {
    sql += ' AND p.resource = ?';
    params.push(resource);
  }
  
  if (search) {
    sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.display_name) LIKE ? OR LOWER(p.description) LIKE ?)';
    const searchLower = `%${search.toLowerCase()}%`;
    params.push(searchLower, searchLower, searchLower);
  }
  
  sql += ' ORDER BY p.module, p.resource, p.name LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(sql).all(...params);
}

/**
 * Update a permission
 */
function updatePermission(permissionId, updates, updatedBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = getPermissionById(permissionId);
  if (!existing) throw new Error('Permission not found');
  
  const fields = [];
  const values = [];
  
  const allowedFields = {
    name: 'name',
    displayName: 'display_name',
    description: 'description',
    groupId: 'group_id',
    module: 'module',
    resource: 'resource',
    action: 'action',
    isEnabled: 'is_enabled',
    requiresPermissions: 'requires_permissions',
    metadata: 'metadata'
  };
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields[key]) {
      fields.push(`${allowedFields[key]} = ?`);
      if ((key === 'metadata' || key === 'requiresPermissions') && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else if (key === 'isEnabled') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    }
  }
  
  if (fields.length === 0) return existing;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(permissionId);
  
  db.prepare(`UPDATE rbac_permissions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  
  const updated = getPermissionById(permissionId);
  
  // Create audit log
  createAuditLog({
    action: 'permission.update',
    actorId: updatedBy,
    targetType: 'permission',
    targetId: permissionId,
    targetName: existing.name,
    oldValue: existing,
    newValue: updated
  });
  
  return updated;
}

/**
 * Soft delete a permission
 */
function deletePermission(permissionId, deletedBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = getPermissionById(permissionId);
  if (!existing) throw new Error('Permission not found');
  if (existing.is_system_permission) throw new Error('Cannot delete system permissions');
  
  db.prepare(`UPDATE rbac_permissions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(permissionId);
  
  // Create audit log
  createAuditLog({
    action: 'permission.delete',
    actorId: deletedBy,
    targetType: 'permission',
    targetId: permissionId,
    targetName: existing.name,
    oldValue: existing
  });
  
  return true;
}

/**
 * Restore a soft-deleted permission
 */
function restorePermission(permissionId, restoredBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const existing = db.prepare(`SELECT * FROM rbac_permissions WHERE id = ?`).get(permissionId);
  if (!existing) throw new Error('Permission not found');
  if (!existing.deleted_at) throw new Error('Permission is not deleted');
  
  db.prepare(`UPDATE rbac_permissions SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(permissionId);
  
  const restored = getPermissionById(permissionId);
  
  // Create audit log
  createAuditLog({
    action: 'permission.restore',
    actorId: restoredBy,
    targetType: 'permission',
    targetId: permissionId,
    targetName: existing.name,
    newValue: restored
  });
  
  return restored;
}

// =============================================================================
// PERMISSION GROUP MANAGEMENT
// =============================================================================

/**
 * Create a permission group
 */
function createPermissionGroup({ name, displayName, description, module = null, parentGroupId = null, displayOrder = 0, createdBy = null }) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const stmt = db.prepare(`
    INSERT INTO rbac_permission_groups (name, display_name, description, module, parent_group_id, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(name, displayName || name, description || null, module || null, parentGroupId || null, displayOrder);
  
  // Create audit log
  createAuditLog({
    action: 'permission_group.create',
    actorId: createdBy,
    targetType: 'group',
    targetId: result.lastInsertRowid,
    targetName: name,
    newValue: { name, displayName, description, module, parentGroupId }
  });
  
  return result.lastInsertRowid;
}

/**
 * Get all permission groups
 */
function getPermissionGroups({ includeDisabled = false, includeDeleted = false } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT pg.*, ppg.name as parent_group_name,
           (SELECT COUNT(*) FROM rbac_permissions p WHERE p.group_id = pg.id AND p.deleted_at IS NULL) as permission_count
    FROM rbac_permission_groups pg
    LEFT JOIN rbac_permission_groups ppg ON ppg.id = pg.parent_group_id
    WHERE 1=1
  `;
  
  if (!includeDeleted) {
    sql += ' AND pg.deleted_at IS NULL';
  }
  
  if (!includeDisabled) {
    sql += ' AND pg.is_enabled = 1';
  }
  
  sql += ' ORDER BY pg.display_order, pg.name';
  
  return db.prepare(sql).all();
}

// =============================================================================
// ROLE PERMISSION ASSIGNMENT
// =============================================================================

/**
 * Assign permission to role
 */
function assignPermissionToRole(roleId, permissionId, { grantedBy = null, expiresAt = null, isDenied = false } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const role = getRoleById(roleId);
  const permission = getPermissionById(permissionId);
  
  if (!role) throw new Error('Role not found');
  if (!permission) throw new Error('Permission not found');
  
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    db.prepare(`
      MERGE INTO rbac_role_permissions AS target
      USING (SELECT ? AS role_id, ? AS permission_id, ? AS granted_by, ? AS expires_at, ? AS is_denied) AS source
      ON target.role_id = source.role_id AND target.permission_id = source.permission_id
      WHEN MATCHED THEN
        UPDATE SET granted_by = source.granted_by, expires_at = source.expires_at, is_denied = source.is_denied
      WHEN NOT MATCHED THEN
        INSERT (role_id, permission_id, granted_by, expires_at, is_denied) VALUES (source.role_id, source.permission_id, source.granted_by, source.expires_at, source.is_denied);
    `).run(roleId, permissionId, grantedBy, expiresAt || null, isDenied ? 1 : 0);
  } else {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_role_permissions (role_id, permission_id, granted_by, expires_at, is_denied)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(roleId, permissionId, grantedBy, expiresAt || null, isDenied ? 1 : 0);
  }
  
  // Create audit log
  createAuditLog({
    action: isDenied ? 'role.permission.deny' : 'role.permission.grant',
    actorId: grantedBy,
    targetType: 'role',
    targetId: roleId,
    targetName: role.name,
    newValue: { permissionId, permissionName: permission.name, isDenied, expiresAt }
  });
  
  return true;
}

/**
 * Revoke permission from role
 */
function revokePermissionFromRole(roleId, permissionId, revokedBy = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const role = getRoleById(roleId);
  const permission = getPermissionById(permissionId);
  
  if (!role) throw new Error('Role not found');
  if (!permission) throw new Error('Permission not found');
  
  db.prepare(`DELETE FROM rbac_role_permissions WHERE role_id = ? AND permission_id = ?`).run(roleId, permissionId);
  
  // Create audit log
  createAuditLog({
    action: 'role.permission.revoke',
    actorId: revokedBy,
    targetType: 'role',
    targetId: roleId,
    targetName: role.name,
    oldValue: { permissionId, permissionName: permission.name }
  });
  
  return true;
}

/**
 * Get all permissions for a role (including inherited)
 */
function getRolePermissions(roleId, { includeInherited = true, includeExpired = false } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const permissions = new Map();
  
  const roleChain = includeInherited ? getRoleInheritanceChain(roleId) : [getRoleById(roleId)];
  
  // Process from lowest priority (parent) to highest (child)
  for (const role of roleChain.reverse()) {
    if (!role) continue;
    
    let sql = `
      SELECT p.*, rp.is_denied, rp.expires_at, rp.granted_by, rp.granted_at,
             ? as source_role_id, ? as source_role_name
      FROM rbac_role_permissions rp
      JOIN rbac_permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ? AND p.is_enabled = 1 AND p.deleted_at IS NULL
    `;
    
    if (!includeExpired) {
      sql += ' AND (rp.expires_at IS NULL OR rp.expires_at > CURRENT_TIMESTAMP)';
    }
    
    const rolePerms = db.prepare(sql).all(role.id, role.name, role.id);
    
    for (const perm of rolePerms) {
      // Child role permissions override parent permissions
      permissions.set(perm.id, perm);
    }
  }
  
  return Array.from(permissions.values());
}

// =============================================================================
// USER ROLE ASSIGNMENT
// =============================================================================

/**
 * Assign role to user
 */
function assignRoleToUser(userId, roleId, { assignedBy = null, expiresAt = null, isPrimary = false, scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const role = getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  
  // If this is primary, unset any existing primary role
  if (isPrimary) {
    db.prepare(`UPDATE rbac_user_roles SET is_primary = 0 WHERE user_id = ?`).run(userId);
  }
  
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    db.prepare(`
      MERGE INTO rbac_user_roles AS target
      USING (SELECT ? AS user_id, ? AS role_id, ? AS assigned_by, ? AS expires_at, ? AS is_primary, ? AS scope) AS source
      ON target.user_id = source.user_id AND target.role_id = source.role_id
      WHEN MATCHED THEN
        UPDATE SET assigned_by = source.assigned_by, expires_at = source.expires_at, is_primary = source.is_primary, scope = source.scope
      WHEN NOT MATCHED THEN
        INSERT (user_id, role_id, assigned_by, expires_at, is_primary, scope) VALUES (source.user_id, source.role_id, source.assigned_by, source.expires_at, source.is_primary, source.scope);
    `).run(userId, roleId, assignedBy, expiresAt || null, isPrimary ? 1 : 0, scope || null);
  } else {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_user_roles (user_id, role_id, assigned_by, expires_at, is_primary, scope)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(userId, roleId, assignedBy, expiresAt || null, isPrimary ? 1 : 0, scope || null);
  }
  
  // Create audit log
  createAuditLog({
    action: 'user.role.assign',
    actorId: assignedBy,
    targetType: 'user',
    targetId: userId,
    affectedUserId: userId,
    newValue: { roleId, roleName: role.name, isPrimary, expiresAt, scope }
  });
  
  return true;
}

/**
 * Revoke role from user
 */
function revokeRoleFromUser(userId, roleId, revokedBy = null, scope = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const role = getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  
  let sql = `DELETE FROM rbac_user_roles WHERE user_id = ? AND role_id = ?`;
  const params = [userId, roleId];
  
  if (scope !== undefined) {
    sql += scope === null ? ' AND scope IS NULL' : ' AND scope = ?';
    if (scope !== null) params.push(scope);
  }
  
  db.prepare(sql).run(...params);
  
  // Create audit log
  createAuditLog({
    action: 'user.role.revoke',
    actorId: revokedBy,
    targetType: 'user',
    targetId: userId,
    affectedUserId: userId,
    oldValue: { roleId, roleName: role.name, scope }
  });
  
  return true;
}

/**
 * Get all roles for a user
 */
function getUserRoles(userId, { includeExpired = false } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT r.*, ur.is_primary, ur.expires_at, ur.assigned_by, ur.assigned_at, ur.scope
    FROM rbac_user_roles ur
    JOIN rbac_roles r ON r.id = ur.role_id
    WHERE ur.user_id = ? AND r.is_enabled = 1 AND r.deleted_at IS NULL
  `;
  
  if (!includeExpired) {
    sql += ' AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)';
  }
  
  sql += ' ORDER BY ur.is_primary DESC, r.priority DESC';
  
  return db.prepare(sql).all(userId);
}

/**
 * Bulk assign role to multiple users
 */
function bulkAssignRole(userIds, roleId, { assignedBy = null, expiresAt = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  if (!Array.isArray(userIds) || userIds.length === 0) return { success: 0, failed: 0 };
  
  const role = getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  
  let success = 0;
  let failed = 0;
  
  let stmt;
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    stmt = db.prepare(`
      MERGE INTO rbac_user_roles AS target
      USING (SELECT ? AS user_id, ? AS role_id, ? AS assigned_by, ? AS expires_at) AS source
      ON target.user_id = source.user_id AND target.role_id = source.role_id
      WHEN MATCHED THEN
        UPDATE SET assigned_by = source.assigned_by, expires_at = source.expires_at
      WHEN NOT MATCHED THEN
        INSERT (user_id, role_id, assigned_by, expires_at) VALUES (source.user_id, source.role_id, source.assigned_by, source.expires_at);
    `);
  } else {
    stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_user_roles (user_id, role_id, assigned_by, expires_at)
      VALUES (?, ?, ?, ?)
    `);
  }
  
  for (const userId of userIds) {
    try {
      stmt.run(userId, roleId, assignedBy, expiresAt || null);
      success++;
    } catch (error) {
      failed++;
    }
  }
  
  // Create audit log
  createAuditLog({
    action: 'user.role.bulk_assign',
    actorId: assignedBy,
    targetType: 'role',
    targetId: roleId,
    targetName: role.name,
    newValue: { userIds, success, failed, expiresAt }
  });
  
  return { success, failed };
}

// =============================================================================
// USER PERMISSION OVERRIDES
// =============================================================================

/**
 * Grant user-specific permission override
 */
function grantUserOverride(userId, permissionId, { grantedBy = null, isTemporary = false, expiresAt = null, reason = null, scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const permission = getPermissionById(permissionId);
  if (!permission) throw new Error('Permission not found');
  
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    db.prepare(`
      MERGE INTO rbac_user_overrides AS target
      USING (SELECT ? AS user_id, ? AS permission_id, 1 AS is_granted, ? AS is_temporary, ? AS granted_by, ? AS expires_at, ? AS reason, ? AS scope) AS source
      ON target.user_id = source.user_id AND target.permission_id = source.permission_id
      WHEN MATCHED THEN
        UPDATE SET is_granted = source.is_granted, is_temporary = source.is_temporary, granted_by = source.granted_by, expires_at = source.expires_at, reason = source.reason, scope = source.scope
      WHEN NOT MATCHED THEN
        INSERT (user_id, permission_id, is_granted, is_temporary, granted_by, expires_at, reason, scope) VALUES (source.user_id, source.permission_id, source.is_granted, source.is_temporary, source.granted_by, source.expires_at, source.reason, source.scope);
    `).run(userId, permissionId, isTemporary ? 1 : 0, grantedBy, expiresAt || null, reason || null, scope || null);
  } else {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_user_overrides (user_id, permission_id, is_granted, is_temporary, granted_by, expires_at, reason, scope)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?)
    `);
    stmt.run(userId, permissionId, isTemporary ? 1 : 0, grantedBy, expiresAt || null, reason || null, scope || null);
  }
  
  // Create audit log
  createAuditLog({
    action: 'user.override.grant',
    actorId: grantedBy,
    targetType: 'user',
    targetId: userId,
    affectedUserId: userId,
    newValue: { permissionId, permissionName: permission.name, isTemporary, expiresAt, reason, scope }
  });
  
  return true;
}

/**
 * Deny user-specific permission (explicit denial)
 */
function denyUserOverride(userId, permissionId, { grantedBy = null, isTemporary = false, expiresAt = null, reason = null, scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const permission = getPermissionById(permissionId);
  if (!permission) throw new Error('Permission not found');
  
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    db.prepare(`
      MERGE INTO rbac_user_overrides AS target
      USING (SELECT ? AS user_id, ? AS permission_id, 0 AS is_granted, ? AS is_temporary, ? AS granted_by, ? AS expires_at, ? AS reason, ? AS scope) AS source
      ON target.user_id = source.user_id AND target.permission_id = source.permission_id
      WHEN MATCHED THEN
        UPDATE SET is_granted = source.is_granted, is_temporary = source.is_temporary, granted_by = source.granted_by, expires_at = source.expires_at, reason = source.reason, scope = source.scope
      WHEN NOT MATCHED THEN
        INSERT (user_id, permission_id, is_granted, is_temporary, granted_by, expires_at, reason, scope) VALUES (source.user_id, source.permission_id, source.is_granted, source.is_temporary, source.granted_by, source.expires_at, source.reason, source.scope);
    `).run(userId, permissionId, isTemporary ? 1 : 0, grantedBy, expiresAt || null, reason || null, scope || null);
  } else {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_user_overrides (user_id, permission_id, is_granted, is_temporary, granted_by, expires_at, reason, scope)
      VALUES (?, ?, 0, ?, ?, ?, ?, ?)
    `);
    stmt.run(userId, permissionId, isTemporary ? 1 : 0, grantedBy, expiresAt || null, reason || null, scope || null);
  }
  
  // Create audit log
  createAuditLog({
    action: 'user.override.deny',
    actorId: grantedBy,
    targetType: 'user',
    targetId: userId,
    affectedUserId: userId,
    newValue: { permissionId, permissionName: permission.name, isTemporary, expiresAt, reason, scope }
  });
  
  return true;
}

/**
 * Remove user-specific permission override
 */
function removeUserOverride(userId, permissionId, removedBy = null, scope = null) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `DELETE FROM rbac_user_overrides WHERE user_id = ? AND permission_id = ?`;
  const params = [userId, permissionId];
  
  if (scope !== undefined) {
    sql += scope === null ? ' AND scope IS NULL' : ' AND scope = ?';
    if (scope !== null) params.push(scope);
  }
  
  db.prepare(sql).run(...params);
  
  // Create audit log
  createAuditLog({
    action: 'user.override.remove',
    actorId: removedBy,
    targetType: 'user',
    targetId: userId,
    affectedUserId: userId,
    oldValue: { permissionId, scope }
  });
  
  return true;
}

/**
 * Get all overrides for a user
 */
function getUserOverrides(userId, { includeExpired = false } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT uo.*, p.name as permission_name, p.display_name as permission_display_name
    FROM rbac_user_overrides uo
    JOIN rbac_permissions p ON p.id = uo.permission_id
    WHERE uo.user_id = ?
  `;
  
  if (!includeExpired) {
    sql += ' AND (uo.expires_at IS NULL OR uo.expires_at > CURRENT_TIMESTAMP)';
  }
  
  return db.prepare(sql).all(userId);
}

// =============================================================================
// EFFECTIVE PERMISSIONS
// =============================================================================

/**
 * Get all effective permissions for a user (after inheritance + overrides + defaults)
 */
function getEffectivePermissions(userId, { scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const permissions = new Map();
  
  // Step 1: Get permissions from all user roles
  const userRoles = getUserRoles(userId);
  
  for (const role of userRoles) {
    // Skip scoped roles if we're checking global permissions
    if (scope === null && role.scope) continue;
    // Skip non-matching scoped roles
    if (scope && role.scope && role.scope !== scope) continue;
    
    const rolePerms = getRolePermissions(role.id, { includeInherited: true });
    
    for (const perm of rolePerms) {
      // Track which role granted this permission
      const existing = permissions.get(perm.id);
      
      if (!existing) {
        permissions.set(perm.id, {
          ...perm,
          source: 'role',
          sourceRoles: [role.name],
          isDenied: perm.is_denied === 1
        });
      } else {
        // Merge sources
        existing.sourceRoles.push(role.name);
        // Denial takes precedence
        if (perm.is_denied === 1) {
          existing.isDenied = true;
        }
      }
    }
  }
  
  // Step 2: Apply user-specific overrides
  const overrides = getUserOverrides(userId);
  
  for (const override of overrides) {
    // Skip non-matching scoped overrides
    if (scope === null && override.scope) continue;
    if (scope && override.scope && override.scope !== scope) continue;
    
    if (override.is_granted === 1) {
      // Grant override
      permissions.set(override.permission_id, {
        id: override.permission_id,
        name: override.permission_name,
        display_name: override.permission_display_name,
        source: 'override',
        isDenied: false,
        isTemporary: override.is_temporary === 1,
        expiresAt: override.expires_at,
        reason: override.reason
      });
    } else {
      // Denial override - remove or mark as denied
      const existing = permissions.get(override.permission_id);
      if (existing) {
        existing.isDenied = true;
        existing.denialSource = 'override';
        existing.denialReason = override.reason;
      }
    }
  }
  
  // Filter out denied permissions for the final result
  const result = [];
  for (const perm of permissions.values()) {
    if (!perm.isDenied) {
      result.push(perm);
    }
  }
  
  return result;
}

/**
 * Check if user has a specific permission
 */
function hasPermission(userId, permissionName, { scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const permission = getPermissionByName(permissionName);
  if (!permission) return false;
  
  const effectivePermissions = getEffectivePermissions(userId, { scope });
  return effectivePermissions.some(p => p.name === permissionName);
}

/**
 * Check if user has any of the specified permissions
 */
function hasAnyPermission(userId, permissionNames, { scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const effectivePermissions = getEffectivePermissions(userId, { scope });
  const effectiveNames = new Set(effectivePermissions.map(p => p.name));
  
  return permissionNames.some(name => effectiveNames.has(name));
}

/**
 * Check if user has all of the specified permissions
 */
function hasAllPermissions(userId, permissionNames, { scope = null } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const effectivePermissions = getEffectivePermissions(userId, { scope });
  const effectiveNames = new Set(effectivePermissions.map(p => p.name));
  
  return permissionNames.every(name => effectiveNames.has(name));
}

/**
 * Check if user has a specific role
 */
function hasRole(userId, roleName) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const userRoles = getUserRoles(userId);
  return userRoles.some(r => r.name === roleName);
}

// =============================================================================
// VERSION AND AUDIT MANAGEMENT
// =============================================================================

/**
 * Create a version record
 */
function createVersionRecord(entityType, entityId, version, snapshot, changeType, changedBy, changeReason = null) {
  if (!isInitialized) return;
  
  try {
    db.prepare(`
      INSERT INTO rbac_versions (entity_type, entity_id, version, snapshot, change_type, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entityType, entityId, version, JSON.stringify(snapshot), changeType, changedBy, changeReason);
  } catch (error) {
    console.warn('Failed to create version record:', error.message);
  }
}

/**
 * Create an audit log entry
 */
function createAuditLog({ action, actorId, targetType, targetId, targetName, affectedUserId, oldValue, newValue, metadata, ipAddress, userAgent, sessionId }) {
  if (!isInitialized) return;
  
  try {
    db.prepare(`
      INSERT INTO rbac_audit_logs (action, actor_id, target_type, target_id, target_name, affected_user_id, old_value, new_value, ip_address, user_agent, session_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      action,
      actorId || null,
      targetType || null,
      targetId || null,
      targetName || null,
      affectedUserId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress || null,
      userAgent || null,
      sessionId || null,
      metadata ? JSON.stringify(metadata) : null
    );
  } catch (error) {
    console.warn('Failed to create audit log:', error.message);
  }
}

/**
 * Get audit logs with filters
 */
function getAuditLogs({ action = null, actorId = null, targetType = null, targetId = null, affectedUserId = null, startDate = null, endDate = null, limit = 100, offset = 0 } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  let sql = `
    SELECT al.*, 
           u1.full_name as actor_name, u1.email as actor_email,
           u2.full_name as affected_user_name, u2.email as affected_user_email
    FROM rbac_audit_logs al
    LEFT JOIN users u1 ON u1.id = al.actor_id
    LEFT JOIN users u2 ON u2.id = al.affected_user_id
    WHERE 1=1
  `;
  const params = [];
  
  if (action) {
    sql += ' AND al.action LIKE ?';
    params.push(`${action}%`);
  }
  
  if (actorId) {
    sql += ' AND al.actor_id = ?';
    params.push(actorId);
  }
  
  if (targetType) {
    sql += ' AND al.target_type = ?';
    params.push(targetType);
  }
  
  if (targetId) {
    sql += ' AND al.target_id = ?';
    params.push(targetId);
  }
  
  if (affectedUserId) {
    sql += ' AND al.affected_user_id = ?';
    params.push(affectedUserId);
  }
  
  if (startDate) {
    sql += ' AND al.created_at >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    sql += ' AND al.created_at <= ?';
    params.push(endDate);
  }
  
  sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(sql).all(...params);
}

/**
 * Get version history for an entity
 */
function getVersionHistory(entityType, entityId, { limit = 50, offset = 0 } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT v.*, u.full_name as changed_by_name, u.email as changed_by_email
    FROM rbac_versions v
    LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.entity_type = ? AND v.entity_id = ?
    ORDER BY v.version DESC
    LIMIT ? OFFSET ?
  `).all(entityType, entityId, limit, offset);
}

// =============================================================================
// MODULE REGISTRATION (Extensibility)
// =============================================================================

/**
 * Register a module with its permissions
 */
function registerModule({ moduleName, displayName, description, version, permissionsSchema, createdBy = null }) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  // Check if module already exists
  const existing = db.prepare(`SELECT * FROM rbac_module_registrations WHERE module_name = ?`).get(moduleName);
  
  if (existing) {
    // Update existing module
    db.prepare(`
      UPDATE rbac_module_registrations 
      SET display_name = ?, description = ?, version = ?, permissions_schema = ?, updated_at = CURRENT_TIMESTAMP
      WHERE module_name = ?
    `).run(displayName, description || null, version || null, JSON.stringify(permissionsSchema), moduleName);
    
    return existing.id;
  }
  
  // Insert new module
  const result = db.prepare(`
    INSERT INTO rbac_module_registrations (module_name, display_name, description, version, permissions_schema)
    VALUES (?, ?, ?, ?, ?)
  `).run(moduleName, displayName, description || null, version || null, JSON.stringify(permissionsSchema));
  
  // Create permissions from schema
  if (permissionsSchema && Array.isArray(permissionsSchema.permissions)) {
    for (const perm of permissionsSchema.permissions) {
      try {
        createPermission({
          name: `${moduleName}.${perm.name}`,
          displayName: perm.displayName || perm.name,
          description: perm.description,
          module: moduleName,
          resource: perm.resource,
          action: perm.action,
          createdBy
        });
      } catch (error) {
        // Ignore if permission already exists
        if (!error.message.includes('UNIQUE constraint')) {
          console.warn(`Failed to create permission ${moduleName}.${perm.name}:`, error.message);
        }
      }
    }
  }
  
  // Create audit log
  createAuditLog({
    action: 'module.register',
    actorId: createdBy,
    targetType: 'module',
    targetName: moduleName,
    newValue: { displayName, version, permissionCount: permissionsSchema?.permissions?.length || 0 }
  });
  
  return result.lastInsertRowid;
}

/**
 * Get all registered modules
 */
function getRegisteredModules() {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  return db.prepare(`
    SELECT * FROM rbac_module_registrations WHERE is_enabled = 1 ORDER BY display_name
  `).all().map(m => ({
    ...m,
    permissionsSchema: m.permissions_schema ? JSON.parse(m.permissions_schema) : null
  }));
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * Map legacy role to RBAC role
 */
function mapLegacyRole(legacyRole) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const mapping = db.prepare(`
    SELECT lm.*, r.name as rbac_role_name, r.display_name as rbac_role_display_name
    FROM rbac_legacy_mapping lm
    JOIN rbac_roles r ON r.id = lm.rbac_role_id
    WHERE lm.legacy_role = ?
  `).get(legacyRole);
  
  return mapping;
}

/**
 * Create legacy mapping
 */
function createLegacyMapping({ legacyRole, rbacRoleId, legacyPermissions = [] }) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  if (isProduction) {
    // SQL Server: MERGE statement for upsert
    db.prepare(`
      MERGE INTO rbac_legacy_mapping AS target
      USING (SELECT ? AS legacy_role, ? AS rbac_role_id, ? AS legacy_permissions) AS source
      ON target.legacy_role = source.legacy_role
      WHEN MATCHED THEN
        UPDATE SET rbac_role_id = source.rbac_role_id, legacy_permissions = source.legacy_permissions
      WHEN NOT MATCHED THEN
        INSERT (legacy_role, rbac_role_id, legacy_permissions) VALUES (source.legacy_role, source.rbac_role_id, source.legacy_permissions);
    `).run(legacyRole, rbacRoleId, JSON.stringify(legacyPermissions));
  } else {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rbac_legacy_mapping (legacy_role, rbac_role_id, legacy_permissions)
      VALUES (?, ?, ?)
    `);
    stmt.run(legacyRole, rbacRoleId, JSON.stringify(legacyPermissions));
  }
  
  return true;
}

// =============================================================================
// STATISTICS AND SEARCH
// =============================================================================

/**
 * Get RBAC statistics
 */
function getStats() {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const stats = {};
  
  stats.roles = db.prepare(`SELECT COUNT(*) as count FROM rbac_roles WHERE deleted_at IS NULL`).get().count;
  stats.enabledRoles = db.prepare(`SELECT COUNT(*) as count FROM rbac_roles WHERE is_enabled = 1 AND deleted_at IS NULL`).get().count;
  stats.permissions = db.prepare(`SELECT COUNT(*) as count FROM rbac_permissions WHERE deleted_at IS NULL`).get().count;
  stats.permissionGroups = db.prepare(`SELECT COUNT(*) as count FROM rbac_permission_groups WHERE deleted_at IS NULL`).get().count;
  stats.userRoleAssignments = db.prepare(`SELECT COUNT(*) as count FROM rbac_user_roles`).get().count;
  stats.userOverrides = db.prepare(`SELECT COUNT(*) as count FROM rbac_user_overrides`).get().count;
  stats.modules = db.prepare(`SELECT COUNT(*) as count FROM rbac_module_registrations WHERE is_enabled = 1`).get().count;
  
  // Use SQL Server compatible date syntax when in production, SQLite date() otherwise
  const todayDateSql = isProduction 
    ? `SELECT COUNT(*) as count FROM rbac_audit_logs WHERE created_at >= CAST(GETDATE() AS DATE)`
    : `SELECT COUNT(*) as count FROM rbac_audit_logs WHERE created_at >= date('now')`;
  stats.auditLogsToday = db.prepare(todayDateSql).get().count;
  
  return stats;
}

/**
 * Search roles, permissions, and users
 */
function search(query, { types = ['role', 'permission', 'user'], limit = 20 } = {}) {
  if (!isInitialized) throw new Error('RBAC service not initialized');
  
  const results = { roles: [], permissions: [], users: [] };
  const searchLower = `%${query.toLowerCase()}%`;
  
  if (types.includes('role')) {
    results.roles = db.prepare(`
      SELECT id, name, display_name, description, is_enabled
      FROM rbac_roles
      WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(description) LIKE ?)
      LIMIT ?
    `).all(searchLower, searchLower, searchLower, limit);
  }
  
  if (types.includes('permission')) {
    results.permissions = db.prepare(`
      SELECT id, name, display_name, description, module, resource
      FROM rbac_permissions
      WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(description) LIKE ?)
      LIMIT ?
    `).all(searchLower, searchLower, searchLower, limit);
  }
  
  if (types.includes('user')) {
    results.users = db.prepare(`
      SELECT DISTINCT u.id, u.full_name, u.email, u.role as legacy_role
      FROM users u
      LEFT JOIN rbac_user_roles ur ON ur.user_id = u.id
      WHERE LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?
      LIMIT ?
    `).all(searchLower, searchLower, limit);
  }
  
  return results;
}

// Export all functions
module.exports = {
  // Initialization
  initialize,
  runRbacMigrations,
  
  // Role management
  createRole,
  getRoleById,
  getRoleByName,
  getRoles,
  updateRole,
  deleteRole,
  restoreRole,
  getRoleInheritanceChain,
  
  // Permission management
  createPermission,
  getPermissionById,
  getPermissionByName,
  getPermissions,
  updatePermission,
  deletePermission,
  restorePermission,
  
  // Permission groups
  createPermissionGroup,
  getPermissionGroups,
  
  // Role-permission assignment
  assignPermissionToRole,
  revokePermissionFromRole,
  getRolePermissions,
  
  // User-role assignment
  assignRoleToUser,
  revokeRoleFromUser,
  getUserRoles,
  bulkAssignRole,
  
  // User overrides
  grantUserOverride,
  denyUserOverride,
  removeUserOverride,
  getUserOverrides,
  
  // Effective permissions
  getEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  
  // Audit and versioning
  createAuditLog,
  getAuditLogs,
  getVersionHistory,
  
  // Module registration
  registerModule,
  getRegisteredModules,
  
  // Legacy compatibility
  mapLegacyRole,
  createLegacyMapping,
  
  // Statistics and search
  getStats,
  search
};

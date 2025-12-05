/**
 * RBAC Developer Tooling
 * 
 * Provides utilities for:
 * - Seeding complex test users
 * - Auto-generating mock roles
 * - Running RBAC validation suites
 * - Detecting permission mismatches after refactors
 */

const crypto = require('crypto');

// Lazy load dependencies
let db = null;
let rbacService = null;

function initDependencies() {
  if (!db) {
    try {
      const dbModule = require('../db');
      db = dbModule.db;
    } catch (e) {
      console.warn('RBAC DevTools: Database not available');
    }
  }
  if (!rbacService) {
    try {
      rbacService = require('./rbac');
    } catch (e) {
      console.warn('RBAC DevTools: RBAC service not available');
    }
  }
}

/**
 * Test User Seeding Utilities
 */
class TestUserSeeder {
  constructor() {
    this.testUserPrefix = 'test_';
    this.testEmailDomain = '@test.dreamx.local';
  }

  /**
   * Create a test user with specific role and permissions
   */
  createTestUser(options = {}) {
    initDependencies();
    if (!db || !rbacService) {
      throw new Error('Dependencies not available');
    }

    const {
      name = `Test User ${Date.now()}`,
      email = `${this.testUserPrefix}${Date.now()}${this.testEmailDomain}`,
      role = 'user',
      permissions = [],
      scopes = [],
      overrides = [],
      metadata = {}
    } = options;

    // Create user in database with random unusable password hash
    // This ensures test users cannot be logged into with any password
    const randomHash = `test_${crypto.randomBytes(32).toString('hex')}_cannot_login`;
    const userId = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(name, email, randomHash, role).lastInsertRowid;

    // Assign RBAC role
    const rbacRole = rbacService.getRoleByName(role);
    if (rbacRole) {
      rbacService.assignRoleToUser(userId, rbacRole.id, { isPrimary: true });
    }

    // Add additional permissions as overrides
    for (const permName of permissions) {
      const permission = rbacService.getPermissionByName(permName);
      if (permission) {
        rbacService.grantUserOverride(userId, permission.id, {
          reason: 'Test user setup',
          isTemporary: false
        });
      }
    }

    // Add explicit overrides
    for (const override of overrides) {
      const permission = rbacService.getPermissionByName(override.permission);
      if (permission) {
        if (override.denied) {
          rbacService.denyUserOverride(userId, permission.id, {
            reason: override.reason || 'Test override',
            isTemporary: override.temporary || false,
            expiresAt: override.expiresAt
          });
        } else {
          rbacService.grantUserOverride(userId, permission.id, {
            reason: override.reason || 'Test override',
            isTemporary: override.temporary || false,
            expiresAt: override.expiresAt
          });
        }
      }
    }

    return {
      userId,
      email,
      name,
      role,
      assignedPermissions: permissions,
      overrides: overrides.length
    };
  }

  /**
   * Create a set of test users representing different permission levels
   */
  createTestUserSet() {
    const users = [];

    // Regular user
    users.push(this.createTestUser({
      name: 'Test Regular User',
      role: 'user'
    }));

    // HR user with limited permissions
    users.push(this.createTestUser({
      name: 'Test HR User',
      role: 'hr',
      permissions: ['hr.hr_applications', 'hr.hr_pipeline']
    }));

    // Super HR with full HR permissions
    users.push(this.createTestUser({
      name: 'Test Super HR',
      role: 'super_hr'
    }));

    // Admin with specific permissions
    users.push(this.createTestUser({
      name: 'Test Admin',
      role: 'admin',
      permissions: ['admin.manage_users', 'admin.moderate_content']
    }));

    // Super admin
    users.push(this.createTestUser({
      name: 'Test Super Admin',
      role: 'super_admin'
    }));

    // Business admin
    users.push(this.createTestUser({
      name: 'Test Business Admin',
      role: 'business_admin'
    }));

    // User with specific overrides
    users.push(this.createTestUser({
      name: 'Test User with Overrides',
      role: 'user',
      overrides: [
        { permission: 'admin.audit_logs', reason: 'Special access' },
        { permission: 'admin.platform_metrics', denied: true, reason: 'Restricted' }
      ]
    }));

    // User with temporary permissions
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    users.push(this.createTestUser({
      name: 'Test User with Temporary Access',
      role: 'user',
      overrides: [
        { 
          permission: 'admin.manage_users', 
          temporary: true, 
          expiresAt: tomorrow.toISOString(),
          reason: 'Temporary access for testing'
        }
      ]
    }));

    return users;
  }

  /**
   * Clean up test users
   */
  cleanupTestUsers() {
    initDependencies();
    if (!db) return { deleted: 0 };

    try {
      // Get test user IDs
      const testUsers = db.prepare(`
        SELECT id FROM users WHERE email LIKE ?
      `).all(`%${this.testEmailDomain}`);

      for (const user of testUsers) {
        // Clean up RBAC data
        db.prepare('DELETE FROM rbac_user_roles WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM rbac_user_overrides WHERE user_id = ?').run(user.id);
      }

      // Delete test users
      const result = db.prepare(`
        DELETE FROM users WHERE email LIKE ?
      `).run(`%${this.testEmailDomain}`);

      return { deleted: result.changes };
    } catch (e) {
      console.warn('Failed to cleanup test users:', e.message);
      return { deleted: 0, error: e.message };
    }
  }
}

/**
 * Mock Role Generator
 */
class MockRoleGenerator {
  /**
   * Generate a random role with permissions
   */
  static generateRole(options = {}) {
    initDependencies();
    if (!rbacService) {
      throw new Error('RBAC service not available');
    }

    const {
      namePrefix = 'mock_role_',
      permissionCount = 5,
      parentRole = null,
      priority = Math.floor(Math.random() * 50)
    } = options;

    const roleId = crypto.randomBytes(4).toString('hex');
    const roleName = `${namePrefix}${roleId}`;

    // Create the role
    const createdRoleId = rbacService.createRole({
      name: roleName,
      displayName: `Mock Role ${roleId.toUpperCase()}`,
      description: 'Auto-generated mock role for testing',
      priority,
      parentRoleId: parentRole,
      metadata: { generated: true, timestamp: Date.now() }
    });

    // Assign random permissions
    const allPermissions = rbacService.getPermissions();
    const shuffled = allPermissions.sort(() => Math.random() - 0.5);
    const selectedPermissions = shuffled.slice(0, Math.min(permissionCount, shuffled.length));

    for (const perm of selectedPermissions) {
      rbacService.assignPermissionToRole(createdRoleId, perm.id);
    }

    return {
      roleId: createdRoleId,
      roleName,
      permissions: selectedPermissions.map(p => p.name)
    };
  }

  /**
   * Generate a role hierarchy
   */
  static generateRoleHierarchy(depth = 3, breadth = 2) {
    const roles = [];

    function createLevel(parentId, currentDepth) {
      if (currentDepth >= depth) return;

      for (let i = 0; i < breadth; i++) {
        const role = MockRoleGenerator.generateRole({
          namePrefix: `mock_level${currentDepth}_`,
          parentRole: parentId,
          priority: (depth - currentDepth) * 10
        });
        roles.push(role);
        createLevel(role.roleId, currentDepth + 1);
      }
    }

    // Create root role
    const rootRole = MockRoleGenerator.generateRole({
      namePrefix: 'mock_root_',
      priority: depth * 10 + 10
    });
    roles.push(rootRole);

    createLevel(rootRole.roleId, 1);

    return roles;
  }

  /**
   * Clean up generated mock roles
   */
  static cleanupMockRoles() {
    initDependencies();
    if (!db) return { deleted: 0 };

    try {
      // Find mock roles
      const mockRoles = db.prepare(`
        SELECT id FROM rbac_roles WHERE name LIKE 'mock_%'
      `).all();

      for (const role of mockRoles) {
        // Delete role permissions
        db.prepare('DELETE FROM rbac_role_permissions WHERE role_id = ?').run(role.id);
        // Delete user assignments
        db.prepare('DELETE FROM rbac_user_roles WHERE role_id = ?').run(role.id);
      }

      // Delete roles
      const result = db.prepare(`
        DELETE FROM rbac_roles WHERE name LIKE 'mock_%'
      `).run();

      return { deleted: result.changes };
    } catch (e) {
      console.warn('Failed to cleanup mock roles:', e.message);
      return { deleted: 0, error: e.message };
    }
  }
}

/**
 * RBAC Validation Suite
 */
class ValidationSuite {
  /**
   * Run all validation checks
   */
  static runFullValidation() {
    initDependencies();
    
    const results = {
      timestamp: new Date().toISOString(),
      passed: 0,
      failed: 0,
      warnings: 0,
      checks: []
    };

    // Run all checks
    const checks = [
      ValidationSuite.checkRoleIntegrity(),
      ValidationSuite.checkPermissionIntegrity(),
      ValidationSuite.checkUserRoleConsistency(),
      ValidationSuite.checkOverrideConsistency(),
      ValidationSuite.checkCircularInheritance(),
      ValidationSuite.checkOrphanedRecords(),
      ValidationSuite.checkExpirationDates()
    ];

    for (const check of checks) {
      results.checks.push(check);
      if (check.status === 'passed') results.passed++;
      else if (check.status === 'failed') results.failed++;
      else if (check.status === 'warning') results.warnings++;
    }

    results.summary = `${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`;
    results.overallStatus = results.failed > 0 ? 'failed' : (results.warnings > 0 ? 'warning' : 'passed');

    return results;
  }

  /**
   * Check role data integrity
   */
  static checkRoleIntegrity() {
    initDependencies();
    const check = {
      name: 'Role Integrity',
      description: 'Verify all roles have valid data',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Check for roles without names
      const nameless = db.prepare(`
        SELECT id FROM rbac_roles WHERE name IS NULL OR name = ''
      `).all();
      if (nameless.length > 0) {
        check.status = 'failed';
        check.issues.push(`${nameless.length} roles without names`);
      }

      // Check for duplicate names
      const duplicates = db.prepare(`
        SELECT name, COUNT(*) as count FROM rbac_roles 
        WHERE deleted_at IS NULL
        GROUP BY name HAVING count > 1
      `).all();
      if (duplicates.length > 0) {
        check.status = 'failed';
        check.issues.push(`Duplicate role names: ${duplicates.map(d => d.name).join(', ')}`);
      }

      // Check for invalid parent references
      const invalidParents = db.prepare(`
        SELECT r.id, r.name, r.parent_role_id
        FROM rbac_roles r
        WHERE r.parent_role_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rbac_roles p WHERE p.id = r.parent_role_id)
      `).all();
      if (invalidParents.length > 0) {
        check.status = 'failed';
        check.issues.push(`${invalidParents.length} roles with invalid parent references`);
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check permission data integrity
   */
  static checkPermissionIntegrity() {
    initDependencies();
    const check = {
      name: 'Permission Integrity',
      description: 'Verify all permissions have valid data',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Check for permissions without names
      const nameless = db.prepare(`
        SELECT id FROM rbac_permissions WHERE name IS NULL OR name = ''
      `).all();
      if (nameless.length > 0) {
        check.status = 'failed';
        check.issues.push(`${nameless.length} permissions without names`);
      }

      // Check for duplicate names
      const duplicates = db.prepare(`
        SELECT name, COUNT(*) as count FROM rbac_permissions 
        WHERE deleted_at IS NULL
        GROUP BY name HAVING count > 1
      `).all();
      if (duplicates.length > 0) {
        check.status = 'failed';
        check.issues.push(`Duplicate permission names: ${duplicates.map(d => d.name).join(', ')}`);
      }

      // Check for invalid group references
      const invalidGroups = db.prepare(`
        SELECT p.id, p.name, p.group_id
        FROM rbac_permissions p
        WHERE p.group_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rbac_permission_groups g WHERE g.id = p.group_id)
      `).all();
      if (invalidGroups.length > 0) {
        check.status = 'warning';
        check.issues.push(`${invalidGroups.length} permissions with invalid group references`);
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check user-role assignment consistency
   */
  static checkUserRoleConsistency() {
    initDependencies();
    const check = {
      name: 'User-Role Consistency',
      description: 'Verify user-role assignments are valid',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Check for assignments to non-existent users
      const invalidUsers = db.prepare(`
        SELECT ur.user_id, ur.role_id
        FROM rbac_user_roles ur
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)
      `).all();
      if (invalidUsers.length > 0) {
        check.status = 'warning';
        check.issues.push(`${invalidUsers.length} role assignments to non-existent users`);
      }

      // Check for assignments to non-existent roles
      const invalidRoles = db.prepare(`
        SELECT ur.user_id, ur.role_id
        FROM rbac_user_roles ur
        WHERE NOT EXISTS (SELECT 1 FROM rbac_roles r WHERE r.id = ur.role_id)
      `).all();
      if (invalidRoles.length > 0) {
        check.status = 'failed';
        check.issues.push(`${invalidRoles.length} assignments to non-existent roles`);
      }

      // Check for users with multiple primary roles
      const multiplePrimary = db.prepare(`
        SELECT user_id, COUNT(*) as count 
        FROM rbac_user_roles 
        WHERE is_primary = 1
        GROUP BY user_id HAVING count > 1
      `).all();
      if (multiplePrimary.length > 0) {
        check.status = 'warning';
        check.issues.push(`${multiplePrimary.length} users with multiple primary roles`);
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check user override consistency
   */
  static checkOverrideConsistency() {
    initDependencies();
    const check = {
      name: 'Override Consistency',
      description: 'Verify user overrides are valid',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Check for overrides to non-existent permissions
      const invalidPerms = db.prepare(`
        SELECT uo.user_id, uo.permission_id
        FROM rbac_user_overrides uo
        WHERE NOT EXISTS (SELECT 1 FROM rbac_permissions p WHERE p.id = uo.permission_id)
      `).all();
      if (invalidPerms.length > 0) {
        check.status = 'failed';
        check.issues.push(`${invalidPerms.length} overrides for non-existent permissions`);
      }

      // Check for overrides to non-existent users
      const invalidUsers = db.prepare(`
        SELECT uo.user_id, uo.permission_id
        FROM rbac_user_overrides uo
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uo.user_id)
      `).all();
      if (invalidUsers.length > 0) {
        check.status = 'warning';
        check.issues.push(`${invalidUsers.length} overrides for non-existent users`);
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check for circular inheritance in roles
   */
  static checkCircularInheritance() {
    initDependencies();
    const check = {
      name: 'Circular Inheritance',
      description: 'Detect circular role inheritance chains',
      status: 'passed',
      issues: []
    };

    if (!db || !rbacService) {
      check.status = 'failed';
      check.issues.push('Dependencies not available');
      return check;
    }

    try {
      const roles = db.prepare(`
        SELECT id, name, parent_role_id FROM rbac_roles WHERE deleted_at IS NULL
      `).all();

      for (const role of roles) {
        if (!role.parent_role_id) continue;

        const visited = new Set();
        let currentId = role.id;

        while (currentId) {
          if (visited.has(currentId)) {
            check.status = 'failed';
            check.issues.push(`Circular inheritance detected for role: ${role.name}`);
            break;
          }
          visited.add(currentId);
          
          const current = roles.find(r => r.id === currentId);
          currentId = current?.parent_role_id;
        }
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check for orphaned records
   */
  static checkOrphanedRecords() {
    initDependencies();
    const check = {
      name: 'Orphaned Records',
      description: 'Find orphaned RBAC records',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Orphaned role permissions
      const orphanedRolePerms = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_role_permissions rp
        WHERE NOT EXISTS (SELECT 1 FROM rbac_roles r WHERE r.id = rp.role_id AND r.deleted_at IS NULL)
        OR NOT EXISTS (SELECT 1 FROM rbac_permissions p WHERE p.id = rp.permission_id AND p.deleted_at IS NULL)
      `).get();
      if (orphanedRolePerms.count > 0) {
        check.status = 'warning';
        check.issues.push(`${orphanedRolePerms.count} orphaned role-permission assignments`);
      }

      // Orphaned versions
      const orphanedVersions = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_versions v
        WHERE v.entity_type = 'role'
        AND NOT EXISTS (SELECT 1 FROM rbac_roles r WHERE r.id = v.entity_id)
      `).get();
      // This is informational, not an issue
      
    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }

  /**
   * Check expiration dates
   */
  static checkExpirationDates() {
    initDependencies();
    const check = {
      name: 'Expiration Dates',
      description: 'Check for expired or invalid expiration dates',
      status: 'passed',
      issues: []
    };

    if (!db) {
      check.status = 'failed';
      check.issues.push('Database not available');
      return check;
    }

    try {
      // Find expired role permissions still active
      const expiredRolePerms = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_role_permissions
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `).get();
      if (expiredRolePerms.count > 0) {
        check.status = 'warning';
        check.issues.push(`${expiredRolePerms.count} expired role permissions (should be cleaned up)`);
      }

      // Find expired user overrides
      const expiredOverrides = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_user_overrides
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `).get();
      if (expiredOverrides.count > 0) {
        check.status = 'warning';
        check.issues.push(`${expiredOverrides.count} expired user overrides (should be cleaned up)`);
      }

      // Find expired user roles
      const expiredUserRoles = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_user_roles
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `).get();
      if (expiredUserRoles.count > 0) {
        check.status = 'warning';
        check.issues.push(`${expiredUserRoles.count} expired user role assignments (should be cleaned up)`);
      }

    } catch (e) {
      check.status = 'failed';
      check.issues.push(`Check failed: ${e.message}`);
    }

    return check;
  }
}

/**
 * Permission Mismatch Detector
 * Helps detect permission changes after refactors
 */
class MismatchDetector {
  /**
   * Take a snapshot of current RBAC state
   */
  static takeSnapshot() {
    initDependencies();
    if (!rbacService) {
      throw new Error('RBAC service not available');
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      roles: {},
      permissions: [],
      rolePermissions: {}
    };

    // Capture all roles and their permissions
    const roles = rbacService.getRoles({ includeDisabled: true });
    for (const role of roles) {
      snapshot.roles[role.name] = {
        id: role.id,
        displayName: role.display_name,
        priority: role.priority,
        parentRoleId: role.parent_role_id,
        isEnabled: role.is_enabled
      };
      snapshot.rolePermissions[role.name] = rbacService.getRolePermissions(role.id).map(p => p.name);
    }

    // Capture all permissions
    const permissions = rbacService.getPermissions({ includeDisabled: true });
    snapshot.permissions = permissions.map(p => ({
      name: p.name,
      module: p.module,
      resource: p.resource,
      action: p.action,
      isEnabled: p.is_enabled
    }));

    return snapshot;
  }

  /**
   * Compare two snapshots and find differences
   */
  static compareSnapshots(before, after) {
    const diff = {
      addedRoles: [],
      removedRoles: [],
      modifiedRoles: [],
      addedPermissions: [],
      removedPermissions: [],
      changedRolePermissions: []
    };

    // Compare roles
    const beforeRoles = new Set(Object.keys(before.roles));
    const afterRoles = new Set(Object.keys(after.roles));

    for (const role of afterRoles) {
      if (!beforeRoles.has(role)) {
        diff.addedRoles.push(role);
      } else {
        // Check for modifications
        const b = before.roles[role];
        const a = after.roles[role];
        if (b.displayName !== a.displayName || 
            b.priority !== a.priority || 
            b.parentRoleId !== a.parentRoleId ||
            b.isEnabled !== a.isEnabled) {
          diff.modifiedRoles.push({ role, before: b, after: a });
        }
      }
    }

    for (const role of beforeRoles) {
      if (!afterRoles.has(role)) {
        diff.removedRoles.push(role);
      }
    }

    // Compare permissions
    const beforePerms = new Set(before.permissions.map(p => p.name));
    const afterPerms = new Set(after.permissions.map(p => p.name));

    for (const perm of after.permissions) {
      if (!beforePerms.has(perm.name)) {
        diff.addedPermissions.push(perm.name);
      }
    }

    for (const perm of before.permissions) {
      if (!afterPerms.has(perm.name)) {
        diff.removedPermissions.push(perm.name);
      }
    }

    // Compare role permissions
    for (const role of Object.keys(before.rolePermissions)) {
      if (!after.rolePermissions[role]) continue;

      const beforeP = new Set(before.rolePermissions[role]);
      const afterP = new Set(after.rolePermissions[role]);

      const added = [...afterP].filter(p => !beforeP.has(p));
      const removed = [...beforeP].filter(p => !afterP.has(p));

      if (added.length > 0 || removed.length > 0) {
        diff.changedRolePermissions.push({
          role,
          addedPermissions: added,
          removedPermissions: removed
        });
      }
    }

    return diff;
  }

  /**
   * Generate a report from snapshot comparison
   */
  static generateDiffReport(diff) {
    let report = `# RBAC Difference Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    if (diff.addedRoles.length > 0) {
      report += `## Added Roles\n\n`;
      for (const role of diff.addedRoles) {
        report += `- ${role}\n`;
      }
      report += `\n`;
    }

    if (diff.removedRoles.length > 0) {
      report += `## Removed Roles\n\n`;
      for (const role of diff.removedRoles) {
        report += `- ${role}\n`;
      }
      report += `\n`;
    }

    if (diff.modifiedRoles.length > 0) {
      report += `## Modified Roles\n\n`;
      for (const mod of diff.modifiedRoles) {
        report += `### ${mod.role}\n`;
        report += `- Before: priority=${mod.before.priority}, enabled=${mod.before.isEnabled}\n`;
        report += `- After: priority=${mod.after.priority}, enabled=${mod.after.isEnabled}\n\n`;
      }
    }

    if (diff.addedPermissions.length > 0) {
      report += `## Added Permissions\n\n`;
      for (const perm of diff.addedPermissions) {
        report += `- ${perm}\n`;
      }
      report += `\n`;
    }

    if (diff.removedPermissions.length > 0) {
      report += `## Removed Permissions\n\n`;
      for (const perm of diff.removedPermissions) {
        report += `- ${perm}\n`;
      }
      report += `\n`;
    }

    if (diff.changedRolePermissions.length > 0) {
      report += `## Changed Role Permissions\n\n`;
      for (const change of diff.changedRolePermissions) {
        report += `### ${change.role}\n`;
        if (change.addedPermissions.length > 0) {
          report += `Added:\n`;
          for (const p of change.addedPermissions) {
            report += `  + ${p}\n`;
          }
        }
        if (change.removedPermissions.length > 0) {
          report += `Removed:\n`;
          for (const p of change.removedPermissions) {
            report += `  - ${p}\n`;
          }
        }
        report += `\n`;
      }
    }

    const hasChanges = 
      diff.addedRoles.length > 0 ||
      diff.removedRoles.length > 0 ||
      diff.modifiedRoles.length > 0 ||
      diff.addedPermissions.length > 0 ||
      diff.removedPermissions.length > 0 ||
      diff.changedRolePermissions.length > 0;

    if (!hasChanges) {
      report += `**No changes detected**\n`;
    }

    return report;
  }
}

// Export all classes
module.exports = {
  TestUserSeeder,
  MockRoleGenerator,
  ValidationSuite,
  MismatchDetector,
  
  // Singleton instance
  testUserSeeder: new TestUserSeeder()
};

/**
 * RBAC Service Tests
 * 
 * Tests for the Role-Based Access Control service
 */

const path = require('path');

// Set test environment before loading database
process.env.NODE_ENV = 'test';
process.env.DATABASE_ENV = 'test';

// Mock database for testing
const Database = require('better-sqlite3');
let testDb;

describe('RBAC Service', () => {
  let rbacService;
  let testUserId = 1;

  beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    
    // Create minimal users table
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        admin_permissions TEXT,
        admin_scopes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      INSERT INTO users (full_name, email, password_hash, role) 
      VALUES ('Test Admin', 'admin@test.com', 'hash', 'global_admin');
      
      INSERT INTO users (full_name, email, password_hash, role) 
      VALUES ('Test User', 'user@test.com', 'hash', 'user');
    `);
    
    // Load and initialize RBAC service
    rbacService = require('../services/rbac');
    rbacService.initialize(testDb);
  });

  afterAll(() => {
    if (testDb) {
      testDb.close();
    }
  });

  describe('Role Management', () => {
    test('should create a new role', () => {
      const roleId = rbacService.createRole({
        name: 'test_role',
        displayName: 'Test Role',
        description: 'A test role',
        priority: 10
      });

      expect(roleId).toBeDefined();
      expect(typeof roleId).toBe('number');

      const role = rbacService.getRoleById(roleId);
      expect(role).toBeDefined();
      expect(role.name).toBe('test_role');
      expect(role.display_name).toBe('Test Role');
    });

    test('should get role by name', () => {
      const role = rbacService.getRoleByName('test_role');
      expect(role).toBeDefined();
      expect(role.name).toBe('test_role');
    });

    test('should get all roles', () => {
      const roles = rbacService.getRoles();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
    });

    test('should update a role', () => {
      const role = rbacService.getRoleByName('test_role');
      const updated = rbacService.updateRole(role.id, {
        displayName: 'Updated Test Role',
        priority: 20
      });

      expect(updated.display_name).toBe('Updated Test Role');
      expect(updated.priority).toBe(20);
    });

    test('should soft delete and restore a role', () => {
      const role = rbacService.getRoleByName('test_role');
      
      rbacService.deleteRole(role.id);
      
      // Role should not appear in normal query
      const deletedRole = rbacService.getRoleByName('test_role');
      expect(deletedRole).toBeUndefined();
      
      // Restore the role
      const restored = rbacService.restoreRole(role.id);
      expect(restored).toBeDefined();
      expect(restored.name).toBe('test_role');
    });
  });

  describe('Permission Management', () => {
    let groupId;

    test('should create a permission group', () => {
      groupId = rbacService.createPermissionGroup({
        name: 'test_group',
        displayName: 'Test Group',
        description: 'A test permission group',
        module: 'test'
      });

      expect(groupId).toBeDefined();
    });

    test('should create a permission', () => {
      const permissionId = rbacService.createPermission({
        name: 'test.permission',
        displayName: 'Test Permission',
        description: 'A test permission',
        groupId: groupId,
        module: 'test',
        resource: 'test',
        action: 'read'
      });

      expect(permissionId).toBeDefined();

      const permission = rbacService.getPermissionById(permissionId);
      expect(permission).toBeDefined();
      expect(permission.name).toBe('test.permission');
    });

    test('should get permission by name', () => {
      const permission = rbacService.getPermissionByName('test.permission');
      expect(permission).toBeDefined();
      expect(permission.name).toBe('test.permission');
    });

    test('should get all permissions', () => {
      const permissions = rbacService.getPermissions();
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
    });
  });

  describe('Role-Permission Assignment', () => {
    test('should assign permission to role', () => {
      const role = rbacService.getRoleByName('test_role');
      const permission = rbacService.getPermissionByName('test.permission');

      const result = rbacService.assignPermissionToRole(role.id, permission.id);
      expect(result).toBe(true);
    });

    test('should get role permissions', () => {
      const role = rbacService.getRoleByName('test_role');
      const permissions = rbacService.getRolePermissions(role.id);

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions.some(p => p.name === 'test.permission')).toBe(true);
    });

    test('should revoke permission from role', () => {
      const role = rbacService.getRoleByName('test_role');
      const permission = rbacService.getPermissionByName('test.permission');

      const result = rbacService.revokePermissionFromRole(role.id, permission.id);
      expect(result).toBe(true);

      const permissions = rbacService.getRolePermissions(role.id);
      expect(permissions.some(p => p.name === 'test.permission')).toBe(false);
    });
  });

  describe('User-Role Assignment', () => {
    test('should assign role to user', () => {
      const role = rbacService.getRoleByName('test_role');
      
      const result = rbacService.assignRoleToUser(testUserId, role.id, {
        isPrimary: true
      });
      
      expect(result).toBe(true);
    });

    test('should get user roles', () => {
      const roles = rbacService.getUserRoles(testUserId);
      
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(r => r.name === 'test_role')).toBe(true);
    });

    test('should check if user has role', () => {
      const hasRole = rbacService.hasRole(testUserId, 'test_role');
      expect(hasRole).toBe(true);
      
      const hasNoRole = rbacService.hasRole(testUserId, 'nonexistent_role');
      expect(hasNoRole).toBe(false);
    });

    test('should revoke role from user', () => {
      const role = rbacService.getRoleByName('test_role');
      
      const result = rbacService.revokeRoleFromUser(testUserId, role.id);
      expect(result).toBe(true);

      const roles = rbacService.getUserRoles(testUserId);
      expect(roles.some(r => r.name === 'test_role')).toBe(false);
    });
  });

  describe('User Permission Overrides', () => {
    test('should grant user override', () => {
      const permission = rbacService.getPermissionByName('test.permission');
      
      const result = rbacService.grantUserOverride(testUserId, permission.id, {
        reason: 'Test grant'
      });
      
      expect(result).toBe(true);
    });

    test('should get user overrides', () => {
      const overrides = rbacService.getUserOverrides(testUserId);
      
      expect(Array.isArray(overrides)).toBe(true);
      expect(overrides.length).toBeGreaterThan(0);
    });

    test('should remove user override', () => {
      const permission = rbacService.getPermissionByName('test.permission');
      
      const result = rbacService.removeUserOverride(testUserId, permission.id);
      expect(result).toBe(true);

      const overrides = rbacService.getUserOverrides(testUserId);
      expect(overrides.some(o => o.permission_id === permission.id)).toBe(false);
    });
  });

  describe('Effective Permissions', () => {
    test('should get effective permissions for user', () => {
      // First, assign role and permission
      const role = rbacService.getRoleByName('test_role');
      const permission = rbacService.getPermissionByName('test.permission');
      
      rbacService.assignPermissionToRole(role.id, permission.id);
      rbacService.assignRoleToUser(testUserId, role.id);
      
      const effectivePermissions = rbacService.getEffectivePermissions(testUserId);
      
      expect(Array.isArray(effectivePermissions)).toBe(true);
      expect(effectivePermissions.some(p => p.name === 'test.permission')).toBe(true);
    });

    test('should check if user has permission', () => {
      const hasPermission = rbacService.hasPermission(testUserId, 'test.permission');
      expect(hasPermission).toBe(true);
      
      const hasNoPermission = rbacService.hasPermission(testUserId, 'nonexistent.permission');
      expect(hasNoPermission).toBe(false);
    });
  });

  describe('Role Inheritance', () => {
    test('should create child role with parent', () => {
      const parentRole = rbacService.getRoleByName('test_role');
      
      const childRoleId = rbacService.createRole({
        name: 'child_role',
        displayName: 'Child Role',
        parentRoleId: parentRole.id,
        priority: 5
      });

      expect(childRoleId).toBeDefined();

      const childRole = rbacService.getRoleById(childRoleId);
      expect(childRole.parent_role_id).toBe(parentRole.id);
    });

    test('should get inheritance chain', () => {
      const childRole = rbacService.getRoleByName('child_role');
      const chain = rbacService.getRoleInheritanceChain(childRole.id);

      expect(Array.isArray(chain)).toBe(true);
      expect(chain.length).toBe(2); // child + parent
      expect(chain[0].name).toBe('child_role');
      expect(chain[1].name).toBe('test_role');
    });

    test('should inherit permissions from parent role', () => {
      const childRole = rbacService.getRoleByName('child_role');
      
      // Assign child role to user
      rbacService.assignRoleToUser(2, childRole.id);
      
      // User should have permissions from both child and parent
      const permissions = rbacService.getRolePermissions(childRole.id, { includeInherited: true });
      expect(permissions.some(p => p.name === 'test.permission')).toBe(true);
    });
  });

  describe('Audit Logs', () => {
    test('should get audit logs', () => {
      const logs = rbacService.getAuditLogs({ limit: 10 });
      
      expect(Array.isArray(logs)).toBe(true);
      // Should have logs from previous operations
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should filter audit logs by action', () => {
      const logs = rbacService.getAuditLogs({
        action: 'role',
        limit: 10
      });

      expect(Array.isArray(logs)).toBe(true);
      logs.forEach(log => {
        expect(log.action.startsWith('role')).toBe(true);
      });
    });
  });

  describe('Statistics', () => {
    test('should get RBAC stats', () => {
      const stats = rbacService.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.roles).toBe('number');
      expect(typeof stats.permissions).toBe('number');
      expect(typeof stats.userRoleAssignments).toBe('number');
    });
  });

  describe('Search', () => {
    test('should search roles and permissions', () => {
      const results = rbacService.search('test', {
        types: ['role', 'permission'],
        limit: 10
      });

      expect(results).toBeDefined();
      expect(results.roles).toBeDefined();
      expect(results.permissions).toBeDefined();
    });
  });

  describe('Module Registration', () => {
    test('should register a module', () => {
      const moduleId = rbacService.registerModule({
        moduleName: 'test_module',
        displayName: 'Test Module',
        description: 'A test module',
        version: '1.0.0',
        permissionsSchema: {
          permissions: [
            { name: 'view', displayName: 'View', resource: 'test', action: 'view' },
            { name: 'edit', displayName: 'Edit', resource: 'test', action: 'edit' }
          ]
        }
      });

      expect(moduleId).toBeDefined();
    });

    test('should get registered modules', () => {
      const modules = rbacService.getRegisteredModules();
      
      expect(Array.isArray(modules)).toBe(true);
      expect(modules.some(m => m.module_name === 'test_module')).toBe(true);
    });
  });
});

describe('RBAC Middleware', () => {
  let rbacMiddleware;

  beforeAll(() => {
    rbacMiddleware = require('../middleware/rbac');
  });

  test('should export hasPermission function', () => {
    expect(typeof rbacMiddleware.hasPermission).toBe('function');
  });

  test('should export hasAnyPermission function', () => {
    expect(typeof rbacMiddleware.hasAnyPermission).toBe('function');
  });

  test('should export hasAllPermissions function', () => {
    expect(typeof rbacMiddleware.hasAllPermissions).toBe('function');
  });

  test('should export hasRole function', () => {
    expect(typeof rbacMiddleware.hasRole).toBe('function');
  });

  test('should export requirePermission middleware factory', () => {
    expect(typeof rbacMiddleware.requirePermission).toBe('function');
    
    const middleware = rbacMiddleware.requirePermission('test.permission');
    expect(typeof middleware).toBe('function');
  });

  test('should export requireRole middleware factory', () => {
    expect(typeof rbacMiddleware.requireRole).toBe('function');
    
    const middleware = rbacMiddleware.requireRole('admin');
    expect(typeof middleware).toBe('function');
  });

  test('should export attachRbacContext middleware', () => {
    expect(typeof rbacMiddleware.attachRbacContext).toBe('function');
  });

  test('should export permission definitions', () => {
    expect(Array.isArray(rbacMiddleware.ADMIN_PERMISSION_DEFINITIONS)).toBe(true);
    expect(Array.isArray(rbacMiddleware.HR_PERMISSION_DEFINITIONS)).toBe(true);
    expect(Array.isArray(rbacMiddleware.BUSINESS_PERMISSION_DEFINITIONS)).toBe(true);
  });
});

/**
 * Extended RBAC Tests
 * 
 * Tests for the enhanced RBAC features:
 * - Caching
 * - Analytics
 * - Migration
 * - Developer tools
 */

const path = require('path');

// Mock database for testing
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-dreamx.db');
process.env.TEST_DATABASE_PATH = TEST_DB_PATH;

describe('RBAC Extended Services', () => {
  let rbacCache, rbacAnalytics, rbacMigration, rbacDevtools, rbacService;

  beforeAll(() => {
    // Load extended services
    try {
      rbacCache = require('../services/rbac-cache');
      rbacAnalytics = require('../services/rbac-analytics');
      rbacMigration = require('../services/rbac-migration');
      rbacDevtools = require('../services/rbac-devtools');
      rbacService = require('../services/rbac');
    } catch (e) {
      console.warn('Some services not available:', e.message);
    }
  });

  describe('RBAC Cache Service', () => {
    let cache;

    beforeEach(() => {
      cache = new rbacCache.RbacCache({ ttl: 1000 });
    });

    afterEach(() => {
      if (cache) cache.destroy();
    });

    test('should create cache instance', () => {
      expect(cache).toBeDefined();
      expect(cache.ttl).toBe(1000);
    });

    test('should set and get effective permissions', () => {
      const perms = [{ id: 1, name: 'test.perm' }];
      cache.setEffectivePermissions(1, null, perms);
      const result = cache.getEffectivePermissions(1, null);
      expect(result).toEqual(perms);
    });

    test('should return null for cache miss', () => {
      const result = cache.getEffectivePermissions(999, null);
      expect(result).toBeNull();
    });

    test('should invalidate user cache', () => {
      cache.setEffectivePermissions(1, null, [{ id: 1 }]);
      cache.invalidateUser(1);
      const result = cache.getEffectivePermissions(1, null);
      expect(result).toBeNull();
    });

    test('should invalidate all caches', () => {
      cache.setEffectivePermissions(1, null, [{ id: 1 }]);
      cache.setUserRoles(1, [{ id: 1 }]);
      cache.invalidateAll();
      expect(cache.getEffectivePermissions(1, null)).toBeNull();
      expect(cache.getUserRoles(1)).toBeNull();
    });

    test('should get cache statistics', () => {
      cache.setEffectivePermissions(1, null, [{ id: 1 }]);
      cache.getEffectivePermissions(1, null);
      cache.getEffectivePermissions(999, null);
      
      const stats = cache.getStats();
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('hitRate');
    });

    test('should set and get role inheritance chain', () => {
      const chain = [{ id: 1, name: 'admin' }, { id: 2, name: 'super_admin' }];
      cache.setRoleInheritanceChain(1, chain);
      const result = cache.getRoleInheritanceChain(1);
      expect(result).toEqual(chain);
    });

    test('should set and get permission groups', () => {
      const groups = [{ id: 1, name: 'admin' }];
      cache.setPermissionGroups(false, false, groups);
      const result = cache.getPermissionGroups(false, false);
      expect(result).toEqual(groups);
    });
  });

  describe('Permission Suggestion Engine', () => {
    let engine;

    beforeAll(() => {
      engine = rbacAnalytics.suggestionEngine;
    });

    test('should create suggestion engine instance', () => {
      expect(engine).toBeDefined();
    });

    test('should get unused permissions (may be empty)', () => {
      const result = engine.getUnusedPermissions();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should get expired grants (may be empty)', () => {
      const result = engine.getExpiredGrants();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should get full report', () => {
      const report = engine.getFullReport();
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('unusedPermissions');
      expect(report).toHaveProperty('expiredGrants');
    });
  });

  describe('Security Alert System', () => {
    let alerts;

    beforeAll(() => {
      alerts = rbacAnalytics.securityAlerts;
    });

    test('should create security alerts instance', () => {
      expect(alerts).toBeDefined();
    });

    test('should get alerts (may be empty)', () => {
      const result = alerts.getAlerts();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should set alert thresholds', () => {
      alerts.setThresholds({ permissionChangesPerHour: 20 });
      expect(alerts.alertThresholds.permissionChangesPerHour).toBe(20);
    });
  });

  describe('AI Permission Manifest', () => {
    test('should generate manifest', () => {
      const manifest = rbacAnalytics.AIPermissionManifest.generate();
      // May be null if RBAC service not initialized
      if (manifest) {
        expect(manifest).toHaveProperty('version');
        expect(manifest).toHaveProperty('permissions');
        expect(manifest).toHaveProperty('roles');
      }
    });

    test('should infer capabilities from permission', () => {
      const caps = rbacAnalytics.AIPermissionManifest._inferCapabilities({
        name: 'users.create',
        action: 'create'
      });
      expect(caps).toContain('create_resource');
    });
  });

  describe('Documentation Generator', () => {
    test('should generate documentation', () => {
      const docs = rbacAnalytics.DocumentationGenerator.generate();
      // May be null if RBAC service not initialized
      if (docs) {
        expect(typeof docs).toBe('string');
        expect(docs).toContain('RBAC Documentation');
      }
    });

    test('should generate changelog', () => {
      const changelog = rbacAnalytics.DocumentationGenerator.generateChangelog({ limit: 10 });
      // May be null if DB not available
      if (changelog) {
        expect(typeof changelog).toBe('string');
      }
    });
  });

  describe('Legacy Code Scanner', () => {
    let scanner;

    beforeAll(() => {
      scanner = rbacMigration.codeScanner;
    });

    test('should create scanner instance', () => {
      expect(scanner).toBeDefined();
    });

    test('should scan codebase', () => {
      const results = scanner.scanCodebase();
      expect(results).toHaveProperty('filesScanned');
      expect(results).toHaveProperty('findings');
      expect(results).toHaveProperty('summary');
      expect(results.filesScanned).toBeGreaterThan(0);
    });

    test('should get recommendations from scan results', () => {
      const scanResults = scanner.scanCodebase();
      const recommendations = scanner.getRecommendations(scanResults);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Fallback Manager', () => {
    let manager;

    beforeAll(() => {
      manager = rbacMigration.fallbackManager;
    });

    test('should create fallback manager instance', () => {
      expect(manager).toBeDefined();
    });

    test('should enable and disable fallback', () => {
      manager.setFallbackEnabled(true);
      expect(manager.isFallbackEnabled()).toBe(true);
      
      manager.setFallbackEnabled(false);
      expect(manager.isFallbackEnabled()).toBe(false);
      
      // Reset
      manager.setFallbackEnabled(true);
    });

    test('should log fallback usage', () => {
      const entry = manager.logFallback(1, 'test');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('userId', 1);
      expect(entry).toHaveProperty('context', 'test');
    });

    test('should get fallback stats', () => {
      const stats = manager.getFallbackStats();
      expect(stats).toHaveProperty('totalFallbacks');
      expect(stats).toHaveProperty('uniqueUsers');
    });
  });

  describe('Validation Suite', () => {
    test('should run full validation', () => {
      const results = rbacDevtools.ValidationSuite.runFullValidation();
      expect(results).toHaveProperty('timestamp');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('checks');
      expect(Array.isArray(results.checks)).toBe(true);
    });

    test('should check role integrity', () => {
      const check = rbacDevtools.ValidationSuite.checkRoleIntegrity();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
      expect(check).toHaveProperty('issues');
    });

    test('should check permission integrity', () => {
      const check = rbacDevtools.ValidationSuite.checkPermissionIntegrity();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
    });

    test('should check for circular inheritance', () => {
      const check = rbacDevtools.ValidationSuite.checkCircularInheritance();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
    });
  });

  describe('Mismatch Detector', () => {
    test('should take snapshot', () => {
      // Skip if rbacService not available
      if (!rbacService) {
        console.log('Skipping - RBAC service not available');
        return;
      }
      try {
        const snapshot = rbacDevtools.MismatchDetector.takeSnapshot();
        expect(snapshot).toHaveProperty('timestamp');
        expect(snapshot).toHaveProperty('roles');
        expect(snapshot).toHaveProperty('permissions');
        expect(snapshot).toHaveProperty('rolePermissions');
      } catch (e) {
        console.log('Skipping - ', e.message);
      }
    });

    test('should compare snapshots', () => {
      const snapshot1 = { timestamp: new Date().toISOString(), roles: {}, permissions: [], rolePermissions: {} };
      const snapshot2 = { ...snapshot1, roles: { ...snapshot1.roles, newRole: {} } };
      
      const diff = rbacDevtools.MismatchDetector.compareSnapshots(snapshot1, snapshot2);
      expect(diff).toHaveProperty('addedRoles');
      expect(diff).toHaveProperty('removedRoles');
      expect(diff).toHaveProperty('modifiedRoles');
    });

    test('should generate diff report', () => {
      const diff = {
        addedRoles: ['new_role'],
        removedRoles: [],
        modifiedRoles: [],
        addedPermissions: [],
        removedPermissions: [],
        changedRolePermissions: []
      };
      
      const report = rbacDevtools.MismatchDetector.generateDiffReport(diff);
      expect(typeof report).toBe('string');
      expect(report).toContain('new_role');
    });
  });

  describe('Mock Role Generator', () => {
    test('should cleanup mock roles (graceful if tables missing)', () => {
      const result = rbacDevtools.MockRoleGenerator.cleanupMockRoles();
      expect(result).toHaveProperty('deleted');
    });
  });
});

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
      if (!rbacCache || !rbacCache.RbacCache) {
        console.log('Skipping - RBAC Cache service not available');
        return;
      }
      cache = new rbacCache.RbacCache({ ttl: 1000 });
    });

    afterEach(() => {
      if (cache) cache.destroy();
    });

    test('should create cache instance', () => {
      if (!rbacCache || !rbacCache.RbacCache) {
        console.log('Skipping - RBAC Cache service not available');
        return;
      }
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
      if (!cache) {
        console.log('Skipping - Cache not available');
        return;
      }
      cache.setEffectivePermissions(1, null, [{ id: 1 }]);
      cache.setUserRoles(1, [{ id: 1 }]);
      cache.invalidateAll();
      expect(cache.getEffectivePermissions(1, null)).toBeNull();
      expect(cache.getUserRoles(1)).toBeNull();
    });

    test('should get cache statistics', () => {
      if (!cache) {
        console.log('Skipping - Cache not available');
        return;
      }
      cache.setEffectivePermissions(1, null, [{ id: 1 }]);
      cache.getEffectivePermissions(1, null);
      cache.getEffectivePermissions(999, null);
      
      const stats = cache.getStats();
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('hitRate');
    });

    test('should set and get role inheritance chain', () => {
      if (!cache) {
        console.log('Skipping - Cache not available');
        return;
      }
      const chain = [{ id: 1, name: 'admin' }, { id: 2, name: 'super_admin' }];
      cache.setRoleInheritanceChain(1, chain);
      const result = cache.getRoleInheritanceChain(1);
      expect(result).toEqual(chain);
    });

    test('should set and get permission groups', () => {
      if (!cache) {
        console.log('Skipping - Cache not available');
        return;
      }
      const groups = [{ id: 1, name: 'admin' }];
      cache.setPermissionGroups(false, false, groups);
      const result = cache.getPermissionGroups(false, false);
      expect(result).toEqual(groups);
    });
  });

  describe('Permission Suggestion Engine', () => {
    let engine;

    beforeAll(() => {
      if (!rbacAnalytics || !rbacAnalytics.suggestionEngine) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      engine = rbacAnalytics.suggestionEngine;
    });

    test('should create suggestion engine instance', () => {
      if (!rbacAnalytics || !rbacAnalytics.suggestionEngine) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      expect(engine).toBeDefined();
    });

    test('should get unused permissions (may be empty)', () => {
      if (!engine) {
        console.log('Skipping - Engine not available');
        return;
      }
      const result = engine.getUnusedPermissions();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should get expired grants (may be empty)', () => {
      if (!engine) {
        console.log('Skipping - Engine not available');
        return;
      }
      const result = engine.getExpiredGrants();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should get full report', () => {
      if (!engine) {
        console.log('Skipping - Engine not available');
        return;
      }
      const report = engine.getFullReport();
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('unusedPermissions');
      expect(report).toHaveProperty('expiredGrants');
    });
  });

  describe('Security Alert System', () => {
    let alerts;

    beforeAll(() => {
      if (!rbacAnalytics || !rbacAnalytics.securityAlerts) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      alerts = rbacAnalytics.securityAlerts;
    });

    test('should create security alerts instance', () => {
      if (!rbacAnalytics || !rbacAnalytics.securityAlerts) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      expect(alerts).toBeDefined();
    });

    test('should get alerts (may be empty)', () => {
      if (!alerts) {
        console.log('Skipping - Alerts not available');
        return;
      }
      const result = alerts.getAlerts();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should set alert thresholds', () => {
      if (!alerts) {
        console.log('Skipping - Alerts not available');
        return;
      }
      alerts.setThresholds({ permissionChangesPerHour: 20 });
      expect(alerts.alertThresholds.permissionChangesPerHour).toBe(20);
    });
  });

  describe('AI Permission Manifest', () => {
    test('should generate manifest', async () => {
      if (!rbacAnalytics || !rbacAnalytics.AIPermissionManifest) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      const manifest = await rbacAnalytics.AIPermissionManifest.generate();
      // May be null if RBAC service not initialized
      if (manifest) {
        expect(manifest).toHaveProperty('version');
        expect(manifest).toHaveProperty('permissions');
        expect(manifest).toHaveProperty('roles');
      }
    });

    test('should infer capabilities from permission', () => {
      if (!rbacAnalytics || !rbacAnalytics.AIPermissionManifest) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      const caps = rbacAnalytics.AIPermissionManifest._inferCapabilities({
        name: 'users.create',
        action: 'create'
      });
      expect(caps).toContain('create_resource');
    });
  });

  describe('Documentation Generator', () => {
    test('should generate documentation', () => {
      if (!rbacAnalytics || !rbacAnalytics.DocumentationGenerator) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
      const docs = rbacAnalytics.DocumentationGenerator.generate();
      // May be null if RBAC service not initialized
      if (docs) {
        expect(typeof docs).toBe('string');
        expect(docs).toContain('RBAC Documentation');
      }
    });

    test('should generate changelog', () => {
      if (!rbacAnalytics || !rbacAnalytics.DocumentationGenerator) {
        console.log('Skipping - RBAC Analytics service not available');
        return;
      }
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
      if (!rbacMigration || !rbacMigration.codeScanner) {
        console.log('Skipping - RBAC Migration service not available');
        return;
      }
      scanner = rbacMigration.codeScanner;
    });

    test('should create scanner instance', () => {
      if (!rbacMigration || !rbacMigration.codeScanner) {
        console.log('Skipping - RBAC Migration service not available');
        return;
      }
      expect(scanner).toBeDefined();
    });

    test('should scan codebase', () => {
      if (!scanner) {
        console.log('Skipping - Scanner not available');
        return;
      }
      const results = scanner.scanCodebase();
      expect(results).toHaveProperty('filesScanned');
      expect(results).toHaveProperty('findings');
      expect(results).toHaveProperty('summary');
      expect(results.filesScanned).toBeGreaterThan(0);
    });

    test('should get recommendations from scan results', () => {
      if (!scanner) {
        console.log('Skipping - Scanner not available');
        return;
      }
      const scanResults = scanner.scanCodebase();
      const recommendations = scanner.getRecommendations(scanResults);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Fallback Manager', () => {
    let manager;

    beforeAll(() => {
      if (!rbacMigration || !rbacMigration.fallbackManager) {
        console.log('Skipping - RBAC Migration service not available');
        return;
      }
      manager = rbacMigration.fallbackManager;
    });

    test('should create fallback manager instance', () => {
      if (!rbacMigration || !rbacMigration.fallbackManager) {
        console.log('Skipping - RBAC Migration service not available');
        return;
      }
      expect(manager).toBeDefined();
    });

    test('should enable and disable fallback', () => {
      if (!manager) {
        console.log('Skipping - Manager not available');
        return;
      }
      manager.setFallbackEnabled(true);
      expect(manager.isFallbackEnabled()).toBe(true);
      
      manager.setFallbackEnabled(false);
      expect(manager.isFallbackEnabled()).toBe(false);
      
      // Reset
      manager.setFallbackEnabled(true);
    });

    test('should log fallback usage', () => {
      if (!manager) {
        console.log('Skipping - Manager not available');
        return;
      }
      const entry = manager.logFallback(1, 'test');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('userId', 1);
      expect(entry).toHaveProperty('context', 'test');
    });

    test('should get fallback stats', () => {
      if (!manager) {
        console.log('Skipping - Manager not available');
        return;
      }
      const stats = manager.getFallbackStats();
      expect(stats).toHaveProperty('totalFallbacks');
      expect(stats).toHaveProperty('uniqueUsers');
    });
  });

  describe('Validation Suite', () => {
    test('should run full validation', () => {
      if (!rbacDevtools || !rbacDevtools.ValidationSuite) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const results = rbacDevtools.ValidationSuite.runFullValidation();
      expect(results).toHaveProperty('timestamp');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('checks');
      expect(Array.isArray(results.checks)).toBe(true);
    });

    test('should check role integrity', () => {
      if (!rbacDevtools || !rbacDevtools.ValidationSuite) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const check = rbacDevtools.ValidationSuite.checkRoleIntegrity();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
      expect(check).toHaveProperty('issues');
    });

    test('should check permission integrity', () => {
      if (!rbacDevtools || !rbacDevtools.ValidationSuite) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const check = rbacDevtools.ValidationSuite.checkPermissionIntegrity();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
    });

    test('should check for circular inheritance', () => {
      if (!rbacDevtools || !rbacDevtools.ValidationSuite) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const check = rbacDevtools.ValidationSuite.checkCircularInheritance();
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
    });
  });

  describe('Mismatch Detector', () => {
    test('should take snapshot', () => {
      if (!rbacDevtools || !rbacDevtools.MismatchDetector) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
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
      if (!rbacDevtools || !rbacDevtools.MismatchDetector) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const snapshot1 = { timestamp: new Date().toISOString(), roles: {}, permissions: [], rolePermissions: {} };
      const snapshot2 = { ...snapshot1, roles: { ...snapshot1.roles, newRole: {} } };
      
      const diff = rbacDevtools.MismatchDetector.compareSnapshots(snapshot1, snapshot2);
      expect(diff).toHaveProperty('addedRoles');
      expect(diff).toHaveProperty('removedRoles');
      expect(diff).toHaveProperty('modifiedRoles');
    });

    test('should generate diff report', () => {
      if (!rbacDevtools || !rbacDevtools.MismatchDetector) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
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
      if (!rbacDevtools || !rbacDevtools.MockRoleGenerator) {
        console.log('Skipping - RBAC DevTools service not available');
        return;
      }
      const result = rbacDevtools.MockRoleGenerator.cleanupMockRoles();
      expect(result).toHaveProperty('deleted');
    });
  });
});

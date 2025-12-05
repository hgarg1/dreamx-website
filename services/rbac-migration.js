/**
 * RBAC Migration and Compatibility Layer
 * 
 * Provides:
 * - Legacy code scanner for hardcoded permission checks
 * - Migration utilities for legacy mappings
 * - Safe fallback mode for legacy logic
 * - Codebase analysis for permission patterns
 */

const fs = require('fs');
const path = require('path');

// Lazy load dependencies
let db = null;
let rbacService = null;

function initDependencies() {
  if (!db) {
    try {
      const dbModule = require('../db');
      db = dbModule.db;
    } catch (e) {
      console.warn('RBAC Migration: Database not available');
    }
  }
  if (!rbacService) {
    try {
      rbacService = require('./rbac');
    } catch (e) {
      console.warn('RBAC Migration: RBAC service not available');
    }
  }
}

/**
 * Legacy Code Scanner
 * Scans codebase for hardcoded permission checks and deprecated patterns
 */
class LegacyCodeScanner {
  constructor(rootDir = null) {
    this.rootDir = rootDir || path.join(__dirname, '..');
    this.patterns = {
      // Role checks in code
      hardcodedRoles: [
        /user\.role\s*===?\s*['"`](admin|super_admin|global_admin|hr|super_hr|global_hr|business_admin)['"`]/gi,
        /role\s*===?\s*['"`](admin|super_admin|global_admin|hr|super_hr|global_hr|business_admin)['"`]/gi,
        /isAdmin\s*\(/gi,
        /isSuperAdmin\s*\(/gi,
        /isGlobalAdmin\s*\(/gi,
        /isHR\s*\(/gi,
        /isSuperHR\s*\(/gi,
        /isGlobalHR\s*\(/gi,
        /isBusinessAdmin\s*\(/gi
      ],
      // Permission checks in code
      hardcodedPermissions: [
        /hasPermission\s*\([^,]+,\s*['"`](\w+)['"`]\)/gi,
        /admin_permissions.*includes\s*\(['"`](\w+)['"`]\)/gi,
        /permissions\.includes\s*\(['"`](\w+)['"`]\)/gi
      ],
      // Legacy middleware patterns
      legacyMiddleware: [
        /requireAdmin/gi,
        /requireSuperAdmin/gi,
        /requireHR/gi,
        /requireBusinessAdmin/gi,
        /requireAdminOrHR/gi
      ],
      // Admin permission definitions
      adminPermissionDefs: [
        /ADMIN_PERMISSION_DEFINITIONS/gi,
        /HR_PERMISSION_DEFINITIONS/gi,
        /BUSINESS_PERMISSION_DEFINITIONS/gi,
        /ADMIN_PERMISSION_KEYS/gi,
        /HR_PERMISSION_KEYS/gi
      ],
      // Scope checks
      scopeChecks: [
        /admin_scopes/gi,
        /HR_PAGE_SCOPES/gi,
        /requireScope/gi
      ]
    };
    
    this.excludeDirs = ['node_modules', '.git', 'build', 'dist', 'coverage', 'data', 'logs'];
    this.includeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.ejs'];
  }

  /**
   * Scan entire codebase for legacy patterns
   */
  scanCodebase() {
    const results = {
      scannedAt: new Date().toISOString(),
      filesScanned: 0,
      findings: [],
      summary: {
        hardcodedRoles: 0,
        hardcodedPermissions: 0,
        legacyMiddleware: 0,
        adminPermissionDefs: 0,
        scopeChecks: 0
      }
    };

    this._scanDirectory(this.rootDir, results);

    // Generate summary
    for (const finding of results.findings) {
      results.summary[finding.category] = (results.summary[finding.category] || 0) + 1;
    }

    return results;
  }

  /**
   * Recursively scan directory
   */
  _scanDirectory(dir, results) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.excludeDirs.includes(entry.name)) {
            this._scanDirectory(fullPath, results);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.includeExtensions.includes(ext)) {
            this._scanFile(fullPath, results);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to scan directory ${dir}:`, e.message);
    }
  }

  /**
   * Scan individual file
   */
  _scanFile(filePath, results) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(this.rootDir, filePath);

      results.filesScanned++;

      for (const [category, patterns] of Object.entries(this.patterns)) {
        for (const pattern of patterns) {
          // Reset regex state
          pattern.lastIndex = 0;
          
          let match;
          while ((match = pattern.exec(content)) !== null) {
            // Find line number
            const beforeMatch = content.substring(0, match.index);
            const lineNumber = beforeMatch.split('\n').length;
            const line = lines[lineNumber - 1] || '';

            results.findings.push({
              file: relativePath,
              line: lineNumber,
              column: match.index - beforeMatch.lastIndexOf('\n'),
              category,
              match: match[0],
              context: line.trim().substring(0, 100),
              pattern: pattern.source
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to scan file ${filePath}:`, e.message);
    }
  }

  /**
   * Get migration recommendations based on scan results
   */
  getRecommendations(scanResults) {
    const recommendations = [];

    // Group findings by category
    const byCategory = {};
    for (const finding of scanResults.findings) {
      if (!byCategory[finding.category]) {
        byCategory[finding.category] = [];
      }
      byCategory[finding.category].push(finding);
    }

    // Generate recommendations
    if (byCategory.hardcodedRoles?.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'hardcodedRoles',
        title: 'Replace hardcoded role checks with RBAC',
        description: `Found ${byCategory.hardcodedRoles.length} hardcoded role checks. Replace with rbac.hasRole() or rbac.hasPermission() calls.`,
        files: [...new Set(byCategory.hardcodedRoles.map(f => f.file))],
        example: {
          before: 'if (user.role === "admin") { ... }',
          after: 'if (rbac.hasPermission(user.id, "admin.manage_users")) { ... }'
        }
      });
    }

    if (byCategory.hardcodedPermissions?.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'hardcodedPermissions',
        title: 'Update permission strings to use RBAC naming',
        description: `Found ${byCategory.hardcodedPermissions.length} permission checks. Ensure permission names match RBAC schema.`,
        files: [...new Set(byCategory.hardcodedPermissions.map(f => f.file))]
      });
    }

    if (byCategory.legacyMiddleware?.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'legacyMiddleware',
        title: 'Replace legacy middleware with RBAC middleware',
        description: `Found ${byCategory.legacyMiddleware.length} uses of legacy middleware. Replace with requirePermission() or requireRole() from middleware/rbac.js.`,
        files: [...new Set(byCategory.legacyMiddleware.map(f => f.file))],
        example: {
          before: 'router.get("/admin", requireAdmin, ...)',
          after: 'router.get("/admin", requirePermission("admin.manage_users"), ...)'
        }
      });
    }

    if (byCategory.scopeChecks?.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'scopeChecks',
        title: 'Migrate scopes to RBAC role scoping',
        description: `Found ${byCategory.scopeChecks.length} scope-related patterns. Consider using RBAC role scopes instead of admin_scopes JSON.`,
        files: [...new Set(byCategory.scopeChecks.map(f => f.file))]
      });
    }

    return recommendations;
  }
}

/**
 * Legacy Migration Utilities
 * Handles migration of legacy roles/permissions to RBAC schema
 */
class LegacyMigration {
  /**
   * Get all legacy role mappings
   */
  static getLegacyMappings() {
    initDependencies();
    if (!db) return [];

    try {
      return db.prepare(`
        SELECT lm.*, r.name as rbac_role_name, r.display_name as rbac_role_display_name
        FROM rbac_legacy_mapping lm
        JOIN rbac_roles r ON r.id = lm.rbac_role_id
        ORDER BY lm.legacy_role
      `).all();
    } catch (e) {
      console.warn('Failed to get legacy mappings:', e.message);
      return [];
    }
  }

  /**
   * Get users still using legacy roles (not migrated to RBAC)
   */
  static getUnmigratedUsers() {
    initDependencies();
    if (!db) return [];

    try {
      return db.prepare(`
        SELECT u.id, u.email, u.full_name, u.role, u.admin_permissions, u.admin_scopes
        FROM users u
        WHERE u.role != 'user'
        AND NOT EXISTS (
          SELECT 1 FROM rbac_user_roles ur WHERE ur.user_id = u.id
        )
        ORDER BY u.role, u.email
      `).all();
    } catch (e) {
      console.warn('Failed to get unmigrated users:', e.message);
      return [];
    }
  }

  /**
   * Migrate a user from legacy roles to RBAC
   */
  static migrateUser(userId) {
    initDependencies();
    if (!db || !rbacService) {
      return { success: false, error: 'Dependencies not available' };
    }

    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if already migrated
      const existingRoles = rbacService.getUserRoles(userId);
      if (existingRoles.length > 0) {
        return { success: false, error: 'User already has RBAC roles', existingRoles };
      }

      // Map legacy role to RBAC role
      const mapping = rbacService.mapLegacyRole(user.role || 'user');
      if (!mapping) {
        // Fallback to 'user' role
        const userRole = rbacService.getRoleByName('user');
        if (userRole) {
          rbacService.assignRoleToUser(userId, userRole.id, { isPrimary: true });
          return { success: true, assignedRole: 'user', reason: 'Fallback to user role' };
        }
        return { success: false, error: 'No matching RBAC role found' };
      }

      // Assign the mapped role
      rbacService.assignRoleToUser(userId, mapping.rbac_role_id, { isPrimary: true });

      // Migrate legacy permissions as overrides if needed
      let migratedPermissions = 0;
      if (user.admin_permissions) {
        try {
          const legacyPerms = JSON.parse(user.admin_permissions);
          for (const permKey of legacyPerms) {
            // Try to find matching RBAC permission
            const variants = [
              `admin.${permKey}`,
              `hr.${permKey}`,
              `business.${permKey}`,
              permKey
            ];

            for (const variant of variants) {
              const permission = rbacService.getPermissionByName(variant);
              if (permission) {
                // Check if role already has this permission
                const rolePerms = rbacService.getRolePermissions(mapping.rbac_role_id);
                if (!rolePerms.some(p => p.id === permission.id)) {
                  // Grant as override
                  rbacService.grantUserOverride(userId, permission.id, {
                    reason: 'Migrated from legacy admin_permissions',
                    isTemporary: false
                  });
                  migratedPermissions++;
                }
                break;
              }
            }
          }
        } catch (e) {
          console.warn('Failed to parse legacy permissions:', e.message);
        }
      }

      return {
        success: true,
        assignedRole: mapping.rbac_role_name,
        migratedPermissions
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Bulk migrate all unmigrated users
   */
  static migrateAllUsers() {
    const users = LegacyMigration.getUnmigratedUsers();
    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      details: []
    };

    for (const user of users) {
      const result = LegacyMigration.migrateUser(user.id);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }
      results.details.push({
        userId: user.id,
        email: user.email,
        legacyRole: user.role,
        ...result
      });
    }

    return results;
  }

  /**
   * Create legacy mapping for a role
   */
  static createLegacyMapping(legacyRole, rbacRoleId, legacyPermissions = []) {
    initDependencies();
    if (!rbacService) {
      return { success: false, error: 'RBAC service not available' };
    }

    try {
      rbacService.createLegacyMapping({ legacyRole, rbacRoleId, legacyPermissions });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Generate migration report
   */
  static generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      legacyMappings: LegacyMigration.getLegacyMappings(),
      unmigratedUsers: LegacyMigration.getUnmigratedUsers(),
      statistics: {}
    };

    initDependencies();
    if (db) {
      try {
        // Count users by migration status
        const migrated = db.prepare(`
          SELECT COUNT(DISTINCT ur.user_id) as count 
          FROM rbac_user_roles ur
        `).get();
        
        const total = db.prepare(`
          SELECT COUNT(*) as count FROM users WHERE role != 'user'
        `).get();

        report.statistics = {
          totalAdminUsers: total.count,
          migratedUsers: migrated.count,
          unmigratedUsers: report.unmigratedUsers.length,
          migrationProgress: total.count > 0 
            ? ((migrated.count / total.count) * 100).toFixed(1) + '%'
            : '100%'
        };
      } catch (e) {
        console.warn('Failed to get migration statistics:', e.message);
      }
    }

    return report;
  }
}

/**
 * Fallback Mode Manager
 * Handles safe fallback to legacy logic during migration
 */
class FallbackManager {
  constructor() {
    this.fallbackEnabled = true;
    this.fallbackLog = [];
    this.maxLogSize = 1000;
  }

  /**
   * Enable or disable fallback mode
   */
  setFallbackEnabled(enabled) {
    this.fallbackEnabled = enabled;
    initDependencies();
    if (db) {
      try {
        db.prepare(`
          INSERT OR REPLACE INTO rbac_settings (key, value, updated_at)
          VALUES ('fallback_enabled', ?, CURRENT_TIMESTAMP)
        `).run(enabled ? '1' : '0');
      } catch (e) {
        // Settings table might not exist, that's okay
      }
    }
  }

  /**
   * Check if fallback is enabled
   */
  isFallbackEnabled() {
    return this.fallbackEnabled;
  }

  /**
   * Log a fallback usage
   */
  logFallback(userId, context) {
    const entry = {
      timestamp: new Date().toISOString(),
      userId,
      context
    };

    this.fallbackLog.push(entry);
    
    // Trim log if too large
    if (this.fallbackLog.length > this.maxLogSize) {
      this.fallbackLog = this.fallbackLog.slice(-this.maxLogSize / 2);
    }

    return entry;
  }

  /**
   * Get fallback usage statistics
   */
  getFallbackStats() {
    const byUser = {};
    const byContext = {};

    for (const entry of this.fallbackLog) {
      byUser[entry.userId] = (byUser[entry.userId] || 0) + 1;
      byContext[entry.context] = (byContext[entry.context] || 0) + 1;
    }

    return {
      totalFallbacks: this.fallbackLog.length,
      uniqueUsers: Object.keys(byUser).length,
      byUser,
      byContext,
      recentFallbacks: this.fallbackLog.slice(-10)
    };
  }

  /**
   * Check permission with fallback to legacy
   */
  checkPermissionWithFallback(user, permission, rbacCheck, legacyCheck) {
    // Try RBAC first
    try {
      const rbacResult = rbacCheck();
      if (rbacResult !== null && rbacResult !== undefined) {
        return rbacResult;
      }
    } catch (e) {
      console.warn('RBAC check failed, falling back:', e.message);
    }

    // Fall back to legacy if enabled
    if (this.fallbackEnabled && legacyCheck) {
      this.logFallback(user?.id, `permission:${permission}`);
      return legacyCheck();
    }

    return false;
  }
}

// Export classes and singleton instances
module.exports = {
  LegacyCodeScanner,
  LegacyMigration,
  FallbackManager,
  
  // Singleton instances
  codeScanner: new LegacyCodeScanner(),
  fallbackManager: new FallbackManager()
};

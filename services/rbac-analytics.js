/**
 * RBAC Analytics and Security Monitoring Service
 * 
 * Provides:
 * - Permission suggestion engine (unused/missing permissions)
 * - Security alerts for unusual changes
 * - Compliance reporting
 * - AI permission manifest generation
 */

const path = require('path');

// Detect production environment for PostgreSQL compatibility
const isProduction = process.env.NODE_ENV === 'Production' && (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql');

// Lazy load database and rbac service
let db = null;
let rbacService = null;

function initDependencies() {
  if (!db) {
    try {
      const dbModule = require('../db');
      db = dbModule.db;
    } catch (e) {
      console.warn('RBAC Analytics: Database not available');
    }
  }
  if (!rbacService) {
    try {
      rbacService = require('./rbac');
    } catch (e) {
      console.warn('RBAC Analytics: RBAC service not available');
    }
  }
}

/**
 * Permission Suggestion Engine
 * Analyzes permission usage and suggests optimizations
 */
class PermissionSuggestionEngine {
  constructor() {
    this.analysisCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get unused permissions (permissions not assigned to any role)
   */
  getUnusedPermissions() {
    initDependencies();
    if (!db) return [];

    try {
      return db.prepare(`
        SELECT p.id, p.name, p.display_name, p.module, p.created_at
        FROM rbac_permissions p
        WHERE p.deleted_at IS NULL
        AND p.is_enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM rbac_role_permissions rp WHERE rp.permission_id = p.id
        )
        ORDER BY p.module, p.name
      `).all();
    } catch (e) {
      console.warn('Failed to get unused permissions:', e.message);
      return [];
    }
  }

  /**
   * Get orphaned role permissions (permissions on disabled/deleted roles)
   */
  getOrphanedPermissions() {
    initDependencies();
    if (!db) return [];

    try {
      return db.prepare(`
        SELECT rp.*, p.name as permission_name, r.name as role_name, r.is_enabled as role_enabled
        FROM rbac_role_permissions rp
        JOIN rbac_permissions p ON p.id = rp.permission_id
        JOIN rbac_roles r ON r.id = rp.role_id
        WHERE r.deleted_at IS NOT NULL OR r.is_enabled = 0
      `).all();
    } catch (e) {
      console.warn('Failed to get orphaned permissions:', e.message);
      return [];
    }
  }

  /**
   * Get expired permission grants (temporary grants that have expired)
   */
  getExpiredGrants() {
    initDependencies();
    if (!db) return [];

    try {
      const rolePerms = db.prepare(`
        SELECT rp.*, p.name as permission_name, r.name as role_name, 'role' as grant_type
        FROM rbac_role_permissions rp
        JOIN rbac_permissions p ON p.id = rp.permission_id
        JOIN rbac_roles r ON r.id = rp.role_id
        WHERE rp.expires_at IS NOT NULL AND rp.expires_at < CURRENT_TIMESTAMP
      `).all();

      const userOverrides = db.prepare(`
        SELECT uo.*, p.name as permission_name, u.email as user_email, 'override' as grant_type
        FROM rbac_user_overrides uo
        JOIN rbac_permissions p ON p.id = uo.permission_id
        JOIN users u ON u.id = uo.user_id
        WHERE uo.expires_at IS NOT NULL AND uo.expires_at < CURRENT_TIMESTAMP
      `).all();

      return [...rolePerms, ...userOverrides];
    } catch (e) {
      console.warn('Failed to get expired grants:', e.message);
      return [];
    }
  }

  /**
   * Get permission coverage analysis
   * Shows which resources/actions have no permissions defined
   */
  getPermissionCoverage() {
    initDependencies();
    if (!db) return { covered: [], uncovered: [] };

    try {
      const permissions = db.prepare(`
        SELECT DISTINCT module, resource, action 
        FROM rbac_permissions 
        WHERE deleted_at IS NULL AND is_enabled = 1
      `).all();

      // Standard CRUD actions
      const standardActions = ['create', 'read', 'update', 'delete', 'list', 'view', 'manage'];
      
      // Get unique modules/resources
      const modules = new Map();
      for (const p of permissions) {
        if (!modules.has(p.module)) {
          modules.set(p.module, new Set());
        }
        if (p.resource) {
          modules.get(p.module).add(p.resource);
        }
      }

      const covered = [];
      const uncovered = [];

      for (const [module, resources] of modules) {
        for (const resource of resources) {
          const resourcePerms = permissions.filter(p => p.module === module && p.resource === resource);
          const definedActions = new Set(resourcePerms.map(p => p.action).filter(Boolean));
          
          for (const action of standardActions) {
            if (definedActions.has(action)) {
              covered.push({ module, resource, action });
            } else {
              uncovered.push({ module, resource, action });
            }
          }
        }
      }

      return { covered, uncovered };
    } catch (e) {
      console.warn('Failed to get permission coverage:', e.message);
      return { covered: [], uncovered: [] };
    }
  }

  /**
   * Get role simplification suggestions
   * Finds roles that could be consolidated
   */
  getRoleSimplificationSuggestions() {
    initDependencies();
    if (!db || !rbacService) return [];

    const suggestions = [];

    try {
      const roles = rbacService.getRoles({ includeDisabled: false });
      
      // Compare permission sets between roles
      for (let i = 0; i < roles.length; i++) {
        for (let j = i + 1; j < roles.length; j++) {
          const roleA = roles[i];
          const roleB = roles[j];
          
          const permsA = rbacService.getRolePermissions(roleA.id);
          const permsB = rbacService.getRolePermissions(roleB.id);
          
          const setA = new Set(permsA.map(p => p.id));
          const setB = new Set(permsB.map(p => p.id));
          
          // Check for subset relationship
          const aSubsetOfB = [...setA].every(id => setB.has(id));
          const bSubsetOfA = [...setB].every(id => setA.has(id));
          
          if (setA.size === setB.size && aSubsetOfB) {
            suggestions.push({
              type: 'duplicate',
              roles: [roleA.name, roleB.name],
              message: `Roles "${roleA.name}" and "${roleB.name}" have identical permissions`
            });
          } else if (aSubsetOfB && setA.size < setB.size) {
            suggestions.push({
              type: 'inheritance',
              roles: [roleA.name, roleB.name],
              message: `"${roleA.name}" could inherit from "${roleB.name}" (subset of permissions)`
            });
          } else if (bSubsetOfA && setB.size < setA.size) {
            suggestions.push({
              type: 'inheritance',
              roles: [roleB.name, roleA.name],
              message: `"${roleB.name}" could inherit from "${roleA.name}" (subset of permissions)`
            });
          }
        }
      }

      return suggestions;
    } catch (e) {
      console.warn('Failed to get role simplification suggestions:', e.message);
      return [];
    }
  }

  /**
   * Get full suggestions report
   */
  getFullReport() {
    const cacheKey = 'full_report';
    const cached = this.analysisCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const report = {
      generatedAt: new Date().toISOString(),
      unusedPermissions: this.getUnusedPermissions(),
      orphanedPermissions: this.getOrphanedPermissions(),
      expiredGrants: this.getExpiredGrants(),
      coverage: this.getPermissionCoverage(),
      roleSimplification: this.getRoleSimplificationSuggestions()
    };

    this.analysisCache.set(cacheKey, { data: report, timestamp: Date.now() });
    return report;
  }
}

/**
 * Security Alert System
 * Monitors for unusual RBAC activity
 */
class SecurityAlertSystem {
  constructor() {
    this.alertThresholds = {
      permissionChangesPerHour: 10,
      roleChangesPerHour: 5,
      overridesPerUser: 10,
      failedAccessAttempts: 20
    };
  }

  /**
   * Get security alerts
   */
  getAlerts() {
    initDependencies();
    if (!db) return [];

    const alerts = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      // Check for excessive permission changes
      const permChanges = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_audit_logs 
        WHERE created_at > ? AND action LIKE 'permission.%'
      `).get(oneHourAgo);

      if (permChanges.count > this.alertThresholds.permissionChangesPerHour) {
        alerts.push({
          type: 'high_activity',
          severity: 'warning',
          message: `High permission change activity: ${permChanges.count} changes in the last hour`,
          count: permChanges.count,
          threshold: this.alertThresholds.permissionChangesPerHour
        });
      }

      // Check for excessive role changes
      const roleChanges = db.prepare(`
        SELECT COUNT(*) as count FROM rbac_audit_logs 
        WHERE created_at > ? AND action LIKE 'role.%'
      `).get(oneHourAgo);

      if (roleChanges.count > this.alertThresholds.roleChangesPerHour) {
        alerts.push({
          type: 'high_activity',
          severity: 'warning',
          message: `High role change activity: ${roleChanges.count} changes in the last hour`,
          count: roleChanges.count,
          threshold: this.alertThresholds.roleChangesPerHour
        });
      }

      // Check for users with many overrides
      const userOverrides = db.prepare(`
        SELECT user_id, COUNT(*) as count, u.email
        FROM rbac_user_overrides uo
        JOIN users u ON u.id = uo.user_id
        WHERE uo.expires_at IS NULL OR uo.expires_at > CURRENT_TIMESTAMP
        GROUP BY user_id
        HAVING count > ?
      `).all(this.alertThresholds.overridesPerUser);

      for (const uo of userOverrides) {
        alerts.push({
          type: 'excessive_overrides',
          severity: 'info',
          message: `User ${uo.email} has ${uo.count} active permission overrides`,
          userId: uo.user_id,
          count: uo.count,
          threshold: this.alertThresholds.overridesPerUser
        });
      }

      // Check for permission escalation (users gaining high-level permissions)
      const escalations = db.prepare(`
        SELECT al.*, u.email as actor_email
        FROM rbac_audit_logs al
        LEFT JOIN users u ON u.id = al.actor_id
        WHERE al.created_at > ?
        AND (
          al.action = 'role.permission.grant'
          OR al.action = 'user.role.assign'
          OR al.action = 'user.override.grant'
        )
        AND (
          al.new_value LIKE '%manage_admins%'
          OR al.new_value LIKE '%super_admin%'
          OR al.new_value LIKE '%global_admin%'
          OR al.new_value LIKE '%rbac.%'
        )
        ORDER BY al.created_at DESC
      `).all(oneDayAgo);

      for (const esc of escalations) {
        alerts.push({
          type: 'permission_escalation',
          severity: 'critical',
          message: `Potential privilege escalation by ${esc.actor_email || 'system'}`,
          action: esc.action,
          details: esc.new_value,
          timestamp: esc.created_at
        });
      }

      // Check for long-running overrides
      const longOverridesQuery = isProduction
        ? `
        SELECT uo.*, p.name as permission_name, u.email
        FROM rbac_user_overrides uo
        JOIN rbac_permissions p ON p.id = uo.permission_id
        JOIN users u ON u.id = uo.user_id
        WHERE uo.is_temporary = true
        AND (uo.expires_at IS NULL OR uo.expires_at > CURRENT_TIMESTAMP + INTERVAL '30 days')
        AND uo.granted_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
      `
        : `
        SELECT uo.*, p.name as permission_name, u.email
        FROM rbac_user_overrides uo
        JOIN rbac_permissions p ON p.id = uo.permission_id
        JOIN users u ON u.id = uo.user_id
        WHERE uo.is_temporary = 1
        AND (uo.expires_at IS NULL OR uo.expires_at > datetime('now', '+30 days'))
        AND uo.granted_at < datetime('now', '-7 days')
      `;
      const longOverrides = db.prepare(longOverridesQuery).all();

      for (const lo of longOverrides) {
        alerts.push({
          type: 'long_running_override',
          severity: 'info',
          message: `Long-running temporary override for ${lo.email}: ${lo.permission_name}`,
          userId: lo.user_id,
          permissionId: lo.permission_id,
          grantedAt: lo.granted_at
        });
      }

      // Check for failed access attempts
      const failedAttempts = db.prepare(`
        SELECT COUNT(*) as count, actor_id, u.email
        FROM rbac_audit_logs al
        LEFT JOIN users u ON u.id = al.actor_id
        WHERE al.created_at > ?
        AND al.action = 'permission.denied'
        GROUP BY al.actor_id
        HAVING count > ?
      `).all(oneHourAgo, this.alertThresholds.failedAccessAttempts);

      for (const fa of failedAttempts) {
        alerts.push({
          type: 'access_denied',
          severity: 'warning',
          message: `Multiple access denials for ${fa.email || 'unknown'}: ${fa.count} in the last hour`,
          userId: fa.actor_id,
          count: fa.count
        });
      }

    } catch (e) {
      console.warn('Failed to get security alerts:', e.message);
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Configure alert thresholds
   */
  setThresholds(thresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }
}

/**
 * AI Permission Manifest Generator
 * Creates structured permission manifests for AI agents
 */
class AIPermissionManifest {
  /**
   * Generate a complete permission manifest for AI consumption
   */
  static generate() {
    initDependencies();
    if (!rbacService) return null;

    try {
      const permissions = rbacService.getPermissions();
      const roles = rbacService.getRoles();
      const groups = rbacService.getPermissionGroups();
      const modules = rbacService.getRegisteredModules();

      return {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        schema: {
          type: 'rbac-manifest',
          description: 'Role-Based Access Control permission manifest for AI agents'
        },
        modules: modules.map(m => ({
          id: m.id,
          name: m.module_name,
          displayName: m.display_name,
          description: m.description,
          version: m.version
        })),
        permissionGroups: groups.map(g => ({
          id: g.id,
          name: g.name,
          displayName: g.display_name,
          description: g.description,
          module: g.module,
          parentGroupId: g.parent_group_id
        })),
        permissions: permissions.map(p => ({
          id: p.id,
          name: p.name,
          displayName: p.display_name,
          description: p.description,
          module: p.module,
          resource: p.resource,
          action: p.action,
          groupId: p.group_id,
          isSystem: p.is_system_permission === 1,
          requires: p.requires_permissions ? JSON.parse(p.requires_permissions) : null,
          capabilities: AIPermissionManifest._inferCapabilities(p)
        })),
        roles: roles.map(r => ({
          id: r.id,
          name: r.name,
          displayName: r.display_name,
          description: r.description,
          priority: r.priority,
          parentRoleId: r.parent_role_id,
          isSystem: r.is_system_role === 1,
          permissions: rbacService.getRolePermissions(r.id).map(p => p.name)
        })),
        actionMappings: {
          create: 'Allows creating new resources',
          read: 'Allows viewing/reading resources',
          update: 'Allows modifying existing resources',
          delete: 'Allows removing resources',
          list: 'Allows listing/enumerating resources',
          view: 'Allows viewing resource details',
          manage: 'Full management control over resources',
          moderate: 'Allows content moderation actions',
          assign: 'Allows assigning resources to users/entities',
          grant: 'Allows granting permissions to others',
          revoke: 'Allows revoking permissions from others'
        }
      };
    } catch (e) {
      console.warn('Failed to generate AI manifest:', e.message);
      return null;
    }
  }

  /**
   * Infer AI-friendly capability descriptions
   */
  static _inferCapabilities(permission) {
    const capabilities = [];
    const name = permission.name.toLowerCase();
    const action = (permission.action || '').toLowerCase();

    if (name.includes('create') || action === 'create') {
      capabilities.push('create_resource');
    }
    if (name.includes('read') || name.includes('view') || action === 'read' || action === 'view') {
      capabilities.push('read_resource');
    }
    if (name.includes('update') || name.includes('edit') || action === 'update') {
      capabilities.push('modify_resource');
    }
    if (name.includes('delete') || name.includes('remove') || action === 'delete') {
      capabilities.push('delete_resource');
    }
    if (name.includes('manage') || action === 'manage') {
      capabilities.push('full_control');
    }
    if (name.includes('assign') || action === 'assign') {
      capabilities.push('assign_resource');
    }
    if (name.includes('moderate') || action === 'moderate') {
      capabilities.push('moderation');
    }

    return capabilities.length > 0 ? capabilities : ['general_access'];
  }

  /**
   * Check if a specific action is allowed for an AI agent
   */
  static checkCapability(userId, capability, resource = null) {
    initDependencies();
    if (!rbacService) return { allowed: false, reason: 'RBAC service not available' };

    try {
      const permissions = rbacService.getEffectivePermissions(userId);
      
      for (const perm of permissions) {
        const caps = AIPermissionManifest._inferCapabilities(perm);
        if (caps.includes(capability)) {
          if (!resource || perm.resource === resource) {
            return {
              allowed: true,
              permission: perm.name,
              reason: `Granted via permission "${perm.display_name || perm.name}"`
            };
          }
        }
      }

      return {
        allowed: false,
        reason: `No permission grants capability "${capability}"${resource ? ` for resource "${resource}"` : ''}`
      };
    } catch (e) {
      return { allowed: false, reason: e.message };
    }
  }

  /**
   * Explain why an action was denied
   */
  static explainDenial(userId, permissionName) {
    initDependencies();
    if (!rbacService) return { explanation: 'RBAC service not available' };

    try {
      const permission = rbacService.getPermissionByName(permissionName);
      if (!permission) {
        return { explanation: `Permission "${permissionName}" does not exist` };
      }

      const userRoles = rbacService.getUserRoles(userId);
      if (userRoles.length === 0) {
        return {
          explanation: 'User has no assigned roles',
          suggestion: 'Contact an administrator to assign appropriate roles'
        };
      }

      // Check if any role has this permission
      const rolesWithPermission = [];
      for (const role of rbacService.getRoles()) {
        const perms = rbacService.getRolePermissions(role.id);
        if (perms.some(p => p.name === permissionName)) {
          rolesWithPermission.push(role.display_name || role.name);
        }
      }

      if (rolesWithPermission.length === 0) {
        return {
          explanation: `No role currently has the "${permission.display_name}" permission`,
          suggestion: 'This permission may need to be assigned to a role by an administrator'
        };
      }

      return {
        explanation: `User's roles (${userRoles.map(r => r.display_name || r.name).join(', ')}) do not include "${permission.display_name}"`,
        suggestion: `Request access to one of these roles: ${rolesWithPermission.join(', ')}`,
        requiredRoles: rolesWithPermission
      };
    } catch (e) {
      return { explanation: e.message };
    }
  }
}

/**
 * Documentation Generator
 * Creates Markdown documentation for RBAC configuration
 */
class DocumentationGenerator {
  /**
   * Generate full RBAC documentation
   */
  static generate() {
    initDependencies();
    if (!rbacService) return null;

    try {
      const roles = rbacService.getRoles({ includeDisabled: true });
      const permissions = rbacService.getPermissions({ includeDisabled: true });
      const groups = rbacService.getPermissionGroups({ includeDisabled: true });

      let md = `# RBAC Documentation\n\n`;
      md += `> Generated: ${new Date().toISOString()}\n\n`;

      // Table of Contents
      md += `## Table of Contents\n\n`;
      md += `1. [Roles](#roles)\n`;
      md += `2. [Permission Groups](#permission-groups)\n`;
      md += `3. [Permissions](#permissions)\n`;
      md += `4. [Role Hierarchy](#role-hierarchy)\n`;
      md += `5. [Permission Matrix](#permission-matrix)\n\n`;

      // Roles Section
      md += `## Roles\n\n`;
      for (const role of roles) {
        md += `### ${role.display_name || role.name}\n\n`;
        md += `- **Name:** \`${role.name}\`\n`;
        md += `- **Priority:** ${role.priority}\n`;
        if (role.description) md += `- **Description:** ${role.description}\n`;
        if (role.parent_role_name) md += `- **Inherits from:** ${role.parent_role_name}\n`;
        md += `- **System Role:** ${role.is_system_role ? 'Yes' : 'No'}\n`;
        md += `- **Enabled:** ${role.is_enabled ? 'Yes' : 'No'}\n\n`;

        const perms = rbacService.getRolePermissions(role.id, { includeInherited: false });
        if (perms.length > 0) {
          md += `**Direct Permissions:**\n\n`;
          for (const p of perms) {
            md += `- \`${p.name}\`${p.is_denied ? ' (denied)' : ''}\n`;
          }
          md += `\n`;
        }
      }

      // Permission Groups Section
      md += `## Permission Groups\n\n`;
      for (const group of groups) {
        md += `### ${group.display_name || group.name}\n\n`;
        if (group.description) md += `${group.description}\n\n`;
        md += `- **Module:** ${group.module || 'N/A'}\n`;
        md += `- **Permissions:** ${group.permission_count || 0}\n\n`;
      }

      // Permissions Section
      md += `## Permissions\n\n`;
      md += `| Permission | Display Name | Module | Resource | Action |\n`;
      md += `|------------|--------------|--------|----------|--------|\n`;
      for (const p of permissions.slice(0, 100)) { // Limit for readability
        md += `| \`${p.name}\` | ${p.display_name || '-'} | ${p.module || '-'} | ${p.resource || '-'} | ${p.action || '-'} |\n`;
      }
      if (permissions.length > 100) {
        md += `\n*... and ${permissions.length - 100} more permissions*\n`;
      }
      md += `\n`;

      // Role Hierarchy
      md += `## Role Hierarchy\n\n`;
      md += `\`\`\`\n`;
      const rootRoles = roles.filter(r => !r.parent_role_id);
      for (const root of rootRoles) {
        md += DocumentationGenerator._printRoleTree(root, roles, 0);
      }
      md += `\`\`\`\n\n`;

      // Permission Matrix (simplified)
      md += `## Permission Matrix\n\n`;
      const topRoles = roles.slice(0, 10);
      md += `| Permission |${topRoles.map(r => ` ${r.name.substring(0, 12)} `).join('|')}|\n`;
      md += `|------------|${topRoles.map(() => ':----:').join('|')}|\n`;
      
      const topPerms = permissions.slice(0, 20);
      for (const p of topPerms) {
        const cells = topRoles.map(r => {
          const rolePerms = rbacService.getRolePermissions(r.id);
          return rolePerms.some(rp => rp.id === p.id) ? '✓' : '-';
        });
        md += `| ${p.name.substring(0, 30)} |${cells.map(c => ` ${c} `).join('|')}|\n`;
      }

      return md;
    } catch (e) {
      console.warn('Failed to generate documentation:', e.message);
      return null;
    }
  }

  /**
   * Helper to print role tree
   */
  static _printRoleTree(role, allRoles, depth) {
    let result = '  '.repeat(depth) + `├── ${role.display_name || role.name}`;
    if (role.priority) result += ` (priority: ${role.priority})`;
    result += '\n';

    const children = allRoles.filter(r => r.parent_role_id === role.id);
    for (const child of children) {
      result += DocumentationGenerator._printRoleTree(child, allRoles, depth + 1);
    }

    return result;
  }

  /**
   * Generate changelog from version history
   */
  static generateChangelog(options = { limit: 100 }) {
    initDependencies();
    if (!db) return null;

    try {
      const versions = db.prepare(`
        SELECT v.*, u.full_name as changed_by_name, u.email as changed_by_email
        FROM rbac_versions v
        LEFT JOIN users u ON u.id = v.changed_by
        ORDER BY v.created_at DESC
        LIMIT ?
      `).all(options.limit);

      let md = `# RBAC Changelog\n\n`;
      md += `> Last ${options.limit} changes\n\n`;

      let currentDate = '';
      for (const v of versions) {
        const date = new Date(v.created_at).toLocaleDateString();
        if (date !== currentDate) {
          currentDate = date;
          md += `\n## ${date}\n\n`;
        }

        const time = new Date(v.created_at).toLocaleTimeString();
        const actor = v.changed_by_name || v.changed_by_email || 'System';
        
        md += `- **${time}** - ${v.change_type.toUpperCase()} ${v.entity_type} #${v.entity_id}`;
        if (v.change_reason) md += `: ${v.change_reason}`;
        md += ` (by ${actor})\n`;
      }

      return md;
    } catch (e) {
      console.warn('Failed to generate changelog:', e.message);
      return null;
    }
  }
}

// Export all classes
module.exports = {
  PermissionSuggestionEngine,
  SecurityAlertSystem,
  AIPermissionManifest,
  DocumentationGenerator,
  
  // Convenience instances
  suggestionEngine: new PermissionSuggestionEngine(),
  securityAlerts: new SecurityAlertSystem()
};

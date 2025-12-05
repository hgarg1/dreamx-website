/**
 * RBAC Seeding Module
 * 
 * Handles environment-aware seeding for development and production.
 * Grandfathers legacy HR and Business admin accounts with full capabilities.
 * Migrates hardcoded roles and permissions to the new RBAC system.
 */

const rbacService = require('./rbac');

// =============================================================================
// LEGACY ROLE AND PERMISSION DEFINITIONS
// =============================================================================

// These are extracted from the existing codebase (middleware/rbac.js, routes/admin.js)
const LEGACY_ADMIN_PERMISSIONS = [
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

const LEGACY_HR_PERMISSIONS = [
  { key: 'hr_applications', label: 'Applications & Review', desc: 'View and triage candidate submissions.' },
  { key: 'hr_pipeline', label: 'Pipeline Moves', desc: 'Advance, reject, and tag candidates in the pipeline.' },
  { key: 'hr_jobs', label: 'Job Posts', desc: 'Create and update open roles and publishing status.' },
  { key: 'hr_messages', label: 'Candidate Outreach', desc: 'Email and message candidates from the HR desk.' },
  { key: 'hr_team', label: 'HR Team Management', desc: 'Create HR teammates and assign their scopes.' },
  { key: 'hr_scopes', label: 'Scope Stewardship', desc: 'Add or retire scopes for downstream HR workflows.' }
];

const LEGACY_BUSINESS_PERMISSIONS = [
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

// Legacy role hierarchy
const LEGACY_ROLE_HIERARCHY = {
  user: { rank: 1, inheritsFrom: null },
  hr: { rank: 2, inheritsFrom: null },
  super_hr: { rank: 3, inheritsFrom: 'hr' },
  global_hr: { rank: 4, inheritsFrom: 'super_hr' },
  business_admin: { rank: 4, inheritsFrom: null },
  admin: { rank: 5, inheritsFrom: null },
  super_admin: { rank: 6, inheritsFrom: 'admin' },
  global_admin: { rank: 7, inheritsFrom: 'super_admin' }
};

// HR Page Scopes
const HR_PAGE_SCOPES = ['hr-dashboard', 'candidate-pipeline', 'career-applications', 'job-board', 'hr-org', 'talent-outreach'];

// =============================================================================
// SEEDING FUNCTIONS
// =============================================================================

/**
 * Seed all RBAC data (roles, permissions, default assignments)
 */
async function seedRbac(db) {
  console.log('🔄 Starting RBAC seeding...');
  
  try {
    // Seed permission groups
    await seedPermissionGroups();
    
    // Seed permissions
    await seedPermissions();
    
    // Seed roles
    await seedRoles();
    
    // Seed role-permission assignments
    await seedRolePermissions();
    
    // Seed legacy mappings
    await seedLegacyMappings();
    
    // Seed default role assignments
    await seedDefaultAssignments();
    
    // Grandfather legacy accounts
    await grandfatherLegacyAccounts(db);
    
    console.log('✅ RBAC seeding completed');
  } catch (error) {
    console.error('❌ RBAC seeding failed:', error);
    throw error;
  }
}

/**
 * Seed permission groups
 */
async function seedPermissionGroups() {
  const groups = [
    { name: 'admin', displayName: 'Admin Permissions', description: 'Administrative capabilities', module: 'admin', displayOrder: 1 },
    { name: 'hr', displayName: 'HR Permissions', description: 'Human Resources capabilities', module: 'hr', displayOrder: 2 },
    { name: 'business', displayName: 'Business Permissions', description: 'Business and sales capabilities', module: 'business', displayOrder: 3 },
    { name: 'content', displayName: 'Content Permissions', description: 'Content management capabilities', module: 'content', displayOrder: 4 },
    { name: 'user_management', displayName: 'User Management', description: 'User account management', module: 'users', displayOrder: 5 },
    { name: 'rbac', displayName: 'RBAC Management', description: 'Role and permission management', module: 'rbac', displayOrder: 6 }
  ];
  
  for (const group of groups) {
    try {
      rbacService.createPermissionGroup(group);
    } catch (error) {
      // Ignore duplicate errors
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission group ${group.name}:`, error.message);
      }
    }
  }
}

/**
 * Seed all permissions from legacy definitions
 */
async function seedPermissions() {
  // Get permission group IDs
  const groups = rbacService.getPermissionGroups();
  const groupMap = {};
  for (const g of groups) {
    groupMap[g.name] = g.id;
  }
  
  // Seed admin permissions
  for (const perm of LEGACY_ADMIN_PERMISSIONS) {
    try {
      rbacService.createPermission({
        name: `admin.${perm.key}`,
        displayName: perm.label,
        description: perm.desc,
        groupId: groupMap.admin,
        module: 'admin',
        resource: perm.key.split('_')[0],
        action: perm.key.split('_').slice(1).join('_') || 'manage',
        isSystemPermission: true
      });
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission admin.${perm.key}:`, error.message);
      }
    }
  }
  
  // Seed HR permissions
  for (const perm of LEGACY_HR_PERMISSIONS) {
    try {
      rbacService.createPermission({
        name: `hr.${perm.key}`,
        displayName: perm.label,
        description: perm.desc,
        groupId: groupMap.hr,
        module: 'hr',
        resource: perm.key.replace('hr_', ''),
        action: 'manage',
        isSystemPermission: true
      });
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission hr.${perm.key}:`, error.message);
      }
    }
  }
  
  // Seed Business permissions
  for (const perm of LEGACY_BUSINESS_PERMISSIONS) {
    try {
      rbacService.createPermission({
        name: `business.${perm.key}`,
        displayName: perm.label,
        description: perm.desc,
        groupId: groupMap.business,
        module: 'business',
        resource: perm.key.split('_')[0],
        action: perm.key.split('_').slice(1).join('_') || 'manage',
        isSystemPermission: true
      });
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission business.${perm.key}:`, error.message);
      }
    }
  }
  
  // Seed RBAC management permissions
  const rbacPerms = [
    { name: 'rbac.roles.view', displayName: 'View Roles', description: 'View role definitions', resource: 'roles', action: 'view' },
    { name: 'rbac.roles.create', displayName: 'Create Roles', description: 'Create new roles', resource: 'roles', action: 'create' },
    { name: 'rbac.roles.edit', displayName: 'Edit Roles', description: 'Edit role definitions', resource: 'roles', action: 'edit' },
    { name: 'rbac.roles.delete', displayName: 'Delete Roles', description: 'Delete roles', resource: 'roles', action: 'delete' },
    { name: 'rbac.roles.assign', displayName: 'Assign Roles', description: 'Assign roles to users', resource: 'roles', action: 'assign' },
    { name: 'rbac.permissions.view', displayName: 'View Permissions', description: 'View permission definitions', resource: 'permissions', action: 'view' },
    { name: 'rbac.permissions.create', displayName: 'Create Permissions', description: 'Create new permissions', resource: 'permissions', action: 'create' },
    { name: 'rbac.permissions.edit', displayName: 'Edit Permissions', description: 'Edit permission definitions', resource: 'permissions', action: 'edit' },
    { name: 'rbac.permissions.delete', displayName: 'Delete Permissions', description: 'Delete permissions', resource: 'permissions', action: 'delete' },
    { name: 'rbac.overrides.manage', displayName: 'Manage User Overrides', description: 'Grant or deny user-specific permission overrides', resource: 'overrides', action: 'manage' },
    { name: 'rbac.audit.view', displayName: 'View RBAC Audit Logs', description: 'View RBAC change history', resource: 'audit', action: 'view' }
  ];
  
  for (const perm of rbacPerms) {
    try {
      rbacService.createPermission({
        ...perm,
        groupId: groupMap.rbac,
        module: 'rbac',
        isSystemPermission: true
      });
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission ${perm.name}:`, error.message);
      }
    }
  }
  
  // Seed content permissions
  const contentPerms = [
    { name: 'content.posts.create', displayName: 'Create Posts', description: 'Create feed posts', resource: 'posts', action: 'create' },
    { name: 'content.posts.edit_own', displayName: 'Edit Own Posts', description: 'Edit own posts', resource: 'posts', action: 'edit_own' },
    { name: 'content.posts.delete_own', displayName: 'Delete Own Posts', description: 'Delete own posts', resource: 'posts', action: 'delete_own' },
    { name: 'content.posts.moderate', displayName: 'Moderate Posts', description: 'Hide or delete any post', resource: 'posts', action: 'moderate' },
    { name: 'content.comments.create', displayName: 'Create Comments', description: 'Create comments', resource: 'comments', action: 'create' },
    { name: 'content.comments.moderate', displayName: 'Moderate Comments', description: 'Hide or delete any comment', resource: 'comments', action: 'moderate' },
    { name: 'content.services.create', displayName: 'Create Services', description: 'Create service listings', resource: 'services', action: 'create' },
    { name: 'content.services.moderate', displayName: 'Moderate Services', description: 'Hide or delete service listings', resource: 'services', action: 'moderate' }
  ];
  
  for (const perm of contentPerms) {
    try {
      rbacService.createPermission({
        ...perm,
        groupId: groupMap.content,
        module: 'content',
        isSystemPermission: true
      });
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.warn(`Failed to create permission ${perm.name}:`, error.message);
      }
    }
  }
}

/**
 * Seed roles based on legacy role hierarchy
 */
async function seedRoles() {
  const roleDefinitions = [
    { name: 'user', displayName: 'User', description: 'Standard user with basic access', priority: 1, isSystemRole: true },
    { name: 'hr', displayName: 'HR', description: 'Human Resources team member', priority: 20, isSystemRole: true },
    { name: 'super_hr', displayName: 'Super HR', description: 'Senior HR with team management', priority: 30, isSystemRole: true },
    { name: 'global_hr', displayName: 'Global HR', description: 'Global HR with full HR access', priority: 40, isSystemRole: true },
    { name: 'business_admin', displayName: 'Business Admin', description: 'Business and sales administrator', priority: 40, isSystemRole: true },
    { name: 'admin', displayName: 'Admin', description: 'Platform administrator', priority: 50, isSystemRole: true },
    { name: 'super_admin', displayName: 'Super Admin', description: 'Senior administrator with elevated access', priority: 60, isSystemRole: true },
    { name: 'global_admin', displayName: 'Global Admin', description: 'Global administrator with full access', priority: 100, isSystemRole: true }
  ];
  
  const createdRoles = {};
  
  // First pass: create all roles without inheritance
  for (const role of roleDefinitions) {
    try {
      const roleId = rbacService.createRole({
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        priority: role.priority,
        isSystemRole: role.isSystemRole
      });
      createdRoles[role.name] = roleId;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        // Role already exists, get its ID
        const existing = rbacService.getRoleByName(role.name);
        if (existing) createdRoles[role.name] = existing.id;
      } else {
        console.warn(`Failed to create role ${role.name}:`, error.message);
      }
    }
  }
  
  // Second pass: set up inheritance
  for (const [roleName, hierarchy] of Object.entries(LEGACY_ROLE_HIERARCHY)) {
    if (hierarchy.inheritsFrom && createdRoles[roleName] && createdRoles[hierarchy.inheritsFrom]) {
      try {
        rbacService.updateRole(createdRoles[roleName], {
          parentRoleId: createdRoles[hierarchy.inheritsFrom]
        });
      } catch (error) {
        console.warn(`Failed to set inheritance for ${roleName}:`, error.message);
      }
    }
  }
}

/**
 * Seed role-permission assignments
 */
async function seedRolePermissions() {
  // Get all roles and permissions
  const roles = rbacService.getRoles({ includeDisabled: true });
  const permissions = rbacService.getPermissions({ includeDisabled: true });
  
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r;
  
  const permMap = {};
  for (const p of permissions) permMap[p.name] = p;
  
  // User role permissions (basic content creation)
  const userPerms = [
    'content.posts.create', 'content.posts.edit_own', 'content.posts.delete_own',
    'content.comments.create', 'content.services.create'
  ];
  assignPermissionsToRole(roleMap.user?.id, userPerms, permMap);
  
  // HR role permissions
  const hrPerms = LEGACY_HR_PERMISSIONS.map(p => `hr.${p.key}`).filter(p => 
    ['hr.hr_applications', 'hr.hr_pipeline', 'hr.hr_jobs', 'hr.hr_messages'].includes(p)
  );
  assignPermissionsToRole(roleMap.hr?.id, hrPerms, permMap);
  
  // Super HR role permissions (all HR permissions + team management)
  const superHrPerms = LEGACY_HR_PERMISSIONS.map(p => `hr.${p.key}`);
  assignPermissionsToRole(roleMap.super_hr?.id, superHrPerms, permMap);
  
  // Global HR role permissions (all HR + audit)
  assignPermissionsToRole(roleMap.global_hr?.id, [...superHrPerms, 'rbac.audit.view'], permMap);
  
  // Business admin permissions
  const businessPerms = LEGACY_BUSINESS_PERMISSIONS.map(p => `business.${p.key}`);
  assignPermissionsToRole(roleMap.business_admin?.id, businessPerms, permMap);
  
  // Admin role permissions (subset of admin permissions)
  const adminPerms = ['admin.manage_users', 'admin.moderate_content', 'admin.billing', 
    'admin.services_moderation', 'admin.refunds', 'admin.careers', 'admin.appeals',
    'content.posts.moderate', 'content.comments.moderate', 'content.services.moderate'];
  assignPermissionsToRole(roleMap.admin?.id, adminPerms, permMap);
  
  // Super admin role permissions (all admin permissions)
  const superAdminPerms = LEGACY_ADMIN_PERMISSIONS.map(p => `admin.${p.key}`);
  assignPermissionsToRole(roleMap.super_admin?.id, [...superAdminPerms, 'rbac.roles.view', 'rbac.roles.assign', 'rbac.permissions.view', 'rbac.audit.view'], permMap);
  
  // Global admin role permissions (everything including RBAC management)
  const globalAdminPerms = [
    ...superAdminPerms,
    ...Object.keys(permMap).filter(k => k.startsWith('rbac.'))
  ];
  assignPermissionsToRole(roleMap.global_admin?.id, globalAdminPerms, permMap);
}

/**
 * Helper function to assign permissions to a role
 */
function assignPermissionsToRole(roleId, permissionNames, permMap) {
  if (!roleId) return;
  
  for (const permName of permissionNames) {
    const perm = permMap[permName];
    if (perm) {
      try {
        rbacService.assignPermissionToRole(roleId, perm.id);
      } catch (error) {
        // Ignore duplicate assignment errors
        if (!error.message.includes('UNIQUE constraint')) {
          console.warn(`Failed to assign ${permName} to role:`, error.message);
        }
      }
    }
  }
}

/**
 * Seed legacy role mappings for backward compatibility
 */
async function seedLegacyMappings() {
  const roles = rbacService.getRoles({ includeDisabled: true });
  
  for (const role of roles) {
    try {
      // Map legacy role name to new RBAC role
      rbacService.createLegacyMapping({
        legacyRole: role.name,
        rbacRoleId: role.id,
        legacyPermissions: role.name === 'admin' ? LEGACY_ADMIN_PERMISSIONS.map(p => p.key) :
                          role.name.includes('hr') ? LEGACY_HR_PERMISSIONS.map(p => p.key) :
                          role.name === 'business_admin' ? LEGACY_BUSINESS_PERMISSIONS.map(p => p.key) :
                          []
      });
    } catch (error) {
      // Ignore duplicate mapping errors
    }
  }
}

/**
 * Seed default role assignments
 */
async function seedDefaultAssignments() {
  const userRole = rbacService.getRoleByName('user');
  if (!userRole) return;
  
  try {
    // All new users get the 'user' role by default
    const stmt = require('../db').db?.prepare ? require('../db').db.prepare(`
      INSERT OR IGNORE INTO rbac_default_assignments (role_id, condition_type, condition_value, priority, is_enabled)
      VALUES (?, 'new_user', NULL, 100, 1)
    `) : null;
    
    if (stmt) {
      stmt.run(userRole.id);
    }
  } catch (error) {
    console.warn('Failed to seed default role assignment:', error.message);
  }
}

/**
 * Grandfather legacy HR and Business admin accounts
 * Preserves their full capabilities and makes them editable in the dashboard
 */
async function grandfatherLegacyAccounts(db) {
  if (!db) return;
  
  console.log('🔄 Grandfathering legacy accounts...');
  
  try {
    // Get all users with legacy roles
    const legacyUsers = db.prepare(`
      SELECT id, email, role, admin_permissions, admin_scopes 
      FROM users 
      WHERE role IN ('hr', 'super_hr', 'global_hr', 'admin', 'super_admin', 'global_admin', 'business_admin')
    `).all();
    
    for (const user of legacyUsers) {
      try {
        // Map legacy role to RBAC role
        const mapping = rbacService.mapLegacyRole(user.role);
        
        if (mapping) {
          // Assign the mapped RBAC role to the user
          rbacService.assignRoleToUser(user.id, mapping.rbac_role_id, {
            isPrimary: true,
            assignedBy: null // System assignment
          });
          
          // Parse and preserve any additional custom permissions
          let legacyPerms = [];
          try {
            legacyPerms = user.admin_permissions ? JSON.parse(user.admin_permissions) : [];
          } catch (e) {}
          
          // Grant any custom permissions that aren't covered by the role
          for (const permKey of legacyPerms) {
            // Try to find the permission in the new system
            let permission = rbacService.getPermissionByName(`admin.${permKey}`);
            if (!permission) {
              permission = rbacService.getPermissionByName(`hr.${permKey}`);
            }
            if (!permission) {
              permission = rbacService.getPermissionByName(`business.${permKey}`);
            }
            
            if (permission) {
              // Check if user already has this through their role
              const effectivePerms = rbacService.getEffectivePermissions(user.id);
              const hasPermission = effectivePerms.some(p => p.id === permission.id);
              
              if (!hasPermission) {
                // Grant as user override to preserve the permission
                rbacService.grantUserOverride(user.id, permission.id, {
                  reason: 'Grandfathered from legacy system',
                  isTemporary: false
                });
              }
            }
          }
          
          console.log(`  ✅ Migrated user ${user.email} (${user.role}) to RBAC`);
        }
      } catch (error) {
        console.warn(`  ⚠️ Failed to migrate user ${user.email}:`, error.message);
      }
    }
    
    // Special handling for the built-in accounts
    const builtInAccounts = [
      { email: 'admin@dreamx.local', expectedRole: 'global_admin' },
      { email: 'hr@dreamx.local', expectedRole: 'global_hr' },
      { email: 'business@dreamx.local', expectedRole: 'business_admin' }
    ];
    
    for (const account of builtInAccounts) {
      const user = db.prepare(`SELECT id, role FROM users WHERE email = ?`).get(account.email);
      
      if (user) {
        const mapping = rbacService.mapLegacyRole(account.expectedRole);
        
        if (mapping) {
          // Ensure the role is assigned
          try {
            rbacService.assignRoleToUser(user.id, mapping.rbac_role_id, {
              isPrimary: true,
              assignedBy: null
            });
            console.log(`  ✅ Confirmed RBAC role for ${account.email}`);
          } catch (error) {
            // Already assigned
          }
        }
      }
    }
    
    console.log('✅ Legacy account migration completed');
  } catch (error) {
    console.error('❌ Failed to grandfather legacy accounts:', error);
  }
}

/**
 * Migrate a single user from legacy system to RBAC
 * Can be called on-demand for users not yet migrated
 */
function migrateUser(userId, db) {
  const user = db.prepare(`
    SELECT id, email, role, admin_permissions, admin_scopes 
    FROM users WHERE id = ?
  `).get(userId);
  
  if (!user) throw new Error('User not found');
  
  // Check if user is already in RBAC
  const existingRoles = rbacService.getUserRoles(userId);
  if (existingRoles.length > 0) {
    return { migrated: false, message: 'User already has RBAC roles' };
  }
  
  // Map legacy role
  const mapping = rbacService.mapLegacyRole(user.role || 'user');
  
  if (mapping) {
    rbacService.assignRoleToUser(userId, mapping.rbac_role_id, {
      isPrimary: true
    });
    
    return { migrated: true, roleAssigned: mapping.rbac_role_name };
  }
  
  // Fallback to user role
  const userRole = rbacService.getRoleByName('user');
  if (userRole) {
    rbacService.assignRoleToUser(userId, userRole.id, {
      isPrimary: true
    });
    return { migrated: true, roleAssigned: 'user' };
  }
  
  return { migrated: false, message: 'No suitable role found' };
}

/**
 * Check if RBAC has been seeded
 */
function isSeeded() {
  try {
    const stats = rbacService.getStats();
    return stats.roles > 0 && stats.permissions > 0;
  } catch (error) {
    return false;
  }
}

module.exports = {
  seedRbac,
  seedPermissionGroups,
  seedPermissions,
  seedRoles,
  seedRolePermissions,
  seedLegacyMappings,
  grandfatherLegacyAccounts,
  migrateUser,
  isSeeded,
  
  // Export legacy definitions for reference
  LEGACY_ADMIN_PERMISSIONS,
  LEGACY_HR_PERMISSIONS,
  LEGACY_BUSINESS_PERMISSIONS,
  LEGACY_ROLE_HIERARCHY,
  HR_PAGE_SCOPES
};

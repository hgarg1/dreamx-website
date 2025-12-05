-- RBAC Database Schema for Dream X
-- Supports both SQLite (development) and SQL Server (production)

-- =============================================================================
-- CORE RBAC TABLES
-- =============================================================================

-- Roles: Dynamic roles that can be created, edited, renamed, enabled, disabled
CREATE TABLE IF NOT EXISTS rbac_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_system_role INTEGER DEFAULT 0,     -- System roles cannot be deleted
  is_enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,            -- Higher priority roles take precedence
  parent_role_id INTEGER,                -- Role inheritance (extends another role)
  metadata TEXT,                         -- JSON for extensible properties
  version INTEGER DEFAULT 1,
  deleted_at DATETIME,                   -- Soft delete
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_role_id) REFERENCES rbac_roles(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_name ON rbac_roles(name);
CREATE INDEX IF NOT EXISTS idx_rbac_roles_enabled ON rbac_roles(is_enabled);
CREATE INDEX IF NOT EXISTS idx_rbac_roles_parent ON rbac_roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_roles_deleted ON rbac_roles(deleted_at);

-- Permission Groups: Organize permissions into logical groups
CREATE TABLE IF NOT EXISTS rbac_permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  module TEXT,                           -- Feature/module this group belongs to
  parent_group_id INTEGER,               -- Permission group hierarchy
  display_order INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_group_id) REFERENCES rbac_permission_groups(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_perm_groups_name ON rbac_permission_groups(name);
CREATE INDEX IF NOT EXISTS idx_rbac_perm_groups_module ON rbac_permission_groups(module);

-- Permissions: Individual permissions that can be assigned to roles
CREATE TABLE IF NOT EXISTS rbac_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,              -- Machine-readable key (e.g., 'users.manage')
  display_name TEXT NOT NULL,
  description TEXT,
  group_id INTEGER,                       -- Permission group
  module TEXT,                            -- Feature/module this permission belongs to
  resource TEXT,                          -- Resource type (e.g., 'user', 'post', 'service')
  action TEXT,                            -- Action type (e.g., 'create', 'read', 'update', 'delete')
  is_system_permission INTEGER DEFAULT 0, -- System permissions cannot be deleted
  is_enabled INTEGER DEFAULT 1,
  requires_permissions TEXT,              -- JSON array of permission names this depends on
  metadata TEXT,                          -- JSON for extensible properties
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES rbac_permission_groups(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_permissions_name ON rbac_permissions(name);
CREATE INDEX IF NOT EXISTS idx_rbac_permissions_group ON rbac_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_rbac_permissions_module ON rbac_permissions(module);
CREATE INDEX IF NOT EXISTS idx_rbac_permissions_resource ON rbac_permissions(resource);
CREATE INDEX IF NOT EXISTS idx_rbac_permissions_action ON rbac_permissions(action);

-- Role Permissions: Many-to-many relationship between roles and permissions
CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  granted_by INTEGER,                    -- User who granted this permission
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,                   -- Optional expiration for temporary grants
  is_denied INTEGER DEFAULT 0,           -- Explicit denial overrides grants
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES rbac_permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_perms_role ON rbac_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_role_perms_perm ON rbac_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_rbac_role_perms_expires ON rbac_role_permissions(expires_at);

-- User Roles: Many-to-many relationship between users and roles
CREATE TABLE IF NOT EXISTS rbac_user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_by INTEGER,                   -- User who assigned this role
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,                   -- Optional expiration for temporary role assignments
  is_primary INTEGER DEFAULT 0,          -- Primary role for the user
  scope TEXT,                            -- Scope restriction (e.g., 'org:123', 'team:456')
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id, scope),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user ON rbac_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_role ON rbac_user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_expires ON rbac_user_roles(expires_at);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_primary ON rbac_user_roles(is_primary);

-- User Permission Overrides: User-specific permission grants/denials
CREATE TABLE IF NOT EXISTS rbac_user_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  is_granted INTEGER DEFAULT 1,          -- 1 = grant, 0 = deny
  is_temporary INTEGER DEFAULT 0,        -- Temporary override
  granted_by INTEGER,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,                   -- For temporary overrides
  reason TEXT,                           -- Reason for the override
  scope TEXT,                            -- Scope restriction
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, permission_id, scope),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES rbac_permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_overrides_user ON rbac_user_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_overrides_perm ON rbac_user_overrides(permission_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_overrides_expires ON rbac_user_overrides(expires_at);

-- =============================================================================
-- VERSIONING AND AUDIT TABLES
-- =============================================================================

-- RBAC Versions: Track version history of role/permission changes
CREATE TABLE IF NOT EXISTS rbac_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,             -- 'role', 'permission', 'group', 'assignment'
  entity_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,                -- JSON snapshot of the entity at this version
  change_type TEXT NOT NULL,             -- 'create', 'update', 'delete', 'restore'
  changed_by INTEGER,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_versions_entity ON rbac_versions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rbac_versions_changed_by ON rbac_versions(changed_by);
CREATE INDEX IF NOT EXISTS idx_rbac_versions_created ON rbac_versions(created_at);

-- RBAC Audit Logs: Detailed activity logging for all RBAC changes
CREATE TABLE IF NOT EXISTS rbac_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,                  -- 'role.create', 'permission.assign', 'user.role.assign', etc.
  actor_id INTEGER,                      -- User who performed the action
  target_type TEXT,                      -- 'role', 'permission', 'user', 'group'
  target_id INTEGER,
  target_name TEXT,
  affected_user_id INTEGER,              -- User affected by the action (if applicable)
  old_value TEXT,                        -- JSON of previous state
  new_value TEXT,                        -- JSON of new state
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  metadata TEXT,                         -- Additional context as JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (affected_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_action ON rbac_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor ON rbac_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_target ON rbac_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_affected ON rbac_audit_logs(affected_user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_created ON rbac_audit_logs(created_at);

-- =============================================================================
-- EXTENSIBILITY TABLES
-- =============================================================================

-- Module Registrations: Allow modules to register permissions dynamically
CREATE TABLE IF NOT EXISTS rbac_module_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  permissions_schema TEXT,               -- JSON schema defining available permissions
  is_enabled INTEGER DEFAULT 1,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rbac_modules_name ON rbac_module_registrations(module_name);

-- Default Role Assignments: Define default roles for new users or conditions
CREATE TABLE IF NOT EXISTS rbac_default_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  condition_type TEXT NOT NULL,          -- 'new_user', 'email_domain', 'invite_code', etc.
  condition_value TEXT,                  -- Value for the condition (e.g., '@company.com')
  priority INTEGER DEFAULT 0,            -- Higher priority evaluated first
  is_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rbac_defaults_role ON rbac_default_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_defaults_condition ON rbac_default_assignments(condition_type);

-- =============================================================================
-- LEGACY MAPPING TABLE
-- =============================================================================

-- Maps legacy role strings to new RBAC roles for backward compatibility
CREATE TABLE IF NOT EXISTS rbac_legacy_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_role TEXT NOT NULL,             -- Old role string (e.g., 'admin', 'super_admin')
  rbac_role_id INTEGER NOT NULL,
  legacy_permissions TEXT,               -- JSON array of old permission strings
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rbac_role_id) REFERENCES rbac_roles(id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_legacy_role ON rbac_legacy_mapping(legacy_role);

-- =====================================================
-- RBAC Database Schema for Dream X – Microsoft SQL Server
-- Fully compatible with SQL Server 2016+
-- =====================================================

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================================================
-- CORE RBAC TABLES
-- =============================================================================

-- Roles: Dynamic roles with inheritance, soft delete, versioning
IF OBJECT_ID('dbo.rbac_roles', 'U') IS NOT NULL DROP TABLE dbo.rbac_roles;
CREATE TABLE dbo.rbac_roles (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(100) NOT NULL UNIQUE,
    display_name    NVARCHAR(150) NOT NULL,
    description     NVARCHAR(500),
    is_system_role  BIT NOT NULL DEFAULT 0,           -- Cannot be deleted
    is_enabled      BIT NOT NULL DEFAULT 1,
    priority        INT NOT NULL DEFAULT 0,               -- Higher = takes precedence
    parent_role_id  BIGINT NULL,
    metadata        NVARCHAR(MAX),                        -- JSON recommended
    version         INT NOT NULL DEFAULT 1,
    deleted_at      DATETIME2 NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_roles_parent 
        FOREIGN KEY (parent_role_id) REFERENCES dbo.rbac_roles(id)
);

CREATE UNIQUE INDEX IDX_rbac_roles_name ON dbo.rbac_roles(name) WHERE deleted_at IS NULL;
CREATE INDEX IDX_rbac_roles_enabled ON dbo.rbac_roles(is_enabled);
CREATE INDEX IDX_rbac_roles_parent ON dbo.rbac_roles(parent_role_id);
CREATE INDEX IDX_rbac_roles_deleted ON dbo.rbac_roles(deleted_at);

-- Permission Groups
IF OBJECT_ID('dbo.rbac_permission_groups', 'U') IS NOT NULL DROP TABLE dbo.rbac_permission_groups;
CREATE TABLE dbo.rbac_permission_groups (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(100) NOT NULL UNIQUE,
    display_name    NVARCHAR(150) NOT NULL,
    description     NVARCHAR(500),
    module          NVARCHAR(100),
    parent_group_id BIGINT NULL,
    display_order   INT NOT NULL DEFAULT 0,
    is_enabled      BIT NOT NULL DEFAULT 1,
    deleted_at      DATETIME2 NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_perm_groups_parent 
        FOREIGN KEY (parent_group_id) REFERENCES dbo.rbac_permission_groups(id)
);

CREATE INDEX IDX_rbac_perm_groups_module ON dbo.rbac_permission_groups(module);

-- Permissions
IF OBJECT_ID('dbo.rbac_permissions', 'U') IS NOT NULL DROP TABLE dbo.rbac_permissions;
CREATE TABLE dbo.rbac_permissions (
    id                    BIGINT IDENTITY(1,1) PRIMARY KEY,
    name                  NVARCHAR(200) NOT NULL UNIQUE,           -- e.g. 'users.manage'
    display_name          NVARCHAR(150) NOT NULL,
    description           NVARCHAR(500),
    group_id              BIGINT NULL,
    module                NVARCHAR(100),
    resource              NVARCHAR(100),
    action                NVARCHAR(50),
    is_system_permission  BIT NOT NULL DEFAULT 0,
    is_enabled            BIT NOT NULL DEFAULT 1,
    requires_permissions  NVARCHAR(MAX),                           -- JSON array
    metadata              NVARCHAR(MAX),                           -- JSON
    deleted_at            DATETIME2 NULL,
    created_at            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_permissions_group 
        FOREIGN KEY (group_id) REFERENCES dbo.rbac_permission_groups(id)
);

CREATE INDEX IDX_rbac_permissions_module ON dbo.rbac_permissions(module);
CREATE INDEX IDX_rbac_permissions_resource ON dbo.rbac_permissions(resource);
CREATE INDEX IDX_rbac_permissions_action ON dbo.rbac_permissions(action);

-- Role ↔ Permission (many-to-many with denial & expiration support)
IF OBJECT_ID('dbo.rbac_role_permissions', 'U') IS NOT NULL DROP TABLE dbo.rbac_role_permissions;
CREATE TABLE dbo.rbac_role_permissions (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    role_id       BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    granted_by    INT NULL,
    granted_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at    DATETIME2 NULL,
    is_denied     BIT NOT NULL DEFAULT 0,        -- Explicit deny overrides grant
    metadata      NVARCHAR(MAX),

    CONSTRAINT UQ_rbac_role_permissions_role_perm 
        UNIQUE (role_id, permission_id),

    CONSTRAINT FK_rbac_role_perms_role 
        FOREIGN KEY (role_id) REFERENCES dbo.rbac_roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_role_perms_perm 
        FOREIGN KEY (permission_id) REFERENCES dbo.rbac_permissions(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_role_perms_granted_by 
        FOREIGN KEY (granted_by) REFERENCES dbo.users(id)
);

CREATE INDEX IDX_rbac_role_perms_role ON dbo.rbac_role_permissions(role_id);
CREATE INDEX IDX_rbac_role_perms_perm ON dbo.rbac_role_permissions(permission_id);
CREATE INDEX IDX_rbac_role_perms_expires ON dbo.rbac_role_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- User ↔ Role assignments (with scope, primary flag, expiration)
IF OBJECT_ID('dbo.rbac_user_roles', 'U') IS NOT NULL DROP TABLE dbo.rbac_user_roles;
CREATE TABLE dbo.rbac_user_roles (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT NOT NULL,
    role_id       BIGINT NOT NULL,
    assigned_by   INT NULL,
    assigned_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at    DATETIME2 NULL,
    is_primary    BIT NOT NULL DEFAULT 0,
    scope         NVARCHAR(200),                 -- e.g. 'org:123', 'team:456'
    metadata      NVARCHAR(MAX),

    CONSTRAINT UQ_rbac_user_roles_user_role_scope 
        UNIQUE (user_id, role_id, scope),

    CONSTRAINT FK_rbac_user_roles_user 
        FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_roles_role 
        FOREIGN KEY (role_id) REFERENCES dbo.rbac_roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_roles_assigned_by 
        FOREIGN KEY (assigned_by) REFERENCES dbo.users(id)
);

CREATE INDEX IDX_rbac_user_roles_user ON dbo.rbac_user_roles(user_id);
CREATE INDEX IDX_rbac_user_roles_role ON dbo.rbac_user_roles(role_id);
CREATE INDEX IDX_rbac_user_roles_expires ON dbo.rbac_user_roles(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IDX_rbac_user_roles_primary ON dbo.rbac_user_roles(is_primary) WHERE is_primary = 1;

-- User-specific permission overrides (grant/deny outside of roles)
IF OBJECT_ID('dbo.rbac_user_overrides', 'U') IS NOT NULL DROP TABLE dbo.rbac_user_overrides;
CREATE TABLE dbo.rbac_user_overrides (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT NOT NULL,
    permission_id BIGINT NOT NULL,
    is_granted    BIT NOT NULL DEFAULT 1,        -- 1 = grant, 0 = deny
    is_temporary  BIT NOT NULL DEFAULT 0,
    granted_by    INT NULL,
    granted_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at    DATETIME2 NULL,
    reason        NVARCHAR(500),
    scope         NVARCHAR(200),
    metadata      NVARCHAR(MAX),

    CONSTRAINT UQ_rbac_user_overrides_user_perm_scope 
        UNIQUE (user_id, permission_id, scope),

    CONSTRAINT FK_rbac_user_overrides_user 
        FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_overrides_perm 
        FOREIGN KEY (permission_id) REFERENCES dbo.rbac_permissions(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_overrides_granted_by 
        FOREIGN KEY (granted_by) REFERENCES dbo.users(id)
);

CREATE INDEX IDX_rbac_user_overrides_user ON dbo.rbac_user_overrides(user_id);
CREATE INDEX IDX_rbac_user_overrides_perm ON dbo.rbac_user_overrides(permission_id);
CREATE INDEX IDX_rbac_user_overrides_expires ON dbo.rbac_user_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================================================
-- VERSIONING & AUDIT
-- =============================================================================

IF OBJECT_ID('dbo.rbac_versions', 'U') IS NOT NULL DROP TABLE dbo.rbac_versions;
CREATE TABLE dbo.rbac_versions (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    entity_type   NVARCHAR(50) NOT NULL,     -- 'role', 'permission', 'group', 'assignment'
    entity_id     BIGINT NOT NULL,
    version       INT NOT NULL,
    snapshot      NVARCHAR(MAX) NOT NULL,    -- JSON snapshot
    change_type   NVARCHAR(50) NOT NULL,     -- 'create', 'update', 'delete', 'restore'
    changed_by    INT NULL,
    change_reason NVARCHAR(500),
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_versions_changed_by FOREIGN KEY (changed_by) REFERENCES dbo.users(id)
);

CREATE INDEX IDX_rbac_versions_entity ON dbo.rbac_versions(entity_type, entity_id);
CREATE INDEX IDX_rbac_versions_created ON dbo.rbac_versions(created_at);

IF OBJECT_ID('dbo.rbac_audit_logs', 'U') IS NOT NULL DROP TABLE dbo.rbac_audit_logs;
CREATE TABLE dbo.rbac_audit_logs (
    id               BIGINT IDENTITY(1,1) PRIMARY KEY,
    action           NVARCHAR(200) NOT NULL,
    actor_id         INT NULL,
    target_type      NVARCHAR(50),
    target_id        BIGINT,
    target_name      NVARCHAR(200),
    affected_user_id INT NULL,
    old_value        NVARCHAR(MAX),             -- JSON
    new_value        NVARCHAR(MAX),             -- JSON
    ip_address       NVARCHAR(45),
    user_agent       NVARCHAR(500),
    session_id       NVARCHAR(200),
    metadata         NVARCHAR(MAX),
    created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_audit_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_rbac_audit_affected FOREIGN KEY (affected_user_id) REFERENCES dbo.users(id)
);

CREATE INDEX IDX_rbac_audit_action ON dbo.rbac_audit_logs(action);
CREATE INDEX IDX_rbac_audit_actor ON dbo.rbac_audit_logs(actor_id);
CREATE INDEX IDX_rbac_audit_target ON dbo.rbac_audit_logs(target_type, target_id);
CREATE INDEX IDX_rbac_audit_created ON dbo.rbac_audit_logs(created_at);

-- =============================================================================
-- EXTENSIBILITY
-- =============================================================================

IF OBJECT_ID('dbo.rbac_module_registrations', 'U') IS NOT NULL DROP TABLE dbo.rbac_module_registrations;
CREATE TABLE dbo.rbac_module_registrations (
    id                BIGINT IDENTITY(1,1) PRIMARY KEY,
    module_name       NVARCHAR(100) NOT NULL UNIQUE,
    display_name      NVARCHAR(150) NOT NULL,
    description       NVARCHAR(500),
    version           NVARCHAR(50),
    permissions_schema NVARCHAR(MAX),           -- JSON schema
    is_enabled        BIT NOT NULL DEFAULT 1,
    registered_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.rbac_default_assignments', 'U') IS NOT NULL DROP TABLE dbo.rbac_default_assignments;
CREATE TABLE dbo.rbac_default_assignments (
    id               BIGINT IDENTITY(1,1) PRIMARY KEY,
    role_id          BIGINT NOT NULL,
    condition_type   NVARCHAR(100) NOT NULL,   -- 'new_user', 'email_domain', etc.
    condition_value  NVARCHAR(200),
    priority         INT NOT NULL DEFAULT 0,
    is_enabled       BIT NOT NULL DEFAULT 1,
    created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_default_role FOREIGN KEY (role_id) REFERENCES dbo.rbac_roles(id) ON DELETE CASCADE
);

-- =============================================================================
-- LEGACY MAPPING
-- =============================================================================

IF OBJECT_ID('dbo.rbac_legacy_mapping', 'U') IS NOT NULL DROP TABLE dbo.rbac_legacy_mapping;
CREATE TABLE dbo.rbac_legacy_mapping (
    id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
    legacy_role        NVARCHAR(100) NOT NULL,
    rbac_role_id     BIGINT NOT NULL,
    legacy_permissions NVARCHAR(MAX),            -- JSON array of old strings
    created_at         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_rbac_legacy_rbac_role 
        FOREIGN KEY (rbac_role_id) REFERENCES dbo.rbac_roles(id)
);

CREATE UNIQUE INDEX IDX_rbac_legacy_role ON dbo.rbac_legacy_mapping(legacy_role);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
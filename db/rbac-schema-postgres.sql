-- =====================================================
-- RBAC Database Schema for Dream X – PostgreSQL
-- Fully compatible with PostgreSQL 12+
-- =====================================================

-- =============================================================================
-- CORE RBAC TABLES
-- Drop tables in correct order (child tables with FKs first, then parent tables)
-- =============================================================================

-- Drop child tables first (those with foreign key references)
DROP TABLE IF EXISTS rbac_user_overrides;
DROP TABLE IF EXISTS rbac_user_roles;
DROP TABLE IF EXISTS rbac_role_permissions;
DROP TABLE IF EXISTS rbac_permissions;
DROP TABLE IF EXISTS rbac_permission_groups;
DROP TABLE IF EXISTS rbac_roles;

-- Roles: Dynamic roles with inheritance, soft delete, versioning
CREATE TABLE rbac_roles (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    display_name    VARCHAR(150) NOT NULL,
    description     VARCHAR(500),
    is_system_role  BOOLEAN NOT NULL DEFAULT false,           -- Cannot be deleted
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    priority        INTEGER NOT NULL DEFAULT 0,               -- Higher = takes precedence
    parent_role_id  BIGINT,
    metadata        TEXT,                        -- JSON recommended
    version         INTEGER NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_roles_parent 
        FOREIGN KEY (parent_role_id) REFERENCES rbac_roles(id)
);

CREATE UNIQUE INDEX IDX_rbac_roles_name ON rbac_roles(name) WHERE deleted_at IS NULL;
CREATE INDEX IDX_rbac_roles_enabled ON rbac_roles(is_enabled);
CREATE INDEX IDX_rbac_roles_parent ON rbac_roles(parent_role_id);
CREATE INDEX IDX_rbac_roles_deleted ON rbac_roles(deleted_at);

-- Permission Groups
CREATE TABLE rbac_permission_groups (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    display_name    VARCHAR(150) NOT NULL,
    description     VARCHAR(500),
    module          VARCHAR(100),
    parent_group_id BIGINT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_perm_groups_parent 
        FOREIGN KEY (parent_group_id) REFERENCES rbac_permission_groups(id)
);

CREATE INDEX IDX_rbac_perm_groups_module ON rbac_permission_groups(module);

-- Permissions
CREATE TABLE rbac_permissions (
    id                    BIGSERIAL PRIMARY KEY,
    name                  VARCHAR(200) NOT NULL UNIQUE,           -- e.g. 'users.manage'
    display_name          VARCHAR(150) NOT NULL,
    description           VARCHAR(500),
    group_id              BIGINT,
    module                VARCHAR(100),
    resource              VARCHAR(100),
    action                VARCHAR(50),
    is_system_permission  BOOLEAN NOT NULL DEFAULT false,
    is_enabled            BOOLEAN NOT NULL DEFAULT true,
    requires_permissions  TEXT,                           -- JSON array
    metadata              TEXT,                           -- JSON
    deleted_at            TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_permissions_group 
        FOREIGN KEY (group_id) REFERENCES rbac_permission_groups(id)
);

CREATE INDEX IDX_rbac_permissions_module ON rbac_permissions(module);
CREATE INDEX IDX_rbac_permissions_resource ON rbac_permissions(resource);
CREATE INDEX IDX_rbac_permissions_action ON rbac_permissions(action);

-- Role ↔ Permission (many-to-many with denial & expiration support)
CREATE TABLE rbac_role_permissions (
    id            BIGSERIAL PRIMARY KEY,
    role_id       BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    granted_by    INTEGER,
    granted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP,
    is_denied     BOOLEAN NOT NULL DEFAULT false,        -- Explicit deny overrides grant
    metadata      TEXT,

    CONSTRAINT UQ_rbac_role_permissions_role_perm 
        UNIQUE (role_id, permission_id),

    CONSTRAINT FK_rbac_role_perms_role 
        FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_role_perms_perm 
        FOREIGN KEY (permission_id) REFERENCES rbac_permissions(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_role_perms_granted_by 
        FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE INDEX IDX_rbac_role_perms_role ON rbac_role_permissions(role_id);
CREATE INDEX IDX_rbac_role_perms_perm ON rbac_role_permissions(permission_id);
CREATE INDEX IDX_rbac_role_perms_expires ON rbac_role_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- User ↔ Role assignments (with scope, primary flag, expiration)
CREATE TABLE rbac_user_roles (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    role_id       BIGINT NOT NULL,
    assigned_by   INTEGER,
    assigned_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP,
    is_primary    BOOLEAN NOT NULL DEFAULT false,
    scope         VARCHAR(200),                 -- e.g. 'org:123', 'team:456'
    metadata      TEXT,

    CONSTRAINT UQ_rbac_user_roles_user_role_scope 
        UNIQUE (user_id, role_id, scope),

    CONSTRAINT FK_rbac_user_roles_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_roles_role 
        FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_roles_assigned_by 
        FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX IDX_rbac_user_roles_user ON rbac_user_roles(user_id);
CREATE INDEX IDX_rbac_user_roles_role ON rbac_user_roles(role_id);
CREATE INDEX IDX_rbac_user_roles_expires ON rbac_user_roles(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IDX_rbac_user_roles_primary ON rbac_user_roles(is_primary) WHERE is_primary = true;

-- User-specific permission overrides (grant/deny outside of roles)
CREATE TABLE rbac_user_overrides (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    permission_id BIGINT NOT NULL,
    is_granted    BOOLEAN NOT NULL DEFAULT true,        -- true = grant, false = deny
    is_temporary  BOOLEAN NOT NULL DEFAULT false,
    granted_by    INTEGER,
    granted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP,
    reason        VARCHAR(500),
    scope         VARCHAR(200),
    metadata      TEXT,

    CONSTRAINT UQ_rbac_user_overrides_user_perm_scope 
        UNIQUE (user_id, permission_id, scope),

    CONSTRAINT FK_rbac_user_overrides_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_overrides_perm 
        FOREIGN KEY (permission_id) REFERENCES rbac_permissions(id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_user_overrides_granted_by 
        FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE INDEX IDX_rbac_user_overrides_user ON rbac_user_overrides(user_id);
CREATE INDEX IDX_rbac_user_overrides_perm ON rbac_user_overrides(permission_id);
CREATE INDEX IDX_rbac_user_overrides_expires ON rbac_user_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================================================
-- VERSIONING & AUDIT
-- =============================================================================

-- Drop versioning and audit tables
DROP TABLE IF EXISTS rbac_audit_logs;
DROP TABLE IF EXISTS rbac_versions;

CREATE TABLE rbac_versions (
    id            BIGSERIAL PRIMARY KEY,
    entity_type   VARCHAR(50) NOT NULL,     -- 'role', 'permission', 'group', 'assignment'
    entity_id     BIGINT NOT NULL,
    version       INTEGER NOT NULL,
    snapshot      TEXT NOT NULL,    -- JSON snapshot
    change_type   VARCHAR(50) NOT NULL,     -- 'create', 'update', 'delete', 'restore'
    changed_by    INTEGER,
    change_reason VARCHAR(500),
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_versions_changed_by FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE INDEX IDX_rbac_versions_entity ON rbac_versions(entity_type, entity_id);
CREATE INDEX IDX_rbac_versions_created ON rbac_versions(created_at);

CREATE TABLE rbac_audit_logs (
    id               BIGSERIAL PRIMARY KEY,
    action           VARCHAR(200) NOT NULL,
    actor_id         INTEGER,
    target_type      VARCHAR(50),
    target_id        BIGINT,
    target_name      VARCHAR(200),
    affected_user_id INTEGER,
    old_value        TEXT,             -- JSON
    new_value        TEXT,             -- JSON
    ip_address       VARCHAR(45),
    user_agent       VARCHAR(500),
    session_id       VARCHAR(200),
    metadata         TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id),
    CONSTRAINT FK_rbac_audit_affected FOREIGN KEY (affected_user_id) REFERENCES users(id)
);

CREATE INDEX IDX_rbac_audit_action ON rbac_audit_logs(action);
CREATE INDEX IDX_rbac_audit_actor ON rbac_audit_logs(actor_id);
CREATE INDEX IDX_rbac_audit_target ON rbac_audit_logs(target_type, target_id);
CREATE INDEX IDX_rbac_audit_created ON rbac_audit_logs(created_at);

-- =============================================================================
-- EXTENSIBILITY
-- =============================================================================

-- Drop extensibility tables
DROP TABLE IF EXISTS rbac_default_assignments;
DROP TABLE IF EXISTS rbac_module_registrations;

CREATE TABLE rbac_module_registrations (
    id                BIGSERIAL PRIMARY KEY,
    module_name       VARCHAR(100) NOT NULL UNIQUE,
    display_name      VARCHAR(150) NOT NULL,
    description       VARCHAR(500),
    version           VARCHAR(50),
    permissions_schema TEXT,           -- JSON schema
    is_enabled        BOOLEAN NOT NULL DEFAULT true,
    registered_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rbac_default_assignments (
    id               BIGSERIAL PRIMARY KEY,
    role_id          BIGINT NOT NULL,
    condition_type   VARCHAR(100) NOT NULL,   -- 'new_user', 'email_domain', etc.
    condition_value  VARCHAR(200),
    priority         INTEGER NOT NULL DEFAULT 0,
    is_enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_default_role FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE
);

-- =============================================================================
-- LEGACY MAPPING
-- =============================================================================

-- Drop legacy mapping table
DROP TABLE IF EXISTS rbac_legacy_mapping;

CREATE TABLE rbac_legacy_mapping (
    id                 BIGSERIAL PRIMARY KEY,
    legacy_role        VARCHAR(100) NOT NULL,
    rbac_role_id     BIGINT NOT NULL,
    legacy_permissions TEXT,            -- JSON array of old strings
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT FK_rbac_legacy_rbac_role 
        FOREIGN KEY (rbac_role_id) REFERENCES rbac_roles(id)
);

CREATE UNIQUE INDEX IDX_rbac_legacy_role ON rbac_legacy_mapping(legacy_role);

-- =====================================================
-- END OF SCHEMA
-- =====================================================

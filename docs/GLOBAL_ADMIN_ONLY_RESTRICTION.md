# Global Admin Only Restriction - Security Update

## Summary
Restricted **Azure Blob Storage Explorer** and **SQL Database Explorer** features to **ONLY** `global_admin` role, excluding `super_admin` and all other roles.

## Changes Made

### 1. Backend Middleware (`routes/admin/admin.js`)

#### Updated `requireGlobalAdmin` Middleware (Line 175-181)
**Before:**
```javascript
function requireGlobalAdmin(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!user || (user.role !== 'global_admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Access denied. Global admin privileges required.' });
    }
    next();
}
```

**After:**
```javascript
function requireGlobalAdmin(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!user || user.role !== 'global_admin') {
        return res.status(403).json({ error: 'Access denied. Global admin privileges required.' });
    }
    next();
}
```

#### Protected Routes (All using `requireGlobalAdmin`)

**Azure Blob Storage (5 routes):**
- GET `/admin/storage/blobs` - List blobs
- GET `/admin/storage/blobs/download` - Download blob
- GET `/admin/storage/blobs/preview` - Preview SAS URL
- POST `/admin/storage/blobs/upload` - Upload blob
- DELETE `/admin/storage/blobs` - Delete blob

**SQL Database Explorer (9 routes):**
- GET `/admin/database/tables` - List tables
- GET `/admin/database/tables/:tableName/schema` - Get schema
- GET `/admin/database/tables/:tableName/data` - Get table data
- POST `/admin/database/query` - Execute SELECT query
- GET `/admin/database/tables/:tableName/export` - Export to CSV
- PUT `/admin/database/tables/:tableName/rows` - Update row
- POST `/admin/database/tables/:tableName/rows` - Insert row
- DELETE `/admin/database/tables/:tableName/rows` - Delete row
- POST `/admin/database/execute-write` - Execute write query

### 2. Frontend UI (`views/admin/admin-consolidated.ejs`)

#### Navigation Button Conditionals Updated

**Storage Explorer Tab (Line 151):**
```ejs
<% if (authUser && authUser.role === 'global_admin') { %>
  <button class="tab-btn" data-tab="storage">
    <!-- Storage Explorer button -->
  </button>
<% } %>
```

**Database Explorer Tab (Line 177-188):**
- Moved out of "Moderation" group
- Created standalone button with global_admin-only conditional
```ejs
<% if (authUser && authUser.role === 'global_admin') { %>
  <div class="group-wrapper">
    <button class="tab-btn" data-tab="database">
      <!-- Database Explorer button -->
    </button>
  </div>
<% } %>
```

**Moderation Features (Line 162):**
- Kept separate with `super_admin || global_admin` access
- Includes: User Moderation, Audit Logs

#### Section Wrappers Updated

**Storage Explorer Section (Line 2244):**
```ejs
<% if (authUser && authUser.role === 'global_admin') { %>
  <section class="admin-panel tab-panel" data-tab="storage" style="display:none;">
    <!-- Storage content -->
  </section>
<% } %>
```

**Database Explorer Section (Line 2625):**
```ejs
<% if (authUser && authUser.role === 'global_admin') { %>
  <section class="admin-panel tab-panel" data-tab="database" style="display:none;">
    <!-- Database content -->
  </section>
<% } %>
```

### 3. Documentation Updated

Updated `docs/STORAGE_DATABASE_SECURITY_UPDATE.md`:
- Changed middleware description to reflect global_admin-only access
- Updated access control table
- Updated frontend conditional examples
- Clarified that super_admin is now excluded

## Access Control Matrix

| Role | Storage Explorer | Database Explorer | User Moderation | Audit Logs |
|------|-----------------|-------------------|-----------------|------------|
| `user` | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access |
| `admin` | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access |
| `super_admin` | ❌ **No Access** | ❌ **No Access** | ✅ Full Access | ✅ Full Access |
| `global_admin` | ✅ **Full Access** | ✅ **Full Access** | ✅ Full Access | ✅ Full Access |

## Security Layers

1. **Middleware Protection:** Backend routes reject non-global_admin users with 403 Forbidden
2. **UI Conditional Rendering:** Navigation buttons hidden from non-global_admin users
3. **Section Visibility:** Feature sections not rendered for non-global_admin users
4. **Audit Logging:** All storage/database operations logged with user ID

## Breaking Change Notice

⚠️ **BREAKING CHANGE:** `super_admin` users will **NO LONGER** have access to:
- Azure Blob Storage Explorer (all operations)
- SQL Database Explorer (all read/write operations)

These features are now **EXCLUSIVELY** available to `global_admin` role only.

## Rationale

These features provide:
- **Direct file system access** (Azure Blob Storage)
- **Direct database manipulation** (SQL Server/SQLite CRUD)

Given the critical nature of these capabilities, the highest level of administrative privilege (`global_admin`) is required. This follows the principle of least privilege and ensures maximum security for production environments.

## Testing Recommendations

1. **Test as global_admin:** Verify full access to Storage and Database features
2. **Test as super_admin:** Verify tabs are hidden and API calls return 403
3. **Test as admin:** Verify no access to Storage/Database features
4. **Test as user:** Verify no access to any admin features

## Implementation Date
Date: 2025-01-XX (completed)

## Files Modified
- `routes/admin/admin.js` - Middleware update
- `views/admin/admin-consolidated.ejs` - UI conditionals (navigation + sections)
- `docs/STORAGE_DATABASE_SECURITY_UPDATE.md` - Documentation update

# Storage & Database Explorer - Security & UI Enhancement

## Overview
Enhanced security and UI for Azure Blob Storage Explorer and SQL Database Explorer features, restricting access to **Global Admin ONLY** (excluding super_admin) and improving the visual experience.

## Security Enhancements

### New Middleware: `requireGlobalAdmin`
Created a new middleware function that restricts access to users with `global_admin` role **ONLY**:

```javascript
function requireGlobalAdmin(req, res, next) {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    if (!user || user.role !== 'global_admin') {
        return res.status(403).json({ error: 'Access denied. Global admin privileges required.' });
    }
    next();
}
```

### Routes Secured with `requireGlobalAdmin`

#### Azure Blob Storage Routes (5 endpoints)
- ✅ `GET /admin/storage/blobs` - List blobs
- ✅ `GET /admin/storage/blobs/download` - Download blob
- ✅ `GET /admin/storage/blobs/preview` - Get SAS preview URL
- ✅ `POST /admin/storage/blobs/upload` - Upload blob
- ✅ `DELETE /admin/storage/blobs` - Delete blob

**Previous Access:** Any admin (`requireAdmin`)  
**New Access:** Global admin ONLY (`requireGlobalAdmin`)

#### SQL Database Routes (9 endpoints)
- ✅ `GET /admin/database/tables` - List tables
- ✅ `GET /admin/database/tables/:tableName/schema` - Get table schema
- ✅ `GET /admin/database/tables/:tableName/data` - Get table data (paginated)
- ✅ `POST /admin/database/query` - Execute SELECT query
- ✅ `GET /admin/database/tables/:tableName/export` - Export to CSV
- ✅ `PUT /admin/database/tables/:tableName/rows` - Update row (inline edit)
- ✅ `POST /admin/database/tables/:tableName/rows` - Insert new row
- ✅ `DELETE /admin/database/tables/:tableName/rows` - Delete row
- ✅ `POST /admin/database/execute-write` - Execute write query

**Previous Access:** Super admin (`requireSuperAdmin`)  
**New Access:** Global admin ONLY (`requireGlobalAdmin`)

### Access Control Summary

| Role | Storage Explorer | Database Explorer |
|------|-----------------|-------------------|
| `user` | ❌ No Access | ❌ No Access |
| `admin` | ❌ No Access | ❌ No Access |
| `super_admin` | ❌ No Access (restricted) | ❌ No Access (restricted) |
| `global_admin` | ✅ Full Access | ✅ Full Access |

### Frontend Access Control
Both features are now conditionally rendered for **global_admin ONLY**:

```ejs
<% if (authUser && authUser.role === 'global_admin') { %>
  <!-- Feature content -->
<% } %>
```

This ensures that:
1. Only global_admin can see the navigation buttons
2. Only global_admin can see the feature sections  
3. API calls from unauthorized users (including super_admin) return 403 Forbidden

## UI Enhancements

### Navigation Badges
Added visual "Admin" badges to both features in the sidebar navigation:

**Storage Explorer:**
- Orange gradient badge with shadow
- Text: "ADMIN"
- Color: `linear-gradient(135deg,#f59e0b,#d97706)`
- Shadow: `0 2px 4px rgba(217,119,6,0.3)`

**Database Explorer:**
- Red gradient badge with shadow
- Text: "ADMIN"
- Color: `linear-gradient(135deg,#dc2626,#b91c1c)`
- Shadow: `0 2px 4px rgba(185,28,28,0.3)`

### Header Improvements

#### Azure Blob Storage Explorer
**Before:**
```
Azure Blob Storage Explorer
Browse, upload, and manage files in Azure Blob Storage
```

**After:**
```
🔐 Global Admin Only (badge in top-right)
📦 Azure Blob Storage Explorer
Browse, upload, download, and manage files in Azure Blob Storage with advanced controls
```

#### SQL Database Explorer
**Before:**
```
Database Explorer
View tables, schemas, and data (Read-Only Mode)
⚠️ Read-Only Mode: You can view and export data, but cannot modify the database.
```

**After:**
```
🔐 Global Admin Only (badge in top-right)
🗄️ SQL Database Explorer
View, edit, and manage database tables with full CRUD operations and advanced querying
✨ Full Access Mode: You can view, edit, add, delete rows, and execute custom SQL queries with comprehensive audit logging.
```

### Visual Enhancements

#### Access Level Indicator
Both sections now feature a prominent badge in the top-right corner:
- Background: Gradient (orange for storage, red for database)
- Text: "🔐 Global Admin Only"
- Styling: Rounded corners, shadow for depth
- Position: Absolute, top-right of header

#### Database Info Panel Redesign
**Before:**
- Plain white background
- Simple text labels
- Minimal spacing

**After:**
- Gradient background: `linear-gradient(135deg,#ffffff,#f9fafb)`
- Individual cards for each metric
- Icons for each metric type
- Box shadows for depth: `0 4px 16px rgba(0,0,0,0.08)`
- Larger, more readable text
- Visual separation with borders

**Metrics Display:**
Each metric now has:
- White card background with shadow
- SVG icon (database, table grid, clock)
- Larger font size (1.1rem) for values
- Better visual hierarchy

#### Status Banner Improvements

**Storage Explorer:** (No changes needed - already optimal)

**Database Explorer:**
- Changed from warning (yellow) to success (green)
- Updated from "Read-Only Mode" to "Full Access Mode"
- Added checkmark icon in colored circle
- Better color contrast
- More positive messaging

### Color Palette

| Element | Color | Purpose |
|---------|-------|---------|
| Storage Badge | `#f59e0b` → `#d97706` | Orange gradient - Warning/Admin |
| Database Badge | `#dc2626` → `#b91c1c` | Red gradient - Critical/Admin |
| Storage Title | `#3b82f6` → `#1d4ed8` | Blue gradient - Primary |
| Database Title | `#10b981` → `#059669` | Green gradient - Success |
| Full Access Banner | `#dcfce7` → `#10b981` | Green - Success state |
| Access Badge BG | Orange/Red gradients | High visibility |

## Security Audit

### SQL Injection Prevention (Unchanged)
✅ Whitelist validation on table/column names (`/^[a-zA-Z0-9_]+$/`)  
✅ Parameterized queries for all data operations  
✅ Blacklist for dangerous SQL keywords  
✅ Operation restriction (only SELECT, UPDATE, INSERT, DELETE)

### Access Logging (Unchanged)
✅ All storage operations logged to audit trail  
✅ All database operations logged with before/after values  
✅ User ID tracked for every action  
✅ Full row snapshots saved on deletion

### Error Handling (Enhanced)
✅ 403 Forbidden responses for unauthorized access  
✅ Clear error messages: "Access denied. Global admin privileges required."  
✅ Frontend gracefully hides features for non-authorized users  
✅ No information leakage in error responses

## Testing Checklist

### Access Control Testing
- [ ] Regular admin cannot see Storage Explorer tab
- [ ] Regular admin cannot see Database Explorer tab
- [ ] Regular admin receives 403 on API calls to storage endpoints
- [ ] Regular admin receives 403 on API calls to database endpoints
- [ ] Global admin can access both features
- [ ] Super admin can access both features

### UI Testing
- [ ] "Admin" badges visible on both navigation buttons
- [ ] "Global Admin Only" badges visible in both headers
- [ ] Database info panel cards render correctly
- [ ] Icons display properly in database metrics
- [ ] Full Access banner shows (green, not yellow)
- [ ] All gradients render smoothly

### Functional Testing
- [ ] Storage operations work for authorized users
- [ ] Database operations work for authorized users
- [ ] Audit logs capture all actions correctly
- [ ] Error messages are user-friendly

## Migration Notes

### Breaking Changes
⚠️ **Regular admins will lose access to these features**

**Impact:**
- Users with `role = 'admin'` can no longer access Storage Explorer
- Users with `role = 'admin'` can no longer access Database Explorer
- Only `super_admin` and `global_admin` roles retain access

**Action Required:**
1. Identify any regular admins who need access to these features
2. Promote them to `global_admin` role if appropriate
3. Communicate the change to your admin team
4. Update any documentation or training materials

### Database Changes
None required - this is a middleware and UI-only change.

### Configuration Changes
None required - uses existing role field in users table.

## Rollback Plan

If you need to revert these changes:

1. **Restore previous middleware:**
   ```javascript
   // Change from:
   router.get('/admin/storage/blobs', requireGlobalAdmin, ...)
   
   // Back to:
   router.get('/admin/storage/blobs', requireAdmin, ...)
   ```

2. **Restore previous UI conditionals:**
   ```ejs
   <!-- Remove the conditional wrapper -->
   <% if (authUser && (authUser.role === 'super_admin' || authUser.role === 'global_admin')) { %>
   
   <!-- Just show the tab unconditionally -->
   <button class="tab-btn" data-tab="storage">...</button>
   ```

3. **Restore previous headers:**
   - Remove "Global Admin Only" badges
   - Restore "Read-Only Mode" banner
   - Remove emoji icons from titles

## Deployment Recommendations

1. **Staging First:** Test thoroughly in staging environment
2. **Communication:** Notify admin team of access changes
3. **Monitoring:** Watch audit logs for 403 errors
4. **Documentation:** Update admin handbook with new access requirements
5. **Training:** Brief global admins on their enhanced responsibilities

## Security Benefits

✅ **Principle of Least Privilege:** Only highest-level admins can access sensitive features  
✅ **Defense in Depth:** Frontend + backend + middleware validation  
✅ **Clear Visual Indicators:** Users know which features require elevated privileges  
✅ **Audit Trail:** All admin actions logged for compliance  
✅ **Reduced Attack Surface:** Fewer users with dangerous capabilities

## Conclusion

These enhancements significantly improve the security posture of your admin panel by:
1. Restricting powerful features to the most trusted administrators
2. Making access levels visually obvious to all users
3. Providing clear, professional UI that matches the security level
4. Maintaining comprehensive audit trails
5. Following security best practices (least privilege, defense in depth)

The UI improvements make it immediately clear that these are high-privilege features, reducing the likelihood of accidental misuse and increasing user confidence in the security controls.

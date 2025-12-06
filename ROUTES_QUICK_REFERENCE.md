# Routes Quick Reference

## Final Structure (19 Route Files)

### 📁 Organized Subfolders

| Folder | Files | Purpose |
|--------|-------|---------|
| **admin/** | 3 files | Admin dashboard, user management, RBAC |
| **auth/** | 3 files | Authentication, OAuth, API tokens, WebAuthn |
| **feed/** | 1 file | Social feed, posts, comments, reactions |
| **hr/** | 1 file | Career jobs, applications, team management |
| **messages/** | 1 file | Direct messages, group chats |
| **onboarding/** | 1 file | User onboarding flow |
| **profile/** | 1 file | User profiles, follow/unfollow |
| **projects/** | 1 file | Project management system |
| **services/** | 1 file | Services marketplace |
| **settings/** | 1 file | User settings, billing, privacy |
| **static/** | 1 file | PWA manifest, sitemap |
| **Root** | 4 files | API, business, misc, utils |

## Route File Mapping

| Route File | Lines | Primary Routes | Description |
|------------|-------|----------------|-------------|
| `admin/admin.js` | 1,256 | `/admin/*` | Admin dashboard, user management, moderation |
| `admin/rbac.js` | 794 | `/api/rbac/*` | RBAC API endpoints |
| `admin/rbac-dashboard.js` | 959 | `/rbac/*` | RBAC dashboard UI |
| `auth/auth.js` | 969 | `/login`, `/register`, `/auth/*` | OAuth, login, register, password reset |
| `auth/api-auth.js` | 597 | `/api/auth/*` | Mobile API token authentication |
| `auth/webauthn.js` | 282 | `/webauthn/*` | WebAuthn/passkey authentication |
| `feed/feed.js` | 846 | `/feed`, `/post/*`, `/search` | Feed, posts, comments, reactions |
| `hr/hr.js` | 447 | `/hr`, `/api/hr/*` | HR dashboard, career jobs |
| `messages/messages.js` | 568 | `/messages`, `/api/messages/*` | DMs, group chats |
| `onboarding/onboarding.js` | 141 | `/onboarding` | User onboarding flow |
| `profile/profile.js` | 573 | `/profile` | User profiles, editing |
| `projects/projects.js` | 954 | `/projects` | Project management |
| `services/services.js` | 465 | `/services` | Services marketplace |
| `settings/settings.js` | 654 | `/settings` | User settings, billing |
| `static/static.js` | 64 | `/manifest.json`, `/sitemap.xml` | PWA, sitemap |
| `api.js` | 141 | `/api/notifications/*`, `/api/push/*` | Misc API endpoints |
| `business.js` | 644 | `/business/*`, `/api/sales-inquiries/*` | Sales inquiries, pricing |
| `misc.js` | 417 | `/map`, `/pricing`, `/help-center` | Misc pages |
| `utils.js` | 85 | N/A (utilities) | Shared helper functions |

## Import Patterns

### From Subfolder Routes (e.g., `routes/auth/auth.js`)
```javascript
const { getUserById } = require('../../db');              // ✅ Correct
const emailService = require('../../services/emailService'); // ✅ Correct
const { getRequestBaseUrl } = require('../utils');        // ✅ Correct
```

### From Root Routes (e.g., `routes/api.js`)
```javascript
const { getUserById } = require('../db');              // ✅ Correct
const emailService = require('../services/emailService'); // ✅ Correct
```

## app.js Mounting

All routes are now mounted in `app.js` starting at line ~515:

```javascript
// ✅ Already Mounted
const authRoutes = require('./routes/auth/auth');
app.use('/', authRoutes);

const adminRoutes = require('./routes/admin/admin');
app.use('/', adminRoutes);

const feedRoutes = require('./routes/feed/feed');
app.use('/', feedRoutes);

// ... and 13 more route modules
```

## Verification Status

✅ **All Syntax Checks Passed** (19/19 files)
✅ **All Import Paths Corrected**
✅ **All Routes Mounted in app.js**
✅ **No Duplicate Files**
✅ **Clean Directory Structure**

## Next Steps

1. ✅ **DONE**: All route files organized and moved
2. ✅ **DONE**: Import paths updated  
3. ✅ **DONE**: app.js updated with route imports
4. ⚠️ **TODO**: Test the application to verify all routes work
5. ⚠️ **TODO**: Remove inline route definitions from app.js once verified

## Key Changes Made

1. **Moved** 15 route files from `/routes/*.js` to appropriate subfolders
2. **Updated** all relative import paths in moved files (`../` → `../../`)
3. **Added** comprehensive route imports and mounts in `app.js`
4. **Removed** empty/partial duplicate files from subfolders
5. **Preserved** behavior - no business logic changes

## Testing Checklist

Test each route group to ensure proper functionality:

- [ ] Auth: Login, register, OAuth flows work
- [ ] Admin: Dashboard accessible, user management works
- [ ] Feed: Posts display, comments/reactions work
- [ ] Profile: Can view/edit profiles
- [ ] Messages: Can send/receive messages
- [ ] Settings: Settings pages load and save
- [ ] Services: Marketplace browsing works
- [ ] HR: Job postings visible (if applicable)
- [ ] Onboarding: Onboarding flow completes
- [ ] API endpoints: Notifications, push work
- [ ] Static: Manifest, sitemap accessible
- [ ] Business: Sales inquiry forms work

---

**Status**: ✅ Refactoring Complete - Ready for Testing  
**Date**: December 6, 2025  
**Files Modified**: 19 route files + app.js + 2 docs

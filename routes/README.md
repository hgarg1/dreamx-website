# Routes Directory

This directory contains route modules organized by purpose. Each file exports an Express router that handles related routes.

## Current Route Files

- **static.js** - Static file routes (manifest.json, service-worker.js, sitemap.xml)
- **webauthn.js** - WebAuthn/Passkey authentication routes

## Route Files to Create

The following route files should be created to complete the refactoring:

- **auth.js** - Authentication routes
  - `/login`, `/register`, `/logout`
  - `/forgot-password`, `/reset-password`
  - `/verify-email`, `/resend-verification`
  - `/auth/google`, `/auth/microsoft`, `/auth/apple` (OAuth)

- **settings.js** - Settings routes
  - `/settings`, `/billing`
  - `/settings/account`, `/settings/password`, `/settings/notifications`
  - `/settings/privacy`, `/settings/connections/unlink`
  - `/settings/billing/*`

- **feed.js** - Feed and post routes
  - `/feed`, `/search`
  - `/feed/post`, `/post/:id`
  - `/api/posts/:postId/reactions`, `/api/posts/:postId/comments`
  - `/api/hashtags/popular`, `/api/tags/popular`

- **profile.js** - Profile routes
  - `/profile`, `/profile/:id`, `/profile/edit`

- **messages.js** - Messages routes
  - `/messages`, `/messages/start/:userId`
  - `/messages/group/*`
  - `/api/messages/*`

- **services.js** - Services routes
  - `/services`, `/services/new`, `/services/:id`
  - `/api/services/*`

- **admin.js** - Admin routes
  - `/admin`, `/admin/users/*`, `/admin/services/*`
  - `/admin/export/*`, `/admin/appeals/*`
  - `/admin/refund-requests/*`

- **hr.js** - HR routes
  - `/hr`, `/api/hr/*`

- **api.js** - General API routes
  - `/api/push/*`, `/api/notifications/*`
  - `/api/users/*`, `/api/onboarding`

## Usage

Routes are imported and used in `app.js`:

```javascript
const staticRoutes = require('./routes/static');
const webauthnRoutes = require('./routes/webauthn');

app.use('/', staticRoutes);
app.use('/webauthn', webauthnRoutes);
```

## Pattern

Each route file should:
1. Import Express and create a router
2. Import necessary dependencies from `../db` and other modules
3. Define routes using `router.get()`, `router.post()`, etc.
4. Export the router with `module.exports = router;`


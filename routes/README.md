# Routes Directory Structure

This directory contains all Express route handlers organized into logical subfolders.

## Structure

```
routes/
├── admin/              # Admin dashboard and management
│   ├── admin.js        # User management, moderation, refunds
│   ├── rbac.js         # RBAC API routes
│   └── rbac-dashboard.js # RBAC dashboard UI
│
├── auth/               # Authentication and authorization
│   ├── auth.js         # OAuth, login, register, password reset
│   ├── api-auth.js     # Mobile API token-based auth
│   └── webauthn.js     # WebAuthn/passkey authentication
│
├── feed/               # Social feed functionality
│   └── feed.js         # Posts, comments, reactions, search
│
├── hr/                 # Human resources
│   └── hr.js           # Career jobs, applications, team management
│
├── messages/           # Messaging system
│   └── messages.js     # Direct messages, group chats
│
├── onboarding/         # User onboarding
│   └── onboarding.js   # Onboarding flow
│
├── profile/            # User profiles
│   └── profile.js      # View, edit, follow/unfollow, block/report
│
├── projects/           # Project management
│   └── projects.js     # Projects, milestones, tasks, updates
│
├── services/           # Services marketplace
│   └── services.js     # Services, reviews, bookings
│
├── settings/           # User settings
│   └── settings.js     # Account, privacy, billing, notifications
│
├── static/             # Static content
│   └── static.js       # PWA manifest, sitemap, service worker
│
├── api.js              # Miscellaneous API endpoints
├── business.js         # Sales inquiries, pricing tiers
├── misc.js             # Miscellaneous pages (map, pricing, help)
└── utils.js            # Shared utilities for all routes
```

## Usage in app.js

Routes are imported and mounted in `app.js`:

```javascript
// Example: Auth routes
const authRoutes = require('./routes/auth/auth');
app.use('/', authRoutes);

// Example: Admin routes
const adminRoutes = require('./routes/admin/admin');
app.use('/', adminRoutes);
```

Some routes use initialization functions for dependency injection:

```javascript
// Routes that need dependencies
const initHrRoutes = require('./routes/hr/hr');
const hrRoutes = initHrRoutes({ emailService, careerAssetUpload });
app.use('/', hrRoutes);
```

## Import Path Conventions

Routes in subfolders use relative paths:

```javascript
// From routes/auth/auth.js
const { getUserById } = require('../../db');           // Two levels up to db
const emailService = require('../../services/emailService'); // Two levels up to services
const { getRequestBaseUrl } = require('../utils');     // One level up to routes/utils.js
```

Routes in root use standard paths:

```javascript
// From routes/api.js
const { getUserById } = require('../db');
const emailService = require('../services/emailService');
```

## Adding New Routes

1. Create a new file in the appropriate subfolder (or create a new subfolder)
2. Define your routes using Express Router:
   ```javascript
   const express = require('express');
   const router = express.Router();
   
   router.get('/your-route', (req, res) => {
     // Handler logic
   });
   
   module.exports = router;
   ```
3. Import and mount in `app.js`:
   ```javascript
   const yourRoutes = require('./routes/your-folder/your-file');
   app.use('/your-base-path', yourRoutes);
   ```

## Route Responsibilities

- **admin/**: Admin-only features (user management, moderation, system configuration)
- **auth/**: Authentication and authorization (login, register, OAuth, API tokens)
- **feed/**: Social feed features (posts, comments, reactions, search)
- **hr/**: HR-specific features (job postings, applications, recruiting)
- **messages/**: Messaging system (DMs, group chats, reactions)
- **onboarding/**: New user onboarding flow
- **profile/**: User profile management (view, edit, follow, block)
- **projects/**: Project management features (if enabled)
- **services/**: Services marketplace (listings, reviews, bookings)
- **settings/**: User account settings (privacy, billing, notifications)
- **static/**: PWA and static content (manifest, sitemap, service worker)
- **api.js**: Miscellaneous API endpoints that don't fit other categories
- **business.js**: Business/enterprise features (sales inquiries, pricing)
- **misc.js**: Miscellaneous pages (marketing pages, help, legal)
- **utils.js**: Shared utility functions used across routes

## Middleware

Routes can use middleware defined in `/middleware`:

```javascript
const { requireAdmin } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');

router.get('/admin-only', requireAdmin, (req, res) => {
  // Admin-only route
});
```

## Views

Routes render views from `/views` directory using `res.render()`:

```javascript
router.get('/profile', (req, res) => {
  res.render('user/profile', {
    title: 'Profile',
    currentPage: 'profile',
    authUser: res.locals.authUser
  });
});
```

---

**Last Updated**: December 6, 2025

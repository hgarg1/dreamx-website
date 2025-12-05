# Views Directory Structure

This directory contains all EJS view templates organized by feature/purpose.

## Folder Organization

### `/admin` - Admin Panel Views
- `admin-consolidated.ejs` - Main admin dashboard
- `admin-services.ejs` - Services moderation panel
- `admin-user-actions.ejs` - User actions moderation
- `admin-user-stats.ejs` - User statistics view
- `admin-dashboard.ejs` - Alternative dashboard view
- `admin.ejs` - Legacy admin view

### `/appeals` - Appeal Forms
- `account-appeal.ejs` - Account appeal submission
- `content-appeal.ejs` - Content appeal submission

### `/auth` - Authentication Views
- `login.ejs` - Login page
- `register.ejs` - Registration page
- `forgot-password.ejs` - Password reset request
- `reset-password.ejs` - Password reset form
- `verify-email.ejs` - Email verification

### `/business` - Business Dashboard Views
- `business-dashboard.ejs` - Main business dashboard
- `business-pricing.ejs` - Business pricing page
- `business-sales.ejs` - Sales overview
- `business-sales-detail.ejs` - Individual sale details
- `business-team.ejs` - Team management

### `/errors` - Error Pages
- `404.ejs` - Page not found
- `500.ejs` - Internal server error
- `503.ejs` - Service unavailable

### `/feed` - Social Feed Views
- `feed.ejs` - Main social feed
- `post-detail.ejs` - Individual post view
- `search.ejs` - Search results
- `search-zero-results.ejs` - Empty search state

### `/hr` - Human Resources Views
- `hr.ejs` - HR dashboard and management

### `/projects` - Project Management Views
- `projects-feed.ejs` - Projects listing
- `project-detail.ejs` - Project details view
- `project-edit.ejs` - Edit project
- `project-wizard.ejs` - Create new project

### `/rbac` - Role-Based Access Control Views
- `rbac-dashboard.ejs` - RBAC main dashboard
- `rbac-roles.ejs` - Roles management
- `rbac-permissions.ejs` - Permissions management
- `rbac-users.ejs` - User roles assignment
- `rbac-role-detail.ejs` - Individual role details
- `rbac-overrides.ejs` - Permission overrides
- `rbac-history.ejs` - Access history
- `rbac-audit.ejs` - Audit logs
- `rbac-security.ejs` - Security settings
- `rbac-docs.ejs` - RBAC documentation
- `rbac-migration.ejs` - Migration tools
- `rbac-devtools.ejs` - Developer tools

### `/services` - Marketplace Services Views
- `services.ejs` - Services marketplace listing
- `service-details.ejs` - Individual service view
- `create-service.ejs` - Create new service
- `edit-service.ejs` - Edit service

### `/static` - Static/Informational Pages
- `about.ejs` - About page
- `careers.ejs` - Careers page
- `community-guidelines.ejs` - Community guidelines
- `contact.ejs` - Contact form
- `downloads.ejs` - Downloads page
- `features.ejs` - Features page
- `help-center.ejs` - Help center
- `map.ejs` - Map view
- `pricing.ejs` - Pricing page
- `privacy.ejs` - Privacy policy
- `team.ejs` - Team page
- `terms.ejs` - Terms of service

### `/user` - User Profile & Settings Views
- `profile.ejs` - User profile page
- `profile-not-found.ejs` - Profile not found error
- `edit-profile.ejs` - Edit profile
- `settings.ejs` - User settings
- `billing.ejs` - Billing management
- `messages.ejs` - Direct messages
- `onboarding.ejs` - User onboarding flow
- `onboarding-empty.ejs` - Empty onboarding state
- `account-status.ejs` - Account status page
- `refund-request.ejs` - Refund request form

### `/partials` - Reusable Components
- `header.ejs` - Site header
- `footer.ejs` - Site footer
- `post-card.ejs` - Post card component
- `post-helpers.ejs` - Post helper functions
- `project-comments.ejs` - Project comments component
- `rbac-nav.ejs` - RBAC navigation
- `reels-overlay.ejs` - Reels overlay component
- `search-zero-results.ejs` - Search empty state component

### Root Level
- `index.ejs` - Homepage

## Usage in Routes

When rendering views from route handlers, use the folder path:

```javascript
// Before reorganization
res.render('login', { ... });

// After reorganization
res.render('auth/login', { ... });
```

## Sitemap Generation

The sitemap generator in `/routes/static.js` automatically excludes organizational folders from the sitemap to prevent duplicate or incorrect URLs.

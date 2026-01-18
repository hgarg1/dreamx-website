# Azure Easy Auth Setup Guide

## Overview

This application supports **dual OAuth authentication modes**:
- **Production**: Azure App Service Easy Auth (managed by Azure)
- **Development**: Passport.js OAuth (handled by application)

## How It Works

### Production (Azure Easy Auth)

When `NODE_ENV=production` and Easy Auth is configured in Azure Portal:

1. **Azure handles OAuth** - Users authenticate through Azure's authentication UI
2. **Headers are set** - Azure sets authentication headers on every request:
   - `X-MS-CLIENT-PRINCIPAL-NAME` - User's email
   - `X-MS-CLIENT-PRINCIPAL-IDP` - Provider (google, microsoft, twitter)
   - `X-MS-CLIENT-PRINCIPAL` - Base64 encoded JSON with user info

3. **Middleware maps to app** - `middleware/easy-auth.js`:
   - Detects Easy Auth headers
   - Finds or creates user in database
   - Sets `req.session.userId` and `req.user`
   - Auto-verifies email for OAuth users

4. **Passport.js routes disabled** - OAuth routes (`/auth/google`, etc.) return 503

### Development (Passport.js)

When `NODE_ENV !== 'production'` or `EASY_AUTH_ENABLED=false`:

1. **Passport.js handles OAuth** - Standard OAuth flow with redirects
2. **Environment variables required** - OAuth credentials from `.env` file
3. **Routes work normally** - `/auth/google`, `/auth/microsoft`, `/auth/x` work as expected

## Configuration

### Azure Portal Setup (Production)

1. Go to **Azure Portal** → Your App Service → **Authentication**
2. Click **Add identity provider**
3. Configure providers:
   - **Google**: Add Client ID and Secret
   - **Microsoft**: Add Client ID and Secret  
   - **Twitter/X**: Add Client ID and Secret
4. Set **Action to take when request is not authenticated**: "Allow anonymous requests"
5. Save configuration

### Environment Variables

#### Production (Easy Auth)
```env
NODE_ENV=production
EASY_AUTH_ENABLED=true  # Optional - defaults to true in production
```

#### Development (Passport.js)
```env
NODE_ENV=development
# OR
EASY_AUTH_ENABLED=false

# OAuth credentials (for local development)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost/auth/google/callback

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_CALLBACK_URL=http://localhost/auth/microsoft/callback

TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_CALLBACK_URL=http://localhost/auth/x/callback
```

## How Users Authenticate

### Production (Easy Auth)
1. User visits your site
2. Azure redirects unauthenticated users to Azure login page
3. User selects provider (Google, Microsoft, Twitter)
4. Azure handles OAuth flow
5. Azure redirects back with authentication headers
6. Application middleware creates/finds user and sets session
7. User is logged in

### Development (Passport.js)
1. User clicks "Sign in with Google" on login page
2. Application redirects to Google OAuth
3. User authenticates with Google
4. Google redirects back to `/auth/google/callback`
5. Passport.js processes callback
6. Application creates/finds user and sets session
7. User is logged in

## Code Flow

### Middleware Order (app.js)
```javascript
app.use(session(...));           // 1. Session middleware
app.use(passport.initialize());  // 2. Passport (for dev)
app.use(passport.session());    // 3. Passport session (for dev)
app.use(easyAuthMiddleware);     // 4. Easy Auth (for prod)
app.use(csrfProtection);         // 5. CSRF protection
```

### Easy Auth Detection
```javascript
// middleware/easy-auth.js
function isEasyAuthEnabled(req) {
    return process.env.NODE_ENV === 'production' && 
           (req.headers['x-ms-client-principal'] || 
            req.headers['x-ms-client-principal-name']);
}
```

### Passport.js Conditional Loading
```javascript
// app.js
if (shouldUsePassportOAuth() && process.env.GOOGLE_CLIENT_ID) {
    // Initialize Passport.js Google strategy
}
```

## Benefits

### Easy Auth (Production)
- ✅ Managed by Azure - no OAuth code to maintain
- ✅ Automatic token refresh
- ✅ Built-in security
- ✅ No environment variables needed for OAuth
- ✅ Works with multiple providers seamlessly

### Passport.js (Development)
- ✅ Full control over OAuth flow
- ✅ Easy to debug locally
- ✅ No Azure dependency
- ✅ Standard OAuth implementation

## Troubleshooting

### Easy Auth not working in production
1. Check Azure Portal → Authentication is configured
2. Verify `NODE_ENV=production` is set
3. Check application logs for Easy Auth middleware errors
4. Ensure headers are present: `X-MS-CLIENT-PRINCIPAL-NAME`

### Passport.js not working in development
1. Check `.env` file has OAuth credentials
2. Verify `NODE_ENV !== 'production'` or `EASY_AUTH_ENABLED=false`
3. Check callback URLs match provider settings
4. Review Passport.js initialization logs

### Both systems active (conflict)
- Set `EASY_AUTH_ENABLED=false` to force Passport.js
- Or ensure `NODE_ENV !== 'production'` for development

## Migration Notes

- **Existing users**: Easy Auth will find users by email or create new ones
- **OAuth accounts**: Linked via `oauth_accounts` table
- **Sessions**: Both systems use the same session store (PostgreSQL in prod)
- **No breaking changes**: Application code works with both systems

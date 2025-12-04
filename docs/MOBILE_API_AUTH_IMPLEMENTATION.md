# Mobile API Authentication Implementation

## Overview
This document describes the token-based authentication system implemented for the Android mobile app, which runs in parallel with the existing session-based authentication for web users.

**Note**: CORS is not configured since Android native apps don't need it (CORS is a browser-only security feature). If you need to test from a web browser or enable CORS for web clients, you can uncomment the CORS configuration in `routes/api-auth.js`.

## Implementation Summary

### Phase 1: Infrastructure ✅
- **Added JWT dependency**: `jsonwebtoken` package added to `package.json`
- **Database schema**: Created `auth_tokens` table to store refresh tokens
- **Token utilities**: Created `utils/auth-tokens.js` with JWT generation and verification functions
- **Database functions**: Added token management functions to `db.js`

### Phase 2: Core Endpoints ✅
Created `routes/api-auth.js` with the following endpoints:

1. **POST `/api/auth/login`**
   - Authenticates user with email/password
   - Returns access token, refresh token, and user data
   - Validates account status (banned/suspended)

2. **POST `/api/auth/refresh`**
   - Accepts refresh token
   - Returns new access token
   - Validates token and account status

3. **GET `/api/auth/me`**
   - Returns current authenticated user data
   - Requires valid access token in `Authorization: Bearer <token>` header

4. **POST `/api/auth/logout`**
   - Revokes refresh token
   - Accepts refresh token in request body

5. **POST `/api/auth/logout-all`**
   - Revokes all tokens for the authenticated user
   - Requires access token authentication

### Phase 3: Additional Mobile Endpoints ✅
- **POST `/api/auth/register`**: User registration with immediate token generation
- **POST `/api/auth/forgot-password`**: Password reset request
- **POST `/api/auth/reset-password`**: Password reset with token
- **POST `/api/auth/verify-email`**: Email verification with code
- **POST `/api/auth/resend-verification`**: Resend verification code

### Phase 4: Integration ✅
- Routes registered in `app.js`
- Token authentication middleware created and exported
- All endpoints return consistent JSON responses
- **CORS**: Not configured (not needed for Android native apps; can be enabled if needed for web clients)

## API Response Format

All endpoints return JSON in the following format:

```json
{
  "success": true|false,
  "data": { ... },
  "error": "error message" | null
}
```

## Authentication

### Access Tokens
- **Type**: JWT (JSON Web Token)
- **Expiration**: 15 minutes
- **Usage**: Include in `Authorization: Bearer <token>` header
- **Signing**: 
  - **Asymmetric (RS256)**: Uses `JWT_ACCESS_PRIVATE_KEY` for signing and `JWT_ACCESS_PUBLIC_KEY` for verification (recommended)
  - **Symmetric (HS256)**: Uses `JWT_ACCESS_SECRET` for both signing and verification (fallback)

### Refresh Tokens
- **Type**: Random 32-byte hex string (hashed before storage)
- **Expiration**: 30 days
- **Storage**: Stored in `auth_tokens` table with hash
- **Usage**: Send in request body to `/api/auth/refresh`
- **Secret**: Set via `JWT_REFRESH_SECRET` environment variable (for future use)

## Environment Variables

Add these to your `.env` file (or set in production):

**Option 1: Asymmetric Keys (Recommended - More Secure)**
```env
JWT_ACCESS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_ACCESS_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_REFRESH_SECRET=your-secure-refresh-secret-key-change-in-production
```

**Option 2: Symmetric Secret (Fallback)**
```env
JWT_ACCESS_SECRET=your-secure-access-secret-key-change-in-production
JWT_REFRESH_SECRET=your-secure-refresh-secret-key-change-in-production
```

**⚠️ Important**: 
- If both `JWT_ACCESS_PRIVATE_KEY` and `JWT_ACCESS_PUBLIC_KEY` are set, the system will use asymmetric encryption (RS256) - more secure
- If only `JWT_ACCESS_SECRET` is set, the system will use symmetric encryption (HS256) - simpler but less secure
- Change all values from defaults in production!

## Database Schema

### `auth_tokens` Table
```sql
CREATE TABLE auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'refresh',
  expires_at DATETIME NOT NULL,
  revoked INTEGER DEFAULT 0,
  device_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Token Management Functions

Added to `db.js`:
- `storeRefreshToken()` - Store refresh token hash
- `getRefreshToken()` - Retrieve refresh token by hash
- `revokeRefreshToken()` - Revoke a specific token
- `revokeAllUserTokens()` - Revoke all tokens for a user
- `cleanupExpiredTokens()` - Remove expired/revoked tokens

## Security Features

1. **Token Hashing**: Refresh tokens are hashed (SHA-256) before storage
2. **Token Expiration**: Both access and refresh tokens expire
3. **Token Revocation**: Tokens can be revoked individually or for all devices
4. **Account Status Checks**: Banned/suspended accounts cannot authenticate
5. **Password Complexity**: Enforced during registration and password reset
6. **Rate Limiting**: Should be added at the application level (recommended)

## Usage Example

### Login Flow
```javascript
// 1. Login
POST /api/auth/login
Body: { "email": "user@example.com", "password": "password123" }
Response: {
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "abc123...",
    "user": { ... }
  }
}

// 2. Use access token for authenticated requests
GET /api/auth/me
Headers: { "Authorization": "Bearer eyJhbGc..." }
Response: {
  "success": true,
  "data": {
    "user": { ... }
  }
}

// 3. Refresh access token when it expires
POST /api/auth/refresh
Body: { "refreshToken": "abc123..." }
Response: {
  "success": true,
  "data": {
    "accessToken": "eyJhbGc..." // new token
  }
}
```

## Middleware Usage

The `authenticateToken` middleware is exported and can be used in other routes:

```javascript
const { authenticateToken } = require('./routes/api-auth');

router.get('/api/some-protected-route', authenticateToken, (req, res) => {
  // req.user and req.userId are available
  // User is authenticated and account status is valid
});
```

## Testing Checklist

- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Get current user with valid token
- [ ] Get current user with invalid/expired token
- [ ] Refresh token with valid refresh token
- [ ] Refresh token with invalid/expired refresh token
- [ ] Logout (revoke refresh token)
- [ ] Logout all devices
- [ ] Register new user
- [ ] Verify email
- [ ] Forgot password flow
- [ ] Reset password flow
- [ ] Test with banned account
- [ ] Test with suspended account

## Next Steps

1. **Install Dependencies**: Run `npm install` to install `jsonwebtoken`
2. **Set Environment Variables**: Add JWT secrets to your environment
3. **Test Endpoints**: Use Postman or similar to test all endpoints
4. **Android Integration**: Update Android app to use these endpoints
5. **Rate Limiting**: Consider adding rate limiting to auth endpoints
6. **Monitoring**: Add logging/monitoring for authentication events
7. **Token Rotation**: Consider enabling refresh token rotation (currently commented out)

## Notes

- Web routes continue to use session-based authentication (no breaking changes)
- Both authentication systems can coexist
- Token cleanup should be run periodically (currently runs on login)
- Consider adding a scheduled job for token cleanup

## Files Modified/Created

### Created:
- `routes/api-auth.js` - Mobile API authentication routes
- `utils/auth-tokens.js` - JWT token utilities
- `MOBILE_API_AUTH_IMPLEMENTATION.md` - This documentation

### Modified:
- `package.json` - Added `jsonwebtoken` dependency
- `db.js` - Added tokens table schema and token management functions
- `app.js` - Registered API auth routes
- `routes/api-auth.js` - Mobile API authentication routes (CORS commented out, not needed for Android)


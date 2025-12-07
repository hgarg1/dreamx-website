# CSRF Token Implementation & Android App Authentication

## Overview

Your application uses **dual authentication systems**:
1. **Web/Browser**: Session-based with implicit CSRF protection via `sameSite: 'lax'` cookies
2. **Android Mobile App**: JWT token-based authentication (no CSRF tokens needed)

This document explains the current CSRF strategy and how the Android app gets authenticated without CSRF tokens.

---

## Current CSRF Implementation

### Web Authentication (Session-Based)

Your Express session is configured with CSRF-resistant cookies:

```javascript
// app.js (lines 504-520)
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite3', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'your secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 1 week
        httpOnly: true,                    // Cannot be accessed by JavaScript
        secure: (process.env.NODE_ENV === 'production') || 
                (process.env.BASE_URL || '').startsWith('https://'),
        sameSite: 'lax'                    // CSRF protection!
    }
}));
```

### CSRF Protection Mechanism

**SameSite Cookies** (`sameSite: 'lax'`) provides built-in CSRF protection:

| Scenario | Cookie Sent? | Protected? |
|----------|---|---|
| User navigates to your site (GET) | ✅ Yes | ✅ Safe - navigation allowed |
| Malicious form submission (POST) from another site | ❌ No | ✅ Protected - cross-site POST blocked |
| User submits form on your site | ✅ Yes | ✅ Safe - same-site allowed |
| XMLHttpRequest/Fetch from your site | ✅ Yes | ✅ Safe - same-site allowed |

**Why NO explicit CSRF tokens are needed:**
- `sameSite: 'lax'` means cookies are NOT sent with cross-origin POST/PUT/DELETE requests
- Malicious sites cannot trick users into submitting forms because the session cookie won't be included
- Your server rejects requests without valid session

---

## Android App Authentication (No CSRF Needed)

### Why CSRF Tokens Aren't Applicable

CSRF vulnerabilities only exist in **browser environments** where:
1. A user is logged into your site
2. Malicious JavaScript on another site can make requests to your server
3. The browser automatically sends cookies

**Native Android apps are NOT vulnerable to CSRF because:**
- ✅ No automatic cookie inclusion (unlike browsers)
- ✅ No cross-origin JavaScript execution
- ✅ Requests must be explicitly made by the app
- ✅ No third-party JS can run in the app context
- ✅ Each request requires explicit code in the app

### Android Authentication Flow

Your app uses **JWT token-based authentication** instead:

```
1. Android App sends: POST /api/auth/login { email, password }
2. Server responds with:
   {
     "success": true,
     "data": {
       "accessToken": "eyJhbGc...",      // JWT (15 min expiry)
       "refreshToken": "abc123...",      // Refresh token (30 days)
       "user": { ... }
     }
   }
3. Android App stores tokens in EncryptedSharedPreferences (secure storage)
4. Android App includes token in header: Authorization: Bearer <accessToken>
5. Server validates JWT signature and expiration
```

### Token Files in Your Codebase

**`routes/api/api-auth.js`** - Mobile API endpoints:
- `POST /api/auth/login` - Returns accessToken + refreshToken
- `POST /api/auth/refresh` - Renews accessToken when expired
- `POST /api/auth/logout` - Revokes refreshToken
- `GET /api/auth/me` - Returns current user (requires access token)

**`utils/auth-tokens.js`** - Token utilities:
```javascript
generateAccessToken(userId)      // Creates JWT (15 min)
generateRefreshToken()           // Creates random hex token (30 days)
hashRefreshToken(token)          // SHA-256 hash for storage
verifyAccessToken(token)         // Validates JWT signature & expiry
```

**`db/index.js`** - Token storage:
```sql
CREATE TABLE auth_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,      // Hashed refresh token
  token_type TEXT DEFAULT 'refresh',
  expires_at DATETIME NOT NULL,
  revoked INTEGER DEFAULT 0,
  device_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## How to Ensure Android App Gets Authenticated

### Step 1: Login Request (Android Side)

```kotlin
// Android app code (Kotlin)
val loginRequest = LoginRequest(
    email = "user@example.com",
    password = "SecurePassword123"
)

val response = api.login(loginRequest)  // POST /api/auth/login

if (response.isSuccessful && response.body()?.success == true) {
    val data = response.body()?.data
    
    // Save tokens securely
    tokenManager.saveTokens(
        accessToken = data.accessToken,
        refreshToken = data.refreshToken
    )
    
    // Navigate to feed
    navigateToFeed()
}
```

### Step 2: Token Storage (Android Side)

```kotlin
class TokenManager @Inject constructor(
    private val encryptedPrefs: SharedPreferences  // EncryptedSharedPreferences
) {
    fun saveTokens(accessToken: String, refreshToken: String) {
        encryptedPrefs.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .apply()
    }
    
    fun getAccessToken(): String? = 
        encryptedPrefs.getString("access_token", null)
}
```

### Step 3: Include Token in Requests (Android Side)

```kotlin
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Get stored access token
        val token = tokenManager.getAccessToken()
        
        // Add Authorization header
        val authenticatedRequest = originalRequest.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        
        return chain.proceed(authenticatedRequest)
    }
}
```

### Step 4: Server Validates Token

```javascript
// routes/api/api-auth.js
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Extract token from "Bearer TOKEN"
    
    if (!token) {
        return sendResponse(res, false, null, 'Access token required', 401);
    }
    
    const verification = verifyAccessToken(token);
    if (!verification.valid) {
        return sendResponse(res, false, null, 'Invalid or expired token', 401);
    }
    
    const user = getUserById(verification.userId);
    req.user = user;
    req.userId = user.id;
    next();  // Proceed with request
}

// Use middleware on protected endpoints
router.get('/api/auth/me', authenticateToken, (req, res) => {
    return sendResponse(res, true, { user: formatUserData(req.user) });
});
```

---

## API Endpoints for Android

All these endpoints are token-authenticated (NO CSRF needed):

### Authentication Endpoints

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---|---------|
| `/api/auth/login` | POST | ❌ No | Login with email/password, get tokens |
| `/api/auth/refresh` | POST | ❌ No | Refresh expired access token |
| `/api/auth/logout` | POST | ❌ No | Revoke current refresh token |
| `/api/auth/logout-all` | POST | ✅ Yes | Revoke all tokens for user |
| `/api/auth/me` | GET | ✅ Yes | Get current user profile |
| `/api/auth/register` | POST | ❌ No | Register new account, get tokens |
| `/api/auth/verify-email` | POST | ✅ Yes | Verify email with 6-digit code |
| `/api/auth/forgot-password` | POST | ❌ No | Request password reset |
| `/api/auth/reset-password` | POST | ❌ No | Reset password with token |

---

## Security Comparison: Web vs Android

### Web Authentication (Session-Based)
```javascript
Browser → Server (with httpOnly session cookie)
         ↓
Server validates session in memory/SQLiteStore
         ↓
Response (with Set-Cookie header)
```

**Protections:**
- ✅ `httpOnly` - Prevents JavaScript access
- ✅ `sameSite: 'lax'` - Prevents cross-site requests
- ✅ `secure: true` - Only sent over HTTPS
- ✅ 7-day expiry

### Android Authentication (Token-Based)
```kotlin
Android App → POST /api/auth/login { email, password }
           ↓
Server validates credentials
           ↓
Returns { accessToken (JWT), refreshToken (32-byte hex) }
           ↓
App stores in EncryptedSharedPreferences
           ↓
App includes in Authorization: Bearer <token> header
           ↓
Server validates JWT signature & expiration
```

**Protections:**
- ✅ JWT signature verification (asymmetric RSA-256 or symmetric HS-256)
- ✅ Token expiration (15 min for access, 30 days for refresh)
- ✅ Refresh token hashing in database (SHA-256)
- ✅ Device tracking (device_info stored)
- ✅ Token revocation (revoked flag)
- ✅ EncryptedSharedPreferences on Android (encrypted local storage)

---

## Implementation Checklist for Android

- [ ] **Login Screen**
  - [ ] POST to `/api/auth/login` with email + password
  - [ ] Store tokens from response in EncryptedSharedPreferences
  - [ ] Redirect to feed on success

- [ ] **Splash Screen / Auto-Login**
  - [ ] Check if tokens exist in EncryptedSharedPreferences
  - [ ] If access token exists, validate with GET `/api/auth/me`
  - [ ] If access token invalid (401), try POST `/api/auth/refresh`
  - [ ] If no tokens, go to login screen

- [ ] **API Interceptor**
  - [ ] Add `Authorization: Bearer <accessToken>` to all requests
  - [ ] On 401 response, attempt token refresh
  - [ ] If refresh fails (401), navigate to login

- [ ] **Token Refresh Logic**
  - [ ] POST to `/api/auth/refresh` with refreshToken
  - [ ] Store new accessToken
  - [ ] Retry original failed request
  - [ ] If refresh fails, clear tokens and navigate to login

- [ ] **Logout**
  - [ ] POST to `/api/auth/logout` with refreshToken (in body)
  - [ ] Clear EncryptedSharedPreferences
  - [ ] Navigate to login

- [ ] **Error Handling**
  - [ ] Handle 401 responses (token expired/invalid)
  - [ ] Handle 403 responses (account banned/suspended)
  - [ ] Show user-friendly error messages
  - [ ] Implement exponential backoff for retries

---

## Environment Variables Needed

For token generation, set these in your `.env`:

```bash
# Option 1: Asymmetric (Recommended - More Secure)
JWT_ACCESS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_ACCESS_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_REFRESH_SECRET=your-secure-refresh-secret-key-change-in-production

# Option 2: Symmetric (Fallback)
JWT_ACCESS_SECRET=your-secure-access-secret-key-change-in-production
JWT_REFRESH_SECRET=your-secure-refresh-secret-key-change-in-production
```

**Priority:** If both asymmetric and symmetric are set, asymmetric (RS256) takes precedence.

---

## Common Questions

### Q: Does Android need CSRF tokens?
**A:** No. CSRF attacks require browser cookies to be auto-sent. Android apps explicitly make HTTP requests in code, so there's no vulnerability.

### Q: What if someone intercepts the token?
**A:** 
- Token is short-lived (15 min)
- HTTPS encryption prevents interception
- Server validates JWT signature
- Refresh tokens are hashed before storage
- Use app certificate pinning for extra security

### Q: How do we handle token refresh?
**A:** 
```kotlin
// When access token expires (401):
val newAccessToken = api.refresh(RefreshRequest(refreshToken))
// Retry original request with new token
```

### Q: Can we use the same endpoints for web and Android?
**A:** Partially:
- Web: Uses session-based auth (separate from API routes)
- Android: Uses `/api/auth/*` endpoints exclusively
- Different routes, same database user accounts ✅

### Q: What about OAuth (Google, Apple, etc.)?
**A:** 
- Web uses Passport.js OAuth (with `sameSite` CSRF protection)
- Android should use AppAuth library for OAuth 2.0 flows
- Both use the same user accounts in database

---

## Testing Checklist

### Postman / API Testing
```bash
# 1. Login
POST /api/auth/login
Body: { "email": "test@example.com", "password": "TestPassword123" }
→ Response includes { accessToken, refreshToken }

# 2. Use token
GET /api/auth/me
Header: Authorization: Bearer <accessToken>
→ Response includes current user data

# 3. Refresh
POST /api/auth/refresh
Body: { "refreshToken": "<refreshToken>" }
→ Response includes new accessToken

# 4. Logout
POST /api/auth/logout
Body: { "refreshToken": "<refreshToken>" }
→ Old refreshToken is revoked
```

### Android Integration Testing
```kotlin
// Check tokens are stored
val accessToken = tokenManager.getAccessToken()
assert(accessToken != null)

// Check token is sent in header
api.getCurrentUser()  // Interceptor adds Authorization header automatically

// Check 401 handling
// Simulate token expiry and verify refresh logic triggers

// Check logout clears storage
logout()
val clearedToken = tokenManager.getAccessToken()
assert(clearedToken == null)
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `routes/api/api-auth.js` | Mobile API endpoints (login, refresh, logout, etc.) |
| `utils/auth-tokens.js` | JWT utilities (generate, verify, hash) |
| `db/index.js` | auth_tokens table + token functions |
| `app.js` (lines 504-520) | Session configuration with sameSite CSRF protection |
| `routes/auth/auth.js` | Web authentication endpoints (session-based) |
| `docs/MOBILE_API_AUTH_IMPLEMENTATION.md` | Original implementation documentation |
| `docs/MOBILE_APP_PROMPT.md` | Android app requirements and API specs |

---

## Summary

| Aspect | Web Browser | Android App |
|--------|-------------|------------|
| **Auth Type** | Session-based | JWT token-based |
| **CSRF Protection** | `sameSite: 'lax'` cookies | N/A (native app) |
| **Token Storage** | HttpOnly cookie (automatic) | EncryptedSharedPreferences |
| **Token Lifetime** | 7 days | Access: 15 min, Refresh: 30 days |
| **Validation** | Session cookie in store | JWT signature verification |
| **Vulnerable to CSRF?** | ❌ No (sameSite protection) | ❌ No (not a browser) |
| **Needs CSRF Tokens?** | ❌ No | ❌ No |

Both approaches are secure for their respective platforms. Android doesn't need CSRF tokens because it's not a browser.

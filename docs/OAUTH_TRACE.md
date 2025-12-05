# OAuth Google Sign-In Flow Trace

## Step-by-Step Flow

### 1. User clicks "Sign in with Google" button
- Frontend redirects to `/auth/google?mode=login`

### 2. Server: /auth/google route
- **File**: `routes/auth.js` line 770
- **What happens**:
  ```
  🔵 [Google] Initiating OAuth flow - Mode: login
  🔵 [Google] Request Host: localhost:3000
  🔵 [Google] Protocol: http
  ```
- Calls `passport.authenticate('google', { state: mode, scope: ['profile', 'email'] })`
- This redirects to Google OAuth consent screen with state='login'

### 3. User approves on Google
- Google redirects back to `/auth/google/callback?code=...&state=login`

### 4. Server: /auth/google/callback route
- **File**: `routes/auth.js` line 779
- **Logging**:
  ```
  🟢 [Google Callback] Received callback with query: { code: '...', state: 'login' }
  🟢 [Google Callback] Session exists: true/false
  🟢 [Google Callback] Session userId: (should be empty/undefined)
  ```

### 5. Passport Strategy Verification
- **File**: `app.js` line 768
- **Strategy**: GoogleStrategy
- **What happens**:
  ```
  📍 Google strategy verification - Profile ID: [google_id]
  📍 Google strategy - Email: user@example.com
  📍 Google strategy - User created/found: [user_id]
  📍 Google strategy verification successful for user [user_id]
  ✅ Google strategy verification successful for user [user_id]
  ```
- Strategy calls `done(null, user, { provider: 'google', providerId: profile.id, photoUrl })`
- Passport attaches `req.user = user` and `req.authInfo = info`

### 6. Passport.authenticate callback
- **File**: `routes/auth.js` line 781-795
- **Logging**:
  ```
  🟢 [Google Callback] Passport.authenticate callback - err: null
  🟢 [Google Callback] Passport.authenticate callback - user: [user_id]
  🟢 [Google Callback] Passport.authenticate callback - info: { provider: 'google', ... }
  ```
- If err or no user → redirect to `/login`
- Otherwise → set `req.user` and `req.authInfo` and call `handleOAuthCallback()`

### 7. handleOAuthCallback function
- **File**: `routes/auth.js` line 801
- **Logging**:
  ```
  🟡 [google] handleOAuthCallback called
  🟡 [google] Mode from query.state: login
  🟡 [google] Checking for req.user, value: [user_id]
  🟡 [google] User found ([user_id]), calling req.login()
  ```

### 8. req.login() call
- **File**: `routes/auth.js` line 826-828
- **What Passport does**:
  1. Calls `passport.serializeUser((user, done) => done(null, user.id))`
  2. Stores `{ passport: { user: [user_id] } }` in session
  3. Marks session as modified so it gets saved
  4. Calls the callback with `(err)`

- **Logging**:
  ```
  🟡 [google] req.login() callback - err: null
  🟡 [google] req.login() successful, setting session.userId
  ```

### 9. Manual session.userId setting
- **File**: `routes/auth.js` line 847
- **What happens**:
  ```
  req.session.userId = req.user.id
  🟡 [google] Set session.userId = [user_id], saving session...
  ```

### 10. Session.save()
- **File**: `routes/auth.js` line 848-849
- **Logging**:
  ```
  🟡 [google] Session save callback - err: null
  ✅ google login successful for user [user_id], redirecting to /feed
  ```

### 11. Final redirect
- Redirects to `/feed` (or appropriate post-auth redirect)

---

## Potential Problem Points

### Issue 1: Callback URL Mismatch
- **Problem**: Google OAuth callback URL in Google Cloud Console must match exactly
- **Expected**: `http://localhost:3000/auth/google/callback` (or your BASE_URL)
- **Check**: 
  ```
  📍 Google OAuth configured with callback URL: [should print in app.js line 768]
  ```
- **In Google Cloud Console**:
  - Go to Credentials
  - Find the OAuth 2.0 Client ID
  - Click on it and check "Authorized redirect URIs"
  - It must include the exact callback URL

### Issue 2: Strategy Verification Error
- **Problem**: Error in `findOrCreateOAuthUser()` or `importProfilePhotoIfNeeded()`
- **Logging to check**:
  ```
  ❌ Google strategy verification error: [error message]
  ```
- This would cause Passport to call `done(error)` which fails authentication

### Issue 3: Session not being saved
- **Problem**: Session store not working
- **Logging to check**:
  ```
  🟡 [google] Session save callback - err: [error message]
  ```

### Issue 4: Database query failing
- **Problem**: `findOrCreateOAuthUser()` or `getUserById()` throwing error
- **Check logs**: Look for stack traces in `❌` error logs

---

## Debug Checklist

1. **Start the app** and watch console for:
   - ✅ `📍 Google OAuth configured with callback URL:` - should show your callback URL
   - ✅ Session middleware initialized
   - ✅ Passport strategies loaded

2. **Click "Sign in with Google"**
   - ✅ Console should show: `🔵 [Google] Initiating OAuth flow`
   - ✅ You should be redirected to Google

3. **Approve on Google**
   - ✅ You should be redirected back to `/auth/google/callback?code=...&state=login`

4. **At callback**
   - ✅ Console should show all `🟢 [Google Callback]` logs
   - ✅ Console should show all `📍 Google strategy` logs
   - ✅ Console should show all `🟡 [google]` logs in handleOAuthCallback
   - ✅ Final log should be: `✅ google login successful for user [id], redirecting to [path]`

5. **After redirect**
   - ✅ Browser should be at `/feed` or appropriate redirect
   - ✅ Session cookie should exist with Passport session data
   - ✅ `req.session.userId` should be set

---

## What to Report If It's Still Broken

Share the console logs showing:
1. All `🔵 [Google]` logs (initial auth)
2. All `🟢 [Google Callback]` logs (callback received)
3. All `📍 Google strategy` logs (strategy verification)
4. All `🟡 [google]` logs (handleOAuthCallback)
5. Final redirect log or any `❌` error logs

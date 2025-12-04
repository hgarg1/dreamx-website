# OAuth Redirect URI Mismatch Fix

## Error Details
```
TokenError: Bad Request
code: 'redirect_uri_mismatch'
Error at: /auth/google/callback
```

This error means the OAuth callback URL your app is sending to Google doesn't match any of the authorized redirect URIs configured in your Google Cloud Console.

---

## Root Cause

1. **Static vs Dynamic URLs**: Passport.js registers OAuth strategies with a fixed callback URL at startup
2. **Environment Mismatch**: The callback URL configured doesn't match where you're actually running the app
3. **Multiple Domains**: Testing locally vs production requires different callback URLs

---

## Solution

### Step 1: Determine Your Callback URL

You need to figure out what your actual callback URL should be:

```
Format: {PROTOCOL}://{DOMAIN}:{PORT}/auth/google/callback

Examples:
- Local development:   http://localhost:3000/auth/google/callback
- Tunneling (ngrok):   https://abc123.ngrok.io/auth/google/callback  
- Production:          https://dream-x.app/auth/google/callback
- Custom domain:       https://your-domain.com/auth/google/callback
```

### Step 2: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Find your OAuth 2.0 Client ID (899638086071-2nvhig0k9k36hku1h1r53ev93o3bme80)
3. Edit the OAuth Client configuration
4. In **"Authorized redirect URIs"**, add your callback URL:
   ```
   http://localhost:3000/auth/google/callback
   ```
5. If you need multiple environments, add them all:
   ```
   http://localhost:3000/auth/google/callback
   http://localhost:5000/auth/google/callback
   https://dream-x.app/auth/google/callback
   https://www.dream-x.app/auth/google/callback
   https://abc123.ngrok.io/auth/google/callback
   ```

### Step 3: Set GOOGLE_CALLBACK_URL in .env

In your `.env` file, add or update:

```env
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**For Different Environments:**

**Development (Local):**
```env
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Development (ngrok Tunnel):**
```env
GOOGLE_CALLBACK_URL=https://abc123.ngrok.io/auth/google/callback
```

**Production:**
```env
GOOGLE_CALLBACK_URL=https://dream-x.app/auth/google/callback
```

### Step 4: Restart Your Application

After updating the `.env` file:

```bash
# Stop your running server
# Restart it
npm start
```

---

## How It Works Now

1. **App Startup** (`app.js` line 723):
   ```javascript
   callbackURL: process.env.GOOGLE_CALLBACK_URL || getCallbackURL('/auth/google/callback')
   ```
   - Reads `GOOGLE_CALLBACK_URL` from `.env`
   - Falls back to `https://dream-x.app/auth/google/callback` if not set

2. **Google Login** (`routes/auth.js` line 700):
   ```javascript
   router.get('/auth/google', (req, res, next) => {
       // Initiates OAuth flow with the fixed callback URL
       passport.authenticate('google', options)(req, res, next);
   });
   ```

3. **Google Callback** (`routes/auth.js` line 713):
   ```javascript
   router.get('/auth/google/callback', 
       passport.authenticate('google', { failureRedirect: '/login' }),
       async (req, res) => {
           // Google redirects back here with authorization code
       }
   );
   ```

---

## Troubleshooting Checklist

- [ ] Check your running app's actual domain and port
- [ ] Verify `GOOGLE_CALLBACK_URL` is set in `.env`
- [ ] Confirm the URL in `.env` matches one in Google Cloud Console
- [ ] Verify the exact URL (protocol, domain, port, path) - must be exact match
- [ ] Restart the application after changing `.env`
- [ ] Clear browser cookies before retesting

---

## Common Mistakes

### ❌ Mistake 1: Wrong Domain
```env
# ❌ This won't work if you're running on localhost:3000
GOOGLE_CALLBACK_URL=https://dream-x.app/auth/google/callback
```

### ❌ Mistake 2: Missing Port
```env
# ❌ If running on port 3000, this won't match
GOOGLE_CALLBACK_URL=http://localhost/auth/google/callback
```

### ❌ Mistake 3: Protocol Mismatch
```env
# ❌ Google expects HTTPS in production
GOOGLE_CALLBACK_URL=http://dream-x.app/auth/google/callback
```

### ❌ Mistake 4: Path Typo
```env
# ❌ Wrong path - must be exactly /auth/google/callback
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/callback
```

### ❌ Mistake 5: Trailing Slash
```env
# ❌ Most systems don't like trailing slashes
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback/
```

---

## Testing the Fix

1. **Start your app:**
   ```bash
   npm start
   ```

2. **Check console output:**
   - Should show no OAuth configuration warnings
   - App should be listening on the correct port

3. **Test OAuth flow:**
   - Go to login page
   - Click "Login with Google"
   - Check browser URL during redirect - it should start with your configured callback URL
   - Should successfully redirect back to your app after login

4. **If still failing:**
   - Check browser console for errors
   - Verify Google callback URL matches exactly in console settings
   - Try in incognito/private mode to clear cached auth
   - Check server logs for the full error

---

## For Multiple Environments

If you need different URLs for dev/staging/production, consider:

### Option 1: Environment-Based Configuration
```env
NODE_ENV=development
GOOGLE_CALLBACK_URL=${NODE_ENV === 'production' ? 'https://dream-x.app/auth/google/callback' : 'http://localhost:3000/auth/google/callback'}
```

### Option 2: Different .env Files
```bash
# Development
.env.development
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Production  
.env.production
GOOGLE_CALLBACK_URL=https://dream-x.app/auth/google/callback
```

### Option 3: Runtime Detection
Modify `getCallbackURL()` in `app.js` to detect environment:
```javascript
function getCallbackURL(path) {
    if (process.env.GOOGLE_CALLBACK_URL) {
        return `${process.env.GOOGLE_CALLBACK_URL}${path}`;
    }
    
    if (process.env.NODE_ENV === 'production') {
        return `https://dream-x.app${path}`;
    }
    
    return `http://localhost:3000${path}`;
}
```

---

## Reference: Current Configuration

**Current Values:**
- Client ID: `899638086071-2nvhig0k9k36hku1h1r53ev93o3bme80.apps.googleusercontent.com`
- Callback URL (now set): `http://localhost:3000/auth/google/callback`

**Google Cloud Console:**
- Project: Google Cloud Console
- OAuth Client: `899638086071...`
- Make sure redirect URI includes your callback URL

---

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Passport.js Google Strategy](http://www.passportjs.org/packages/passport-google-oauth20/)
- [Fixing redirect_uri_mismatch](https://developers.google.com/identity/protocols/oauth2/troubleshooting)


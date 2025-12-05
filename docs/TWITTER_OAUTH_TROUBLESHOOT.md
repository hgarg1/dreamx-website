# Twitter/X OAuth Troubleshooting

## Error: "Something went wrong - You weren't able to give access to the App"

This error means Twitter is rejecting your OAuth request **before** the user sees the approval screen. This happens when there's a configuration mismatch.

## Common Causes & Fixes

### 1. ❌ Callback URL Mismatch (Most Common)

**Problem**: The callback URL you registered in Twitter doesn't match what your app is sending.

**How to fix**:

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Select your app
3. Go to "Settings" → "Authentication settings"
4. Look for "Callback URLs / Redirect URLs"
5. Make sure **exactly one** of these is registered:
   - **For localhost testing**: `http://localhost/auth/x/callback`
   - **For production**: `https://yourdomain.com/auth/x/callback`

**What your app is using**:
- Currently sends: `http://localhost/auth/x/callback` (since no BASE_URL or TWITTER_CALLBACK_URL is set)
- Check the server logs - it should print: `📍 Twitter OAuth configured with callback URL: http://localhost/auth/x/callback`

**To fix**: 
- If your app is on a different domain/port, set in `.env`:
  ```env
  TWITTER_CALLBACK_URL=http://localhost:3000/auth/x/callback
  ```
  OR
  ```env
  BASE_URL=http://localhost:3000
  ```

### 2. ❌ Wrong App Type

**Problem**: You created an OAuth 1.0a app instead of OAuth 2.0

**Fix**:
1. In Twitter Developer Portal, make sure you're using an **OAuth 2.0** app (not OAuth 1.0a)
2. This should be in "App Setup" or "Authentication Settings"

### 3. ❌ Email Scope Not Enabled

**Problem**: Your app doesn't have permission to request email

**Fix**:
1. Go to your app settings in Twitter Developer Portal
2. Under "User authentication settings"
3. Check the box: **"Request email address from users"** ✓
4. Save changes

### 4. ❌ App Not in Correct Environment

**Problem**: Your app is in development environment but you're trying to use production URLs

**Fix**:
- Make sure your app environment matches:
  - Using `localhost` → dev/testing
  - Using real domain → production

### 5. ❌ Client ID or Secret is Wrong

**Problem**: The credentials in `.env` don't match your app

**Fix**:
1. Go to Twitter Developer Portal
2. Select your app
3. Go to "Keys and tokens"
4. Copy the **API Key** (Client ID) and **API Key Secret** (Client Secret)
5. Update your `.env`:
   ```env
   TWITTER_CLIENT_ID=your_actual_api_key
   TWITTER_CLIENT_SECRET=your_actual_api_key_secret
   ```

## Debug Steps

1. **Check what callback URL is being used**:
   - Restart your app: `npm start`
   - Look for this in console:
     ```
     📍 Twitter OAuth configured with callback URL: http://localhost/auth/x/callback
     📍 IMPORTANT: Make sure this URL is registered in your Twitter app settings!
     ```

2. **Compare with Twitter's settings**:
   - Go to Twitter Developer Portal
   - Check "Callback URLs / Redirect URLs" setting
   - Make sure it matches **exactly** what's printed in the console

3. **Check the logs when you click Sign in**:
   - You should see:
     ```
     🔵 [Twitter] Initiating OAuth flow - Mode: login
     🔵 [Twitter] Request Host: localhost
     🔵 [Twitter] Protocol: http
     🔵 [Twitter] Callback URL being used: http://localhost/auth/x/callback
     ```
   - If these logs don't appear, Twitter is rejecting the request before it even reaches your callback

## If You Still Get the Error

1. **Copy the exact callback URL from your console logs**
2. **Go to Twitter Developer Portal**
3. **Register that exact URL** in your app's "Callback URLs" setting
4. **Restart your app** and try again

The key is making sure Twitter knows to redirect back to the callback URL you've registered.

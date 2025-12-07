# SMS Phone Verification - Quick Start Guide

## 🚀 Start Here

This guide will get you up and running with the SMS phone verification system in 5 minutes.

---

## ✅ What's Been Done (No Action Needed)

### Core Implementation ✅
- ✅ Rate limiting service created (`services/rateLimitService.js`)
- ✅ Phone verification modal created (`views/partials/phone-verification-modal.ejs`)
- ✅ SMS password recovery modal created (`views/partials/forgot-password-sms-modal.ejs`)
- ✅ Settings page updated to use phone verification modal
- ✅ Forgot password page updated with SMS recovery option
- ✅ All backend routes implemented and integrated
- ✅ Database schema updated with rate_limit_logs table

### Documentation ✅
- ✅ Technical implementation guide
- ✅ Integration guide with code examples
- ✅ Developer quick reference
- ✅ Testing and deployment procedures
- ✅ This quick start guide

---

## 🔧 Configuration (5 Minutes)

### Step 1: Verify `.env` File

Make sure your `.env` file has Twilio credentials:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Optional
SMS_ENABLED=true
NODE_ENV=development
```

### Step 2: Database Setup

Run the migration to create the `rate_limit_logs` table:

```bash
npm run migrate
# or if using manual migration
npm run db:migrate
```

Verify table was created:

```bash
sqlcmd -S your-server -d dreamx
> SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'rate_limit_logs';
```

### Step 3: Start the Application

```bash
npm start
```

Application should start without errors. Check console for:
- No database connection errors
- No Twilio credential errors
- All routes registered

---

## 🧪 Quick Test (10 Minutes)

### Test 1: Settings Phone Verification

1. Start the application
2. Log in to an account
3. Navigate to `/settings`
4. Scroll to "📱 Phone Verification" section
5. Click "📱 Add & Verify Phone" button
6. Modal opens
7. Enter your phone number
8. Click "Send Code"
9. Check your SMS (or Twilio logs)
10. Enter the 6-digit code
11. See success message
12. Modal closes
13. Phone shows as verified

### Test 2: Rate Limiting

1. Click "📱 Add & Verify Phone" again (or use "Resend")
2. Send code 1/3 ✅
3. Send code 2/3 ✅
4. Send code 3/3 ✅
5. Try to send code again
6. See error: "Too many SMS attempts"
7. Countdown timer shows remaining wait time

### Test 3: Forgot Password SMS

1. Go to `/forgot-password`
2. Click "📱 Verify with SMS" button
3. Modal opens
4. Enter phone number
5. Click "Send Code"
6. Check SMS arrives
7. Enter code
8. Enter new password
9. Click "Reset Password"
10. Redirected to login
11. Login with new password ✅

---

## 📊 Monitoring (Ongoing)

### Monitor SMS Activity

```bash
# Check recent SMS logs
npm run db:query "SELECT * FROM rate_limit_logs WHERE action = 'phone_verification' LIMIT 10;"

# Count SMS sent today
npm run db:query "SELECT COUNT(*) FROM rate_limit_logs WHERE action = 'phone_verification' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY);"

# Check rate limit violations
npm run db:query "SELECT user_id, COUNT(*) as attempts FROM rate_limit_logs WHERE action = 'phone_verification' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) GROUP BY user_id HAVING attempts >= 3;"
```

### Monitor Twilio Dashboard

1. Go to [Twilio Console](https://console.twilio.com)
2. Messaging → Messages
3. Check SMS delivery status
4. Monitor costs

---

## 🎯 Common Tasks

### Customize Rate Limits

Edit `services/rateLimitService.js`:

```javascript
// Change default limits
const DEFAULT_OPTIONS = {
  maxAttempts: 5,      // Allow 5 SMS instead of 3
  windowMinutes: 120   // Per 2 hours instead of 1
};
```

### Change Modal Colors

Edit the modal files to customize colors:

**Phone Modal:** `views/partials/phone-verification-modal.ejs`
**SMS Modal:** `views/partials/forgot-password-sms-modal.ejs`

Search for CSS variables:
```css
--primary-color: #667eea;
--success-color: #22c55e;
--error-color: #ef4444;
```

### Reset User's SMS Limit

If a user is blocked by rate limiting:

```sql
-- Reset SMS limit for user
DELETE FROM rate_limit_logs 
WHERE user_id = 123 
AND action = 'phone_verification'
AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

### Check User's Phone Status

```sql
-- Check if user has verified phone
SELECT user_id, phone_number, phone_verified, updated_at 
FROM users 
WHERE user_id = 123;
```

---

## ⚠️ Troubleshooting

### Problem: Modal doesn't open

**Solution:**
1. Open browser dev tools (F12)
2. Check console for JavaScript errors
3. Verify button has correct onclick attribute
4. Reload page with Ctrl+Shift+R

### Problem: SMS not sending

**Solution:**
1. Check `.env` has Twilio credentials
2. Check Twilio account has balance
3. Check if on trial account (restricted numbers)
4. Check Twilio logs for error codes

### Problem: Rate limiting not working

**Solution:**
1. Verify `rate_limit_logs` table exists in database
2. Check route calls `rateLimitService.checkRateLimit()`
3. Try clearing browser cache
4. Check database connection is working

### Problem: Code verification fails

**Solution:**
1. Check code is exactly 6 digits
2. Check code hasn't expired (15 min window)
3. Check you entered correct code from SMS
4. Check database has the code stored

---

## 📞 Support

For more detailed information, see:

- **Technical Details** → `RATE_LIMITING_MODAL_IMPLEMENTATION.md`
- **Integration Steps** → `MODAL_INTEGRATION_GUIDE.md`
- **Code Snippets** → `DEVELOPER_QUICK_REFERENCE.md`
- **Testing Guide** → `TESTING_AND_DEPLOYMENT.md`
- **Full Project Status** → `PROJECT_COMPLETION_SUMMARY.md`
- **Deployment Checklist** → `INTEGRATION_COMPLETE.md`

---

## ✅ You're Ready!

The SMS phone verification system is fully implemented and ready to use:

- ✅ Settings page phone management
- ✅ SMS password recovery
- ✅ Rate limiting enforcement
- ✅ Beautiful, responsive UI
- ✅ Complete documentation
- ✅ Audit trail logging

Just run `npm start` and test the flows!

---

**Quick Links:**
- Test Settings: http://localhost:3000/settings
- Test Forgot Password: http://localhost:3000/forgot-password
- Twilio Logs: https://console.twilio.com/messaging
- Rate Limit Logs: `SELECT * FROM rate_limit_logs;`

---

**Version:** 1.0  
**Status:** ✅ Ready to Use  
**Last Updated:** December 7, 2025

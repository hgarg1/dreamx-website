# Phone Verification & Alt Account Detection System

## Overview

This implementation adds comprehensive phone number verification and advanced alt account detection to Dream X. The system uses Twilio for SMS delivery and implements multiple detection mechanisms to identify and prevent account abuse.

## Features Implemented

### 1. Phone Number Verification
- **User Input**: Phone numbers can be added during signup or in settings
- **Validation**: E.164 format validation using `libphonenumber-js`
- **OTP Delivery**: 6-digit codes sent via SMS (Twilio)
- **Expiration**: Codes expire after 15 minutes
- **Retry Protection**: Maximum 5 failed attempts before requiring a new code
- **Multi-step Verification**: Verify phone after email verification

### 2. Device Fingerprinting
Captures and stores the following characteristics:
- User Agent and browser information
- Operating System details
- Device type (mobile, tablet, desktop)
- IP address
- Geographic location (via CF-IPC ountry header)
- Browser language preferences

Fingerprints are hashed (SHA-256) and stored with each signup for pattern detection.

### 3. Alt Account Detection

The system performs comprehensive analysis across multiple dimensions:

#### Detection Types:
1. **Phone Number Matching** (Highest Weight: 0.95 confidence)
   - Matches against existing verified phone numbers
   - Detects if same phone has multiple accounts
   - Extra flag if phone matches banned/suspended accounts

2. **Email Pattern Analysis** (0.50-0.80 confidence)
   - Identifies disposable email services (tempmail, 10minutemail, etc.)
   - Detects numbered suffix patterns (user123, user456)
   - Flags suspicious email domains

3. **Name Pattern Analysis** (0.60-0.65 confidence)
   - Identifies generic placeholder names (test, admin, user, demo)
   - Detects very short or numeric names

4. **IP Clustering** (0.65-0.85 confidence)
   - Multiple account signups from same IP in 24 hours
   - Very recent signups from same IP (within 1 hour)

5. **Device Fingerprint Matching** (0.85 confidence)
   - Identifies same device used for multiple accounts
   - Matches against known banned/suspended accounts

#### Risk Levels:
- **High**: Multiple detection types OR confidence score > 0.75
- **Medium**: Two or more detections OR score 0.50-0.75
- **Low**: Single detection OR score < 0.50

#### Actions:
- **High Risk**: Block signup with message to contact support
- **Medium Risk**: Flag for manual review, allow with audit logging
- **Low Risk**: Allow, monitor for future activity

## Database Schema

### New Tables

```sql
-- Phone Verification Codes
CREATE TABLE phone_verification_codes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number NVARCHAR(20) NOT NULL,
  code NVARCHAR(6) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  verified BIT DEFAULT 0,
  attempt_count INT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device Fingerprints
CREATE TABLE device_fingerprints (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  fingerprint_hash NVARCHAR(255) NOT NULL UNIQUE,
  user_agent NVARCHAR(MAX),
  ip_address NVARCHAR(50),
  country NVARCHAR(50),
  device_type NVARCHAR(50),
  browser NVARCHAR(100),
  os NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETDATE(),
  last_used_at DATETIME2,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Alt Account Detection Logs
CREATE TABLE alt_account_detections (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT,
  detection_type NVARCHAR(50) NOT NULL,
  confidence_score FLOAT DEFAULT 0.5,
  matched_user_ids NVARCHAR(MAX),  -- JSON array
  details NVARCHAR(MAX),            -- JSON object
  action NVARCHAR(50),              -- flagged, suspended, reviewed
  resolved BIT DEFAULT 0,
  resolved_at DATETIME2,
  resolution_notes NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Updated Tables

Users table now includes:
```sql
phone_number NVARCHAR(20),
phone_verified BIT DEFAULT 0,
phone_verified_at DATETIME2
```

## API Endpoints

### Authentication Routes

**POST /register**
- Add `phoneNumber` field (optional)
- Triggers device fingerprinting and alt account detection
- Returns 403 if high-risk alt account detected

**GET /verify-phone**
- Display phone verification form after registration

**POST /verify-phone**
- Submit 6-digit verification code
- Validates code and marks phone as verified

**POST /resend-phone-code**
- Resend verification code to phone number

### Settings Routes

**POST /settings/phone/request**
- Request phone verification for new phone number
- Request body: `{ phoneNumber: "+1234567890" }`
- Response: `{ success: true, phoneNumber: "***1234" }`

**POST /settings/phone/verify**
- Verify phone with code
- Request body: `{ code: "123456" }`

**POST /settings/phone/resend**
- Resend verification code

## Environment Variables

Add these to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid  # Optional: for Verify API
TWILIO_PHONE_NUMBER=+1234567890                    # Your Twilio phone number
```

## Installation

1. **Install Dependencies**
   ```bash
   npm install twilio libphonenumber-js ua-parser-js
   ```

2. **Run Database Migrations**
   ```sql
   -- Execute schema.sql to create new tables
   ```

3. **Configure Twilio**
   - Set up environment variables
   - (Optional) Create Verify Service for simpler OTP handling

## Services

### phoneService.js
Handles all Twilio interactions:
- `validatePhoneNumber(phoneNumber, defaultCountry)` - Validates and normalizes phone
- `sendVerificationCode(phoneNumber)` - Sends via Twilio Verify (if configured)
- `verifyCode(phoneNumber, code)` - Checks code validity
- `sendOTPMessage(phoneNumber, code)` - Sends raw OTP message
- `isConfigured()` - Checks if Twilio is properly set up

### deviceFingerprintService.js
Generates and analyzes device fingerprints:
- `generateFingerprint(req)` - Creates fingerprint from request
- `calculateSimilarity(fp1, fp2)` - Compares fingerprints (0.0-1.0)
- `isSameDevice(fp1, fp2)` - Returns true if 80%+ similarity

### altAccountDetectionService.js
Main detection engine:
- `analyzeSignup(params)` - Full risk assessment
- `analyzeEmailPattern(email)` - Email anomaly detection
- `analyzeNamePattern(name, email)` - Name anomaly detection
- `analyzeIPAddress(ip)` - IP clustering analysis
- `calculateRiskLevel(confidence, detections)` - Risk scoring
- `logDetection(userId, detection)` - Audit logging

## Database Functions (db/index.js)

### Phone Verification Functions
- `createPhoneVerificationCode()` - Create OTP record
- `getPhoneVerificationCode()` - Get pending code
- `markPhoneCodeAsVerified()` - Mark code as used
- `markPhoneAsVerified()` - Update user phone status
- `deleteExpiredPhoneVerificationCodes()` - Cleanup

### Device Fingerprint Functions
- `createDeviceFingerprint()` - Store fingerprint
- `getDeviceFingerprintsForUser()` - Retrieve user's devices
- `findUsersWithFingerprint()` - Find accounts with same device
- `findUsersWithIPAddress()` - Find accounts from same IP

### Alt Account Detection Functions
- `createAltAccountDetection()` - Log detection event
- `getAltAccountDetections()` - Retrieve user's detections
- `getPendingAltAccountDetections()` - Get unresolved cases
- `updateAltAccountDetectionStatus()` - Update case status
- `findPhoneNumberMatches()` - Find accounts with same phone

## Views

### register.ejs
Updated to include:
- Optional phone number input field
- Instructions about phone verification usage

### verify-phone.ejs
New view for phone verification:
- 6-digit code input with auto-focus
- Real-time validation
- Resend code functionality
- Timer for resend throttling
- Beautiful animated UI

### settings.ejs
Added Phone Verification section:
- Phone number display (masked)
- Verification status badge
- Change phone number option
- Inline verification flow

## Testing

### Test Alt Account Detection
```javascript
const AltAccountDetectionService = require('./services/altAccountDetectionService');

const result = await AltAccountDetectionService.analyzeSignup({
  email: 'test@example.com',
  fullName: 'Test User',
  phoneNumber: '+14155552671',
  ipAddress: '192.0.2.1',
  fingerprintHash: 'abc123def456...',
  req: req
});

console.log(result);
// {
//   isAltAccount: false,
//   riskLevel: 'low',
//   detections: [],
//   shouldFlagForReview: false
// }
```

### Manual Testing Steps

1. **Signup with Phone**
   - Register new account with phone number
   - Receive SMS code
   - Enter code on verification page
   - Confirm phone marked as verified

2. **Alt Account Detection**
   - Try registering with phone from banned account
   - Should be blocked with error message
   - Check audit logs for detection

3. **Settings Phone Change**
   - Go to settings
   - Request phone verification
   - Enter new phone
   - Submit code
   - Verify it's updated

## Security Considerations

### What This Protects Against
- ✅ Multiple accounts from same phone number
- ✅ Accounts created from same device
- ✅ Rapid signup patterns from same IP
- ✅ Banned users creating new accounts
- ✅ Disposable email addresses

### What This Doesn't Protect Against
- ❌ VPN/proxy IP masking (mitigated by device fingerprinting)
- ❌ SIM swapping (phone ownership not verified)
- ❌ Burner/prepaid phone numbers (still unique per account)
- ❌ Sophisticated spoofing (beyond scope)

### Best Practices

1. **Monitor High-Risk Cases**: Regularly review `alt_account_detections` table
2. **Adjust Thresholds**: Modify confidence scores based on your abuse patterns
3. **Combine Signals**: Don't rely on single detection type
4. **Require Phone**: Consider making phone verification mandatory for certain actions
5. **Rate Limiting**: Add additional rate limits on signup endpoint
6. **CAPTCHA**: Consider CAPTCHA for high-risk signups
7. **Logging**: All detections are logged for audit trail

## Configuration Options

### Adjust Detection Sensitivity
Edit `services/altAccountDetectionService.js`:

```javascript
// Increase confidence threshold to reduce false positives
if (confidence >= 0.80) return 'high';  // was 0.75

// Or adjust phone matching confidence
confidence: 0.85  // was 0.95 for phone_match_banned
```

### Change Code Expiration
Edit `routes/auth/auth.js`:

```javascript
const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // was 15 minutes
```

### Add More Detection Types
Extend `AltAccountDetectionService.analyzeSignup()` with new methods like:
- Email domain reputation checking
- Velocity checks (signups per time period)
- Behavioral analysis

## Troubleshooting

### SMS Not Sending
- [ ] Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- [ ] Check Twilio account balance
- [ ] Confirm phone numbers are in E.164 format (+1...)
- [ ] Check Twilio logs for delivery failures

### Phone Already in Use Error
- Check `users` table for `phone_number` and `phone_verified`
- Phone numbers must be unique when `phone_verified = 1`
- Can have unverified phone numbers

### Device Fingerprint Matching Issues
- Fingerprints include user agent - different browsers = different prints
- Mobile vs desktop = different prints
- VPN/proxies change IP but fingerprint remains

### Alt Detection False Positives
- Adjust `confidence_score` thresholds in detection service
- Review `alt_account_detections` table for patterns
- Add exceptions for known legitimate cases

## Future Enhancements

1. **WebAuthn Integration**: Require biometric/security keys for high-risk accounts
2. **Phone Ownership Verification**: SMS callback to verify number ownership
3. **GeoIP Integration**: Enhanced location-based detection
4. **Machine Learning**: Train model on actual abuse patterns
5. **Quarantine System**: Temporary suspension pending review
6. **Recovery Options**: Legitimate users can appeal false positives
7. **SMS Delivery Logging**: Track SMS status and failures

## Monitoring & Alerts

### Key Metrics to Monitor
- SMS delivery success rate
- Phone verification completion rate
- Alt account detection rate
- False positive rate (from user appeals)
- IP/device clustering patterns

### Queries for Analysis

```sql
-- High-risk detections pending review
SELECT * FROM alt_account_detections 
WHERE action = 'flagged' AND resolved = 0
ORDER BY confidence_score DESC;

-- Most common detection types
SELECT detection_type, COUNT(*) as count
FROM alt_account_detections
GROUP BY detection_type
ORDER BY count DESC;

-- Phones with multiple accounts
SELECT phone_number, COUNT(DISTINCT user_id) as account_count
FROM device_fingerprints
GROUP BY phone_number
HAVING COUNT(DISTINCT user_id) > 1;
```

## Support & Maintenance

For issues or questions:
1. Check error logs for specific error messages
2. Verify Twilio configuration
3. Test with known phone numbers
4. Review detection algorithms for your use case
5. Monitor abuse patterns and adjust thresholds

## License

This implementation is part of Dream X and follows the same license as the main project.

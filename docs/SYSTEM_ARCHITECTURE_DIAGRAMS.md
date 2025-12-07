# 📊 SMS Phone Verification - System Architecture

## 🎨 Visual System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE LAYER                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Settings Page                    Forgot Password Page         │
│  ┌──────────────────┐            ┌──────────────────┐         │
│  │ 📱 Phone         │            │ Email Recovery   │         │
│  │ Verification     │            │ [Button]         │         │
│  │ Section          │            │                  │         │
│  │                  │            │ ──────────────── │         │
│  │ [📱 Add Phone]   │            │ SMS Recovery     │         │
│  │     Button       │            │ [📱 SMS Button]  │         │
│  └────────┬─────────┘            └────────┬─────────┘         │
│           │                              │                    │
│           ├──────────────────────────────┤                    │
│           │                              │                    │
│           ▼                              ▼                    │
│  ┌──────────────────────────────────────────┐               │
│  │        MODAL COMPONENTS (EJS)            │               │
│  ├──────────────────────────────────────────┤               │
│  │ phone-verification-modal.ejs             │               │
│  │ • Phone input                             │               │
│  │ • Code input (auto-advancing)             │               │
│  │ • Resend timer                            │               │
│  │ • Success message                         │               │
│  └──────────────┬───────────────────────────┘               │
│                 │                                             │
│  forgot-password-sms-modal.ejs                                │
│  • Phone input                                               │
│  • Code verification                                         │
│  • Password reset form                                       │
│  • Success confirmation                                      │
│                                                                │
└────────────────┼────────────────────────────────────────────┘
                 │
                 │ AJAX Calls
                 │
┌────────────────▼────────────────────────────────────────────┐
│                    API / ROUTE LAYER                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /settings/phone/* routes         /forgot-password/* routes│
│  ┌────────────────────────┐      ┌──────────────────────┐ │
│  │ POST request-code  ┬───┼──────→ POST request-sms     │ │
│  │ POST verify        │   │      → POST verify-sms     │ │
│  │ POST resend        └───┼──────→ POST resend-sms     │ │
│  │                        │      → POST reset-via-sms  │ │
│  │ /resend-phone-code ─┬──┤                            │ │
│  │ /verify-phone      │  │      All routes include:    │ │
│  └────────────────────┼──┘      • Input validation     │ │
│                       │          • Rate limiting check  │ │
│           Rate Limiting ──────→  • Attempt recording   │ │
│           Service Check          • Error handling       │ │
│                       │                                  │ │
│                       ▼                                  │ │
│            ┌─────────────────────┐                      │ │
│            │  Rate Limit Service │                      │ │
│            ├─────────────────────┤                      │ │
│            │ checkRateLimit()    │                      │ │
│            │ recordAttempt()     │                      │ │
│            │ getUserStats()      │                      │ │
│            │ resetLimit()        │                      │ │
│            │ cleanup()           │                      │ │
│            └──────────┬──────────┘                      │ │
│                       │                                  │ │
│                       ▼                                  │ │
│            ┌─────────────────────┐                      │ │
│            │   SMS Service       │                      │ │
│            │  (Twilio SDK)       │                      │ │
│            │                     │                      │ │
│            │ • Send SMS          │                      │ │
│            │ • Generate codes    │                      │ │
│            │ • Verify codes      │                      │ │
│            └─────────┬───────────┘                      │ │
│                      │                                   │ │
└──────────────────────┼───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    DATA LAYER                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              DATABASE (SQL Server)                    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                      │  │
│  │  users table                  rate_limit_logs table │  │
│  │  ┌────────────────┐           ┌────────────────────┐ │  │
│  │  │ id             │           │ id                 │ │  │
│  │  │ email          │           │ user_id (FK)       │ │  │
│  │  │ phone_number   │◄──────────│ action             │ │  │
│  │  │ phone_verified │           │ ip_address         │ │  │
│  │  │ password       │           │ user_agent         │ │  │
│  │  └────────────────┘           │ metadata (JSON)    │ │  │
│  │                               │ created_at         │ │  │
│  │  Verification Codes Table      └────────────────────┘ │  │
│  │  ┌────────────────┐                                   │  │
│  │  │ id             │           Actions Tracked:         │  │
│  │  │ user_id (FK)   │           • phone_verification    │  │
│  │  │ code           │           • phone_verification_.. │  │
│  │  │ expires_at     │           • password_reset_sms    │  │
│  │  │ attempts       │                                   │  │
│  │  └────────────────┘           Limits Enforced:        │  │
│  │                               • 3 SMS / 60 min       │  │
│  │                               • 10 codes / 15 min    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                       ▲
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            TWILIO (SMS Service)                      │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                      │  │
│  │  • Account SID: TWILIO_ACCOUNT_SID (env var)        │  │
│  │  • Auth Token: TWILIO_AUTH_TOKEN (env var)          │  │
│  │  • Phone Number: TWILIO_PHONE_NUMBER (env var)      │  │
│  │                                                      │  │
│  │  Functions:                                          │  │
│  │  → Send SMS: client.messages.create()               │  │
│  │  → Track delivery: webhook callbacks                │  │
│  │  → Cost tracking: $0.0075-0.0085 per SMS           │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagrams

### Phone Verification Flow

```
User                    Modal                 Backend              Database
│                        │                       │                    │
├──────────────────────→ │ [Asks for phone]     │                    │
│                        │                       │                    │
│                        ├──────────────────────→│ POST /phone/req    │
│                        │                       │                    │
│                        │                       ├────────────────────→│
│                        │                       │ Check rate limit   │
│                        │                       │                    │
│                        │                       │ Generate code      │
│                        │ SMS arrives          │                    │
│                        │ [Asks for code]      │ Send via Twilio    │
│ [Gets SMS]◄────────────┤                       │                    │
│                        │                       ├────────────────────→│
│                        │                       │ Log attempt        │
│                        │                       │                    │
├──────────────────────→ │ [Enters code]        │                    │
│                        │                       │                    │
│                        ├──────────────────────→│ POST /phone/verify │
│                        │                       │                    │
│                        │                       ├────────────────────→│
│                        │                       │ Verify code       │
│                        │                       │ Update user       │
│                        │                       │ Log attempt       │
│                        │ [Success!]◄──────────┤                    │
│                        │                       │                    │
│ [Phone Verified]◄──────┤                       │                    │
```

### Rate Limiting Flow

```
First SMS Request      Second SMS Request    Third SMS Request    Fourth SMS Request
(1 of 3)              (2 of 3)              (3 of 3)            (BLOCKED)
│                      │                      │                    │
│ POST /phone/req     │ POST /phone/req     │ POST /phone/req    │ POST /phone/req
├─────────────────→   │                      │                    │
│ Check Rate Limit    │                      │                    │
│ [0 attempts]        ├─────────────────→   │                    │
│ ✓ ALLOWED           │ Check Rate Limit    │                    │
│                     │ [1 attempt]         ├─────────────────→  │
│ Send SMS            │ ✓ ALLOWED           │ Check Rate Limit   │
│ Log attempt 1       │                     │ [2 attempts]       ├────────────────→
│ Create: 1/3         │ Send SMS            │ ✓ ALLOWED          │ Check Rate Limit
│                     │ Log attempt 2       │                    │ [3 attempts]
│                     │ Create: 2/3         │ Send SMS           │ ✗ BLOCKED
│                     │                     │ Log attempt 3      │
│                     │                     │ Create: 3/3        │ Response:
│                     │                     │                    │ "Too many attempts"
│                     │                     │                    │ "Wait 60 minutes"
│                     │                     │                    │ Countdown: 60min
│                     │                     │                    │
│                     │                     │                    ▼
│                     │                     │                 Timer Expires
│                     │                     │                 (60 minutes later)
│                     │                     │                    │
│                     │                     │                    ▼
│                     │                     │                 POST /phone/req
│                     │                     │                 ✓ ALLOWED (Reset)
```

---

## 🏗️ Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Settings Page                Phone Verification Modal         │
│  (views/user/settings.ejs)   (views/partials/phone-...)       │
│                                                                 │
│  • Page header                 • Phone input                   │
│  • User profile section         • Validation messages          │
│  • ...other sections...         • Code input (6-digit)         │
│  • Phone section (NEW)          • Resend button                │
│    └─ [📱 Add Phone Button]     • Countdown timer              │
│       └─ onclick: openPhoneVerificationModal()               │
│                                 • Success message              │
│                                 • Error handling               │
│                                                                 │
│  Forgot Password Page         SMS Recovery Modal               │
│  (views/auth/forgot-...)      (views/partials/forgot-...)     │
│                                                                 │
│  • Email recovery form         • Phone input                   │
│  • ─────────────────           • Validation                    │
│  • SMS recovery (NEW)          • Code input                    │
│    └─ [📱 SMS Button]          • Password input               │
│       └─ onclick: openForgotPasswordSmsModal()              │
│                                 • Strength indicator            │
│                                 • Success confirmation         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
                   AJAX Calls to API
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Route Handlers (routes/auth/auth.js, routes/user/settings.js) │
│                                                                 │
│  /settings/phone/request          /forgot-password/request-sms │
│  • Validate phone number          • Validate phone number      │
│  • Check rate limit               • Check rate limit           │
│  • Generate code                  • Generate code              │
│  • Send SMS                       • Send SMS                   │
│  • Log attempt                    • Log attempt                │
│  • Return response                • Return response            │
│                                                                 │
│  /settings/phone/verify           /forgot-password/verify-sms  │
│  • Validate code                  • Validate code              │
│  • Check rate limit               • Check rate limit           │
│  • Update user.phone_verified     • Verify code valid          │
│  • Log success                    • Log attempt                │
│                                                                 │
│  Rate Limiting Service (services/rateLimitService.js)          │
│  • checkRateLimit()               • recordAttempt()            │
│  • getUserStats()                 • cleanup()                  │
│  • resetLimit()                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
                    CRUD Operations
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA ACCESS LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Database Query Operations                                      │
│                                                                 │
│  • INSERT into rate_limit_logs                                 │
│  • SELECT FROM rate_limit_logs (check limits)                  │
│  • UPDATE users (set phone_verified, phone_number)             │
│  • SELECT FROM verification_codes (check expiry)               │
│  • DELETE FROM rate_limit_logs (cleanup old)                   │
│                                                                 │
│  Indexes for Performance:                                       │
│  • idx_user_action (user_id, action)                           │
│  • idx_action_created (action, created_at)                     │
│  • idx_created_at (created_at)                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
                    SQL Queries
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DATABASE & SERVICES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SQL Server Database               Twilio Service              │
│  • users table                     • SMS sending              │
│  • rate_limit_logs table           • Code generation         │
│  • verification_codes table        • Delivery tracking       │
│                                    • Cost tracking           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              SECURITY LAYERS                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INPUT VALIDATION                                           │
│  ├─ Phone format (E.164)                                  │
│  ├─ Code format (6 digits)                                │
│  ├─ Password strength                                      │
│  └─ Length limits                                          │
│                                                             │
│  RATE LIMITING                                              │
│  ├─ SMS attempts: 3 per 60 minutes                         │
│  ├─ Code attempts: 10 per 15 minutes                       │
│  ├─ Real-time enforcement                                  │
│  └─ Database logging                                       │
│                                                             │
│  AUTHENTICATION                                             │
│  ├─ User must be logged in (for settings)                 │
│  ├─ Session validation                                     │
│  └─ CSRF token protection                                  │
│                                                             │
│  CODE SECURITY                                              │
│  ├─ 6-digit codes (1 in 1M)                               │
│  ├─ Random generation                                      │
│  ├─ 15-minute expiration                                   │
│  ├─ Single use                                             │
│  └─ One-time generation                                    │
│                                                             │
│  AUDIT TRAIL                                                │
│  ├─ All SMS logged                                         │
│  ├─ IP address captured                                    │
│  ├─ User agent captured                                    │
│  ├─ Timestamp recorded                                     │
│  ├─ User ID linked                                         │
│  └─ Action categorized                                     │
│                                                             │
│  ERROR HANDLING                                             │
│  ├─ No sensitive data exposed                              │
│  ├─ Generic error messages to user                         │
│  ├─ Detailed logging server-side                           │
│  └─ Safe failure modes                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema

```
┌─────────────────────────────────────────────────────┐
│              RATE_LIMIT_LOGS TABLE                 │
├─────────────────────────────────────────────────────┤
│ Column          │ Type         │ Notes              │
├─────────────────┼──────────────┼──────────────────┤
│ id              │ INT          │ PRIMARY KEY      │
│ user_id         │ INT          │ FK to users      │
│ action          │ VARCHAR(50)  │ phone_verification│
│ ip_address      │ VARCHAR(45)  │ IPv4/IPv6        │
│ user_agent      │ VARCHAR(500) │ Device info      │
│ metadata        │ JSON         │ Phone number etc │
│ created_at      │ TIMESTAMP    │ When it happened │
├─────────────────┴──────────────┴──────────────────┤
│ Indexes:                                          │
│ • PRIMARY KEY (id)                                │
│ • FK (user_id) → users(id)                        │
│ • INDEX (user_id, action)                         │
│ • INDEX (action, created_at)                      │
│ • INDEX (created_at)                              │
└─────────────────────────────────────────────────────┘

Actions Tracked:
├─ phone_verification (SMS sent)
├─ phone_verification_attempt (Code entered)
├─ password_reset_sms (SMS sent for password reset)
└─ password_reset_sms_attempt (Code entered)

Sample Rate Limit Check Query:
SELECT COUNT(*) as recent_attempts
FROM rate_limit_logs
WHERE user_id = ?
AND action = 'phone_verification'
AND created_at > DATE_SUB(NOW(), INTERVAL 60 MINUTE);

If recent_attempts >= 3: BLOCKED
Else: ALLOWED
```

---

## 🔄 Request/Response Cycle

```
┌─────────────────────────────────────────────────────────────┐
│          PHONE VERIFICATION REQUEST/RESPONSE                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ CLIENT                          SERVER                     │
│   │                               │                        │
│   │ POST /settings/phone/request  │                        │
│   │ {                             │                        │
│   │   "phoneNumber": "+1..."      │                        │
│   │ }                             │                        │
│   ├─────────────────────────────→│                        │
│   │                               │ Validate phone        │
│   │                               │ Check rate limit      │
│   │                               │ Generate code         │
│   │                               │ Send via Twilio       │
│   │                               │ Log attempt           │
│   │                               │                        │
│   │ {                             │                        │
│   │   "success": true,            │                        │
│   │   "message": "Code sent",     │                        │
│   │   "resendIn": 60              │                        │
│   │ }                             │                        │
│   │←──────────────────────────────┤                        │
│   │                               │                        │
│   │ [User receives SMS code]      │ SMS via Twilio        │
│   │                               │                        │
│   │ POST /settings/phone/verify   │                        │
│   │ {                             │                        │
│   │   "code": "123456"            │                        │
│   │ }                             │                        │
│   ├─────────────────────────────→│                        │
│   │                               │ Validate code         │
│   │                               │ Check expiry          │
│   │                               │ Update user           │
│   │                               │ Log attempt           │
│   │                               │                        │
│   │ {                             │                        │
│   │   "success": true,            │                        │
│   │   "message": "Verified!",     │                        │
│   │   "phone": "•••••1234"        │                        │
│   │ }                             │                        │
│   │←──────────────────────────────┤                        │
│   │                               │                        │
│   │ [Modal closes]                │                        │
│   │ [Settings page updates]       │                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          PRODUCTION DEPLOYMENT ARCHITECTURE                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DEVELOPMENT          STAGING              PRODUCTION      │
│  ──────────────      ──────────           ──────────       │
│  • Local code        • Test server        • Live server    │
│  • Dev database      • Test database      • Production DB  │
│  • Twilio sandbox    • Twilio sandbox     • Twilio prod   │
│  • Feature branch    • Main branch        • Production     │
│      │                    │                   │            │
│      │ Commit & Push      │                   │            │
│      ├──────────────────→ │                   │            │
│      │                    │ PR Review & Test  │            │
│      │                    │                   │            │
│      │                    │ Merge to main     │            │
│      │                    ├──────────────────→│            │
│      │                    │                   │            │
│      │                    │                   │ Deploy      │
│      │                    │                   │             │
│  Environment Variables (must be set in each):             │
│  • TWILIO_ACCOUNT_SID                                     │
│  • TWILIO_AUTH_TOKEN                                      │
│  • TWILIO_PHONE_NUMBER                                    │
│  • SMS_ENABLED (true/false)                               │
│  • NODE_ENV (development/staging/production)              │
│                                                             │
│  Monitoring After Deploy:                                  │
│  • Error logs                                              │
│  • SMS delivery status                                     │
│  • Rate limit breaches                                     │
│  • Cost tracking                                           │
│  • User feedback                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 Scaling Considerations

```
┌──────────────────────────────────────────────────────────────┐
│            SCALABILITY & OPTIMIZATION                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  At 1,000 users/month (1-2 SMS per user):                  │
│  • ~3 SMS per hour                                          │
│  • Cost: ~$2-4/month                                        │
│  • Database: Minimal growth                                 │
│  • No optimization needed                                   │
│                                                              │
│  At 10,000 users/month (2-3 SMS per user):                 │
│  • ~30 SMS per hour                                         │
│  • Cost: ~$20-50/month                                      │
│  • Database: Small growth (~300K logs/month)                │
│  • Add log cleanup job (30+ day retention)                  │
│                                                              │
│  At 100,000 users/month (2-3 SMS per user):                │
│  • ~300 SMS per hour                                        │
│  • Cost: ~$200-500/month                                    │
│  • Database: Moderate growth (~3M logs/month)               │
│  • Implement SMS pooling (volume discount)                  │
│  • Archive old logs (quarterly)                             │
│  • Monitor rate limit hit rate                              │
│                                                              │
│  At 1,000,000 users/month (2-3 SMS per user):              │
│  • ~3,000 SMS per hour                                      │
│  • Cost: ~$2,000-5,000/month                                │
│  • Database: Significant growth (~30M logs/month)           │
│  • Consider dedicated SMS provider                          │
│  • Implement async logging                                  │
│  • Shard database by user_id                                │
│  • Cache rate limits in Redis                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

**This architecture ensures:**
✅ Security at every layer
✅ Proper rate limiting
✅ Audit trail for compliance
✅ Scalability for growth
✅ Reliability and redundancy
✅ Easy to understand and maintain

---

*Generated: December 7, 2025*
*System: SMS Phone Verification v1.0*

# Security Hardening Implementation

This document describes the security measures implemented to protect the Dream X application from common cyber attacks and exploits.

## Overview

The application has been hardened with multiple layers of security controls to protect against:
- Cross-Site Scripting (XSS)
- SQL Injection
- Cross-Site Request Forgery (CSRF)
- Brute Force Attacks
- NoSQL Injection
- HTTP Parameter Pollution
- Clickjacking
- MIME Sniffing
- Directory Traversal
- Timing Attacks
- And more...

## Security Layers

### 1. HTTP Security Headers (Helmet.js)

**Implementation:** `middleware/security.js` - `configureHelmet()`

Applies comprehensive HTTP security headers:

- **Content Security Policy (CSP)**: Restricts sources for scripts, styles, images, etc.
- **Strict Transport Security (HSTS)**: Forces HTTPS connections
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer Policy**: Controls referrer information
- **Permissions Policy**: Controls browser features

### 2. Rate Limiting

**Implementation:** `middleware/security.js`

Multiple rate limiters protect different endpoints:

- **Authentication Limiter**: 5 requests per 15 minutes for login attempts
- **Registration Limiter**: 3 registrations per hour per IP
- **Password Reset Limiter**: 3 requests per hour
- **API Limiter**: 100 requests per 15 minutes
- **Upload Limiter**: 20 uploads per 15 minutes
- **Sensitive Operations Limiter**: 5 requests per 15 minutes

### 3. Account Lockout Protection

**Implementation:** `services/accountLockoutService.js`

Prevents brute force attacks with:

- Progressive delays on failed login attempts
- Account lockout after 5 failed attempts
- 15-minute lockout duration
- Automatic unlocking after timeout
- IP tracking for suspicious activity

### 4. Input Validation

**Implementation:** `middleware/validation.js`

Comprehensive input validation using express-validator:

- Email validation and normalization
- Password complexity requirements (8+ chars, uppercase, lowercase, number, special char)
- Username/handle validation
- Phone number validation (E.164 format)
- URL validation
- Text content length limits
- Array and pagination validation

### 5. Input Sanitization

**Implementation:** `middleware/security.js` - `sanitizeRequest()`

Sanitizes all user input to prevent XSS:

- HTML special character escaping
- NoSQL injection prevention
- Prototype pollution protection
- Control character removal

### 6. CSRF Protection

**Implementation:** `middleware/security.js` - `csrfProtection()`

Custom CSRF implementation using double-submit cookie pattern:

- Generates unique tokens per session
- Validates tokens on all state-changing requests (POST, PUT, DELETE)
- Timing-safe token comparison
- Exemption mechanism for API endpoints

### 7. File Upload Security

**Implementation:** `middleware/security.js` - `validateFileUpload()`

Comprehensive file upload validation:

- File size limits (varies by upload type)
- MIME type validation
- Extension validation
- Double extension detection
- Executable file blocking
- Script file blocking

### 8. SQL Injection Prevention

**Implementation:** Database layer uses prepared statements

All database queries use parameterized queries (prepared statements):

- SQLite: better-sqlite3 with prepared statements
- SQL Server: mssql with parameterized queries
- Parameter type validation

### 9. Session Security

**Implementation:** `app.js` session configuration

Enhanced session security:

- Renamed session cookie (prevents fingerprinting)
- HTTPOnly flag (prevents JavaScript access)
- Secure flag in production (HTTPS only)
- SameSite=lax (CSRF protection)
- Rolling sessions (extends on activity)
- Session destruction on unset
- Strong session secrets

### 10. Security Event Logging

**Implementation:** `middleware/security.js` - `logSecurityEvent()`

Logs suspicious activities:

- Failed login attempts
- CSRF violations
- Suspicious URL patterns
- File upload rejections
- Rate limit violations

### 11. Suspicious URL Blocking

**Implementation:** `middleware/security.js` - `blockSuspiciousUrls()`

Blocks malicious URL patterns:

- Directory traversal attempts (`../`, `%2e%2e`)
- Null byte injection
- SQL injection in URLs
- XSS attempts in URLs
- Path traversal to sensitive files

### 12. HTTP Parameter Pollution Protection

**Implementation:** `middleware/security.js` - `configureHpp()`

Prevents parameter pollution attacks while allowing legitimate arrays.

### 13. Timing Attack Protection

**Implementation:** `middleware/security.js` - `timingSafeCompare()`

Uses constant-time comparison for sensitive operations:

- CSRF token validation
- Password verification
- API key validation

## Security Configuration

### Environment Variables

Ensure these environment variables are properly set:

```bash
# Session Security
SESSION_SECRET=<strong-random-secret-64-chars-minimum>

# Database (Production)
DB_TYPE=sqlserver
DB_SERVER=<server>
DB_NAME=<database>
DB_USER=<user>
DB_PASSWORD=<strong-password>

# HTTPS (Production)
NODE_ENV=production
BASE_URL=https://your-domain.com
```

### Recommended Production Settings

1. **Use HTTPS**: Always use HTTPS in production
2. **Strong Secrets**: Use cryptographically strong secrets (32+ random bytes)
3. **Regular Updates**: Keep dependencies updated
4. **Monitor Logs**: Review security logs regularly
5. **Rotate Secrets**: Rotate session secrets periodically
6. **Limit Permissions**: Run with minimal required permissions

## Security Checklist

- [x] HTTP security headers (Helmet)
- [x] Rate limiting on sensitive endpoints
- [x] Account lockout on failed logins
- [x] Input validation (express-validator)
- [x] Input sanitization (XSS prevention)
- [x] CSRF protection
- [x] SQL injection prevention (prepared statements)
- [x] File upload security
- [x] Session security
- [x] Security logging
- [x] Suspicious URL blocking
- [x] Timing attack protection
- [x] NoSQL injection prevention
- [x] HTTP parameter pollution protection

## Testing Security

### Manual Testing

1. **Test Rate Limiting**:
   ```bash
   # Try multiple login attempts
   for i in {1..10}; do curl -X POST http://localhost:3000/login -d "email=test@test.com&password=wrong"; done
   ```

2. **Test CSRF Protection**:
   ```bash
   # Try POST without CSRF token
   curl -X POST http://localhost:3000/api/some-endpoint -d "data=test"
   ```

3. **Test File Upload**:
   ```bash
   # Try uploading executable
   curl -X POST http://localhost:3000/upload -F "file=@malicious.exe"
   ```

### Automated Security Scanning

Run security audit:
```bash
npm audit
npm audit fix
```

Run tests:
```bash
npm test
```

## Incident Response

If a security incident is detected:

1. **Check Logs**: Review security logs for suspicious activity
2. **Identify Scope**: Determine what data/systems were affected
3. **Contain**: Block attacker IP, invalidate sessions if needed
4. **Remediate**: Fix vulnerability, update code
5. **Notify**: Inform affected users if data was compromised
6. **Learn**: Update security measures to prevent recurrence

## Security Contacts

For security issues, please contact:
- Security Team: security@dream-x.app
- Emergency: Use issue tracker with "security" tag

## Updates and Maintenance

This security implementation should be reviewed and updated:
- After any major feature changes
- When new vulnerabilities are discovered
- At least quarterly for general review
- When dependencies have security updates

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)

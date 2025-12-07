# Security Configuration Guide

## Production Environment Setup

### Required Environment Variables

```bash
# Critical Security Settings
NODE_ENV=production
SESSION_SECRET=<REPLACE-WITH-64-CHAR-RANDOM-STRING>
BASE_URL=https://your-production-domain.com

# Database (Production - SQL Server)
DB_TYPE=sqlserver
DB_SERVER=<your-db-server>
DB_NAME=dreamx_production
DB_USER=<db-user>
DB_PASSWORD=<STRONG-PASSWORD>
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false

# OAuth Providers (Optional but Recommended)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
MICROSOFT_CLIENT_SECRET=<your-microsoft-client-secret>
MICROSOFT_CALLBACK_URL=https://your-domain.com/auth/microsoft/callback

# Email Service (Required for verification)
EMAIL_SERVICE=gmail
EMAIL_USER=<your-email@gmail.com>
EMAIL_PASSWORD=<app-specific-password>

# SMS/Phone Verification (Optional)
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-token>
TWILIO_PHONE_NUMBER=<your-twilio-number>

# Payment Processors (Optional)
STRIPE_SECRET_KEY=<your-stripe-secret>
STRIPE_PUBLISHABLE_KEY=<your-stripe-public>

# Push Notifications (Optional)
VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:admin@your-domain.com

# Admin Account (First Time Setup)
DEFAULT_ADMIN_EMAIL=admin@your-domain.com
DEFAULT_ADMIN_PASSWORD=<STRONG-PASSWORD-CHANGE-AFTER-FIRST-LOGIN>
DEFAULT_ADMIN_FORCE_RESET=true
```

### Generating Secure Secrets

#### Session Secret (64 characters minimum)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### VAPID Keys (for Web Push)
```bash
npx web-push generate-vapid-keys
```

## Security Hardening Checklist

### Infrastructure

- [ ] Enable HTTPS/TLS with valid certificate
- [ ] Use strong TLS configuration (TLS 1.2+)
- [ ] Configure reverse proxy (nginx/Apache) with security headers
- [ ] Enable firewall rules (allow only necessary ports)
- [ ] Set up DDoS protection (Cloudflare, AWS Shield, etc.)
- [ ] Use separate database server with restricted access
- [ ] Enable database encryption at rest and in transit
- [ ] Configure automated backups with encryption
- [ ] Set up monitoring and alerting
- [ ] Use container security scanning if using Docker

### Application

- [ ] Set strong SESSION_SECRET (64+ characters)
- [ ] Enable secure cookies (automatic in production)
- [ ] Configure CSP headers appropriately
- [ ] Set up rate limiting (already configured)
- [ ] Enable account lockout (already configured)
- [ ] Configure file upload limits
- [ ] Validate and sanitize all inputs (already configured)
- [ ] Use prepared statements for database queries (already implemented)
- [ ] Enable CSRF protection (already configured)
- [ ] Log security events
- [ ] Set up intrusion detection

### Database

- [ ] Use strong database passwords (20+ characters)
- [ ] Restrict database access by IP
- [ ] Enable SQL Server encryption
- [ ] Use separate database user for application (not sa)
- [ ] Grant minimal required permissions
- [ ] Enable database audit logging
- [ ] Regular security patches and updates
- [ ] Implement backup encryption

### File Storage

- [ ] Validate file uploads (already implemented)
- [ ] Scan uploaded files for malware
- [ ] Use separate storage service (Azure Blob, S3)
- [ ] Set appropriate file permissions
- [ ] Implement virus scanning
- [ ] Set file size limits (already configured)
- [ ] Block executable file uploads (already implemented)

### Access Control

- [ ] Implement least privilege principle
- [ ] Use RBAC for admin access (already implemented)
- [ ] Enforce strong password policy (already enforced)
- [ ] Enable 2FA for admin accounts
- [ ] Regular access reviews
- [ ] Audit admin actions (already logged)

### Monitoring

- [ ] Set up application monitoring (PM2, New Relic, etc.)
- [ ] Configure security event logging
- [ ] Set up log aggregation (ELK, Splunk, etc.)
- [ ] Enable alerting for suspicious activity
- [ ] Monitor failed login attempts
- [ ] Track API rate limit violations
- [ ] Set up uptime monitoring

### Compliance

- [ ] GDPR compliance for EU users
- [ ] Data retention policies
- [ ] Privacy policy documentation
- [ ] Terms of service
- [ ] Cookie consent mechanism
- [ ] Data export functionality
- [ ] Right to deletion implementation

## Security Headers Configuration

The application automatically configures these security headers via Helmet.js:

```javascript
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.socket.io ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), microphone=(), camera=()
```

## Rate Limiting Configuration

Current limits (can be adjusted in `middleware/security.js`):

- **Authentication**: 5 attempts per 15 minutes
- **Registration**: 3 attempts per hour
- **Password Reset**: 3 attempts per hour
- **API Calls**: 100 requests per 15 minutes
- **File Uploads**: 20 uploads per 15 minutes
- **Sensitive Operations**: 5 requests per 15 minutes

## Account Lockout Configuration

Current settings (can be adjusted in `services/accountLockoutService.js`):

- **Max Failed Attempts**: 5
- **Lockout Duration**: 15 minutes
- **Progressive Delays**: 0s, 1s, 2s, 5s, 10s

## Nginx Security Configuration (Example)

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req zone=general burst=20 nodelay;

    # File Upload Size Limit
    client_max_body_size 500M;

    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

## Regular Maintenance

### Daily
- Review security logs for anomalies
- Check failed login attempts
- Monitor rate limit violations

### Weekly
- Review user access patterns
- Check for suspicious file uploads
- Review admin action logs
- Update dependencies if security patches available

### Monthly
- Full security audit
- Dependency vulnerability scan (`npm audit`)
- Review and update security policies
- Test backup restoration
- Review access control lists

### Quarterly
- Penetration testing
- Security training for team
- Update security documentation
- Review compliance requirements

## Incident Response Plan

### Detection
1. Monitor logs for security events
2. Set up alerts for suspicious patterns
3. Review failed authentication attempts
4. Check for unusual API usage

### Response
1. Identify the incident type and scope
2. Contain the threat (block IP, disable account, etc.)
3. Collect evidence (logs, requests, etc.)
4. Analyze the attack vector
5. Implement fixes
6. Document the incident

### Recovery
1. Restore from backups if needed
2. Reset compromised credentials
3. Update security measures
4. Notify affected users if required
5. Update incident response procedures

## Contact Information

- **Security Team**: security@dream-x.app
- **Emergency Contact**: [Phone/On-call system]
- **Bug Bounty**: [If applicable]

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

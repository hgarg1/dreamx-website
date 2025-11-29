const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT configuration - use environment variables or fallback to defaults (should be set in production)
// Support both asymmetric (public/private key) and symmetric (secret) for access tokens
// 
// For asymmetric keys (recommended):
//   - JWT_ACCESS_PRIVATE_KEY: RSA private key in PEM format (used for signing tokens)
//   - JWT_ACCESS_PUBLIC_KEY: RSA public key in PEM format (used for verifying tokens)
//   - Format: Include full key with headers: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
//
// For symmetric secret (fallback):
//   - JWT_ACCESS_SECRET: Shared secret string (used for both signing and verifying)
//
// Refresh tokens always use symmetric secret:
//   - JWT_REFRESH_SECRET: Shared secret string for refresh token operations
const JWT_ACCESS_PRIVATE_KEY = process.env.JWT_ACCESS_PRIVATE_KEY || null;
const JWT_ACCESS_PUBLIC_KEY = process.env.JWT_ACCESS_PUBLIC_KEY || null;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';

// Determine if using asymmetric keys (public/private) or symmetric (secret)
// If both private and public keys are provided, use asymmetric encryption (more secure)
const USE_ASYMMETRIC_KEYS = !!(JWT_ACCESS_PRIVATE_KEY && JWT_ACCESS_PUBLIC_KEY);

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 30; // 30 days

/**
 * Generate an access token (short-lived JWT)
 * Uses private key if available (asymmetric), otherwise uses secret (symmetric)
 */
function generateAccessToken(userId) {
  const payload = { userId, type: 'access' };
  const options = { expiresIn: ACCESS_TOKEN_EXPIRY };

  if (USE_ASYMMETRIC_KEYS) {
    // Use RS256 algorithm with private key for signing
    return jwt.sign(payload, JWT_ACCESS_PRIVATE_KEY, { ...options, algorithm: 'RS256' });
  } else {
    // Use HS256 algorithm with secret for signing (fallback)
    return jwt.sign(payload, JWT_ACCESS_SECRET, { ...options, algorithm: 'HS256' });
  }
}

/**
 * Generate a refresh token (long-lived, stored in DB)
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify an access token and extract user ID
 * Uses public key if available (asymmetric), otherwise uses secret (symmetric)
 */
function verifyAccessToken(token) {
  try {
    let decoded;
    
    if (USE_ASYMMETRIC_KEYS) {
      // Use RS256 algorithm with public key for verification
      decoded = jwt.verify(token, JWT_ACCESS_PUBLIC_KEY, { algorithms: ['RS256'] });
    } else {
      // Use HS256 algorithm with secret for verification (fallback)
      decoded = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    }

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return { userId: decoded.userId, valid: true };
  } catch (error) {
    return { userId: null, valid: false, error: error.message };
  }
}

/**
 * Calculate refresh token expiration date
 */
function getRefreshTokenExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiresAt.toISOString();
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  getRefreshTokenExpiry,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY_DAYS
};


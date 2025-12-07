/**
 * Rate Limiting Service for SMS and Verification Code Delivery
 * Prevents abuse of OTP/SMS delivery endpoints
 */

const { db } = require('../db');

class RateLimitService {
  /**
   * Check if action is allowed based on rate limits
   * @param {string} userId - User ID
   * @param {string} action - 'phone_verification' | 'email_verification' | 'password_reset'
   * @param {object} options - { maxAttempts: 3, windowMinutes: 60 }
   * @returns {object} { allowed: boolean, remaining: number, resetAt: Date }
   */
  static checkRateLimit(userId, action, options = {}) {
    const {
      maxAttempts = 3,
      windowMinutes = 60
    } = options;

    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

      // Count recent attempts
      const result = db.prepare(`
        SELECT COUNT(*) as attempt_count, MAX(created_at) as last_attempt
        FROM rate_limit_logs
        WHERE user_id = ? AND action = ? AND created_at > ?
      `).get(userId, action, windowStart.toISOString());

      const attemptCount = result?.attempt_count || 0;
      const remaining = Math.max(0, maxAttempts - attemptCount);
      const lastAttempt = result?.last_attempt ? new Date(result.last_attempt) : null;
      
      // Calculate reset time (next available attempt)
      let resetAt = null;
      if (attemptCount >= maxAttempts && lastAttempt) {
        resetAt = new Date(lastAttempt.getTime() + windowMinutes * 60 * 1000);
      }

      return {
        allowed: attemptCount < maxAttempts,
        remaining,
        attemptCount,
        resetAt,
        waitSeconds: resetAt ? Math.ceil((resetAt - now) / 1000) : 0
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request (fail open)
      return { allowed: true, remaining: 3, attemptCount: 0, resetAt: null, waitSeconds: 0 };
    }
  }

  /**
   * Record an attempt
   * @param {number} userId - User ID
   * @param {string} action - Action type
   * @param {object} metadata - Additional metadata (e.g., phone number, email)
   * @returns {number} Attempt number
   */
  static recordAttempt(userId, action, metadata = {}) {
    try {
      const result = db.prepare(`
        INSERT INTO rate_limit_logs (user_id, action, metadata, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        userId,
        action,
        JSON.stringify(metadata)
      );

      return result.changes;
    } catch (error) {
      console.error('Failed to record rate limit attempt:', error);
      throw error;
    }
  }

  /**
   * Clean up old rate limit logs (call periodically)
   * @param {number} daysOld - Delete logs older than this many days
   * @returns {number} Number of deleted records
   */
  static cleanup(daysOld = 7) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
      const result = db.prepare(`
        DELETE FROM rate_limit_logs
        WHERE created_at < ?
      `).run(cutoffDate);

      console.log(`Rate limit cleanup: deleted ${result.changes} old records`);
      return result.changes;
    } catch (error) {
      console.error('Rate limit cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get rate limit stats for a user
   * @param {number} userId
   * @returns {object} Stats across all actions
   */
  static getUserStats(userId) {
    try {
      const stats = {};
      const actions = ['phone_verification', 'email_verification', 'password_reset'];

      actions.forEach(action => {
        const limit = this.checkRateLimit(userId, action);
        stats[action] = limit;
      });

      return stats;
    } catch (error) {
      console.error('Failed to get rate limit stats:', error);
      return {};
    }
  }

  /**
   * Reset rate limit for a user (admin use)
   * @param {number} userId
   * @param {string} action
   * @returns {boolean}
   */
  static resetLimit(userId, action) {
    try {
      const result = db.prepare(`
        DELETE FROM rate_limit_logs
        WHERE user_id = ? AND action = ?
      `).run(userId, action);

      return result.changes > 0;
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
      return false;
    }
  }
}

module.exports = RateLimitService;

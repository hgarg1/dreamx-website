const {
  findPhoneNumberMatches,
  findUsersWithFingerprint,
  findUsersWithIPAddress,
  findRecentPhoneMatchesByIP,
  getUserByHandle,
  createAltAccountDetection,
  getUserById
} = require('../db');

const DeviceFingerprintService = require('./deviceFingerprintService');

class AltAccountDetectionService {
  /**
   * Comprehensive alt account detection
   * Runs multiple checks and returns aggregated risk assessment
   * @param {object} params - { email, fullName, phoneNumber, ipAddress, fingerprintHash, req }
   * @returns {Promise<object>} { isAltAccount: boolean, riskLevel: 'low'|'medium'|'high', detections: array, recommendation: string }
   */
  static async analyzeSignup({ email, fullName, phoneNumber, ipAddress, fingerprintHash, req }) {
    const detections = [];
    let totalConfidence = 0;
    let detectionCount = 0;

    // 1. Phone number matching (highest weight)
    if (phoneNumber) {
      const phoneMatches = findPhoneNumberMatches(phoneNumber);
      if (phoneMatches && phoneMatches.length > 0) {
        // Existing verified phone number - strong indicator of alt account
        const suspiciousMatches = phoneMatches.filter(u => 
          u.account_status === 'banned' || 
          u.account_status === 'suspended'
        );
        
        if (suspiciousMatches.length > 0) {
          detections.push({
            type: 'phone_match_banned',
            severity: 'high',
            confidence: 0.95,
            details: {
              matchedUserIds: suspiciousMatches.map(u => u.id),
              phoneNumber: this.maskPhoneNumber(phoneNumber),
              matchedEmails: suspiciousMatches.map(u => u.email)
            }
          });
          totalConfidence += 0.95;
          detectionCount++;
        } else {
          // Same phone with multiple active accounts - unusual
          detections.push({
            type: 'phone_match_multiple',
            severity: 'medium',
            confidence: 0.70,
            details: {
              matchCount: phoneMatches.length,
              phoneNumber: this.maskPhoneNumber(phoneNumber),
              matchedEmails: phoneMatches.map(u => u.email)
            }
          });
          totalConfidence += 0.70;
          detectionCount++;
        }
      }
    }

    // 2. Email pattern matching
    const emailChecks = this.analyzeEmailPattern(email);
    if (emailChecks.suspicious) {
      detections.push({
        type: 'email_pattern',
        severity: emailChecks.severity,
        confidence: emailChecks.confidence,
        details: emailChecks.details
      });
      totalConfidence += emailChecks.confidence;
      detectionCount++;
    }

    // 3. Name pattern matching
    if (fullName) {
      const nameChecks = this.analyzeNamePattern(fullName, email);
      if (nameChecks.suspicious) {
        detections.push({
          type: 'name_pattern',
          severity: nameChecks.severity,
          confidence: nameChecks.confidence,
          details: nameChecks.details
        });
        totalConfidence += nameChecks.confidence;
        detectionCount++;
      }
    }

    // 4. IP-based detection
    if (ipAddress) {
      const ipChecks = await this.analyzeIPAddress(ipAddress);
      if (ipChecks.suspicious) {
        detections.push({
          type: 'ip_cluster',
          severity: ipChecks.severity,
          confidence: ipChecks.confidence,
          details: ipChecks.details
        });
        totalConfidence += ipChecks.confidence;
        detectionCount++;
      }
    }

    // 5. Device fingerprint matching
    if (fingerprintHash) {
      const fingerprintMatches = findUsersWithFingerprint(fingerprintHash);
      if (fingerprintMatches && fingerprintMatches.length > 0) {
        const matchedUsers = fingerprintMatches.map(m => getUserById(m.user_id)).filter(Boolean);
        const suspiciousMatches = matchedUsers.filter(u =>
          u.account_status === 'banned' || u.account_status === 'suspended'
        );

        if (suspiciousMatches.length > 0) {
          detections.push({
            type: 'device_match_banned',
            severity: 'high',
            confidence: 0.85,
            details: {
              matchCount: suspiciousMatches.length,
              matchedUserIds: suspiciousMatches.map(u => u.id)
            }
          });
          totalConfidence += 0.85;
          detectionCount++;
        }
      }
    }

    // Calculate aggregate risk
    const averageConfidence = detectionCount > 0 ? totalConfidence / detectionCount : 0;
    const riskLevel = this.calculateRiskLevel(averageConfidence, detections);

    return {
      isAltAccount: riskLevel === 'high',
      riskLevel,
      averageConfidence,
      detectionCount,
      detections,
      recommendation: this.getRecommendation(riskLevel, detections),
      shouldFlagForReview: riskLevel === 'high' || averageConfidence > 0.75
    };
  }

  /**
   * Analyze email for suspicious patterns
   * @param {string} email
   * @returns {object}
   */
  static analyzeEmailPattern(email) {
    if (!email) return { suspicious: false };

    const emailLower = email.toLowerCase();
    const [username, domain] = emailLower.split('@');

    // Check for disposable email services
    const disposableDomains = [
      'tempmail.', 'throwaway', '10minutemail', 'guerrillamail',
      'mailinator', 'trashmail', 'yopmail', 'fakeinbox'
    ];

    if (disposableDomains.some(d => domain.includes(d))) {
      return {
        suspicious: true,
        severity: 'high',
        confidence: 0.80,
        details: {
          reason: 'Disposable email service detected',
          domain
        }
      };
    }

    // Check for numbered suffix pattern (user123, user456)
    const numberedPattern = /\d{2,}$/;
    if (numberedPattern.test(username)) {
      return {
        suspicious: true,
        severity: 'medium',
        confidence: 0.50,
        details: {
          reason: 'Username has numbered suffix pattern',
          username
        }
      };
    }

    return { suspicious: false };
  }

  /**
   * Analyze full name for suspicious patterns
   * @param {string} fullName
   * @param {string} email
   * @returns {object}
   */
  static analyzeNamePattern(fullName, email) {
    if (!fullName) return { suspicious: false };

    const nameLower = fullName.toLowerCase();
    const emailPart = email.split('@')[0].toLowerCase();

    // Check for very generic names (potential throwaway accounts)
    const genericNames = ['test', 'user', 'admin', 'guest', 'demo', 'account', 'newuser', 'fake'];
    if (genericNames.includes(nameLower)) {
      return {
        suspicious: true,
        severity: 'medium',
        confidence: 0.60,
        details: {
          reason: 'Generic name detected',
          name: fullName
        }
      };
    }

    // Check if name is just numbers or very short
    if (/^\d+$/.test(nameLower) || fullName.length < 3) {
      return {
        suspicious: true,
        severity: 'medium',
        confidence: 0.65,
        details: {
          reason: 'Name is too short or numeric',
          name: fullName
        }
      };
    }

    return { suspicious: false };
  }

  /**
   * Analyze IP address for clustering
   * @param {string} ipAddress
   * @returns {Promise<object>}
   */
  static async analyzeIPAddress(ipAddress) {
    try {
      // Find accounts created from same IP in last 24 hours
      const recentFromIP = findRecentPhoneMatchesByIP(ipAddress, 24);
      
      if (recentFromIP && recentFromIP.length > 1) {
        return {
          suspicious: true,
          severity: 'medium',
          confidence: 0.65,
          details: {
            reason: 'Multiple account signups from same IP in 24 hours',
            accountCount: recentFromIP.length,
            timeWindow: '24 hours'
          }
        };
      }

      // Check for rapid signups from same IP (within 1 hour)
      const veryRecentFromIP = findRecentPhoneMatchesByIP(ipAddress, 1);
      if (veryRecentFromIP && veryRecentFromIP.length > 0) {
        return {
          suspicious: true,
          severity: 'high',
          confidence: 0.85,
          details: {
            reason: 'Account signup from same IP within 1 hour',
            accountCount: veryRecentFromIP.length
          }
        };
      }

      return { suspicious: false };
    } catch (error) {
      console.error('IP analysis error:', error);
      return { suspicious: false };
    }
  }

  /**
   * Calculate overall risk level
   * @param {number} confidence - 0.0 to 1.0
   * @param {array} detections
   * @returns {string} 'low' | 'medium' | 'high'
   */
  static calculateRiskLevel(confidence, detections) {
    // High severity detection = high risk
    if (detections.some(d => d.severity === 'high')) {
      return 'high';
    }

    // Multiple detections = higher risk
    if (detections.length >= 2 && confidence >= 0.70) {
      return 'high';
    }

    if (confidence >= 0.75) {
      return 'high';
    }
    if (confidence >= 0.50) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get action recommendation
   * @param {string} riskLevel
   * @param {array} detections
   * @returns {string}
   */
  static getRecommendation(riskLevel, detections) {
    if (riskLevel === 'high') {
      if (detections.some(d => d.type.includes('banned'))) {
        return 'BLOCK_SIGNUP - Detected patterns matching banned account';
      }
      return 'REQUIRE_ADDITIONAL_VERIFICATION - High alt account risk detected';
    }
    if (riskLevel === 'medium') {
      return 'MONITOR - Medium risk detected, flag for manual review';
    }
    return 'ALLOW - Low risk detected';
  }

  /**
   * Mask phone number for logging
   * @param {string} phoneNumber
   * @returns {string}
   */
  static maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) return '****';
    return phoneNumber.slice(0, 3) + '*'.repeat(phoneNumber.length - 6) + phoneNumber.slice(-3);
  }

  /**
   * Log detection event
   * @param {number} userId
   * @param {object} detection
   */
  static logDetection(userId, detection) {
    try {
      createAltAccountDetection({
        userId,
        detectionType: detection.type,
        confidenceScore: detection.confidence,
        matchedUserIds: detection.details?.matchedUserIds || [],
        details: detection.details,
        action: 'flagged'
      });
    } catch (error) {
      console.error('Failed to log alt account detection:', error);
    }
  }
}

module.exports = AltAccountDetectionService;

const crypto = require('crypto');
const UAParser = require('ua-parser-js');

class DeviceFingerprintService {
  /**
   * Generate a device fingerprint from request data
   * @param {object} req - Express request object
   * @returns {object} { fingerprint: string, hash: string, details: object }
   */
  static generateFingerprint(req) {
    try {
      // Collect device characteristics
      const userAgent = req.headers['user-agent'] || '';
      const acceptLanguage = req.headers['accept-language'] || '';
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const ip = this.getClientIP(req);

      // Parse user agent
      const parser = new UAParser(userAgent);
      const ua = parser.getResult();

      // Create fingerprint string from multiple sources
      const fingerprintString = [
        userAgent,
        acceptLanguage,
        acceptEncoding,
        ua.os.name,
        ua.os.version,
        ua.browser.name,
        ua.browser.version,
        ua.device.type || 'desktop',
        req.headers['sec-ch-ua'] || '',
        req.headers['sec-ch-ua-mobile'] || '',
        req.headers['sec-ch-ua-platform'] || ''
      ]
        .filter(Boolean)
        .join('|');

      // Create hash
      const hash = crypto
        .createHash('sha256')
        .update(fingerprintString)
        .digest('hex');

      return {
        fingerprint: fingerprintString,
        hash,
        details: {
          userAgent,
          ip,
          country: this.getCountryFromIP(req),
          deviceType: ua.device.type || 'desktop',
          browser: `${ua.browser.name || 'Unknown'} ${ua.browser.version || ''}`.trim(),
          os: `${ua.os.name || 'Unknown'} ${ua.os.version || ''}`.trim(),
          language: acceptLanguage.split(',')[0] || 'unknown',
          mobile: ua.device.type === 'mobile',
          tablet: ua.device.type === 'tablet'
        }
      };
    } catch (error) {
      console.error('Fingerprint generation error:', error);
      return {
        fingerprint: '',
        hash: crypto.randomBytes(16).toString('hex'),
        details: {}
      };
    }
  }

  /**
   * Get client IP address from request
   * @param {object} req - Express request object
   * @returns {string}
   */
  static getClientIP(req) {
    return (
      (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0]) ||
      req.headers['x-client-ip'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket?.remoteAddress ||
      'unknown'
    ).trim();
  }

  /**
   * Get country from IP (basic implementation)
   * In production, integrate with MaxMind GeoIP2 or similar
   * @param {object} req - Express request object
   * @returns {string}
   */
  static getCountryFromIP(req) {
    // Cloud provider headers
    const cfCountry = req.headers['cf-ipcountry']; // Cloudflare
    const xCountry = req.headers['x-country'];
    const xGeoCountry = req.headers['x-geo-country'];

    if (cfCountry) return cfCountry;
    if (xCountry) return xCountry;
    if (xGeoCountry) return xGeoCountry;

    return 'unknown';
  }

  /**
   * Calculate fingerprint similarity (0.0 to 1.0)
   * @param {string} fingerprint1
   * @param {string} fingerprint2
   * @returns {number} Similarity score
   */
  static calculateSimilarity(fingerprint1, fingerprint2) {
    if (!fingerprint1 || !fingerprint2) return 0;

    const parts1 = fingerprint1.split('|');
    const parts2 = fingerprint2.split('|');

    let matches = 0;
    const maxLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
      if (parts1[i] === parts2[i]) matches++;
    }

    return matches / maxLen;
  }

  /**
   * Check if fingerprints are likely from same device
   * @param {string} fingerprint1
   * @param {string} fingerprint2
   * @returns {boolean}
   */
  static isSameDevice(fingerprint1, fingerprint2) {
    const similarity = this.calculateSimilarity(fingerprint1, fingerprint2);
    // Same device if 80%+ similarity
    return similarity >= 0.8;
  }
}

module.exports = DeviceFingerprintService;

const twilio = require('twilio');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

class PhoneVerificationService {
  constructor() {
    this.twilioClient = null;
    this.init();
  }

  init() {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

      if (accountSid && authToken && verifySid) {
        this.twilioClient = twilio(accountSid, authToken);
        this.verifySid = verifySid;
        console.log('✅ Twilio Phone Verification Service initialized');
      } else {
        console.warn('⚠️ Twilio credentials not configured. Phone verification disabled.');
      }
    } catch (error) {
      console.error('Failed to initialize Twilio:', error.message);
    }
  }

  /**
   * Validate and normalize phone number
   * @param {string} phoneNumber - Phone number to validate
   * @param {string} defaultCountry - Default country code (e.g., 'US')
   * @returns {object} { valid: boolean, formatted: string, e164: string, country: string, error?: string }
   */
  validatePhoneNumber(phoneNumber, defaultCountry = 'US') {
    try {
      const parsed = parsePhoneNumberFromString(phoneNumber, defaultCountry);
      if (!parsed || !parsed.isValid()) {
        return {
          valid: false,
          error: 'Invalid phone number format'
        };
      }
      return {
        valid: true,
        formatted: parsed.formatInternational(),
        e164: parsed.format('E.164'),
        country: parsed.country,
        countryCode: parsed.getCountryCode()
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Send verification code via SMS using Twilio Verify
   * @param {string} phoneNumber - E.164 format phone number
   * @returns {Promise<object>} { success: boolean, error?: string, sid?: string }
   */
  async sendVerificationCode(phoneNumber) {
    if (!this.twilioClient) {
      return {
        success: false,
        error: 'Twilio not configured'
      };
    }

    try {
      const verification = await this.twilioClient.verify.v2
        .services(this.verifySid)
        .verifications.create({
          to: phoneNumber,
          channel: 'sms'
        });

      console.log(`✅ Verification SMS sent to ${phoneNumber} (SID: ${verification.sid})`);
      return {
        success: true,
        sid: verification.sid
      };
    } catch (error) {
      console.error(`Failed to send verification SMS to ${phoneNumber}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify code submitted by user
   * @param {string} phoneNumber - E.164 format phone number
   * @param {string} code - Verification code (4-6 digits)
   * @returns {Promise<object>} { success: boolean, error?: string }
   */
  async verifyCode(phoneNumber, code) {
    if (!this.twilioClient) {
      return {
        success: false,
        error: 'Twilio not configured'
      };
    }

    try {
      const verificationCheck = await this.twilioClient.verify.v2
        .services(this.verifySid)
        .verificationChecks.create({
          to: phoneNumber,
          code: code.toString()
        });

      if (verificationCheck.status === 'approved') {
        console.log(`✅ Phone verification approved for ${phoneNumber}`);
        return {
          success: true
        };
      } else {
        return {
          success: false,
          error: 'Invalid or expired verification code'
        };
      }
    } catch (error) {
      console.error(`Verification check failed for ${phoneNumber}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send OTP via SMS (fallback method without Verify service)
   * @param {string} phoneNumber - E.164 format phone number
   * @param {string} code - OTP code
   * @returns {Promise<object>} { success: boolean, error?: string, messageId?: string }
   */
  async sendOTPMessage(phoneNumber, code) {
    if (!this.twilioClient) {
      return {
        success: false,
        error: 'Twilio not configured'
      };
    }

    try {
      const message = await this.twilioClient.messages.create({
        body: `Your Dream X verification code is: ${code}. This code expires in 15 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      console.log(`✅ OTP SMS sent to ${phoneNumber} (Message ID: ${message.sid})`);
      return {
        success: true,
        messageId: message.sid
      };
    } catch (error) {
      console.error(`Failed to send OTP to ${phoneNumber}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if Twilio is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.twilioClient;
  }
}

module.exports = new PhoneVerificationService();

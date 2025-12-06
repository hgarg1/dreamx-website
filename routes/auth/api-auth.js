const express = require('express');
// const cors = require('cors'); // Not needed for Android native apps (CORS is browser-only)
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const {
    getUserById,
    getUserByEmail,
    getUserByHandle,
    createUser,
    updatePassword,
    checkAccountStatus,
    createVerificationCode,
    getVerificationCode,
    markCodeAsVerified,
    markEmailAsVerified,
    deleteExpiredVerificationCodes,
    createPasswordResetToken,
    getPasswordResetToken,
    markPasswordResetUsed,
    deleteExpiredPasswordResetTokens,
    invalidateUserResetTokens,
    createOrUpdateSubscription,
    storeRefreshToken,
    getRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    cleanupExpiredTokens
} = require('../../db');
const emailService = require('../../services/emailService');
const { generateAccessToken, generateRefreshToken, hashRefreshToken, verifyAccessToken, getRefreshTokenExpiry } = require('../../utils/auth-tokens');
const { getRequestBaseUrl, validatePasswordComplexity } = require('../../utils/utils');

const router = express.Router();

module.exports = router;

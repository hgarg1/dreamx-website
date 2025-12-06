const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const passport = require('passport');
const {
    getUserById,
    getUserByEmail,
    getUserByHandle,
    getUserByProvider,
    createUser,
    updateUserProvider,
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
    addAuditLog,
    db
} = require('../../db');
const { resolvePostAuthRedirect, getRequestBaseUrl, validatePasswordComplexity } = require('../../utils/utils');
const emailService = require('../../services/emailService');

const router = express.Router();

module.exports = router;

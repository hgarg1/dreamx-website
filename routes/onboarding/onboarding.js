
function initOnboardingRoutes({ upload }) {
    const express = require('express');
    const { getUserById, updateOnboarding, db } = require('../../db');
    const { userNeedsOnboarding, resolvePostAuthRedirect } = require('../../utils/utils');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initOnboardingRoutes;

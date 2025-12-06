
function initServicesRoutes({ io }) {
    const express = require('express');
    const {
        getUserById,
        getAllServices,
        getService,
        createService,
        updateService,
        getServiceCount,
        getUserSubscription,
        getServiceReviews,
        getServiceRatingsSummary,
        addOrUpdateServiceReview,
        isVerifiedPurchaser,
        hideServiceReview,
        deleteServiceReview,
        restoreServiceReview,
        createNotification,
        getPaymentMethods,
        createInvoice,
        db
    } = require('../../db');
    const { getRequestBaseUrl } = require('../../utils/utils');
    const emailService = require('../../services/emailService');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initServicesRoutes;

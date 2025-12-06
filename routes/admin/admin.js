
function initAdminRoutes({ io, webpush }) {
    const express = require('express');
    const path = require('path');
    const bcrypt = require('bcrypt');
    const {
        getUserById,
        getAllUsers,
        getUsersPaged,
        getUsersCount,
        getUserByEmail,
        createUser,
        updateUserRole,
        updateAdminPermissions,
        getStats,
        getAuditLogsPaged,
        getCareerApplicationsPaged,
        getCareerJobsForAdmin,
        getHrTeam,
        getFollowerCount,
        getFollowingCount,
        checkAccountStatus,
        addAuditLog,
        createNotification,
        getRefundRequest,
        updateRefundRequestStatus,
        getUserAdminNotes,
        addUserAdminNote,
        banUser,
        suspendUser,
        unbanUser,
        hideComment,
        deleteComment,
        restoreComment,
        getPushSubscriptions,
        deletePushSubscription,
        getAllBlocksAndReports,
        getUserReports,
        updateReportStatus,
        lockUserBlockFunctionality,
        unlockUserBlockFunctionality,
        getSalesInquiryStats,
        getSalesInquiriesPaged,
        db
    } = require('../../db');
    const { getRequestBaseUrl } = require('../../utils/utils');
    const emailService = require('../../services/emailService');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initAdminRoutes;

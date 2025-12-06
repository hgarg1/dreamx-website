
function initProfileRoutes({ upload, io }) {
    const express = require('express');
    const {
        getUserById,
        getUserPosts,
        getUserReposts,
        getRepostInfo,
        getUserReactionForPost,
        getPostReactionsSummary,
        getFollowerCount,
        getFollowingCount,
        getUserServices,
        getUserSubscription,
        updateUserProfile,
        updateOnboarding,
        updateProfilePicture,
        updateBannerImage,
        followUser,
        unfollowUser,
        isFollowing,
        isUserBlocked,
        blockUser,
        unblockUser,
        getBlockedUsers,
        reportUser,
        createNotification,
        getProjectsByOwner,
        db
    } = require('../../db');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initProfileRoutes;

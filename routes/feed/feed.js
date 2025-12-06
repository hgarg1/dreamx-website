
function initFeedRoutes({ postUpload, io }) {
    const express = require('express');
    const path = require('path');
    const {
        getUserById,
        getFeedPosts,
        getUserReactionForPost,
        getFollowing,
        getRecentActivity,
        createPost,
        attachHashtagsToPost,
        attachTagsToPost,
        getPopularHashtags,
        getPopularTags,
        getPostById,
        getPostReactionsSummary,
        setPostReaction,
        getPostComments,
        getCommentsCount,
        addPostComment,
        toggleCommentLike,
        searchUsers,
        db
    } = require('../../db');
    const { getRequestBaseUrl } = require('../../utils/utils');
    const emailService = require('../../services/emailService');

    const router = express.Router();

    // ...move all route definitions here...
    // Example:
    // router.get('/feed', ...);
    // router.post('/feed/post', ...);
    // etc.

    return router;
}

module.exports = initFeedRoutes;

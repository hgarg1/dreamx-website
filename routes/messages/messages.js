
function initMessagesRoutes({ chatUpload, io }) {
    const express = require('express');
    const path = require('path');
    const {
        getUserById,
        getUserConversations,
        getConversationMessages,
        getConversationParticipants,
        getOrCreateConversation,
        createGroupConversation,
        isUserInConversation,
        createMessage,
        getMessageWithContext,
        markMessagesAsRead,
        setMessageReaction,
        getMessageReactions,
        getUserReactionForMessage,
        createNotification,
        isUserBlocked,
        searchUsers,
        db
    } = require('../../db');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initMessagesRoutes;

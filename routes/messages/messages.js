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

// Helper middleware
function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Initialize router with dependencies
function initMessagesRoutes({ chatUpload, io }) {
    // Start a chat with a user (create or open conversation) and redirect
    router.get('/messages/start/:userId', ensureAuthenticated, (req, res) => {
        const otherId = parseInt(req.params.userId, 10);
        if (isNaN(otherId) || otherId <= 0) return res.redirect('/messages');
        if (otherId === req.session.userId) return res.redirect('/messages');
        const conv = getOrCreateConversation({ user1Id: req.session.userId, user2Id: otherId });
        return res.redirect(`/messages?conversation=${conv.id}`);
    });

    // Messages page - Real messaging with database
    router.get('/messages', async (req, res) => {
        if (!req.session || !req.session.userId) return res.redirect('/login');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Get authenticated user
        const userRow = getUserById(req.session.userId);
        if (!userRow) return res.redirect('/login');
        
        const authUser = {
            id: userRow.id,
            displayName: userRow.full_name,
            email: userRow.email,
            role: userRow.role || 'user',
            profile_picture: userRow.profile_picture || null
        };

        const conversations = await getUserConversations(req.session.userId) || [];
        let currentConversation = null;
        let messages = [];
        let participants = [];
        let moderationTarget = null;
        let blockState = { viewerBlocked: false, blockedByOther: false };

        // Check if a specific conversation is requested (even if it has no messages yet)
        const requestedId = parseInt(req.query.conversation || '', 10);
        if (!isNaN(requestedId)) {
            // Try to find in existing conversations first
            currentConversation = conversations.find(c => c.id === requestedId);
            
            // If not found, check if it exists in database (might be new conversation with no messages)
            if (!currentConversation) {
                const conv = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(requestedId);
                const isParticipant = !conv ? false : (
                    conv.user1_id === req.session.userId ||
                    conv.user2_id === req.session.userId ||
                    (conv.is_group && !!(await db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').get(requestedId, req.session.userId)))
                );
                if (conv && isParticipant) {
                    // Get user info for direct conversations
                    if (!conv.is_group) {
                        const otherId = conv.user1_id === req.session.userId ? conv.user2_id : conv.user1_id;
                        const otherUser = getUserById(otherId);
                        if (otherUser) {
                            currentConversation = {
                                ...conv,
                                other_user_id: otherId,
                                other_user_name: otherUser.full_name,
                                other_user_picture: otherUser.profile_picture,
                                last_message: null,
                                last_message_time: null,
                                unread_count: 0
                            };
                        }
                    } else {
                        currentConversation = {
                            ...conv,
                            other_user_name: conv.group_name,
                            other_user_picture: null,
                            last_message: null,
                            last_message_time: null,
                            unread_count: 0
                        };
                    }
                }
            }
        }
        
        // If no specific conversation requested, use first from list
        if (!currentConversation && conversations.length > 0) {
            currentConversation = conversations[0];
        }
        
        if (currentConversation) {
            messages = await getConversationMessages(currentConversation.id);
            if (currentConversation.is_group) {
                participants = await getConversationParticipants(currentConversation.id);
            }
            if (!currentConversation.is_group) {
                const otherParticipantId = currentConversation.other_user_id || (currentConversation.user1_id === req.session.userId ? currentConversation.user2_id : currentConversation.user1_id);
                const otherUser = getUserById(otherParticipantId);
                if (otherUser) {
                    moderationTarget = {
                        id: otherUser.id,
                        full_name: otherUser.full_name,
                        account_status: otherUser.account_status || 'active',
                        suspension_until: otherUser.suspension_until || null,
                        chat_privileges_frozen: otherUser.chat_privileges_frozen === 1
                    };
                }
                blockState = {
                    viewerBlocked: isUserBlocked({ userId: req.session.userId, targetId: otherParticipantId }),
                    blockedByOther: isUserBlocked({ userId: otherParticipantId, targetId: req.session.userId })
                };
            }
            markMessagesAsRead({ conversationId: currentConversation.id, userId: req.session.userId });
            try {
                const reader = getUserById(req.session.userId);
                if (reader && reader.read_receipts === 1 && !currentConversation.is_group) {
                    const lastReadMessage = await db.prepare(`
                      SELECT MAX(id) as maxId
                      FROM messages
                      WHERE conversation_id = ? AND sender_id != ?
                    `).get(currentConversation.id, req.session.userId);
                    const lastReadMessageId = lastReadMessage && lastReadMessage.maxId ? lastReadMessage.maxId : null;
                    if (lastReadMessageId && io) {
                        io.to(`conversation-${currentConversation.id}`).emit('read-receipt', {
                            conversationId: currentConversation.id,
                            readerId: req.session.userId,
                            lastReadMessageId,
                            at: new Date().toISOString()
                        });
                    }
                }
            } catch (e) { /* noop */ }
        }

        res.render('user/messages', {
            title: 'Messages - Dream X',
            currentPage: 'messages',
            authUser,
            conversations: conversations || [],
            currentConversation,
            messages: messages || [],
            participants: participants || [],
            moderationTarget,
            blockState: blockState || { viewerBlocked: false, blockedByOther: false },
            currentUserId: req.session.userId
        });
    });

    // Create group conversation
    router.post('/messages/group/create', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const { participantIds, groupName } = req.body;
        if (!Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({ error: 'At least one participant required' });
        }
        try {
            const conv = createGroupConversation({
                creatorId: req.session.userId,
                participantIds: participantIds.map(id => parseInt(id, 10)),
                groupName: groupName || 'Group Chat'
            });
            res.json({ success: true, conversationId: conv.id });
        } catch (e) {
            console.error('Group creation error:', e);
            res.status(500).json({ error: 'Failed to create group' });
        }
    });

    // Update group name
    router.post('/messages/group/:conversationId/name', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const conversationId = parseInt(req.params.conversationId, 10);
        const { groupName } = req.body;

        if (!groupName || !groupName.trim()) {
            return res.status(400).json({ error: 'Group name required' });
        }

        if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        try {
            await db.prepare('UPDATE conversations SET group_name = ? WHERE id = ? AND is_group = 1').run(groupName.trim(), conversationId);
            res.json({ success: true });
        } catch (e) {
            console.error('Update group name error:', e);
            res.status(500).json({ error: 'Failed to update group name' });
        }
    });

    // Add member to group
    router.post('/messages/group/:conversationId/add', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const conversationId = parseInt(req.params.conversationId, 10);
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        try {
            const existing = await db.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
            if (existing) {
                return res.status(400).json({ error: 'User is already in this group' });
            }

            await db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userId);
            res.json({ success: true });
        } catch (e) {
            console.error('Add member error:', e);
            res.status(500).json({ error: 'Failed to add member' });
        }
    });

    // Remove member from group
    router.post('/messages/group/:conversationId/remove', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const conversationId = parseInt(req.params.conversationId, 10);
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        try {
            await db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(conversationId, userId);
            res.json({ success: true });
        } catch (e) {
            console.error('Remove member error:', e);
            res.status(500).json({ error: 'Failed to remove member' });
        }
    });

    // Leave group
    router.post('/messages/group/:conversationId/leave', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const conversationId = parseInt(req.params.conversationId, 10);

        if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        try {
            await db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(conversationId, req.session.userId);
            res.json({ success: true });
        } catch (e) {
            console.error('Leave group error:', e);
            res.status(500).json({ error: 'Failed to leave group' });
        }
    });

    // Get conversation messages API (for switching conversations)
    router.get('/api/messages/:conversationId', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const { conversationId } = req.params;
        const messages = await getConversationMessages(conversationId);
        await markMessagesAsRead({ conversationId, userId: req.session.userId });

        res.json({ messages, userId: req.session.userId });
    });

    // Start or get a conversation with a user, then redirect
    router.get('/messages/start/:userId', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const otherId = parseInt(req.params.userId, 10);
        if (!otherId || isNaN(otherId) || otherId === req.session.userId) return res.redirect('/messages');
        const target = getUserById(otherId);
        if (target && (target.allow_messages_from || 'everyone') === 'no_one') {
            return res.redirect('/messages?error=User+is+not+accepting+messages');
        }
        const conv = getOrCreateConversation({ user1Id: req.session.userId, user2Id: otherId });
        res.redirect(`/messages?conversation=${conv.id}`);
    });

    // User search API for feed search box
    router.get('/api/users/search', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ results: [] });
        try {
            const results = await searchUsers({ query: q, limit: 10, excludeUserId: req.session.userId });
            res.json({ results });
        } catch (e) {
            console.error('User search error:', e);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    // Send message API (supports optional single or multiple file attachments)
    router.post('/api/messages/send', chatUpload.any(), async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const sender = getUserById(req.session.userId);
            if (sender && sender.chat_privileges_frozen === 1) {
                return res.status(403).json({ error: 'Chat privileges are currently frozen by an admin.' });
            }
        } catch (e) { /* ignore and continue */ }

        const conversationId = parseInt(req.body.conversationId, 10);
        const replyToMessageId = req.body.replyToMessageId ? parseInt(req.body.replyToMessageId, 10) : null;
        const content = (req.body.content || '').trim();
        let files = Array.isArray(req.files) ? req.files : [];
        files = files.filter(f => (f.fieldname === 'file' || f.fieldname === 'files' || f.fieldname === 'files[]'));

        if ((!content || content.length === 0) && files.length === 0) {
            return res.status(400).json({ error: 'Message must include text or a file' });
        }

        if (!isUserInConversation({ conversationId, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        const conv = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        let replyContext = null;
        if (replyToMessageId) {
            replyContext = await db.prepare('SELECT id, conversation_id FROM messages WHERE id = ?').get(replyToMessageId);
            if (!replyContext || replyContext.conversation_id !== conversationId) {
                return res.status(400).json({ error: 'Invalid reply target' });
            }
        }

        if (!conv.is_group) {
            const otherId = (conv.user1_id === req.session.userId) ? conv.user2_id : conv.user1_id;
            const other = getUserById(otherId);
            if (other && (other.allow_messages_from || 'everyone') === 'no_one' && otherId !== req.session.userId) {
                return res.status(403).json({ error: 'Recipient is not accepting messages' });
            }
        }

        const createdMessageIds = [];
        const createdPayloads = [];

        if (content && content.length > 0) {
            const messageId = createMessage({
                conversationId,
                senderId: req.session.userId,
                content,
                attachmentUrl: null,
                attachmentMime: null,
                replyToMessageId
            });
            createdMessageIds.push(messageId);
            const payload = await getMessageWithContext(messageId) || {
                id: messageId,
                conversation_id: conversationId,
                sender_id: req.session.userId,
                content,
                attachment_url: null,
                attachment_mime: null,
                reply_to_message_id: replyToMessageId,
                created_at: new Date().toISOString()
            };
            createdPayloads.push(payload);
            if (io) {
                io.to(`conversation-${conversationId}`).emit('new-message', payload);
            }
        }

        for (const f of files) {
            // Use path from storage adapter (includes folder), fallback to filename for backward compatibility
            const attachmentUrl = f.url || `/uploads/${f.path || `chat/${f.filename}`}`;
            const attachmentMime = f.mimetype;
            const messageId = createMessage({
                conversationId,
                senderId: req.session.userId,
                content: '',
                attachmentUrl,
                attachmentMime,
                replyToMessageId: replyToMessageId && !content ? replyToMessageId : null
            });
            createdMessageIds.push(messageId);
            const payload = await getMessageWithContext(messageId) || {
                id: messageId,
                conversation_id: conversationId,
                sender_id: req.session.userId,
                content: '',
                attachment_url: attachmentUrl,
                attachment_mime: attachmentMime,
                reply_to_message_id: replyToMessageId,
                created_at: new Date().toISOString()
            };
            createdPayloads.push(payload);
            if (io) {
                io.to(`conversation-${conversationId}`).emit('new-message', payload);
            }
        }

        const participants = getConversationParticipants(conversationId);
        const sender = getUserById(req.session.userId);

        participants.forEach(participant => {
            if (participant.user_id !== req.session.userId) {
                const notifTitle = conv.is_group
                    ? `New message in ${conv.group_name || 'Group Chat'}`
                    : `New message from ${sender.full_name}`;
                const notifMessage = content || (files.length > 1 ? `📎 Sent ${files.length} attachments` : '📎 Sent an attachment');

                createNotification({
                    userId: participant.user_id,
                    type: 'message',
                    title: notifTitle,
                    message: notifMessage,
                    link: `/messages?conversation=${conversationId}`
                });

                if (io) {
                    io.to(`user-${participant.user_id}`).emit('notification', {
                        type: 'message',
                        title: notifTitle,
                        message: notifMessage,
                        link: `/messages?conversation=${conversationId}`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        res.json({ success: true, messageIds: createdMessageIds, messages: createdPayloads });
    });

    // Protected file download
    router.get('/uploads/:filename', async (req, res) => {
        if (!req.session.userId) return res.status(401).send('Unauthorized');
        const filename = req.params.filename;
        if (filename.startsWith('chat-')) {
            const msg = await db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url = ?`).get(`/uploads/${filename}`);
            if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
                return res.status(403).send('Forbidden');
            }
        }
        res.sendFile(path.join(__dirname, '..', 'public', 'uploads', filename));
    });

    // Mark messages as read
    router.post('/api/messages/:conversationId/read', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const conversationId = parseInt(req.params.conversationId);
        markMessagesAsRead({ conversationId, userId: req.session.userId });
        try {
            const conv = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
            if (conv && !conv.is_group) {
                const reader = getUserById(req.session.userId);
                if (reader && reader.read_receipts === 1) {
                    const lastReadMessage = await db.prepare(`
                      SELECT MAX(id) as maxId
                      FROM messages
                      WHERE conversation_id = ? AND sender_id != ?
                    `).get(conversationId, req.session.userId);
                    const lastReadMessageId = lastReadMessage && lastReadMessage.maxId ? lastReadMessage.maxId : null;
                    if (lastReadMessageId && io) {
                        io.to(`conversation-${conversationId}`).emit('read-receipt', {
                            conversationId,
                            readerId: req.session.userId,
                            lastReadMessageId,
                            at: new Date().toISOString()
                        });
                    }
                }
            }
        } catch (e) { /* noop */ }

        res.json({ success: true });
    });

    // React to a message
    router.post('/api/messages/:messageId/react', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const messageId = parseInt(req.params.messageId);
        const { reactionType = 'like' } = req.body;

        const msg = await db.prepare('SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.id = ?').get(messageId);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if (!isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const result = setMessageReaction({ messageId, userId: req.session.userId, reactionType });

        if (io) {
            io.to(`conversation-${msg.conversation_id}`).emit('message-reaction', {
                conversationId: msg.conversation_id,
                messageId,
                userId: req.session.userId,
                status: result.status,
                counts: result.counts,
                reactionCounts: result.counts
            });
        }

        if (result.status !== 'cleared' && msg.sender_id !== req.session.userId) {
            const reactor = getUserById(req.session.userId);
            createNotification({
                userId: msg.sender_id,
                type: 'reaction',
                title: 'Message reaction',
                message: `${reactor.full_name} reacted ${reactionType} to your message`,
                link: `/messages?conversation=${msg.conversation_id}`
            });

            if (io) {
                io.to(`user-${msg.sender_id}`).emit('notification', {
                    type: 'reaction',
                    title: 'Message reaction',
                    message: `${reactor.full_name} reacted ${reactionType} to your message`,
                    link: `/messages?conversation=${msg.conversation_id}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        res.json({ success: true, ...result });
    });

    // Get reactions for a message
    router.get('/api/messages/:messageId/reactions', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

        const messageId = parseInt(req.params.messageId);
        const reactions = getMessageReactions(messageId);
        const userReaction = getUserReactionForMessage({ messageId, userId: req.session.userId });

        res.json({ reactions, userReaction });
    });

    return router;
}

module.exports = initMessagesRoutes;


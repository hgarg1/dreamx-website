const express = require('express');
const router = express.Router();
const {
    createLivestream, getLivestream, getActiveLivestreams,
    getUserLivestreams, startLivestream, endLivestream,
    addLivestreamViewer, removeLivestreamViewer, getLivestreamViewers,
    updateLivestreamPeakViewers, addLivestreamChatMessage, getLivestreamChat
} = require('../../db');
const livestreamServices = require('../../services/livestream');

function initLivestreamRoutes({ io }) {
    // Create a new livestream
    router.post('/api/livestream/create', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const { title, description, recordingEnabled } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Title is required' });
            }

            const result = createLivestream({
                userId: req.session.userId,
                title,
                description,
                recordingEnabled: recordingEnabled ? 1 : 0
            });

            res.json({
                success: true,
                streamId: result.id,
                streamKey: result.streamKey
            });
        } catch (error) {
            console.error('Error creating livestream:', error);
            res.status(500).json({ error: 'Failed to create livestream' });
        }
    });

    // Get active livestreams
    router.get('/api/livestream/active', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            const streams = getActiveLivestreams({ limit, offset });
            res.json({ streams });
        } catch (error) {
            console.error('Error fetching active streams:', error);
            res.status(500).json({ error: 'Failed to fetch streams' });
        }
    });

    // Get user's livestreams
    router.get('/api/livestream/user/:userId', (req, res) => {
        try {
            const userId = parseInt(req.params.userId);
            const streams = getUserLivestreams(userId);
            res.json({ streams });
        } catch (error) {
            console.error('Error fetching user streams:', error);
            res.status(500).json({ error: 'Failed to fetch streams' });
        }
    });

    // Get livestream details
    router.get('/api/livestream/:streamId', (req, res) => {
        try {
            const streamId = parseInt(req.params.streamId);
            const stream = getLivestream(streamId);

            if (!stream) {
                return res.status(404).json({ error: 'Stream not found' });
            }

            res.json({ stream });
        } catch (error) {
            console.error('Error fetching stream:', error);
            res.status(500).json({ error: 'Failed to fetch stream' });
        }
    });

    // Start livestream
    router.post('/api/livestream/:streamId/start', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const streamId = parseInt(req.params.streamId);
            const stream = getLivestream(streamId);

            if (!stream) {
                return res.status(404).json({ error: 'Stream not found' });
            }

            if (stream.user_id !== req.session.userId) {
                return res.status(403).json({ error: 'Not authorized to start this stream' });
            }

            startLivestream(streamId);

            res.json({ success: true, message: 'Stream started' });
        } catch (error) {
            console.error('Error starting stream:', error);
            res.status(500).json({ error: 'Failed to start stream' });
        }
    });

    // End livestream
    router.post('/api/livestream/:streamId/end', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const streamId = parseInt(req.params.streamId);
            const { recordingUrl } = req.body;
            const stream = getLivestream(streamId);

            if (!stream) {
                return res.status(404).json({ error: 'Stream not found' });
            }

            if (stream.user_id !== req.session.userId) {
                return res.status(403).json({ error: 'Not authorized to end this stream' });
            }

            endLivestream({ streamId, recordingUrl });

            res.json({ success: true, message: 'Stream ended' });
        } catch (error) {
            console.error('Error ending stream:', error);
            res.status(500).json({ error: 'Failed to end stream' });
        }
    });

    // Join livestream as viewer
    router.post('/api/livestream/:streamId/join', (req, res) => {
        try {
            const streamId = parseInt(req.params.streamId);
            const userId = req.session.userId || null;

            const stream = getLivestream(streamId);

            if (!stream) {
                return res.status(404).json({ error: 'Stream not found' });
            }

            if (stream.status !== 'live') {
                return res.status(400).json({ error: 'Stream is not live' });
            }

            addLivestreamViewer({ streamId, userId });

            // Update peak viewer count
            const viewers = getLivestreamViewers(streamId);
            updateLivestreamPeakViewers({ streamId, count: viewers.length });

            res.json({
                success: true,
                iceServers: livestreamServices.webrtc.getIceServers()
            });
        } catch (error) {
            console.error('Error joining stream:', error);
            res.status(500).json({ error: 'Failed to join stream' });
        }
    });

    // Leave livestream
    router.post('/api/livestream/:streamId/leave', (req, res) => {
        try {
            const streamId = parseInt(req.params.streamId);
            const userId = req.session.userId;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            removeLivestreamViewer({ streamId, userId });

            res.json({ success: true });
        } catch (error) {
            console.error('Error leaving stream:', error);
            res.status(500).json({ error: 'Failed to leave stream' });
        }
    });

    // Get livestream chat
    router.get('/api/livestream/:streamId/chat', (req, res) => {
        try {
            const streamId = parseInt(req.params.streamId);
            const limit = parseInt(req.query.limit) || 100;
            const offset = parseInt(req.query.offset) || 0;

            const messages = getLivestreamChat({ streamId, limit, offset });
            res.json({ messages });
        } catch (error) {
            console.error('Error fetching chat:', error);
            res.status(500).json({ error: 'Failed to fetch chat' });
        }
    });

    // Send chat message
    router.post('/api/livestream/:streamId/chat', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const streamId = parseInt(req.params.streamId);
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({ error: 'Message is required' });
            }

            const messageId = addLivestreamChatMessage({
                streamId,
                userId: req.session.userId,
                message
            });

            // Emit chat message via Socket.IO
            if (io) {
                io.to(`livestream_${streamId}`).emit('chat:message', {
                    id: messageId,
                    userId: req.session.userId,
                    message,
                    timestamp: new Date()
                });
            }

            res.json({ success: true, messageId });
        } catch (error) {
            console.error('Error sending chat message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    return router;
}

module.exports = initLivestreamRoutes;

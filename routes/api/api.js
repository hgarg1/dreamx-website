const express = require('express');
const { 
    getUserById, createNotification, savePushSubscription, deletePushSubscription, 
    createCareerApplication, addAuditLog, db,
    getUserNotifications, getUnreadNotificationCount, markNotificationAsRead, markAllNotificationsAsRead
} = require('../../db');
const emailService = require('../../services/emailService');

// Import security middleware
const { apiLimiter, uploadLimiter } = require('../../middleware/security');

const router = express.Router();

// Initialize router with dependencies
function initApiRoutes({ io, careerUpload }) {
    // Get user notifications
    router.get('/api/notifications', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
        try {
            const limit = parseInt(req.query.limit || 50, 10);
            const offset = parseInt(req.query.offset || 0, 10);
            const notifications = getUserNotifications(req.session.userId, limit, offset);
            const unreadCount = getUnreadNotificationCount(req.session.userId);
            res.json({ success: true, notifications, unreadCount });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({ error: 'Failed to fetch notifications' });
        }
    });

    // Mark notification as read
    router.post('/api/notifications/:id/read', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
        try {
            const notifId = parseInt(req.params.id, 10);
            markNotificationAsRead(notifId, req.session.userId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({ error: 'Failed to mark as read' });
        }
    });

    // Mark all notifications as read
    router.post('/api/notifications/read-all', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
        try {
            markAllNotificationsAsRead(req.session.userId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking all as read:', error);
            res.status(500).json({ error: 'Failed to mark all as read' });
        }
    });

    // Push notification public key
    router.get('/api/push/public-key', (req, res) => {
        res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
    });

    // Subscribe to push notifications
    router.post('/api/push/subscribe', express.json(), (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
        try {
            const { endpoint, keys } = req.body;
            if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
                return res.status(400).json({ error: 'Invalid subscription data' });
            }
            savePushSubscription({
                userId: req.session.userId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth
            });
            res.json({ success: true });
        } catch (error) {
            console.error('Error saving push subscription:', error);
            res.status(500).json({ error: 'Failed to save push subscription' });
        }
    });

    // Unsubscribe from push
    router.post('/api/push/unsubscribe', express.json(), (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
        try {
            const { endpoint } = req.body;
            if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
            deletePushSubscription(endpoint);
            res.json({ success: true });
        } catch (error) {
            console.error('Error unsubscribing from push:', error);
            res.status(500).json({ error: 'Failed to unsubscribe' });
        }
    });

    // Submit career application
    router.post('/api/careers/apply', careerUpload.fields([{ name: 'resumeFile', maxCount: 1 }, { name: 'portfolioFile', maxCount: 1 }]), async (req, res) => {
        try {
            const { position, name, email, phone, coverLetter } = req.body;
            if (!position || !name || !email || !coverLetter) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            const resumeFileObj = req.files && req.files.resumeFile && req.files.resumeFile[0];
            const portfolioFileObj = req.files && req.files.portfolioFile && req.files.portfolioFile[0];
            const resumeFile = resumeFileObj ? (resumeFileObj.url || `/uploads/${resumeFileObj.path || `careers/${resumeFileObj.filename}`}`) : null;
            const portfolioFile = portfolioFileObj ? (portfolioFileObj.url || `/uploads/${portfolioFileObj.path || `careers/${portfolioFileObj.filename}`}`) : null;
            const id = createCareerApplication({ position, name, email, phone, coverLetter, resumeFile, portfolioFile });
            try { addAuditLog({ userId: req.session.userId || null, action: 'career_application_submitted', details: JSON.stringify({ id, email, position }) }); } catch (e) { }

            try {
                await emailService.sendCareerApplicationEmail(email, name, position, req);
            } catch (emailError) {
                console.error('Failed to send career application confirmation:', emailError);
            }

            res.json({ success: true, message: 'Your application has been submitted successfully. We will review it and get back to you soon.', applicationId: `JOB-${id}` });
        } catch (error) {
            console.error('Error processing career application:', error);
            res.status(500).json({ error: 'Failed to submit application' });
        }
    });

    // Get user profile counts
    router.get('/api/users/:userId/profile-counts', (req, res) => {
        try {
            const userId = parseInt(req.params.userId, 10);
            const postsCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId).count;
            const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services WHERE user_id = ?').get(userId).count;
            res.json({
                success: true,
                posts: postsCount,
                services: servicesCount
            });
        } catch (error) {
            console.error('Error fetching profile counts:', error);
            res.status(500).json({ error: 'Failed to fetch profile counts' });
        }
    });

    return router;
}

module.exports = initApiRoutes;


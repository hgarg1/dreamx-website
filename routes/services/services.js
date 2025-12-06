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
const { getRequestBaseUrl } = require('../../utils/route-helpers');
const emailService = require('../../services/emailService');

const router = express.Router();

// Helper functions
function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

const isAdmin = (user) => user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';

// Initialize router with dependencies
function initServicesRoutes({ io }) {
    // Services marketplace page
    router.get('/services', (req, res) => {
        const categories = [
            'Tutoring',
            'Mentorship',
            'Coaching',
            'Workshops',
            'Consulting',
            'Design Services',
            'Development',
            'Writing & Content',
            'Marketing & SEO',
            'Video & Photography',
            'Audio & Music',
            'Business Strategy',
            'Legal Services',
            'Financial Planning',
            'Health & Wellness',
            'Language Learning',
            'Career Services',
            'Data & Analytics',
            'Virtual Assistance',
            'Project Management',
            'Other'
        ];
        const { category, priceRange, experience, format } = req.query;

        const services = getAllServices({
            category,
            priceRange,
            experienceLevel: experience,
            format,
            limit: 100
        });

        const authUserId = req.session.userId || null;
        const authUser = authUserId ? getUserById(authUserId) : null;

        res.render('services/services', {
            title: 'Services Marketplace - Dream X',
            currentPage: 'services',
            categories,
            services,
            authUser
        });
    });

    // Create service page
    router.get('/services/new', ensureAuthenticated, (req, res) => {
        const authUser = getUserById(req.session.userId);
        res.render('services/create-service', {
            title: 'Create Service - Dream X',
            currentPage: 'services',
            authUser
        });
    });

    // Service details page
    router.get('/services/:id', (req, res) => {
        const { id } = req.params;
        const service = getService(id);

        if (!service) {
            return res.status(404).render('404', { title: 'Service Not Found' });
        }

        service.pricePerSession = (service.price_per_hour * (service.duration_minutes / 60)).toFixed(2);
        service.name = service.title;
        service.provider = {
            name: service.full_name,
            passion: service.category
        };
        service.rating = service.rating_avg || 0;
        service.reviewsCount = service.rating_count || 0;
        service.about = service.description;
        service.included = [
            `${service.duration_minutes}-minute live session`,
            'Personalized feedback & refactor suggestions',
            'Actionable next steps roadmap',
            'Follow-up summary notes'
        ];
        service.idealFor = [
            'Self-taught developers seeking structure',
            'Junior engineers preparing for interviews',
            'Makers refining MVP architecture'
        ];

        let reviews = [];
        try {
            const authUserId = req.session.userId || null;
            const authUser = authUserId ? getUserById(authUserId) : null;
            const isAdminUser = authUser && ['admin', 'super_admin', 'global_admin'].includes(authUser.role);
            reviews = db.getServiceReviews({ serviceId: id, limit: 20, offset: 0, isAdmin: isAdminUser }).map(r => ({
                id: r.id,
                user: r.full_name,
                rating: r.rating,
                comment: r.comment,
                profile_picture: r.profile_picture
            }));
        } catch (e) { reviews = []; }

        const authUserId = req.session.userId || null;
        const isOwner = authUserId ? (Number(service.user_id) === Number(authUserId)) : false;
        let canReview = false;
        if (authUserId && !isOwner) {
            try {
                canReview = isVerifiedPurchaser({ serviceId: Number(id), userId: authUserId });
            } catch (e) { canReview = false; }
        }

        res.render('services/service-details', {
            title: `${service.name} - Service - Dream X`,
            currentPage: 'services',
            service,
            reviews,
            canReview,
            isOwner,
            authUser: authUserId ? getUserById(authUserId) : null
        });
    });

    // Edit service (owner)
    router.get('/services/:id/edit', ensureAuthenticated, (req, res) => {
        const { id } = req.params;
        const service = getService(id);
        if (!service) return res.status(404).render('404', { title: 'Service Not Found' });
        if (Number(service.user_id) !== Number(req.session.userId) && !isAdmin(getUserById(req.session.userId))) {
            return res.redirect(`/services/${id}`);
        }
        const authUser = getUserById(req.session.userId);
        res.render('services/edit-service', { title: `Edit Service - ${service.title}`, currentPage: 'services', service, authUser });
    });

    router.post('/services/:id/edit', ensureAuthenticated, (req, res) => {
        const { id } = req.params;
        const service = getService(id);
        if (!service) return res.redirect('/services');
        const me = getUserById(req.session.userId);
        const isOwner = Number(service.user_id) === Number(req.session.userId);
        const canAdminEdit = isSuperAdmin(me) || isGlobalAdmin(me);
        const allowed = ['title', 'description', 'category', 'pricePerHour', 'durationMinutes', 'experienceLevel', 'format', 'availability', 'location', 'tags'];
        const payload = {};
        for (const k of allowed) if (k in req.body) payload[k] = req.body[k];
        if (isOwner) {
            const ok = updateService({
                serviceId: Number(id), userId: req.session.userId,
                title: payload.title || service.title,
                description: payload.description || service.description,
                category: payload.category || service.category,
                pricePerHour: payload.pricePerHour ? parseFloat(payload.pricePerHour) : service.price_per_hour,
                durationMinutes: payload.durationMinutes ? parseInt(payload.durationMinutes) : service.duration_minutes,
                experienceLevel: payload.experienceLevel ?? service.experience_level,
                format: payload.format || service.format,
                availability: payload.availability ?? service.availability,
                location: payload.location ?? service.location,
                tags: payload.tags ?? service.tags,
                imageUrl: service.image_url || null
            });
            return res.redirect(ok ? `/services/${id}` : `/services/${id}/edit?error=Update+failed`);
        }
        if (canAdminEdit) {
            const ok = require('../../db').adminUpdateServiceContent({
                serviceId: Number(id),
                fields: {
                    title: payload.title || service.title,
                    description: payload.description || service.description,
                    category: payload.category || service.category,
                    price_per_hour: payload.pricePerHour ? parseFloat(payload.pricePerHour) : service.price_per_hour,
                    duration_minutes: payload.durationMinutes ? parseInt(payload.durationMinutes) : service.duration_minutes,
                    experience_level: payload.experienceLevel ?? service.experience_level,
                    format: payload.format || service.format,
                    availability: payload.availability ?? service.availability,
                    location: payload.location ?? service.location,
                    tags: payload.tags ?? service.tags
                }
            });
            return res.redirect(ok ? `/services/${id}` : `/services/${id}/edit?error=Admin+update+failed`);
        }
        return res.redirect(`/services/${id}`);
    });

    // Book a service
    router.post('/services/:id/book', ensureAuthenticated, (req, res) => {
        const serviceId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        try {
            const s = getService(serviceId);
            if (!s) return res.status(404).json({ success: false, error: 'Service not found' });
            if (Number(s.user_id) === Number(userId)) return res.status(400).json({ success: false, error: 'Cannot book your own service' });

            const methods = getPaymentMethods(userId) || [];
            const hasCard = methods.length > 0;
            const user = getUserById(userId);
            const hasBank = !!(user && user.bank_account_number && user.bank_routing_number);
            if (!hasCard && !hasBank) {
                return res.status(402).json({
                    success: false,
                    requirePayment: true,
                    error: 'Payment method required to complete booking.'
                });
            }

            const sessionLength = parseInt((req.body.sessionLength || s.duration_minutes), 10);
            const hours = Math.max(0.5, (sessionLength || 60) / 60);
            const amount = Math.round((s.price_per_hour * hours) * 100) / 100;

            const orderId = require('../../db').addServiceOrder({ serviceId, buyerId: userId, status: 'completed' });
            try {
                createInvoice({ userId, amount, tier: 'service-booking', status: 'paid' });
            } catch (e) { /* non-blocking */ }
            return res.json({ success: true, orderId, amount });
        } catch (e) {
            console.error('book service error', e);
            return res.status(500).json({ success: false, error: 'Booking failed' });
        }
    });

    // API: Check service creation eligibility
    router.get('/api/services/check-eligibility', ensureAuthenticated, (req, res) => {
        try {
            const userId = req.session.userId;
            const user = getUserById(userId);
            if (user.seller_privileges_frozen === 1) {
                return res.json({
                    success: false,
                    canCreate: false,
                    frozen: true,
                    error: 'Your seller privileges have been frozen by an administrator.'
                });
            }

            const subscription = getUserSubscription(userId);
            const tier = subscription ? subscription.tier : 'free';

            const serviceLimits = {
                'free': 0,
                'pro-buyer': 0,
                'pro-seller': 5,
                'elite-seller': 999,
                'enterprise': 999
            };

            const currentCount = getServiceCount(userId);
            const maxServices = serviceLimits[tier] || 0;

            res.json({
                success: true,
                canCreate: currentCount < maxServices,
                tier,
                currentCount,
                maxServices,
                nearLimit: currentCount >= maxServices * 0.8
            });
        } catch (error) {
            console.error('Error checking eligibility:', error);
            res.status(500).json({ success: false, error: 'Failed to check eligibility' });
        }
    });

    // API: Create service with subscription check
    router.post('/api/services/create', ensureAuthenticated, async (req, res) => {
        try {
            const userId = req.session.userId;
            const { title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags } = req.body;

            const user = getUserById(userId);
            if (user.seller_privileges_frozen === 1) {
                return res.json({
                    success: false,
                    error: 'Your seller privileges have been frozen by an administrator. Please contact support.',
                    frozen: true
                });
            }

            const subscription = getUserSubscription(userId);
            const tier = subscription ? subscription.tier : 'free';

            const serviceLimits = {
                'free': 0,
                'pro-buyer': 0,
                'pro-seller': 5,
                'elite-seller': 999,
                'enterprise': 999
            };

            const currentCount = getServiceCount(userId);
            const maxServices = serviceLimits[tier] || 0;

            if (currentCount >= maxServices) {
                return res.json({
                    success: false,
                    error: 'Service limit reached',
                    requiresUpgrade: true,
                    currentTier: tier,
                    currentCount,
                    maxServices
                });
            }

            if (!title || !description || !category || !pricePerHour || !format) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            const serviceId = createService({
                userId,
                title,
                description,
                category,
                pricePerHour: parseFloat(pricePerHour),
                durationMinutes: parseInt(durationMinutes) || 60,
                experienceLevel,
                format,
                availability,
                location,
                tags,
                imageUrl: null
            });

            res.json({ success: true, serviceId });
        } catch (error) {
            console.error('Error creating service:', error);
            res.status(500).json({ success: false, error: 'Failed to create service' });
        }
    });

    // API: Service reviews
    router.get('/api/services/:id/reviews', (req, res) => {
        const serviceId = parseInt(req.params.id, 10);
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
        const offset = parseInt(req.query.offset || '0', 10);
        try {
            const authUserId = req.session.userId || null;
            const authUser = authUserId ? getUserById(authUserId) : null;
            const isAdminUser = authUser && ['admin', 'super_admin', 'global_admin'].includes(authUser.role);
            const reviews = getServiceReviews({ serviceId, limit, offset, isAdmin: isAdminUser });
            const summary = getServiceRatingsSummary(serviceId);
            res.json({ success: true, reviews, summary });
        } catch (e) {
            console.error('list service reviews error', e);
            res.status(500).json({ success: false, error: 'Failed to load reviews' });
        }
    });

    router.post('/api/services/:id/reviews', ensureAuthenticated, async (req, res) => {
        const serviceId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!(r >= 1 && r <= 5)) return res.status(400).json({ success: false, error: 'Invalid rating' });
        try {
            const service = getService(serviceId);
            if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
            if (Number(service.user_id) === Number(userId)) return res.status(403).json({ success: false, error: 'Owners cannot review their own service' });
            const verified = isVerifiedPurchaser({ serviceId, userId });
            if (!verified) return res.status(403).json({ success: false, error: 'Only verified purchasers can review' });

            const reviewId = addOrUpdateServiceReview({ serviceId, userId, rating: r, comment: (comment || '').trim() });

            try {
                const owner = getUserById(service.user_id);
                const reviewer = getUserById(userId);
                createNotification({
                    userId: service.user_id,
                    type: 'service_review',
                    title: 'New service review',
                    message: `${reviewer.full_name} rated your service ${r}★`,
                    link: `/services/${serviceId}`
                });
                if (io) {
                    io.to(`user-${service.user_id}`).emit('notification', {
                        type: 'service_review',
                        title: 'New service review',
                        message: `${reviewer.full_name} rated your service ${r}★`,
                        link: `/services/${serviceId}`,
                        timestamp: new Date().toISOString()
                    });
                }
                if (owner && owner.email_notifications === 1) {
                    const baseUrl = getRequestBaseUrl(req);
                    await emailService.sendServiceReviewEmail(owner, reviewer, service, r, (comment || ''), baseUrl, req);
                }
            } catch (e) { /* noop */ }

            const summary = getServiceRatingsSummary(serviceId);
            res.json({ success: true, reviewId, summary });
        } catch (e) {
            console.error('add service review error', e);
            res.status(500).json({ success: false, error: 'Failed to submit review' });
        }
    });

    // Moderate service review (admin only)
    router.post('/api/reviews/:id/moderate', ensureAuthenticated, (req, res) => {
        const reviewId = parseInt(req.params.id, 10);
        const { action } = req.body;
        const moderatorId = req.session.userId;

        try {
            const moderator = getUserById(moderatorId);
            if (!moderator || !['admin', 'super_admin', 'global_admin'].includes(moderator.role)) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }

            if (action === 'hide') {
                hideServiceReview({ reviewId, moderatorId });
            } else if (action === 'delete') {
                deleteServiceReview({ reviewId, moderatorId });
            } else if (action === 'restore') {
                restoreServiceReview({ reviewId, moderatorId });
            } else {
                return res.status(400).json({ success: false, error: 'Invalid action' });
            }

            res.json({ success: true });
        } catch (e) {
            console.error('moderate service review error', e);
            res.status(500).json({ success: false, error: 'Failed to moderate review' });
        }
    });

    return router;
}

module.exports = initServicesRoutes;


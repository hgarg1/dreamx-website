const express = require('express');
const { getUserById, getUserSubscription, saveUserLocation, getUserLocation, getAllUserLocations, shouldUpdateLocation, getUnreadMessageCount, getPublicCareerJobs, db, createSalesInquiry, addAuditLog, getPricingTiers, checkAccountStatus, createContentAppeal, createAccountAppeal, getUserCharges, getUserRefundRequests, createRefundRequest } = require('../../db');
const { email: emailService } = require('../../services');

const router = express.Router();

function ensureAuthenticated(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// Helper to prevent caching of pages that need fresh session data
function preventCache(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}

// Initialize router with dependencies
function initMiscRoutes() {
    // Map page
    router.get('/map', preventCache, ensureAuthenticated, (req, res) => {
        if (!req.session || !req.session.userId) return res.redirect('/login');
        const authUser = getUserById(req.session.userId);
        if (!authUser) return res.redirect('/login');

        const needsLocationUpdate = shouldUpdateLocation(req.session.userId);
        const userLocations = getAllUserLocations();
        const userLocation = getUserLocation(req.session.userId);

        res.render('static/map', {
            title: 'Map - Dream X',
            currentPage: 'map',
            authUser: {
                ...authUser,
                displayName: authUser.full_name,
                role: authUser.role
            },
            unreadMessageCount: getUnreadMessageCount(req.session.userId),
            userLocations: JSON.stringify(userLocations),
            currentUserLocation: userLocation ? JSON.stringify(userLocation) : null,
            needsLocationUpdate,
            mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || ''
        });
    });

    // Save user location
    router.post('/location', ensureAuthenticated, (req, res) => {
        try {
            const { city, latitude, longitude } = req.body;

            if (!city || !latitude || !longitude) {
                return res.status(400).json({ error: 'City, latitude, and longitude are required' });
            }

            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return res.status(400).json({ error: 'Invalid latitude or longitude values' });
            }

            const sanitizedCity = city.trim().substring(0, 100);

            if (!req.session || !req.session.userId) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            saveUserLocation({
                userId: req.session.userId,
                city: sanitizedCity,
                latitude: lat,
                longitude: lon
            });

            res.json({ success: true, message: 'Location saved successfully' });
        } catch (error) {
            console.error('Error saving location:', error);
            res.status(500).json({ error: 'Failed to save location' });
        }
    });

    // Pricing page
    router.get('/pricing', preventCache, (req, res) => {
        // Get tiers from database (falls back to defaults if empty)
        let tiers = [];
        try {
            const dbTiers = getPricingTiers(false); // Only active tiers
            if (dbTiers && dbTiers.length > 0) {
                tiers = dbTiers.map(tier => ({
                    id: tier.tier_id,
                    name: tier.name,
                    price: tier.price_display,
                    tagline: tier.tagline,
                    features: tier.features,
                    highlight: tier.is_highlighted,
                    note: tier.note
                }));
            }
        } catch (e) {
            console.warn('Failed to load pricing tiers from DB:', e.message);
        }

        // Fallback to hardcoded defaults if DB is empty
        if (tiers.length === 0) {
            tiers = [
                {
                    id: 'free',
                    name: 'Free User',
                    price: '$0/mo',
                    tagline: 'Social home for productive passions.',
                    features: [
                        'Post photos, videos, project updates',
                        'Follow creators, mentors, students, professionals',
                        'Rich profiles (skills, passions, portfolio, achievements)',
                        'Up to 10 Project Collections',
                        'Book sessions, basic messaging, post analytics (views + likes)',
                        'Ads from Fortune 100 brands only'
                    ]
                },
                {
                    id: 'pro-buyer',
                    name: 'Pro Buyer',
                    price: '$5.99/mo',
                    tagline: 'Power user of the social side.',
                    features: [
                        'Ad-free experience',
                        'Enhanced discovery filters (top rising creators, people near you, people who match interests)',
                        'Unlimited Project Collections',
                        'Priority messaging',
                        'Post up to 3 one-time request listings per month',
                        'Early access to premium sellers',
                        'Basic AI mentor/creator recommendations'
                    ]
                },
                {
                    id: 'pro-seller',
                    name: 'Pro Seller',
                    price: '$9.99/mo',
                    tagline: 'Turn your craft into a brand.',
                    highlight: true,
                    features: [
                        'Pro badge + priority in discovery',
                        'Pin 3 posts to profile',
                        'Weekly insights (reach, audience interests, followers by profession/skill)',
                        'Custom profile banner & theme',
                        '5 service listings, unlimited messaging',
                        'Payment tools, basic CRM',
                        'Scheduling, reminders, custom availability',
                        'Coupons, discounts, basic buyer analytics'
                    ]
                },
                {
                    id: 'elite-seller',
                    name: 'Elite Seller',
                    price: '$29.99/mo',
                    tagline: 'You\'re a top creator — build a full microbrand.',
                    features: [
                        'Verified status, full portfolio builder, video banners',
                        'In-depth analytics (peak times, demographics, top-performing categories)',
                        'Cross-platform link hub, featured on Discover when trending',
                        'Unlimited listings, recurring subscriptions',
                        'Advanced analytics & automation',
                        'CRM + workflow automation',
                        'Custom storefront page, tax reports',
                        'Integrations, auto-responses, Smart rebooking AI'
                    ]
                },
                {
                    id: 'enterprise',
                    name: 'Enterprise Creator',
                    price: '$99.99/mo',
                    tagline: 'Dream X is your community\'s social + learning hub.',
                    features: [
                        'Multi-user team posting',
                        'Event pages, showcase collections',
                        'Custom homepage blocks, co-branded community page',
                        'Invite followers to events, livestreams, seminars',
                        'Multi-instructor scheduling, team-wide analytics',
                        'Bulk payouts, shared CRM',
                        'Dedicated account manager',
                        'Featured category placement, sponsored creator onboarding'
                    ],
                    note: 'Best for tutoring companies, mentorship orgs, clubs, and studios.'
                }
            ];
        }

        let userTier = null;
        if (req.session && req.session.userId) {
            try {
                const sub = getUserSubscription(req.session.userId);
                if (sub && sub.tier) userTier = sub.tier.replace(/_/g, '-'); else userTier = 'free';
            } catch (e) {
                userTier = 'free';
            }
        }

        res.render('static/pricing', {
            title: 'Pricing - Dream X',
            currentPage: 'pricing',
            tiers,
            userTier
        });
    });

    // Help Center
    router.get('/help-center', preventCache, (req, res) => {
        const faqs = [
            { q: 'What is Dream X?', a: 'Dream X is a social platform focused on productive passions—helping you share progress, discover new niches, and grow consistently.' },
            { q: 'How does the Reverse Algorithm work?', a: 'You begin with ultra-specific passion inputs. Over time the feed broadens intelligently, exposing adjacent skills and creators once you establish depth in your core interests.' },
            { q: 'How do I start offering services?', a: 'Upgrade to a seller tier, create service listings, set availability, and start accepting bookings through your public profile.' },
            { q: 'How do I upgrade my plan?', a: 'Visit the Pricing page, choose a tier, and follow the upgrade flow (coming soon). Your features unlock instantly after confirmation.' },
            { q: 'How do I report a problem or a user?', a: 'Use the in-app report option on posts or profiles, or contact support directly for urgent issues.' },
            { q: 'How do I create my first post?', a: 'Click the "Create Post" button on your feed, add your photo or video, write a caption about your progress, and select relevant passions or skills. Your post will appear on your profile and in the feeds of your followers.' },
            { q: 'What are passions and how do I choose them?', a: 'Passions are the core interests that define your profile. Choose 3-5 primary passions from our curated list during onboarding. These help the algorithm show you relevant content and connect you with like-minded creators.' },
            { q: 'Can I change my username or handle?', a: 'Yes! Go to Edit Profile and update your username/handle. Note that your old handle will become available for others to claim, and all your existing links will redirect to your new handle for 30 days.' },
            { q: 'How do streaks work?', a: 'Streaks track consecutive days of posting or activity in specific skills. Post at least once per day to maintain your streak. Streaks are displayed on your profile and in the feed, showing your commitment to consistent growth.' },
            { q: 'What makes Dream X different from other social platforms?', a: 'Dream X is built around productivity and growth, not endless scrolling. Our Reverse Algorithm expands your interests gradually, our dopamine loop rewards progress, and our community celebrates skill-building over vanity metrics.' },
            { q: 'Is my data secure on Dream X?', a: 'Absolutely. We use industry-standard encryption, secure password hashing, and strict access controls. We never sell your personal data. Read our Privacy Policy for full details on how we protect your information.' },
            { q: 'How do I delete my account?', a: 'Visit Settings > Account > Delete Account. Your data will be permanently deleted within 30 days. Some information may be retained for legal or security purposes as outlined in our Privacy Policy.' },
            { q: 'Can I use Dream X for free?', a: 'Yes! Dream X offers a robust free tier with full social feed access, unlimited posts, passion portfolios, and basic achievement tracking. Upgrade to Pro or Elite tiers for advanced features and monetization.' },
            { q: 'How does the marketplace work?', a: 'Pro Seller and Elite Seller tiers can create service listings for tutoring, coaching, or consultations. Buyers can browse, book sessions, and pay directly through the platform. Dream X handles scheduling, payments, and invoicing.' },
            { q: 'What payment methods are accepted?', a: 'We accept major credit cards, debit cards, and digital wallets through our secure payment processor. Sellers receive payouts via bank transfer or PayPal on a regular schedule.' }
        ];
        res.render('static/help-center', {
            title: 'Help Center - Dream X',
            currentPage: 'help-center',
            faqs
        });
    });

    // About page
    router.get('/about', preventCache, (req, res) => {
        res.render('static/about', {
            title: 'About - Dream X',
            currentPage: 'about'
        });
    });

    // Team page
    router.get('/team', preventCache, (req, res) => {
        res.render('static/team', {
            title: 'Our Team - Dream X',
            currentPage: 'team'
        });
    });

    // Features page
    router.get('/features', preventCache, (req, res) => {
        res.render('static/features', {
            title: 'Features - Dream X',
            currentPage: 'features'
        });
    });

    // Contact page
    router.get('/contact', preventCache, (req, res) => {
        res.render('static/contact', {
            title: 'Contact - Dream X',
            currentPage: 'contact'
        });
    });

    // Careers page
    router.get('/careers', preventCache, (req, res) => {
        const jobs = getPublicCareerJobs();
        const heroJob = jobs.find(j => j.status === 'live') || jobs[0] || null;
        res.render('static/careers', {
            title: 'Careers - Dream X',
            currentPage: 'careers',
            jobs,
            heroJob
        });
    });

    // Downloads page
    router.get('/downloads', preventCache, (req, res) => {
        res.render('static/downloads', {
            title: 'Downloads - Dream X',
            currentPage: 'downloads',
            authUser: res.locals.authUser
        });
    });

    // Privacy Policy page
    router.get('/privacy', preventCache, (req, res) => {
        res.render('static/privacy', {
            title: 'Privacy Policy - Dream X',
            currentPage: 'privacy'
        });
    });

    // Terms of Service page
    router.get('/terms', preventCache, (req, res) => {
        res.render('static/terms', {
            title: 'Terms of Service - Dream X',
            currentPage: 'terms',
            authUser: req.session.userId ? getUserById(req.session.userId) : null
        });
    });

    // Community Guidelines page
    router.get('/community-guidelines', preventCache, (req, res) => {
        res.render('static/community-guidelines', {
            title: 'Community Guidelines - Dream X',
            currentPage: 'community-guidelines',
            authUser: req.session.userId ? getUserById(req.session.userId) : null
        });
    });

    // Content Appeal page
    router.get('/content-appeal', preventCache, (req, res) => {
        res.render('appeals/content-appeal', {
            title: 'Content Appeal - Dream X',
            currentPage: 'content-appeal'
        });
    });

    // Account Appeal page
    router.get('/account-appeal', preventCache, (req, res) => {
        res.render('appeals/account-appeal', {
            title: 'Account Appeal - Dream X',
            currentPage: 'account-appeal'
        });
    });

    // Account status page
    router.get('/account-status', preventCache, (req, res) => {
        const userId = parseInt(req.query.userId, 10);
        if (!userId) return res.redirect('/login');
        const accountStatus = checkAccountStatus(userId);
        const user = getUserById(userId);
        res.render('user/account-status', {
            title: 'Account Status - Dream X',
            currentPage: 'account-status',
            accountStatus,
            user,
            authUser: null
        });
    });

    // Sales Inquiry API Endpoint
    router.post('/api/sales/inquiry', async (req, res) => {
        try {
            const {
                // Company Info
                companyName,
                industry,
                companySize,
                companyWebsite,
                companyCity,
                companyCountry,
                // Contact Info
                contactName,
                contactEmail,
                contactPhone,
                contactJobTitle,
                contactDepartment,
                preferredContactMethod,
                preferredContactTime,
                // Requirements
                useCase,
                expectedUsers,
                timeline,
                budgetRange,
                currentSolution,
                integrationNeeds,
                howHeardAboutUs,
                // Additional
                additionalInfo,
                subscribeNewsletter
            } = req.body;

            // Validation
            if (!companyName || !industry || !companySize) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Company name, industry, and size are required.' 
                });
            }
            if (!contactName || !contactEmail || !contactJobTitle) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Contact name, email, and job title are required.' 
                });
            }
            if (!useCase) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Primary use case is required.' 
                });
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(contactEmail)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Please provide a valid email address.' 
                });
            }

            // Create the inquiry
            const inquiryId = createSalesInquiry({
                companyName: companyName.trim(),
                industry,
                companySize,
                companyWebsite: companyWebsite?.trim() || null,
                companyCity: companyCity?.trim() || null,
                companyCountry,
                contactName: contactName.trim(),
                contactEmail: contactEmail.trim().toLowerCase(),
                contactPhone: contactPhone?.trim() || null,
                contactJobTitle: contactJobTitle.trim(),
                contactDepartment: contactDepartment || null,
                preferredContactMethod: preferredContactMethod || 'email',
                preferredContactTime: preferredContactTime || null,
                useCase,
                expectedUsers: expectedUsers || null,
                timeline: timeline || null,
                budgetRange: budgetRange || null,
                currentSolution: currentSolution?.trim() || null,
                integrationNeeds: integrationNeeds?.trim() || null,
                howHeardAboutUs: howHeardAboutUs || null,
                additionalInfo: additionalInfo?.trim() || null
            });

            // Add audit log
            try {
                addAuditLog({
                    userId: req.session?.userId || null,
                    action: 'sales_inquiry_submitted',
                    details: JSON.stringify({
                        inquiryId,
                        companyName,
                        contactEmail,
                        useCase
                    })
                });
            } catch (auditErr) {
                console.warn('Audit log failed:', auditErr.message);
            }

            // Generate reference ID
            const referenceId = `ENT-${Date.now().toString(36).toUpperCase()}-${inquiryId}`;

            // Send confirmation email to contact
            try {
                await emailService.sendSalesInquiryConfirmationEmail(contactEmail, contactName, referenceId);
            } catch (emailErr) {
                console.error('Failed to send inquiry confirmation email:', emailErr);
            }

            // Send notification email to sales team
            try {
                await emailService.sendSalesInquiryNotificationEmail({
                    companyName,
                    industry,
                    companySize,
                    contactName,
                    contactEmail,
                    contactJobTitle,
                    useCase,
                    referenceId,
                    inquiryId
                });
            } catch (emailErr) {
                console.error('Failed to send sales team notification:', emailErr);
            }

            console.log(`✅ New sales inquiry #${inquiryId} from ${contactEmail} for ${companyName}`);

            res.json({
                success: true,
                message: 'Your inquiry has been submitted successfully. Our team will reach out within 1-2 business days.',
                referenceId,
                inquiryId
            });

        } catch (error) {
            console.error('Sales inquiry error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to submit inquiry. Please try again or contact support@dreamx.app.'
            });
        }
    });

    // Submit content appeal
    router.post('/api/appeals/content', (req, res) => {
        try {
            const { email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo } = req.body;
            if (!email || !contentType || !appealReason) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            const id = createContentAppeal({ email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo });
            try { addAuditLog({ userId: req.session.userId || null, action: 'content_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch (e) { }
            res.json({ success: true, message: 'Your appeal has been submitted. You will receive a response within 3-5 business days.', caseNumber: `CA-${id}` });
        } catch (error) {
            console.error('Error processing content appeal:', error);
            res.status(500).json({ error: 'Failed to submit appeal' });
        }
    });

    // Submit account appeal
    router.post('/api/appeals/account', (req, res) => {
        try {
            const { email, username, accountAction, actionDate, violationReason, appealReason, preventionPlan, additionalInfo, contactEmail } = req.body;
            if (!email || !username || !accountAction || !appealReason) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            const id = createAccountAppeal({ email, username, accountAction, actionDate, violationReason, appealReason, preventionPlan, additionalInfo, contactEmail });
            try { addAuditLog({ userId: req.session.userId || null, action: 'account_appeal_submitted', details: JSON.stringify({ id, email }) }); } catch (e) { }
            res.json({ success: true, message: 'Your account appeal has been submitted. You will receive a decision within 3-5 business days.', caseNumber: `AA-${id}` });
        } catch (error) {
            console.error('Error processing account appeal:', error);
            res.status(500).json({ error: 'Failed to submit appeal' });
        }
    });

    return router;
}

module.exports = initMiscRoutes;


const express = require('express');
const { getUserById, updateOnboarding, db } = require('../../db');
const { userNeedsOnboarding, resolvePostAuthRedirect } = require('../../utils/route-helpers');

const router = express.Router();

// Initialize router with dependencies
function initOnboardingRoutes({ upload }) {
    const onboardingUpload = upload.fields([
        { name: 'profilePicture', maxCount: 1 }
    ]);

    const persistOnboarding = (req, res, { respondWithJson } = { respondWithJson: false }) => {
        if (!req.session.userId) {
            return respondWithJson ? res.status(401).json({ success: false, error: 'Not authenticated' }) : res.redirect('/login');
        }

        const user = getUserById(req.session.userId);
        if (!user) {
            return respondWithJson ? res.status(404).json({ success: false, error: 'User not found' }) : res.redirect('/login');
        }

        if (!userNeedsOnboarding(user)) {
            const redirectTarget = resolvePostAuthRedirect(user);
            return respondWithJson ? res.json({ success: true, redirect: redirectTarget }) : res.redirect(redirectTarget);
        }

        const {
            categories, goals, experience,
            daily_time_commitment, best_time, reminder_frequency,
            accountability_style, progress_visibility,
            content_preferences, content_format_preference,
            open_to_mentoring,
            first_goal, first_goal_date, first_goal_metric, first_goal_public,
            notify_followers, notify_likes_comments, notify_milestones,
            notify_inspiration, notify_community, notify_weekly_summary,
            notify_method, bio
        } = req.body;

        const selectedCategories = Array.isArray(categories) ? categories : (categories ? [categories] : []);
        const selectedGoals = Array.isArray(goals) ? goals : (goals ? [goals] : []);
        const selectedAccountability = Array.isArray(accountability_style) ? accountability_style : (accountability_style ? [accountability_style] : []);
        const selectedContentPrefs = Array.isArray(content_preferences) ? content_preferences : (content_preferences ? [content_preferences] : []);

        let profilePicturePath = null;
        if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
            profilePicturePath = req.files.profilePicture[0].path || `profiles/${req.files.profilePicture[0].filename}`;
        }

        try {
            const onboardingData = {
                userId: req.session.userId,
                categories: selectedCategories,
                goals: selectedGoals,
                experience: experience || null,
                daily_time_commitment: daily_time_commitment || null,
                best_time: best_time || null,
                reminder_frequency: reminder_frequency || null,
                accountability_style: selectedAccountability.length > 0 ? JSON.stringify(selectedAccountability) : null,
                progress_visibility: progress_visibility || 'public',
                content_preferences: selectedContentPrefs.length > 0 ? JSON.stringify(selectedContentPrefs) : null,
                content_format_preference: content_format_preference || 'Mixed',
                open_to_mentoring: open_to_mentoring || null,
                first_goal: first_goal || null,
                first_goal_date: first_goal_date || null,
                first_goal_metric: first_goal_metric || null,
                first_goal_public: first_goal_public ? 1 : 0,
                notify_followers: notify_followers ? 1 : 0,
                notify_likes_comments: notify_likes_comments ? 1 : 0,
                notify_milestones: notify_milestones ? 1 : 0,
                notify_inspiration: notify_inspiration ? 1 : 0,
                notify_community: notify_community ? 1 : 0,
                notify_weekly_summary: notify_weekly_summary ? 1 : 0,
                notify_method: notify_method || 'both',
                bio: bio || null,
                profile_picture: profilePicturePath,
                onboarding_completed: 1,
                needs_onboarding: 0
            };

            updateOnboarding(onboardingData);
            req.session.seenOnboardingPrompt = true;
            console.log('📝 Complete onboarding saved for user', req.session.userId);

            const redirectTarget = '/feed';
            return respondWithJson ? res.json({ success: true, redirect: redirectTarget }) : res.redirect(redirectTarget);
        } catch (err) {
            console.error('Failed to save onboarding data', err);
            const user = getUserById(req.session.userId);
            return respondWithJson
                ? res.status(500).json({ success: false, error: 'Unable to save onboarding data' })
                : res.status(500).render('user/onboarding', { title: 'Start with your passions', currentPage: 'user/onboarding', authUser: user, error: 'Unable to save onboarding data' });
        }
    };

    // Onboarding reminder page
    router.get('/onboarding-empty', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const user = getUserById(req.session.userId);
        if (!user) return res.redirect('/login');
        if (!userNeedsOnboarding(user)) return res.redirect('/feed');
        req.session.seenOnboardingPrompt = true;
        res.render('user/onboarding-empty', {
            title: 'Onboarding - Let\'s Get Started | Dream X',
            currentPage: 'onboarding-empty',
            authUser: user
        });
    });

    router.post('/onboarding/start', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const user = getUserById(req.session.userId);
        if (!user) return res.redirect('/login');
        if (!userNeedsOnboarding(user)) return res.redirect('/feed');
        req.session.seenOnboardingPrompt = true;
        return res.redirect('/onboarding');
    });

    // Onboarding page
    router.get('/onboarding', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const user = getUserById(req.session.userId);
        if (!user) return res.redirect('/login');
        if (!userNeedsOnboarding(user)) return res.redirect(resolvePostAuthRedirect(user));
        res.render('user/onboarding', {
            title: 'Start with your passions',
            currentPage: 'user/onboarding',
            authUser: user
        });
    });

    router.post('/api/onboarding', onboardingUpload, (req, res) => persistOnboarding(req, res, { respondWithJson: true }));
    router.post('/onboarding', onboardingUpload, (req, res) => persistOnboarding(req, res, { respondWithJson: false }));

    return router;
}

module.exports = initOnboardingRoutes;




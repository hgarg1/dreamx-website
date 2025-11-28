const express = require('express');
const {
    getUserById,
    getUserPosts,
    getUserReposts,
    getRepostInfo,
    getUserReactionForPost,
    getFollowerCount,
    getFollowingCount,
    getUserServices,
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
    db
} = require('../db');

const router = express.Router();

// Helper function
function safeParseArray(value, fallback = []) {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
        console.warn('Failed to parse JSON array value:', err.message);
        return fallback;
    }
}

// Initialize router with dependencies
function initProfileRoutes({ upload, io }) {
    // Profile page (current user)
    router.get('/profile', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            const row = getUserById(req.session.userId);
            if (!row) return res.redirect('/login');

            const passions = safeParseArray(row.categories);
            const goals = safeParseArray(row.goals);
            const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
            let userPosts = getUserPosts(req.session.userId).filter(p => !p.is_reel);

            userPosts = userPosts.map(p => {
                try {
                    p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                    p.reactions = p.reactions || {};
                } catch (e) { }
                return p;
            });

            const followerCount = getFollowerCount(req.session.userId);
            const followingCount = getFollowingCount(req.session.userId);

            const user = {
                displayName: row.full_name,
                handle: row.handle || row.email.split('@')[0],
                bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
                passions,
                skills: skillsList,
                stats: { posts: userPosts.length, followers: followerCount, following: followingCount, sessions: 0 },
                isSeller: false,
                bannerImage: row.banner_image,
                onboarding: {
                    first_goal: row.first_goal || null,
                    first_goal_date: row.first_goal_date || null,
                    first_goal_metric: row.first_goal_metric || null,
                    first_goal_public: Number(row.first_goal_public) === 1,
                    progress_visibility: row.progress_visibility || 'public',
                    daily_time_commitment: row.daily_time_commitment || null,
                    best_time: row.best_time || null,
                    reminder_frequency: row.reminder_frequency || null,
                    accountability_style: safeParseArray(row.accountability_style),
                    content_preferences: safeParseArray(row.content_preferences),
                    content_format_preference: row.content_format_preference || null,
                    open_to_mentoring: row.open_to_mentoring || null
                }
            };
            const projects = [];
            const services = getUserServices(req.session.userId);
            const me = getUserById(req.session.userId);
            const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');
            
            // Get user reposts
            let userReposts = [];
            try {
                userReposts = getUserReposts(req.session.userId) || [];
                userReposts = userReposts.map(p => {
                    try {
                        p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                        p.reactions = p.reactions || {};
                        // Get repost info
                        const repostInfo = getRepostInfo(p.id);
                        if (repostInfo) {
                            p.repost_info = repostInfo;
                        }
                    } catch (e) { }
                    return p;
                });
            } catch (error) {
                console.error('Error fetching user reposts:', error);
                userReposts = [];
            }

            res.render('profile', {
                title: `${user.displayName} - Profile - Dream X`,
                currentPage: 'profile',
                user,
                authUser: me,
                projects,
                services,
                userPosts,
                userReposts,
                profileUserId: row.id,
                profilePicture: row.profile_picture || null,
                isOwnProfile: true,
                isFollowing: false,
                isSuperAdmin,
                isBlockedByViewer: false
            });
        } catch (error) {
            console.error('Error rendering own profile:', error);
            res.status(500).render('500', { title: 'Server Error - Dream X', currentPage: 'profile' });
        }
    });

    // Public profile by ID (view others)
    router.get('/profile/:id(\\d+)', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        try {
            const uid = parseInt(req.params.id, 10);
            if (!uid || isNaN(uid)) return res.redirect('/feed');
            const row = getUserById(uid);
            if (!row) {
                return res.status(404).render('profile-not-found', {
                    title: 'Profile Not Found - Dream X',
                    currentPage: 'profile',
                    userId: uid
                });
            }
            const passions = safeParseArray(row.categories);
            const goals = safeParseArray(row.goals);
            const skillsList = row.skills ? row.skills.split(',').map(s => s.trim()) : passions.slice(0, 6);
            let userPosts = getUserPosts(uid).filter(p => !p.is_reel);
            userPosts = userPosts.map(p => {
                try {
                    p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                    p.reactions = p.reactions || {};
                } catch (e) { }
                return p;
            });

            const viewingOwnProfile = (uid === req.session.userId);
            const isBlockedByViewer = viewingOwnProfile ? false : isUserBlocked({ userId: req.session.userId, targetId: uid });

            // Get user reposts
            let userReposts = [];
            try {
                userReposts = getUserReposts(uid) || [];
                userReposts = userReposts.map(p => {
                    try {
                        p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                        p.reactions = p.reactions || {};
                        // Get repost info
                        const repostInfo = getRepostInfo(p.id);
                        if (repostInfo) {
                            p.repost_info = repostInfo;
                        }
                    } catch (e) { }
                    return p;
                });
            } catch (error) {
                console.error('Error fetching user reposts:', error);
                userReposts = [];
            }

            const followerCount = getFollowerCount(uid);
            const followingCount = getFollowingCount(uid);
            const isFollowingUser = isFollowing({ followerId: req.session.userId, followingId: uid });

            const user = {
                displayName: row.full_name,
                handle: row.handle || row.email.split('@')[0],
                bio: row.bio || (goals.length ? `Goals: ${goals.join(', ')}` : 'No bio added yet.'),
                passions,
                skills: skillsList,
                stats: { posts: userPosts.length, followers: followerCount, following: followingCount, sessions: 0 },
                isSeller: false,
                bannerImage: row.banner_image,
                onboarding: {
                    first_goal: row.first_goal || null,
                    first_goal_date: row.first_goal_date || null,
                    first_goal_metric: row.first_goal_metric || null,
                    first_goal_public: Number(row.first_goal_public) === 1,
                    progress_visibility: row.progress_visibility || 'public',
                    daily_time_commitment: row.daily_time_commitment || null,
                    best_time: row.best_time || null,
                    reminder_frequency: row.reminder_frequency || null,
                    accountability_style: safeParseArray(row.accountability_style),
                    content_preferences: safeParseArray(row.content_preferences),
                    content_format_preference: row.content_format_preference || null,
                    open_to_mentoring: row.open_to_mentoring || null
                }
            };
            const projects = [];
            const services = getUserServices(uid);
            const me = getUserById(req.session.userId);
            const isSuperAdmin = me && (me.role === 'super_admin' || me.role === 'global_admin' || me.role === 'admin');

            res.render('profile', {
                title: `${user.displayName} - Profile - Dream X`,
                currentPage: 'profile',
                user,
                authUser: me,
                projects,
                services,
                userPosts,
                userReposts,
                profileUserId: uid,
                profilePicture: row.profile_picture || null,
                isOwnProfile: viewingOwnProfile,
                isFollowing: isFollowingUser,
                isSuperAdmin,
                isBlockedByViewer
            });
        } catch (error) {
            console.error('Error rendering user profile:', error);
            res.status(500).render('500', { title: 'Server Error - Dream X', currentPage: 'profile' });
        }
    });

    // Edit Profile form
    router.get('/profile/edit', (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const row = getUserById(req.session.userId);
        if (!row) return res.redirect('/login');
        const authUser = { id: row.id, full_name: row.full_name, email: row.email, profile_picture: row.profile_picture, banner_image: row.banner_image, handle: row.handle };
        const passions = row.categories ? JSON.parse(row.categories) : [];
        const defaultPassions = ['Coding', 'Design', 'Music', 'Fitness', 'Writing', 'Academics', 'Entrepreneurship', 'Art', 'Photography', 'Public Speaking', 'Languages'];

        let popularCommunityInterests = [];
        try {
            const passionCounts = {};
            const passionsQuery = db.prepare(`SELECT categories FROM users WHERE categories IS NOT NULL AND categories != ''`);
            const usersWithCategories = passionsQuery.all();

            usersWithCategories.forEach(user => {
                try {
                    const categories = JSON.parse(user.categories);
                    if (Array.isArray(categories)) {
                        categories.forEach(category => {
                            if (category && typeof category === 'string') {
                                passionCounts[category] = (passionCounts[category] || 0) + 1;
                            }
                        });
                    }
                } catch (e) { }
            });

            popularCommunityInterests = Object.entries(passionCounts)
                .filter(([passion, count]) => !defaultPassions.includes(passion) && count >= 5)
                .sort((a, b) => b[1] - a[1])
                .map(([passion]) => passion)
                .slice(0, 10);
        } catch (err) {
            console.error('Failed to compute popular custom interests:', err.message);
            popularCommunityInterests = [];
        }

        const allPassions = Array.from(new Set([...defaultPassions, ...popularCommunityInterests]));
        const customPassions = passions.filter(p => !allPassions.includes(p));

        const passionGroups = [
            {
                label: 'Technology & Building',
                options: ['Coding', 'Entrepreneurship', 'Writing']
            },
            {
                label: 'Creativity & Media',
                options: ['Design', 'Art', 'Photography', 'Public Speaking', 'Languages']
            },
            {
                label: 'Performance & Wellbeing',
                options: ['Music', 'Fitness', 'Academics']
            }
        ].map(group => ({
            ...group,
            options: group.options.filter(option => allPassions.includes(option))
        }));

        if (popularCommunityInterests.length) {
            passionGroups.push({
                label: 'Community Favorites',
                options: popularCommunityInterests
            });
        }

        const filteredPassionGroups = passionGroups.filter(group => group.options.length > 0);
        const user = {
            displayName: row.full_name,
            handle: row.handle || row.email.split('@')[0],
            bio: row.bio || '',
            passions,
            skills: row.skills || '',
            location: row.location || ''
        };
        res.render('edit-profile', {
            title: 'Edit Profile - Dream X',
            currentPage: 'profile',
            authUser,
            user,
            allPassions,
            customPassions,
            passionGroups: filteredPassionGroups
        });
    });

    // Handle edit profile submission
    router.post('/profile/edit', upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]), (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const { displayName, bio, passions, skills, location, customInterests } = req.body;
        const selectedPassions = Array.isArray(passions) ? passions : (passions ? [passions] : []);
        const customInterestList = (customInterests || '')
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);
        const uniquePassions = Array.from(new Set([...selectedPassions, ...customInterestList]));

        updateUserProfile({
            userId: req.session.userId,
            fullName: displayName,
            bio,
            location,
            skills
        });

        updateOnboarding({
            userId: req.session.userId,
            categories: uniquePassions,
            goals: [],
            experience: null
        });

        if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
            updateProfilePicture({
                userId: req.session.userId,
                filename: `profiles/${req.files.profilePicture[0].filename}`
            });
        }

        if (req.files && req.files.bannerImage && req.files.bannerImage[0]) {
            updateBannerImage({
                userId: req.session.userId,
                filename: `profiles/${req.files.bannerImage[0].filename}`
            });
        }

        console.log('🛠️ Profile update submitted:', {
            displayName,
            bio,
            passions: selectedPassions,
            skills,
            location,
            picture: req.files && req.files.profilePicture ? req.files.profilePicture[0].filename : 'no change',
            banner: req.files && req.files.bannerImage ? req.files.bannerImage[0].filename : 'no change'
        });
        res.redirect('/profile');
    });

    // API: Follow a user
    router.post('/api/users/:id/follow', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId || targetUserId === req.session.userId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        try {
            followUser({ followerId: req.session.userId, followingId: targetUserId });

            const follower = getUserById(req.session.userId);
            createNotification({
                userId: targetUserId,
                type: 'follow',
                title: 'New Follower',
                message: `${follower.full_name} started following you`,
                link: `/profile/${req.session.userId}`
            });

            if (io) {
                io.to(`user-${targetUserId}`).emit('notification', {
                    type: 'follow',
                    title: 'New Follower',
                    message: `${follower.full_name} started following you`,
                    link: `/profile/${req.session.userId}`,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({ success: true, following: true });
        } catch (error) {
            console.error('Follow error:', error);
            res.status(500).json({ error: 'Failed to follow user' });
        }
    });

    // API: Unfollow a user
    router.post('/api/users/:id/unfollow', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId || targetUserId === req.session.userId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        try {
            unfollowUser({ followerId: req.session.userId, followingId: targetUserId });
            res.json({ success: true, following: false });
        } catch (error) {
            console.error('Unfollow error:', error);
            res.status(500).json({ error: 'Failed to unfollow user' });
        }
    });

    // API: Block a user
    router.post('/api/users/:id/block', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId || targetUserId === req.session.userId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        const { reason } = req.body;
        try {
            blockUser({ blockerId: req.session.userId, blockedId: targetUserId, reason });
            res.json({ success: true });
        } catch (error) {
            if (error.message.includes('locked')) {
                return res.status(403).json({ error: 'Your blocking functionality has been restricted by an administrator' });
            }
            console.error('Block error:', error);
            res.status(500).json({ error: 'Failed to block user' });
        }
    });

    // API: Unblock a user
    router.post('/api/users/:id/unblock', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId) return res.status(400).json({ error: 'Invalid user ID' });
        try {
            unblockUser({ blockerId: req.session.userId, blockedId: targetUserId });
            res.json({ success: true });
        } catch (error) {
            console.error('Unblock error:', error);
            res.status(500).json({ error: 'Failed to unblock user' });
        }
    });

    // API: Report a user
    router.post('/api/users/:id/report', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId || targetUserId === req.session.userId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        const { reason, description } = req.body;
        if (!reason) return res.status(400).json({ error: 'Reason is required' });
        try {
            reportUser({ reporterId: req.session.userId, reportedId: targetUserId, reason, description });
            res.json({ success: true, message: 'Report submitted successfully' });
        } catch (error) {
            console.error('Report error:', error);
            res.status(500).json({ error: 'Failed to submit report' });
        }
    });

    // API: Get blocked users
    router.get('/api/users/blocked', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const blocked = getBlockedUsers(req.session.userId);
            res.json({ blocked });
        } catch (error) {
            console.error('Get blocked error:', error);
            res.status(500).json({ error: 'Failed to retrieve blocked users' });
        }
    });

    // API: Check if user is blocked
    router.get('/api/users/:id/is-blocked', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const targetUserId = parseInt(req.params.id, 10);
        if (!targetUserId) return res.status(400).json({ error: 'Invalid user ID' });
        try {
            const blocked = isUserBlocked({ userId: req.session.userId, targetId: targetUserId });
            res.json({ blocked });
        } catch (error) {
            console.error('Check blocked error:', error);
            res.status(500).json({ error: 'Failed to check block status' });
        }
    });

    return router;
}

module.exports = initProfileRoutes;


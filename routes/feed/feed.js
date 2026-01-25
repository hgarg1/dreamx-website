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

const { getRequestBaseUrl } = require('../../utils/route-helpers');
const emailService = require('../../services/emailService');
const { isProduction } = require('../../db/adapter');

const router = express.Router();

// Helper functions (these should be moved to a shared utils file or imported from app.js)
function extractHashtags(text = '') {
    const tags = new Set();
    const regex = /#([A-Za-z0-9_][A-Za-z0-9_-]{0,38})/g;
    let match;
    while ((match = regex.exec(text))) {
        const value = (match[1] || '').toLowerCase();
        if (value) tags.add(value);
    }
    return Array.from(tags);
}

function parseTagInput(input) {
    if (!input) return [];
    const raw = Array.isArray(input) ? input : String(input).split(',');
    return raw.map(t => String(t).trim()).filter(Boolean);
}

// Media limits (should be imported from app.js or a config file)
const MEDIA_LIMITS = {
    MAX_IMAGE_SIZE_MB: 10,
    MAX_VIDEO_SIZE_MB: 400,
    MAX_AUDIO_SIZE_MB: 25,
    MAX_VIDEO_DURATION_SECONDS: 300
};

// Function to get video duration (needs ffmpeg)
function getVideoDurationSeconds(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath) return resolve(0);
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata?.format?.duration;
            resolve(Number.isFinite(duration) ? Number(duration) : 0);
        });
    });
}

function deleteUploadFile(file) {
    if (!file) return;
    const fs = require('fs');
    const target = file.path || path.join(file.destination || '', file.filename || '');
    if (!target) return;
    fs.unlink(target, () => { });
}

// Initialize router with dependencies
function initFeedRoutes({ postUpload, io }) {
    // Feed page (main social feed)
    router.get('/feed', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        const postsRaw = await getFeedPosts({ limit: 50, offset: 0, userId: req.session.userId });
        const posts = (postsRaw || []).map(p => {
            try {
                p.user_reaction = getUserReactionForPost({ postId: p.id, userId: req.session.userId });
                p.reactions = p.reactions || {};
                if (!p.media_url && p.image_url) p.media_url = p.image_url;
                if (!p.media_url && p.video_url) p.media_url = p.video_url;
                if (p.media_url) {
                    let m = String(p.media_url);
                    if (m.startsWith('public/')) m = m.replace(/^public\//, '/');
                    if (m.startsWith('uploads/')) m = '/' + m;
                    if (m.startsWith('posts/')) m = '/uploads/' + m;
                    if (!m.startsWith('/')) m = '/' + m;
                    if (!m.startsWith('/uploads/')) {
                        m = '/uploads/posts/' + m.replace(/^\/+/, '');
                    }
                    p.media_url = m;
                }
                if (p.profile_picture) {
                    let pic = String(p.profile_picture);
                    if (pic.startsWith('/uploads/')) pic = pic.replace(/^\/uploads\//, '');
                    if (pic.startsWith('public/uploads/')) pic = pic.replace(/^public\/uploads\//, '');
                    p.profile_picture = pic;
                }
            } catch (e) { }
            return p;
        });

        // Active reels from followed users
        let activeReels = [];
        try {
            const followed = getFollowing(req.session.userId, 500);
            const userIds = followed.map(u => u.id);
            const reelCounts = require('../../db').getActiveReelCountsForUsers(userIds);
            activeReels = followed.map(u => ({
                user_id: u.id,
                full_name: u.full_name,
                profile_picture: u.profile_picture,
                reelCount: reelCounts[u.id] || 0
            })).filter(r => r.reelCount > 0).sort((a, b) => b.reelCount - a.reelCount);
        } catch (e) { activeReels = []; }

        // Get suggested users
        let suggestions = [];
        try {
            const activeUsersQuery = db.prepare(isProduction
                ? `
                SELECT DISTINCT u.id, u.full_name, u.email, u.profile_picture, u.categories, u.created_at,
                       COUNT(p.id) as recent_posts
                FROM users u
                LEFT JOIN posts p ON u.id = p.user_id AND p.created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')
                WHERE u.id != ?
                  AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                  AND u.account_status = 'active'
                GROUP BY u.id, u.full_name, u.email, u.profile_picture, u.categories, u.created_at
                ORDER BY recent_posts DESC, u.created_at DESC
                LIMIT 10
            `
                : `
                SELECT DISTINCT u.id, u.full_name, u.email, u.profile_picture, u.categories, u.created_at,
                       COUNT(p.id) as recent_posts
                FROM users u
                LEFT JOIN posts p ON u.id = p.user_id AND p.created_at >= datetime('now', '-7 days')
                WHERE u.id != ?
                  AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                  AND u.account_status = 'active'
                GROUP BY u.id
                ORDER BY recent_posts DESC, u.created_at DESC
                LIMIT 10
            `);
            const activeUsers = await activeUsersQuery.all(req.session.userId, req.session.userId) || [];

            if (activeUsers.length >= 3) {
                const busyUsers = activeUsers.filter(u => u.recent_posts >= 3);
                const moderateUsers = activeUsers.filter(u => u.recent_posts >= 1 && u.recent_posts < 3);
                if (busyUsers.length >= 3) {
                    suggestions = busyUsers.slice(0, 3);
                } else if (busyUsers.length > 0 && moderateUsers.length > 0) {
                    suggestions = [...busyUsers.slice(0, 2), ...moderateUsers.slice(0, 2)];
                } else {
                    suggestions = activeUsers.slice(0, 3);
                }
            }

            if (suggestions.length < 3) {
                const topCreatorsQuery = db.prepare(isProduction
                    ? `
                    SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories,
                           COUNT(p.id) as total_posts
                    FROM users u
                    LEFT JOIN posts p ON u.id = p.user_id
                    WHERE u.id != ?
                      AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                      AND u.account_status = 'active'
                    GROUP BY u.id, u.full_name, u.email, u.profile_picture, u.categories
                    HAVING COUNT(p.id) > 0
                    ORDER BY COUNT(p.id) DESC
                    LIMIT ?
                `
                    : `
                    SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories,
                           COUNT(p.id) as total_posts
                    FROM users u
                    LEFT JOIN posts p ON u.id = p.user_id
                    WHERE u.id != ?
                      AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                      AND u.account_status = 'active'
                    GROUP BY u.id
                    HAVING total_posts > 0
                    ORDER BY total_posts DESC
                    LIMIT ?
                `);
                const needed = 3 - suggestions.length;
                const topCreators = await topCreatorsQuery.all(req.session.userId, req.session.userId, needed) || [];
                suggestions = [...suggestions, ...topCreators];
            }

            if (suggestions.length === 0) {
                const anyUsersQuery = db.prepare(`
                    SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories
                    FROM users u
                    WHERE u.id != ?
                      AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
                      AND u.account_status = 'active'
                    ORDER BY u.created_at DESC
                    LIMIT 3
                `);
                suggestions = await anyUsersQuery.all(req.session.userId, req.session.userId) || [];
            }

            suggestions = suggestions.map(u => {
                let passion = 'Community Member';
                if (u.categories) {
                    try {
                        const categories = JSON.parse(u.categories);
                        if (Array.isArray(categories) && categories.length > 0) {
                            passion = categories[0];
                        }
                    } catch (e) { }
                }
                return {
                    id: u.id,
                    user: u.full_name,
                    email: u.email,
                    passion: passion,
                    profile_picture: u.profile_picture
                };
            }).slice(0, 3);
        } catch (error) {
            console.error('Error fetching suggested users:', error);
            suggestions = [];
        }

        // Get trending posts
        let trendingPosts = [];
        try {
            const trendingQuery = db.prepare(isProduction
                ? `
                SELECT
                    p.id as post_id,
                    p.title,
                    p.text_content,
                    p.activity_label,
                    p.created_at,
                    u.id as user_id,
                    u.full_name,
                    u.profile_picture,
                    0 as likes_count,
                    0 as comments_count
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days') AND p.is_reel = false
                ORDER BY p.created_at DESC
                LIMIT 5
            `
                : `
                SELECT
                    p.id as post_id,
                    p.title,
                    p.text_content,
                    p.activity_label,
                    p.created_at,
                    u.id as user_id,
                    u.full_name,
                    u.profile_picture,
                    0 as likes_count,
                    0 as comments_count
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.created_at >= datetime('now', '-7 days') AND p.is_reel = 0
                ORDER BY p.created_at DESC
                LIMIT 5
            `);
            const trendingResults = await trendingQuery.all() || [];
            trendingPosts = trendingResults.map(post => ({
                post_id: post.post_id,
                user: post.full_name,
                full_name: post.full_name,
                userId: post.user_id,
                user_id: post.user_id,
                title: post.title || post.activity_label || (post.text_content ? post.text_content.substring(0, 60) + '...' : 'View post'),
                text_content: post.text_content,
                profile_picture: post.profile_picture,
                likes_count: post.likes_count,
                comments_count: post.comments_count
            }));
        } catch (err) {
            console.error('Error fetching trending posts:', err);
            trendingPosts = [
                { user: 'Nora Fields', userId: 1, title: 'How I wrote 10k words in a week' },
                { user: 'Ethan Brooks', userId: 2, title: 'Startup launch tips' },
                { user: 'Clara Dawson', userId: 3, title: 'Best nature photos of 2025' }
            ];
        }

        // Get recent activity
        let recentActivity = [];
        try {
            recentActivity = await getRecentActivity(5) || [];
        } catch (error) {
            console.error('Error fetching recent activity:', error);
            recentActivity = [];
        }

        const authUser = getUserById(req.session.userId);

        // Get top passions
        let topPassions = [];
        try {
            const passionsQuery = db.prepare(`SELECT categories FROM users WHERE categories IS NOT NULL AND categories != ''`);
            const usersWithCategories = await passionsQuery.all() || [];
            const passionCounts = {};
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
            topPassions = Object.entries(passionCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([passion]) => passion);
            if (topPassions.length === 0) {
                topPassions = ['Entrepreneurship', 'Technology', 'Design', 'Writing', 'Art'];
            }
        } catch (error) {
            console.error('Error fetching top passions:', error);
            topPassions = ['Entrepreneurship', 'Technology', 'Design', 'Writing', 'Art'];
        }

        res.render('feed/feed', {
            title: 'Your Feed - Dream X',
            currentPage: 'feed',
            authUser,
            posts,
            suggestions,
            trendingPosts,
            recentActivity,
            topPassions,
            activeReels,
            success: req.query.success
        });
    });

    // Unified search page
    router.get('/search', (req, res) => {
        const q = (req.query.q || '').trim();
        const authUser = req.session.userId ? getUserById(req.session.userId) : null;
        let users = [];
        try {
            if (q) {
                users = searchUsers({ query: q, limit: 20, excludeUserId: req.session.userId });
            }
        } catch (e) {
            console.error('Search route error:', e);
        }

        if (!q || users.length === 0) {
            return res.status(200).render('feed/search-zero-results', {
                title: 'Search - Dream X',
                currentPage: 'search',
                authUser,
                query: q
            });
        }

        res.render('feed/search', {
            title: `Search: ${q} - Dream X`,
            currentPage: 'search',
            authUser,
            q,
            users
        });
    });

    // Create post
    router.post('/feed/post', postUpload.fields([{ name: 'media', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { contentType, textContent, activityLabel, externalVideoUrl } = req.body;
            const title = (req.body.title || '').trim();
            const postTagsInput = req.body.postTags;
            const mediaFile = req.files && req.files['media'] ? req.files['media'][0] : null;
            const audioFile = req.files && req.files['audio'] ? req.files['audio'][0] : null;
            // Use path from storage adapter (includes folder), fallback to filename for backward compatibility
            const mediaUrl = mediaFile ? (mediaFile.url || `/uploads/${mediaFile.path || `posts/${mediaFile.filename}`}`) : null;
            const audioUrl = audioFile ? (audioFile.url || `/uploads/${audioFile.path || `posts/${audioFile.filename}`}`) : null;
            const externalVideo = (externalVideoUrl || '').trim();
            let parsedDuration = Number(req.body.mediaDuration || 0);
            const mediaSizeMb = mediaFile ? mediaFile.size / (1024 * 1024) : 0;
            const audioSizeMb = audioFile ? audioFile.size / (1024 * 1024) : 0;
            const cleanUpInvalidUploads = () => {
                deleteUploadFile(mediaFile);
                deleteUploadFile(audioFile);
            };

            if (audioFile && audioSizeMb > MEDIA_LIMITS.MAX_AUDIO_SIZE_MB) {
                cleanUpInvalidUploads();
                return res.status(400).send(`Audio too large. Max size is ${MEDIA_LIMITS.MAX_AUDIO_SIZE_MB} MB.`);
            }
            if (mediaFile) {
                const mime = (mediaFile.mimetype || '').toLowerCase();
                if (mime.startsWith('image/') && mediaSizeMb > MEDIA_LIMITS.MAX_IMAGE_SIZE_MB) {
                    cleanUpInvalidUploads();
                    return res.status(400).send(`Image too large. Max size is ${MEDIA_LIMITS.MAX_IMAGE_SIZE_MB} MB.`);
                }
                if (mime.startsWith('video/') && mediaSizeMb > MEDIA_LIMITS.MAX_VIDEO_SIZE_MB) {
                    cleanUpInvalidUploads();
                    return res.status(400).send(`Video too large. Max size is ${MEDIA_LIMITS.MAX_VIDEO_SIZE_MB} MB.`);
                }
                if (mime.startsWith('video/')) {
                    try {
                        // For video duration, use buffer if available, or try to get from storage
                        let videoPath = null;
                        if (mediaFile.buffer) {
                            // Write to temp file for ffprobe
                            const tempPath = path.join(__dirname, '..', '..', 'temp', `temp-${Date.now()}-${mediaFile.filename}`);
                            const tempDir = path.dirname(tempPath);
                            const fs = require('fs');
                            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                            fs.writeFileSync(tempPath, mediaFile.buffer);
                            videoPath = tempPath;
                        } else if (mediaFile.path) {
                            // Try to get from storage if needed
                            videoPath = path.join(__dirname, '..', '..', 'public', 'uploads', mediaFile.path);
                        }
                        const probedDuration = await getVideoDurationSeconds(videoPath);
                        if (Number.isFinite(probedDuration) && probedDuration > 0) parsedDuration = probedDuration;
                    } catch (err) {
                        console.warn('Failed to probe video duration, using client duration if provided.', err.message);
                    }
                    if (parsedDuration > MEDIA_LIMITS.MAX_VIDEO_DURATION_SECONDS) {
                        cleanUpInvalidUploads();
                        return res.status(400).send(`Video too long. Max length is ${MEDIA_LIMITS.MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
                    }
                }
            }
            const mime = mediaFile && mediaFile.mimetype ? mediaFile.mimetype.toLowerCase() : null;
            if (contentType === 'video') {
                if (!mime || !(mime.startsWith('video/') || mime === 'image/gif')) {
                    cleanUpInvalidUploads();
                    return res.status(400).send('Reels require a video or GIF.');
                }
            }
            if (contentType === 'image') {
                if (!mime || !mime.startsWith('image/')) {
                    cleanUpInvalidUploads();
                    return res.status(400).send('Image posts require an image file.');
                }
            }
            const isReel = contentType === 'video' ? 1 : 0;
            let imageUrl = null;
            let videoUrl = null;
            let externalVideoClean = null;

            if (mediaUrl) {
                if (contentType === 'image') imageUrl = mediaUrl; else videoUrl = mediaUrl;
            }
            if (externalVideo) {
                if (videoUrl) {
                    cleanUpInvalidUploads();
                    return res.status(400).send('Please choose either a local video or an external video link, not both.');
                }
                const ytMatch = externalVideo.match(/(?:v=|youtu\.be\/)([\w-]{6,})/i);
                const vimeoMatch = externalVideo.match(/vimeo\.com\/(\d+)/i);
                if (ytMatch) {
                    externalVideoClean = `https://www.youtube.com/embed/${ytMatch[1]}`;
                } else if (vimeoMatch) {
                    externalVideoClean = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
                } else {
                    externalVideoClean = externalVideo;
                }
            }
            const hashtags = extractHashtags(textContent || '');
            const parsedTags = parseTagInput(postTagsInput);
            const postId = createPost({
                userId: req.session.userId,
                title,
                contentType: contentType || 'text',
                textContent,
                mediaUrl,
                audioUrl,
                activityLabel,
                isReel,
                imageUrl,
                videoUrl,
                externalVideoUrl: externalVideoClean
            });
            if (hashtags.length) {
                attachHashtagsToPost({ postId, hashtags });
            }
            if (parsedTags.length) {
                attachTagsToPost({ postId, tags: parsedTags });
            }
            res.redirect('/feed');
        } catch (error) {
            console.error('Failed to create post with media', error);
            res.status(500).send('Unable to create post right now. Please try again.');
        }
    });

    // View single post page
    router.get('/post/:id', async (req, res) => {
        if (!req.session.userId) return res.redirect('/login');
        const postId = parseInt(req.params.id, 10);
        if (!postId) return res.redirect('/feed');
        try {
            const post = await getPostById(postId);
            if (!post) return res.redirect('/feed');
            try {
                post.user_reaction = getUserReactionForPost({ postId, userId: req.session.userId });
            } catch (e) { }
            res.render('feed/post-detail', {
                title: 'Post - Dream X',
                currentPage: 'feed',
                post
            });
        } catch (e) {
            console.error('get post error', e);
            return res.redirect('/feed');
        }
    });

    // API: Get popular hashtags
    router.get('/api/hashtags/popular', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const q = (req.query.q || '').toString();
        const limit = req.query.limit || 8;
        try {
            const hashtags = getPopularHashtags({ search: q, limit }) || [];
            res.json({ success: true, hashtags });
        } catch (error) {
            console.error('Error fetching hashtag suggestions', error);
            res.status(500).json({ error: 'Failed to load hashtags' });
        }
    });

    // API: Get popular tags
    router.get('/api/tags/popular', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const q = (req.query.q || '').toString();
        const limit = req.query.limit || 8;
        try {
            const tags = getPopularTags({ search: q, limit }) || [];
            res.json({ success: true, tags });
        } catch (error) {
            console.error('Error fetching tag suggestions', error);
            res.status(500).json({ error: 'Failed to load tags' });
        }
    });

    // API: Get following users with reel counts
    router.get('/api/users/following/reels', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        try {
            const page = Math.max(parseInt(req.query.page || '1', 10), 1);
            const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '12', 10), 1), 200);
            let rawFollowing;
            try {
                rawFollowing = getFollowing(req.session.userId, 500);
            } catch (err) {
                console.error('Error getting following list:', err);
                rawFollowing = null;
            }
            if (!rawFollowing || !Array.isArray(rawFollowing) || rawFollowing.length === 0) {
                return res.json({ users: [], page: 1, pageSize, total: 0, totalPages: 0 });
            }
            const usersWithReels = rawFollowing.map(u => {
                try {
                    const reelCount = require('../../db').getActiveReelCount(u.id) || 0;
                    return {
                        id: u.id,
                        full_name: u.full_name,
                        profile_picture: u.profile_picture,
                        reelCount
                    };
                } catch (err) {
                    console.error(`Error getting reel count for user ${u.id}:`, err);
                    return null;
                }
            }).filter(u => u !== null && u.reelCount > 0);
            usersWithReels.sort((a, b) => b.reelCount - a.reelCount);
            const startIndex = (page - 1) * pageSize;
            const users = usersWithReels.slice(startIndex, startIndex + pageSize);
            const total = usersWithReels.length;
            const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
            res.json({ users, page, pageSize, total, totalPages });
        } catch (error) {
            console.error('Get following reels error:', error);
            res.status(500).json({ error: 'Failed to retrieve following reels' });
        }
    });

    // API: Get reels for a user
    router.get('/api/users/:id/reels', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const uid = parseInt(req.params.id, 10);
        if (!uid) return res.status(400).json({ error: 'Invalid user id' });
        const tzOffsetMin = parseInt(req.query.tzOffset || '0', 10);
        try {
            const rows = await db.prepare(isProduction
                ? `
                SELECT p.*, u.full_name, u.profile_picture
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.user_id = ? AND p.is_reel = true AND p.created_at >= (CURRENT_TIMESTAMP - INTERVAL '48 hours')
                ORDER BY p.created_at DESC
            `
                : `
                SELECT p.*, u.full_name, u.profile_picture
                FROM posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.user_id = ? AND p.is_reel = 1 AND p.created_at >= datetime('now', '-48 hours')
                ORDER BY p.created_at DESC
            `).all(uid) || [];
            const now = new Date();
            const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
            const active = rows.filter(r => {
                const createdUTC = new Date(r.created_at).getTime();
                const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
                return (nowLocalMs - createdLocal) < (48 * 60 * 60 * 1000);
            });
            res.json({ reels: active });
        } catch (e) {
            console.error('list reels error', e);
            res.status(500).json({ error: 'Failed to load reels' });
        }
    });

    // API: Count reels for a user
    router.get('/api/users/:id/reels/count', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const uid = parseInt(req.params.id, 10);
        if (!uid) return res.status(400).json({ error: 'Invalid user id' });
        const tzOffsetMin = parseInt(req.query.tzOffset || '0', 10);
        try {
            const rows = await db.prepare(isProduction
                ? `SELECT created_at FROM posts WHERE user_id = ? AND is_reel = true AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '48 hours') ORDER BY created_at DESC`
                : `SELECT created_at FROM posts WHERE user_id = ? AND is_reel = 1 AND created_at >= datetime('now', '-48 hours') ORDER BY created_at DESC`
            ).all(uid) || [];
            const now = new Date();
            const nowLocalMs = now.getTime() - (tzOffsetMin * 60 * 1000);
            const count = rows.filter(r => {
                const createdUTC = new Date(r.created_at).getTime();
                const createdLocal = createdUTC - (tzOffsetMin * 60 * 1000);
                return (nowLocalMs - createdLocal) < (48 * 60 * 60 * 1000);
            }).length;
            res.json({ count });
        } catch (e) {
            res.json({ count: 0 });
        }
    });

    // API: Get reactions summary for a post
    router.get('/api/posts/:postId/reactions', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.postId, 10);
        const counts = getPostReactionsSummary(postId);
        const userReaction = getUserReactionForPost({ postId, userId: req.session.userId });
        res.json({ counts, userReaction });
    });

    // API: React to a post (only "like" is supported now)
    router.post('/api/posts/:postId/react', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.postId, 10);
        const { type } = req.body;
        // Only allow "like" reactions now
        if (type !== 'like') return res.status(400).json({ error: 'Only "like" reactions are supported' });
        try {
            const result = setPostReaction({ postId, userId: req.session.userId, reactionType: 'like' });
            const post = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
            const { createNotification } = require('../../db');

            if (post && post.user_id !== req.session.userId && result.status !== 'cleared') {
                const reactor = getUserById(req.session.userId);
                createNotification({
                    userId: post.user_id,
                    type: 'reaction',
                    title: 'New like',
                    message: `${reactor.full_name} liked your post`,
                    link: `/post/${postId}`
                });

                if (io) {
                    io.to(`user-${post.user_id}`).emit('notification', {
                        type: 'reaction',
                        title: 'New like',
                        message: `${reactor.full_name} liked your post`,
                        link: `/post/${postId}`,
                        timestamp: new Date().toISOString()
                    });
                }

                const author = getUserById(post.user_id);
                if (author && author.email_notifications === 1) {
                    const baseUrl = getRequestBaseUrl(req);
                    await emailService.sendPostReactionEmail(author, reactor, 'like', postId, baseUrl, req);
                }
            }

            if (io) {
                io.emit('post-reaction', { postId, userId: req.session.userId, type: 'like', status: result.status, counts: result.counts });
            }
            res.json({ success: true, status: result.status, counts: result.counts });
        } catch (e) {
            console.error('react error', e);
            res.status(500).json({ error: 'Failed to react' });
        }
    });

    // API: Repost a post
    router.post('/api/posts/:postId/repost', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.postId, 10);
        const { quoteText } = req.body;
        
        try {
            const { createRepost } = require('../../db');
            const newPostId = createRepost({
                userId: req.session.userId,
                originalPostId: postId,
                quoteText: quoteText || null
            });
            
            // Get the original post for notification
            const originalPost = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
            if (originalPost && originalPost.user_id !== req.session.userId) {
                const reposter = getUserById(req.session.userId);
                const { createNotification } = require('../../db');
                createNotification({
                    userId: originalPost.user_id,
                    type: 'repost',
                    title: 'Your post was reposted',
                    message: `${reposter.full_name} ${quoteText ? 'quoted and ' : ''}reposted your post`,
                    link: `/post/${newPostId}`
                });
                
                if (io) {
                    io.to(`user-${originalPost.user_id}`).emit('notification', {
                        type: 'repost',
                        title: 'Your post was reposted',
                        message: `${reposter.full_name} ${quoteText ? 'quoted and ' : ''}reposted your post`,
                        link: `/post/${newPostId}`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            if (io) {
                io.emit('post-repost', { originalPostId: postId, newPostId, userId: req.session.userId });
            }
            
            res.json({ success: true, postId: newPostId });
        } catch (e) {
            console.error('repost error', e);
            res.status(500).json({ error: e.message || 'Failed to repost' });
        }
    });

    // API: List comments for a post
    router.get('/api/posts/:postId/comments', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.postId, 10);
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
        const offset = parseInt(req.query.offset || '0', 10);
        try {
            const baseComments = getPostComments({ postId, limit, offset }) || [];
            const comments = [];
            for (const c of baseComments) {
                const likedRow = await db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(c.id, req.session.userId);
                const liked = !!likedRow;
                comments.push({ ...c, user_starred: liked });
            }
            const total = getCommentsCount(postId);
            res.json({ comments, total });
        } catch (e) {
            console.error('list comments error', e);
            res.status(500).json({ error: 'Failed to load comments' });
        }
    });

    // API: Add a comment to a post
    router.post('/api/posts/:postId/comments', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const postId = parseInt(req.params.postId, 10);
        const content = (req.body.content || '').trim();
        const parentId = req.body.parentId ? parseInt(req.body.parentId, 10) : null;
        if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
        try {
            let parentAuthorId = null;
            if (parentId) {
                const parent = await db.prepare('SELECT id, post_id, user_id FROM post_comments WHERE id = ?').get(parentId);
                if (!parent || Number(parent.post_id) !== Number(postId)) {
                    return res.status(400).json({ error: 'Invalid parent comment' });
                }
                parentAuthorId = parent.user_id;
            }

            const commentId = addPostComment({ postId, userId: req.session.userId, content, parentId: parentId || null });
            const comment = await db.prepare(`
              SELECT c.*, u.full_name, u.profile_picture,
                (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS star_count,
                pc.user_id as parent_author_id,
                pu.full_name as parent_author_name
              FROM post_comments c
              JOIN users u ON u.id = c.user_id
              LEFT JOIN post_comments pc ON pc.id = c.parent_id
              LEFT JOIN users pu ON pu.id = pc.user_id
              WHERE c.id = ?
            `).get(commentId);

            const post = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
            const commenter = getUserById(req.session.userId);
            const { createNotification } = require('../../db');

            if (post && post.user_id !== req.session.userId && !parentId) {
                createNotification({
                    userId: post.user_id,
                    type: 'comment',
                    title: 'New comment',
                    message: `${commenter.full_name} commented on your post`,
                    link: `/post/${postId}`
                });

                if (io) {
                    io.to(`user-${post.user_id}`).emit('notification', {
                        type: 'comment',
                        title: 'New comment',
                        message: `${commenter.full_name} commented on your post`,
                        link: `/post/${postId}`,
                        timestamp: new Date().toISOString()
                    });
                }

                const author = getUserById(post.user_id);
                if (author && author.email_notifications === 1) {
                    const baseUrl = getRequestBaseUrl(req);
                    await emailService.sendPostCommentEmail(author, commenter, content, postId, baseUrl, req);
                }
            }

            if (parentAuthorId && parentAuthorId !== req.session.userId) {
                createNotification({
                    userId: parentAuthorId,
                    type: 'reply',
                    title: 'New reply',
                    message: `${commenter.full_name} replied to your comment`,
                    link: `/post/${postId}`
                });

                if (io) {
                    io.to(`user-${parentAuthorId}`).emit('notification', {
                        type: 'reply',
                        title: 'New reply',
                        message: `${commenter.full_name} replied to your comment`,
                        link: `/post/${postId}`,
                        timestamp: new Date().toISOString()
                    });
                }

                const parentAuthor = getUserById(parentAuthorId);
                if (parentAuthor && parentAuthor.email_notifications === 1) {
                    const baseUrl = getRequestBaseUrl(req);
                    await emailService.sendCommentReplyEmail(parentAuthor, commenter, content, postId, baseUrl, req);
                }
            }

            if (io) {
                io.emit('post-comment', { postId, comment });
            }
            res.json({ success: true, comment });
        } catch (e) {
            console.error('add comment error', e);
            res.status(500).json({ error: 'Failed to add comment' });
        }
    });

    // API: Star (like) a comment
    router.post('/api/comments/:commentId/star', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
        const commentId = parseInt(req.params.commentId, 10);
        try {
            const result = toggleCommentLike({ commentId, userId: req.session.userId });
            res.json({ success: true, starred: result.starred, starCount: result.starCount });
        } catch (e) {
            console.error('star comment error', e);
            res.status(500).json({ error: 'Failed to star comment' });
        }
    });

    return router;
}

module.exports = initFeedRoutes;




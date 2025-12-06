const express = require('express');
const bcrypt = require('bcrypt');
const {
    getUserById,
    getUserByEmail,
    createUser,
    updateUserRole,
    updateAdminPermissions,
    getCareerApplicationsPaged,
    getCareerJobsForAdmin,
    getCareerJobById,
    createCareerJob,
    updateCareerJob,
    setCareerJobStatus,
    addCareerJobAsset,
    removeCareerJobAsset,
    getHrTeam,
    addAuditLog,
    db
} = require('../../db');

const router = express.Router();

// Initialize router with dependencies
function initHrRoutes({ emailService, careerAssetUpload }) {
    // Helper functions (scoped to this function to avoid conflicts with app.js)
    function normalizeArray(val) {
        if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
        if (val && typeof val === 'object' && Array.isArray(val.scopes)) return val.scopes.map(v => String(v).trim()).filter(Boolean);
        if (typeof val === 'string' && val.length) return [val.trim()];
        return [];
    }

    function sanitizeHrPermissions(val) {
        const HR_PERMISSION_KEYS = new Set(['hr_applications', 'hr_pipeline', 'hr_jobs', 'hr_messages', 'hr_team', 'hr_scopes']);
        return normalizeArray(val).filter(p => HR_PERMISSION_KEYS.has(p));
    }

    function parseHrMeta(user) {
        let scopes = [];
        let locked = false;
        try {
            const raw = user.admin_scopes ? JSON.parse(user.admin_scopes) : [];
            if (Array.isArray(raw)) {
                scopes = normalizeArray(raw);
            } else if (raw && typeof raw === 'object') {
                scopes = normalizeArray(raw.scopes || []);
                locked = !!raw.locked;
            }
        } catch (_) {
            scopes = [];
        }
        let hrPermissions = [];
        try {
            hrPermissions = sanitizeHrPermissions(user.admin_permissions ? JSON.parse(user.admin_permissions) : []);
        } catch (_) {
            hrPermissions = [];
        }
        return { scopes, locked, hrPermissions };
    }

    const isHR = (user) => user && ['hr', 'super_hr', 'global_hr'].includes(user.role);
    const isSuperHR = (user) => user && (user.role === 'super_hr' || user.role === 'global_hr');
    const isGlobalHR = (user) => user && user.role === 'global_hr';
    const hrRoleRank = { hr: 1, super_hr: 2, global_hr: 3 };

    function canManageHrRole(actor, targetRole) {
        if (!actor || !isHR(actor)) return false;
        const actorRank = hrRoleRank[actor.role] || 0;
        const targetRank = hrRoleRank[targetRole] || 0;
        return actorRank > targetRank && actorRank >= 2;
    }

    function requireHR(req, res, next) {
        const user = req.session.userId ? getUserById(req.session.userId) : null;
        if (!isHR(user)) return res.redirect('/');
        next();
    }

    function parseJobTags(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(r => String(r).trim()).filter(Boolean).slice(0, 10);
        return String(raw).split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
    }

    function resolveJobStatus({ requestedStatus, goLiveAt, freezeUntil }) {
        const now = Date.now();
        const liveAt = goLiveAt ? new Date(goLiveAt).getTime() : null;
        const freezeUntilTs = freezeUntil ? new Date(freezeUntil).getTime() : null;
        if (requestedStatus === 'closed') return 'closed';
        if (freezeUntilTs && freezeUntilTs > now) return 'frozen';
        if (requestedStatus === 'frozen') return 'frozen';
        if (liveAt && liveAt > now) return 'scheduled';
        return requestedStatus || 'live';
    }
    // HR review portal
    router.get('/hr', requireHR, (req, res) => {
        const me = getUserById(req.session.userId);
        const careers = getCareerApplicationsPaged({ limit: 100, offset: 0 });
        const jobPostings = getCareerJobsForAdmin();
        const hrTeam = (getHrTeam() || []).map(member => {
            const hrMeta = parseHrMeta(member);
            return { ...member, admin_scopes: hrMeta.scopes, hr_permissions: hrMeta.hrPermissions, scope_locked: hrMeta.locked };
        });

        const totalApps = careers.length;
        const newApps = careers.filter(c => c.status === 'new' || !c.status).length;
        const reviewApps = careers.filter(c => c.status === 'under_review').length;
        const acceptedApps = careers.filter(c => c.status === 'accepted').length;
        const rejectedApps = careers.filter(c => c.status === 'rejected').length;

        const HR_PERMISSION_DEFINITIONS = [
            { key: 'hr_applications', label: 'Applications & Review', desc: 'View and triage candidate submissions.' },
            { key: 'hr_pipeline', label: 'Pipeline Moves', desc: 'Advance, reject, and tag candidates in the pipeline.' },
            { key: 'hr_jobs', label: 'Job Posts', desc: 'Create and update open roles and publishing status.' },
            { key: 'hr_messages', label: 'Candidate Outreach', desc: 'Email and message candidates from the HR desk.' },
            { key: 'hr_team', label: 'HR Team Management', desc: 'Create HR teammates and assign their scopes.' },
            { key: 'hr_scopes', label: 'Scope Stewardship', desc: 'Add or retire scopes for downstream HR workflows.' }
        ];
        const HR_PAGE_SCOPES = ['hr-dashboard', 'candidate-pipeline', 'career-applications', 'job-board', 'hr-org', 'talent-outreach'];

        res.render('hr/hr', {
            title: 'HR Review - Dream X',
            currentPage: 'hr',
            authUser: me,
            careers,
            totalApps,
            newApps,
            reviewApps,
            acceptedApps,
            rejectedApps,
            jobPostings,
            hrTeam,
            hrPermissionDefinitions: HR_PERMISSION_DEFINITIONS,
            defaultHrScopes: HR_PAGE_SCOPES,
            success: req.query.success,
            error: req.query.error
        });
    });

    // HR Contact Email Route
    router.post('/hr/send-email', requireHR, async (req, res) => {
        try {
            const { applicantId, applicantEmail, applicantName, subject, message } = req.body;

            if (!applicantEmail || !applicantName || !subject || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'All fields (email, name, subject, message) are required'
                });
            }

            const hrUser = getUserById(req.session.userId);
            const fromHR = hrUser.full_name || hrUser.email;

            await emailService.sendHRContactEmail(
                applicantEmail,
                applicantName,
                subject,
                message,
                fromHR,
                req
            );

            try {
                const { addAuditLog } = require('../../db');
                addAuditLog({
                    userId: req.session.userId,
                    action: 'hr_email_sent',
                    details: JSON.stringify({ applicantEmail, subject, applicantId })
                });
            } catch (e) { }

            res.json({
                success: true,
                message: 'Email sent successfully to ' + applicantEmail
            });
        } catch (error) {
            console.error('HR email error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send email. Please try again.'
            });
        }
    });

    // HR leadership APIs
    router.get('/api/hr/team', requireHR, (req, res) => {
        const HR_PAGE_SCOPES = ['hr-dashboard', 'candidate-pipeline', 'career-applications', 'job-board', 'hr-org', 'talent-outreach'];
        const HR_PERMISSION_KEYS = new Set(['hr_applications', 'hr_pipeline', 'hr_jobs', 'hr_messages', 'hr_team', 'hr_scopes']);
        const team = (getHrTeam() || []).map(member => {
            const hrMeta = parseHrMeta(member);
            return { ...member, admin_scopes: hrMeta.scopes, hr_permissions: hrMeta.hrPermissions, scope_locked: hrMeta.locked };
        });
        res.json({ success: true, team });
    });

    router.post('/api/hr/accounts', requireHR, async (req, res) => {
        const actor = req.session.userId ? getUserById(req.session.userId) : null;
        if (!actor) return res.status(403).json({ error: 'Unauthorized' });
        if (!isSuperHR(actor)) return res.status(403).json({ error: 'Only senior HR can create team members' });

        const fullName = (req.body.fullName || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';
        const targetRole = (req.body.role || 'hr').toLowerCase();
        const scopes = normalizeArray(req.body.scopes);
        let hrPermissions = sanitizeHrPermissions(req.body.hrPermissions || req.body.hr_permissions);
        const HR_PAGE_SCOPES = ['hr-dashboard', 'candidate-pipeline', 'career-applications', 'job-board', 'hr-org', 'talent-outreach'];
        const HR_PERMISSION_KEYS = new Set(['hr_applications', 'hr_pipeline', 'hr_jobs', 'hr_messages', 'hr_team', 'hr_scopes']);

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Full name, email, and password are required' });
        }
        if (!['hr', 'super_hr'].includes(targetRole)) {
            return res.status(400).json({ error: 'Role must be HR or Super HR' });
        }
        if (!canManageHrRole(actor, targetRole)) {
            return res.status(403).json({ error: 'You can only create roles below your tier' });
        }
        if (!scopes.length) {
            scopes = HR_PAGE_SCOPES;
        }
        if (!hrPermissions.length) {
            hrPermissions = targetRole === 'super_hr'
                ? Array.from(HR_PERMISSION_KEYS)
                : ['hr_applications', 'hr_pipeline', 'hr_jobs', 'hr_messages'];
        }
        if (getUserByEmail(email)) {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserId = createUser({ fullName, email, passwordHash });
        updateUserRole({ userId: newUserId, role: targetRole });
        updateAdminPermissions({ userId: newUserId, permissions: hrPermissions, scopes: { scopes, locked: false } });
        addAuditLog({ userId: actor.id, action: 'hr_created_account', details: JSON.stringify({ email, role: targetRole }) });

        const created = getUserById(newUserId);
        res.json({
            success: true,
            user: {
                id: created.id,
                full_name: created.full_name,
                email: created.email,
                role: created.role,
                admin_scopes: scopes,
                hr_permissions: hrPermissions,
                scope_locked: false,
                created_at: created.created_at
            }
        });
    });

    router.post('/api/hr/accounts/:id/scopes', requireHR, (req, res) => {
        const actor = req.session.userId ? getUserById(req.session.userId) : null;
        const targetId = parseInt(req.params.id, 10);
        const targetUser = getUserById(targetId);
        if (!actor || !targetUser || !isHR(targetUser)) {
            return res.status(404).json({ error: 'HR account not found' });
        }
        if (!canManageHrRole(actor, targetUser.role)) {
            return res.status(403).json({ error: 'You can only adjust scopes for lower-tier HR accounts' });
        }
        const hrMeta = parseHrMeta(targetUser);
        if (hrMeta.locked && !isGlobalHR(actor)) {
            return res.status(403).json({ error: 'Scopes are locked by Global HR' });
        }
        const scopes = normalizeArray(req.body.scopes);
        const nextLock = req.body.lock === true ? true : (req.body.lock === false ? false : hrMeta.locked);
        const shouldLock = isGlobalHR(actor) ? nextLock : hrMeta.locked;
        const hrPermissions = hrMeta.hrPermissions;
        updateAdminPermissions({ userId: targetId, permissions: hrPermissions, scopes: { scopes, locked: shouldLock } });
        addAuditLog({ userId: actor.id, action: 'hr_scopes_updated', details: JSON.stringify({ target: targetUser.email, scopes, locked: shouldLock }) });
        return res.json({ success: true, scopes, locked: shouldLock });
    });

    router.post('/api/hr/accounts/:id/permissions', requireHR, (req, res) => {
        const actor = req.session.userId ? getUserById(req.session.userId) : null;
        const targetId = parseInt(req.params.id, 10);
        const targetUser = getUserById(targetId);
        if (!actor || !targetUser || !isHR(targetUser)) {
            return res.status(404).json({ error: 'HR account not found' });
        }
        if (!canManageHrRole(actor, targetUser.role)) {
            return res.status(403).json({ error: 'You can only adjust permissions for lower-tier HR accounts' });
        }
        const hrMeta = parseHrMeta(targetUser);
        const hrPermissions = sanitizeHrPermissions(req.body.hrPermissions || req.body.permissions);
        updateAdminPermissions({ userId: targetId, permissions: hrPermissions, scopes: { scopes: hrMeta.scopes, locked: hrMeta.locked } });
        addAuditLog({ userId: actor.id, action: 'hr_permissions_updated', details: JSON.stringify({ target: targetUser.email, hrPermissions }) });
        return res.json({ success: true, hrPermissions });
    });

    // HR job management APIs
    router.get('/api/hr/career-jobs', requireHR, (req, res) => {
        const jobs = getCareerJobsForAdmin();
        res.json({ success: true, jobs });
    });

    router.post('/api/hr/career-jobs', requireHR, careerAssetUpload.array('assetFiles', 6), (req, res) => {
        try {
            const { title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, goLiveAt, freezeUntil, status, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority } = req.body;
            if (!title || !description) {
                return res.status(400).json({ success: false, error: 'Title and description are required' });
            }
            const goLiveIso = goLiveAt && !isNaN(new Date(goLiveAt)) ? new Date(goLiveAt).toISOString() : null;
            const freezeUntilIso = freezeUntil && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : null;
            const computedStatus = resolveJobStatus({ requestedStatus: status, goLiveAt: goLiveIso, freezeUntil: freezeUntilIso });
            const jobId = createCareerJob({
                title,
                location,
                team,
                employmentType,
                seniority,
                headline,
                description,
                responsibilities,
                requirements,
                perks,
                tags: parseJobTags(tags),
                salaryMin: salaryMin ? Number(salaryMin) : null,
                salaryMax: salaryMax ? Number(salaryMax) : null,
                salaryCurrency: salaryCurrency || null,
                applyUrl: applyUrl || null,
                workplaceType: workplaceType || null,
                visibility: visibility || 'public',
                priority: priority || null,
                status: computedStatus,
                goLiveAt: goLiveIso,
                freezeUntil: freezeUntilIso,
                isFrozen: computedStatus === 'frozen'
            });
            if (req.files && req.files.length) {
                req.files.forEach(file => {
                    addCareerJobAsset({
                        jobId,
                        label: file.originalname,
                        fileName: file.originalname,
                        filePath: file.url || `/uploads/${file.path || `career-assets/${file.filename}`}`,
                        fileSize: file.size,
                        mimeType: file.mimetype
                    });
                });
            }
            const job = getCareerJobById(jobId);
            try { addAuditLog({ userId: req.session.userId, action: 'career_job_created', details: JSON.stringify({ jobId, title }) }); } catch (_) { }
            res.json({ success: true, job });
        } catch (error) {
            console.error('Failed to create career job', error);
            res.status(500).json({ success: false, error: 'Could not create job posting' });
        }
    });

    router.patch('/api/hr/career-jobs/:id', requireHR, careerAssetUpload.array('assetFiles', 6), (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const existing = getCareerJobById(id);
            if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
            const { title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, goLiveAt, freezeUntil, status, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority } = req.body;
            const goLiveIso = goLiveAt !== undefined && goLiveAt !== null && goLiveAt !== '' && !isNaN(new Date(goLiveAt)) ? new Date(goLiveAt).toISOString() : existing.go_live_at;
            const freezeUntilIso = freezeUntil !== undefined && freezeUntil !== null && freezeUntil !== '' && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : existing.freeze_until;
            const computedStatus = resolveJobStatus({ requestedStatus: status || existing.status, goLiveAt: goLiveIso, freezeUntil: freezeUntilIso });
            const updated = updateCareerJob({
                id,
                title,
                location,
                team,
                employmentType,
                seniority,
                headline,
                description,
                responsibilities,
                requirements,
                perks,
                tags: tags !== undefined ? parseJobTags(tags) : undefined,
                salaryMin: salaryMin !== undefined ? (salaryMin ? Number(salaryMin) : null) : undefined,
                salaryMax: salaryMax !== undefined ? (salaryMax ? Number(salaryMax) : null) : undefined,
                salaryCurrency: salaryCurrency !== undefined ? salaryCurrency : undefined,
                applyUrl: applyUrl !== undefined ? applyUrl : undefined,
                workplaceType: workplaceType !== undefined ? workplaceType : undefined,
                visibility: visibility !== undefined ? visibility : undefined,
                priority: priority !== undefined ? priority : undefined,
                status: computedStatus,
                goLiveAt: goLiveIso,
                freezeUntil: freezeUntilIso,
                isFrozen: computedStatus === 'frozen'
            });
            if (req.files && req.files.length) {
                req.files.forEach(file => {
                    addCareerJobAsset({
                        jobId: id,
                        label: file.originalname,
                        fileName: file.originalname,
                        filePath: file.url || `/uploads/${file.path || `career-assets/${file.filename}`}`,
                        fileSize: file.size,
                        mimeType: file.mimetype
                    });
                });
            }
            const job = getCareerJobById(id) || updated;
            try { addAuditLog({ userId: req.session.userId, action: 'career_job_updated', details: JSON.stringify({ jobId: id, status: computedStatus }) }); } catch (_) { }
            res.json({ success: true, job });
        } catch (error) {
            console.error('Failed to update career job', error);
            res.status(500).json({ success: false, error: 'Could not update job posting' });
        }
    });

    router.patch('/api/hr/career-jobs/:id/status', requireHR, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { status, freezeUntil } = req.body;
            if (!['draft', 'scheduled', 'live', 'frozen', 'closed'].includes(status)) {
                return res.status(400).json({ success: false, error: 'Invalid status' });
            }
            const existing = getCareerJobById(id);
            if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
            const freezeUntilIso = freezeUntil && !isNaN(new Date(freezeUntil)) ? new Date(freezeUntil).toISOString() : null;
            const job = setCareerJobStatus({ id, status, freezeUntil: freezeUntilIso });
            try { addAuditLog({ userId: req.session.userId, action: 'career_job_status', details: JSON.stringify({ id, status }) }); } catch (_) { }
            res.json({ success: true, job });
        } catch (error) {
            console.error('Failed to set job status', error);
            res.status(500).json({ success: false, error: 'Could not update job status' });
        }
    });

    router.delete('/api/hr/career-jobs/:jobId/assets/:assetId', requireHR, (req, res) => {
        const assetId = parseInt(req.params.assetId, 10);
        const jobId = parseInt(req.params.jobId, 10);
        try {
            const removed = removeCareerJobAsset({ assetId, jobId });
            if (!removed) return res.status(404).json({ success: false, error: 'Asset not found' });
            try { addAuditLog({ userId: req.session.userId, action: 'career_job_asset_removed', details: JSON.stringify({ jobId, assetId }) }); } catch (_) { }
            res.json({ success: true });
        } catch (error) {
            console.error('Failed to delete asset', error);
            res.status(500).json({ success: false, error: 'Could not remove attachment' });
        }
    });

    return router;
}

module.exports = initHrRoutes;


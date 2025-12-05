const express = require('express');
const router = express.Router();
const {
    getUserById,
    getSalesInquiriesPaged,
    getSalesInquiriesCount,
    getSalesInquiry,
    getSalesInquiryStats,
    updateSalesInquiry,
    assignSalesInquiry,
    closeSalesInquiry,
    addSalesInquiryCommunication,
    getSalesInquiryCommunications,
    getBusinessAdminAssignments,
    createBusinessAdminAssignment,
    updateBusinessAdminAssignment,
    revokeBusinessAdminAssignment,
    getBusinessAdminParent,
    getAllBusinessAdmins,
    isBusinessAdminOf,
    addAuditLog,
    getPricingTiers,
    getPricingTier,
    updatePricingTier,
    createPricingTier,
    deletePricingTier,
    db
} = require('../db');

// Business Admin Permission Definitions
const BUSINESS_ADMIN_PERMISSION_DEFINITIONS = [
    { key: 'sales_inquiries_view', label: 'View Sales Inquiries', desc: 'View enterprise sales inquiry submissions.' },
    { key: 'sales_inquiries_manage', label: 'Manage Sales Inquiries', desc: 'Assign, update status, and close sales inquiries.' },
    { key: 'sales_inquiries_contact', label: 'Contact Prospects', desc: 'Send follow-up emails to sales leads.' },
    { key: 'business_team_view', label: 'View Business Team', desc: 'View other business admins in the organization.' },
    { key: 'business_team_manage', label: 'Manage Business Team', desc: 'Create and manage subordinate business admins.' },
    { key: 'enterprise_accounts', label: 'Enterprise Accounts', desc: 'View and manage enterprise customer accounts.' },
    { key: 'sales_analytics', label: 'Sales Analytics', desc: 'View sales pipeline metrics and conversion data.' },
    { key: 'contract_management', label: 'Contract Management', desc: 'Create and manage enterprise contracts.' },
    { key: 'pricing_customization', label: 'Custom Pricing', desc: 'Create custom pricing packages for enterprises.' },
    { key: 'partner_management', label: 'Partner Management', desc: 'Manage business partners and affiliates.' },
    { key: 'revenue_reports', label: 'Revenue Reports', desc: 'Access revenue and financial reports.' },
    { key: 'customer_success', label: 'Customer Success', desc: 'Manage customer onboarding and success programs.' }
];

const BUSINESS_ADMIN_PERMISSION_KEYS = new Set(BUSINESS_ADMIN_PERMISSION_DEFINITIONS.map(p => p.key));

// Helper functions
const isBusinessAdmin = (user) => user && user.role === 'business_admin';
const isSuperAdmin = (user) => user && (user.role === 'super_admin' || user.role === 'global_admin');
const isGlobalAdmin = (user) => user && user.role === 'global_admin';

const parseBusinessMeta = (user) => {
    try {
        const perms = user.admin_permissions ? JSON.parse(user.admin_permissions) : [];
        const scopes = user.admin_scopes ? JSON.parse(user.admin_scopes) : [];
        return {
            permissions: Array.isArray(perms) ? perms.filter(p => BUSINESS_ADMIN_PERMISSION_KEYS.has(p)) : [],
            scopes: Array.isArray(scopes) ? scopes : []
        };
    } catch (_) {
        return { permissions: [], scopes: [] };
    }
};

const hasBusinessPermission = (user, permission) => {
    if (!user) return false;
    if (isSuperAdmin(user) || isGlobalAdmin(user)) return true;
    if (!isBusinessAdmin(user)) return false;
    const { permissions } = parseBusinessMeta(user);
    return permissions.includes(permission);
};

// Safe JSON parse helper
const safeParseJSON = (str, defaultValue = null) => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
};

// Middleware to attach user to request and check business admin access
const attachUser = (req, res, next) => {
    if (!req.businessUser && req.session.userId) {
        req.businessUser = getUserById(req.session.userId);
    }
    next();
};

// Middleware
const requireBusinessAdmin = (req, res, next) => {
    const user = req.businessUser || (req.session.userId ? getUserById(req.session.userId) : null);
    if (!user) {
        req.businessUser = null;
    } else {
        req.businessUser = user;
    }
    if (!isBusinessAdmin(user) && !isSuperAdmin(user) && !isGlobalAdmin(user)) {
        return res.redirect('/?error=Access+denied');
    }
    next();
};

const requireBusinessPermission = (permission) => (req, res, next) => {
    const user = req.businessUser || (req.session.userId ? getUserById(req.session.userId) : null);
    if (!hasBusinessPermission(user, permission)) {
        if (req.headers.accept?.includes('application/json')) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return res.redirect('/business?error=Insufficient+permissions');
    }
    next();
};

function initBusinessRoutes({ emailService }) {

    // Business Admin Dashboard
    router.get('/business', requireBusinessAdmin, (req, res) => {
        const user = req.businessUser;
        const stats = getSalesInquiryStats();
        const { permissions, scopes } = parseBusinessMeta(user);
        
        // Get recent inquiries for dashboard overview
        const recentInquiries = getSalesInquiriesPaged({ 
            limit: 5, 
            offset: 0 
        });
        
        // Get team members if has permission
        let teamMembers = [];
        if (hasBusinessPermission(user, 'business_team_view')) {
            teamMembers = getBusinessAdminAssignments(req.session.userId);
        }
        
        // Check if this admin has a parent (is subordinate)
        const parentAdmin = getBusinessAdminParent(req.session.userId);

        res.render('business-dashboard', {
            title: 'Business Admin Dashboard - Dream X',
            currentPage: 'business',
            authUser: { ...user, displayName: user.full_name },
            stats,
            recentInquiries,
            teamMembers,
            parentAdmin,
            permissions,
            scopes,
            BUSINESS_ADMIN_PERMISSION_DEFINITIONS,
            hasPermission: (perm) => hasBusinessPermission(user, perm),
            success: req.query.success,
            error: req.query.error
        });
    });

    // Sales Inquiries List Page
    router.get('/business/sales', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_view'), (req, res) => {
        const user = req.businessUser;
        const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
        const pageSize = 20;
        const offset = (page - 1) * pageSize;
        
        const filters = {
            status: req.query.status || undefined,
            priority: req.query.priority || undefined,
            assignedTo: req.query.assignedTo ? parseInt(req.query.assignedTo) : undefined,
            search: req.query.search || undefined
        };
        
        const inquiries = getSalesInquiriesPaged({
            limit: pageSize,
            offset,
            ...filters
        });
        
        const total = getSalesInquiriesCount(filters);
        const totalPages = Math.ceil(total / pageSize);
        const stats = getSalesInquiryStats();
        
        // Get list of business admins for assignment dropdown
        const businessAdmins = getAllBusinessAdmins();

        res.render('business-sales', {
            title: 'Sales Inquiries - Dream X',
            currentPage: 'business-sales',
            authUser: { ...user, displayName: user.full_name },
            inquiries,
            stats,
            businessAdmins,
            page,
            totalPages,
            total,
            filters,
            hasPermission: (perm) => hasBusinessPermission(user, perm),
            success: req.query.success,
            error: req.query.error
        });
    });

    // Single Sales Inquiry Detail
    router.get('/business/sales/:id', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_view'), (req, res) => {
        const user = req.businessUser;
        const inquiryId = parseInt(req.params.id, 10);
        const inquiry = getSalesInquiry(inquiryId);
        
        if (!inquiry) {
            return res.redirect('/business/sales?error=Inquiry+not+found');
        }
        
        const communications = getSalesInquiryCommunications(inquiryId);
        const businessAdmins = getAllBusinessAdmins();

        res.render('business-sales-detail', {
            title: `Sales Inquiry #${inquiryId} - Dream X`,
            currentPage: 'business-sales',
            authUser: { ...user, displayName: user.full_name },
            inquiry,
            communications,
            businessAdmins,
            hasPermission: (perm) => hasBusinessPermission(user, perm),
            success: req.query.success,
            error: req.query.error
        });
    });

    // Update Inquiry Status
    router.post('/api/business/sales/:id/status', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_manage'), (req, res) => {
        try {
            const inquiryId = parseInt(req.params.id, 10);
            const { status, priority, notes } = req.body;
            
            const updateData = {};
            if (status) updateData.status = status;
            if (priority) updateData.priority = priority;
            if (notes) updateData.followUpNotes = notes;
            
            updateSalesInquiry(inquiryId, updateData);
            
            addAuditLog({
                userId: req.session.userId,
                action: 'update_sales_inquiry',
                details: JSON.stringify({ inquiryId, ...updateData })
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Update inquiry error:', error);
            res.status(500).json({ error: 'Failed to update inquiry' });
        }
    });

    // Assign Inquiry
    router.post('/api/business/sales/:id/assign', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_manage'), (req, res) => {
        try {
            const inquiryId = parseInt(req.params.id, 10);
            const { assignedTo } = req.body;
            
            assignSalesInquiry({
                inquiryId,
                assignedTo: parseInt(assignedTo, 10),
                assignedBy: req.session.userId
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Assign inquiry error:', error);
            res.status(500).json({ error: 'Failed to assign inquiry' });
        }
    });

    // Close Inquiry
    router.post('/api/business/sales/:id/close', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_manage'), (req, res) => {
        try {
            const inquiryId = parseInt(req.params.id, 10);
            const { outcome, notes } = req.body;
            
            closeSalesInquiry({
                inquiryId,
                outcome,
                outcomeNotes: notes,
                closedBy: req.session.userId
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Close inquiry error:', error);
            res.status(500).json({ error: 'Failed to close inquiry' });
        }
    });

    // Send Follow-up Email
    router.post('/api/business/sales/:id/email', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_contact'), async (req, res) => {
        try {
            const inquiryId = parseInt(req.params.id, 10);
            const { subject, content } = req.body;
            
            const inquiry = getSalesInquiry(inquiryId);
            if (!inquiry) {
                return res.status(404).json({ error: 'Inquiry not found' });
            }
            
            // Save communication record
            const commId = addSalesInquiryCommunication({
                inquiryId,
                senderId: req.session.userId,
                communicationType: 'email',
                subject,
                content,
                recipientEmail: inquiry.contact_email
            });
            
            // Send actual email if emailService is available
            if (emailService && emailService.sendSalesFollowUpEmail) {
                try {
                    await emailService.sendSalesFollowUpEmail(
                        inquiry.contact_email,
                        inquiry.contact_name,
                        subject,
                        content
                    );
                } catch (emailErr) {
                    console.warn('Email send failed:', emailErr.message);
                }
            }
            
            res.json({ success: true, communicationId: commId });
        } catch (error) {
            console.error('Send email error:', error);
            res.status(500).json({ error: 'Failed to send email' });
        }
    });

    // Add Internal Note
    router.post('/api/business/sales/:id/note', requireBusinessAdmin, requireBusinessPermission('sales_inquiries_manage'), (req, res) => {
        try {
            const inquiryId = parseInt(req.params.id, 10);
            const { content } = req.body;
            
            const commId = addSalesInquiryCommunication({
                inquiryId,
                senderId: req.session.userId,
                communicationType: 'note',
                subject: null,
                content,
                recipientEmail: null
            });
            
            res.json({ success: true, communicationId: commId });
        } catch (error) {
            console.error('Add note error:', error);
            res.status(500).json({ error: 'Failed to add note' });
        }
    });

    // Business Team Management Page
    router.get('/business/team', requireBusinessAdmin, requireBusinessPermission('business_team_view'), (req, res) => {
        const user = req.businessUser;
        const teamMembers = getBusinessAdminAssignments(req.session.userId);
        const parentAdmin = getBusinessAdminParent(req.session.userId);
        const allBusinessAdmins = getAllBusinessAdmins();

        res.render('business-team', {
            title: 'Business Team - Dream X',
            currentPage: 'business-team',
            authUser: { ...user, displayName: user.full_name },
            teamMembers,
            parentAdmin,
            allBusinessAdmins,
            BUSINESS_ADMIN_PERMISSION_DEFINITIONS,
            hasPermission: (perm) => hasBusinessPermission(user, perm),
            success: req.query.success,
            error: req.query.error
        });
    });

    // Create Business Admin Subordinate
    router.post('/api/business/team/add', requireBusinessAdmin, requireBusinessPermission('business_team_manage'), (req, res) => {
        try {
            const { userId, permissions, notes } = req.body;
            const targetUserId = parseInt(userId, 10);
            
            // Validate the target user exists and is not already a business admin
            const targetUser = getUserById(targetUserId);
            if (!targetUser) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Upgrade user to business_admin role
            db.prepare(`UPDATE users SET role = 'business_admin', admin_permissions = ? WHERE id = ?`).run(
                JSON.stringify(permissions || []),
                targetUserId
            );
            
            // Create the assignment relationship
            createBusinessAdminAssignment({
                parentAdminId: req.session.userId,
                assignedAdminId: targetUserId,
                permissions: permissions || [],
                notes
            });
            
            addAuditLog({
                userId: req.session.userId,
                action: 'create_business_admin',
                details: JSON.stringify({ targetUserId, permissions })
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Create business admin error:', error);
            res.status(500).json({ error: 'Failed to create business admin' });
        }
    });

    // Update Business Admin Permissions
    router.post('/api/business/team/:id/permissions', requireBusinessAdmin, requireBusinessPermission('business_team_manage'), (req, res) => {
        try {
            const assignmentId = parseInt(req.params.id, 10);
            const { permissions, scopes } = req.body;
            
            updateBusinessAdminAssignment({
                assignmentId,
                permissions,
                scopes
            });
            
            // Also update the user's admin_permissions
            const assignment = db.prepare('SELECT assigned_admin_id FROM business_admin_assignments WHERE id = ?').get(assignmentId);
            if (assignment) {
                db.prepare(`UPDATE users SET admin_permissions = ? WHERE id = ?`).run(
                    JSON.stringify(permissions || []),
                    assignment.assigned_admin_id
                );
            }
            
            addAuditLog({
                userId: req.session.userId,
                action: 'update_business_admin_permissions',
                details: JSON.stringify({ assignmentId, permissions })
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Update permissions error:', error);
            res.status(500).json({ error: 'Failed to update permissions' });
        }
    });

    // Revoke Business Admin
    router.post('/api/business/team/:id/revoke', requireBusinessAdmin, requireBusinessPermission('business_team_manage'), (req, res) => {
        try {
            const assignmentId = parseInt(req.params.id, 10);
            
            // Get the assignment to find the user
            const assignment = db.prepare('SELECT assigned_admin_id FROM business_admin_assignments WHERE id = ?').get(assignmentId);
            
            if (assignment) {
                // Downgrade user back to regular user
                db.prepare(`UPDATE users SET role = 'user', admin_permissions = '[]', admin_scopes = '[]' WHERE id = ?`).run(
                    assignment.assigned_admin_id
                );
            }
            
            revokeBusinessAdminAssignment(assignmentId);
            
            addAuditLog({
                userId: req.session.userId,
                action: 'revoke_business_admin',
                details: JSON.stringify({ assignmentId })
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Revoke business admin error:', error);
            res.status(500).json({ error: 'Failed to revoke business admin' });
        }
    });

    // Search users for adding to team
    router.get('/api/business/users/search', requireBusinessAdmin, requireBusinessPermission('business_team_manage'), (req, res) => {
        try {
            const q = (req.query.q || '').trim();
            if (q.length < 2) {
                return res.json({ users: [] });
            }
            
            const users = db.prepare(`
                SELECT id, full_name, email, role, profile_picture
                FROM users
                WHERE (LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?)
                AND role IN ('user', 'business_admin')
                LIMIT 10
            `).all(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
            
            res.json({ users });
        } catch (error) {
            console.error('User search error:', error);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    // ====================
    // PRICING MANAGEMENT
    // ====================

    // Pricing Management Page
    router.get('/business/pricing', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        const user = req.businessUser;
        const tiers = getPricingTiers(true); // Include inactive tiers for management

        res.render('business-pricing', {
            title: 'Pricing Management - Dream X',
            currentPage: 'business-pricing',
            authUser: { ...user, displayName: user.full_name },
            tiers,
            hasPermission: (perm) => hasBusinessPermission(user, perm),
            success: req.query.success,
            error: req.query.error
        });
    });

    // Get all pricing tiers (API)
    router.get('/api/business/pricing', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        try {
            const tiers = getPricingTiers(req.query.includeInactive === 'true');
            res.json({ success: true, tiers });
        } catch (error) {
            console.error('Get pricing tiers error:', error);
            res.status(500).json({ error: 'Failed to get pricing tiers' });
        }
    });

    // Get single tier (API)
    router.get('/api/business/pricing/:tierId', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        try {
            const tier = getPricingTier(req.params.tierId);
            if (!tier) {
                return res.status(404).json({ error: 'Tier not found' });
            }
            res.json({ success: true, tier });
        } catch (error) {
            console.error('Get pricing tier error:', error);
            res.status(500).json({ error: 'Failed to get pricing tier' });
        }
    });

    // Update pricing tier
    router.post('/api/business/pricing/:tierId', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        try {
            const { name, price, priceDisplay, tagline, features, isHighlighted, displayOrder, isActive, note } = req.body;
            
            const updated = updatePricingTier({
                tierId: req.params.tierId,
                name,
                price: price !== undefined ? parseFloat(price) : undefined,
                priceDisplay,
                tagline,
                features: features ? (Array.isArray(features) ? features : safeParseJSON(features, [])) : undefined,
                isHighlighted,
                displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : undefined,
                isActive,
                note
            });

            if (updated) {
                addAuditLog({
                    userId: req.session.userId,
                    action: 'update_pricing_tier',
                    details: JSON.stringify({ tierId: req.params.tierId, changes: req.body })
                });
            }

            res.json({ success: updated });
        } catch (error) {
            console.error('Update pricing tier error:', error);
            res.status(500).json({ error: 'Failed to update pricing tier' });
        }
    });

    // Create new pricing tier
    router.post('/api/business/pricing', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        try {
            const { tierId, name, price, priceDisplay, tagline, features, isHighlighted, displayOrder, isActive, note } = req.body;
            
            if (!tierId || !name) {
                return res.status(400).json({ error: 'Tier ID and name are required' });
            }

            // Check if tier ID already exists
            const existing = getPricingTier(tierId);
            if (existing) {
                return res.status(409).json({ error: 'Tier ID already exists' });
            }

            const id = createPricingTier({
                tierId,
                name,
                price: parseFloat(price) || 0,
                priceDisplay: priceDisplay || `$${price}/mo`,
                tagline,
                features: features ? (Array.isArray(features) ? features : safeParseJSON(features, [])) : [],
                isHighlighted: !!isHighlighted,
                displayOrder: parseInt(displayOrder) || 0,
                isActive: isActive !== false,
                note
            });

            addAuditLog({
                userId: req.session.userId,
                action: 'create_pricing_tier',
                details: JSON.stringify({ tierId, name })
            });

            res.json({ success: true, id });
        } catch (error) {
            console.error('Create pricing tier error:', error);
            res.status(500).json({ error: 'Failed to create pricing tier' });
        }
    });

    // Delete pricing tier
    router.delete('/api/business/pricing/:tierId', requireBusinessAdmin, requireBusinessPermission('pricing_customization'), (req, res) => {
        try {
            const deleted = deletePricingTier(req.params.tierId);
            
            if (deleted) {
                addAuditLog({
                    userId: req.session.userId,
                    action: 'delete_pricing_tier',
                    details: JSON.stringify({ tierId: req.params.tierId })
                });
            }

            res.json({ success: deleted });
        } catch (error) {
            console.error('Delete pricing tier error:', error);
            res.status(500).json({ error: 'Failed to delete pricing tier' });
        }
    });

    return router;
}

module.exports = initBusinessRoutes;

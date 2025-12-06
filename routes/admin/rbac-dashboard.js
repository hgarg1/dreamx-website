/**
 * RBAC Admin Dashboard Routes
 */
const express = require('express');
const router = express.Router();
const { getUserById } = require('../../db');
const rbacService = require('../../services/rbac');
const { hasPermission, isRbacReady } = require('../../middleware/rbac');
const { isSuperAdmin, isAdmin, isGlobalAdmin } = require('../../middleware/auth');

// GET /dashboard
router.get('/', isRbacReady, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

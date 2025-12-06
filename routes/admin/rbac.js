const { getUserById } = require('../../db');
const rbacService = require('../../services/rbac');
const { requirePermission, requireAnyPermission, hasPermission } = require('../../middleware/rbac');
const { isSuperAdmin, isAdmin } = require('../../middleware/auth');

/**
 * RBAC Admin API Routes
 */
module.exports = (app) => {
    app.get('/admin/rbac/users/:userId', async (req, res) => {
        try {
            const user = await getUserById(req.params.userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json(user);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.get('/admin/rbac/users', async (req, res) => {
        try {
            const users = await rbacService.getAllUsers();
            res.json(users);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.post('/admin/rbac/users/:userId', async (req, res) => {
        try {
            const user = await getUserById(req.params.userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json(user);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    });
};

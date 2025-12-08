/**
 * Admin Theme Management Routes
 * 
 * Provides API endpoints for managing global theme settings:
 * - View available themes
 * - Set active theme
 * - Create custom themes
 * - View theme history
 */

const express = require('express');
const router = express.Router();
const { getUserById, addAuditLog } = require('../../db');
const themeService = require('../../services/theme');

// =============================================================================
// MIDDLEWARE
// =============================================================================

function requireAdmin(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'global_admin');
  if (!isAdmin) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.redirect('/');
  }
  req.adminUser = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  const isSuperAdmin = user && (user.role === 'super_admin' || user.role === 'global_admin');
  if (!isSuperAdmin) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    return res.redirect('/admin?error=Insufficient+permissions');
  }
  req.adminUser = user;
  next();
}

// =============================================================================
// THEME MANAGEMENT PAGE
// =============================================================================

/**
 * GET /admin/theme
 * Theme management dashboard
 */
router.get('/', requireSuperAdmin, (req, res) => {
  try {
    const availableThemes = themeService.getAvailableThemes();
    const customThemes = themeService.getCustomThemes();
    const activeTheme = themeService.getActiveTheme();
    const themeHistory = themeService.getThemeHistory(25);
    
    res.render('admin/admin-theme', {
      title: 'Theme Management - Admin - Dream X',
      currentPage: 'admin',
      authUser: req.adminUser,
      availableThemes,
      customThemes,
      activeTheme,
      themeHistory,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Theme management page error:', error);
    res.redirect('/admin?error=Failed+to+load+theme+settings');
  }
});

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * GET /admin/theme/api/themes
 * Get all available themes (predefined + custom)
 */
router.get('/api/themes', requireAdmin, (req, res) => {
  try {
    const predefined = themeService.getAvailableThemes();
    const custom = themeService.getCustomThemes();
    const active = themeService.getActiveTheme();
    
    res.json({
      success: true,
      predefined,
      custom,
      active,
      activeThemeId: active?.id || 'dream-x'
    });
  } catch (error) {
    console.error('Get themes error:', error);
    res.status(500).json({ success: false, error: 'Failed to get themes' });
  }
});

/**
 * GET /admin/theme/api/themes/:themeId
 * Get theme by ID with full details
 */
router.get('/api/themes/:themeId', requireAdmin, (req, res) => {
  try {
    const { themeId } = req.params;
    const theme = themeService.getThemeById(themeId);
    
    if (!theme) {
      return res.status(404).json({ success: false, error: 'Theme not found' });
    }
    
    res.json({ success: true, theme });
  } catch (error) {
    console.error('Get theme error:', error);
    res.status(500).json({ success: false, error: 'Failed to get theme' });
  }
});

/**
 * GET /admin/theme/api/themes/:themeId/preview
 * Get theme preview data
 */
router.get('/api/themes/:themeId/preview', requireAdmin, (req, res) => {
  try {
    const { themeId } = req.params;
    const preview = themeService.getThemePreview(themeId);
    
    if (!preview) {
      return res.status(404).json({ success: false, error: 'Theme not found' });
    }
    
    res.json({ success: true, preview });
  } catch (error) {
    console.error('Get theme preview error:', error);
    res.status(500).json({ success: false, error: 'Failed to get preview' });
  }
});

/**
 * GET /admin/theme/api/themes/:themeId/css
 * Get generated CSS for a theme
 */
router.get('/api/themes/:themeId/css', requireAdmin, (req, res) => {
  try {
    const { themeId } = req.params;
    const theme = themeService.getThemeById(themeId);
    
    if (!theme) {
      return res.status(404).json({ success: false, error: 'Theme not found' });
    }
    
    const css = themeService.generateThemeCSS(theme);
    
    if (req.query.format === 'raw') {
      res.setHeader('Content-Type', 'text/css');
      return res.send(css);
    }
    
    res.json({ success: true, css });
  } catch (error) {
    console.error('Get theme CSS error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate CSS' });
  }
});

/**
 * POST /admin/theme/api/activate
 * Activate a theme globally
 */
router.post('/api/activate', requireSuperAdmin, (req, res) => {
  try {
    const { themeId } = req.body;
    
    if (!themeId) {
      return res.status(400).json({ success: false, error: 'Theme ID required' });
    }
    
    const theme = themeService.setActiveTheme(themeId, req.adminUser.id);
    
    // Log the action
    try {
      addAuditLog({
        userId: req.adminUser.id,
        action: 'theme_activated',
        details: JSON.stringify({ themeId, themeName: theme.name })
      });
    } catch (e) {
      console.warn('Audit log failed:', e.message);
    }
    
    res.json({
      success: true,
      message: `Theme "${theme.name}" activated successfully`,
      theme
    });
  } catch (error) {
    console.error('Activate theme error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to activate theme' });
  }
});

/**
 * POST /admin/theme/api/custom
 * Save a custom theme
 */
router.post('/api/custom', requireSuperAdmin, (req, res) => {
  try {
    const { id, name, description, colors } = req.body;
    
    if (!id || !name || !colors) {
      return res.status(400).json({ 
        success: false, 
        error: 'Theme ID, name, and colors are required' 
      });
    }
    
    const themeData = {
      id,
      name,
      description: description || '',
      isDefault: false,
      colors
    };
    
    const savedTheme = themeService.saveCustomTheme(themeData, req.adminUser.id);
    
    // Log the action
    try {
      addAuditLog({
        userId: req.adminUser.id,
        action: 'theme_custom_created',
        details: JSON.stringify({ themeId: id, themeName: name })
      });
    } catch (e) {
      console.warn('Audit log failed:', e.message);
    }
    
    res.json({
      success: true,
      message: `Custom theme "${name}" saved successfully`,
      theme: savedTheme
    });
  } catch (error) {
    console.error('Save custom theme error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to save custom theme' });
  }
});

/**
 * DELETE /admin/theme/api/custom/:themeId
 * Delete a custom theme
 */
router.delete('/api/custom/:themeId', requireSuperAdmin, (req, res) => {
  try {
    const { themeId } = req.params;
    
    themeService.deleteCustomTheme(themeId, req.adminUser.id);
    
    // Log the action
    try {
      addAuditLog({
        userId: req.adminUser.id,
        action: 'theme_custom_deleted',
        details: JSON.stringify({ themeId })
      });
    } catch (e) {
      console.warn('Audit log failed:', e.message);
    }
    
    res.json({
      success: true,
      message: 'Custom theme deleted successfully'
    });
  } catch (error) {
    console.error('Delete custom theme error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete theme' });
  }
});

/**
 * GET /admin/theme/api/history
 * Get theme change history
 */
router.get('/api/history', requireSuperAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const history = themeService.getThemeHistory(limit);
    
    res.json({ success: true, history });
  } catch (error) {
    console.error('Get theme history error:', error);
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

/**
 * GET /admin/theme/api/active
 * Get current active theme
 */
router.get('/api/active', (req, res) => {
  try {
    const activeTheme = themeService.getActiveTheme();
    const css = themeService.generateThemeCSS(activeTheme);
    
    res.json({
      success: true,
      theme: activeTheme,
      css
    });
  } catch (error) {
    console.error('Get active theme error:', error);
    res.status(500).json({ success: false, error: 'Failed to get active theme' });
  }
});

/**
 * GET /admin/theme/active.css
 * Serve active theme as CSS file (can be linked in HTML)
 */
router.get('/active.css', (req, res) => {
  try {
    const activeTheme = themeService.getActiveTheme();
    const css = themeService.generateThemeCSS(activeTheme);
    
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minute cache
    res.send(css);
  } catch (error) {
    console.error('Serve active theme CSS error:', error);
    res.setHeader('Content-Type', 'text/css');
    res.send('/* Theme CSS unavailable */');
  }
});

module.exports = router;

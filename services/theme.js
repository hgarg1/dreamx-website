/**
 * Theme Service
 * 
 * Provides global theme management for the Dream X platform:
 * - Multiple color palettes (Ocean Blue, Forest Green, Royal Purple, etc.)
 * - Admin-controlled global theme override
 * - Theme preview and live switching
 * - Custom theme creation
 */

const path = require('path');
const fs = require('fs');

const isPostgres = process.env.NODE_ENV === 'Production' && (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql');

// Lazy load database
let db = null;

function initDb() {
  if (!db) {
    try {
      const dbModule = require('../db');
      db = dbModule.db;
    } catch (e) {
      console.warn('Theme Service: Database not available');
    }
  }
  return db;
}

// =============================================================================
// PREDEFINED THEMES
// =============================================================================

const PREDEFINED_THEMES = {
  'dream-x': {
    id: 'dream-x',
    name: 'Dream X',
    description: 'The original Dream X theme with vibrant pink and cyan accents',
    isDefault: true,
    colors: {
      // Primary palette (Pink/Magenta)
      primaryColor: '#FF4DFF',
      primaryHover: '#D845FF',
      primaryLight: '#A53CFF',
      primaryDark: '#D845FF',
      
      // Secondary palette (Cyan)
      cyanColor: '#3FD6FF',
      cyanHover: '#2BB6FF',
      cyanLight: '#6AE6FF',
      cyanDark: '#2BB6FF',
      
      // Tertiary (Purple)
      secondaryColor: '#A53CFF',
      secondaryHover: '#D845FF',
      
      // Text colors
      textDark: '#1f2937',
      textMedium: '#4b5563',
      textLight: '#6b7280',
      textLighter: '#9ca3af',
      
      // Background colors
      bgLight: '#f9fafb',
      bgWhite: '#ffffff',
      bgGray: '#f3f4f6',
      
      // Borders
      borderColor: '#e5e7eb',
      borderFocus: '#fce7f3',
      
      // Status colors
      successColor: '#10b981',
      successLight: '#d1fae5',
      errorColor: '#ef4444',
      errorLight: '#fee2e2',
      warningColor: '#f59e0b',
      infoColor: '#3b82f6',
      
      // Gradients
      gradientPrimary: 'linear-gradient(135deg, #FF4DFF 0%, #A53CFF 100%)',
      gradientCyan: 'linear-gradient(135deg, #3FD6FF 0%, #2BB6FF 50%, #6AE6FF 100%)',
      gradientXLogo: 'linear-gradient(135deg, #FF4DFF 0%, #A53CFF 50%, #3FD6FF 100%)',
      
      // Shadows
      shadowPink: '0 8px 24px rgba(255, 77, 255, 0.25)',
      shadowCyan: '0 8px 24px rgba(63, 214, 255, 0.25)',
    }
  },
  
  'ocean-blue': {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    description: 'A calm and professional theme with blue tones',
    isDefault: false,
    colors: {
      primaryColor: '#3B82F6',
      primaryHover: '#2563EB',
      primaryLight: '#60A5FA',
      primaryDark: '#1D4ED8',
      
      cyanColor: '#06B6D4',
      cyanHover: '#0891B2',
      cyanLight: '#22D3EE',
      cyanDark: '#0E7490',
      
      secondaryColor: '#6366F1',
      secondaryHover: '#4F46E5',
      
      textDark: '#1e293b',
      textMedium: '#475569',
      textLight: '#64748b',
      textLighter: '#94a3b8',
      
      bgLight: '#f8fafc',
      bgWhite: '#ffffff',
      bgGray: '#f1f5f9',
      
      borderColor: '#e2e8f0',
      borderFocus: '#dbeafe',
      
      successColor: '#10b981',
      successLight: '#d1fae5',
      errorColor: '#ef4444',
      errorLight: '#fee2e2',
      warningColor: '#f59e0b',
      infoColor: '#3b82f6',
      
      gradientPrimary: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
      gradientCyan: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
      gradientXLogo: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 50%, #06B6D4 100%)',
      
      shadowPink: '0 8px 24px rgba(59, 130, 246, 0.25)',
      shadowCyan: '0 8px 24px rgba(6, 182, 212, 0.25)',
    }
  },
  
  'forest-green': {
    id: 'forest-green',
    name: 'Forest Green',
    description: 'A natural and earthy theme with green accents',
    isDefault: false,
    colors: {
      primaryColor: '#22C55E',
      primaryHover: '#16A34A',
      primaryLight: '#4ADE80',
      primaryDark: '#15803D',
      
      cyanColor: '#14B8A6',
      cyanHover: '#0D9488',
      cyanLight: '#2DD4BF',
      cyanDark: '#0F766E',
      
      secondaryColor: '#84CC16',
      secondaryHover: '#65A30D',
      
      textDark: '#1a2e1a',
      textMedium: '#3d5a3d',
      textLight: '#5c7c5c',
      textLighter: '#8ba88b',
      
      bgLight: '#f7fdf7',
      bgWhite: '#ffffff',
      bgGray: '#f0fdf0',
      
      borderColor: '#dcfce7',
      borderFocus: '#bbf7d0',
      
      successColor: '#22c55e',
      successLight: '#dcfce7',
      errorColor: '#ef4444',
      errorLight: '#fee2e2',
      warningColor: '#f59e0b',
      infoColor: '#3b82f6',
      
      gradientPrimary: 'linear-gradient(135deg, #22C55E 0%, #84CC16 100%)',
      gradientCyan: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
      gradientXLogo: 'linear-gradient(135deg, #22C55E 0%, #14B8A6 50%, #84CC16 100%)',
      
      shadowPink: '0 8px 24px rgba(34, 197, 94, 0.25)',
      shadowCyan: '0 8px 24px rgba(20, 184, 166, 0.25)',
    }
  },
  
  'royal-purple': {
    id: 'royal-purple',
    name: 'Royal Purple',
    description: 'An elegant and regal theme with purple hues',
    isDefault: false,
    colors: {
      primaryColor: '#8B5CF6',
      primaryHover: '#7C3AED',
      primaryLight: '#A78BFA',
      primaryDark: '#6D28D9',
      
      cyanColor: '#EC4899',
      cyanHover: '#DB2777',
      cyanLight: '#F472B6',
      cyanDark: '#BE185D',
      
      secondaryColor: '#6366F1',
      secondaryHover: '#4F46E5',
      
      textDark: '#2e1a47',
      textMedium: '#553d75',
      textLight: '#7c5d9c',
      textLighter: '#a78dc4',
      
      bgLight: '#faf5ff',
      bgWhite: '#ffffff',
      bgGray: '#f5f3ff',
      
      borderColor: '#e9d5ff',
      borderFocus: '#ddd6fe',
      
      successColor: '#10b981',
      successLight: '#d1fae5',
      errorColor: '#ef4444',
      errorLight: '#fee2e2',
      warningColor: '#f59e0b',
      infoColor: '#8b5cf6',
      
      gradientPrimary: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
      gradientCyan: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
      gradientXLogo: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #6366F1 100%)',
      
      shadowPink: '0 8px 24px rgba(139, 92, 246, 0.25)',
      shadowCyan: '0 8px 24px rgba(236, 72, 153, 0.25)',
    }
  },
  
  'sunset-orange': {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    description: 'A warm and energetic theme with orange and red tones',
    isDefault: false,
    colors: {
      primaryColor: '#F97316',
      primaryHover: '#EA580C',
      primaryLight: '#FB923C',
      primaryDark: '#C2410C',
      
      cyanColor: '#EF4444',
      cyanHover: '#DC2626',
      cyanLight: '#F87171',
      cyanDark: '#B91C1C',
      
      secondaryColor: '#FBBF24',
      secondaryHover: '#F59E0B',
      
      textDark: '#431407',
      textMedium: '#7c2d12',
      textLight: '#9a3412',
      textLighter: '#c2410c',
      
      bgLight: '#fffbeb',
      bgWhite: '#ffffff',
      bgGray: '#fef3c7',
      
      borderColor: '#fed7aa',
      borderFocus: '#ffedd5',
      
      successColor: '#10b981',
      successLight: '#d1fae5',
      errorColor: '#dc2626',
      errorLight: '#fee2e2',
      warningColor: '#f97316',
      infoColor: '#3b82f6',
      
      gradientPrimary: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
      gradientCyan: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      gradientXLogo: 'linear-gradient(135deg, #F97316 0%, #EF4444 50%, #FBBF24 100%)',
      
      shadowPink: '0 8px 24px rgba(249, 115, 22, 0.25)',
      shadowCyan: '0 8px 24px rgba(239, 68, 68, 0.25)',
    }
  },
  
  'midnight-dark': {
    id: 'midnight-dark',
    name: 'Midnight Dark',
    description: 'A dark theme for reduced eye strain',
    isDefault: false,
    isDark: true,
    colors: {
      primaryColor: '#818CF8',
      primaryHover: '#6366F1',
      primaryLight: '#A5B4FC',
      primaryDark: '#4F46E5',
      
      cyanColor: '#22D3EE',
      cyanHover: '#06B6D4',
      cyanLight: '#67E8F9',
      cyanDark: '#0891B2',
      
      secondaryColor: '#F472B6',
      secondaryHover: '#EC4899',
      
      textDark: '#f8fafc',
      textMedium: '#e2e8f0',
      textLight: '#cbd5e1',
      textLighter: '#94a3b8',
      
      bgLight: '#1e293b',
      bgWhite: '#0f172a',
      bgGray: '#334155',
      
      borderColor: '#475569',
      borderFocus: '#64748b',
      
      successColor: '#4ade80',
      successLight: '#166534',
      errorColor: '#f87171',
      errorLight: '#991b1b',
      warningColor: '#fbbf24',
      infoColor: '#60a5fa',
      
      gradientPrimary: 'linear-gradient(135deg, #818CF8 0%, #F472B6 100%)',
      gradientCyan: 'linear-gradient(135deg, #22D3EE 0%, #06B6D4 100%)',
      gradientXLogo: 'linear-gradient(135deg, #818CF8 0%, #22D3EE 50%, #F472B6 100%)',
      
      shadowPink: '0 8px 24px rgba(129, 140, 248, 0.3)',
      shadowCyan: '0 8px 24px rgba(34, 211, 238, 0.3)',
    }
  },
  
  'cherry-blossom': {
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    description: 'A soft, delicate theme inspired by spring',
    isDefault: false,
    colors: {
      primaryColor: '#F472B6',
      primaryHover: '#EC4899',
      primaryLight: '#F9A8D4',
      primaryDark: '#DB2777',
      
      cyanColor: '#FDA4AF',
      cyanHover: '#FB7185',
      cyanLight: '#FECDD3',
      cyanDark: '#F43F5E',
      
      secondaryColor: '#C084FC',
      secondaryHover: '#A855F7',
      
      textDark: '#4a1942',
      textMedium: '#6b3060',
      textLight: '#9d5088',
      textLighter: '#c77daf',
      
      bgLight: '#fdf2f8',
      bgWhite: '#ffffff',
      bgGray: '#fce7f3',
      
      borderColor: '#fbcfe8',
      borderFocus: '#f9a8d4',
      
      successColor: '#10b981',
      successLight: '#d1fae5',
      errorColor: '#ef4444',
      errorLight: '#fee2e2',
      warningColor: '#f59e0b',
      infoColor: '#ec4899',
      
      gradientPrimary: 'linear-gradient(135deg, #F472B6 0%, #C084FC 100%)',
      gradientCyan: 'linear-gradient(135deg, #FDA4AF 0%, #FB7185 100%)',
      gradientXLogo: 'linear-gradient(135deg, #F472B6 0%, #C084FC 50%, #FDA4AF 100%)',
      
      shadowPink: '0 8px 24px rgba(244, 114, 182, 0.25)',
      shadowCyan: '0 8px 24px rgba(253, 164, 175, 0.25)',
    }
  }
};

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

/**
 * Get all available themes
 */
function getAvailableThemes() {
  return Object.values(PREDEFINED_THEMES);
}

/**
 * Get theme by ID
 */
function getThemeById(themeId) {
  return PREDEFINED_THEMES[themeId] || null;
}

/**
 * Get the currently active global theme
 */
async function getActiveTheme() {
  const database = initDb();
  if (!database) {
    return PREDEFINED_THEMES['dream-x'];
  }
  
  try {
    // Ensure theme settings table exists
    await createThemeSettingsTable();
    
    const setting = await database.prepare(`
      SELECT * FROM theme_settings WHERE setting_key = 'active_theme' AND is_enabled = 1
    `).get();
    
    if (setting && setting.setting_value) {
      const themeId = setting.setting_value;
      
      // Check if it's a custom theme
      if (setting.custom_theme_data) {
        try {
          return JSON.parse(setting.custom_theme_data);
        } catch (e) {
          console.warn('Failed to parse custom theme data');
        }
      }
      
      // Return predefined theme
      return PREDEFINED_THEMES[themeId] || PREDEFINED_THEMES['dream-x'];
    }
    
    return PREDEFINED_THEMES['dream-x'];
  } catch (error) {
    console.warn('Failed to get active theme:', error.message);
    return PREDEFINED_THEMES['dream-x'];
  }
}

/**
 * Set the active global theme
 */
async function setActiveTheme(themeId, changedBy = null) {
  const database = initDb();
  if (!database) {
    throw new Error('Database not available');
  }
  
  const theme = PREDEFINED_THEMES[themeId];
  if (!theme) {
    throw new Error(`Theme '${themeId}' not found`);
  }
  
  try {
    // Ensure table exists
    await createThemeSettingsTable();
    
    // Check if setting exists
    const existing = await database.prepare(`
      SELECT id FROM theme_settings WHERE setting_key = 'active_theme'
    `).get();
    
    if (existing) {
      await database.prepare(`
        UPDATE theme_settings 
        SET setting_value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE setting_key = 'active_theme'
      `).run(themeId, changedBy);
    } else {
      await database.prepare(`
        INSERT INTO theme_settings (setting_key, setting_value, is_enabled, updated_by)
        VALUES ('active_theme', ?, 1, ?)
      `).run(themeId, changedBy);
    }
    
    // Log the change
    await logThemeChange('theme.change', themeId, changedBy);
    
    return theme;
  } catch (error) {
    console.error('Failed to set active theme:', error);
    throw error;
  }
}

/**
 * Create theme settings table if it doesn't exist
 */
async function createThemeSettingsTable() {
  const database = initDb();
  if (!database) return;
  
  try {
    if (isPostgres) {
      // PostgreSQL-safe creation (idempotent)
      await database.exec(`
        CREATE TABLE IF NOT EXISTS theme_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(255) NOT NULL UNIQUE,
          setting_value TEXT,
          custom_theme_data TEXT,
          is_enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_theme_settings_key ON theme_settings(setting_key);
        CREATE INDEX IF NOT EXISTS idx_theme_settings_enabled ON theme_settings(is_enabled);
        
        CREATE TABLE IF NOT EXISTS theme_change_log (
          id SERIAL PRIMARY KEY,
          action VARCHAR(255) NOT NULL,
          theme_id VARCHAR(255),
          theme_data TEXT,
          changed_by INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_theme_log_created ON theme_change_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_theme_log_action ON theme_change_log(action);
      `);
    } else {
      // SQLite fallback for local development
      await database.exec(`
        CREATE TABLE IF NOT EXISTS theme_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT NOT NULL UNIQUE,
          setting_value TEXT,
          custom_theme_data TEXT,
          is_enabled INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_by INTEGER
        )
      `);
      
      await database.exec(`
        CREATE TABLE IF NOT EXISTS theme_change_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          theme_id TEXT,
          theme_data TEXT,
          changed_by INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (error) {
    // Tables might already exist or this is PostgreSQL (tables should be in schema-postgres.sql)
  }
}

/**
 * Log theme changes for audit
 */
async function logThemeChange(action, themeId, changedBy, themeData = null) {
  const database = initDb();
  if (!database) return;
  
  try {
    await database.prepare(`
      INSERT INTO theme_change_log (action, theme_id, theme_data, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(action, themeId, themeData ? JSON.stringify(themeData) : null, changedBy);
  } catch (error) {
    // Ignore logging errors
  }
}

/**
 * Get theme change history
 */
function getThemeHistory(limit = 50) {
  const database = initDb();
  if (!database) return [];
  
  try {
    return database.prepare(`
      SELECT tcl.*, u.full_name as changed_by_name, u.email as changed_by_email
      FROM theme_change_log tcl
      LEFT JOIN users u ON u.id = tcl.changed_by
      ORDER BY tcl.created_at DESC
      LIMIT ?
    `).all(limit);
  } catch (error) {
    return [];
  }
}

/**
 * Save a custom theme
 */
async function saveCustomTheme(themeData, savedBy = null) {
  const database = initDb();
  if (!database) {
    throw new Error('Database not available');
  }
  
  if (!themeData.id || !themeData.name || !themeData.colors) {
    throw new Error('Invalid theme data');
  }
  
  // Validate theme ID format
  const themeId = themeData.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  // Don't allow overwriting predefined themes
  if (PREDEFINED_THEMES[themeId]) {
    throw new Error('Cannot overwrite predefined themes');
  }
  
  try {
    await createThemeSettingsTable();
    
    const key = `custom_theme_${themeId}`;
    const existing = await database.prepare(`
      SELECT id FROM theme_settings WHERE setting_key = ?
    `).get(key);
    
    const themeJson = JSON.stringify(themeData);
    
    if (existing) {
      await database.prepare(`
        UPDATE theme_settings 
        SET setting_value = ?, custom_theme_data = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE setting_key = ?
      `).run(themeId, themeJson, savedBy, key);
    } else {
      await database.prepare(`
        INSERT INTO theme_settings (setting_key, setting_value, custom_theme_data, is_enabled, updated_by)
        VALUES (?, ?, ?, 1, ?)
      `).run(key, themeId, themeJson, savedBy);
    }
    
    await logThemeChange('theme.custom.save', themeId, savedBy, themeData);
    
    return themeData;
  } catch (error) {
    console.error('Failed to save custom theme:', error);
    throw error;
  }
}

/**
 * Get all custom themes
 */
function getCustomThemes() {
  const database = initDb();
  if (!database) return [];
  
  try {
    const results = database.prepare(`
      SELECT * FROM theme_settings WHERE setting_key LIKE 'custom_theme_%' AND is_enabled = 1
    `).all();
    
    return results.map(r => {
      try {
        return JSON.parse(r.custom_theme_data);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Delete a custom theme
 */
function deleteCustomTheme(themeId, deletedBy = null) {
  const database = initDb();
  if (!database) {
    throw new Error('Database not available');
  }
  
  // Don't allow deleting predefined themes
  if (PREDEFINED_THEMES[themeId]) {
    throw new Error('Cannot delete predefined themes');
  }
  
  try {
    const key = `custom_theme_${themeId}`;
    database.prepare(`
      UPDATE theme_settings SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE setting_key = ?
    `).run(deletedBy, key);
    
    // If this was the active theme, reset to default
    const active = getActiveTheme();
    if (active && active.id === themeId) {
      setActiveTheme('dream-x', deletedBy);
    }
    
    logThemeChange('theme.custom.delete', themeId, deletedBy);
    
    return true;
  } catch (error) {
    console.error('Failed to delete custom theme:', error);
    throw error;
  }
}

/**
 * Generate CSS variables from theme
 */
function generateThemeCSS(theme) {
  if (!theme || !theme.colors) {
    return '';
  }
  
  const css = [];
  css.push(':root {');
  
  // Map theme colors to CSS variables
  const cssVarMap = {
    primaryColor: '--primary-color',
    primaryHover: '--primary-hover',
    primaryLight: '--primary-light',
    primaryDark: '--primary-dark',
    cyanColor: '--cyan-color',
    cyanHover: '--cyan-hover',
    cyanLight: '--cyan-light',
    cyanDark: '--cyan-dark',
    secondaryColor: '--secondary-color',
    secondaryHover: '--secondary-hover',
    textDark: '--text-dark',
    textMedium: '--text-medium',
    textLight: '--text-light',
    textLighter: '--text-lighter',
    bgLight: '--bg-light',
    bgWhite: '--bg-white',
    bgGray: '--bg-gray',
    borderColor: '--border-color',
    borderFocus: '--border-focus',
    successColor: '--success-color',
    successLight: '--success-light',
    errorColor: '--error-color',
    errorLight: '--error-light',
    warningColor: '--warning-color',
    infoColor: '--info-color',
    gradientPrimary: '--gradient-primary',
    gradientCyan: '--gradient-cyan',
    gradientXLogo: '--gradient-x-logo',
    shadowPink: '--shadow-pink',
    shadowCyan: '--shadow-cyan',
  };
  
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    if (theme.colors[key]) {
      css.push(`  ${cssVar}: ${theme.colors[key]};`);
    }
  }
  
  // Add gradient secondary based on primary and cyan
  css.push(`  --gradient-secondary: ${theme.colors.gradientXLogo || theme.colors.gradientPrimary};`);
  
  // Add shadow variations
  const primaryRgb = hexToRgb(theme.colors.primaryColor);
  if (primaryRgb) {
    css.push(`  --shadow-pink-lg: 0 16px 48px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.3);`);
  }
  
  const cyanRgb = hexToRgb(theme.colors.cyanColor);
  if (cyanRgb) {
    css.push(`  --shadow-cyan-lg: 0 16px 48px rgba(${cyanRgb.r}, ${cyanRgb.g}, ${cyanRgb.b}, 0.3);`);
  }
  
  css.push('}');
  
  // Add dark mode specific overrides if it's a dark theme
  if (theme.isDark) {
    css.push('');
    css.push('body {');
    css.push('  background-color: ' + theme.colors.bgWhite + ';');
    css.push('  color: ' + theme.colors.textDark + ';');
    css.push('}');
    
    // Override card and panel backgrounds for dark theme
    css.push('');
    css.push('.settings-card, .panel, .stat-card, .admin-card, .feed-card, .post-card {');
    css.push('  background: ' + theme.colors.bgLight + ' !important;');
    css.push('  border-color: ' + theme.colors.borderColor + ' !important;');
    css.push('}');
    
    css.push('');
    css.push('.settings-input, .form-control, input, select, textarea {');
    css.push('  background: ' + theme.colors.bgGray + ' !important;');
    css.push('  border-color: ' + theme.colors.borderColor + ' !important;');
    css.push('  color: ' + theme.colors.textDark + ' !important;');
    css.push('}');
    
    css.push('');
    css.push('nav, .navbar, .sidebar, header {');
    css.push('  background: ' + theme.colors.bgLight + ' !important;');
    css.push('}');
  }
  
  return css.join('\n');
}

/**
 * Helper: Convert hex to RGB
 */
function hexToRgb(hex) {
  if (!hex) return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Get theme preview data for UI
 */
function getThemePreview(themeId) {
  const theme = PREDEFINED_THEMES[themeId];
  if (!theme) return null;
  
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    isDark: theme.isDark || false,
    previewColors: {
      primary: theme.colors.primaryColor,
      secondary: theme.colors.cyanColor,
      accent: theme.colors.secondaryColor,
      background: theme.colors.bgWhite,
      text: theme.colors.textDark,
    }
  };
}

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

/**
 * Middleware to inject active theme into response
 */
async function themeMiddleware(req, res, next) {
  try {
    const activeTheme = await getActiveTheme();
    const themeCSS = generateThemeCSS(activeTheme);
    
    // Make theme available to templates
    res.locals.activeTheme = activeTheme;
    res.locals.themeCSS = themeCSS;
    res.locals.availableThemes = getAvailableThemes();
    
  } catch (error) {
    // Use default theme on error
    res.locals.activeTheme = PREDEFINED_THEMES['dream-x'];
    res.locals.themeCSS = '';
    res.locals.availableThemes = getAvailableThemes();
  }
  
  next();
}

// Export everything
module.exports = {
  // Theme management
  getAvailableThemes,
  getThemeById,
  getActiveTheme,
  setActiveTheme,
  getThemePreview,
  
  // Custom themes
  saveCustomTheme,
  getCustomThemes,
  deleteCustomTheme,
  
  // CSS generation
  generateThemeCSS,
  
  // History
  getThemeHistory,
  
  // Middleware
  themeMiddleware,
  
  // Constants
  PREDEFINED_THEMES
};

const path = require('path');
const { initSync, isProduction, getDatabaseSync, getDatabase, initDatabase } = require('./adapter');
const sqlCompat = require('./sql-compat');

/**
 * Helper function to prepare SQL statements with LIMIT/OFFSET compatibility
 * Converts SQLite LIMIT/OFFSET syntax to PostgreSQL syntax (same syntax, different placeholders)
 */
function prepareLimitOffset(sql, limit, offset) {
  const { sql: convertedSql, limit: offsetVal, offset: fetchVal } = sqlCompat.convertLimitOffset(sql, limit, offset);
  return { sql: convertedSql, limit: offsetVal, offset: fetchVal };
}

// Initialize database based on environment
let db = null;
let dbWrapper = null;

if (!isProduction) {
  // SQLite - synchronous initialization (local development)
  // In production, PostgreSQL will be initialized asynchronously via initializeDatabase()
  dbWrapper = initSync();
  db = dbWrapper.getRaw();
} else {
  // PostgreSQL - async initialization required
  // dbWrapper will be assigned by initializeDatabase() at startup
  // Create a proxy that delegates to dbWrapper once it's ready
  db = new Proxy({}, {
    get(target, prop) {

      if (prop === 'prepare' || prop === 'exec') {
        return (...args) => {
          if (!dbWrapper) {
            throw new Error('Database not initialized. Call db.initializeDatabase() first in production mode.');
          }
          if (prop === 'prepare') {
            return dbWrapper.prepare(args[0]);
          } else {
            return dbWrapper.exec(args[0]);
          }
        };
      }
      return target[prop];
    }
  });
}

// Async initialization function for PostgreSQL (call this at app startup in production)
async function initializeDatabase() {
  if (isProduction && !dbWrapper) {
    await initDatabase();
    dbWrapper = await getDatabase();
    // Do NOT reassign db in production - keep using the Proxy that delegates to dbWrapper
    console.log('✅ Database initialized for production');
    
    // Run migrations after database is initialized
    await runMigrations();
  }
  return db;
}

// Seed built-in accounts (admin, HR) - call after database initialization
async function seedDatabase() {
  try {
    // Ensure admin permissions and account status are initialized
    try {
      db.exec(`UPDATE users SET account_status = 'active' WHERE account_status IS NULL;`);
    } catch (e) {
      // Ignore if fails
    }
    try {
      db.exec(`UPDATE users SET admin_permissions = '[]' WHERE admin_permissions IS NULL;`);
      db.exec(`UPDATE users SET admin_scopes = '[]' WHERE admin_scopes IS NULL;`);
    } catch (e) {
      // Ignore if fails
    }

    // Seed Global Admin account if it doesn't exist
    try {
      const adminExists = db.prepare(`SELECT id FROM users WHERE email = ?`).get('admin@dreamx.local');
      if (!adminExists) {
        const bcrypt = require('bcrypt');
        const adminPassword = bcrypt.hashSync('DreamXAdmin2025!', 10);
        db.prepare(`INSERT INTO users (full_name, email, password_hash, role, account_status, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
          .run('Global Administrator', 'admin@dreamx.local', adminPassword, 'global_admin', 'active', 'Global Administrator - Full System Access');
        console.log('✅ Global Admin account created: admin@dreamx.local / DreamXAdmin2025!');
      } else {
        // Ensure existing admin has global_admin role
        const adminRole = db.prepare(`SELECT role FROM users WHERE email = ?`).get('admin@dreamx.local');
        if (adminRole && adminRole.role !== 'global_admin') {
          db.prepare(`UPDATE users SET role = 'global_admin' WHERE email = ?`).run('admin@dreamx.local');
          console.log('✅ Admin account upgraded to global_admin role');
        }
      }
    } catch (e) {
      console.warn('Admin seed error:', e.message);
    }

    // Seed HR account if it doesn't exist
    try {
      const hrExists = db.prepare(`SELECT id FROM users WHERE email = ?`).get('hr@dreamx.local');
      if (!hrExists) {
        const bcrypt = require('bcrypt');
        const hrPassword = bcrypt.hashSync('DreamXHR2025!', 10);
        db.prepare(`INSERT INTO users (full_name, email, password_hash, role, account_status, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
          .run('Global HR Partner', 'hr@dreamx.local', hrPassword, 'global_hr', 'active', 'Global HR Partner - Talent Architecture and People Experience');
        console.log('✅ HR account created: hr@dreamx.local / DreamXHR2025!');
      } else {
        db.prepare(`UPDATE users SET role = 'global_hr' WHERE email = ? AND role != 'global_hr'`).run('hr@dreamx.local');
      }
    } catch (e) {
      console.warn('HR seed error:', e.message);
    }

    // Seed Business Admin account if it doesn't exist
    try {
      const businessExists = db.prepare(`SELECT id FROM users WHERE email = ?`).get('business@dreamx.local');
      if (!businessExists) {
        const bcrypt = require('bcrypt');
        const businessPassword = bcrypt.hashSync('DreamXBusiness2025!', 10);
        // Grant all business permissions
        const businessPermissions = JSON.stringify([
          'sales_inquiries_view',
          'sales_inquiries_manage',
          'sales_inquiries_contact',
          'business_team_view',
          'business_team_manage',
          'enterprise_accounts',
          'sales_analytics',
          'contract_management',
          'pricing_customization',
          'partner_management',
          'revenue_reports',
          'customer_success'
        ]);
        db.prepare(`INSERT INTO users (full_name, email, password_hash, role, account_status, bio, admin_permissions, email_verified, onboarding_completed, needs_onboarding, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, CURRENT_TIMESTAMP)`)
          .run('Business Administrator', 'business@dreamx.local', businessPassword, 'business_admin', 'active', 'Business Administrator - Sales & Enterprise Management', businessPermissions);
        console.log('✅ Business Admin account created: business@dreamx.local / DreamXBusiness2025!');
      } else {
        db.prepare(`UPDATE users SET role = 'business_admin' WHERE email = ? AND role != 'business_admin'`).run('business@dreamx.local');
      }
    } catch (e) {
      console.warn('Business Admin seed error:', e.message);
    }

    // Seed default pricing tiers if they don't exist
    try {
      const tiersExist = db.prepare(`SELECT COUNT(*) as count FROM pricing_tiers`).get();
      if (!tiersExist || tiersExist.count === 0) {
        const defaultTiers = [
          {
            tier_id: 'free',
            name: 'Free User',
            price: 0,
            price_display: '$0/mo',
            tagline: 'Social home for productive passions.',
            features: JSON.stringify([
              'Post photos, videos, project updates',
              'Follow creators, mentors, students, professionals',
              'Rich profiles (skills, passions, portfolio, achievements)',
              'Up to 10 Project Collections',
              'Book sessions, basic messaging, post analytics (views + likes)',
              'Ads from Fortune 100 brands only'
            ]),
            is_highlighted: 0,
            display_order: 1,
            is_active: 1,
            note: null
          },
          {
            tier_id: 'pro-buyer',
            name: 'Pro Buyer',
            price: 5.99,
            price_display: '$5.99/mo',
            tagline: 'Power user of the social side.',
            features: JSON.stringify([
              'Ad-free experience',
              'Enhanced discovery filters (top rising creators, people near you, people who match interests)',
              'Unlimited Project Collections',
              'Priority messaging',
              'Post up to 3 one-time request listings per month',
              'Early access to premium sellers',
              'Basic AI mentor/creator recommendations'
            ]),
            is_highlighted: 0,
            display_order: 2,
            is_active: 1,
            note: null
          },
          {
            tier_id: 'pro-seller',
            name: 'Pro Seller',
            price: 9.99,
            price_display: '$9.99/mo',
            tagline: 'Turn your craft into a brand.',
            features: JSON.stringify([
              'Pro badge + priority in discovery',
              'Pin 3 posts to profile',
              'Weekly insights (reach, audience interests, followers by profession/skill)',
              'Custom profile banner & theme',
              '5 service listings, unlimited messaging',
              'Payment tools, basic CRM',
              'Scheduling, reminders, custom availability',
              'Coupons, discounts, basic buyer analytics'
            ]),
            is_highlighted: 1,
            display_order: 3,
            is_active: 1,
            note: null
          },
          {
            tier_id: 'elite-seller',
            name: 'Elite Seller',
            price: 29.99,
            price_display: '$29.99/mo',
            tagline: 'You\'re a top creator — build a full microbrand.',
            features: JSON.stringify([
              'Verified status, full portfolio builder, video banners',
              'In-depth analytics (peak times, demographics, top-performing categories)',
              'Cross-platform link hub, featured on Discover when trending',
              'Unlimited listings, recurring subscriptions',
              'Advanced analytics & automation',
              'CRM + workflow automation',
              'Custom storefront page, tax reports',
              'Integrations, auto-responses, Smart rebooking AI'
            ]),
            is_highlighted: 0,
            display_order: 4,
            is_active: 1,
            note: null
          },
          {
            tier_id: 'enterprise',
            name: 'Enterprise Creator',
            price: 99.99,
            price_display: '$99.99/mo',
            tagline: 'Dream X is your community\'s social + learning hub.',
            features: JSON.stringify([
              'Multi-user team posting',
              'Event pages, showcase collections',
              'Custom homepage blocks, co-branded community page',
              'Invite followers to events, livestreams, seminars',
              'Multi-instructor scheduling, team-wide analytics',
              'Bulk payouts, shared CRM',
              'Dedicated account manager',
              'Featured category placement, sponsored creator onboarding'
            ]),
            is_highlighted: 0,
            display_order: 5,
            is_active: 1,
            note: 'Best for tutoring companies, mentorship orgs, clubs, and studios.'
          }
        ];
        
        const insertTier = db.prepare(`
          INSERT INTO pricing_tiers (tier_id, name, price, price_display, tagline, features, is_highlighted, display_order, is_active, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const tier of defaultTiers) {
          insertTier.run(
            tier.tier_id,
            tier.name,
            tier.price,
            tier.price_display,
            tier.tagline,
            tier.features,
            tier.is_highlighted,
            tier.display_order,
            tier.is_active,
            tier.note
          );
        }
        console.log('✅ Default pricing tiers seeded');
      }
    } catch (e) {
      console.warn('Pricing tiers seed error:', e.message);
    }
    
    // Initialize and seed RBAC system
    try {
      const rbacService = require('../services/rbac');
      const rbacSeed = require('../services/rbac-seed');
      
      // Initialize RBAC service with database connection
      await rbacService.initialize(db);
      
      // Seed RBAC if not already seeded
      if (!rbacSeed.isSeeded()) {
        console.log('🔄 Seeding RBAC system...');
        await rbacSeed.seedRbac(db);
      } else {
        // Still grandfather legacy accounts in case new ones were added
        await rbacSeed.grandfatherLegacyAccounts(db);
        console.log('✅ RBAC system already seeded');
      }
    } catch (e) {
      console.warn('RBAC seed error:', e.message);
    }
  } catch (e) {
    console.error('Database seeding failed:', e.message);
    throw e;
  }
}

// Helper function to check if a column exists in a table
function columnExists(tableName, columnName) {
  try {
    const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all();
    return cols.some(c => c.name === columnName);
  } catch (e) {
    // If table doesn't exist, column doesn't exist
    return false;
  }
}

// Helper function to add column if it doesn't exist (idempotent)
function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  if (!columnExists(tableName, columnName)) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
      console.log(`✅ Added column ${tableName}.${columnName}`);
    } catch (e) {
      console.warn(`Failed to add column ${tableName}.${columnName}:`, e.message);
    }
  }
}

// Run database migrations (works for both SQLite and SQL Server)
async function runMigrations() {
  // In production (PostgreSQL), load schema-postgres.sql if tables don't exist
  if (isProduction) {
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'schema-postgres.sql');
    
    if (fs.existsSync(schemaPath)) {
      try {
        // Check if users table exists (indicator that schema is already loaded)
        const tableCheck = await db.prepare(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'users'
          ) as exists
        `).get();
        
        if (!tableCheck || !tableCheck.exists) {
          console.log('🔄 Loading PostgreSQL schema from schema-postgres.sql...');
          let schema = fs.readFileSync(schemaPath, 'utf8');
          
          // Remove SQL comments (lines starting with --)
          const cleanSchema = schema
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');
          
          // Split by semicolons and execute each statement
          const statements = cleanSchema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .filter(s => !s.match(/^DROP\s+TABLE/i)); // Skip DROP statements
          
          for (const statement of statements) {
            try {
              if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX')) {
                await db.exec(statement + ';');
              }
            } catch (error) {
              // Ignore "already exists" errors
              if (!error.message.includes('already exists') && 
                  !error.message.includes('duplicate key')) {
                console.warn('Schema statement failed:', error.message.substring(0, 100));
              }
            }
          }
          console.log('✅ PostgreSQL schema loaded from schema-postgres.sql');
        } else {
          console.log('✅ PostgreSQL schema already exists, skipping schema load');
        }
      } catch (error) {
        console.warn('⚠️  Could not load schema-postgres.sql:', error.message);
        console.warn('⚠️  Please ensure schema-postgres.sql has been run manually');
      }
    } else {
      console.warn('⚠️  schema-postgres.sql not found. Please run it manually before starting the app.');
    }
    
    // Skip PRAGMA-based migrations for PostgreSQL
    return;
  }

  console.log('🔄 Running database migrations...');

  try {
    // Ensure new WebAuthn column exists without breaking older databases
    addColumnIfNotExists('webauthn_credentials', 'rp_id', 'TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_rp ON webauthn_credentials(user_id, rp_id);');
  } catch (err) {
    console.error('Failed to ensure WebAuthn rp_id column exists', err);
  }

  // Lightweight migrations for existing databases (ensure new columns exist)
  try {
    addColumnIfNotExists('users', 'email_verified', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('users', 'verification_code', 'TEXT');
    addColumnIfNotExists('users', 'verification_code_expires', 'DATETIME');
  } catch (e) {
    console.warn('Migration check failed (likely already applied):', e.message);
  }

  // Ensure project_comments supports project-level fields
  try {
    const commentCols = db.prepare("PRAGMA table_info('project_comments')").all();
    if (commentCols.length > 0) {
      const commentNames = new Set(commentCols.map(c => c.name));
      const updateIdCol = commentCols.find(c => c.name === 'update_id');
      const needsRebuild = (
        !commentNames.has('project_id') ||
        !commentNames.has('is_pinned') ||
        !commentNames.has('is_hidden') ||
        !commentNames.has('edited_at') ||
        (updateIdCol && updateIdCol.notnull === 1)
      );

      if (needsRebuild) {
        console.log('🔄 Rebuilding project_comments table...');
        db.exec(`
          CREATE TABLE IF NOT EXISTS project_comments_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            update_id INTEGER,
            user_id INTEGER NOT NULL,
            parent_id INTEGER,
            content TEXT NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            is_hidden INTEGER DEFAULT 0,
            edited_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        db.exec(`
          INSERT INTO project_comments_new (
            id, project_id, update_id, user_id, parent_id, content, is_pinned, is_hidden, edited_at, created_at
          )
          SELECT
            id,
            COALESCE(project_id, (
              SELECT project_id FROM project_updates pu WHERE pu.id = pc.update_id
            )),
            update_id,
            user_id,
            parent_id,
            content,
            COALESCE(is_pinned, 0),
            COALESCE(is_hidden, 0),
            edited_at,
            created_at
          FROM project_comments pc;
        `);

        db.exec('DROP TABLE project_comments;');
        db.exec('ALTER TABLE project_comments_new RENAME TO project_comments;');
        console.log('✅ project_comments table rebuilt');
      }
      
      // Only create indexes if table exists
      db.exec("CREATE INDEX IF NOT EXISTS idx_project_comments_project ON project_comments(project_id);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_project_comments_parent ON project_comments(parent_id);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_project_comments_pinned ON project_comments(is_pinned, created_at);");
    } else {
      // Table doesn't exist yet - it will be created by the schema initialization below
      // Don't create indexes here as the table doesn't exist
      console.log('⚠️  project_comments table does not exist yet - will be created by schema initialization');
    }
  } catch (e) {
    console.error('Failed to ensure project_comments migration', e.message);
  }
  
  console.log('✅ Database migrations completed');
}

// SQLite schema initialization removed - using PostgreSQL with schema-postgres.sql
// All tables are created via migrations and schema-postgres.sql

// Helper function to get the database instance (works with both SQLite and PostgreSQL)
function getDb() {
  if (isProduction && !dbWrapper) {
    throw new Error('Database not initialized. Call initializeDatabase() first in production mode.');
  }
  if (!isProduction && !dbWrapper) {
    dbWrapper = getDatabaseSync();
    db = dbWrapper.getRaw();
  }
  return db;
}

// Helper to create prepared statements that work with both databases
function prepare(sql) {
  if (isProduction) {
    if (!dbWrapper) {
      throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return dbWrapper.prepare(sql);
  } else {
    return getDb().prepare(sql);
  }
}

// Ensure the PostgreSQL session table exists for express-session store
// Note: The implementation of ensureSessionTable() is defined later in this file (around line 1673)

// SQLite-only schema initialization (skip in production - PostgreSQL uses schema-postgres.sql)
if (!isProduction) {
try {
  db.exec(`CREATE TABLE IF NOT EXISTS service_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, user_id),
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_service_reviews_service ON service_reviews(service_id);
  CREATE INDEX IF NOT EXISTS idx_service_reviews_user ON service_reviews(user_id);
  `);
} catch (e) { /* table may already exist */ }

// User locations table for MapBox integration
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      city TEXT,
      latitude REAL,
      longitude REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
  `);
} catch (e) { /* table may already exist */ }

// Migration: Add new columns if they don't exist (using helper function for idempotency)
addColumnIfNotExists('users', 'profile_picture', 'TEXT');
addColumnIfNotExists('users', 'account_status', "TEXT DEFAULT 'active'");
addColumnIfNotExists('users', 'admin_permissions', "TEXT DEFAULT '[]'");
addColumnIfNotExists('users', 'admin_scopes', "TEXT DEFAULT '[]'");
// NOTE: Seeding moved to seedDatabase() function - called after initializeDatabase()
// This prevents "Database not initialized" errors in production mode

addColumnIfNotExists('users', 'suspension_until', 'DATETIME');
addColumnIfNotExists('users', 'seller_privileges_frozen', 'INTEGER DEFAULT 0');
addColumnIfNotExists('users', 'bank_account_country', 'TEXT');
addColumnIfNotExists('users', 'bank_account_number', 'TEXT');
addColumnIfNotExists('users', 'bank_routing_number', 'TEXT');
addColumnIfNotExists('users', 'suspension_reason', 'TEXT');
addColumnIfNotExists('users', 'role', "TEXT DEFAULT 'user'");
addColumnIfNotExists('users', 'bio', 'TEXT');
addColumnIfNotExists('users', 'location', 'TEXT');
addColumnIfNotExists('users', 'skills', 'TEXT');
addColumnIfNotExists('users', 'email_notifications', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'provider', 'TEXT');
addColumnIfNotExists('users', 'provider_id', 'TEXT');
// Ensure oauth_accounts table exists (idempotent)
db.exec(`CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);

addColumnIfNotExists('users', 'push_notifications', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'message_notifications', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'banner_image', 'TEXT');
// Normalize any previously stored absolute upload paths (SQLite only)
try {
  // Strip leading '/uploads/' to keep DB paths relative
  // SQLite uses substr()
  db.exec(`UPDATE users SET profile_picture = substr(profile_picture, 10) WHERE profile_picture LIKE '/uploads/%';`);
  db.exec(`UPDATE users SET banner_image = substr(banner_image, 10) WHERE banner_image LIKE '/uploads/%';`);
} catch (e) {
  // ignore
}

// Posts reels support migration (idempotent)
addColumnIfNotExists('posts', 'is_reel', 'INTEGER DEFAULT 0');
// Posts audio support migration (idempotent)
addColumnIfNotExists('posts', 'audio_url', 'TEXT');
// Post title migration (idempotent)
addColumnIfNotExists('posts', 'title', 'TEXT');

// Privacy settings migrations (idempotent)
addColumnIfNotExists('users', 'profile_visibility', "TEXT DEFAULT 'public'");
addColumnIfNotExists('users', 'allow_messages_from', "TEXT DEFAULT 'everyone'");
addColumnIfNotExists('users', 'discoverable_by_email', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'show_online_status', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'read_receipts', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'chat_privileges_frozen', 'INTEGER DEFAULT 0');

// Messages attachments migration (idempotent)
addColumnIfNotExists('messages', 'attachment_url', 'TEXT');
addColumnIfNotExists('messages', 'attachment_mime', 'TEXT');

// Message replies (idempotent)
addColumnIfNotExists('messages', 'reply_to_message_id', 'INTEGER');

// Group conversations migration (idempotent)
addColumnIfNotExists('conversations', 'is_group', 'INTEGER DEFAULT 0');
addColumnIfNotExists('conversations', 'group_name', 'TEXT');
// Handle column migration (can't add UNIQUE directly in ALTER TABLE)
addColumnIfNotExists('users', 'handle', 'TEXT');

// Create unique index for handle if it doesn't exist
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle);`);
} catch (e) {
  // Index already exists, ignore
}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS conversation_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(conversation_id, user_id)
  );`);
} catch (e) { }

// Comments replies migration (idempotent)
addColumnIfNotExists('post_comments', 'parent_id', 'INTEGER');
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);`); } catch (e) { }

// Comment moderation columns (idempotent)
addColumnIfNotExists('post_comments', 'is_hidden', 'INTEGER DEFAULT 0');
addColumnIfNotExists('post_comments', 'is_deleted', 'INTEGER DEFAULT 0');

// Onboarding enhancements migration (idempotent)
addColumnIfNotExists('users', 'daily_time_commitment', 'TEXT');
addColumnIfNotExists('users', 'best_time', 'TEXT');
addColumnIfNotExists('users', 'reminder_frequency', 'TEXT');
addColumnIfNotExists('users', 'accountability_style', 'TEXT');
addColumnIfNotExists('users', 'progress_visibility', "TEXT DEFAULT 'public'");
addColumnIfNotExists('users', 'content_preferences', 'TEXT');
addColumnIfNotExists('users', 'content_format_preference', 'TEXT');
addColumnIfNotExists('users', 'open_to_mentoring', 'TEXT');
addColumnIfNotExists('users', 'first_goal', 'TEXT');
addColumnIfNotExists('users', 'first_goal_date', 'TEXT');
addColumnIfNotExists('users', 'first_goal_metric', 'TEXT');
addColumnIfNotExists('users', 'first_goal_public', 'INTEGER DEFAULT 0');
addColumnIfNotExists('users', 'notify_followers', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_likes_comments', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_milestones', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_inspiration', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_community', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_weekly_summary', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'notify_method', "TEXT DEFAULT 'both'");
addColumnIfNotExists('users', 'onboarding_completed', 'INTEGER DEFAULT 0');
addColumnIfNotExists('users', 'needs_onboarding', 'INTEGER DEFAULT 1');
addColumnIfNotExists('users', 'total_posts', 'INTEGER DEFAULT 0');

// Posts moderation columns (idempotent)
addColumnIfNotExists('posts', 'hidden', 'INTEGER DEFAULT 0');

// Backfill needs_onboarding where missing to align with onboarding completion state
try {
  db.exec(`UPDATE users SET needs_onboarding = CASE WHEN onboarding_completed = 1 THEN 0 ELSE 1 END WHERE needs_onboarding IS NULL`);
} catch (e) { }

// Ensure audit logs table exists
try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`);
} catch (e) { }

// Follows table
db.exec(`CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
`);

// Posts table for rich feed content
db.exec(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT,
  content_type TEXT DEFAULT 'text',
  text_content TEXT,
  media_url TEXT,
  audio_url TEXT,
  image_url TEXT,
  video_url TEXT,
  external_video_url TEXT,
  is_reel INTEGER DEFAULT 0,
  activity_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);

// Backfill legacy databases with new media columns without breaking existing data
const postColumnAdds = [
  'ALTER TABLE posts ADD COLUMN image_url TEXT',
  'ALTER TABLE posts ADD COLUMN video_url TEXT',
  'ALTER TABLE posts ADD COLUMN external_video_url TEXT'
];
postColumnAdds.forEach(sql => {
  try {
    db.prepare(sql).run();
  } catch (err) {
    // Ignore failures for already-added columns to keep startup idempotent
  }
});

// Hashtags and tags
db.exec(`CREATE TABLE IF NOT EXISTS hashtags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON hashtags(name);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id INTEGER NOT NULL,
  hashtag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, hashtag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (hashtag_id) REFERENCES hashtags(id)
);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post ON post_hashtags(post_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);
CREATE INDEX IF NOT EXISTS idx_post_tags_post ON post_tags(post_id);
`);

function normalizeTagValue(name = '') {
  return String(name)
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
}

// Hashtag and tag upsert statements - created lazily to avoid initialization errors in production
// (db may not be initialized until async initializeDatabase() is called)
let upsertHashtagStmt = null;
let upsertTagStmt = null;
let linkHashtagStmt = null;
let linkTagStmt = null;

function getUpsertHashtagStmt() {
  if (!upsertHashtagStmt) {
    if (isProduction) {
      // PostgreSQL: use object wrapper that prepares on each call
      upsertHashtagStmt = {
        get: function(name) {
          // First try to get existing
          let existing = db.prepare(`SELECT id, name FROM hashtags WHERE name = ?`).get(name);
          if (existing) {
            // Update count
            db.prepare(`UPDATE hashtags SET usage_count = usage_count + 1 WHERE name = ?`).run(name);
            return existing;
          }
          // Insert new
          const result = db.prepare(`INSERT INTO hashtags (name, usage_count) VALUES (?, 1)`).run(name);
          return { id: result.lastInsertRowid, name: name };
        }
      };
    } else {
      // SQLite with ON CONFLICT and RETURNING support
      upsertHashtagStmt = db.prepare(`
        INSERT INTO hashtags (name, usage_count)
        VALUES (?, 1)
        ON CONFLICT(name) DO UPDATE SET usage_count = usage_count + 1
        RETURNING id, name
      `);
    }
  }
  return upsertHashtagStmt;
}

function getUpsertTagStmt() {
  if (!upsertTagStmt) {
    if (isProduction) {
      // PostgreSQL: use object wrapper that prepares on each call
      upsertTagStmt = {
        get: function(name) {
          // First try to get existing
          let existing = db.prepare(`SELECT id, name FROM tags WHERE name = ?`).get(name);
          if (existing) {
            // Update count
            db.prepare(`UPDATE tags SET usage_count = usage_count + 1 WHERE name = ?`).run(name);
            return existing;
          }
          // Insert new
          const result = db.prepare(`INSERT INTO tags (name, usage_count) VALUES (?, 1)`).run(name);
          return { id: result.lastInsertRowid, name: name };
        }
      };
    } else {
      // SQLite with ON CONFLICT and RETURNING support
      upsertTagStmt = db.prepare(`
        INSERT INTO tags (name, usage_count)
        VALUES (?, 1)
        ON CONFLICT(name) DO UPDATE SET usage_count = usage_count + 1
        RETURNING id, name
      `);
    }
  }
  return upsertTagStmt;
}

function getLinkHashtagStmt() {
  if (!linkHashtagStmt) {
    if (isProduction) {
      // PostgreSQL: use object wrapper that prepares on each call
      linkHashtagStmt = {
        run: function(postId, hashtagId) {
          // Use INSERT with WHERE NOT EXISTS (single statement, works with parameters)
          db.prepare(`
            INSERT INTO post_hashtags (post_id, hashtag_id)
            SELECT ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM post_hashtags WHERE post_id = ? AND hashtag_id = ?)
          `).run(postId, hashtagId, postId, hashtagId);
        }
      };
    } else {
      // SQLite
      linkHashtagStmt = db.prepare(`INSERT OR IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?);`);
    }
  }
  return linkHashtagStmt;
}

function getLinkTagStmt() {
  if (!linkTagStmt) {
    if (isProduction) {
      // PostgreSQL: use object wrapper that prepares on each call
      linkTagStmt = {
        run: function(postId, tagId) {
          // Use INSERT with WHERE NOT EXISTS (single statement, works with parameters)
          db.prepare(`
            INSERT INTO post_tags (post_id, tag_id)
            SELECT ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM post_tags WHERE post_id = ? AND tag_id = ?)
          `).run(postId, tagId, postId, tagId);
        }
      };
    } else {
      // SQLite
      linkTagStmt = db.prepare(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?);`);
    }
  }
  return linkTagStmt;
}
// Prepared statements are created lazily to avoid initialization errors in production
// (db may not be initialized until async initializeDatabase() is called)
let getPostHashtagListStmt = null;
let getPostTagListStmt = null;

function getPostHashtagListStmtLazy() {
  if (!getPostHashtagListStmt) {
    getPostHashtagListStmt = db.prepare(`
      SELECT h.name
      FROM hashtags h
      JOIN post_hashtags ph ON ph.hashtag_id = h.id
      WHERE ph.post_id = ?
      ORDER BY h.name ASC
    `);
  }
  return getPostHashtagListStmt;
}

function getPostTagListStmtLazy() {
  if (!getPostTagListStmt) {
    getPostTagListStmt = db.prepare(`
      SELECT t.name
      FROM tags t
      JOIN post_tags pt ON pt.tag_id = t.id
      WHERE pt.post_id = ?
      ORDER BY t.name ASC
    `);
  }
  return getPostTagListStmt;
}

function attachHashtagsToPost(postId, hashtags = []) {
  if (!postId || !Array.isArray(hashtags) || hashtags.length === 0) return [];
  const normalized = [...new Set(hashtags.map(normalizeTagValue).filter(Boolean))];
  const upsertStmt = getUpsertHashtagStmt();
  const linkStmt = getLinkHashtagStmt();
  normalized.forEach((name) => {
    const result = upsertStmt.get(name);
    if (result?.id) {
      linkStmt.run(postId, result.id);
    }
  });
  return normalized;
}

function attachTagsToPost(postId, tags = []) {
  if (!postId || !Array.isArray(tags) || tags.length === 0) return [];
  const normalized = [...new Set(tags.map(normalizeTagValue).filter(Boolean))];
  const upsertStmt = getUpsertTagStmt();
  const linkStmt = getLinkTagStmt();
  normalized.forEach((name) => {
    const result = upsertStmt.get(name);
    if (result?.id) {
      linkStmt.run(postId, result.id);
    }
  });
  return normalized;
}

async function getPostHashtags(postId) {
  if (!postId) return [];
  const stmt = getPostHashtagListStmtLazy();
  const rows = await stmt.all(postId);
  const list = Array.isArray(rows) ? rows : (rows?.rows || []);
  return list.map((row) => row.name);
}

async function getPostTags(postId) {
  if (!postId) return [];
  const stmt = getPostTagListStmtLazy();
  const rows = await stmt.all(postId);
  const list = Array.isArray(rows) ? rows : (rows?.rows || []);
  return list.map((row) => row.name);
}

function getPopularHashtags(search = '', limit = 8) {
  const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 25);
  const query = search ? `${normalizeTagValue(search)}` : '';
  const stmt = db.prepare(`
    SELECT name, usage_count
    FROM hashtags
    ${query ? 'WHERE name LIKE ?' : ''}
    ORDER BY usage_count DESC, name ASC
    LIMIT ?
  `);
  const params = query ? [`${query}%`, maxLimit] : [maxLimit];
  return stmt.all(...params);
}

function getPopularTags(search = '', limit = 8) {
  const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 25);
  const query = search ? `${normalizeTagValue(search)}` : '';
  const stmt = db.prepare(`
    SELECT name, usage_count
    FROM tags
    ${query ? 'WHERE name LIKE ?' : ''}
    ORDER BY usage_count DESC, name ASC
    LIMIT ?
  `);
  const params = query ? [`${query}%`, maxLimit] : [maxLimit];
  return stmt.all(...params);
}

// Reactions and comments for posts
db.exec(`CREATE TABLE IF NOT EXISTS post_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_type ON post_reactions(reaction_type);
`);

db.exec(`CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES post_comments(id)
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);
`);

// Reposts table
db.exec(`CREATE TABLE IF NOT EXISTS post_reposts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  original_post_id INTEGER NOT NULL,
  repost_depth INTEGER DEFAULT 1,
  is_quote_repost INTEGER DEFAULT 0,
  quote_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (original_post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_reposts_post ON post_reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reposts_original ON post_reposts(original_post_id);
CREATE INDEX IF NOT EXISTS idx_post_reposts_user ON post_reposts(user_id);
`);

db.exec(`CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES post_comments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);

// HR & Careers Tables
db.exec(`CREATE TABLE IF NOT EXISTS career_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  location TEXT,
  team TEXT,
  employment_type TEXT,
  seniority TEXT,
  headline TEXT,
  description TEXT,
  responsibilities TEXT,
  requirements TEXT,
  perks TEXT,
  tags TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT,
  apply_url TEXT,
  workplace_type TEXT,
  visibility TEXT DEFAULT 'public',
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  go_live_at DATETIME,
  freeze_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

db.exec(`CREATE TABLE IF NOT EXISTS career_job_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  label TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES career_jobs(id)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS career_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  user_id INTEGER,
  name TEXT,
  email TEXT,
  phone TEXT,
  position TEXT,
  resume_url TEXT,
  cover_letter TEXT,
  status TEXT DEFAULT 'new',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES career_jobs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`);


// User blocks and reports
db.exec(`CREATE TABLE IF NOT EXISTS user_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);
`);

db.exec(`CREATE TABLE IF NOT EXISTS user_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  reported_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status);
`);

db.exec(`CREATE TABLE IF NOT EXISTS user_moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  block_functionality_locked INTEGER DEFAULT 0,
  lock_reason TEXT,
  locked_by INTEGER,
  locked_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_moderation_locked ON user_moderation(block_functionality_locked);
`);

// Careers applications table
db.exec(`CREATE TABLE IF NOT EXISTS career_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cover_letter TEXT NOT NULL,
  resume_file TEXT,
  portfolio_file TEXT,
  status TEXT DEFAULT 'new',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Career job postings (live roles displayed on careers page)
db.exec(`CREATE TABLE IF NOT EXISTS career_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  location TEXT,
  team TEXT,
  employment_type TEXT,
  seniority TEXT,
  headline TEXT,
  description TEXT,
  responsibilities TEXT,
  requirements TEXT,
  perks TEXT,
  tags TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT,
  apply_url TEXT,
  workplace_type TEXT,
  visibility TEXT DEFAULT 'public',
  priority TEXT,
  status TEXT DEFAULT 'draft', -- draft | scheduled | live | frozen | closed
  go_live_at DATETIME,
  freeze_until DATETIME,
  is_frozen INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_career_jobs_status ON career_jobs(status);
CREATE INDEX IF NOT EXISTS idx_career_jobs_live ON career_jobs(go_live_at);
`);

// Backfill new career job columns if schema pre-existed
// Career jobs table column additions (idempotent)
addColumnIfNotExists('career_jobs', 'salary_min', 'REAL');
addColumnIfNotExists('career_jobs', 'salary_max', 'REAL');
addColumnIfNotExists('career_jobs', 'salary_currency', 'TEXT');
addColumnIfNotExists('career_jobs', 'apply_url', 'TEXT');
addColumnIfNotExists('career_jobs', 'workplace_type', 'TEXT');
addColumnIfNotExists('career_jobs', 'visibility', "TEXT DEFAULT 'public'");
addColumnIfNotExists('career_jobs', 'priority', 'TEXT');

// Assets attached to job postings (downloadable by applicants)
db.exec(`CREATE TABLE IF NOT EXISTS career_job_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  label TEXT,
  file_name TEXT,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_career_job_assets_job ON career_job_assets(job_id);
`);

// Content appeals table
db.exec(`CREATE TABLE IF NOT EXISTS content_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_url TEXT,
  removal_reason TEXT,
  description TEXT,
  appeal_reason TEXT NOT NULL,
  additional_info TEXT,
  status TEXT DEFAULT 'open',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Account appeals table
db.exec(`CREATE TABLE IF NOT EXISTS account_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  account_action TEXT NOT NULL,
  action_date TEXT,
  violation_reason TEXT,
  appeal_reason TEXT NOT NULL,
  prevention_plan TEXT,
  additional_info TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'open',
  reviewer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);`);

// Add moderation columns to service_reviews if they don't exist
try {
  db.exec(`ALTER TABLE service_reviews ADD COLUMN is_hidden INTEGER DEFAULT 0`);
} catch (e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE service_reviews ADD COLUMN is_deleted INTEGER DEFAULT 0`);
} catch (e) { /* Column already exists */ }

// Livestreams table for video streaming infrastructure
db.exec(`CREATE TABLE IF NOT EXISTS livestreams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  stream_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'scheduled',
  started_at DATETIME,
  ended_at DATETIME,
  viewer_count_peak INTEGER DEFAULT 0,
  recording_enabled INTEGER DEFAULT 1,
  recording_url TEXT,
  thumbnail_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_livestreams_user ON livestreams(user_id);
CREATE INDEX IF NOT EXISTS idx_livestreams_status ON livestreams(status);
CREATE INDEX IF NOT EXISTS idx_livestreams_stream_key ON livestreams(stream_key);
`);

// Billing charges table
db.exec(`CREATE TABLE IF NOT EXISTS billing_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  charge_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'completed',
  tier TEXT,
  invoice_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);
CREATE INDEX IF NOT EXISTS idx_billing_charges_user ON billing_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_charges_status ON billing_charges(status);
`);

// Refund requests table
db.exec(`CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  charge_id INTEGER,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  order_date TEXT,
  transaction_id TEXT,
  preferred_method TEXT NOT NULL,
  account_email TEXT,
  account_last_four TEXT,
  screenshot TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by INTEGER,
  admin_notes TEXT,
  refund_amount REAL,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (charge_id) REFERENCES billing_charges(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_user ON refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
`);

// Livestream viewers tracking
db.exec(`CREATE TABLE IF NOT EXISTS livestream_viewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER NOT NULL,
  user_id INTEGER,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  FOREIGN KEY (stream_id) REFERENCES livestreams(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_livestream_viewers_stream ON livestream_viewers(stream_id);
CREATE INDEX IF NOT EXISTS idx_livestream_viewers_user ON livestream_viewers(user_id);
`);

// Livestream chat messages
db.exec(`CREATE TABLE IF NOT EXISTS livestream_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stream_id) REFERENCES livestreams(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_livestream_chat_stream ON livestream_chat(stream_id);
`);

// Admin notes on user accounts
try {
  db.exec(`CREATE TABLE IF NOT EXISTS user_admin_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    admin_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (admin_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_admin_notes_user ON user_admin_notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_admin_notes_admin ON user_admin_notes(admin_id);
  `);
} catch (e) { }

// Projects table
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  category TEXT,
  status TEXT DEFAULT 'planning',
  visibility TEXT DEFAULT 'public',
  progress_percent INTEGER DEFAULT 0,
  start_date DATETIME,
  target_end_date DATETIME,
  actual_end_date DATETIME,
  tags TEXT,
  gallery_images TEXT,
  goals TEXT,
  team_members TEXT,
  view_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);
`);

// Project milestones
db.exec(`CREATE TABLE IF NOT EXISTS project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATETIME,
  status TEXT DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
`);

// Project tasks
db.exec(`CREATE TABLE IF NOT EXISTS project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  milestone_id INTEGER,
  assigned_to INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON project_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON project_tasks(status);
`);

// Project updates
db.exec(`CREATE TABLE IF NOT EXISTS project_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT,
  content_type TEXT DEFAULT 'text',
  text_content TEXT,
  media_url TEXT,
  audio_url TEXT,
  image_url TEXT,
  video_url TEXT,
  external_video_url TEXT,
  milestone_id INTEGER,
  status_update TEXT,
  metrics TEXT,
  attachment_urls TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id)
);
CREATE INDEX IF NOT EXISTS idx_updates_project ON project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_user ON project_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_updates_created_at ON project_updates(created_at);
`);

// Project reactions
db.exec(`CREATE TABLE IF NOT EXISTS project_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT DEFAULT 'like',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(update_id, user_id),
  FOREIGN KEY (update_id) REFERENCES project_updates(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_update ON project_reactions(update_id);
CREATE INDEX IF NOT EXISTS idx_reactions_type ON project_reactions(reaction_type);
`);

// Project comments
db.exec(`CREATE TABLE IF NOT EXISTS project_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  update_id INTEGER,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  edited_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (parent_id) REFERENCES project_comments(id) ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS idx_comments_update ON project_comments(update_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON project_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_pinned ON project_comments(is_pinned, created_at);
`);

// Project comment files (attachments in comments)
db.exec(`CREATE TABLE IF NOT EXISTS project_comment_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES project_comments(id)
);
CREATE INDEX IF NOT EXISTS idx_comment_files_comment ON project_comment_files(comment_id);
`);

// Project comment reactions (star reactions on comments)
db.exec(`CREATE TABLE IF NOT EXISTS project_comment_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT DEFAULT 'star',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id, reaction_type),
  FOREIGN KEY (comment_id) REFERENCES project_comments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON project_comment_reactions(comment_id);
`);

// Sales inquiries table for Enterprise contact requests
db.exec(`CREATE TABLE IF NOT EXISTS sales_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Company Information
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  company_size TEXT NOT NULL,
  company_website TEXT,
  company_address TEXT,
  company_city TEXT,
  company_country TEXT,
  -- Contact Person
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_job_title TEXT,
  contact_department TEXT,
  -- Requirements
  use_case TEXT NOT NULL,
  expected_users TEXT,
  timeline TEXT,
  budget_range TEXT,
  current_solution TEXT,
  integration_needs TEXT,
  -- Additional Info
  additional_info TEXT,
  how_heard_about_us TEXT,
  preferred_contact_method TEXT DEFAULT 'email',
  preferred_contact_time TEXT,
  -- Status and Assignment
  status TEXT DEFAULT 'new',
  priority TEXT DEFAULT 'normal',
  assigned_to INTEGER,
  assigned_at DATETIME,
  -- Follow-up tracking
  last_contacted_at DATETIME,
  last_contacted_by INTEGER,
  follow_up_notes TEXT,
  next_follow_up_date DATETIME,
  -- Outcome
  outcome TEXT,
  outcome_notes TEXT,
  closed_at DATETIME,
  closed_by INTEGER,
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (last_contacted_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_inquiries_status ON sales_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_sales_inquiries_assigned ON sales_inquiries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_inquiries_created ON sales_inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_inquiries_priority ON sales_inquiries(priority);
`);

// Sales inquiry communications/follow-ups
db.exec(`CREATE TABLE IF NOT EXISTS sales_inquiry_communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  communication_type TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  recipient_email TEXT,
  status TEXT DEFAULT 'sent',
  opened_at DATETIME,
  replied_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES sales_inquiries(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_communications_inquiry ON sales_inquiry_communications(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_sales_communications_sender ON sales_inquiry_communications(sender_id);
`);

// Dynamic page content table
db.exec(`CREATE TABLE IF NOT EXISTS easter_egg_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_path VARCHAR(255) NOT NULL UNIQUE,
  page_code TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_easter_egg_route ON easter_egg_pages(route_path);
CREATE INDEX IF NOT EXISTS idx_easter_egg_active ON easter_egg_pages(is_active);
`);

// Business admin assignments - for business admins assigning other business admins
db.exec(`CREATE TABLE IF NOT EXISTS business_admin_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_admin_id INTEGER NOT NULL,
  assigned_admin_id INTEGER NOT NULL,
  permissions TEXT DEFAULT '[]',
  scopes TEXT DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_admin_id) REFERENCES users(id),
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id),
  UNIQUE(parent_admin_id, assigned_admin_id)
);
CREATE INDEX IF NOT EXISTS idx_business_admin_parent ON business_admin_assignments(parent_admin_id);
CREATE INDEX IF NOT EXISTS idx_business_admin_assigned ON business_admin_assignments(assigned_admin_id);
`);

// Pricing tiers configuration table - allows business admins to adjust pricing and features
db.exec(`CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  price_display TEXT NOT NULL,
  tagline TEXT,
  features TEXT NOT NULL DEFAULT '[]',
  is_highlighted INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_tier_id ON pricing_tiers(tier_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_active ON pricing_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_order ON pricing_tiers(display_order);
`);

} // End of SQLite-only schema initialization (production uses schema-postgres.sql)

// Ensure the PostgreSQL session table exists for express-session store
async function ensureSessionTable() {
  if (!isProduction) return;

  // Make sure the SQL wrapper is ready
  if (!dbWrapper) {
    await initializeDatabase();
  }

  try {
    // Check if table exists and what columns it has
    const tableCheck = await dbWrapper.prepare(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sessions' 
      AND table_schema = 'public'
    `).all();
    
    if (tableCheck && tableCheck.length > 0) {
      // Table exists - check if it has old column names
      const columns = tableCheck.map(c => c.column_name);
      const hasOldColumns = columns.includes('session') || columns.includes('expires');
      const hasNewColumns = columns.includes('sess') && columns.includes('expire');
      
      console.log(`📋 Sessions table columns detected: ${columns.join(', ')}`);
      
      if (hasOldColumns && !hasNewColumns) {
        // Migrate old schema to new schema (connect-pg-simple compatible)
        console.log('🔄 Migrating sessions table to connect-pg-simple format...');
        
        // Only rename if the old column exists
        if (columns.includes('session')) {
          try {
            await dbWrapper.exec(`
              ALTER TABLE sessions 
              RENAME COLUMN session TO sess;
            `);
            // Convert to JSON type if it's TEXT
            const sessionCol = tableCheck.find(c => c.column_name === 'session');
            if (sessionCol && (sessionCol.data_type === 'text' || sessionCol.data_type === 'character varying')) {
              await dbWrapper.exec(`
                ALTER TABLE sessions 
                ALTER COLUMN sess TYPE JSON USING sess::json;
              `);
            }
          } catch (e) {
            console.error('❌ Could not rename session column:', e.message);
            throw e;
          }
        }
        
        if (columns.includes('expires')) {
          try {
            await dbWrapper.exec(`
              ALTER TABLE sessions 
              RENAME COLUMN expires TO expire;
            `);
          } catch (e) {
            console.error('❌ Could not rename expires column:', e.message);
            throw e;
          }
        }
        
        // Update index name if it exists
        try {
          await dbWrapper.exec(`DROP INDEX IF EXISTS idx_sessions_expires;`);
        } catch (e) {
          // Ignore if index doesn't exist
        }
        try {
          await dbWrapper.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);`);
        } catch (e) {
          // Ignore if index already exists
        }
        
        console.log('✅ Sessions table migrated successfully');
      } else if (!hasNewColumns) {
        // Table exists but doesn't have expected columns - this shouldn't happen
        console.warn('⚠️ Sessions table exists but has unexpected schema. Expected sess/expire columns.');
        // Don't recreate the table if it has data, but log a warning
      } else {
        // Table has correct columns
        console.log('✅ Sessions table already has correct schema (sess/expire)');
      }
    } else {
      // Table doesn't exist - create it with correct schema
      console.log('🔄 Creating sessions table with connect-pg-simple compatible schema...');
      await dbWrapper.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid VARCHAR(255) NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP NOT NULL
        );
      `);
      await dbWrapper.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
      `);
      console.log('✅ Sessions table created successfully');
    }
  } catch (error) {
    // Ignore "already exists" errors
    if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
      console.warn('Failed to ensure sessions table exists:', error.message);
    }
  }
}

module.exports = {
  db,
  initializeDatabase, // MUST be called at app startup in production (PostgreSQL only)
  ensureSessionTable,
  seedDatabase, // Call after initializeDatabase() to seed admin/HR accounts
  getUserById: async (id) => {
    const result = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return result instanceof Promise ? await result : result;
  },
  getUserByEmail: async (email) => {
    const result = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    return result instanceof Promise ? await result : result;
  },
  getUserByHandle: async (handle) => {
    const result = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
    return result instanceof Promise ? await result : result;
  },
  getUserByProvider: async (provider, providerId) => {
    const result = db.prepare(`
      SELECT u.* FROM oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = ? AND oa.provider_id = ?
    `).get(provider, providerId);
    return result instanceof Promise ? await result : result;
  },
  getLinkedAccountsForUser: async (userId) => {
    const result = db.prepare(
      `SELECT provider, provider_id FROM oauth_accounts WHERE user_id = ?`
    ).all(userId);
    return result instanceof Promise ? await result : result;
  },
  createUser: async ({ fullName, email, passwordHash, handle }) => {
    if (isProduction) {
      // PostgreSQL: Use RETURNING to get the inserted ID reliably
      const stmt = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, handle) 
        VALUES (?, ?, ?, ?) 
        RETURNING id
      `);
      const result = await stmt.get(fullName, email, passwordHash, handle || null);
      if (!result || !result.id) {
        throw new Error('Failed to create user: no ID returned');
      }
      return result.id;
    } else {
      // SQLite: Use lastInsertRowid (synchronous)
      const stmt = db.prepare(`INSERT INTO users (full_name, email, password_hash, handle) VALUES (?,?,?,?)`);
      const info = stmt.run(fullName, email, passwordHash, handle || null);
      if (!info.lastInsertRowid) {
        throw new Error('Failed to create user: no ID returned');
      }
      return info.lastInsertRowid;
    }
  },
  updateUserHandle: ({ userId, handle }) => {
    db.prepare(`UPDATE users SET handle = ? WHERE id = ?`).run(handle, userId);
  },
  updateUserRole: ({ userId, role }) => {
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
  },
  updateAdminPermissions: ({ userId, permissions, scopes }) => {
    db.prepare(`UPDATE users SET admin_permissions = ?, admin_scopes = ? WHERE id = ?`).run(
      JSON.stringify(permissions || []),
      JSON.stringify(scopes || []),
      userId
    );
  },

  // Email Verification
  createVerificationCode: ({ userId, email, code, expiresAt }) => {
    const stmt = db.prepare(`INSERT INTO email_verification_codes (user_id, email, code, expires_at) VALUES (?,?,?,?)`);
    const info = stmt.run(userId, email, code, expiresAt);
    return info.lastInsertRowid;
  },
  getVerificationCode: ({ userId, code }) => {
    const sql = isProduction
      ? `SELECT * FROM email_verification_codes WHERE user_id = ? AND code = ? AND verified = false ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM email_verification_codes WHERE user_id = ? AND code = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1`;
    return db.prepare(sql).get(userId, code);
  },
  markCodeAsVerified: ({ id }) => {
    const sql = isProduction
      ? `UPDATE email_verification_codes SET verified = true WHERE id = ?`
      : `UPDATE email_verification_codes SET verified = 1 WHERE id = ?`;
    db.prepare(sql).run(id);
  },
  markEmailAsVerified: ({ userId }) => {
    const sql = isProduction
      ? `UPDATE users SET email_verified = true WHERE id = ?`
      : `UPDATE users SET email_verified = 1 WHERE id = ?`;
    db.prepare(sql).run(userId);
  },
  deleteExpiredVerificationCodes: () => {
    const sql = isProduction 
      ? `DELETE FROM email_verification_codes WHERE expires_at < CURRENT_TIMESTAMP AND verified = false`
      : `DELETE FROM email_verification_codes WHERE expires_at < datetime('now') AND verified = 0`;
    db.prepare(sql).run();
  },

  // Password resets
  createPasswordResetToken: ({ userId, email, tokenHash, expiresAt }) => {
    const stmt = db.prepare(`INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at) VALUES (?,?,?,?)`);
    const info = stmt.run(userId, email, tokenHash, expiresAt);
    return info.lastInsertRowid;
  },
  getPasswordResetToken: ({ tokenHash }) => {
    const sql = isProduction
      ? `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = false ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`;
    return db.prepare(sql).get(tokenHash);
  },
  markPasswordResetUsed: ({ id }) => {
    const sql = isProduction
      ? `UPDATE password_reset_tokens SET used = true WHERE id = ?`
      : `UPDATE password_reset_tokens SET used = 1 WHERE id = ?`;
    db.prepare(sql).run(id);
  },
  deleteExpiredPasswordResetTokens: () => {
    const sql = isProduction
      ? `DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP OR used = true`
      : `DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used = 1`;
    db.prepare(sql).run();
  },
  invalidateUserResetTokens: ({ userId }) => {
    const sql = isProduction
      ? `UPDATE password_reset_tokens SET used = true WHERE user_id = ?`
      : `UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?`;
    db.prepare(sql).run(userId);
  },

  // Auth Token Management (for mobile API)
  storeRefreshToken: ({ userId, tokenHash, expiresAt, deviceInfo }) => {
    const stmt = db.prepare(`INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at, device_info) VALUES (?,?,?,?,?)`);
    const info = stmt.run(userId, tokenHash, 'refresh', expiresAt, deviceInfo || null);
    return info.lastInsertRowid;
  },
  getRefreshToken: ({ tokenHash }) => {
    const sql = isProduction
      ? `SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'refresh' AND revoked = false ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'refresh' AND revoked = 0 ORDER BY created_at DESC LIMIT 1`;
    return db.prepare(sql).get(tokenHash);
  },
  revokeRefreshToken: ({ tokenHash }) => {
    const sql = isProduction
      ? `UPDATE auth_tokens SET revoked = true WHERE token_hash = ?`
      : `UPDATE auth_tokens SET revoked = 1 WHERE token_hash = ?`;
    db.prepare(sql).run(tokenHash);
  },
  revokeAllUserTokens: ({ userId }) => {
    const sql = isProduction
      ? `UPDATE auth_tokens SET revoked = true WHERE user_id = ? AND revoked = false`
      : `UPDATE auth_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0`;
    db.prepare(sql).run(userId);
  },
  cleanupExpiredTokens: () => {
    const sql = isProduction
      ? `DELETE FROM auth_tokens WHERE expires_at < CURRENT_TIMESTAMP OR revoked = true`
      : `DELETE FROM auth_tokens WHERE expires_at < datetime('now') OR revoked = 1`;
    db.prepare(sql).run();
  },

  getAllUsers: async () => {
    const rows = await db.prepare(`SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC`).all();
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  // Paged users + total for admin
  getUsersPaged: async ({ limit, offset, search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`
        SELECT id, full_name, email, role, account_status, admin_permissions, admin_scopes, created_at
        FROM users
        WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, limit, offset);
      const rows = await db.prepare(sql).all(s, s, offsetVal, fetchVal);
      return Array.isArray(rows) ? rows : (rows?.rows || []);
    }
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`
      SELECT id, full_name, email, role, account_status, admin_permissions, admin_scopes, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getUsersCount: async ({ search }) => {
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      const result = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?`).get(s, s);
      return result?.c || result?.count || 0;
    }
    const result = await db.prepare(`SELECT COUNT(*) as c FROM users`).get();
    return result?.c || result?.count || 0;
  },
  getHrTeam: async () => {
    const rows = await db.prepare(`
      SELECT id, full_name, email, role, account_status, admin_scopes, created_at
      FROM users
      WHERE role IN ('hr', 'super_hr', 'global_hr')
      ORDER BY CASE role WHEN 'global_hr' THEN 3 WHEN 'super_hr' THEN 2 ELSE 1 END DESC, created_at DESC
    `).all();
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  searchUsers: async ({ query, limit = 10, excludeUserId }) => {
    const s = `%${(query || '').toLowerCase()}%`;
    let rows;
    if (excludeUserId) {
      rows = await db.prepare(`
        SELECT id, full_name, email, profile_picture, bio, location, handle
        FROM users
        WHERE id != ? AND (
          LOWER(full_name) LIKE ? 
          OR LOWER(handle) LIKE ?
          OR (discoverable_by_email = ${isProduction ? 'true' : '1'} AND LOWER(email) LIKE ?)
        )
        ORDER BY full_name ASC
        LIMIT ?
      `).all(excludeUserId, s, s, s, limit);
    } else {
      rows = await db.prepare(`
        SELECT id, full_name, email, profile_picture, bio, location, handle
        FROM users
        WHERE LOWER(full_name) LIKE ? 
          OR LOWER(handle) LIKE ?
          OR (discoverable_by_email = 1 AND LOWER(email) LIKE ?)
        ORDER BY full_name ASC
        LIMIT ?
      `).all(s, s, s, limit);
    }
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getStats: async () => {
    const usersResult = await db.prepare(`SELECT COUNT(*) as c FROM users`).get();
    const users = usersResult?.c || usersResult?.count || 0;
    const convResult = await db.prepare(`SELECT COUNT(*) as c FROM conversations`).get();
    const conv = convResult?.c || convResult?.count || 0;
    const msgsResult = await db.prepare(`SELECT COUNT(*) as c FROM messages`).get();
    const msgs = msgsResult?.c || msgsResult?.count || 0;
    return { users, conversations: conv, messages: msgs };
  },
  updateUserProvider: ({ userId, provider, providerId }) => {
    // Validate required parameters
    if (!userId || !provider || !providerId) {
      console.warn('updateUserProvider called with invalid parameters:', { userId, provider, providerId });
      return;
    }
    
    // Back-compat: also store on users table if columns exist
    try { db.prepare(`UPDATE users SET provider = ?, provider_id = ? WHERE id = ?`).run(provider, providerId, userId); } catch (e) { }
    // Preferred: link in oauth_accounts
    if (isProduction) {
      // PostgreSQL: INSERT with ON CONFLICT
      db.prepare(`
        INSERT INTO oauth_accounts (user_id, provider, provider_id)
        VALUES (?, ?, ?)
        ON CONFLICT (provider, provider_id) DO NOTHING
      `).run(userId, provider, providerId);
    } else {
      db.prepare(`INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_id) VALUES (?,?,?)`).run(userId, provider, providerId);
    }
  },
  unlinkProvider: ({ userId, provider }) => {
    db.prepare(`DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?`).run(userId, provider);
  },
  updateOnboarding: ({
    userId, categories, goals, experience,
    daily_time_commitment, best_time, reminder_frequency,
    accountability_style, progress_visibility,
    content_preferences, content_format_preference,
    open_to_mentoring,
    first_goal, first_goal_date, first_goal_metric, first_goal_public,
    notify_followers, notify_likes_comments, notify_milestones,
    notify_inspiration, notify_community, notify_weekly_summary,
    notify_method, bio, profile_picture, onboarding_completed,
    needs_onboarding
  }) => {
    const updateStmt = db.prepare(`
      UPDATE users SET
        categories = ?,
        goals = ?,
        experience = ?,
        daily_time_commitment = ?,
        best_time = ?,
        reminder_frequency = ?,
        accountability_style = ?,
        progress_visibility = ?,
        content_preferences = ?,
        content_format_preference = ?,
        open_to_mentoring = ?,
        first_goal = ?,
        first_goal_date = ?,
        first_goal_metric = ?,
        first_goal_public = ?,
        notify_followers = ?,
        notify_likes_comments = ?,
        notify_milestones = ?,
        notify_inspiration = ?,
        notify_community = ?,
        notify_weekly_summary = ?,
        notify_method = ?,
        bio = COALESCE(?, bio),
        profile_picture = COALESCE(?, profile_picture),
        onboarding_completed = ?,
        needs_onboarding = ?
      WHERE id = ?
    `);

    updateStmt.run(
      JSON.stringify(categories || []),
      JSON.stringify(goals || []),
      experience,
      daily_time_commitment,
      best_time,
      reminder_frequency,
      accountability_style,
      progress_visibility,
      content_preferences,
      content_format_preference,
      open_to_mentoring,
      first_goal,
      first_goal_date,
      first_goal_metric,
      first_goal_public || 0,
      notify_followers || 0,
      notify_likes_comments || 0,
      notify_milestones || 0,
      notify_inspiration || 0,
      notify_community || 0,
      notify_weekly_summary || 0,
      notify_method,
      bio,
      profile_picture,
      onboarding_completed || 1,
      needs_onboarding ?? 0,
      userId
    );
  },
  updateUserProfile: ({ userId, fullName, bio, location, skills }) => {
    db.prepare(`UPDATE users SET full_name = ?, bio = ?, location = ?, skills = ? WHERE id = ?`).run(
      fullName, bio, location, skills, userId
    );
  },
  updateProfilePicture: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET profile_picture = ? WHERE id = ?`).run(filename, userId);
  },
  updateBannerImage: ({ userId, filename }) => {
    db.prepare(`UPDATE users SET banner_image = ? WHERE id = ?`).run(filename, userId);
  },
  updatePassword: ({ userId, passwordHash }) => {
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
  },
  updateNotificationSettings: ({ userId, emailNotifications, pushNotifications, messageNotifications }) => {
    db.prepare(`UPDATE users SET email_notifications = ?, push_notifications = ?, message_notifications = ? WHERE id = ?`).run(
      emailNotifications ? 1 : 0,
      pushNotifications ? 1 : 0,
      messageNotifications ? 1 : 0,
      userId
    );
  },
  updatePrivacySettings: ({ userId, profileVisibility, allowMessagesFrom, discoverableByEmail, showOnlineStatus, readReceipts }) => {
    db.prepare(`
      UPDATE users 
      SET profile_visibility = ?, 
          allow_messages_from = ?, 
          discoverable_by_email = ?, 
          show_online_status = ?, 
          read_receipts = ?
      WHERE id = ?
    `).run(
      (profileVisibility || 'public'),
      (allowMessagesFrom || 'everyone'),
      discoverableByEmail ? (isProduction ? true : 1) : (isProduction ? false : 0),
      showOnlineStatus ? (isProduction ? true : 1) : (isProduction ? false : 0),
      readReceipts ? (isProduction ? true : 1) : (isProduction ? false : 0),
      userId
    );
  },
  // Messaging functions
  getOrCreateConversation: ({ user1Id, user2Id }) => {
    const existing = db.prepare(`
      SELECT * FROM conversations 
      WHERE is_group = ${isProduction ? 'false' : '0'} AND ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
    `).get(user1Id, user2Id, user2Id, user1Id);
    if (existing) return existing;
    const sql = isProduction
      ? `INSERT INTO conversations (user1_id, user2_id, is_group) VALUES (?,?,false)`
      : `INSERT INTO conversations (user1_id, user2_id, is_group) VALUES (?,?,0)`;
    const stmt = db.prepare(sql);
    const info = stmt.run(user1Id, user2Id);
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  },
  createGroupConversation: ({ creatorId, participantIds, groupName }) => {
    const sql = isProduction
      ? `INSERT INTO conversations (user1_id, user2_id, is_group, group_name) VALUES (?,?,true,?)`
      : `INSERT INTO conversations (user1_id, user2_id, is_group, group_name) VALUES (?,?,1,?)`;
    const stmt = db.prepare(sql);
    const info = stmt.run(creatorId, creatorId, groupName || 'Group Chat');
    const convId = info.lastInsertRowid;
    
    // Add participants - use appropriate syntax for database type
    if (isProduction) {
      // PostgreSQL: INSERT with ON CONFLICT
      const addStmt = db.prepare(`
        INSERT INTO conversation_participants (conversation_id, user_id)
        VALUES (?, ?)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `);
      addStmt.run(convId, creatorId);
      participantIds.forEach(uid => addStmt.run(convId, uid));
    } else {
      const addStmt = db.prepare(`INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?,?)`);
      addStmt.run(convId, creatorId);
      participantIds.forEach(uid => addStmt.run(convId, uid));
    }
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  },
  getConversationParticipants: async (conversationId) => {
    const rows = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
    `).all(conversationId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  isUserInConversation: ({ conversationId, userId }) => {
    const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(conversationId);
    if (!conv) return false;
    if (conv.is_group) {
      const part = db.prepare(`SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId);
      return !!part;
    }
    return conv.user1_id === userId || conv.user2_id === userId;
  },
  getUserConversations: async (userId) => {
    // Only return conversations that have at least one message
    const directRaw = await db.prepare(`
      SELECT c.*, 
        CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
        u.full_name as other_user_name,
        u.profile_picture as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = ${isProduction ? 'false' : '0'}) as unread_count
      FROM conversations c
      JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND c.is_group = ${isProduction ? 'false' : '0'}
        AND EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id LIMIT 1)
    `).all(userId, userId, userId, userId, userId);
    const direct = Array.isArray(directRaw) ? directRaw : (directRaw?.rows || []);
    
    const groupsRaw = await db.prepare(`
      SELECT c.*,
        c.group_name as other_user_name,
        NULL as other_user_picture,
        (
          SELECT CASE 
            WHEN attachment_url IS NOT NULL THEN '[Attachment]'
            ELSE content 
          END 
          FROM messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read = ${isProduction ? 'false' : '0'}) as unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ? AND c.is_group = ${isProduction ? 'true' : '1'}
        AND EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id LIMIT 1)
    `).all(userId, userId);
    const groups = Array.isArray(groupsRaw) ? groupsRaw : (groupsRaw?.rows || []);
    
    return [...direct, ...groups].sort((a, b) => {
      const ta = new Date(a.last_message_time || 0).getTime();
      const tb = new Date(b.last_message_time || 0).getTime();
      return tb - ta;
    });
  },
  getConversationMessages: async (conversationId) => {
    const rows = await db.prepare(`
      SELECT m.*, u.full_name as sender_name, u.profile_picture as sender_picture,
        rm.content AS reply_content,
        rm.attachment_url AS reply_attachment_url,
        rm.attachment_mime AS reply_attachment_mime,
        rm.sender_id AS reply_sender_id,
        ru.full_name AS reply_sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(conversationId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getMessageWithContext: async (messageId) => {
    const result = await db.prepare(`
      SELECT m.*, u.full_name as sender_name, u.profile_picture as sender_picture,
        rm.content AS reply_content,
        rm.attachment_url AS reply_attachment_url,
        rm.attachment_mime AS reply_attachment_mime,
        rm.sender_id AS reply_sender_id,
        ru.full_name AS reply_sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE m.id = ?
    `).get(messageId);
    return result;
  },
  createMessage: ({ conversationId, senderId, content, attachmentUrl, attachmentMime, replyToMessageId }) => {
    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, content, attachment_url, attachment_mime, reply_to_message_id)
      VALUES (?,?,?,?,?,?)
    `);
    const info = stmt.run(
      conversationId,
      senderId,
      content || '',
      attachmentUrl || null,
      attachmentMime || null,
      replyToMessageId || null
    );
    return info.lastInsertRowid;
  },
  markMessagesAsRead: ({ conversationId, userId }) => {
    const sql = isProduction
      ? `UPDATE messages SET read = true WHERE conversation_id = ? AND sender_id != ?`
      : `UPDATE messages SET read = 1 WHERE conversation_id = ? AND sender_id != ?`;
    db.prepare(sql).run(conversationId, userId);
  },
  getUnreadMessageCount: async (userId) => {
    const result = await db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.read = ${isProduction ? 'false' : '0'}
    `).get(userId, userId, userId);
    return result?.count || result?.c || 0;
  },
  // Audit logs
  addAuditLog: ({ userId, action, details }) => {
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(userId || null, action, details || null);
  },
  getAuditLogsPaged: async ({ limit, offset }) => {
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT id, user_id, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getAuditLogCount: () => {
    return db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c;
  },
  // Posts
  createPost: ({ userId, title, contentType, textContent, mediaUrl, audioUrl, activityLabel, isReel, imageUrl, videoUrl, externalVideoUrl }) => {
    const stmt = db.prepare(`INSERT INTO posts (user_id, title, content_type, text_content, media_url, audio_url, image_url, video_url, external_video_url, activity_label, is_reel) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const info = stmt.run(
      userId,
      title || null,
      contentType || 'text',
      textContent || null,
      mediaUrl || null,
      audioUrl || null,
      imageUrl || null,
      videoUrl || null,
      externalVideoUrl || null,
      activityLabel || null,
      isReel ? 1 : 0
    );
    return info.lastInsertRowid;
  },
  getFeedPosts: async ({ limit, offset, userId = null }) => {
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`
      SELECT p.*, u.full_name, u.email, u.profile_picture,
        (SELECT COUNT(*) FROM posts) as total_count,
        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_reel = ${isProduction ? 'false' : '0'}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    const list = Array.isArray(rows) ? rows : (rows?.rows || []);
    return Promise.all(list.map(async row => {
      const counts = db.prepare(`
        SELECT reaction_type, COUNT(*) as c
        FROM post_reactions
        WHERE post_id = ?
        GROUP BY reaction_type
      `).all(row.id);
      row.reactions = counts.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
      
      // Get user reaction if userId provided
      if (userId) {
        const userReaction = db.prepare(`SELECT reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(row.id, userId);
        row.user_reaction = userReaction ? userReaction.reaction_type : null;
      }
      
      // Get repost info if this is a repost
      if (row.content_type === 'repost') {
        const repostInfo = db.prepare(`
          SELECT pr.original_post_id, pr.repost_depth, pr.is_quote_repost, pr.quote_text,
                 op.user_id as original_user_id, op.title as original_title, op.text_content as original_text_content,
                 op.content_type as original_content_type, op.image_url as original_image_url,
                 op.video_url as original_video_url, op.external_video_url as original_external_video_url,
                 op.is_reel as original_is_reel, op.created_at as original_created_at,
                 ou.full_name as original_author_name, ou.profile_picture as original_author_picture,
                 ou.handle as original_author_handle
          FROM post_reposts pr
          JOIN posts op ON op.id = pr.original_post_id
          JOIN users ou ON ou.id = op.user_id
          WHERE pr.post_id = ?
        `).get(row.id);
        if (repostInfo) {
          row.repost_info = repostInfo;
        }
      }
      
      // Get repost count
      const repostCount = db.prepare(`SELECT COUNT(*) as c FROM post_reposts WHERE original_post_id = ?`).get(row.id);
      row.repost_count = repostCount ? repostCount.c : 0;
      
      // Hashtags/tags require async when using PostgreSQL adapter
      // (getPostHashtags/getPostTags are async)
      row.hashtags = await getPostHashtags(row.id);
      row.tags = await getPostTags(row.id);
      return row;
    }));
  },
  getUserPosts: async (userId) => {
    const rows = await db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ? AND (p.content_type IS NULL OR p.content_type != 'repost')
      ORDER BY p.created_at DESC
    `).all(userId);
    
    const safeRows = Array.isArray(rows) ? rows : (rows?.rows || []);
    
    return Promise.all(safeRows.map(async (row) => {
      const repostCount = db.prepare(`SELECT COUNT(*) as c FROM post_reposts WHERE original_post_id = ?`).get(row.id);
      row.repost_count = repostCount ? repostCount.c : 0;
      return {
        ...row,
        hashtags: await getPostHashtags(row.id),
        tags: await getPostTags(row.id)
      };
    }));
  },
  getUserReels: async (userId) => {
    const rows = await db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ? AND p.is_reel = ${isProduction ? 'true' : '1'}
      ORDER BY p.created_at DESC
    `).all(userId);
    const list = Array.isArray(rows) ? rows : (rows?.rows || []);
    return Promise.all(list.map(async (row) => ({
      ...row,
      hashtags: await getPostHashtags(row.id),
      tags: await getPostTags(row.id)
    })));
  },
  getPostById: async (postId) => {
    const row = await db.prepare(`
      SELECT p.*, u.full_name, u.email, u.profile_picture
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(postId);
    if (!row) return null;
    const counts = await db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    row.reactions = counts.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    row.comments_count = db.prepare(`SELECT COUNT(*) as c FROM post_comments WHERE post_id = ?`).get(postId).c;
    row.hashtags = await getPostHashtags(postId);
    row.tags = await getPostTags(postId);
    return row;
  },
  getPostHashtags: (postId) => getPostHashtags(postId),
  getPostTags: (postId) => getPostTags(postId),
  attachHashtagsToPost: ({ postId, hashtags }) => attachHashtagsToPost(postId, hashtags),
  attachTagsToPost: ({ postId, tags }) => attachTagsToPost(postId, tags),
  getPopularHashtags: ({ search, limit } = {}) => getPopularHashtags(search || '', limit),
  getPopularTags: ({ search, limit } = {}) => getPopularTags(search || '', limit),
  // Reactions
  setPostReaction: ({ postId, userId, reactionType }) => {
    const existing = db.prepare(`SELECT id, reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(postId, userId);
    let status = 'set';
    if (!existing) {
      db.prepare(`INSERT INTO post_reactions (post_id, user_id, reaction_type) VALUES (?,?,?)`).run(postId, userId, reactionType);
      status = 'set';
    } else if (existing.reaction_type === reactionType) {
      db.prepare(`DELETE FROM post_reactions WHERE id = ?`).run(existing.id);
      status = 'cleared';
    } else {
      db.prepare(`UPDATE post_reactions SET reaction_type = ? WHERE id = ?`).run(reactionType, existing.id);
      status = 'updated';
    }
    const summary = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    const counts = summary.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    return { status, counts };
  },
  getPostReactionsSummary: (postId) => {
    const rows = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM post_reactions
      WHERE post_id = ?
      GROUP BY reaction_type
    `).all(postId);
    return rows.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
  },
  getUserReactionForPost: ({ postId, userId }) => {
    const row = db.prepare(`SELECT reaction_type FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(postId, userId);
    return row ? row.reaction_type : null;
  },
  // Comments
  addPostComment: ({ postId, userId, content, parentId = null }) => {
    const info = db.prepare(`INSERT INTO post_comments (post_id, user_id, parent_id, content) VALUES (?,?,?,?)`).run(postId, userId, parentId || null, content);
    return info.lastInsertRowid;
  },
  getPostComments: async ({ postId, limit = 20, offset = 0, isAdmin = false }) => {
    const whereClause = isAdmin
      ? 'WHERE c.post_id = ?'
      : 'WHERE c.post_id = ? AND c.is_hidden = 0 AND c.is_deleted = 0';

    let query = `
      SELECT c.*, u.full_name, u.profile_picture,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS star_count,
        pc.user_id as parent_author_id,
        pu.full_name as parent_author_name
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN post_comments pc ON pc.id = c.parent_id
      LEFT JOIN users pu ON pu.id = pc.user_id
      ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const commentsRaw = await db.prepare(sql).all(postId, offsetVal, fetchVal);
    return Array.isArray(commentsRaw) ? commentsRaw : (commentsRaw?.rows || []);
  },
  getCommentsCount: async (postId, isAdmin = false) => {
    const whereClause = isAdmin
      ? 'WHERE post_id = ?'
      : 'WHERE post_id = ? AND is_hidden = 0 AND is_deleted = 0';
    const result = await db.prepare(`SELECT COUNT(*) as c FROM post_comments ${whereClause}`).get(postId);
    return result?.c || result?.count || 0;
  },
  toggleCommentLike: ({ commentId, userId }) => {
    const existing = db.prepare(`SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?`).get(commentId, userId);
    let liked = false;
    if (existing) {
      db.prepare(`DELETE FROM comment_likes WHERE id = ?`).run(existing.id);
      liked = false;
    } else {
      db.prepare(`INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)`).run(commentId, userId);
      liked = true;
    }
    const starCount = db.prepare(`SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ?`).get(commentId).c;
    return { liked, starCount };
  },
  // WebAuthn helpers
  addWebAuthnCredential: ({ userId, credentialId, publicKey, counter, transports, rpId }) => {
    const normalizeBase64Url = (value) => {
      if (Buffer.isBuffer(value)) return value.toString('base64url');
      if (typeof value === 'string') {
        const trimmed = value.trim();
        try {
          return Buffer.from(trimmed, 'base64url').toString('base64url');
        } catch (e) {
          return trimmed;
        }
      }
      return '';
    };
    // Normalize RP ID: remove www prefix and convert to lowercase for consistency
    const normalizeRpId = (value) => {
      if (!value) return null;
      let normalized = value.trim().toLowerCase();
      // Remove www. prefix to ensure consistent RP ID across www and non-www
      if (normalized.startsWith('www.')) {
        normalized = normalized.substring(4);
      }
      return normalized;
    };

    const normalizedCredentialId = normalizeBase64Url(credentialId);
    const normalizedPublicKey = normalizeBase64Url(publicKey);
    const normalizedRpId = normalizeRpId(rpId);
    const normalizedCounter = Number.isInteger(counter) ? counter : 0;

    if (isProduction) {
      // PostgreSQL: INSERT ... ON CONFLICT for upsert
      db.prepare(`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, rp_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (credential_id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          public_key = EXCLUDED.public_key,
          counter = EXCLUDED.counter,
          transports = EXCLUDED.transports,
          rp_id = EXCLUDED.rp_id
      `).run(userId, normalizedCredentialId, normalizedPublicKey, normalizedCounter, transports || null, normalizedRpId);
    } else {
      db.prepare(`INSERT OR REPLACE INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, rp_id) VALUES (?,?,?,?,?,?)`)
        .run(userId, normalizedCredentialId, normalizedPublicKey, normalizedCounter, transports || null, normalizedRpId);
    }
  },
  getCredentialsForUser: (userId, rpId = null) => {
    // Normalize RP ID: remove www prefix and convert to lowercase
    const normalizeRpId = (value) => {
      if (!value) return null;
      let normalized = value.trim().toLowerCase();
      if (normalized.startsWith('www.')) {
        normalized = normalized.substring(4);
      }
      return normalized;
    };
    const normalizedRpId = normalizeRpId(rpId);
    if (normalizedRpId) {
      // Match credentials with NULL rp_id, exact match, or www variant
      // This handles existing credentials that might have been stored with www prefix
      return db.prepare(`SELECT * FROM webauthn_credentials WHERE user_id = ? AND (rp_id IS NULL OR rp_id = ? OR rp_id = ?)`)
        .all(userId, normalizedRpId, `www.${normalizedRpId}`);
    }
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE user_id = ?`).all(userId);
  },
  getCredentialById: (credentialId, rpId = null) => {
    const normalizeBase64Url = (value) => {
      if (Buffer.isBuffer(value)) return value.toString('base64url');
      if (typeof value === 'string') {
        const trimmed = value.trim();
        try {
          return Buffer.from(trimmed, 'base64url').toString('base64url');
        } catch (e) {
          return trimmed;
        }
      }
      return '';
    };
    // Normalize RP ID: remove www prefix and convert to lowercase
    const normalizeRpId = (value) => {
      if (!value) return null;
      let normalized = value.trim().toLowerCase();
      if (normalized.startsWith('www.')) {
        normalized = normalized.substring(4);
      }
      return normalized;
    };
    const normalizedCredentialId = normalizeBase64Url(credentialId);
    const normalizedRpId = normalizeRpId(rpId);
    if (normalizedRpId) {
      // Match credentials with NULL rp_id, exact match, or www variant
      // This handles existing credentials that might have been stored with www prefix
      return db.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ? AND (rp_id IS NULL OR rp_id = ? OR rp_id = ?)`)
        .get(normalizedCredentialId, normalizedRpId, `www.${normalizedRpId}`);
    }
    return db.prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`).get(normalizedCredentialId);
  },
  updateCredentialCounter: ({ credentialId, counter }) => {
    const normalizedCounter = Number.isInteger(counter) ? counter : 0;
    const normalizedCredentialId = Buffer.isBuffer(credentialId)
      ? credentialId.toString('base64url')
      : (typeof credentialId === 'string' ? credentialId.trim() : '');
    db.prepare(`UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?`).run(normalizedCounter, normalizedCredentialId);
  },
  // Notification helpers
  createNotification: ({ userId, type, title, message, link }) => {
    const stmt = db.prepare(`INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)`);
    const result = stmt.run(userId, type, title, message, link || null);
    return result.lastInsertRowid;
  },
  getUserNotifications: async (userId, limit = 50) => {
    const rows = await db.prepare(`
      SELECT id, type, title, message, link, read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getUnreadNotificationCount: async (userId) => {
    const sql = isProduction
      ? `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = false`
      : `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`;
    const row = await db.prepare(sql).get(userId);
    return row?.count || row?.c || 0;
  },
  markNotificationAsRead: (notificationId) => {
    const sql = isProduction
      ? `UPDATE notifications SET read = true WHERE id = ?`
      : `UPDATE notifications SET read = 1 WHERE id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(notificationId);
  },
  markAllNotificationsAsRead: (userId) => {
    const sql = isProduction
      ? `UPDATE notifications SET read = true WHERE user_id = ?`
      : `UPDATE notifications SET read = 1 WHERE user_id = ?`;
    const stmt = db.prepare(sql);
    stmt.run(userId);
  },
  deleteNotification: (notificationId) => {
    const stmt = db.prepare(`DELETE FROM notifications WHERE id = ?`);
    stmt.run(notificationId);
  },
  savePushSubscription: ({ userId, endpoint, p256dh, auth }) => {
    if (isProduction) {
      // PostgreSQL: Use ON CONFLICT
      db.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
      `).run(userId, endpoint, p256dh, auth);
    } else {
      // SQLite: Use ON CONFLICT
      db.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
      `).run(userId, endpoint, p256dh, auth);
    }
  },
  getPushSubscriptions: async (userId) => {
    const rows = await db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`).all(userId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  deletePushSubscription: (endpoint) => {
    const stmt = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
    stmt.run(endpoint);
  },
  // Subscription helpers
  getUserSubscription: async (userId) => {
    const result = await db.prepare(`SELECT * FROM user_subscriptions WHERE user_id = ?`).get(userId);
    return result;
  },
  createOrUpdateSubscription: ({ userId, tier, status = 'active', endsAt = null, autoRenew = 1, provider = null, providerSubscriptionId = null, providerCustomerId = null }) => {
    const existing = db.prepare(`SELECT id FROM user_subscriptions WHERE user_id = ?`).get(userId);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE user_subscriptions 
        SET tier = ?, status = ?, ends_at = ?, auto_renew = ?, payment_provider = ?, provider_subscription_id = ?, provider_customer_id = ?, started_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(tier, status, endsAt, autoRenew, provider, providerSubscriptionId, providerCustomerId, userId);
      return existing.id;
    } else {
      const stmt = db.prepare(`
        INSERT INTO user_subscriptions (user_id, tier, status, ends_at, auto_renew, payment_provider, provider_subscription_id, provider_customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(userId, tier, status, endsAt, autoRenew, provider, providerSubscriptionId, providerCustomerId);
      return result.lastInsertRowid;
    }
  },
  cancelSubscription: (userId) => {
    const stmt = db.prepare(`UPDATE user_subscriptions SET status = 'cancelled', auto_renew = 0 WHERE user_id = ?`);
    stmt.run(userId);
  },
  // Payment methods
  addPaymentMethod: ({ userId, cardType, lastFour, expiryMonth, expiryYear, isDefault = 0, provider = 'mock', providerPaymentMethodId = null }) => {
    // If this is the default, unset other defaults
    if (isDefault) {
      db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(userId);
    }
    const stmt = db.prepare(`
      INSERT INTO payment_methods (user_id, payment_provider, provider_payment_method_id, card_type, last_four, expiry_month, expiry_year, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, provider, providerPaymentMethodId, cardType, lastFour, expiryMonth, expiryYear, isDefault);
    return result.lastInsertRowid;
  },
  getPaymentMethods: async (userId) => {
    const rows = await db.prepare(`SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`).all(userId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  deletePaymentMethod: (id) => {
    const stmt = db.prepare(`DELETE FROM payment_methods WHERE id = ?`);
    stmt.run(id);
  },
  setDefaultPaymentMethod: (id, userId) => {
    db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE payment_methods SET is_default = 1 WHERE id = ?`).run(id);
  },
  // Invoices
  createInvoice: ({ userId, amount, tier, status = 'paid', provider = null, providerPaymentId = null }) => {
    const stmt = db.prepare(`
      INSERT INTO invoices (user_id, amount, tier, status, payment_provider, provider_payment_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, amount, tier, status, provider, providerPaymentId);
    return result.lastInsertRowid;
  },
  getInvoices: async (userId) => {
    const rows = await db.prepare(`SELECT * FROM invoices WHERE user_id = ? ORDER BY invoice_date DESC`).all(userId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  // Payment customers (for storing provider customer IDs)
  getPaymentCustomer: ({ userId, provider }) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ? AND payment_provider = ?`);
    return stmt.get(userId, provider);
  },
  createPaymentCustomer: ({ userId, provider, providerCustomerId }) => {
    if (isProduction) {
      // PostgreSQL: Use ON CONFLICT
      db.prepare(`
        INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, payment_provider) DO UPDATE SET
          provider_customer_id = EXCLUDED.provider_customer_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, provider, providerCustomerId);
    } else {
      // SQLite: Use ON CONFLICT
      db.prepare(`
        INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, payment_provider) DO UPDATE SET 
          provider_customer_id = excluded.provider_customer_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, provider, providerCustomerId);
    }
  },
  getAllPaymentCustomers: (userId) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ?`);
    return stmt.all(userId);
  },
  // Follow helpers
  followUser: ({ followerId, followingId }) => {
    if (isProduction) {
      // SQL Server: INSERT with WHERE NOT EXISTS
      db.prepare(`
        INSERT INTO follows (follower_id, following_id)
        SELECT ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?)
      `).run(followerId, followingId, followerId, followingId);
    } else {
      const sql = isProduction
        ? `INSERT INTO follows (follower_id, following_id) VALUES (?,?) ON CONFLICT (follower_id, following_id) DO NOTHING`
        : `INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?,?)`;
      db.prepare(sql).run(followerId, followingId);
    }
  },
  unfollowUser: ({ followerId, followingId }) => {
    db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(followerId, followingId);
  },
  isFollowing: async ({ followerId, followingId }) => {
    const row = await db.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`).get(followerId, followingId);
    return !!row;
  },
  getFollowerCount: async (userId) => {
    const result = await db.prepare(`SELECT COUNT(*) as c FROM follows WHERE following_id = ?`).get(userId);
    return result?.c || result?.count || 0;
  },
  getFollowingCount: async (userId) => {
    const result = await db.prepare(`SELECT COUNT(*) as c FROM follows WHERE follower_id = ?`).get(userId);
    return result?.c || result?.count || 0;
  },
  getFollowers: async (userId, limit = 100) => {
    const rows = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.bio
      FROM follows f
      JOIN users u ON u.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getFollowing: async (userId, limit = 100) => {
    const rows = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.bio
      FROM follows f
      JOIN users u ON u.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  // Active reel count (last 48 hours)
  getActiveReelCount: async (userId) => {
    // Use different date functions for PostgreSQL vs SQLite
    const query = isProduction
      ? `SELECT COUNT(*) as cnt FROM posts WHERE user_id = ? AND is_reel = true AND created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'`
      : `SELECT COUNT(*) as cnt FROM posts WHERE user_id = ? AND is_reel = 1 AND created_at >= datetime('now', '-48 hours')`;
    const row = await db.prepare(query).get(userId);
    return row?.cnt || row?.count || 0;
  },
  // Account moderation helpers
  banUser: ({ userId, reason, bannedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'banned', suspension_reason = ? WHERE id = ?`).run(reason || 'Violation of community guidelines', userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      bannedBy,
      'ban_user',
      JSON.stringify({ targetUserId: userId, reason: reason || 'Violation of community guidelines' })
    );
  },
  suspendUser: ({ userId, until, reason, suspendedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'suspended', suspension_until = ?, suspension_reason = ? WHERE id = ?`).run(until, reason || 'Temporary suspension', userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      suspendedBy,
      'suspend_user',
      JSON.stringify({ targetUserId: userId, until, reason: reason || 'Temporary suspension' })
    );
  },
  unbanUser: ({ userId, unbannedBy }) => {
    db.prepare(`UPDATE users SET account_status = 'active', suspension_until = NULL, suspension_reason = NULL WHERE id = ?`).run(userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      unbannedBy,
      'unban_user',
      JSON.stringify({ targetUserId: userId })
    );
  },
  checkAccountStatus: async (userId) => {
    const user = await db.prepare(`SELECT account_status, suspension_until, suspension_reason FROM users WHERE id = ?`).get(userId);
    if (!user) return { status: 'not_found' };

    // Check if suspension has expired
    if (user.account_status === 'suspended' && user.suspension_until) {
      const now = new Date();
      const suspensionEnd = new Date(user.suspension_until);
      if (now >= suspensionEnd) {
        await db.prepare(`UPDATE users SET account_status = 'active', suspension_until = NULL, suspension_reason = NULL WHERE id = ?`).run(userId);
        return { status: 'active' };
      }
    }

    return {
      status: user.account_status || 'active',
      suspensionUntil: user.suspension_until,
      suspensionReason: user.suspension_reason
    };
  },
  // Careers helpers
  createCareerApplication: ({ position, name, email, phone, coverLetter, resumeFile, portfolioFile }) => {
    const stmt = db.prepare(`
      INSERT INTO career_applications (position, name, email, phone, cover_letter, resume_file, portfolio_file)
      VALUES (?,?,?,?,?,?,?)SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sessions]') AND type = N'U'
    `);
    const info = stmt.run(position, name, email, phone || null, coverLetter, resumeFile || null, portfolioFile || null);
    return info.lastInsertRowid;
  },
  getCareerApplicationsPaged: async ({ limit = 50, offset = 0, status }) => {
    if (status) {
      const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM career_applications WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
      const rows = await db.prepare(sql).all(status, offsetVal, fetchVal);
      return Array.isArray(rows) ? rows : (rows?.rows || []);
    }
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM career_applications ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getCareerApplicationById: async (id) => {
    const result = await db.prepare(`SELECT * FROM career_applications WHERE id = ?`).get(id);
    return result;
  },
  updateCareerApplicationStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE career_applications SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  getCareerApplicationCounts: async () => {
    const allResult = await db.prepare(`SELECT COUNT(*) as c FROM career_applications`).get();
    const all = allResult?.c || allResult?.count || 0;
    const openResult = await db.prepare(`SELECT COUNT(*) as c FROM career_applications WHERE status IN ('new','under_review')`).get();
    const open = openResult?.c || openResult?.count || 0;
    return { all, open };
  },
  // Job postings
  createCareerJob: ({ title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags = [], salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility = 'public', priority, status = 'draft', goLiveAt, freezeUntil, isFrozen = 0 }) => {
    const stmt = db.prepare(`
      INSERT INTO career_jobs (title, location, team, employment_type, seniority, headline, description, responsibilities, requirements, perks, tags, salary_min, salary_max, salary_currency, apply_url, workplace_type, visibility, priority, status, go_live_at, freeze_until, is_frozen)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const info = stmt.run(
      title,
      location || null,
      team || null,
      employmentType || null,
      seniority || null,
      headline || null,
      description || null,
      responsibilities || null,
      requirements || null,
      perks || null,
      JSON.stringify(tags || []),
      salaryMin || null,
      salaryMax || null,
      salaryCurrency || null,
      applyUrl || null,
      workplaceType || null,
      visibility || 'public',
      priority || null,
      status || 'draft',
      goLiveAt || null,
      freezeUntil || null,
      isFrozen ? 1 : 0
    );
    return info.lastInsertRowid;
  },
  updateCareerJob: ({ id, title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority, status, goLiveAt, freezeUntil, isFrozen }) => {
    const existing = db.prepare(`SELECT * FROM career_jobs WHERE id = ?`).get(id);
    if (!existing) return null;
    db.prepare(`
      UPDATE career_jobs
      SET title = ?, location = ?, team = ?, employment_type = ?, seniority = ?, headline = ?, description = ?, responsibilities = ?, requirements = ?, perks = ?, tags = ?, salary_min = ?, salary_max = ?, salary_currency = ?, apply_url = ?, workplace_type = ?, visibility = ?, priority = ?, status = ?, go_live_at = ?, freeze_until = ?, is_frozen = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || existing.title,
      location !== undefined ? location : existing.location,
      team !== undefined ? team : existing.team,
      employmentType !== undefined ? employmentType : existing.employment_type,
      seniority !== undefined ? seniority : existing.seniority,
      headline !== undefined ? headline : existing.headline,
      description !== undefined ? description : existing.description,
      responsibilities !== undefined ? responsibilities : existing.responsibilities,
      requirements !== undefined ? requirements : existing.requirements,
      perks !== undefined ? perks : existing.perks,
      tags !== undefined ? JSON.stringify(tags || []) : existing.tags,
      salaryMin !== undefined ? salaryMin : existing.salary_min,
      salaryMax !== undefined ? salaryMax : existing.salary_max,
      salaryCurrency !== undefined ? salaryCurrency : existing.salary_currency,
      applyUrl !== undefined ? applyUrl : existing.apply_url,
      workplaceType !== undefined ? workplaceType : existing.workplace_type,
      visibility !== undefined ? visibility : existing.visibility,
      priority !== undefined ? priority : existing.priority,
      status || existing.status,
      goLiveAt !== undefined ? goLiveAt : existing.go_live_at,
      freezeUntil !== undefined ? freezeUntil : existing.freeze_until,
      typeof isFrozen === 'number' || typeof isFrozen === 'boolean' ? (isFrozen ? 1 : 0) : existing.is_frozen,
      id
    );
    return db.prepare(`SELECT * FROM career_jobs WHERE id = ?`).get(id);
  },
  getCareerJobById: async (id) => {
    const job = await db.prepare(`SELECT * FROM career_jobs WHERE id = ?`).get(id);
    if (!job) return null;
    try { job.tags = job.tags ? JSON.parse(job.tags) : []; } catch (_) { job.tags = []; }
    const assetsRaw = await db.prepare(`SELECT * FROM career_job_assets WHERE job_id = ? ORDER BY created_at DESC`).all(id);
    job.assets = Array.isArray(assetsRaw) ? assetsRaw : (assetsRaw?.rows || []);
    return job;
  },
  setCareerJobStatus: ({ id, status, freezeUntil }) => {
    db.prepare(`
      UPDATE career_jobs
      SET status = ?, is_frozen = CASE WHEN ? = 'frozen' THEN 1 ELSE 0 END, freeze_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status, freezeUntil || null, id);
    const job = db.prepare(`SELECT * FROM career_jobs WHERE id = ?`).get(id);
    if (!job) return null;
    try { job.tags = job.tags ? JSON.parse(job.tags) : []; } catch (_) { job.tags = []; }
    job.assets = db.prepare(`SELECT * FROM career_job_assets WHERE job_id = ? ORDER BY created_at DESC`).all(id);
    return job;
  },
  addCareerJobAsset: ({ jobId, label, fileName, filePath, fileSize, mimeType }) => {
    const stmt = db.prepare(`
      INSERT INTO career_job_assets (job_id, label, file_name, file_path, file_size, mime_type)
      VALUES (?,?,?,?,?,?)
    `);
    const info = stmt.run(jobId, label || null, fileName, filePath, fileSize || null, mimeType || null);
    return info.lastInsertRowid;
  },
  removeCareerJobAsset: ({ assetId, jobId }) => {
    const stmt = db.prepare(`DELETE FROM career_job_assets WHERE id = ? AND job_id = ?`);
    const info = stmt.run(assetId, jobId);
    return info.changes > 0;
  },
  getCareerJobAssets: (jobId) => {
    return db.prepare(`SELECT * FROM career_job_assets WHERE job_id = ? ORDER BY created_at DESC`).all(jobId);
  },
  getCareerJobsForAdmin: async () => {
    const parseTags = (value) => {
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
    };
    const jobsRaw = await db.prepare(`SELECT * FROM career_jobs ORDER BY created_at DESC`).all();
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : (jobsRaw?.rows || []);
    return Promise.all(jobs.map(async j => {
      const assetsRaw = await db.prepare(`SELECT * FROM career_job_assets WHERE job_id = ? ORDER BY created_at DESC`).all(j.id);
      const assets = Array.isArray(assetsRaw) ? assetsRaw : (assetsRaw?.rows || []);
      return {
        ...j,
        tags: parseTags(j.tags),
        assets
      };
    }));
  },
  getPublicCareerJobs: () => {
    const parseTags = (value) => {
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
    };
    const nowIso = new Date().toISOString();
    const jobs = db.prepare(`
      SELECT * FROM career_jobs
      WHERE (status = 'live' OR (status = 'scheduled' AND (go_live_at IS NULL OR go_live_at <= ?)))
        AND (is_frozen = 0 OR (freeze_until IS NOT NULL AND freeze_until <= ?))
        AND (visibility IS NULL OR visibility = 'public')
      ORDER BY COALESCE(go_live_at, created_at) DESC
    `).all(nowIso, nowIso);
    return jobs.map(j => ({
      ...j,
      tags: parseTags(j.tags),
      assets: db.prepare(`SELECT * FROM career_job_assets WHERE job_id = ? ORDER BY created_at DESC`).all(j.id)
    }));
  },
  // Content appeals helpers
  createContentAppeal: ({ email, contentType, contentUrl, removalReason, description, appealReason, additionalInfo }) => {
    const stmt = db.prepare(`
      INSERT INTO content_appeals (email, content_type, content_url, removal_reason, description, appeal_reason, additional_info)
      VALUES (?,?,?,?,?,?,?)
    `);
    const info = stmt.run(email, contentType, contentUrl || null, removalReason || null, description || null, appealReason, additionalInfo || null);
    return info.lastInsertRowid;
  },
  getContentAppealsPaged: async ({ limit = 50, offset = 0, status }) => {
    if (status) {
      const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM content_appeals WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
      const rows = await db.prepare(sql).all(status, offsetVal, fetchVal);
      return Array.isArray(rows) ? rows : (rows?.rows || []);
    }
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM content_appeals ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getContentAppealById: (id) => {
    return db.prepare(`SELECT * FROM content_appeals WHERE id = ?`).get(id);
  },
  updateContentAppealStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE content_appeals SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  // Account appeals helpers
  createAccountAppeal: ({ email, username, accountAction, actionDate, violationReason, appealReason, preventionPlan, additionalInfo, contactEmail }) => {
    const stmt = db.prepare(`
      INSERT INTO account_appeals (email, username, account_action, action_date, violation_reason, appeal_reason, prevention_plan, additional_info, contact_email)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const info = stmt.run(email, username, accountAction, actionDate || null, violationReason || null, appealReason, preventionPlan || null, additionalInfo || null, contactEmail || null);
    return info.lastInsertRowid;
  },
  getAccountAppealsPaged: async ({ limit = 50, offset = 0, status }) => {
    if (status) {
      const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM account_appeals WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
      const rows = await db.prepare(sql).all(status, offsetVal, fetchVal);
      return Array.isArray(rows) ? rows : (rows?.rows || []);
    }
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(`SELECT * FROM account_appeals ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset);
    const rows = await db.prepare(sql).all(offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getAccountAppealById: (id) => {
    return db.prepare(`SELECT * FROM account_appeals WHERE id = ?`).get(id);
  },
  updateAccountAppealStatus: ({ id, status, reviewerId }) => {
    db.prepare(`UPDATE account_appeals SET status = ?, reviewer_id = ? WHERE id = ?`).run(status, reviewerId || null, id);
  },
  // Get recent activity for feed sidebar
  getRecentActivity: async (limit = 5) => {
    const activities = [];

    // Get recent posts (with user info)
    const recentPostsRaw = await db.prepare(`
      SELECT p.created_at, u.full_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_reel = ${isProduction ? 'false' : '0'}
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(limit);
    const recentPosts = Array.isArray(recentPostsRaw) ? recentPostsRaw : (recentPostsRaw?.rows || []);

    recentPosts.forEach(post => {
      activities.push({
        type: 'post',
        desc: `${post.full_name} published a new post`,
        time: post.created_at,
        timestamp: new Date(post.created_at).getTime()
      });
    });

    // Get recent follows
    const recentFollowsRaw = await db.prepare(`
      SELECT f.created_at, 
             u1.full_name as follower_name,
             u2.full_name as following_name
      FROM follows f
      JOIN users u1 ON f.follower_id = u1.id
      JOIN users u2 ON f.following_id = u2.id
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(limit);
    const recentFollows = Array.isArray(recentFollowsRaw) ? recentFollowsRaw : (recentFollowsRaw?.rows || []);

    recentFollows.forEach(follow => {
      activities.push({
        type: 'follow',
        desc: `${follow.follower_name} followed ${follow.following_name}`,
        time: follow.created_at,
        timestamp: new Date(follow.created_at).getTime()
      });
    });

    // Get recent profile updates (we'll check for recent updates based on created_at being close to current time)
    const recentUpdatesQuery = isProduction
      ? `
      SELECT created_at, full_name
      FROM users
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
      ORDER BY created_at DESC
      LIMIT ?
    `
      : `
      SELECT created_at, full_name
      FROM users
      WHERE datetime(created_at) >= datetime('now', '-1 day')
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const recentUpdatesRaw = await db.prepare(recentUpdatesQuery).all(limit);
    const recentUpdates = Array.isArray(recentUpdatesRaw) ? recentUpdatesRaw : (recentUpdatesRaw?.rows || []);

    recentUpdates.forEach(update => {
      activities.push({
        type: 'update',
        desc: `${update.full_name} updated their profile`,
        time: update.created_at,
        timestamp: new Date(update.created_at).getTime()
      });
    });

    // Sort all activities by timestamp descending and format time
    activities.sort((a, b) => b.timestamp - a.timestamp);

    // Format time strings
    const now = Date.now();
    activities.forEach(act => {
      const diff = now - act.timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) {
        act.time = 'just now';
      } else if (minutes < 60) {
        act.time = `${minutes}m ago`;
      } else if (hours < 24) {
        act.time = `${hours}h ago`;
      } else {
        act.time = `${days}d ago`;
      }

      // Clean up internal fields
      delete act.timestamp;
    });

    return activities.slice(0, limit);
  },
  // Comment moderation
  hideComment: ({ commentId, hiddenBy }) => {
    db.prepare(`UPDATE post_comments SET is_hidden = 1 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      hiddenBy,
      'hide_comment',
      JSON.stringify({ commentId })
    );
  },
  deleteComment: ({ commentId, deletedBy }) => {
    db.prepare(`UPDATE post_comments SET is_deleted = 1 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      deletedBy,
      'delete_comment',
      JSON.stringify({ commentId })
    );
  },
  restoreComment: ({ commentId, restoredBy }) => {
    db.prepare(`UPDATE post_comments SET is_hidden = 0, is_deleted = 0 WHERE id = ?`).run(commentId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      restoredBy,
      'restore_comment',
      JSON.stringify({ commentId })
    );
  },
  getSuggestedUsers: ({ currentUserId, limit = 4 }) => {
    // Get users that the current user is NOT following and exclude self
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.categories
      FROM users u
      WHERE u.id != ?
        AND u.id NOT IN (
          SELECT following_id FROM follows WHERE follower_id = ?
        )
      ORDER BY (
        SELECT COUNT(*) FROM posts WHERE user_id = u.id
      ) DESC, u.created_at DESC
      LIMIT ?
    `).all(currentUserId, currentUserId, limit);
  },
  // Message reactions
  setMessageReaction: ({ messageId, userId, reactionType = 'like' }) => {
    const existing = db.prepare(`SELECT id, reaction_type FROM message_reactions WHERE message_id = ? AND user_id = ?`).get(messageId, userId);
    let status = 'set';
    if (!existing) {
      db.prepare(`INSERT INTO message_reactions (message_id, user_id, reaction_type) VALUES (?,?,?)`).run(messageId, userId, reactionType);
      status = 'set';
    } else if (existing.reaction_type === reactionType) {
      db.prepare(`DELETE FROM message_reactions WHERE id = ?`).run(existing.id);
      status = 'cleared';
    } else {
      db.prepare(`UPDATE message_reactions SET reaction_type = ? WHERE id = ?`).run(reactionType, existing.id);
      status = 'updated';
    }
    const summary = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM message_reactions
      WHERE message_id = ?
      GROUP BY reaction_type
    `).all(messageId);
    const counts = summary.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
    return { status, counts };
  },
  getMessageReactions: (messageId) => {
    const rows = db.prepare(`
      SELECT reaction_type, COUNT(*) as c
      FROM message_reactions
      WHERE message_id = ?
      GROUP BY reaction_type
    `).all(messageId);
    return rows.reduce((acc, r) => { acc[r.reaction_type] = r.c; return acc; }, {});
  },
  getUserReactionForMessage: ({ messageId, userId }) => {
    const row = db.prepare(`SELECT reaction_type FROM message_reactions WHERE message_id = ? AND user_id = ?`).get(messageId, userId);
    return row ? row.reaction_type : null;
  },
  // Get comment with parent info for nested comments
  getCommentWithParent: (commentId) => {
    return db.prepare(`
      SELECT c.*, u.full_name, u.profile_picture,
             p.full_name as parent_author_name
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN post_comments pc ON pc.id = c.parent_id
      LEFT JOIN users p ON p.id = pc.user_id
      WHERE c.id = ?
    `).get(commentId);
  },

  // Service management functions
  createService: ({ userId, title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl }) => {
    const stmt = db.prepare(`
      INSERT INTO services (user_id, title, description, category, price_per_hour, duration_minutes, experience_level, format, availability, location, tags, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, title, description, category, pricePerHour, durationMinutes || 60, experienceLevel, format, availability, location, tags, imageUrl);
    return result.lastInsertRowid;
  },

  getUserServices: async (userId) => {
    const rows = await db.prepare(`
      SELECT * FROM services
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(userId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  getAllServices: async ({ category, priceRange, experienceLevel, format, limit = 100 }) => {
    let query = `
      SELECT 
        s.*, 
        u.full_name, u.profile_picture, u.categories,
        (
          SELECT ROUND(AVG(r.rating), 2) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_avg,
        (
          SELECT COUNT(*) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_count
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'
    `;
    const params = [];

    if (category) {
      query += ` AND s.category = ?`;
      params.push(category);
    }
    if (priceRange) {
      if (priceRange === 'under-25') query += ` AND s.price_per_hour < 25`;
      else if (priceRange === '25-50') query += ` AND s.price_per_hour BETWEEN 25 AND 50`;
      else if (priceRange === '50-75') query += ` AND s.price_per_hour BETWEEN 50 AND 75`;
      else if (priceRange === '75plus') query += ` AND s.price_per_hour >= 75`;
    }
    if (experienceLevel) {
      query += ` AND s.experience_level = ?`;
      params.push(experienceLevel);
    }
    if (format) {
      query += ` AND s.format = ?`;
      params.push(format);
    }

    query += ` ORDER BY s.created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = await db.prepare(query).all(...params);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  getService: async (serviceId) => {
    const result = await db.prepare(`
      SELECT 
        s.*, 
        u.full_name, u.profile_picture, u.email, u.bio, u.categories,
        (
          SELECT ROUND(AVG(r.rating), 2) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_avg,
        (
          SELECT COUNT(*) FROM service_reviews r WHERE r.service_id = s.id
        ) AS rating_count
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.status = 'active'
    `).get(serviceId);
    return result;
  },

  updateService: ({ serviceId, userId, title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl }) => {
    const stmt = db.prepare(`
      UPDATE services
      SET title = ?, description = ?, category = ?, price_per_hour = ?, duration_minutes = ?,
          experience_level = ?, format = ?, availability = ?, location = ?, tags = ?, image_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);
    const result = stmt.run(title, description, category, pricePerHour, durationMinutes, experienceLevel, format, availability, location, tags, imageUrl, serviceId, userId);
    return result.changes > 0;
  },

  deleteService: ({ serviceId, userId }) => {
    const stmt = db.prepare(`UPDATE services SET status = 'deleted' WHERE id = ? AND user_id = ?`);
    const result = stmt.run(serviceId, userId);
    return result.changes > 0;
  },

  getServiceCount: async (userId) => {
    const result = await db.prepare(`SELECT COUNT(*) as count FROM services WHERE user_id = ? AND status = 'active'`).get(userId);
    return result?.count || result?.c || 0;
  },

  // Service Orders (for purchase verification)
  addServiceOrder: ({ serviceId, buyerId, status = 'completed' }) => {
    const info = db.prepare(`INSERT INTO service_orders (service_id, buyer_id, status) VALUES (?,?,?)`).run(serviceId, buyerId, status);
    return info.lastInsertRowid;
  },
  isVerifiedPurchaser: async ({ serviceId, userId }) => {
    const row = await db.prepare(`SELECT 1 FROM service_orders WHERE service_id = ? AND buyer_id = ? AND status = 'completed' LIMIT 1`).get(serviceId, userId);
    return !!row;
  },

  // Service Reviews
  addOrUpdateServiceReview: ({ serviceId, userId, rating, comment }) => {
    // Upsert: if review exists for (serviceId, userId), update; else insert
    const existing = db.prepare(`SELECT id FROM service_reviews WHERE service_id = ? AND user_id = ?`).get(serviceId, userId);
    if (existing) {
      db.prepare(`UPDATE service_reviews SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`).run(rating, comment || null, existing.id);
      return existing.id;
    }
    const info = db.prepare(`INSERT INTO service_reviews (service_id, user_id, rating, comment) VALUES (?,?,?,?)`).run(serviceId, userId, rating, comment || null);
    return info.lastInsertRowid;
  },
  getServiceReviews: async ({ serviceId, limit = 20, offset = 0, isAdmin = false }) => {
    const whereClause = isAdmin
      ? 'WHERE r.service_id = ?'
      : 'WHERE r.service_id = ? AND r.is_hidden = 0 AND r.is_deleted = 0';

    let query = `
      SELECT r.*, u.full_name, u.profile_picture
      FROM service_reviews r
      JOIN users u ON u.id = r.user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const rows = await db.prepare(sql).all(serviceId, offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  getServiceRatingsSummary: async (serviceId) => {
    const row = await db.prepare(`SELECT ROUND(AVG(rating), 2) AS avg, COUNT(*) AS count FROM service_reviews WHERE service_id = ?`).get(serviceId);
    return { average: row?.avg || 0, count: row?.count || 0 };
  },

  // Admin service moderation helpers
  adminSetServiceStatus: ({ serviceId, status }) => {
    const stmt = db.prepare(`UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    const result = stmt.run(status, serviceId);
    return result.changes > 0;
  },
  adminUpdateServiceContent: ({ serviceId, fields }) => {
    const allowed = ['title', 'description', 'category', 'price_per_hour', 'duration_minutes', 'experience_level', 'format', 'availability', 'location', 'tags', 'image_url'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (sets.length === 0) return false;
    params.push(serviceId);
    const sql = `UPDATE services SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    const result = db.prepare(sql).run(...params);
    return result.changes > 0;
  },
  listAllServicesAdmin: ({ status, limit = 100, offset = 0, q }) => {
    let sql = `
      SELECT s.*, u.full_name, u.email
      FROM services s
      JOIN users u ON u.id = s.user_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND s.status = ?`; params.push(status); }
    if (q) {
      sql += ` AND (LOWER(s.title) LIKE ? OR LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)`;
      const sLike = `%${q.toLowerCase()}%`;
      params.push(sLike, sLike, sLike);
    }
    sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    const { sql: convertedSql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(sql, limit, offset);
    params.push(offsetVal, fetchVal);
    return db.prepare(convertedSql).all(...params);
  },

  // Service review moderation
  hideServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_hidden = 1 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'hide_service_review',
      JSON.stringify({ reviewId })
    );
  },
  deleteServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_deleted = 1 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'delete_service_review',
      JSON.stringify({ reviewId })
    );
  },
  restoreServiceReview: ({ reviewId, moderatorId }) => {
    db.prepare(`UPDATE service_reviews SET is_hidden = 0, is_deleted = 0 WHERE id = ?`).run(reviewId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      moderatorId,
      'restore_service_review',
      JSON.stringify({ reviewId })
    );
  },
  // Payment customer helpers
  getPaymentCustomer: ({ userId, provider }) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ? AND payment_provider = ?`);
    return stmt.get(userId, provider);
  },
  createPaymentCustomer: ({ userId, provider, providerCustomerId }) => {
    if (isProduction) {
      // PostgreSQL: Use ON CONFLICT
      db.prepare(`
        INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, payment_provider) DO UPDATE SET
          provider_customer_id = EXCLUDED.provider_customer_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, provider, providerCustomerId);
    } else {
      // SQLite: Use ON CONFLICT
      db.prepare(`
        INSERT INTO payment_customers (user_id, payment_provider, provider_customer_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, payment_provider) DO UPDATE SET 
          provider_customer_id = excluded.provider_customer_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, provider, providerCustomerId);
    }
  },
  getAllPaymentCustomers: (userId) => {
    const stmt = db.prepare(`SELECT * FROM payment_customers WHERE user_id = ?`);
    return stmt.all(userId);
  },

  // User blocks
  blockUser: ({ blockerId, blockedId, reason }) => {
    // Check if blocker's block functionality is locked
    const modRow = db.prepare(`SELECT block_functionality_locked FROM user_moderation WHERE user_id = ?`).get(blockerId);
    if (modRow && modRow.block_functionality_locked === 1) {
      throw new Error('Block functionality is locked for this user');
    }
    
    let result;
    if (isProduction) {
      // PostgreSQL: INSERT with ON CONFLICT
      const stmt = db.prepare(`
        INSERT INTO user_blocks (blocker_id, blocked_id, reason)
        VALUES (?, ?, ?)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      `);
      result = stmt.run(blockerId, blockedId, reason || null);
    } else {
      const stmt = db.prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)`);
      result = stmt.run(blockerId, blockedId, reason || null);
    }
    // Log the action
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      blockerId,
      'block_user',
      JSON.stringify({ blockedId, reason })
    );
    return result.changes > 0;
  },
  unblockUser: ({ blockerId, blockedId }) => {
    const stmt = db.prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`);
    const result = stmt.run(blockerId, blockedId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      blockerId,
      'unblock_user',
      JSON.stringify({ blockedId })
    );
    return result.changes > 0;
  },
  isUserBlocked: ({ userId, targetId }) => {
    const row = db.prepare(`SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`).get(userId, targetId);
    return !!row;
  },
  getBlockedUsers: (userId) => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.handle, u.profile_picture, ub.created_at, ub.reason
      FROM user_blocks ub
      JOIN users u ON u.id = ub.blocked_id
      WHERE ub.blocker_id = ?
      ORDER BY ub.created_at DESC
    `).all(userId);
  },

  // User reports
  reportUser: ({ reporterId, reportedId, reason, description }) => {
    const stmt = db.prepare(`INSERT INTO user_reports (reporter_id, reported_id, reason, description) VALUES (?,?,?,?)`);
    const result = stmt.run(reporterId, reportedId, reason, description || null);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      reporterId,
      'report_user',
      JSON.stringify({ reportedId, reason })
    );
    return result.lastInsertRowid;
  },
  getUserReports: async ({ limit = 50, offset = 0, status }) => {
    let sql = `
      SELECT r.*, 
             u1.handle as reporter_username, u1.full_name as reporter_name,
             u2.handle as reported_username, u2.full_name as reported_name,
             u3.full_name as reviewer_name
      FROM user_reports r
      JOIN users u1 ON u1.id = r.reporter_id
      JOIN users u2 ON u2.id = r.reported_id
      LEFT JOIN users u3 ON u3.id = r.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    sql += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = await db.prepare(sql).all(...params);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },
  updateReportStatus: ({ reportId, status, reviewerId, adminNotes }) => {
    const stmt = db.prepare(`
      UPDATE user_reports 
      SET status = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(status, reviewerId, adminNotes || null, reportId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      reviewerId,
      'review_report',
      JSON.stringify({ reportId, status })
    );
    return result.changes > 0;
  },

  // User moderation (block functionality lock)
  lockUserBlockFunctionality: ({ userId, reason, lockedBy }) => {
    if (isProduction) {
      // PostgreSQL: INSERT ... ON CONFLICT for upsert
      db.prepare(`
        INSERT INTO user_moderation (user_id, block_functionality_locked, lock_reason, locked_by, locked_at)
        VALUES (?, true, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          block_functionality_locked = EXCLUDED.block_functionality_locked,
          lock_reason = EXCLUDED.lock_reason,
          locked_by = EXCLUDED.locked_by,
          locked_at = EXCLUDED.locked_at
      `).run(userId, reason || null, lockedBy);
    } else {
      const sql = isProduction
        ? `INSERT INTO user_moderation (user_id, block_functionality_locked, lock_reason, locked_by, locked_at)
           VALUES (?, true, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE SET
             block_functionality_locked = EXCLUDED.block_functionality_locked,
             lock_reason = EXCLUDED.lock_reason,
             locked_by = EXCLUDED.locked_by,
             locked_at = EXCLUDED.locked_at`
        : `INSERT OR REPLACE INTO user_moderation (user_id, block_functionality_locked, lock_reason, locked_by, locked_at)
           VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)`;
      db.prepare(sql).run(userId, reason || null, lockedBy);
    }
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      lockedBy,
      'lock_block_functionality',
      JSON.stringify({ targetUserId: userId, reason })
    );
  },
  unlockUserBlockFunctionality: ({ userId, unlockedBy }) => {
    db.prepare(`DELETE FROM user_moderation WHERE user_id = ?`).run(userId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      unlockedBy,
      'unlock_block_functionality',
      JSON.stringify({ targetUserId: userId })
    );
  },
  getUserModerationStatus: (userId) => {
    return db.prepare(`SELECT * FROM user_moderation WHERE user_id = ?`).get(userId);
  },
  getAllBlocksAndReports: ({ limit = 100, offset = 0 }) => {
    let query = `
      SELECT ub.id, ub.blocker_id, ub.blocked_id, ub.reason, ub.created_at,
             u1.handle as blocker_username, u1.full_name as blocker_name,
             u2.handle as blocked_username, u2.full_name as blocked_name,
             mod.block_functionality_locked as blocker_locked
      FROM user_blocks ub
      JOIN users u1 ON u1.id = ub.blocker_id
      JOIN users u2 ON u2.id = ub.blocked_id
      LEFT JOIN user_moderation mod ON mod.user_id = ub.blocker_id
      ORDER BY ub.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const blocks = db.prepare(sql).all(offsetVal, fetchVal);
    return blocks;
  },

  // Livestream functions
  createLivestream: ({ userId, title, description, recordingEnabled = 1 }) => {
    const streamKey = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
      INSERT INTO livestreams (user_id, title, description, stream_key, recording_enabled)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, title, description || null, streamKey, recordingEnabled);
    return {
      id: result.lastInsertRowid,
      streamKey
    };
  },

  getLivestream: (streamId) => {
    return db.prepare(`
      SELECT l.*, u.full_name, u.profile_picture
      FROM livestreams l
      JOIN users u ON u.id = l.user_id
      WHERE l.id = ?
    `).get(streamId);
  },

  getLivestreamByKey: (streamKey) => {
    return db.prepare(`
      SELECT l.*, u.full_name, u.profile_picture
      FROM livestreams l
      JOIN users u ON u.id = l.user_id
      WHERE l.stream_key = ?
    `).get(streamKey);
  },

  getActiveLivestreams: ({ limit = 50, offset = 0 }) => {
    let query = `
      SELECT l.*, u.full_name, u.profile_picture,
        (SELECT COUNT(*) FROM livestream_viewers WHERE stream_id = l.id AND left_at IS NULL) as current_viewers
      FROM livestreams l
      JOIN users u ON u.id = l.user_id
      WHERE l.status = 'live'
      ORDER BY l.started_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    return db.prepare(sql).all(offsetVal, fetchVal);
  },

  getUserLivestreams: (userId) => {
    return db.prepare(`
      SELECT * FROM livestreams
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);
  },

  startLivestream: (streamId) => {
    const stmt = db.prepare(`
      UPDATE livestreams
      SET status = 'live', started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(streamId);
  },

  endLivestream: ({ streamId, recordingUrl }) => {
    const stmt = db.prepare(`
      UPDATE livestreams
      SET status = 'ended', ended_at = CURRENT_TIMESTAMP, recording_url = ?
      WHERE id = ?
    `);
    stmt.run(recordingUrl || null, streamId);

    // Mark all viewers as left
    db.prepare(`
      UPDATE livestream_viewers
      SET left_at = CURRENT_TIMESTAMP
      WHERE stream_id = ? AND left_at IS NULL
    `).run(streamId);
  },

  addLivestreamViewer: ({ streamId, userId }) => {
    const stmt = db.prepare(`
      INSERT INTO livestream_viewers (stream_id, user_id)
      VALUES (?, ?)
    `);
    return stmt.run(streamId, userId || null).lastInsertRowid;
  },

  removeLivestreamViewer: ({ streamId, userId }) => {
    db.prepare(`
      UPDATE livestream_viewers
      SET left_at = CURRENT_TIMESTAMP
      WHERE stream_id = ? AND user_id = ? AND left_at IS NULL
    `).run(streamId, userId);
  },

  getLivestreamViewers: (streamId) => {
    return db.prepare(`
      SELECT lv.*, u.full_name, u.profile_picture
      FROM livestream_viewers lv
      LEFT JOIN users u ON u.id = lv.user_id
      WHERE lv.stream_id = ? AND lv.left_at IS NULL
      ORDER BY lv.joined_at DESC
    `).all(streamId);
  },

  updateLivestreamPeakViewers: ({ streamId, count }) => {
    db.prepare(`
      UPDATE livestreams
      SET viewer_count_peak = MAX(viewer_count_peak, ?)
      WHERE id = ?
    `).run(count, streamId);
  },

  addLivestreamChatMessage: ({ streamId, userId, message }) => {
    const stmt = db.prepare(`
      INSERT INTO livestream_chat (stream_id, user_id, message)
      VALUES (?, ?, ?)
    `);
    return stmt.run(streamId, userId, message).lastInsertRowid;
  },

  getLivestreamChat: ({ streamId, limit = 100, offset = 0 }) => {
    let query = `
      SELECT lc.*, u.full_name, u.profile_picture
      FROM livestream_chat lc
      JOIN users u ON u.id = lc.user_id
      WHERE lc.stream_id = ?
      ORDER BY lc.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    return db.prepare(sql).all(streamId, offsetVal, fetchVal);
  },

  // Billing charges functions
  createCharge: ({ userId, amount, description, chargeDate, status = 'completed', tier, invoiceId }) => {
    const stmt = db.prepare(`
      INSERT INTO billing_charges (user_id, amount, description, charge_date, status, tier, invoice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, amount, description, chargeDate || new Date().toISOString(), status, tier || null, invoiceId || null);
    return result.lastInsertRowid;
  },

  getUserCharges: async ({ userId, limit = 50, offset = 0 }) => {
    let query = `
      SELECT * FROM billing_charges
      WHERE user_id = ?
      ORDER BY charge_date DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const rows = await db.prepare(sql).all(userId, offsetVal, fetchVal);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  getAllCharges: ({ limit = 100, offset = 0, status }) => {
    let sql = `SELECT bc.*, u.full_name, u.email FROM billing_charges bc JOIN users u ON u.id = bc.user_id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND bc.status = ?`; params.push(status); }
    sql += ` ORDER BY bc.charge_date DESC LIMIT ? OFFSET ?`;
    const { sql: convertedSql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(sql, limit, offset);
    params.push(offsetVal, fetchVal);
    return db.prepare(convertedSql).all(...params);
  },

  // Refund request functions
  createRefundRequest: ({ userId, chargeId, amount, reason, description, orderDate, transactionId, preferredMethod, accountEmail, accountLastFour, screenshot, status = 'pending' }) => {
    const stmt = db.prepare(`
      INSERT INTO refund_requests (user_id, charge_id, amount, reason, description, order_date, transaction_id, preferred_method, account_email, account_last_four, screenshot, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, chargeId || null, amount, reason, description || null, orderDate || null, transactionId || null, preferredMethod, accountEmail || null, accountLastFour || null, screenshot || null, status);
    return result.lastInsertRowid;
  },

  getRefundRequest: (requestId) => {
    return db.prepare(`
      SELECT rr.*, u.full_name, u.email, u.profile_picture,
             bc.description as charge_description, bc.charge_date,
             rev.full_name as reviewer_name
      FROM refund_requests rr
      JOIN users u ON u.id = rr.user_id
      LEFT JOIN billing_charges bc ON bc.id = rr.charge_id
      LEFT JOIN users rev ON rev.id = rr.reviewed_by
      WHERE rr.id = ?
    `).get(requestId);
  },

  getUserRefundRequests: (userId) => {
    return db.prepare(`
      SELECT rr.*, bc.description as charge_description
      FROM refund_requests rr
      LEFT JOIN billing_charges bc ON bc.id = rr.charge_id
      WHERE rr.user_id = ?
      ORDER BY rr.created_at DESC
    `).all(userId);
  },

  getAllRefundRequests: async ({ limit = 50, offset = 0, status }) => {
    let sql = `
      SELECT rr.*, u.full_name, u.email,
             bc.description as charge_description,
             rev.full_name as reviewer_name
      FROM refund_requests rr
      JOIN users u ON u.id = rr.user_id
      LEFT JOIN billing_charges bc ON bc.id = rr.charge_id
      LEFT JOIN users rev ON rev.id = rr.reviewed_by
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ` AND rr.status = ?`; params.push(status); }
    sql += ` ORDER BY rr.created_at DESC LIMIT ? OFFSET ?`;
    const { sql: convertedSql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(sql, limit, offset);
    params.push(offsetVal, fetchVal);
    const rows = await db.prepare(convertedSql).all(...params);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  // User admin notes
  addUserAdminNote: ({ userId, adminId, note }) => {
    const stmt = db.prepare(`INSERT INTO user_admin_notes (user_id, admin_id, note) VALUES (?, ?, ?)`);
    const info = stmt.run(userId, adminId, note);
    return info.lastInsertRowid;
  },
  getUserAdminNotes: (userId) => {
    return db.prepare(`
      SELECT n.*, a.full_name as admin_name, a.email as admin_email
      FROM user_admin_notes n
      JOIN users a ON a.id = n.admin_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
    `).all(userId);
  },

  updateRefundRequestStatus: ({ requestId, status, reviewerId, adminNotes, refundAmount }) => {
    const stmt = db.prepare(`
      UPDATE refund_requests
      SET status = ?, reviewed_by = ?, admin_notes = ?, refund_amount = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(status, reviewerId || null, adminNotes || null, refundAmount || null, requestId);
    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      reviewerId,
      'review_refund_request',
      JSON.stringify({ requestId, status, refundAmount })
    );
    return result.changes > 0;
  },

  getRefundRequestCounts: () => {
    const all = db.prepare(`SELECT COUNT(*) as c FROM refund_requests`).get().c;
    const pending = db.prepare(`SELECT COUNT(*) as c FROM refund_requests WHERE status = 'pending'`).get().c;
    const approved = db.prepare(`SELECT COUNT(*) as c FROM refund_requests WHERE status = 'approved'`).get().c;
    return { all, pending, approved };
  },

  // User Location functions for MapBox
  saveUserLocation: ({ userId, city, latitude, longitude }) => {
    const existing = db.prepare(`SELECT id FROM user_locations WHERE user_id = ?`).get(userId);

    if (existing) {
      // Update existing location
      db.prepare(`
        UPDATE user_locations 
        SET city = ?, latitude = ?, longitude = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `).run(city, latitude, longitude, userId);
    } else {
      // Insert new location
      db.prepare(`
        INSERT INTO user_locations (user_id, city, latitude, longitude, last_updated)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(userId, city, latitude, longitude);
    }
  },

  getUserLocation: (userId) => {
    return db.prepare(`SELECT * FROM user_locations WHERE user_id = ?`).get(userId);
  },

  getAllUserLocations: () => {
    return db.prepare(`
      SELECT ul.*, u.full_name, u.profile_picture, u.bio
      FROM user_locations ul
      JOIN users u ON u.id = ul.user_id
      WHERE ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL
        AND u.account_status = 'active'
    `).all();
  },

  shouldUpdateLocation: (userId) => {
    const location = db.prepare(`SELECT last_updated FROM user_locations WHERE user_id = ?`).get(userId);
    if (!location) return true; // No location set

    // Check if location is older than 7 days
    const lastUpdate = new Date(location.last_updated);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    return lastUpdate < weekAgo;
  },

  getPublicCareerJobs: () => {
    try {
      const jobs = db.prepare("SELECT * FROM career_jobs WHERE status = 'live' AND visibility = 'public' ORDER BY created_at DESC").all();
      for (const job of jobs) {
        job.assets = db.prepare("SELECT * FROM career_job_assets WHERE job_id = ?").all(job.id);
      }
      return jobs;
    } catch (e) {
      return [];
    }
  },

  getCareerJobAssets: async (jobId) => {
    const rows = await db.prepare("SELECT * FROM career_job_assets WHERE job_id = ?").all(jobId);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  getCareerJobsForAdmin: async () => {
    try {
      const jobsRaw = await db.prepare("SELECT * FROM career_jobs ORDER BY created_at DESC").all();
      const jobs = Array.isArray(jobsRaw) ? jobsRaw : (jobsRaw?.rows || []);
      for (const job of jobs) {
        const assetsRaw = await db.prepare("SELECT * FROM career_job_assets WHERE job_id = ?").all(job.id);
        job.assets = Array.isArray(assetsRaw) ? assetsRaw : (assetsRaw?.rows || []);
      }
      return jobs;
    } catch (e) {
      return [];
    }
  },

  getCareerApplicationsPaged: async ({ limit, offset }) => {
    try {
      let query = "SELECT * FROM career_applications ORDER BY created_at DESC LIMIT ? OFFSET ?";
      const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
      const rows = await db.prepare(sql).all(offsetVal, fetchVal);
      return Array.isArray(rows) ? rows : (rows?.rows || []);
    } catch (e) {
      return [];
    }
  },

  createCareerJob: (job) => {
    const { title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority, status, goLiveAt, freezeUntil, isFrozen } = job;
    const info = db.prepare(`
      INSERT INTO career_jobs (title, location, team, employment_type, seniority, headline, description, responsibilities, requirements, perks, tags, salary_min, salary_max, salary_currency, apply_url, workplace_type, visibility, priority, status, go_live_at, freeze_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, JSON.stringify(tags), salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority, status, goLiveAt, freezeUntil);
    return info.lastInsertRowid;
  },

  updateCareerJob: (job) => {
    const { id, title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, tags, salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority, status, goLiveAt, freezeUntil } = job;
    db.prepare(`
      UPDATE career_jobs SET title=?, location=?, team=?, employment_type=?, seniority=?, headline=?, description=?, responsibilities=?, requirements=?, perks=?, tags=?, salary_min=?, salary_max=?, salary_currency=?, apply_url=?, workplace_type=?, visibility=?, priority=?, status=?, go_live_at=?, freeze_until=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(title, location, team, employmentType, seniority, headline, description, responsibilities, requirements, perks, JSON.stringify(tags), salaryMin, salaryMax, salaryCurrency, applyUrl, workplaceType, visibility, priority, status, goLiveAt, freezeUntil, id);
    return db.prepare("SELECT * FROM career_jobs WHERE id=?").get(id);
  },

  getCareerJobById: (id) => {
    const job = db.prepare("SELECT * FROM career_jobs WHERE id=?").get(id);
    if (job) {
      job.assets = db.prepare("SELECT * FROM career_job_assets WHERE job_id = ?").all(id);
    }
    return job;
  },

  setCareerJobStatus: ({ id, status, freezeUntil }) => {
    db.prepare("UPDATE career_jobs SET status=?, freeze_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, freezeUntil, id);
    return db.prepare("SELECT * FROM career_jobs WHERE id=?").get(id);
  },

  addCareerJobAsset: (asset) => {
    db.prepare(`
      INSERT INTO career_job_assets (job_id, label, file_name, file_path, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(asset.jobId, asset.label, asset.fileName, asset.filePath, asset.fileSize, asset.mimeType);
  },

  removeCareerJobAsset: ({ assetId, jobId }) => {
    const info = db.prepare("DELETE FROM career_job_assets WHERE id=? AND job_id=?").run(assetId, jobId);
    return info.changes > 0;
  },

  getCareerApplicationById: (id) => {
    return db.prepare("SELECT * FROM career_applications WHERE id=?").get(id);
  },

  updateCareerApplicationStatus: ({ id, status, reviewerId }) => {
    db.prepare("UPDATE career_applications SET status=?, reviewer_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, reviewerId, id);
  },

  // Reposts
  createRepost: ({ userId, originalPostId, quoteText = null }) => {
    // Get the original post to determine repost depth
    const originalPost = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(originalPostId);
    if (!originalPost) throw new Error('Original post not found');

    // Check if this is a repost of a repost - get the original_post_id from post_reposts
    const repostInfo = db.prepare('SELECT original_post_id, repost_depth FROM post_reposts WHERE post_id = ?').get(originalPostId);
    const actualOriginalPostId = repostInfo ? repostInfo.original_post_id : originalPostId;
    const currentDepth = repostInfo ? repostInfo.repost_depth : 1;

    // Check depth limit (max 3 levels)
    if (currentDepth >= 3) {
      throw new Error('Maximum repost depth (3 levels) reached');
    }

    // Check if user already reposted this original post
    const existingRepost = db.prepare(`
      SELECT pr.post_id FROM post_reposts pr
      WHERE pr.user_id = ? AND pr.original_post_id = ?
    `).get(userId, actualOriginalPostId);
    
    if (existingRepost) {
      throw new Error('You have already reposted this post');
    }

    // Create a new post that references the original
    const newPostId = db.prepare(`
      INSERT INTO posts (user_id, content_type, text_content, is_reel)
      VALUES (?, 'repost', ?, 0)
    `).run(userId, quoteText || null).lastInsertRowid;

    // Create the repost record
    const isQuote = quoteText ? 1 : 0;
    db.prepare(`
      INSERT INTO post_reposts (post_id, user_id, original_post_id, repost_depth, is_quote_repost, quote_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newPostId, userId, actualOriginalPostId, currentDepth + 1, isQuote, quoteText || null);

    return newPostId;
  },

  getRepostInfo: (postId) => {
    return db.prepare(`
      SELECT pr.*, 
             op.user_id as original_user_id,
             op.title as original_title,
             op.text_content as original_text_content,
             op.content_type as original_content_type,
             op.image_url as original_image_url,
             op.video_url as original_video_url,
             op.external_video_url as original_external_video_url,
             op.is_reel as original_is_reel,
             op.created_at as original_created_at,
             ou.full_name as original_author_name,
             ou.profile_picture as original_author_picture,
             ou.handle as original_author_handle
      FROM post_reposts pr
      JOIN posts op ON op.id = pr.original_post_id
      JOIN users ou ON ou.id = op.user_id
      WHERE pr.post_id = ?
    `).get(postId);
  },

  getUserReposts: async (userId) => {
    const rows = await db.prepare(`
      SELECT p.*, 
             u.full_name, u.email, u.profile_picture,
             pr.original_post_id, pr.repost_depth, pr.is_quote_repost, pr.quote_text,
             (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN post_reposts pr ON pr.post_id = p.id
      WHERE p.user_id = ? AND p.content_type = 'repost'
      ORDER BY p.created_at DESC
    `).all(userId);
    const list = Array.isArray(rows) ? rows : (rows?.rows || []);
    return Promise.all(list.map(async (row) => {
      const repostCount = db.prepare(`SELECT COUNT(*) as c FROM post_reposts WHERE original_post_id = ?`).get(row.id);
      row.repost_count = repostCount ? repostCount.c : 0;
      return {
        ...row,
        hashtags: await getPostHashtags(row.id),
        tags: await getPostTags(row.id)
      };
    }));
  },

  getRepostCount: (postId) => {
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM post_reposts 
      WHERE original_post_id = ?
    `).get(postId);
    return result.count || 0;
  },

  hasUserReposted: ({ userId, originalPostId }) => {
    const row = db.prepare(`
      SELECT 1 FROM post_reposts 
      WHERE user_id = ? AND original_post_id = ?
    `).get(userId, originalPostId);
    return !!row;
  },

  // ============ PROJECTS ============

  createProject: (data) => {
    const {
      owner_id, ownerId, title, description, cover_image, coverImage, category,
      status, visibility, tags, goals, progress_percent, target_completion_date, target_end_date
    } = data;

    const stmt = db.prepare(`
      INSERT INTO projects (
        owner_id, title, description, cover_image, category,
        status, visibility, tags, goals, progress_percent, target_end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      owner_id || ownerId, 
      title, 
      description, 
      cover_image || coverImage, 
      category,
      status || 'planning', 
      visibility || 'public',
      tags ? JSON.stringify(tags) : null,
      goals ? JSON.stringify(goals) : null,
      progress_percent || 0,
      target_end_date || target_completion_date || null
    );

    return info.lastInsertRowid;
  },

  getProjectById: (projectId) => {
    // PostgreSQL requires all non-aggregated columns from joined tables in GROUP BY
    // Since we're grouping by p.id (primary key), we can select p.*, but u.* columns need GROUP BY
    const groupBy = isProduction 
      ? `GROUP BY p.id, u.full_name, u.profile_picture`
      : `GROUP BY p.id`;
    
    const stmt = db.prepare(`
      SELECT 
        p.*,
        u.full_name as owner_name,
        u.profile_picture as owner_picture,
        COUNT(DISTINCT pu.id) as update_count,
        COUNT(DISTINCT pm.id) as milestone_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_updates pu ON pu.project_id = p.id
      LEFT JOIN project_milestones pm ON pm.project_id = p.id
      WHERE p.id = ?
      ${groupBy}
    `);

    return stmt.get(projectId);
  },

  getProjectsByOwner: (ownerId, limit = 50, offset = 0) => {
    // PostgreSQL requires all non-aggregated columns from joined tables in GROUP BY
    // Since we're grouping by p.id (primary key), we can select p.*, but u.* columns need GROUP BY
    const groupBy = isProduction 
      ? `GROUP BY p.id, u.full_name, u.profile_picture`
      : `GROUP BY p.id`;
    
    let query = `
      SELECT 
        p.*,
        u.full_name as owner_name,
        u.profile_picture as owner_picture,
        COUNT(DISTINCT pu.id) as update_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_updates pu ON pu.project_id = p.id
      WHERE p.owner_id = ?
      ${groupBy}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(ownerId, offsetVal, fetchVal);
  },

  getPublicProjects: (limit = 50, offset = 0) => {
    // PostgreSQL requires all non-aggregated columns from joined tables in GROUP BY
    // Since we're grouping by p.id (primary key), we can select p.*, but u.* columns need GROUP BY
    const groupBy = isProduction 
      ? `GROUP BY p.id, u.full_name, u.profile_picture`
      : `GROUP BY p.id`;
    
    let query = `
      SELECT 
        p.*,
        u.full_name as owner_name,
        u.profile_picture as owner_picture,
        COUNT(DISTINCT pu.id) as update_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_updates pu ON pu.project_id = p.id
      WHERE p.visibility IN ('public', 'unlisted')
      ${groupBy}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(offsetVal, fetchVal);
  },

  getProjectCount: (ownerId = null) => {
    let stmt;
    if (ownerId) {
      stmt = db.prepare('SELECT COUNT(*) as count FROM projects WHERE owner_id = ?');
      return stmt.get(ownerId).count;
    } else {
      stmt = db.prepare("SELECT COUNT(*) as count FROM projects WHERE visibility IN ('public', 'unlisted')");
      return stmt.get().count;
    }
  },

  updateProject: (projectId, data) => {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${colName} = ?`);
        
        if (typeof value === 'object') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    values.push(projectId);

    const stmt = db.prepare(
      `UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    );

    return stmt.run(...values);
  },

  deleteProject: (projectId) => {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    return stmt.run(projectId);
  },

  incrementProjectViews: (projectId) => {
    const stmt = db.prepare('UPDATE projects SET view_count = view_count + 1 WHERE id = ?');
    return stmt.run(projectId);
  },

  // ============ PROJECT MILESTONES ============

  createMilestone: (projectId, data) => {
    const { title, description, targetDate, status } = data;

    const stmt = db.prepare(`
      INSERT INTO project_milestones (
        project_id, title, description, target_date, status
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(projectId, title, description, targetDate, status || 'pending');
    return info.lastInsertRowid;
  },

  getMilestonesByProject: (projectId) => {
    const stmt = db.prepare(`
      SELECT * FROM project_milestones
      WHERE project_id = ?
      ORDER BY target_date ASC, created_at ASC
    `);

    return stmt.all(projectId);
  },

  getMilestoneById: (milestoneId) => {
    const stmt = db.prepare('SELECT * FROM project_milestones WHERE id = ?');
    return stmt.get(milestoneId);
  },

  updateMilestone: (milestoneId, data) => {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${colName} = ?`);
        values.push(value);
      }
    });

    values.push(milestoneId);

    const stmt = db.prepare(`UPDATE project_milestones SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  deleteMilestone: (milestoneId) => {
    const stmt = db.prepare('DELETE FROM project_milestones WHERE id = ?');
    return stmt.run(milestoneId);
  },

  // ============ PROJECT TASKS ============

  createTask: (projectId, data) => {
    const { milestoneId, assignedTo, title, description, status, priority, dueDate } = data;

    const stmt = db.prepare(`
      INSERT INTO project_tasks (
        project_id, milestone_id, assigned_to, title, description, status, priority, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      projectId, milestoneId || null, assignedTo || null,
      title, description, status || 'todo', priority || 'medium', dueDate
    );

    return info.lastInsertRowid;
  },

  getTasksByProject: (projectId) => {
    const stmt = db.prepare(`
      SELECT pt.*, u.full_name as assigned_name
      FROM project_tasks pt
      LEFT JOIN users u ON u.id = pt.assigned_to
      WHERE pt.project_id = ?
      ORDER BY pt.priority DESC, pt.due_date ASC
    `);

    return stmt.all(projectId);
  },

  getTaskById: (taskId) => {
    const stmt = db.prepare(`
      SELECT pt.*, u.full_name as assigned_name
      FROM project_tasks pt
      LEFT JOIN users u ON u.id = pt.assigned_to
      WHERE pt.id = ?
    `);

    return stmt.get(taskId);
  },

  updateTask: (taskId, data) => {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${colName} = ?`);
        values.push(value);
      }
    });

    values.push(taskId);

    const stmt = db.prepare(`UPDATE project_tasks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    return stmt.run(...values);
  },

  deleteTask: (taskId) => {
    const stmt = db.prepare('DELETE FROM project_tasks WHERE id = ?');
    return stmt.run(taskId);
  },

  // ============ PROJECT UPDATES ============

  createProjectUpdate: (data) => {
    const {
      projectId, userId, title, contentType, textContent,
      mediaUrl, audioUrl, imageUrl, videoUrl, externalVideoUrl,
      milestoneId, statusUpdate, metrics, attachmentUrls
    } = data;

    const stmt = db.prepare(`
      INSERT INTO project_updates (
        project_id, user_id, title, content_type, text_content,
        media_url, audio_url, image_url, video_url, external_video_url,
        milestone_id, status_update, metrics, attachment_urls
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      projectId, userId, title, contentType, textContent,
      mediaUrl, audioUrl, imageUrl, videoUrl, externalVideoUrl,
      milestoneId || null, statusUpdate, metrics ? JSON.stringify(metrics) : null,
      attachmentUrls ? JSON.stringify(attachmentUrls) : null
    );

    return info.lastInsertRowid;
  },

  getProjectUpdates: (projectId, limit = 50, offset = 0) => {
    // PostgreSQL requires all non-aggregated columns from joined tables in GROUP BY
    // Since we're grouping by pu.id (primary key), we can select pu.*, but u.* columns need GROUP BY
    const groupBy = isProduction 
      ? `GROUP BY pu.id, u.full_name, u.profile_picture`
      : `GROUP BY pu.id`;
    
    let query = `
      SELECT 
        pu.*,
        u.full_name, u.profile_picture,
        COUNT(DISTINCT pr.id) as reaction_count,
        COUNT(DISTINCT pc.id) as comment_count
      FROM project_updates pu
      JOIN users u ON u.id = pu.user_id
      LEFT JOIN project_reactions pr ON pr.update_id = pu.id
      LEFT JOIN project_comments pc ON pc.update_id = pu.id
      WHERE pu.project_id = ?
      ${groupBy}
      ORDER BY pu.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(projectId, offsetVal, fetchVal);
  },

  getProjectUpdate: (updateId) => {
    const stmt = db.prepare(`
      SELECT pu.*, u.full_name, u.profile_picture
      FROM project_updates pu
      JOIN users u ON u.id = pu.user_id
      WHERE pu.id = ?
    `);

    return stmt.get(updateId);
  },

  updateProjectUpdate: (updateId, data) => {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${colName} = ?`);
        
        if (typeof value === 'object') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    values.push(updateId);

    const stmt = db.prepare(
      `UPDATE project_updates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    );

    return stmt.run(...values);
  },

  deleteProjectUpdate: (updateId) => {
    const stmt = db.prepare('DELETE FROM project_updates WHERE id = ?');
    return stmt.run(updateId);
  },

  // ============ PROJECT REACTIONS ============

  setProjectReaction: (updateId, userId, reactionType = 'like') => {
    if (isProduction) {
      // PostgreSQL: INSERT ... ON CONFLICT for upsert
      db.prepare(`
        INSERT INTO project_reactions (update_id, user_id, reaction_type)
        VALUES (?, ?, ?)
        ON CONFLICT (update_id, user_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type
      `).run(updateId, userId, reactionType);
    } else {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO project_reactions (update_id, user_id, reaction_type)
        VALUES (?, ?, ?)
      `);
      stmt.run(updateId, userId, reactionType);
    }

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM project_reactions WHERE update_id = ? AND reaction_type = ?
    `);

    return { status: 'added', count: countStmt.get(updateId, reactionType).count };
  },

  getProjectReactionsSummary: (updateId) => {
    const stmt = db.prepare(`
      SELECT reaction_type, COUNT(*) as count
      FROM project_reactions
      WHERE update_id = ?
      GROUP BY reaction_type
    `);

    const results = stmt.all(updateId);
    const summary = {};
    results.forEach(r => {
      summary[r.reaction_type] = r.count;
    });

    return summary;
  },

  getUserProjectReaction: (updateId, userId) => {
    const stmt = db.prepare(`
      SELECT reaction_type FROM project_reactions
      WHERE update_id = ? AND user_id = ?
    `);

    const result = stmt.get(updateId, userId);
    return result ? result.reaction_type : null;
  },

  // ============ PROJECT COMMENTS ============

  addProjectComment: (projectId, userId, content, parentId = null, updateId = null) => {
    const stmt = db.prepare(`
      INSERT INTO project_comments (project_id, update_id, user_id, content, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(projectId, updateId || null, userId, content, parentId || null);
    return info.lastInsertRowid;
  },

  getProjectComments: (projectId, limit = 50, offset = 0, includeHidden = false) => {
    const hiddenFilter = includeHidden ? '' : 'AND pc.is_hidden = 0';
    let query = `
      SELECT 
        pc.*, 
        u.full_name, 
        u.profile_picture,
        u.role,
        (SELECT COUNT(*) FROM project_comment_reactions WHERE comment_id = pc.id) as reaction_count,
        (SELECT COUNT(*) FROM project_comments WHERE parent_id = pc.id) as reply_count
      FROM project_comments pc
      JOIN users u ON u.id = pc.user_id
      WHERE pc.project_id = ? ${hiddenFilter}
      ORDER BY pc.is_pinned DESC, pc.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(projectId, offsetVal, fetchVal);
  },

  getProjectCommentById: (commentId) => {
    const stmt = db.prepare(`
      SELECT 
        pc.*, 
        u.full_name, 
        u.profile_picture,
        u.role
      FROM project_comments pc
      JOIN users u ON u.id = pc.user_id
      WHERE pc.id = ?
    `);
    return stmt.get(commentId);
  },

  getProjectCommentReplies: (parentId, limit = 50, offset = 0) => {
    let query = `
      SELECT 
        pc.*, 
        u.full_name, 
        u.profile_picture,
        u.role,
        (SELECT COUNT(*) FROM project_comment_reactions WHERE comment_id = pc.id) as reaction_count
      FROM project_comments pc
      JOIN users u ON u.id = pc.user_id
      WHERE pc.parent_id = ? AND pc.is_hidden = 0
      ORDER BY pc.created_at ASC
      LIMIT ? OFFSET ?
    `;
    const { sql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(query, limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(parentId, offsetVal, fetchVal);
  },

  getProjectCommentCount: (projectId) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM project_comments WHERE project_id = ? AND is_hidden = 0');
    return stmt.get(projectId).count;
  },

  updateProjectComment: (commentId, content) => {
    const stmt = db.prepare(`
      UPDATE project_comments 
      SET content = ?, edited_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    return stmt.run(content, commentId);
  },

  deleteProjectComment: (commentId) => {
    const stmt = db.prepare('DELETE FROM project_comments WHERE id = ?');
    return stmt.run(commentId);
  },

  pinProjectComment: (commentId, isPinned = true) => {
    const stmt = db.prepare('UPDATE project_comments SET is_pinned = ? WHERE id = ?');
    return stmt.run(isPinned ? 1 : 0, commentId);
  },

  hideProjectComment: (commentId, isHidden = true) => {
    const stmt = db.prepare('UPDATE project_comments SET is_hidden = ? WHERE id = ?');
    return stmt.run(isHidden ? 1 : 0, commentId);
  },

  // Project comment file attachments
  addProjectCommentFile: (commentId, fileUrl, fileName, fileType, fileSize) => {
    const stmt = db.prepare(`
      INSERT INTO project_comment_files (comment_id, file_url, file_name, file_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(commentId, fileUrl, fileName, fileType, fileSize);
    return info.lastInsertRowid;
  },

  getProjectCommentFiles: (commentId) => {
    const stmt = db.prepare(`
      SELECT * FROM project_comment_files 
      WHERE comment_id = ? 
      ORDER BY created_at DESC
    `);
    return stmt.all(commentId);
  },

  deleteProjectCommentFile: (fileId) => {
    const stmt = db.prepare('DELETE FROM project_comment_files WHERE id = ?');
    return stmt.run(fileId);
  },

  // Project comment reactions (stars)
  setProjectCommentReaction: (commentId, userId, reactionType = 'star') => {
    if (isProduction) {
      // PostgreSQL: INSERT ... ON CONFLICT for upsert
      return db.prepare(`
        INSERT INTO project_comment_reactions (comment_id, user_id, reaction_type)
        VALUES (?, ?, ?)
        ON CONFLICT (comment_id, user_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type
      `).run(commentId, userId, reactionType);
    } else {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO project_comment_reactions (comment_id, user_id, reaction_type)
        VALUES (?, ?, ?)
      `);
      return stmt.run(commentId, userId, reactionType);
    }
  },

  removeProjectCommentReaction: (commentId, userId, reactionType = 'star') => {
    const stmt = db.prepare(`
      DELETE FROM project_comment_reactions 
      WHERE comment_id = ? AND user_id = ? AND reaction_type = ?
    `);
    return stmt.run(commentId, userId, reactionType);
  },

  getProjectCommentReactions: (commentId) => {
    const stmt = db.prepare(`
      SELECT reaction_type, COUNT(*) as count
      FROM project_comment_reactions
      WHERE comment_id = ?
      GROUP BY reaction_type
    `);
    return stmt.all(commentId);
  },

  getUserProjectCommentReaction: (commentId, userId) => {
    const stmt = db.prepare(`
      SELECT reaction_type FROM project_comment_reactions
      WHERE comment_id = ? AND user_id = ?
    `);
    return stmt.get(commentId, userId);
  },

  // ============ SALES INQUIRIES ============

  createSalesInquiry: (data) => {
    const stmt = db.prepare(`
      INSERT INTO sales_inquiries (
        company_name, industry, company_size, company_website, company_address,
        company_city, company_country, contact_name, contact_email, contact_phone,
        contact_job_title, contact_department, use_case, expected_users, timeline,
        budget_range, current_solution, integration_needs, additional_info,
        how_heard_about_us, preferred_contact_method, preferred_contact_time,
        status, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      data.companyName, data.industry, data.companySize, data.companyWebsite || null,
      data.companyAddress || null, data.companyCity || null, data.companyCountry || null,
      data.contactName, data.contactEmail, data.contactPhone || null,
      data.contactJobTitle || null, data.contactDepartment || null,
      data.useCase, data.expectedUsers || null, data.timeline || null,
      data.budgetRange || null, data.currentSolution || null, data.integrationNeeds || null,
      data.additionalInfo || null, data.howHeardAboutUs || null,
      data.preferredContactMethod || 'email', data.preferredContactTime || null,
      'new', 'normal'
    );
    return info.lastInsertRowid;
  },

  getSalesInquiry: (id) => {
    return db.prepare(`
      SELECT si.*,
             u1.full_name as assigned_to_name, u1.email as assigned_to_email,
             u2.full_name as last_contacted_by_name,
             u3.full_name as closed_by_name
      FROM sales_inquiries si
      LEFT JOIN users u1 ON u1.id = si.assigned_to
      LEFT JOIN users u2 ON u2.id = si.last_contacted_by
      LEFT JOIN users u3 ON u3.id = si.closed_by
      WHERE si.id = ?
    `).get(id);
  },

  getSalesInquiriesPaged: async ({ limit = 20, offset = 0, status, priority, assignedTo, search }) => {
    let sql = `
      SELECT si.*,
             u1.full_name as assigned_to_name, u1.email as assigned_to_email
      FROM sales_inquiries si
      LEFT JOIN users u1 ON u1.id = si.assigned_to
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND si.status = ?`;
      params.push(status);
    }
    if (priority) {
      sql += ` AND si.priority = ?`;
      params.push(priority);
    }
    if (assignedTo) {
      sql += ` AND si.assigned_to = ?`;
      params.push(assignedTo);
    }
    if (search) {
      sql += ` AND (LOWER(si.company_name) LIKE ? OR LOWER(si.contact_name) LIKE ? OR LOWER(si.contact_email) LIKE ?)`;
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    sql += ` ORDER BY 
      CASE si.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
      END,
      si.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { sql: convertedSql, limit: offsetVal, offset: fetchVal } = prepareLimitOffset(sql, limit, offset);
    params.push(offsetVal, fetchVal);

    const rows = await db.prepare(convertedSql).all(...params);
    return Array.isArray(rows) ? rows : (rows?.rows || []);
  },

  getSalesInquiriesCount: ({ status, priority, assignedTo, search }) => {
    let sql = `SELECT COUNT(*) as count FROM sales_inquiries si WHERE 1=1`;
    const params = [];

    if (status) {
      sql += ` AND si.status = ?`;
      params.push(status);
    }
    if (priority) {
      sql += ` AND si.priority = ?`;
      params.push(priority);
    }
    if (assignedTo) {
      sql += ` AND si.assigned_to = ?`;
      params.push(assignedTo);
    }
    if (search) {
      sql += ` AND (LOWER(si.company_name) LIKE ? OR LOWER(si.contact_name) LIKE ? OR LOWER(si.contact_email) LIKE ?)`;
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    return db.prepare(sql).get(...params).count;
  },

  updateSalesInquiry: (id, data) => {
    const fields = [];
    const values = [];

    const allowedFields = [
      'status', 'priority', 'assigned_to', 'assigned_at',
      'last_contacted_at', 'last_contacted_by', 'follow_up_notes',
      'next_follow_up_date', 'outcome', 'outcome_notes', 'closed_at', 'closed_by'
    ];

    for (const [key, value] of Object.entries(data)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        fields.push(`${snakeKey} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE sales_inquiries SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...values).changes > 0;
  },

  assignSalesInquiry: ({ inquiryId, assignedTo, assignedBy }) => {
    db.prepare(`
      UPDATE sales_inquiries 
      SET assigned_to = ?, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(assignedTo, inquiryId);

    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      assignedBy,
      'assign_sales_inquiry',
      JSON.stringify({ inquiryId, assignedTo })
    );
  },

  closeSalesInquiry: ({ inquiryId, outcome, outcomeNotes, closedBy }) => {
    db.prepare(`
      UPDATE sales_inquiries 
      SET status = 'closed', outcome = ?, outcome_notes = ?, 
          closed_at = CURRENT_TIMESTAMP, closed_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(outcome, outcomeNotes || null, closedBy, inquiryId);

    db.prepare(`INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)`).run(
      closedBy,
      'close_sales_inquiry',
      JSON.stringify({ inquiryId, outcome })
    );
  },

  // Sales inquiry communications
  addSalesInquiryCommunication: ({ inquiryId, senderId, communicationType, subject, content, recipientEmail }) => {
    const stmt = db.prepare(`
      INSERT INTO sales_inquiry_communications (inquiry_id, sender_id, communication_type, subject, content, recipient_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(inquiryId, senderId, communicationType, subject || null, content, recipientEmail || null);

    // Update last contacted info on the inquiry
    db.prepare(`
      UPDATE sales_inquiries 
      SET last_contacted_at = CURRENT_TIMESTAMP, last_contacted_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(senderId, inquiryId);

    return info.lastInsertRowid;
  },

  getSalesInquiryCommunications: (inquiryId) => {
    return db.prepare(`
      SELECT sic.*, u.full_name as sender_name, u.email as sender_email
      FROM sales_inquiry_communications sic
      JOIN users u ON u.id = sic.sender_id
      WHERE sic.inquiry_id = ?
      ORDER BY sic.created_at DESC
    `).all(inquiryId);
  },

  getSalesInquiryStats: async () => {
    const stats = {};
    const totalResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries`).get();
    stats.total = totalResult?.c || totalResult?.count || 0;
    const newResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE status = 'new'`).get();
    stats.new = newResult?.c || newResult?.count || 0;
    const contactedResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE status = 'contacted'`).get();
    stats.contacted = contactedResult?.c || contactedResult?.count || 0;
    const inProgressResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE status = 'in_progress'`).get();
    stats.inProgress = inProgressResult?.c || inProgressResult?.count || 0;
    const qualifiedResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE status = 'qualified'`).get();
    stats.qualified = qualifiedResult?.c || qualifiedResult?.count || 0;
    const closedResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE status = 'closed'`).get();
    stats.closed = closedResult?.c || closedResult?.count || 0;
    const urgentResult = await db.prepare(`SELECT COUNT(*) as c FROM sales_inquiries WHERE priority = 'urgent' AND status != 'closed'`).get();
    stats.urgent = urgentResult?.c || urgentResult?.count || 0;
    return stats;
  },

  // ============ BUSINESS ADMIN ASSIGNMENTS ============

  createBusinessAdminAssignment: ({ parentAdminId, assignedAdminId, permissions, scopes, notes }) => {
    const stmt = db.prepare(`
      INSERT INTO business_admin_assignments (parent_admin_id, assigned_admin_id, permissions, scopes, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      parentAdminId, assignedAdminId,
      JSON.stringify(permissions || []),
      JSON.stringify(scopes || []),
      notes || null
    );
    return info.lastInsertRowid;
  },

  getBusinessAdminAssignments: (parentAdminId) => {
    return db.prepare(`
      SELECT baa.*, u.full_name, u.email, u.profile_picture
      FROM business_admin_assignments baa
      JOIN users u ON u.id = baa.assigned_admin_id
      WHERE baa.parent_admin_id = ? AND baa.status = 'active'
      ORDER BY baa.created_at DESC
    `).all(parentAdminId);
  },

  getBusinessAdminParent: (assignedAdminId) => {
    return db.prepare(`
      SELECT baa.*, u.full_name as parent_name, u.email as parent_email
      FROM business_admin_assignments baa
      JOIN users u ON u.id = baa.parent_admin_id
      WHERE baa.assigned_admin_id = ? AND baa.status = 'active'
    `).get(assignedAdminId);
  },

  updateBusinessAdminAssignment: ({ assignmentId, permissions, scopes, status }) => {
    const fields = ['updated_at = CURRENT_TIMESTAMP'];
    const values = [];

    if (permissions !== undefined) {
      fields.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }
    if (scopes !== undefined) {
      fields.push('scopes = ?');
      values.push(JSON.stringify(scopes));
    }
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }

    values.push(assignmentId);
    const sql = `UPDATE business_admin_assignments SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...values).changes > 0;
  },

  revokeBusinessAdminAssignment: (assignmentId) => {
    return db.prepare(`
      UPDATE business_admin_assignments 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(assignmentId).changes > 0;
  },

  isBusinessAdminOf: (parentAdminId, targetAdminId) => {
    const row = db.prepare(`
      SELECT 1 FROM business_admin_assignments 
      WHERE parent_admin_id = ? AND assigned_admin_id = ? AND status = 'active'
    `).get(parentAdminId, targetAdminId);
    return !!row;
  },

  getAllBusinessAdmins: () => {
    return db.prepare(`
      SELECT u.id, u.full_name, u.email, u.profile_picture, u.role, u.created_at,
             (SELECT COUNT(*) FROM business_admin_assignments baa WHERE baa.parent_admin_id = u.id AND baa.status = 'active') as subordinate_count
      FROM users u
      WHERE u.role = 'business_admin'
      ORDER BY u.created_at DESC
    `).all();
  },

  // Pricing tier management functions
  getPricingTiers: (includeInactive = false) => {
    const sql = includeInactive
      ? `SELECT * FROM pricing_tiers ORDER BY display_order ASC`
      : `SELECT * FROM pricing_tiers WHERE is_active = 1 ORDER BY display_order ASC`;
    const rows = db.prepare(sql).all();
    return rows.map(row => {
      let features = [];
      try {
        features = JSON.parse(row.features || '[]');
      } catch (e) {
        console.warn('Failed to parse tier features for', row.tier_id, e.message);
        features = [];
      }
      return {
        ...row,
        features,
        is_highlighted: !!row.is_highlighted,
        is_active: !!row.is_active
      };
    });
  },

  getPricingTier: (tierId) => {
    const row = db.prepare(`SELECT * FROM pricing_tiers WHERE tier_id = ?`).get(tierId);
    if (!row) return null;
    let features = [];
    try {
      features = JSON.parse(row.features || '[]');
    } catch (e) {
      console.warn('Failed to parse tier features for', tierId, e.message);
      features = [];
    }
    return {
      ...row,
      features,
      is_highlighted: !!row.is_highlighted,
      is_active: !!row.is_active
    };
  },

  updatePricingTier: ({ tierId, name, price, priceDisplay, tagline, features, isHighlighted, displayOrder, isActive, note }) => {
    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (price !== undefined) {
      fields.push('price = ?');
      values.push(price);
    }
    if (priceDisplay !== undefined) {
      fields.push('price_display = ?');
      values.push(priceDisplay);
    }
    if (tagline !== undefined) {
      fields.push('tagline = ?');
      values.push(tagline);
    }
    if (features !== undefined) {
      fields.push('features = ?');
      values.push(JSON.stringify(features));
    }
    if (isHighlighted !== undefined) {
      fields.push('is_highlighted = ?');
      values.push(isHighlighted ? 1 : 0);
    }
    if (displayOrder !== undefined) {
      fields.push('display_order = ?');
      values.push(displayOrder);
    }
    if (isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (note !== undefined) {
      fields.push('note = ?');
      values.push(note);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(tierId);

    const sql = `UPDATE pricing_tiers SET ${fields.join(', ')} WHERE tier_id = ?`;
    return db.prepare(sql).run(...values).changes > 0;
  },

  createPricingTier: ({ tierId, name, price, priceDisplay, tagline, features, isHighlighted, displayOrder, isActive, note }) => {
    const result = db.prepare(`
      INSERT INTO pricing_tiers (tier_id, name, price, price_display, tagline, features, is_highlighted, display_order, is_active, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tierId,
      name,
      price,
      priceDisplay,
      tagline,
      JSON.stringify(features || []),
      isHighlighted ? 1 : 0,
      displayOrder || 0,
      isActive !== false ? 1 : 0,
      note || null
    );
    return result.lastInsertRowid;
  },

  deletePricingTier: (tierId) => {
    return db.prepare(`DELETE FROM pricing_tiers WHERE tier_id = ?`).run(tierId).changes > 0;
  },

  // Phone verification functions
  createPhoneVerificationCode: ({ userId, phoneNumber, code, expiresAt }) => {
    const result = db.prepare(`
      INSERT INTO phone_verification_codes (user_id, phone_number, code, expires_at, verified, attempt_count, created_at)
      VALUES (?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
    `).run(userId, phoneNumber, code, expiresAt);
    return result.lastInsertRowid;
  },

  getPhoneVerificationCode: ({ userId, code }) => {
    return db.prepare(`
      SELECT * FROM phone_verification_codes 
      WHERE user_id = ? AND code = ? AND verified = 0
    `).get(userId, code);
  },

  getLatestPhoneVerificationCode: (userId) => {
    return db.prepare(`
      SELECT * FROM phone_verification_codes 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(userId);
  },

  markPhoneCodeAsVerified: (codeId) => {
    return db.prepare(`
      UPDATE phone_verification_codes 
      SET verified = 1 
      WHERE id = ?
    `).run(codeId).changes > 0;
  },

  markPhoneAsVerified: ({ userId, phoneNumber }) => {
    return db.prepare(`
      UPDATE users 
      SET phone_verified = 1, phone_verified_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(userId).changes > 0;
  },

  updateUserPhoneNumber: ({ userId, phoneNumber }) => {
    return db.prepare(`
      UPDATE users 
      SET phone_number = ?, phone_verified = 0, phone_verified_at = NULL 
      WHERE id = ?
    `).run(phoneNumber, userId).changes > 0;
  },

  incrementPhoneVerificationAttempt: (codeId) => {
    return db.prepare(`
      UPDATE phone_verification_codes 
      SET attempt_count = attempt_count + 1 
      WHERE id = ?
    `).run(codeId).changes > 0;
  },

  deleteExpiredPhoneVerificationCodes: () => {
    return db.prepare(`
      DELETE FROM phone_verification_codes 
      WHERE expires_at < CURRENT_TIMESTAMP
    `).run().changes;
  },

  // Device fingerprint functions
  createDeviceFingerprint: ({ userId, fingerprintHash, userAgent, ipAddress, country, deviceType, browser, os }) => {
    try {
      const result = db.prepare(`
        INSERT INTO device_fingerprints (user_id, fingerprint_hash, user_agent, ip_address, country, device_type, browser, os, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(userId, fingerprintHash, userAgent, ipAddress, country, deviceType, browser, os);
      return result.lastInsertRowid;
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        // Fingerprint already exists, just update last_used_at
        return db.prepare(`
          UPDATE device_fingerprints 
          SET last_used_at = CURRENT_TIMESTAMP, user_id = ? 
          WHERE fingerprint_hash = ?
        `).run(userId, fingerprintHash).changes;
      }
      throw error;
    }
  },

  getDeviceFingerprintsForUser: (userId) => {
    return db.prepare(`
      SELECT * FROM device_fingerprints 
      WHERE user_id = ? 
      ORDER BY last_used_at DESC
    `).all(userId);
  },

  findUsersWithFingerprint: (fingerprintHash) => {
    return db.prepare(`
      SELECT DISTINCT user_id FROM device_fingerprints 
      WHERE fingerprint_hash = ?
    `).all(fingerprintHash);
  },

  findUsersWithIPAddress: (ipAddress) => {
    return db.prepare(`
      SELECT DISTINCT user_id FROM device_fingerprints 
      WHERE ip_address = ?
    `).all(ipAddress);
  },

  // Alt account detection functions
  createAltAccountDetection: ({ userId, detectionType, confidenceScore, matchedUserIds, details, action }) => {
    const result = db.prepare(`
      INSERT INTO alt_account_detections (user_id, detection_type, confidence_score, matched_user_ids, details, action, resolved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      userId,
      detectionType,
      confidenceScore,
      JSON.stringify(matchedUserIds || []),
      JSON.stringify(details || {}),
      action || 'flagged'
    );
    return result.lastInsertRowid;
  },

  getAltAccountDetections: ({ userId, includeResolved = false }) => {
    const sql = `
      SELECT * FROM alt_account_detections 
      WHERE user_id = ? ${includeResolved ? '' : 'AND resolved = 0'}
      ORDER BY created_at DESC
    `;
    return db.prepare(sql).all(userId);
  },

  getPendingAltAccountDetections: (limit = 100) => {
    return db.prepare(`
      SELECT * FROM alt_account_detections 
      WHERE resolved = 0 
      ORDER BY confidence_score DESC, created_at DESC 
      LIMIT ?
    `).all(limit);
  },

  updateAltAccountDetectionStatus: ({ detectionId, action, resolved, resolutionNotes }) => {
    const fields = ['updated_at = CURRENT_TIMESTAMP'];
    const values = [];

    if (action !== undefined) {
      fields.push('action = ?');
      values.push(action);
    }
    if (resolved !== undefined) {
      fields.push('resolved = ?');
      values.push(resolved ? 1 : 0);
    }
    if (resolved && resolutionNotes !== undefined) {
      fields.push('resolved_at = CURRENT_TIMESTAMP');
    }
    if (resolutionNotes !== undefined) {
      fields.push('resolution_notes = ?');
      values.push(resolutionNotes);
    }

    values.push(detectionId);

    const sql = `UPDATE alt_account_detections SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...values).changes > 0;
  },

  findPhoneNumberMatches: async (phoneNumber) => {
    const sql = isProduction
      ? `
      SELECT u.id, u.email, u.full_name, u.account_status, u.created_at 
      FROM users u 
      WHERE u.phone_number = ? AND u.phone_verified = true
      ORDER BY u.created_at DESC
    `
      : `
      SELECT u.id, u.email, u.full_name, u.account_status, u.created_at 
      FROM users u 
      WHERE u.phone_number = ? AND u.phone_verified = 1
      ORDER BY u.created_at DESC
    `;

    return await db.prepare(sql).all(phoneNumber);
  },

  findRecentPhoneMatchesByIP: async (ipAddress, hoursBack = 24) => {
    // SQL Server legacy used DATEADD(HOUR, -?, CURRENT_TIMESTAMP)
    // PostgreSQL equivalent: CURRENT_TIMESTAMP - (? * INTERVAL '1 hour')
    const sql = isProduction
      ? `
      SELECT DISTINCT df.user_id 
      FROM device_fingerprints df 
      WHERE df.ip_address = ? 
      AND df.created_at > (CURRENT_TIMESTAMP - (? * INTERVAL '1 hour'))
    `
      : `
      SELECT DISTINCT df.user_id 
      FROM device_fingerprints df 
      WHERE df.ip_address = ? 
      AND df.created_at > datetime('now', '-' || ? || ' hours')
    `;

    return await db.prepare(sql).all(ipAddress, hoursBack);
  },

  // Dynamic page rendering from database
  getEasterEggPage: async (routePath) => {
    const sql = isProduction
      ? `SELECT page_code, description FROM easter_egg_pages WHERE route_path = ? AND is_active = true LIMIT 1`
      : `SELECT page_code, description FROM easter_egg_pages WHERE route_path = ? AND is_active = 1 LIMIT 1`;
    const result = await db.prepare(sql).get(routePath);
    return result ? result.page_code : null;
  },

  setEasterEggPage: async ({ routePath, pageCode, description }) => {
    const sql = isProduction
      ? `
        INSERT INTO easter_egg_pages (route_path, page_code, description, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (route_path) 
        DO UPDATE SET page_code = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      `
      : `
        INSERT INTO easter_egg_pages (route_path, page_code, description, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT (route_path) 
        DO UPDATE SET page_code = ?, description = ?, updated_at = datetime('now')
      `;
    await db.prepare(sql).run(routePath, pageCode, description, pageCode, description);
  }
};


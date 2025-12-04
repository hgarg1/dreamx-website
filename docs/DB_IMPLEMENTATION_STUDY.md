# DreamX Database Implementation Study

## Overview

This document analyzes the DreamX database architecture, patterns, and implementation strategies after consolidating the project system into the centralized `db.js` module.

---

## Architecture

### Dual Database Support Pattern

DreamX uses a **db-adapter** pattern to support both SQLite (development) and SQL Server (production):

```javascript
// db.js initialization
const { initSync, isProduction, getDatabaseSync, initDatabase } = require('./db-adapter');

if (!isProduction) {
  // SQLite - synchronous initialization
  dbWrapper = initSync();
  db = dbWrapper.getRaw();
} else {
  // SQL Server - async initialization with proxy
  db = new Proxy({}, { /* proxy handler */ });
}
```

**Benefits:**
- Local development with SQLite (fast, no setup required)
- Production with SQL Server (scalable, enterprise-grade)
- Single codebase for both environments
- Database.prepare() and db.exec() work identically

### Async Database Initialization (Production)

For SQL Server in production, an async initialization function is provided:

```javascript
async function initializeDatabase() {
  if (isProduction && !dbWrapper) {
    await initDatabase();
    dbWrapper = await getDatabaseSync();
    db = dbWrapper.getRaw();
  }
  return db;
}
```

**Note:** Call this at application startup in `app.js` before any database operations.

---

## Schema Design Patterns

### 1. Table Organization

DreamX organizes tables by feature domain:

```sql
-- Core Account Management
users
email_verification_codes
password_reset_tokens
sessions

-- Social Features
posts
post_attachments
post_comments
post_reactions
post_reposts
followers

-- Commerce Features
user_services
service_reviews
service_requests

-- Career Management
jobs
job_applicants
job_reviews

-- Project Management (Consolidated)
projects
project_milestones
project_tasks
project_updates
project_reactions
project_comments

-- Messaging & Notifications
messages
message_attachments
notifications

-- Admin & Moderation
user_moderation_history
content_appeals
account_appeals
banned_accounts

-- Transactions & Payments
transactions
refunds
```

### 2. Foreign Key Strategy

DreamX uses explicit FOREIGN KEY constraints for referential integrity:

```sql
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ...
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Pattern:** 
- All child tables reference parent tables via foreign keys
- Cascading deletes generally NOT used (soft deletes preferred)
- Indexes created on frequently queried foreign keys

### 3. Timestamp Pattern

Every table includes audit timestamps:

```sql
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
deleted_at DATETIME (for soft deletes)
```

**Usage:**
- Track creation time for sorting/filtering
- Track modifications for audit trails
- Use `deleted_at` for soft deletes (don't remove data)

---

## JavaScript Function Patterns

### Pattern 1: CRUD Operations

Standard Create, Read, Update, Delete structure:

```javascript
// Create
createProject: (data) => {
  const stmt = db.prepare(`
    INSERT INTO projects (title, description, ...) 
    VALUES (?, ?, ...)
  `);
  const info = stmt.run(data.title, data.description, ...);
  return info.lastID; // Return auto-generated ID
},

// Read
getProjectById: (projectId) => {
  const stmt = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `);
  return stmt.get(projectId); // Single row
},

// Read Multiple
getPublicProjects: (limit, offset) => {
  const stmt = db.prepare(`
    SELECT * FROM projects 
    WHERE visibility = 'public'
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset); // Array of rows
},

// Update
updateProject: (projectId, data) => {
  const stmt = db.prepare(`
    UPDATE projects SET title = ?, description = ? 
    WHERE id = ?
  `);
  return stmt.run(data.title, data.description, projectId);
},

// Delete (Hard delete - use sparingly)
deleteProject: (projectId) => {
  const stmt = db.prepare(`DELETE FROM projects WHERE id = ?`);
  return stmt.run(projectId);
}
```

**Key Principles:**
- Use prepared statements with `?` placeholders (SQL injection prevention)
- Functions return either `lastID` (create), single row (get), array (getAll)
- All operations are synchronous (wrapped in try-catch in route handlers)

### Pattern 2: Data Normalization with JSON

DreamX stores complex data as JSON strings in single columns:

```javascript
// Create with JSON serialization
createProject: (data) => {
  const stmt = db.prepare(`
    INSERT INTO projects (tags, goals, metrics)
    VALUES (?, ?, ?)
  `);
  
  stmt.run(
    tags ? JSON.stringify(tags) : null,
    goals ? JSON.stringify(goals) : null,
    metrics ? JSON.stringify(metrics) : null
  );
},

// Read - JSON automatically parsed by ORM
getProjectById: (projectId) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  // Note: Most ORMs auto-parse JSON columns
  // If using raw SQLite, manual JSON.parse() needed
},

// Update with JSON conversion
updateProject: (projectId, data) => {
  const fields = [];
  const values = [];
  
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object') {
      fields.push(`${key} = ?`);
      values.push(JSON.stringify(value)); // Convert to JSON
    } else {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });
  
  values.push(projectId);
  const stmt = db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(...values);
}
```

**Why JSON?**
- Flexible schema (add fields without migrations)
- Avoids heavy normalization for non-critical data
- Simpler queries for read-heavy workloads
- Common pattern in modern database design

### Pattern 3: Aggregation with JOINs

Complex queries combining data from multiple tables:

```javascript
getProjectById: (projectId) => {
  return db.prepare(`
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
    GROUP BY p.id
  `).get(projectId);
},

getProjectReactionsSummary: (updateId) => {
  const results = db.prepare(`
    SELECT reaction_type, COUNT(*) as count
    FROM project_reactions
    WHERE update_id = ?
    GROUP BY reaction_type
  `).all(updateId);
  
  // Convert results to summary object
  const summary = {};
  results.forEach(r => {
    summary[r.reaction_type] = r.count;
  });
  return summary;
}
```

**Patterns Used:**
- **INNER JOIN**: Must have matching record in both tables
- **LEFT JOIN**: Keep all left table rows even if no match
- **COUNT(DISTINCT ...)**: Count unique values to avoid duplicates
- **GROUP BY**: Aggregate results by column
- **Single Row vs Multiple:** Use `.get()` for single, `.all()` for multiple

### Pattern 4: Dynamic Query Building

Build SQL dynamically for flexible updates:

```javascript
updateProject: (projectId, data) => {
  const fields = [];
  const values = [];

  // Only include fields that are provided and not 'id'
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id') {
      // Convert camelCase to snake_case for database
      const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${colName} = ?`);
      
      // Handle complex types
      if (typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }
  });

  // Add timestamp for audit trail
  values.push(projectId);

  const stmt = db.prepare(
    `UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  
  return stmt.run(...values);
}
```

**Benefits:**
- Handles partial updates (only specified fields changed)
- Automatic camelCase ↔ snake_case conversion
- Type-aware serialization (objects to JSON)
- Timestamp auto-updates for modifications

### Pattern 5: Engagement/Reaction Operations

Special pattern for user-generated reactions:

```javascript
setProjectReaction: (updateId, userId, reactionType = 'like') => {
  // INSERT OR REPLACE: Create if new, replace if exists
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO project_reactions (update_id, user_id, reaction_type)
    VALUES (?, ?, ?)
  `);

  stmt.run(updateId, userId, reactionType);

  // Return updated count
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM project_reactions 
    WHERE update_id = ? AND reaction_type = ?
  `);

  return { status: 'added', count: countStmt.get(updateId, reactionType).count };
},

getUserProjectReaction: (updateId, userId) => {
  const result = db.prepare(`
    SELECT reaction_type FROM project_reactions
    WHERE update_id = ? AND user_id = ?
  `).get(updateId, userId);

  return result ? result.reaction_type : null;
}
```

**Key Features:**
- **INSERT OR REPLACE**: Upsert pattern (idempotent)
- Returns count after operation
- Null-safe return for non-existent reactions
- Prevents duplicate entries

### Pattern 6: Hierarchical Data (Comments/Replies)

Support for nested structures (replies to comments):

```javascript
addProjectComment: (updateId, userId, content, parentId = null) => {
  const stmt = db.prepare(`
    INSERT INTO project_comments (update_id, user_id, content, parent_id)
    VALUES (?, ?, ?, ?)
  `);

  const info = stmt.run(updateId, userId, content, parentId || null);
  return info.lastID;
},

getProjectComments: (updateId, limit = 50, offset = 0) => {
  return db.prepare(`
    SELECT pc.*, u.full_name, u.profile_picture
    FROM project_comments pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.update_id = ? /* Top-level comments only */
    ORDER BY pc.created_at DESC
    LIMIT ? OFFSET ?
  `).all(updateId, limit, offset);
  
  // Note: To get replies, filter by parent_id
  // Recursive queries would require additional logic
}
```

**Pattern:**
- `parent_id` column stores ID of parent comment
- Top-level: `parent_id = null`
- Replies: `parent_id = <comment_id>`
- Simple but requires client-side tree building

---

## Security Patterns

### 1. SQL Injection Prevention

**Always use prepared statements with `?` placeholders:**

```javascript
// ✅ SAFE - Uses prepared statement
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// ❌ UNSAFE - String concatenation (never do this)
const result = db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();
```

### 2. Password Hashing

Passwords should be hashed before storage:

```javascript
const bcrypt = require('bcrypt');

// When storing
const passwordHash = bcrypt.hashSync(password, 10); // 10 salt rounds
db.prepare(`INSERT INTO users (password_hash) VALUES (?)`).run(passwordHash);

// When verifying
const isValid = bcrypt.compareSync(inputPassword, storedHash);
```

### 3. Role-Based Access Control

Check user roles before operations:

```javascript
updateProject: (projectId, data, userId) => {
  // Verify user owns the project
  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  
  if (!project || project.owner_id !== userId) {
    throw new Error('Unauthorized: Cannot update this project');
  }
  
  // Safe to proceed with update
  const stmt = db.prepare('UPDATE projects SET title = ? WHERE id = ?');
  return stmt.run(data.title, projectId);
}
```

---

## Performance Considerations

### 1. Indexing Strategy

DreamX uses indexes on frequently queried columns:

```sql
-- Primary key index (automatic)
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ...
);

-- Foreign key indexes
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_project_updates_project_id ON project_updates(project_id);

-- Search/sort indexes
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_visibility ON projects(visibility);

-- Unique constraints (enforce uniqueness)
CREATE UNIQUE INDEX idx_users_email ON users(email);
```

**When to Index:**
- Foreign keys (JOINs are slow without)
- Columns in WHERE clauses
- Columns in ORDER BY
- Columns in GROUP BY

### 2. Query Optimization Techniques

```javascript
// ❌ SLOW - N+1 query problem
const projects = getPublicProjects(limit, offset);
const enriched = projects.map(p => {
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(p.owner_id);
  return { ...p, owner };
});

// ✅ FAST - Single query with JOIN
getPublicProjects: (limit, offset) => {
  return db.prepare(`
    SELECT p.*, u.full_name, u.profile_picture
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    WHERE p.visibility = 'public'
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}
```

### 3. Pagination Pattern

Always use LIMIT and OFFSET for large result sets:

```javascript
getProjectsByOwner: (ownerId, limit = 50, offset = 0) => {
  return db.prepare(`
    SELECT * FROM projects
    WHERE owner_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(ownerId, limit, offset);
}

// In routes
const page = req.query.page || 1;
const limit = 20;
const offset = (page - 1) * limit;
const projects = getProjectsByOwner(userId, limit, offset);
```

---

## Module Organization

### Before Consolidation

```
db.js (3391 lines)          ← Core database functions
├── Users
├── Posts & Comments
├── Followers
├── Reposts
├── Career & Jobs
└── module.exports

db/projects.js (475 lines)   ← Separate module
├── Projects
├── Milestones
├── Tasks
├── Updates
├── Reactions
├── Comments
└── module.exports
```

### After Consolidation

```
db.js (3813 lines)           ← Single unified module
├── Users
├── Posts & Comments
├── Followers
├── Reposts
├── Career & Jobs
├── Projects (NEW)
│   ├── Projects
│   ├── Milestones
│   ├── Tasks
│   ├── Updates
│   ├── Reactions
│   └── Comments
└── module.exports (35+ new functions)
```

**Advantages:**
- Single import point: `const { getProjectById, ... } = require('../db')`
- No circular dependencies
- Easier to maintain and refactor
- Consistent patterns across all features

---

## Common Patterns Reference

### Select Patterns

```javascript
// Single row
const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// Multiple rows
const rows = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(userId);

// Count
const count = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId).count;

// With aggregation
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(view_count) as avg_views
  FROM posts
`).get();
```

### Insert Patterns

```javascript
// Simple insert
const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
const info = stmt.run(email, hash);
console.log(info.lastID); // Get auto-generated ID

// Bulk insert
const insert = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)');
const bulk = db.transaction(() => {
  posts.forEach(p => insert.run(p.user_id, p.content));
});
bulk();
```

### Update Patterns

```javascript
// Simple update
db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(newBio, userId);

// Update with timestamp
db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  .run(newStatus, projectId);

// Increment counters
db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?')
  .run(postId);
```

### Delete Patterns

```javascript
// Hard delete (be careful!)
db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

// Soft delete (recommended)
db.prepare('UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?')
  .run(postId);

// Soft delete with filter (exclude deleted)
db.prepare('SELECT * FROM posts WHERE deleted_at IS NULL').all();
```

---

## Lessons Learned from Consolidation

1. **Centralized Module > Separate Files**
   - Easier imports (single `require`)
   - Better visibility of all functions
   - Reduced circular dependencies
   - Consistent naming conventions

2. **Consistent Patterns Scale**
   - All CRUD operations follow same structure
   - Easy to understand for new developers
   - Reduce bugs through familiarity
   - Easier refactoring and testing

3. **JSON for Flexibility**
   - Perfect for optional/variable fields
   - Reduces schema migration burden
   - Plays well with JavaScript
   - Sufficient for read-heavy workloads

4. **Performance Through Aggregation**
   - JOIN instead of N+1 queries
   - Indexes on foreign keys and filters
   - Pagination for large result sets
   - COUNT(DISTINCT) prevents duplicates

5. **Security by Default**
   - Prepared statements throughout
   - Consistent error handling
   - Role checks at business logic level
   - Soft deletes preserve audit trails

---

## Production Checklist

Before deploying to production with SQL Server:

- [ ] Run schema.sql to create all tables
- [ ] Create indexes for performance
- [ ] Set up database backups
- [ ] Configure SQL Server connection pooling
- [ ] Call `await initializeDatabase()` at app startup
- [ ] Test all database operations
- [ ] Monitor query performance
- [ ] Set up query logging for debugging
- [ ] Create database user with appropriate permissions
- [ ] Test failover and recovery procedures

---

## Consolidation Verification

**Files Modified:**
- ✅ `db.js` - Added 35+ project functions (lines 3394-3813)
- ✅ `routes/projects.js` - Updated imports from db module
- ✅ `routes/profile.js` - Updated imports from db module

**Files Deleted:**
- ✅ `db/projects.js` - Consolidated into db.js

**No Breaking Changes:**
- ✅ All function signatures preserved
- ✅ All return types identical
- ✅ All route endpoints work
- ✅ System functionality unchanged


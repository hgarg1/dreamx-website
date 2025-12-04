# DreamX Post Widget - Reusable Architecture

## Executive Summary

A reusable post widget for projects should encapsulate the complete post lifecycle: creation, database interaction, rendering, and real-time updates. This document outlines how to extract the post system from DreamX and adapt it for the "projects" context.

---

## 1. Data Model & Schema

### Current Posts Table
```sql
CREATE TABLE posts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  title NVARCHAR(255),
  content_type NVARCHAR(50) DEFAULT 'text',      -- 'text', 'image', 'video', 'repost'
  text_content NVARCHAR(MAX),
  media_url NVARCHAR(500),
  audio_url NVARCHAR(500),
  image_url NVARCHAR(500),
  video_url NVARCHAR(500),
  external_video_url NVARCHAR(500),
  is_reel BIT DEFAULT 0,
  activity_label NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Project-Specific Extension
For a **projects** context, consider this expanded model:

```sql
CREATE TABLE project_updates (
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL,                        -- Link to projects table
  user_id INT NOT NULL,                           -- Team member who posted
  title NVARCHAR(255),
  content_type NVARCHAR(50) DEFAULT 'text',       -- 'text', 'image', 'video', 'milestone', 'code-review'
  text_content NVARCHAR(MAX),
  media_url NVARCHAR(500),
  audio_url NVARCHAR(500),
  image_url NVARCHAR(500),
  video_url NVARCHAR(500),
  external_video_url NVARCHAR(500),
  is_reel BIT DEFAULT 0,
  
  -- Project-specific fields
  status NVARCHAR(50),                            -- 'planning', 'in-progress', 'completed', 'blocked'
  priority NVARCHAR(50),                          -- 'low', 'medium', 'high', 'critical'
  assigned_to INT,                                -- User ID (optional assignment)
  milestone_id INT,                               -- Link to project milestones
  linked_tasks NVARCHAR(MAX),                     -- JSON array of task IDs
  metrics NVARCHAR(MAX),                          -- JSON: {progress: 0-100, status_change: before->after}
  attachment_urls NVARCHAR(MAX),                  -- JSON array of file attachments
  
  -- Engagement & Metadata
  is_pinned BIT DEFAULT 0,
  is_announcement BIT DEFAULT 0,
  visibility NVARCHAR(50) DEFAULT 'team',         -- 'team', 'public', 'private'
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);

CREATE INDEX idx_project_updates_project ON project_updates(project_id);
CREATE INDEX idx_project_updates_user ON project_updates(user_id);
CREATE INDEX idx_project_updates_created_at ON project_updates(created_at);
```

### Related Tables (Reuse from Posts)
- **Reactions** (likes, comments, emoji reactions)
- **Comments** (threaded discussions)
- **Tags/Hashtags** (organization & discovery)
- **Attachments** (files, images, videos)

---

## 2. Core Components

### A. Data Access Layer (DAL)

**Purpose**: Abstract database operations for project updates.

```javascript
// projectUpdates.js - Database Functions

const db = require('./db');

// CREATE
function createProjectUpdate(data) {
  const {
    projectId, userId, title, contentType, textContent,
    mediaUrl, audioUrl, imageUrl, videoUrl, externalVideoUrl,
    isReel, status, priority, milestoneId, linkedTasks, metrics
  } = data;

  const stmt = db.prepare(`
    INSERT INTO project_updates (
      project_id, user_id, title, content_type, text_content,
      media_url, audio_url, image_url, video_url, external_video_url,
      is_reel, status, priority, milestone_id, linked_tasks, metrics
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    projectId, userId, title, contentType, textContent,
    mediaUrl, audioUrl, imageUrl, videoUrl, externalVideoUrl,
    isReel ? 1 : 0, status, priority, milestoneId,
    linkedTasks ? JSON.stringify(linkedTasks) : null,
    metrics ? JSON.stringify(metrics) : null
  );

  return info.lastID;
}

// READ (Paginated)
function getProjectUpdates(projectId, limit = 50, offset = 0) {
  const stmt = db.prepare(`
    SELECT
      u.*,
      u.created_at as created_at,
      usr.full_name, usr.profile_picture,
      COUNT(DISTINCT r.id) as reaction_count,
      COUNT(DISTINCT c.id) as comment_count
    FROM project_updates u
    JOIN users usr ON usr.id = u.user_id
    LEFT JOIN project_reactions r ON r.update_id = u.id
    LEFT JOIN project_comments c ON c.update_id = u.id
    WHERE u.project_id = ?
    GROUP BY u.id
    ORDER BY u.is_pinned DESC, u.created_at DESC
    LIMIT ? OFFSET ?
  `);

  return stmt.all(projectId, limit, offset);
}

// READ (Single)
function getProjectUpdate(updateId) {
  const stmt = db.prepare(`
    SELECT u.*, usr.full_name, usr.profile_picture
    FROM project_updates u
    JOIN users usr ON usr.id = u.user_id
    WHERE u.id = ?
  `);

  return stmt.get(updateId);
}

// UPDATE
function updateProjectUpdate(updateId, data) {
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
    `UPDATE project_updates SET ${fields.join(', ')}, updated_at = GETDATE() WHERE id = ?`
  );

  return stmt.run(...values);
}

// DELETE
function deleteProjectUpdate(updateId) {
  const stmt = db.prepare('DELETE FROM project_updates WHERE id = ?');
  return stmt.run(updateId);
}

// SEARCH & FILTER
function searchProjectUpdates(projectId, query, filters = {}) {
  let sql = `
    SELECT u.*, usr.full_name, usr.profile_picture
    FROM project_updates u
    JOIN users usr ON usr.id = u.user_id
    WHERE u.project_id = ?
  `;

  const params = [projectId];

  if (query) {
    sql += ` AND (u.title LIKE ? OR u.text_content LIKE ?)`;
    const searchTerm = `%${query}%`;
    params.push(searchTerm, searchTerm);
  }

  if (filters.status) {
    sql += ` AND u.status = ?`;
    params.push(filters.status);
  }

  if (filters.userId) {
    sql += ` AND u.user_id = ?`;
    params.push(filters.userId);
  }

  if (filters.contentType) {
    sql += ` AND u.content_type = ?`;
    params.push(filters.contentType);
  }

  sql += ` ORDER BY u.created_at DESC LIMIT 100`;

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

module.exports = {
  createProjectUpdate,
  getProjectUpdates,
  getProjectUpdate,
  updateProjectUpdate,
  deleteProjectUpdate,
  searchProjectUpdates
};
```

---

### B. API Routes

**Purpose**: HTTP endpoints for CRUD & engagement operations.

```javascript
// routes/projectUpdates.js

const express = require('express');
const router = express.Router();
const {
  createProjectUpdate, getProjectUpdates, getProjectUpdate,
  updateProjectUpdate, deleteProjectUpdate, searchProjectUpdates
} = require('../db/projectUpdates');

// GET /api/projects/:id/updates
router.get('/api/projects/:projectId/updates', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const limit = Math.min(parseInt(req.query.limit || 20, 10), 100);
    const offset = parseInt(req.query.offset || 0, 10);

    const updates = getProjectUpdates(projectId, limit, offset);
    const total = db.prepare(
      'SELECT COUNT(*) as count FROM project_updates WHERE project_id = ?'
    ).get(projectId).count;

    res.json({
      updates,
      pagination: { limit, offset, total }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/updates
router.post('/api/projects/:projectId/updates', requireAuth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.session.userId;
    const {
      title, contentType, textContent, status, priority,
      milestoneId, linkedTasks, metrics
    } = req.body;

    // Handle media upload (multer middleware)
    const mediaUrl = req.file ? `/uploads/${req.file.path}` : null;

    const updateId = createProjectUpdate({
      projectId, userId, title, contentType, textContent,
      mediaUrl, status, priority, milestoneId,
      linkedTasks, metrics
    });

    const update = getProjectUpdate(updateId);
    res.json({ success: true, update });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id/updates/:updateId
router.put('/api/projects/:projectId/updates/:updateId', requireAuth, (req, res) => {
  try {
    const updateId = parseInt(req.params.updateId, 10);
    updateProjectUpdate(updateId, req.body);
    const update = getProjectUpdate(updateId);
    res.json({ success: true, update });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/updates/:updateId
router.delete('/api/projects/:projectId/updates/:updateId', requireAuth, (req, res) => {
  try {
    const updateId = parseInt(req.params.updateId, 10);
    deleteProjectUpdate(updateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

---

### C. Frontend - Post Widget Component

**Purpose**: Reusable UI component for rendering & interacting with updates.

```html
<!-- views/partials/project-update-card.ejs -->

<article class="project-update-card" data-update-id="<%= update.id %>">
  <!-- Header with Author Info -->
  <header class="update-header">
    <% if (update.profile_picture) { %>
      <img 
        src="/uploads/<%= update.profile_picture %>" 
        alt="<%= update.full_name %>" 
        class="avatar"
        onclick="navigateTo('/profile/<%= update.user_id %>')"
      >
    <% } else { %>
      <div class="avatar">
        <%= update.full_name.charAt(0) %>
      </div>
    <% } %>

    <div class="update-user-info">
      <h4 class="update-author"><%= update.full_name %></h4>
      <div class="update-meta">
        <% if (update.status) { %>
          <span class="status-badge" data-status="<%= update.status %>">
            <%= update.status %>
          </span>
        <% } %>
        <span class="update-time">
          <%= new Date(update.created_at).toLocaleString() %>
        </span>
      </div>
    </div>

    <% if (authUser && (authUser.id === update.user_id || authUser.role === 'admin')) { %>
      <button class="update-actions-btn">⋮</button>
      <div class="update-actions-menu" style="display: none;">
        <button data-action="edit">✏️ Edit</button>
        <button data-action="delete">🗑️ Delete</button>
      </div>
    <% } %>
  </header>

  <!-- Update Content -->
  <div class="update-body">
    <% if (update.title) { %>
      <h3 class="update-title"><%= update.title %></h3>
    <% } %>

    <% if (update.text_content) { %>
      <p class="update-text"><%= update.text_content %></p>
    <% } %>

    <!-- Media Display -->
    <% if (update.image_url || update.video_url) { %>
      <div class="update-media">
        <% if (update.content_type === 'image' || update.image_url) { %>
          <img 
            src="<%= update.image_url || update.media_url %>" 
            alt="Update image"
            class="update-image"
          >
        <% } else if (update.content_type === 'video' || update.video_url) { %>
          <video 
            src="<%= update.video_url || update.media_url %>" 
            controls
            class="update-video"
          ></video>
        <% } %>
      </div>
    <% } %>

    <!-- Project-Specific Metadata -->
    <% if (update.status || update.priority || update.metrics) { %>
      <div class="update-metadata">
        <% if (update.priority) { %>
          <span class="priority-badge" data-priority="<%= update.priority %>">
            Priority: <%= update.priority %>
          </span>
        <% } %>
        <% if (update.metrics) { %>
          <% const metrics = JSON.parse(update.metrics || '{}'); %>
          <% if (metrics.progress !== undefined) { %>
            <div class="progress-bar">
              <div class="progress-fill" style="width: <%= metrics.progress %>%"></div>
              <span class="progress-text"><%= metrics.progress %>%</span>
            </div>
          <% } %>
        <% } %>
      </div>
    <% } %>
  </div>

  <!-- Engagement Footer -->
  <footer class="update-footer">
    <div class="engagement-buttons">
      <button class="like-btn" data-update-id="<%= update.id %>">
        👍 <span class="like-count"><%= update.reaction_count || 0 %></span>
      </button>
      <button class="comment-btn">
        💬 <span class="comment-count"><%= update.comment_count || 0 %></span>
      </button>
    </div>

    <!-- Comments Section -->
    <div class="comments-section" style="display: none;">
      <div class="comments-list"></div>
      <div class="comment-input-row">
        <input 
          type="text" 
          class="comment-input" 
          placeholder="Add a comment..."
        >
        <button class="comment-send">Send</button>
      </div>
    </div>
  </footer>
</article>
```

---

### D. Client-Side JavaScript

**Purpose**: Handle interactions, real-time updates, and DOM manipulation.

```javascript
// public/js/project-updates-widget.js

class ProjectUpdatesWidget {
  constructor(containerId, projectId, options = {}) {
    this.container = document.getElementById(containerId);
    this.projectId = projectId;
    this.options = {
      pageSize: 20,
      autoLoad: true,
      realtimeSocket: null,
      ...options
    };

    this.updates = [];
    this.offset = 0;
    this.isLoading = false;
    this.hasMore = true;

    if (this.options.autoLoad) {
      this.loadUpdates();
    }

    this.setupRealtimeListeners();
    this.setupEventDelegation();
  }

  // Fetch updates from API
  async loadUpdates() {
    if (this.isLoading || !this.hasMore) return;

    this.isLoading = true;
    const url = `/api/projects/${this.projectId}/updates?limit=${this.options.pageSize}&offset=${this.offset}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      this.updates = [...this.updates, ...data.updates];
      this.offset += data.updates.length;
      this.hasMore = this.offset < data.pagination.total;

      this.render();
    } catch (err) {
      console.error('Failed to load updates:', err);
    } finally {
      this.isLoading = false;
    }
  }

  // Render all updates to DOM
  render() {
    this.container.innerHTML = '';

    this.updates.forEach(update => {
      const card = this.createUpdateCard(update);
      this.container.appendChild(card);
    });

    if (this.hasMore) {
      const loadMore = document.createElement('button');
      loadMore.textContent = 'Load More';
      loadMore.className = 'load-more-btn';
      loadMore.addEventListener('click', () => this.loadUpdates());
      this.container.appendChild(loadMore);
    }
  }

  // Create a single update card element
  createUpdateCard(update) {
    const article = document.createElement('article');
    article.className = 'project-update-card';
    article.dataset.updateId = update.id;

    article.innerHTML = `
      <header class="update-header">
        <img 
          src="/uploads/${update.profile_picture || 'default.jpg'}" 
          alt="${update.full_name}"
          class="avatar"
        >
        <div class="update-info">
          <h4>${update.full_name}</h4>
          <span class="update-time">${new Date(update.created_at).toLocaleString()}</span>
          ${update.status ? `<span class="status-badge">${update.status}</span>` : ''}
        </div>
      </header>

      <div class="update-body">
        ${update.title ? `<h3>${update.title}</h3>` : ''}
        ${update.text_content ? `<p>${update.text_content}</p>` : ''}
        ${update.image_url ? `<img src="${update.image_url}" alt="Update" class="update-image">` : ''}
        ${update.video_url ? `<video src="${update.video_url}" controls></video>` : ''}
      </div>

      <footer class="update-footer">
        <button class="like-btn" data-update-id="${update.id}">
          👍 <span class="like-count">${update.reaction_count || 0}</span>
        </button>
        <button class="comment-btn" data-update-id="${update.id}">
          💬 <span class="comment-count">${update.comment_count || 0}</span>
        </button>
      </footer>
    `;

    return article;
  }

  // Setup event delegation for dynamic elements
  setupEventDelegation() {
    this.container.addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('.like-btn');
      const commentBtn = e.target.closest('.comment-btn');

      if (likeBtn) {
        const updateId = likeBtn.dataset.updateId;
        await this.toggleLike(updateId);
      }

      if (commentBtn) {
        const updateId = commentBtn.dataset.updateId;
        this.toggleComments(updateId);
      }
    });
  }

  // Toggle like on update
  async toggleLike(updateId) {
    try {
      const res = await fetch(`/api/projects/${this.projectId}/updates/${updateId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'like' })
      });

      const data = await res.json();
      if (data.success) {
        const card = this.container.querySelector(`[data-update-id="${updateId}"]`);
        const countSpan = card.querySelector('.like-count');
        countSpan.textContent = data.count;
      }
    } catch (err) {
      console.error('Failed to like update:', err);
    }
  }

  // Toggle comments visibility
  toggleComments(updateId) {
    const card = this.container.querySelector(`[data-update-id="${updateId}"]`);
    const commentSection = card.querySelector('.comments-section');
    
    if (commentSection.style.display === 'none') {
      commentSection.style.display = 'block';
      this.loadComments(updateId);
    } else {
      commentSection.style.display = 'none';
    }
  }

  // Setup Socket.IO listeners for real-time updates
  setupRealtimeListeners() {
    if (!this.options.realtimeSocket) return;

    const socket = this.options.realtimeSocket;

    socket.on(`project-${this.projectId}-update`, (data) => {
      if (data.action === 'new') {
        this.updates.unshift(data.update);
        this.render();
      } else if (data.action === 'delete') {
        this.updates = this.updates.filter(u => u.id !== data.updateId);
        this.render();
      }
    });
  }

  // Public API for creating updates
  async addUpdate(data) {
    try {
      const res = await fetch(`/api/projects/${this.projectId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (result.success) {
        this.updates.unshift(result.update);
        this.render();
        return result.update;
      }
    } catch (err) {
      console.error('Failed to add update:', err);
    }
  }

  // Public API for deleting updates
  async deleteUpdate(updateId) {
    try {
      const res = await fetch(
        `/api/projects/${this.projectId}/updates/${updateId}`,
        { method: 'DELETE' }
      );

      const result = await res.json();
      if (result.success) {
        this.updates = this.updates.filter(u => u.id !== updateId);
        this.render();
      }
    } catch (err) {
      console.error('Failed to delete update:', err);
    }
  }
}

// Usage Example
document.addEventListener('DOMContentLoaded', () => {
  const projectId = parseInt(document.body.dataset.projectId);
  const widget = new ProjectUpdatesWidget('project-updates-container', projectId, {
    pageSize: 15,
    realtimeSocket: window.io ? io() : null
  });

  // Expose for external use
  window.ProjectUpdates = widget;
});
```

---

## 3. Key Features to Include

### A. Media Handling
- **Image Upload** with cropping & filters (use CropperJS)
- **Video Upload** with trimming capability
- **Audio Upload** with segment selection
- **External Video** embedding (YouTube, Vimeo)

### B. Content Organization
- **Hashtags** (#progress, #milestone, #blocked)
- **Tags** (custom labels for filtering)
- **Status Labels** (planning, in-progress, completed, blocked)
- **Priority Levels** (low, medium, high, critical)

### C. Engagement
- **Reactions** (likes, emoji reactions)
- **Comments** with threaded replies
- **Comment Liking** (show support on specific replies)
- **Real-time Updates** via Socket.IO

### D. Project Context
- **Milestone Linking** (tie updates to milestones)
- **Task Association** (link to specific tasks)
- **Progress Metrics** (display % complete, metrics changes)
- **Pinned Updates** (highlight important announcements)
- **Announcements** (project-wide visibility markers)

### E. Permissions
- **Team-Only** visibility (members only)
- **Public** visibility (shared externally)
- **Private** (author + admins only)
- **Edit/Delete** (author + admin rights)

---

## 4. Integration Checklist

### Database
- [ ] Create `project_updates` table with schema above
- [ ] Create `project_reactions` table (for likes/emojis)
- [ ] Create `project_comments` table (for discussions)
- [ ] Add indexes for performance
- [ ] Create migrations for existing projects

### Backend
- [ ] Implement `projectUpdates.js` DAL functions
- [ ] Create API routes in `routes/projectUpdates.js`
- [ ] Add multer middleware for media uploads
- [ ] Setup Socket.IO events for real-time sync
- [ ] Implement permission checks on all endpoints
- [ ] Add input validation & sanitization

### Frontend
- [ ] Create `project-update-card.ejs` partial
- [ ] Build `project-updates-widget.js` component class
- [ ] Add CSS styling for cards, buttons, modals
- [ ] Implement upload composer modal (similar to feed)
- [ ] Add media preview & editing functionality
- [ ] Setup image editor (CropperJS integration)
- [ ] Implement video trimming UI
- [ ] Add comment threading UI

### Real-time
- [ ] Setup Socket.IO namespace for projects
- [ ] Emit `update-created`, `update-deleted`, `update-reacted` events
- [ ] Listen for updates on client & refresh widget
- [ ] Handle offline/reconnection scenarios

### Testing
- [ ] Unit test DAL functions
- [ ] Integration test API endpoints
- [ ] E2E test widget interactions
- [ ] Test permissions & access control
- [ ] Test media uploads & processing
- [ ] Test Socket.IO real-time sync

---

## 5. Comparison: Posts vs. Project Updates

| Aspect | Posts (Feed) | Project Updates |
|--------|-------------|-----------------|
| **Scope** | User-centric social feed | Project-scoped team updates |
| **Context** | Personal achievement sharing | Collaborative progress tracking |
| **Visibility** | Followers/public | Team members/stakeholders |
| **Key Fields** | Title, content, activity_label | Title, status, priority, metrics |
| **Engagement** | Likes, comments, reposts | Likes, comments, task linking |
| **Media** | Images, videos, audio, GIFs | Same + attachments, metrics |
| **Real-time** | Socket.IO (reactions, comments) | Socket.IO (updates, comments) |
| **Permissions** | User-controlled | Role-based (team/admin) |

---

## 6. Implementation Roadmap

**Phase 1: Data & API (1-2 weeks)**
- [ ] Schema design & migrations
- [ ] DAL implementation
- [ ] RESTful API routes
- [ ] Permission middleware

**Phase 2: Frontend Components (1-2 weeks)**
- [ ] Update card partial
- [ ] Composer modal
- [ ] Media upload UI
- [ ] Widget JavaScript class

**Phase 3: Real-time & Polish (1 week)**
- [ ] Socket.IO integration
- [ ] Offline handling
- [ ] Edge case testing
- [ ] CSS refinement

**Phase 4: Advanced Features (2+ weeks)**
- [ ] Full-text search
- [ ] Advanced filtering
- [ ] Notification system
- [ ] Export/archive features

---

## 7. Example: Creating a Project Update

```javascript
// Frontend - Trigger from composer
const updateData = {
  title: "Implemented user authentication",
  contentType: "text",
  textContent: "Successfully integrated OAuth with Google & Microsoft.",
  status: "completed",
  priority: "high",
  milestoneId: 42,
  metrics: { progress: 85 },
  linkedTasks: [101, 102, 103]
};

const newUpdate = await window.ProjectUpdates.addUpdate(updateData);
console.log("Created update:", newUpdate.id);
```

```javascript
// Backend - Receives & stores
router.post('/api/projects/:projectId/updates', requireAuth, (req, res) => {
  const updateId = createProjectUpdate({
    projectId: req.params.projectId,
    userId: req.session.userId,
    ...req.body
  });

  // Emit real-time event
  io.emit(`project-${req.params.projectId}-update`, {
    action: 'new',
    update: getProjectUpdate(updateId)
  });

  res.json({ success: true, update: getProjectUpdate(updateId) });
});
```

---

## Conclusion

This post widget architecture provides a **scalable, reusable foundation** for DreamX projects. By carefully separating concerns (DAL, routes, components) and leveraging the existing DreamX patterns, you can rapidly deploy project updates across multiple scopes while maintaining consistency and real-time interactivity.

The key is **flexibility at the schema level** — adding project-specific fields without breaking the core post rendering logic.


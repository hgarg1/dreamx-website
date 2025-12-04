# DreamX Project System - Quick Start Guide

## For Users

### Creating a Project
1. Navigate to `/projects/create` or click "✨ New Project" button
2. Fill in basic information:
   - **Title**: Project name (max 200 characters)
   - **Description**: What your project is about
   - **Category**: Choose from Tech, Design, Business, Creative, Education, Health, Social Impact, Other
   - **Visibility**: Public (everyone sees), Unlisted (only with link), or Private (owner only)
3. Set status and timeline:
   - Choose status: Planning, In Progress, Completed, or Paused
   - Set progress percentage (0-100%)
   - Optional: Set target completion date
4. Add tags and goals:
   - Type tags and press Enter to add (e.g., #startup, #ai, #web3)
   - Add project goals (deliverables, milestones)
5. Click "🚀 Create Project"
6. You'll be redirected to your new project's detail page

### Browsing Projects
1. Click "Projects" in navigation or go to `/projects`
2. See feed-style listing of all public projects
3. Use sidebar filters to show only certain statuses
4. Click any project card to view details
5. Use pagination to browse more projects

### Viewing Project Details
- **Overview tab**: See goals, tags, progress
- **Milestones tab**: Project phases and checkpoints
- **Tasks tab**: Work items with priority and assignments
- **Updates tab**: Status updates from team
- Click "👍" to like updates
- Click "💬" to comment

### On Your Profile
- New "Projects" tab shows your created projects
- Click project to view details
- Click "Edit" to modify your own projects
- Delete projects from detail page (owner only)
- Others see only public/unlisted of your projects

## For Developers

### Key Endpoints

**Browse Projects**
```
GET /projects                          # Feed (paginated)
GET /projects?limit=20&offset=0       # With pagination
```

**Project Operations**
```
GET /project/:id                       # View project detail
GET /projects/create                   # Create form
POST /api/projects                     # Create project
PUT /api/projects/:id                  # Update project (owner only)
DELETE /api/projects/:id               # Delete project (owner only)
```

**Updates/Comments**
```
POST /api/projects/:id/updates                    # Post update
POST /api/projects/:id/updates/:updateId/react    # Like update
POST /api/projects/:id/updates/:updateId/comments # Comment
```

### Database Functions

**Fetch Projects**
```javascript
const dbProjects = require('../db/projects');

// Get all public/unlisted projects
const projects = dbProjects.getPublicProjects(limit, offset);

// Get user's projects
const userProjects = dbProjects.getProjectsByOwner(userId, limit, offset);

// Get single project with counts
const project = dbProjects.getProjectById(projectId);
```

**Create/Update/Delete**
```javascript
// Create
const projectId = dbProjects.createProject({
  owner_id: userId,
  title: "My Project",
  description: "Project description",
  category: "tech",
  visibility: "public",
  status: "planning",
  progress_percent: 0,
  tags: ["tag1", "tag2"],
  goals: ["goal1", "goal2"]
});

// Update
dbProjects.updateProject(projectId, {
  title: "Updated Title",
  progress_percent: 50
});

// Delete
dbProjects.deleteProject(projectId);
```

**Milestones & Tasks**
```javascript
// Milestones
const milestones = dbProjects.getMilestonesByProject(projectId);
const milestoneId = dbProjects.createMilestone({
  project_id: projectId,
  title: "MVP Launch",
  description: "Launch minimum viable product",
  status: "in-progress",
  due_date: "2024-03-31"
});

// Tasks
const tasks = dbProjects.getTasksByProject(projectId);
const taskId = dbProjects.createTask({
  project_id: projectId,
  title: "Design homepage",
  description: "Create landing page mockup",
  assigned_to: userId,
  priority: "high",
  status: "pending",
  due_date: "2024-02-15"
});
```

**Updates & Engagement**
```javascript
// Create update
const updateId = dbProjects.createProjectUpdate({
  project_id: projectId,
  user_id: userId,
  content: "We've completed the design phase!",
  content_type: "text"
});

// Get updates
const updates = dbProjects.getProjectUpdates(projectId, limit, offset);

// React to update
dbProjects.setProjectReaction(updateId, userId, "like");

// Get reactions summary
const reactions = dbProjects.getProjectReactionsSummary(updateId);
// Returns: { like: 5, celebrate: 2, ... }

// Comment on update
const commentId = dbProjects.addProjectComment(updateId, userId, "Great work!");
const comments = dbProjects.getProjectComments(updateId, limit, offset);
```

### Template Usage

**Display Projects Grid**
```ejs
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">
  <% projects.forEach(project => { %>
    <div onclick="window.location.href='/project/<%= project.id %>'">
      <h3><%= project.title %></h3>
      <p><%= project.description %></p>
      <span><%= project.status %></span>
      <div style="width:100%;background:#e5e7eb;height:6px;">
        <div style="width:<%= project.progress_percent %>%;background:linear-gradient(90deg,#ff4fa3,#764ba2);height:100%;"></div>
      </div>
    </div>
  <% }); %>
</div>
```

**Display Single Project Info**
```ejs
<h1><%= project.title %></h1>
<p><%= project.description %></p>

<div>
  <span>Status: <%= project.status %></span>
  <span>Progress: <%= project.progress_percent %>%</span>
  <span>Owner: <%= project.owner_name %></span>
</div>

<% if (project.tags) { %>
  <% JSON.parse(project.tags).forEach(tag => { %>
    <span class="tag"><%= tag %></span>
  <% }); %>
<% } %>
```

### JSON Field Handling

Projects use JSON fields for complex data:

```javascript
// Tags are stored as JSON string: '["tag1","tag2"]'
const tags = JSON.parse(project.tags || '[]');

// Goals are stored as JSON string: '["goal1","goal2"]'
const goals = JSON.parse(project.goals || '[]');

// Team members: '[{"id":1,"name":"John"},{"id":2,"name":"Jane"}]'
const team = JSON.parse(project.team_members || '[]');

// When inserting, convert back:
const updateData = {
  tags: JSON.stringify(["new-tag"]),
  goals: JSON.stringify(["new-goal"]),
  team_members: JSON.stringify([{id:1,name:"John"}])
};
```

### Common Queries

**Get project with all details**
```javascript
const project = dbProjects.getProjectById(projectId);
const milestones = dbProjects.getMilestonesByProject(projectId);
const tasks = dbProjects.getTasksByProject(projectId);
const updates = dbProjects.getProjectUpdates(projectId, 50, 0);

// Parse JSON fields
const tags = JSON.parse(project.tags || '[]');
const goals = JSON.parse(project.goals || '[]');
```

**Check if user owns project**
```javascript
const project = dbProjects.getProjectById(projectId);
const isOwner = project.owner_id === req.session.userId;

if (!isOwner && project.visibility === 'private') {
  return res.status(403).json({ error: 'Access denied' });
}
```

**Get user's projects for profile**
```javascript
const userProjects = dbProjects.getProjectsByOwner(userId, 100, 0);
// Returns projects owned by user, ready to display
```

## File Structure

```
DreamX Website/
├── db/
│   ├── db.js                    # Main database module
│   └── projects.js              # Project-specific queries
├── routes/
│   ├── projects.js              # Project routes
│   └── profile.js               # Modified for projects
├── views/
│   ├── projects-feed.ejs        # Project feed page
│   ├── project-detail.ejs       # Project detail page
│   ├── project-wizard.ejs       # Create/edit form
│   └── profile.ejs              # Modified with projects tab
├── schema.sql                   # Modified with project tables
├── app.js                       # Modified to register routes
└── PROJECT_SYSTEM_IMPLEMENTATION.md  # Full documentation
```

## Styling & Colors

The project system uses DreamX's standard gradient:
```css
/* Primary gradient */
background: linear-gradient(135deg, #ff4fa3, #764ba2);

/* Accent colors */
Status badges:
- planning: #dbeafe (blue background), #1e40af (blue text)
- in-progress: #dcfce7 (green background), #166534 (green text)
- completed: #fecaca (red background), #991b1b (red text)

Priority levels:
- high: #fee2e2, #991b1b
- medium: #fef3c7, #b45309
- low: #dbeafe, #1e40af
```

## Responsive Breakpoints

```css
/* Desktop: 1200px+ */
3-column layout (sidebar | main | stats)

/* Tablet: 768px - 1200px */
2-column layout (sidebar | main)
Stats hidden

/* Mobile: < 768px */
1-column layout
Full-width cards
Touch-optimized buttons
```

## Security Notes

- All modifying operations require authentication (`requireAuth` middleware)
- Project edit/delete only allowed for owner (check `project.owner_id`)
- Private projects (`visibility: 'private'`) only accessible to owner
- Use prepared statements for all DB queries
- JSON fields are sanitized by EJS template engine

## Performance Tips

1. **Pagination**: Always use limit/offset for large datasets
   ```javascript
   const projects = getPublicProjects(20, pageNumber * 20);
   ```

2. **Aggregation**: View/reaction counts computed in database queries
   ```javascript
   // Reaction count included in getProjectReactionsSummary()
   ```

3. **Caching**: Consider caching popular projects:
   ```javascript
   // Add Redis caching for getPublicProjects()
   ```

4. **Indexes**: Database includes indexes on:
   - owner_id (quick user lookups)
   - status (filtering)
   - visibility (public listings)
   - created_at (sorting)

## Troubleshooting

**404 on `/projects`**
- Verify project routes registered in app.js
- Check route registration order (should be before API routes)

**Projects not saving**
- Check JSON serialization of tags/goals in form
- Verify database schema created properly
- Check error logs in server console

**Images not showing**
- Verify file upload paths are correct
- Check `/uploads/` directory exists and is writable
- Use emoji fallback as shown in templates

**Permission denied on edit**
- Verify `req.session.userId` is set (user logged in)
- Check project owner_id matches user ID
- Confirm visibility logic in route

## Next Steps

1. **Add milestone/task management routes** if not yet implemented
2. **Implement file uploads** for project cover images
3. **Add Socket.IO** for real-time project updates
4. **Create project templates** for common types
5. **Add search/filter** by tags or keyword
6. **Integrate notifications** when commented on
7. **Add export to PDF** for project portfolios

## Support

For issues or questions:
1. Check `PROJECT_SYSTEM_IMPLEMENTATION.md` for detailed documentation
2. Review database functions in `db/projects.js`
3. Check route handlers in `routes/projects.js`
4. Verify EJS templates for UI structure

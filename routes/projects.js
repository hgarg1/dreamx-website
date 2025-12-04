const express = require('express');
const path = require('path');
const multer = require('multer');
const createStorageAdapter = require('../services/storage/multer-storage');
const {
  createProject,
  getProjectById,
  getProjectsByOwner,
  getPublicProjects,
  getProjectCount,
  updateProject,
  deleteProject,
  incrementProjectViews,
  getMilestonesByProject,
  getTasksByProject,
  getProjectUpdates,
  createProjectUpdate,
  setProjectReaction,
  getProjectReactionsSummary,
  getUserProjectReaction,
  addProjectComment,
  getProjectComments,
  getProjectCommentCount,
  deleteProjectComment,
  addProjectCommentFile,
  getProjectCommentFiles,
  deleteProjectCommentFile,
  setProjectCommentReaction,
  removeProjectCommentReaction,
  getProjectCommentReactions,
  getUserProjectCommentReaction,
  getUserById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestoneById,
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  deleteProjectUpdate
} = require('../db');

const router = express.Router();

// Multer for handling project files
const COMMON_IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'
];

const COMMON_DOCUMENT_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const projectFilesUpload = multer({
  storage: createStorageAdapter('project-files', 'proj-file-'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const m = (file.mimetype || '').toLowerCase();
    const allowed = new Set([
      ...COMMON_DOCUMENT_MIME_TYPES,
      ...COMMON_IMAGE_MIME_TYPES,
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/zip', 'application/x-zip-compressed'
    ]);
    if (allowed.has(m)) return cb(null, true);
    cb(new Error('Unsupported file type'));
  }
});

// Multer for handling multipart form data (no file uploads, just fields)
const projectUpload = multer();

// Middleware: require authentication
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).redirect('/login');
  }
  next();
}

// ============ PUBLIC ROUTES ============

// GET /projects - Feed-style display of all public projects
router.get('/projects', requireAuth, (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    
    const limit = Math.min(parseInt(req.query.limit || 20, 10), 100);
    const offset = parseInt(req.query.offset || 0, 10);
    
    const projects = getPublicProjects(limit, offset);
    const total = getProjectCount();
    
    const authUser = getUserById(req.session.userId);

    res.render('projects-feed', {
      title: 'Projects - Dream X',
      currentPage: 'projects',
      authUser,
      projects,
      pagination: { limit, offset, total }
    });
  } catch (err) {
    console.error('Projects feed error:', err);
    res.status(500).render('500', { title: 'Server Error' });
  }
});

// GET /project/[id] - Single project view
router.get('/project/:id(\\d+)', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (!projectId) return res.redirect('/projects');

    const project = getProjectById(projectId);
    if (!project) {
      return res.status(404).render('404', { title: 'Project Not Found' });
    }

    // Check visibility
    if (project.visibility === 'private' && project.owner_id !== req.session.userId) {
      return res.status(403).render('403', { title: 'Access Denied' });
    }

    // Increment view count
    incrementProjectViews(projectId);

    // Get related data
    const milestones = getMilestonesByProject(projectId);
    const tasks = getTasksByProject(projectId);
    const updates = getProjectUpdates(projectId, 50, 0);

    // Parse JSON fields safely
    const parseJsonField = (field) => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      try {
        return JSON.parse(field);
      } catch (e) {
        // If it's not valid JSON, try splitting by comma (fallback for old data)
        if (typeof field === 'string') {
          return field.split(',').map(s => s.trim()).filter(s => s);
        }
        return [];
      }
    };

    project.tags = parseJsonField(project.tags);
    project.goals = parseJsonField(project.goals);
    project.team_members = parseJsonField(project.team_members);
    project.gallery_images = parseJsonField(project.gallery_images);

    // Enrich updates with user reactions
    const enrichedUpdates = updates.map(u => {
      u.user_reaction = getUserProjectReaction(u.id, req.session.userId);
      u.reactions = getProjectReactionsSummary(u.id);
      u.metrics = u.metrics ? JSON.parse(u.metrics) : null;
      return u;
    });

    const authUser = getUserById(req.session.userId);
    const isOwner = project.owner_id === req.session.userId;

    res.render('project-detail', {
      title: `${project.title} - Dream X`,
      currentPage: 'project',
      authUser,
      project,
      milestones,
      tasks,
      updates: enrichedUpdates,
      isOwner
    });
  } catch (err) {
    console.error('Project detail error:', err);
    res.status(500).render('500', { title: 'Server Error' });
  }
});

// ============ PROJECT MANAGEMENT ============

// GET /projects/:id/edit - Edit project form
router.get('/projects/:id/edit', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).render('404', { title: 'Project Not Found' });
    }

    // Only owner can edit
    if (project.owner_id !== req.session.userId) {
      return res.status(403).render('403', { title: 'Access Denied' });
    }

    const authUser = getUserById(req.session.userId);

    res.render('project-edit', {
      title: `Edit ${project.title} - Dream X`,
      currentPage: 'projects',
      authUser,
      project,
      mode: 'edit'
    });
  } catch (err) {
    console.error('Edit project form error:', err);
    res.status(500).render('500', { title: 'Server Error' });
  }
});

// GET /projects/create - Create project wizard
router.get('/projects/create', requireAuth, (req, res) => {
  try {
    const authUser = getUserById(req.session.userId);
    res.render('project-wizard', {
      title: 'Create Project - Dream X',
      currentPage: 'projects',
      authUser,
      mode: 'create'
    });
  } catch (err) {
    console.error('Create project form error:', err);
    res.status(500).render('500', { title: 'Server Error' });
  }
});

// POST /api/projects - Create new project
router.post('/api/projects', requireAuth, projectUpload.none(), (req, res) => {
  try {
    console.log('=== Project Creation Debug ===');
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Session userId:', req.session.userId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Body keys:', Object.keys(req.body));
    
    const {
      title, 
      description, 
      category, 
      visibility, 
      tags, 
      goals,
      status,
      progress_percent,
      target_completion_date
    } = req.body;

    console.log('Extracted - title:', title, 'description:', description);

    if (!title || !description) {
      console.log('❌ Validation failed - missing title or description');
      console.log('Title value:', title, 'Type:', typeof title);
      console.log('Description value:', description, 'Type:', typeof description);
      return res.status(400).json({ 
        error: 'Title and description are required', 
        success: false,
        debug: { title: !!title, description: !!description }
      });
    }

    // Parse tags and goals from JSON strings
    let parsedTags = [];
    let parsedGoals = [];

    try {
      parsedTags = tags ? JSON.parse(tags) : [];
      parsedGoals = goals ? JSON.parse(goals) : [];
    } catch (e) {
      console.error('Error parsing tags/goals:', e);
    }

    const projectId = createProject({
      owner_id: req.session.userId,
      title,
      description,
      category,
      visibility: visibility || 'public',
      tags: parsedTags,
      goals: parsedGoals,
      status: status || 'planning',
      progress_percent: parseInt(progress_percent || 0, 10),
      target_completion_date
    });

    const project = getProjectById(projectId);
    res.json({ success: true, project, projectId });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

// PUT /api/projects/:id - Update project
router.put('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    updateProject(projectId, req.body);
    const updated = getProjectById(projectId);

    res.json({ success: true, project: updated });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    deleteProject(projectId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ PROJECT UPDATES ============

// POST /api/projects/:id/updates - Post a project update
router.post('/api/projects/:id/updates', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only project owner can create updates
    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, contentType, textContent, statusUpdate } = req.body;

    const updateId = createProjectUpdate({
      projectId,
      userId: req.session.userId,
      title,
      contentType: contentType || 'text',
      textContent,
      statusUpdate
    });

    const update = getProjectUpdates(projectId, 1, 0)[0];
    res.json({ success: true, update });
  } catch (err) {
    console.error('Create update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/updates/:updateId/react - React to update
router.post('/api/projects/:id/updates/:updateId/react', requireAuth, (req, res) => {
  try {
    const updateId = parseInt(req.params.updateId, 10);
    const { type } = req.body;

    setProjectReaction(updateId, req.session.userId, type || 'like');
    const counts = getProjectReactionsSummary(updateId);

    res.json({ success: true, counts });
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/updates/:updateId/comments - Comment on update
router.post('/api/projects/:id/updates/:updateId/comments', requireAuth, projectFilesUpload.array('files', 5), (req, res) => {
  try {
    const updateId = parseInt(req.params.updateId, 10);
    const projectId = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    const commentId = addProjectComment(updateId, req.session.userId, content);
    
    // Handle file uploads if present
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const fileUrl = file.path || `/uploads/${file.filename}`;
        addProjectCommentFile(
          commentId,
          fileUrl,
          file.originalname,
          file.mimetype,
          file.size
        );
      }
    }

    const comments = getProjectComments(updateId, 50, 0);

    // Enrich comments with file info
    const enrichedComments = comments.map(comment => {
      return {
        ...comment,
        files: getProjectCommentFiles(comment.id)
      };
    });

    res.json({ success: true, comments: enrichedComments });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/updates/:updateId/comments - Get comments for an update
router.get('/api/projects/:id/updates/:updateId/comments', requireAuth, (req, res) => {
  try {
    const updateId = parseInt(req.params.updateId, 10);
    const comments = getProjectComments(updateId, 50, 0);

    // Enrich comments with file info
    const enrichedComments = comments.map(comment => {
      return {
        ...comment,
        files: getProjectCommentFiles(comment.id)
      };
    });

    res.json({ success: true, comments: enrichedComments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/updates/:updateId/comments/:commentId/react - React to comment with star
router.post('/api/projects/:id/updates/:updateId/comments/:commentId/react', requireAuth, (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const { type } = req.body;
    const reactionType = type || 'star';

    // Check if user already reacted
    const existing = getUserProjectCommentReaction(commentId, req.session.userId);
    
    if (existing) {
      // Remove reaction if already exists
      removeProjectCommentReaction(commentId, req.session.userId, reactionType);
    } else {
      // Add reaction
      setProjectCommentReaction(commentId, req.session.userId, reactionType);
    }

    const reactions = getProjectCommentReactions(commentId);
    res.json({ success: true, reactions, userReacted: !existing });
  } catch (err) {
    console.error('Comment reaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/updates/:updateId/comments/:commentId/files - Upload file to comment
router.post('/api/projects/:id/updates/:updateId/comments/:commentId/files', requireAuth, projectFilesUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const commentId = parseInt(req.params.commentId, 10);
    
    // Save file attachment
    const fileId = addProjectCommentFile(
      commentId,
      req.file.url || `/uploads/${req.file.path}`,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );

    res.json({ 
      success: true, 
      file: {
        id: fileId,
        name: req.file.originalname,
        url: req.file.url || `/uploads/${req.file.path}`,
        type: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/updates/:updateId/comments/:commentId/files/:fileId - Delete comment file
router.delete('/api/projects/:id/updates/:updateId/comments/:commentId/files/:fileId', requireAuth, (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId, 10);
    deleteProjectCommentFile(fileId);
    res.json({ success: true });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ PROJECT MILESTONES ============

// POST /api/projects/:id/milestones - Create milestone
router.post('/api/projects/:id/milestones', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only project owner can create milestones
    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, targetDate, status } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const milestoneId = createMilestone(projectId, {
      title,
      description: description || null,
      targetDate: targetDate || null,
      status: status || 'pending'
    });

    res.json({ success: true, milestoneId });
  } catch (err) {
    console.error('Create milestone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/milestones/:milestoneId - Delete milestone
router.delete('/api/projects/:id/milestones/:milestoneId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const milestoneId = parseInt(req.params.milestoneId, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    deleteMilestone(milestoneId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete milestone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ PROJECT TASKS ============

// POST /api/projects/:id/tasks - Create task
router.post('/api/projects/:id/tasks', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only project owner can create tasks
    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, priority, dueDate, milestoneId } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const taskId = createTask(projectId, {
      title,
      description: description || null,
      priority: priority || 'medium',
      dueDate: dueDate || null,
      milestoneId: milestoneId || null,
      status: 'todo'
    });

    res.json({ success: true, taskId });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/tasks/:taskId - Delete task
router.delete('/api/projects/:id/tasks/:taskId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const taskId = parseInt(req.params.taskId, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    deleteTask(taskId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id - Get project with all related data
router.get('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check visibility
    if (project.visibility === 'private' && project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const milestones = getMilestonesByProject(projectId);
    const tasks = getTasksByProject(projectId);
    const updates = getProjectUpdates(projectId, 50, 0);

    res.json({
      success: true,
      project,
      milestones,
      tasks,
      updates
    });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/updates/:updateId - Delete update
router.delete('/api/projects/:id/updates/:updateId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const updateId = parseInt(req.params.updateId, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only project owner can delete updates
    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    deleteProjectUpdate(updateId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/files - Upload project files
router.post('/api/projects/:id/files', requireAuth, projectFilesUpload.array('files', 10), (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!req.files || req.files.length === 0) {
      return res.json({ success: true, files: [] });
    }

    const uploadedFiles = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: file.path || `/uploads/${file.filename}`
    }));

    res.json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error('Project file upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


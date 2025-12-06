// ...existing code from routes/projects.js...

function initProjectsRoutes() {
    const express = require('express');
    const path = require('path');
    const multer = require('multer');
    const createStorageAdapter = require('../../services/storage/multer-storage');
    const emailService = require('../../services/emailService');
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
      getProjectCommentById,
      getProjectCommentReplies,
      getProjectCommentCount,
      updateProjectComment,
      deleteProjectComment,
      pinProjectComment,
      hideProjectComment,
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
    } = require('../../db');

    const router = express.Router();

    // ...move all route definitions here...

    return router;
}

module.exports = initProjectsRoutes;

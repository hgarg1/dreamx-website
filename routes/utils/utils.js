
function initUtilsRoutes() {
	// Shared utility functions for routes
	const { db } = require('../../db');
	const express = require('express');
	const router = express.Router();
	// ...move all route definitions here...
	return router;
}

module.exports = initUtilsRoutes;

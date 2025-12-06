
function initStaticRoutes() {
	const express = require('express');
	const path = require('path');
	const { SitemapStream, streamToPromise } = require('sitemap');
	const fs = require('fs');
	const router = express.Router();
	// ...move all route definitions here...
	return router;
}

module.exports = initStaticRoutes;

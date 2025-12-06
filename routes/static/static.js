const express = require('express');
const path = require('path');
const { SitemapStream, streamToPromise } = require('sitemap');
const fs = require('fs');

const router = express.Router();

// Helper function to get all EJS routes
function getAllEjsRoutes(dir, baseUrl = '') {
    let routes = [];
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        // Exclude folders that are for organization only, not URL paths
        const excludedFolders = ['partials', 'includes', 'admin', 'auth', 'business', 'errors', 
                                 'services', 'projects', 'rbac', 'user', 'static', 'appeals', 
                                 'feed', 'hr', 'refunds'];
        if (stat.isDirectory() && !excludedFolders.includes(file)) {
            routes = routes.concat(getAllEjsRoutes(fullPath, baseUrl + '/' + file));
        } else if (file.endsWith('.ejs')) {
            const route = file === 'index.ejs'
                ? baseUrl || '/'
                : `${baseUrl}/${file.replace('.ejs', '')}`;
            routes.push(route.replace(/\\/g, '/'));
        }
    });
    return routes;
}

// PWA manifest
router.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'manifest.json'));
});

// Service worker
router.get('/service-worker.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'service-worker.js'));
});

// Sitemap
router.get('/sitemap.xml', async (req, res) => {
    res.header('Content-Type', 'application/xml');
    const sitemap = new SitemapStream({ hostname: 'https://dream-x.app' });
    const viewsDir = path.join(__dirname, '..', '..', 'views');
    const routes = getAllEjsRoutes(viewsDir);
    routes.forEach(url => {
        sitemap.write({
            url,
            changefreq: 'weekly',
            priority: url === '/' ? 1.0 : 0.7
        });
    });
    sitemap.end();
    const xml = await streamToPromise(sitemap);
    res.send(xml.toString());
});

function initStaticRoutes() {
    return router;
}

module.exports = initStaticRoutes;


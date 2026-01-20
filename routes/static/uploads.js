const express = require('express');
const router = express.Router();
const { db, isUserInConversation, getUserById } = require('../../db');
const storageService = require('../../services/storage');

// Serve uploaded files with authentication and access control
router.get('/uploads/:folder?/:filename', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    
    const folder = req.params.folder || '';
    const filename = req.params.filename;
    
    // Construct file path
    let filePath = filename;
    if (folder) {
        filePath = `${folder}/${filename}`;
    }
    
    // Check if file is a chat attachment
    if (filename && filename.startsWith('chat-')) {
        const msg = await db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url LIKE ?`).get(`%/uploads/${filePath}%`);
        if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
            return res.status(403).send('Forbidden');
        }
    }
    
    try {
        // Get file from storage (Azure Blob or filesystem)
        const fileResult = await storageService.getFile(filePath);
        
        if (!fileResult.success) {
            return res.status(404).send('File not found');
        }
        
        // Set content type and send file
        res.setHeader('Content-Type', fileResult.contentType || 'application/octet-stream');
        res.send(fileResult.data);
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).send('Error serving file');
    }
});

// Legacy route for files without folder prefix (backward compatibility)
router.get('/uploads/:filename', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Unauthorized');
    
    const filename = req.params.filename;
    
    // Try to find file in common folders
    const folders = ['profiles', 'posts', 'chat', 'careers', 'career-assets', 'services', 'refunds'];
    
    for (const folder of folders) {
        const filePath = `${folder}/${filename}`;
        const fileResult = await storageService.getFile(filePath);
        
        if (fileResult.success) {
            // Check if file is a chat attachment
            if (filename.startsWith('chat-')) {
                const msg = await db.prepare(`SELECT m.*, c.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.attachment_url LIKE ?`).get(`%/uploads/${filePath}%`);
                if (!msg || !isUserInConversation({ conversationId: msg.conversation_id, userId: req.session.userId })) {
                    return res.status(403).send('Forbidden');
                }
            }
            
            res.setHeader('Content-Type', fileResult.contentType || 'application/octet-stream');
            return res.send(fileResult.data);
        }
    }
    
    res.status(404).send('File not found');
});

module.exports = router;

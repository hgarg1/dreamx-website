// Multer Storage Adapter for Unified Storage Service
const multer = require('multer');
const storageService = require('./index');

/**
 * Creates a multer memory storage that uploads to Azure Blob (production) or filesystem (local)
 * @param {string} folder - Folder name (e.g., 'profiles', 'posts', 'chat')
 * @param {string} prefix - File prefix (e.g., 'profile-', 'post-', 'chat-')
 * @returns {multer.StorageEngine}
 */
function createStorageAdapter(folder, prefix) {
  return {
    _handleFile: (req, file, cb) => {
      const chunks = [];
      
      file.stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      file.stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          // Generate filename
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const path = require('path');
          const ext = path.extname(file.originalname);
          const filename = `${prefix}${uniqueSuffix}${ext}`;
          const filePath = `${folder}/${filename}`;

          // Upload to storage (Azure Blob or filesystem)
          const uploadResult = await storageService.uploadFile(
            filePath,
            buffer,
            file.mimetype || 'application/octet-stream'
          );

          if (!uploadResult.success) {
            return cb(new Error(uploadResult.error || 'Upload failed'));
          }

          // Return file info with the storage path
          cb(null, {
            fieldname: file.fieldname,
            originalname: file.originalname,
            encoding: file.encoding,
            mimetype: file.mimetype,
            filename: filename,
            path: filePath,
            url: uploadResult.url || `/uploads/${filePath}`,
            size: buffer.length,
            buffer: buffer // Keep buffer for immediate access if needed
          });
        } catch (error) {
          cb(error);
        }
      });

      file.stream.on('error', (err) => {
        cb(err);
      });
    },

    _removeFile: (req, file, cb) => {
      // Delete from storage
      if (file.path) {
        storageService.deleteFile(file.path)
          .then(() => cb(null))
          .catch((err) => cb(err));
      } else {
        cb(null);
      }
    }
  };
}

module.exports = createStorageAdapter;


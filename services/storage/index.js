// Unified Storage Service - Works with both local filesystem and Azure Blob Storage
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const azureBlobService = require('./azure-blob');

const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'Production' || process.env.DB_TYPE === 'sqlserver';
const uploadsBasePath = path.join(__dirname, '..', '..', 'public', 'uploads');

/**
 * Unified Storage Service
 * Automatically uses Azure Blob Storage in production, filesystem in local development
 */
const storageService = {
  /**
   * Upload a file
   * @param {string} filePath - Relative path (e.g., 'profiles/profile-123.jpg' or 'chat/file.pdf')
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} contentType - MIME type
   * @returns {Promise<{success: boolean, url?: string, filePath?: string, error?: string}>}
   */
  uploadFile: async (filePath, fileBuffer, contentType) => {
    if (isProduction) {
      // Use Azure Blob Storage
      const result = await azureBlobService.uploadFile(filePath, fileBuffer, contentType);
      if (result.success) {
        return {
          success: true,
          url: result.url,
          filePath: filePath,
          // For production, return the blob URL or a path that will be served via SAS
          blobName: result.blobName
        };
      }
      return result;
    } else {
      // Use local filesystem
      try {
        const fullPath = path.join(uploadsBasePath, filePath);
        const dir = path.dirname(fullPath);
        
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(fullPath, fileBuffer);
        
        // Return relative URL path
        return {
          success: true,
          url: `/uploads/${filePath}`,
          filePath: filePath
        };
      } catch (error) {
        console.error('Local file upload error:', error);
        return { success: false, error: error.message };
      }
    }
  },

  /**
   * Download/read a file
   * @param {string} filePath - Relative path (e.g., 'profiles/profile-123.jpg')
   * @returns {Promise<{success: boolean, data?: Buffer, contentType?: string, error?: string}>}
   */
  getFile: async (filePath) => {
    if (isProduction) {
      // Use Azure Blob Storage
      return await azureBlobService.downloadFile(filePath);
    } else {
      // Use local filesystem
      try {
        const fullPath = path.join(uploadsBasePath, filePath);
        
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: 'File not found' };
        }

        const data = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        
        // Determine content type
        const contentTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.bmp': 'image/bmp',
          '.json': 'application/json'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';

        return {
          success: true,
          data: data,
          contentType: contentType
        };
      } catch (error) {
        console.error('Local file read error:', error);
        return { success: false, error: error.message };
      }
    }
  },

  /**
   * Delete a file
   * @param {string} filePath - Relative path
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteFile: async (filePath) => {
    if (isProduction) {
      // Use Azure Blob Storage
      return await azureBlobService.deleteFile(filePath);
    } else {
      // Use local filesystem
      try {
        const fullPath = path.join(uploadsBasePath, filePath);
        
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        return { success: true };
      } catch (error) {
        console.error('Local file delete error:', error);
        return { success: false, error: error.message };
      }
    }
  },

  /**
   * Get a URL to access a file (SAS URL for production, regular path for local)
   * @param {string} filePath - Relative path
   * @param {number} expiresInMinutes - For SAS URLs (production only)
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  getFileUrl: async (filePath, expiresInMinutes = 60) => {
    if (isProduction) {
      // Get SAS URL for private blobs
      return await azureBlobService.getSasUrl(filePath, expiresInMinutes);
    } else {
      // Return local path
      return {
        success: true,
        url: `/uploads/${filePath}`
      };
    }
  },

  /**
   * Check if a file exists
   * @param {string} filePath - Relative path
   * @returns {Promise<{success: boolean, exists?: boolean, error?: string}>}
   */
  fileExists: async (filePath) => {
    if (isProduction) {
      return await azureBlobService.blobExists(filePath);
    } else {
      try {
        const fullPath = path.join(uploadsBasePath, filePath);
        const exists = fs.existsSync(fullPath);
        return { success: true, exists };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },

  /**
   * Get the public URL for a file (for use in HTML/img tags)
   * In production, this may need to generate a SAS URL or use a CDN
   * @param {string} filePath - Relative path
   * @returns {string} - URL string
   */
  getPublicUrl: (filePath) => {
    if (isProduction) {
      // In production, you might want to use a CDN or public blob URL
      // For now, return a path that will be handled by the /uploads route
      // which will generate SAS URLs on demand
      return `/uploads/${filePath}`;
    } else {
      return `/uploads/${filePath}`;
    }
  }
};

module.exports = storageService;

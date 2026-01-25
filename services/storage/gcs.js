// Google Cloud Storage Service
// This is a placeholder for future Google Cloud Storage integration

const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

/**
 * Google Cloud Storage Service
 * 
 * To use this service:
 * 1. Install Google Cloud SDK: npm install @google-cloud/storage
 * 2. Configure environment variables:
 *    - GCS_PROJECT_ID
 *    - GCS_BUCKET_NAME
 *    - GOOGLE_APPLICATION_CREDENTIALS (path to service account key JSON)
 * 3. Implement the service methods below
 */

// Initialize storage client
// We wrap this in a try-catch or check to allow the app to start even if GCS is not configured
let storage;
let bucket;

try {
    if (process.env.GCS_PROJECT_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GCS_BUCKET_NAME) {
        storage = new Storage({
            projectId: process.env.GCS_PROJECT_ID,
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });
        bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    }
} catch (error) {
    console.warn('Google Cloud Storage initialization failed:', error.message);
}

const gcsService = {
    /**
     * Upload a file to Google Cloud Storage
     * @param {string} destination - The destination path in GCS
     * @param {Buffer} fileBuffer - The file content as a buffer
     * @param {string} contentType - The MIME type of the file
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    uploadFile: async (destination, fileBuffer, contentType) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }
        
        try {
            const file = bucket.file(destination);
            await file.save(fileBuffer, {
                metadata: { contentType: contentType }
            });
            const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${destination}`;
            return { success: true, url: publicUrl };
        } catch (error) {
            console.error('GCS upload error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Download a file from Google Cloud Storage
     * @param {string} filename - The file path in GCS
     * @returns {Promise<{success: boolean, data?: Buffer, error?: string}>}
     */
    downloadFile: async (filename) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const file = bucket.file(filename);
            const [data] = await file.download();
            return { success: true, data };
        } catch (error) {
            console.error('GCS download error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Delete a file from Google Cloud Storage
     * @param {string} filename - The file path in GCS
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    deleteFile: async (filename) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const file = bucket.file(filename);
            await file.delete();
            return { success: true };
        } catch (error) {
            console.error('GCS delete error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get a signed URL for temporary access to a private file
     * @param {string} filename - The file path in GCS
     * @param {number} expiresIn - URL expiration time in minutes (default: 60)
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    getSignedUrl: async (filename, expiresIn = 60) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const file = bucket.file(filename);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + expiresIn * 60 * 1000
            });
            return { success: true, url };
        } catch (error) {
            console.error('GCS signed URL error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * List files in a specific GCS prefix/folder
     * @param {string} prefix - The folder prefix to list
     * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
     */
    listFiles: async (prefix) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const [files] = await bucket.getFiles({ prefix });
            return { success: true, files: files.map(f => f.name) };
        } catch (error) {
            console.error('GCS list files error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Make a file publicly accessible
     * @param {string} filename - The file path in GCS
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    makePublic: async (filename) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const file = bucket.file(filename);
            await file.makePublic();

            // Construct the public URL
            // Format: https://storage.googleapis.com/BUCKET_NAME/FILE_PATH
            const url = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${filename}`;

            return { success: true, url };
        } catch (error) {
            console.error('GCS make public error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Set custom metadata for a file
     * @param {string} filename - The file path in GCS
     * @param {Object} metadata - Key-value pairs of metadata
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    setMetadata: async (filename, metadata) => {
        if (!bucket) {
            return { success: false, error: 'Google Cloud Storage is not configured' };
        }

        try {
            const file = bucket.file(filename);
            await file.setMetadata(metadata);
            return { success: true };
        } catch (error) {
            console.error('GCS set metadata error:', error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = gcsService;

// AWS S3 Storage Service

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const storageConfig = require('../../config/storage');

let s3Client = null;

const getClient = () => {
    if (!storageConfig.aws.enabled) {
        throw new Error('AWS S3 is not enabled');
    }

    if (!s3Client) {
        s3Client = new S3Client({
            region: storageConfig.aws.region,
            credentials: {
                accessKeyId: storageConfig.aws.accessKeyId,
                secretAccessKey: storageConfig.aws.secretAccessKey
            }
        });
    }
    return s3Client;
};

const s3Service = {
    /**
     * Upload a file to S3
     * @param {string} key - The file key/path in S3
     * @param {Buffer} fileBuffer - The file content as a buffer
     * @param {string} contentType - The MIME type of the file
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    uploadFile: async (key, fileBuffer, contentType) => {
        // TODO: Implement S3 upload logic
        return { success: false, error: 'S3 service not yet implemented' };
    },

    /**
     * Download a file from S3
     * @param {string} key - The file key/path in S3
     * @returns {Promise<{success: boolean, data?: Buffer, error?: string}>}
     */
    downloadFile: async (key) => {
        // TODO: Implement S3 download logic
        return { success: false, error: 'S3 service not yet implemented' };
    },

    /**
     * Delete a file from S3
     * @param {string} key - The file key/path in S3
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    deleteFile: async (key) => {
        try {
            if (!storageConfig.aws.enabled) {
                return { success: false, error: 'AWS S3 is not enabled' };
            }

            const client = getClient();
            const command = new DeleteObjectCommand({
                Bucket: storageConfig.aws.bucketName,
                Key: key
            });

            await client.send(command);
            return { success: true };
        } catch (error) {
            console.error('S3 Delete Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get a signed URL for temporary access to a private file
     * @param {string} key - The file key/path in S3
     * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    getSignedUrl: async (key, expiresIn = 3600) => {
        try {
            if (!config.aws.enabled || !s3Client) {
                return { success: false, error: 'AWS S3 is not configured' };
            }

            const command = new GetObjectCommand({
                Bucket: config.aws.bucketName,
                Key: key
            });

            const url = await getSignedUrl(s3Client, command, { expiresIn });
            return { success: true, url };
        } catch (error) {
            console.error('S3 Signed URL Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * List files in a specific S3 prefix/folder
     * @param {string} prefix - The folder prefix to list
     * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
     */
    listFiles: async (prefix) => {
        // TODO: Implement S3 list logic
        return { success: false, error: 'S3 service not yet implemented' };
    }
};

module.exports = s3Service;

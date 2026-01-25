// AWS S3 Storage Service
require('dotenv').config();
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * AWS S3 Storage Service
 * 
 * To use this service:
 * 1. Install AWS SDK: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 * 2. Configure environment variables:
 *    - AWS_ACCESS_KEY_ID
 *    - AWS_SECRET_ACCESS_KEY
 *    - AWS_REGION
 *    - AWS_S3_BUCKET_NAME
 */

let s3Client = null;

function initializeS3Client() {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        return null;
    }

    if (!s3Client) {
        const region = process.env.AWS_REGION || 'us-east-1';
        s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
    }
    return s3Client;
}

const s3Service = {
    /**
     * Upload a file to S3
     * @param {string} key - The file key/path in S3
     * @param {Buffer} fileBuffer - The file content as a buffer
     * @param {string} contentType - The MIME type of the file
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    uploadFile: async (key, fileBuffer, contentType) => {
        try {
            const client = initializeS3Client();
            if (!client) {
                return { success: false, error: 'AWS S3 credentials not configured' };
            }

            const bucketName = process.env.AWS_S3_BUCKET_NAME;
            if (!bucketName) {
                return { success: false, error: 'AWS S3 bucket name not configured' };
            }

            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType
            });

            await client.send(command);

            // Construct public URL (assuming bucket is public or handled via CDN)
            // For private buckets, getSignedUrl should be used
            const region = process.env.AWS_REGION || 'us-east-1';
            const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

            return { success: true, url };
        } catch (error) {
            console.error('S3 upload error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Download a file from S3
     * @param {string} key - The file key/path in S3
     * @returns {Promise<{success: boolean, data?: Buffer, error?: string}>}
     */
    downloadFile: async (key) => {
        try {
            const client = initializeS3Client();
            if (!client) {
                return { success: false, error: 'AWS S3 credentials not configured' };
            }

            const bucketName = process.env.AWS_S3_BUCKET_NAME;
            if (!bucketName) {
                return { success: false, error: 'AWS S3 bucket name not configured' };
            }

            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const response = await client.send(command);
            const byteArray = await response.Body.transformToByteArray();
            const buffer = Buffer.from(byteArray);

            return { success: true, data: buffer };
        } catch (error) {
            console.error('S3 download error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Delete a file from S3
     * @param {string} key - The file key/path in S3
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    deleteFile: async (key) => {
        try {
            const client = initializeS3Client();
            if (!client) {
                return { success: false, error: 'AWS S3 credentials not configured' };
            }

            const bucketName = process.env.AWS_S3_BUCKET_NAME;
            if (!bucketName) {
                return { success: false, error: 'AWS S3 bucket name not configured' };
            }

            const command = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            await client.send(command);
            return { success: true };
        } catch (error) {
            console.error('S3 delete error:', error);
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
            const client = initializeS3Client();
            if (!client) {
                return { success: false, error: 'AWS S3 credentials not configured' };
            }

            const bucketName = process.env.AWS_S3_BUCKET_NAME;
            if (!bucketName) {
                return { success: false, error: 'AWS S3 bucket name not configured' };
            }

            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const url = await getSignedUrl(client, command, { expiresIn });
            return { success: true, url };
        } catch (error) {
            console.error('S3 signed URL error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * List files in a specific S3 prefix/folder
     * @param {string} prefix - The folder prefix to list
     * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
     */
    listFiles: async (prefix) => {
        try {
            const client = initializeS3Client();
            if (!client) {
                return { success: false, error: 'AWS S3 credentials not configured' };
            }

            const bucketName = process.env.AWS_S3_BUCKET_NAME;
            if (!bucketName) {
                return { success: false, error: 'AWS S3 bucket name not configured' };
            }

            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix
            });

            const response = await client.send(command);

            const files = (response.Contents || []).map(item => ({
                key: item.Key,
                size: item.Size,
                lastModified: item.LastModified,
                eTag: item.ETag
            }));

            return { success: true, files };
        } catch (error) {
            console.error('S3 list files error:', error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = s3Service;

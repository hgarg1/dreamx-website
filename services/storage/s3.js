// AWS S3 Storage Service
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const storageConfig = require('../../config/storage');

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

// Initialize S3 Client
const s3Client = new S3Client({
    region: storageConfig.aws.region,
    credentials: {
        accessKeyId: storageConfig.aws.accessKeyId,
        secretAccessKey: storageConfig.aws.secretAccessKey
    }
});

const bucketName = storageConfig.aws.bucketName;

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
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType
            });

            await s3Client.send(command);

            // Construct the public URL (assuming public read access or standard S3 URL structure)
            // Note: If the bucket is private, this URL might not be accessible without signing
            const url = `https://${bucketName}.s3.${storageConfig.aws.region}.amazonaws.com/${key}`;

            return { success: true, url };
        } catch (error) {
            console.error('S3 Upload Error:', error);
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
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const response = await s3Client.send(command);

            // Convert stream to buffer
            const streamToBuffer = (stream) =>
                new Promise((resolve, reject) => {
                    const chunks = [];
                    stream.on("data", (chunk) => chunks.push(chunk));
                    stream.on("error", reject);
                    stream.on("end", () => resolve(Buffer.concat(chunks)));
                });

            const data = await streamToBuffer(response.Body);
            return { success: true, data };
        } catch (error) {
            console.error('S3 Download Error:', error);
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
            const command = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            await s3Client.send(command);
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
            const command = new GetObjectCommand({
                Bucket: bucketName,
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
        try {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix
            });

            const response = await s3Client.send(command);
            const files = response.Contents ? response.Contents.map(file => ({
                key: file.Key,
                lastModified: file.LastModified,
                size: file.Size,
                etag: file.ETag
            })) : [];

            return { success: true, files };
        } catch (error) {
            console.error('S3 List Files Error:', error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = s3Service;

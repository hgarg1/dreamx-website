const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Mock dependencies
jest.mock('@aws-sdk/client-s3');
jest.mock('../config/storage', () => ({
  aws: {
    enabled: true,
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    region: 'us-east-1',
    bucketName: 'test-bucket'
  }
}));

// Import service after mocks
const s3Service = require('../services/storage/s3');
const storageConfig = require('../config/storage');

describe('S3 Service - deleteFile', () => {
    let sendMock;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup S3Client.send mock
        sendMock = jest.fn();
        S3Client.prototype.send = sendMock;

        // Reset config to enabled by default
        storageConfig.aws.enabled = true;
    });

    it('should successfully delete a file when AWS is enabled', async () => {
        sendMock.mockResolvedValue({});

        const result = await s3Service.deleteFile('test-file.jpg');

        // Verify Client Initialization
        expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
            region: 'us-east-1',
            credentials: {
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key'
            }
        }));

        // Verify Command Creation
        expect(DeleteObjectCommand).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Key: 'test-file.jpg'
        });

        // Verify Command Sent
        expect(sendMock).toHaveBeenCalledTimes(1);

        // Verify Result
        expect(result).toEqual({ success: true });
    });

    it('should return error if AWS is disabled', async () => {
        storageConfig.aws.enabled = false;

        const result = await s3Service.deleteFile('test-file.jpg');

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not enabled/i);
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('should handle S3 errors gracefully', async () => {
        const errorMessage = 'Network error';
        sendMock.mockRejectedValue(new Error(errorMessage));

        const result = await s3Service.deleteFile('test-file.jpg');

        expect(result.success).toBe(false);
        expect(result.error).toBe(errorMessage);
    });
});

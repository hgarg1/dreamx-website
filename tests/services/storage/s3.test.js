const s3Service = require('../../../services/storage/s3');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// Mock dependencies
jest.mock('@aws-sdk/client-s3');
jest.mock('../../../config/storage', () => ({
    aws: {
        enabled: true,
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'test-bucket'
    }
}));

describe('S3 Storage Service', () => {
    let mockSend;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Mock S3Client send method
        mockSend = jest.fn();
        S3Client.prototype.send = mockSend;
    });

    describe('downloadFile', () => {
        it('should download a file successfully', async () => {
            const key = 'test-file.txt';
            const fileContent = 'Hello World';

            // Create a readable stream mock
            const { Readable } = require('stream');
            const mockStream = new Readable();
            mockStream.push(fileContent);
            mockStream.push(null); // End of stream

            mockSend.mockResolvedValue({
                Body: mockStream
            });

            const result = await s3Service.downloadFile(key);

            expect(result.success).toBe(true);
            expect(result.data).toBeInstanceOf(Buffer);
            expect(result.data.toString()).toBe(fileContent);
            expect(GetObjectCommand).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: key
            });
        });

        it('should handle errors gracefully', async () => {
            const key = 'non-existent-file.txt';
            const errorMessage = 'The specified key does not exist.';

            mockSend.mockRejectedValue(new Error(errorMessage));

            const result = await s3Service.downloadFile(key);

            expect(result.success).toBe(false);
            expect(result.error).toBe(errorMessage);
        });
    });
});

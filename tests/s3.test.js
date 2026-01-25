
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Service = require('../services/storage/s3');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3 Storage Service', () => {
    let mockSend;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Setup environment variables
        process.env.AWS_ACCESS_KEY_ID = 'test-key';
        process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
        process.env.AWS_REGION = 'us-east-1';
        process.env.AWS_S3_BUCKET_NAME = 'test-bucket';

        // Mock S3Client send method
        mockSend = jest.fn();
        S3Client.prototype.send = mockSend;
    });

    afterEach(() => {
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_REGION;
        delete process.env.AWS_S3_BUCKET_NAME;
    });

    describe('listFiles', () => {
        it('should list files successfully', async () => {
            const mockFiles = [
                { Key: 'folder/file1.txt', Size: 1024, LastModified: new Date(), ETag: 'hash1' },
                { Key: 'folder/file2.jpg', Size: 2048, LastModified: new Date(), ETag: 'hash2' }
            ];

            mockSend.mockResolvedValue({
                Contents: mockFiles
            });

            const result = await s3Service.listFiles('folder/');

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(2);
            expect(result.files[0].key).toBe('folder/file1.txt');
            expect(result.files[1].key).toBe('folder/file2.jpg');

            expect(S3Client).toHaveBeenCalledWith({
                region: 'us-east-1',
                credentials: {
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret'
                }
            });

            // Check if ListObjectsV2Command was instantiated with correct params
            // Note: Since we're mocking the class, checking the instance is a bit tricky
            // but we can check if the mock constructor was called
            expect(ListObjectsV2Command).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Prefix: 'folder/'
            });
        });

        it('should handle empty list', async () => {
            mockSend.mockResolvedValue({
                Contents: []
            });

            const result = await s3Service.listFiles('empty/');

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(0);
        });

        it('should handle errors', async () => {
            mockSend.mockRejectedValue(new Error('S3 Error'));

            const result = await s3Service.listFiles('folder/');

            expect(result.success).toBe(false);
            expect(result.error).toBe('S3 Error');
        });
    });

    describe('uploadFile', () => {
        it('should upload file successfully', async () => {
            mockSend.mockResolvedValue({});

            const result = await s3Service.uploadFile('test.txt', Buffer.from('content'), 'text/plain');

            expect(result.success).toBe(true);
            expect(result.url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test.txt');

            expect(PutObjectCommand).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'test.txt',
                Body: expect.any(Buffer),
                ContentType: 'text/plain'
            });
        });

        it('should handle upload errors', async () => {
            mockSend.mockRejectedValue(new Error('Upload Failed'));

            const result = await s3Service.uploadFile('test.txt', Buffer.from('content'), 'text/plain');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Upload Failed');
        });
    });

    describe('downloadFile', () => {
        it('should download file successfully', async () => {
            const mockBuffer = Buffer.from('file content');

            // Mock transformToByteArray for Body
            const mockBody = {
                transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array(mockBuffer))
            };

            mockSend.mockResolvedValue({
                Body: mockBody
            });

            const result = await s3Service.downloadFile('test.txt');

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockBuffer);

            expect(GetObjectCommand).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'test.txt'
            });
        });
    });

    describe('deleteFile', () => {
        it('should delete file successfully', async () => {
            mockSend.mockResolvedValue({});

            const result = await s3Service.deleteFile('test.txt');

            expect(result.success).toBe(true);

            expect(DeleteObjectCommand).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'test.txt'
            });
        });
    });

    describe('getSignedUrl', () => {
        it('should return signed url', async () => {
            getSignedUrl.mockResolvedValue('https://signed-url.com');

            const result = await s3Service.getSignedUrl('test.txt');

            expect(result.success).toBe(true);
            expect(result.url).toBe('https://signed-url.com');

            expect(getSignedUrl).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should fail if credentials are missing', async () => {
            delete process.env.AWS_ACCESS_KEY_ID;

            // Reset client singleton by re-requiring or we need a way to reset it
            // Since module caching might prevent resetting the internal client variable
            // But initializeS3Client checks env vars every time if client is null.
            // However, the previous tests might have set s3Client.
            // We can't easily reset module-level variable `s3Client` without reloading the module.

            // To properly test this, we should isolate the module.
            // Jest's isolateModules might help.

            let s3ServiceIsolated;
            jest.isolateModules(() => {
                delete process.env.AWS_ACCESS_KEY_ID;
                s3ServiceIsolated = require('../services/storage/s3');
            });

            const result = await s3ServiceIsolated.listFiles('folder/');
            expect(result.success).toBe(false);
            expect(result.error).toBe('AWS S3 credentials not configured');
        });
    });
});

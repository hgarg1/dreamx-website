const s3Service = require('../services/storage/s3');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config/storage');

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('../config/storage', () => ({
    aws: {
        enabled: true,
        region: 'us-east-1',
        bucketName: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
    }
}));

describe('S3 Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getSignedUrl', () => {
        it('should generate a signed URL successfully', async () => {
            const mockSignedUrl = 'https://s3.amazonaws.com/test-bucket/test-key?signature=xyz';
            getSignedUrl.mockResolvedValue(mockSignedUrl);

            const result = await s3Service.getSignedUrl('test-key');

            expect(result.success).toBe(true);
            expect(result.url).toBe(mockSignedUrl);
            // S3Client is initialized at module load, and clearAllMocks() in beforeEach wipes the history
            // expect(S3Client).toHaveBeenCalled();
            expect(GetObjectCommand).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'test-key'
            });
            expect(getSignedUrl).toHaveBeenCalled();
        });

        it('should handle errors when generating signed URL', async () => {
            getSignedUrl.mockRejectedValue(new Error('AWS Error'));

            // We need to reset the module to test error handling if the client initialization is cached,
            // but for now let's assume getSignedUrl failure.

            const result = await s3Service.getSignedUrl('test-key');

            expect(result.success).toBe(false);
            expect(result.error).toBe('AWS Error');
        });

        it('should use default expiration time if not provided', async () => {
            getSignedUrl.mockResolvedValue('url');

            await s3Service.getSignedUrl('test-key');

            expect(getSignedUrl).toHaveBeenCalledWith(
                expect.any(Object), // client
                expect.any(Object), // command
                { expiresIn: 3600 }
            );
        });

        it('should use provided expiration time', async () => {
            getSignedUrl.mockResolvedValue('url');

            await s3Service.getSignedUrl('test-key', 60);

            expect(getSignedUrl).toHaveBeenCalledWith(
                expect.any(Object), // client
                expect.any(Object), // command
                { expiresIn: 60 }
            );
        });
    });
});

// Define mocks globally so they are accessible in jest.mock factory
const mockGetSignedUrl = jest.fn();
const mockFile = {
    getSignedUrl: mockGetSignedUrl
};
const mockBucket = {
    file: jest.fn().mockReturnValue(mockFile)
};
const mockStorage = {
    bucket: jest.fn().mockReturnValue(mockBucket)
};
// The constructor mock
const MockStorageConstructor = jest.fn(() => mockStorage);

jest.mock('@google-cloud/storage', () => ({
    Storage: MockStorageConstructor
}));

jest.mock('../../../config/storage', () => ({
    gcs: {
        projectId: 'test-project',
        keyFilename: 'test-creds.json',
        bucketName: 'test-bucket',
        enabled: true
    }
}));

const gcsService = require('../../../services/storage/gcs');

describe('GCS Storage Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset specific behaviors if needed, though defaults are set above
        mockGetSignedUrl.mockResolvedValue(['https://signed-url.com/file']);
        mockBucket.file.mockReturnValue(mockFile);
        mockStorage.bucket.mockReturnValue(mockBucket);
        MockStorageConstructor.mockReturnValue(mockStorage);
    });

    describe('getSignedUrl', () => {
        it('should generate a signed URL successfully', async () => {
            const filename = 'test-file.jpg';
            const expiresIn = 30;

            const result = await gcsService.getSignedUrl(filename, expiresIn);

            expect(result.success).toBe(true);
            expect(result.url).toBe('https://signed-url.com/file');

            // Verify bucket and file access
            expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
            expect(mockBucket.file).toHaveBeenCalledWith(filename);

            // Verify getSignedUrl call
            expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
                action: 'read',
                expires: expect.any(Number)
            }));

            // Check expiration roughly
            const callArg = mockGetSignedUrl.mock.calls[0][0];
            const now = Date.now();
            const expectedExpiration = now + expiresIn * 60 * 1000;
            // Allow some wiggle room
            expect(Math.abs(callArg.expires - expectedExpiration)).toBeLessThan(5000);
        });

        it('should handle errors during signed URL generation', async () => {
            const filename = 'test-file.jpg';
            const errorMsg = 'GCS Error';

            mockGetSignedUrl.mockRejectedValue(new Error(errorMsg));

            const result = await gcsService.getSignedUrl(filename);

            expect(result.success).toBe(false);
            expect(result.error).toBe(errorMsg);
        });

         it('should use default expiration if not provided', async () => {
            const filename = 'test-file.jpg';

            // Reset to success
            mockGetSignedUrl.mockResolvedValue(['https://signed-url.com/file']);

            await gcsService.getSignedUrl(filename);

            const callArg = mockGetSignedUrl.mock.calls[0][0];
            const now = Date.now();
            // Default is 60 minutes
            const expectedExpiration = now + 60 * 60 * 1000;
             expect(Math.abs(callArg.expires - expectedExpiration)).toBeLessThan(5000);
        });
    });
});

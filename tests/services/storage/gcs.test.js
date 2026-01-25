// tests/services/storage/gcs.test.js

const gcsService = require('../../../services/storage/gcs');
const { Storage } = require('@google-cloud/storage');

// Mock @google-cloud/storage
jest.mock('@google-cloud/storage');

describe('GCS Service - setMetadata', () => {
    let mockStorage;
    let mockBucket;
    let mockFile;
    // Store original env
    const originalEnv = process.env;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Reset process.env
        process.env = { ...originalEnv };

        // Setup mock implementations
        mockFile = {
            setMetadata: jest.fn().mockResolvedValue([{}]), // GCS returns [metadata, apiResponse]
        };

        mockBucket = {
            file: jest.fn().mockReturnValue(mockFile),
        };

        mockStorage = {
            bucket: jest.fn().mockReturnValue(mockBucket),
        };

        Storage.mockImplementation(() => mockStorage);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should fail if bucket is not configured', async () => {
        // Ensure env var is not set
        delete process.env.GCS_BUCKET_NAME;

        // We need to reset the module state or ensure initializeStorageClient re-checks env
        // Since initializeStorageClient uses a closure variable `storage`, it's singleton-like.
        // But in test environment, we might need to handle that.
        // However, gcs.js exports an object, and `initializeStorageClient` is internal but called on every method.
        // The issue is `storage` and `bucket` are module-level variables.
        // If they are initialized once, they persist.
        // I need to reload the module or make sure `initializeStorageClient` can re-initialize if needed,
        // OR simply test that if I create a fresh environment it works.
        // Given the current implementation of `gcs.js`, once `storage` is set, it returns it.
        // So I should reset the module registry to ensure a fresh instance for each test if I want to test initialization logic.

        jest.resetModules();
        const gcsServiceFresh = require('../../../services/storage/gcs');

        const result = await gcsServiceFresh.setMetadata('test-file.jpg', { custom: 'data' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GCS bucket not configured');
    });

    it('should set metadata successfully when configured', async () => {
        jest.resetModules();
        const { Storage } = require('@google-cloud/storage');
        // Re-apply mock since resetModules clears it? No, jest.mock is hoisted but resetModules clears the cache.
        // I need to re-mock or ensure the mock persists.

        // Let's rely on the fact that I can set env vars BEFORE the module is loaded/initialized.

        process.env.GCS_BUCKET_NAME = 'test-bucket';
        process.env.GCS_PROJECT_ID = 'test-project';

        // Mock implementation needs to be set again if modules are reset?
        // actually `jest.mock` is factory.

        // Let's redefine mocks here to be safe
        mockFile = {
            setMetadata: jest.fn().mockResolvedValue([{}]),
        };
        mockBucket = {
            file: jest.fn().mockReturnValue(mockFile),
        };
        mockStorage = {
            bucket: jest.fn().mockReturnValue(mockBucket),
        };
        Storage.mockImplementation(() => mockStorage);

        const gcsServiceFresh = require('../../../services/storage/gcs');

        const metadata = { uploadedBy: 'user123', type: 'profile' };
        const result = await gcsServiceFresh.setMetadata('test-file.jpg', metadata);

        expect(result.success).toBe(true);
        expect(Storage).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'test-project'
        }));
        expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
        expect(mockBucket.file).toHaveBeenCalledWith('test-file.jpg');
        expect(mockFile.setMetadata).toHaveBeenCalledWith({
            metadata: metadata
        });
    });

    it('should handle errors from GCS', async () => {
        jest.resetModules();
        const { Storage } = require('@google-cloud/storage');
        process.env.GCS_BUCKET_NAME = 'test-bucket';

        mockFile = {
            setMetadata: jest.fn().mockRejectedValue(new Error('API Error')),
        };
        mockBucket = {
            file: jest.fn().mockReturnValue(mockFile),
        };
        mockStorage = {
            bucket: jest.fn().mockReturnValue(mockBucket),
        };
        Storage.mockImplementation(() => mockStorage);

        const gcsServiceFresh = require('../../../services/storage/gcs');

        const result = await gcsServiceFresh.setMetadata('test-file.jpg', {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('API Error');
    });
});

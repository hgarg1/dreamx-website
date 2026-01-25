
// Mock config
jest.mock('../config/storage', () => ({
    gcs: {
        projectId: 'test-project',
        bucketName: 'test-bucket',
        keyFilename: 'test-key.json',
        enabled: true
    }
}));

// Mock @google-cloud/storage
jest.mock('@google-cloud/storage', () => ({
    Storage: jest.fn()
}));

const { Storage } = require('@google-cloud/storage');
const gcsService = require('../services/storage/gcs');

describe('GCS Service - deleteFile', () => {
    // Define spies once to maintain references across tests (handling gcsService caching)
    const mockDelete = jest.fn();
    const mockExists = jest.fn();
    const mockFile = jest.fn();
    const mockBucket = jest.fn();

    beforeAll(() => {
        // Setup initial structure so when gcsService initializes, it captures these spies
        mockBucket.mockReturnValue({ file: mockFile });
        Storage.mockImplementation(() => ({ bucket: mockBucket }));
    });

    beforeEach(() => {
        // Restore implementations because resetMocks: true clears them
        mockDelete.mockResolvedValue([{}]);
        mockExists.mockResolvedValue([true]);

        // Re-link the chain
        mockFile.mockReturnValue({
            delete: mockDelete,
            exists: mockExists
        });

        mockBucket.mockReturnValue({
            file: mockFile
        });

        Storage.mockImplementation(() => ({
            bucket: mockBucket
        }));
    });

    test('should successfully delete a file', async () => {
        const result = await gcsService.deleteFile('test-file.jpg');

        expect(result.success).toBe(true);
        expect(mockBucket).toHaveBeenCalledWith('test-bucket');
        expect(mockFile).toHaveBeenCalledWith('test-file.jpg');
        expect(mockExists).toHaveBeenCalled();
        expect(mockDelete).toHaveBeenCalled();
    });

    test('should return error if file does not exist', async () => {
        mockExists.mockResolvedValueOnce([false]);

        const result = await gcsService.deleteFile('non-existent.jpg');

        expect(result.success).toBe(false);
        expect(result.error).toBe('File not found');
        expect(mockDelete).not.toHaveBeenCalled();
    });

    test('should handle delete errors', async () => {
        mockDelete.mockRejectedValueOnce(new Error('Delete failed'));

        const result = await gcsService.deleteFile('error-file.jpg');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Delete failed');
    });
});

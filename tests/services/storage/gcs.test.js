
const { Storage } = require('@google-cloud/storage');

jest.mock('@google-cloud/storage');

// Mock objects
const mockFile = {
    makePublic: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    download: jest.fn(),
    getSignedUrl: jest.fn(),
    setMetadata: jest.fn()
};

const mockBucket = {
    file: jest.fn().mockReturnValue(mockFile),
    getFiles: jest.fn()
};

const mockStorageInstance = {
    bucket: jest.fn().mockReturnValue(mockBucket)
};

// Setup mock implementation
Storage.mockImplementation(() => mockStorageInstance);

// Set env vars before require to ensure initialization happens
process.env.GCS_PROJECT_ID = 'test-project';
process.env.GCS_BUCKET_NAME = 'test-bucket';
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test-creds.json';

// Require service after mocks and env vars are set
const gcsService = require('../../../services/storage/gcs');

describe('GCS Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset default mock returns
        mockFile.makePublic.mockResolvedValue(undefined);
        mockBucket.file.mockReturnValue(mockFile);
        mockStorageInstance.bucket.mockReturnValue(mockBucket);
    });

    describe('makePublic', () => {
        it('should make a file public and return the URL', async () => {
            const filename = 'test-file.jpg';
            const expectedUrl = `https://storage.googleapis.com/test-bucket/${filename}`;

            const result = await gcsService.makePublic(filename);

            expect(mockBucket.file).toHaveBeenCalledWith(filename);
            expect(mockFile.makePublic).toHaveBeenCalled();
            expect(result).toEqual({ success: true, url: expectedUrl });
        });

        it('should handle errors', async () => {
            const error = new Error('GCS Error');
            mockFile.makePublic.mockRejectedValue(error);

            const result = await gcsService.makePublic('test.jpg');

            expect(result).toEqual({ success: false, error: 'GCS Error' });
        });
    });
});

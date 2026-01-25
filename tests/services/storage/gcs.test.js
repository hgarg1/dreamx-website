
jest.mock('@google-cloud/storage');

describe('GCS Service', () => {
    let gcsService;
    let mockBucket;
    let mockGetFiles;
    let Storage; // Define Storage here

    beforeEach(() => {
        jest.resetModules(); // Clear module cache
        jest.clearAllMocks();

        // Require Storage again to get the fresh mock associated with the current module registry
        Storage = require('@google-cloud/storage').Storage;

        mockGetFiles = jest.fn();
        mockBucket = {
            getFiles: mockGetFiles,
            name: 'test-bucket'
        };

        // Configure the mock
        Storage.mockImplementation(() => ({
            bucket: () => mockBucket
        }));

        process.env.GCS_PROJECT_ID = 'test-project';
        process.env.GCS_BUCKET_NAME = 'test-bucket';
        process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test-creds.json';

        // Require the service under test
        gcsService = require('../../../services/storage/gcs');
    });

    afterEach(() => {
        delete process.env.GCS_PROJECT_ID;
        delete process.env.GCS_BUCKET_NAME;
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    });

    describe('listFiles', () => {
        it('should list files successfully', async () => {
            const mockFiles = [
                {
                    name: 'folder/file1.txt',
                    metadata: {
                        size: '1024',
                        contentType: 'text/plain',
                        updated: '2023-01-01T00:00:00.000Z'
                    }
                },
                {
                    name: 'folder/file2.jpg',
                    metadata: {
                        size: '2048',
                        contentType: 'image/jpeg',
                        updated: '2023-01-02T00:00:00.000Z'
                    }
                }
            ];

            mockGetFiles.mockResolvedValue([mockFiles]);

            const result = await gcsService.listFiles('folder/');

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(2);
            expect(result.files[0]).toEqual({
                name: 'folder/file1.txt',
                size: 1024,
                contentType: 'text/plain',
                updated: '2023-01-01T00:00:00.000Z'
            });
            expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'folder/' });
        });

        it('should handle errors gracefully', async () => {
            mockGetFiles.mockRejectedValue(new Error('API Error'));

            const result = await gcsService.listFiles('folder/');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API Error');
        });

        it('should return error if configuration is missing', async () => {
            jest.resetModules();
            delete process.env.GCS_PROJECT_ID;
            const freshGcsService = require('../../../services/storage/gcs');

            const result = await freshGcsService.listFiles('folder/');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Google Cloud Storage not configured');
        });
    });
});

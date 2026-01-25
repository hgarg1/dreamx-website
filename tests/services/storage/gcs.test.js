const { Storage } = require('@google-cloud/storage');

// Mock dependencies before importing the service
jest.mock('@google-cloud/storage');
jest.mock('../../../config/storage', () => ({
    gcs: {
        projectId: 'test-project',
        bucketName: 'test-bucket',
        keyFilename: 'test-key.json',
        enabled: true
    }
}));

const gcsService = require('../../../services/storage/gcs');

describe('GCS Service', () => {
    let mockBucket;
    let mockFile;

    beforeEach(() => {
        jest.clearAllMocks();

        mockFile = {
            download: jest.fn().mockResolvedValue([Buffer.from('test data')])
        };
        mockBucket = {
            file: jest.fn().mockReturnValue(mockFile)
        };

        Storage.mockImplementation(() => ({
            bucket: jest.fn().mockReturnValue(mockBucket)
        }));
    });

    describe('downloadFile', () => {
        it('should download a file successfully', async () => {
            const result = await gcsService.downloadFile('test-file.txt');

            expect(Storage).toHaveBeenCalledWith(expect.objectContaining({
                projectId: 'test-project',
                keyFilename: 'test-key.json'
            }));

            expect(mockBucket.file).toHaveBeenCalledWith('test-file.txt');
            expect(mockFile.download).toHaveBeenCalled();
            expect(result).toEqual({
                success: true,
                data: expect.any(Buffer)
            });
            expect(result.data.toString()).toBe('test data');
        });

        it('should handle download errors', async () => {
            // Use isolateModules to ensure clean require and mock state
            // Note: isolateModules is not async-aware by itself regarding the callback, but we can return the promise.
            // But we can't await inside isolateModules easily if we need the require to happen there.
            // Actually, we can just require inside.

            await jest.isolateModules(async () => {
                const { Storage } = require('@google-cloud/storage');
                const localMockFile = {
                    download: jest.fn().mockRejectedValue(new Error('Download failed'))
                };
                const localMockBucket = {
                    file: jest.fn().mockReturnValue(localMockFile)
                };
                Storage.mockImplementation(() => ({
                    bucket: jest.fn().mockReturnValue(localMockBucket)
                }));

                const localGcsService = require('../../../services/storage/gcs');
                const result = await localGcsService.downloadFile('test-file.txt');

                expect(result).toEqual({
                    success: false,
                    error: 'Download failed'
                });
            });
        });
    });
});

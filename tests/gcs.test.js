const gcsService = require('../services/storage/gcs');
const { Storage } = require('@google-cloud/storage');

jest.mock('@google-cloud/storage');

describe('GCS Service', () => {
    const originalEnv = process.env;
    let mockSave, mockDownload, mockDelete, mockGetSignedUrl, mockGetFiles, mockMakePublic, mockSetMetadata;
    let mockFileObj, mockBucketObj;
    let mockBucketFn;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.GCS_PROJECT_ID = 'test-project';
        process.env.GCS_BUCKET_NAME = 'test-bucket';
        process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test-creds.json';

        // Setup mock functions
        mockSave = jest.fn().mockResolvedValue(undefined);
        mockDownload = jest.fn().mockResolvedValue([Buffer.from('test content')]);
        mockDelete = jest.fn().mockResolvedValue(undefined);
        mockGetSignedUrl = jest.fn().mockResolvedValue(['https://signed-url']);
        mockGetFiles = jest.fn().mockResolvedValue([
            [
                {
                    name: 'file1.jpg',
                    metadata: {
                        size: '1024',
                        updated: '2023-01-01T00:00:00.000Z',
                        contentType: 'image/jpeg'
                    }
                }
            ]
        ]);
        mockMakePublic = jest.fn().mockResolvedValue(undefined);
        mockSetMetadata = jest.fn().mockResolvedValue(undefined);

        // Setup mock objects
        mockFileObj = {
            save: mockSave,
            download: mockDownload,
            delete: mockDelete,
            getSignedUrl: mockGetSignedUrl,
            makePublic: mockMakePublic,
            setMetadata: mockSetMetadata
        };

        mockBucketObj = {
            file: jest.fn().mockReturnValue(mockFileObj),
            getFiles: mockGetFiles
        };

        mockBucketFn = jest.fn().mockReturnValue(mockBucketObj);

        // Configure Storage mock implementation
        Storage.mockImplementation(() => ({
            bucket: mockBucketFn
        }));
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('uploadFile should upload file and return url', async () => {
        const destination = 'uploads/test.jpg';
        const fileBuffer = Buffer.from('test data');
        const contentType = 'image/jpeg';

        const result = await gcsService.uploadFile(destination, fileBuffer, contentType);

        expect(Storage).toHaveBeenCalledWith({
            projectId: 'test-project',
            keyFilename: 'test-creds.json'
        });

        expect(mockBucketFn).toHaveBeenCalledWith('test-bucket');
        expect(mockBucketObj.file).toHaveBeenCalledWith(destination);
        expect(mockSave).toHaveBeenCalledWith(fileBuffer, {
            metadata: { contentType: contentType },
            resumable: false
        });
        expect(result).toEqual({
            success: true,
            url: `https://storage.googleapis.com/test-bucket/${destination}`
        });
    });

    test('uploadFile should return error if config missing', async () => {
        delete process.env.GCS_PROJECT_ID;
        const result = await gcsService.uploadFile('dest', Buffer.from(''), 'type');
        expect(result.success).toBe(false);
        expect(result.error).toBe('GCS configuration missing');
    });

    test('downloadFile should return file content', async () => {
        const result = await gcsService.downloadFile('test.jpg');
        expect(mockDownload).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data).toEqual(Buffer.from('test content'));
    });

    test('deleteFile should delete file', async () => {
        const result = await gcsService.deleteFile('test.jpg');
        expect(mockDelete).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    test('getSignedUrl should return url', async () => {
        const result = await gcsService.getSignedUrl('test.jpg');
        expect(mockGetSignedUrl).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.url).toBe('https://signed-url');
    });
});

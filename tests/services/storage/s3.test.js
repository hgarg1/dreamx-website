const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Mock dependencies before requiring the service
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
    return {
        S3Client: jest.fn(() => ({
            send: mockSend
        })),
        PutObjectCommand: jest.fn(),
        GetObjectCommand: jest.fn(),
        DeleteObjectCommand: jest.fn(),
        ListObjectsV2Command: jest.fn()
    };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn()
}));

jest.mock('../../../config/storage', () => ({
  aws: {
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucketName: 'test-bucket'
  }
}));

const s3Service = require('../../../services/storage/s3');

describe('S3 Storage Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSend.mockReset();
    });

    test('uploadFile should upload file to S3', async () => {
        const key = 'test.jpg';
        const buffer = Buffer.from('test content');
        const contentType = 'image/jpeg';

        mockSend.mockResolvedValue({});

        const result = await s3Service.uploadFile(key, buffer, contentType);

        expect(result.success).toBe(true);
        expect(result.url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test.jpg');
        expect(PutObjectCommand).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Key: key,
            Body: buffer,
            ContentType: contentType
        });
        expect(mockSend).toHaveBeenCalled();
    });

    test('downloadFile should download file from S3', async () => {
        const key = 'test.txt';
        const fileContent = 'file content';

        // Mock stream for Body
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(fileContent);
        stream.push(null);

        mockSend.mockResolvedValue({
            Body: stream
        });

        const result = await s3Service.downloadFile(key);

        expect(result.success).toBe(true);
        expect(result.data.toString()).toBe(fileContent);
        expect(GetObjectCommand).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Key: key
        });
        expect(mockSend).toHaveBeenCalled();
    });

    test('deleteFile should delete file from S3', async () => {
        const key = 'test.jpg';

        mockSend.mockResolvedValue({});

        const result = await s3Service.deleteFile(key);

        expect(result.success).toBe(true);
        expect(DeleteObjectCommand).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Key: key
        });
        expect(mockSend).toHaveBeenCalled();
    });

    test('getSignedUrl should return signed url', async () => {
        const key = 'test.jpg';
        const signedUrl = 'https://signed-url.com';

        getSignedUrl.mockResolvedValue(signedUrl);

        const result = await s3Service.getSignedUrl(key);

        expect(result.success).toBe(true);
        expect(result.url).toBe(signedUrl);
        expect(GetObjectCommand).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Key: key
        });
        expect(getSignedUrl).toHaveBeenCalled();
    });

    test('listFiles should list files from S3', async () => {
        const prefix = 'folder/';
        const mockContents = [
            { Key: 'folder/file1.jpg', Size: 100, LastModified: new Date(), ETag: 'etag1' },
            { Key: 'folder/file2.jpg', Size: 200, LastModified: new Date(), ETag: 'etag2' }
        ];

        mockSend.mockResolvedValue({
            Contents: mockContents
        });

        const result = await s3Service.listFiles(prefix);

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(2);
        expect(result.files[0].key).toBe('folder/file1.jpg');
        expect(ListObjectsV2Command).toHaveBeenCalledWith({
            Bucket: 'test-bucket',
            Prefix: prefix
        });
        expect(mockSend).toHaveBeenCalled();
    });

    test('uploadFile handles errors', async () => {
        const key = 'test.jpg';
        mockSend.mockRejectedValue(new Error('Upload failed'));

        const result = await s3Service.uploadFile(key, Buffer.from(''), 'image/jpeg');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Upload failed');
    });
});

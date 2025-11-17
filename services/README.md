# Services Directory

This directory contains all application services organized by function.

## Structure

```
services/
├── index.js              # Main export point for all services
├── email.js              # Email service using Gmail OAuth2
└── storage/              # Cloud storage services
    ├── index.js          # Export point for storage services
    ├── s3.js             # AWS S3 service (placeholder)
    ├── azure-blob.js     # Azure Blob Storage service (placeholder)
    └── gcs.js            # Google Cloud Storage service (placeholder)
```

## Usage

### Email Service

The email service is fully implemented and ready to use:

```javascript
const { email } = require('./services');

// Send a generic email
await email.send(to, subject, htmlContent, textContent);

// Send specific email types
await email.sendPostReactionEmail(author, reactor, type, postId, baseUrl);
await email.sendAccountBannedEmail(user, reason);
// ... and many more
```

### Storage Services

Storage services are currently placeholders for future implementation. To use them, you'll need to:

1. Install the appropriate SDK
2. Configure environment variables
3. Implement the placeholder methods

#### AWS S3

```javascript
const { storage } = require('./services');

// Once implemented:
await storage.s3.uploadFile(key, fileBuffer, contentType);
await storage.s3.downloadFile(key);
await storage.s3.deleteFile(key);
await storage.s3.getSignedUrl(key, expiresIn);
await storage.s3.listFiles(prefix);
```

**Setup Requirements:**
- Install: `npm install @aws-sdk/client-s3`
- Environment variables:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_REGION`
  - `AWS_S3_BUCKET_NAME`

#### Azure Blob Storage

```javascript
const { storage } = require('./services');

// Once implemented:
await storage.azureBlob.uploadFile(blobName, fileBuffer, contentType);
await storage.azureBlob.downloadFile(blobName);
await storage.azureBlob.deleteFile(blobName);
await storage.azureBlob.getSasUrl(blobName, expiresIn);
await storage.azureBlob.listBlobs(prefix);
await storage.azureBlob.setMetadata(blobName, metadata);
```

**Setup Requirements:**
- Install: `npm install @azure/storage-blob`
- Environment variables:
  - `AZURE_STORAGE_ACCOUNT_NAME`
  - `AZURE_STORAGE_ACCOUNT_KEY`
  - `AZURE_STORAGE_CONTAINER_NAME`

#### Google Cloud Storage

```javascript
const { storage } = require('./services');

// Once implemented:
await storage.gcs.uploadFile(destination, fileBuffer, contentType);
await storage.gcs.downloadFile(filename);
await storage.gcs.deleteFile(filename);
await storage.gcs.getSignedUrl(filename, expiresIn);
await storage.gcs.listFiles(prefix);
await storage.gcs.makePublic(filename);
await storage.gcs.setMetadata(filename, metadata);
```

**Setup Requirements:**
- Install: `npm install @google-cloud/storage`
- Environment variables:
  - `GCS_PROJECT_ID`
  - `GCS_BUCKET_NAME`
  - `GOOGLE_APPLICATION_CREDENTIALS` (path to service account key JSON)

## Adding New Services

To add a new service:

1. Create a new file in the appropriate subdirectory (or create a new subdirectory)
2. Export the service methods
3. Add the service to the appropriate `index.js` file
4. Document the service in this README

## Migration Notes

The email service was moved from `emailService.js` at the project root to `services/email.js` for better organization. All imports have been updated accordingly.

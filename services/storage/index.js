// Storage Services Index
// Central export point for all storage services

const s3Service = require('./s3');
const azureBlobService = require('./azure-blob');
const gcsService = require('./gcs');

module.exports = {
    s3: s3Service,
    azureBlob: azureBlobService,
    gcs: gcsService
};

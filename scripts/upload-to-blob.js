#!/usr/bin/env node

/**
 * Script to upload the public/uploads folder to Azure Blob Storage
 * 
 * Required environment variables:
 * - AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_ACCOUNT
 * - AZURE_STORAGE_ACCOUNT_KEY or AZURE_STORAGE_ACCESS_KEY
 * - AZURE_STORAGE_CONTAINER_NAME (optional, defaults to 'uploads')
 */

require('dotenv').config();
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.AZURE_STORAGE_ACCOUNT;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCESS_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads';
const uploadsPath = path.join(__dirname, '..', 'public', 'uploads');

// Validate configuration
if (!accountName || !accountKey) {
  console.error('❌ Error: Missing Azure Blob Storage credentials');
  console.error('Please set the following environment variables:');
  console.error('  - AZURE_STORAGE_ACCOUNT_NAME (or AZURE_STORAGE_ACCOUNT)');
  console.error('  - AZURE_STORAGE_ACCOUNT_KEY (or AZURE_STORAGE_ACCESS_KEY)');
  console.error('  - AZURE_STORAGE_CONTAINER_NAME (optional, defaults to "uploads")');
  process.exit(1);
}

// Check if uploads folder exists
if (!fs.existsSync(uploadsPath)) {
  console.error(`❌ Error: Uploads folder not found at ${uploadsPath}`);
  process.exit(1);
}

// Create connection string
const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;

// Initialize Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

/**
 * Get all files recursively from a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

/**
 * Upload a single file to Azure Blob Storage
 */
async function uploadFile(containerClient, filePath, basePath) {
  const relativePath = path.relative(basePath, filePath);
  const blobName = relativePath.replace(/\\/g, '/'); // Use forward slashes for blob names
  
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  // Determine content type based on file extension
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.bmp': 'image/bmp',
    '.json': 'application/json'
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  try {
    const fileContent = fs.readFileSync(filePath);
    await blockBlobClient.upload(fileContent, fileContent.length, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
    return { success: true, blobName, size: fileContent.length };
  } catch (error) {
    return { success: false, blobName, error: error.message };
  }
}

/**
 * Main upload function
 */
async function uploadToBlob() {
  console.log('🚀 Starting upload to Azure Blob Storage...\n');
  console.log(`Account: ${accountName}`);
  console.log(`Container: ${containerName}`);
  console.log(`Source: ${uploadsPath}\n`);

  try {
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create container if it doesn't exist
    console.log(`📦 Checking container "${containerName}"...`);
    const exists = await containerClient.exists();
    if (!exists) {
      console.log(`📦 Creating container "${containerName}"...`);
      try {
        // Try to create with blob-level public access first
        await containerClient.create({
          access: 'blob'
        });
        console.log(`✅ Container created with blob-level access\n`);
      } catch (error) {
        // If public access is not permitted, create without specifying access (defaults to private)
        if (error.message.includes('Public access is not permitted')) {
          console.log(`   (Public access not allowed, creating with private access)...`);
          await containerClient.create();
          console.log(`✅ Container created with private access\n`);
        } else {
          throw error;
        }
      }
    } else {
      console.log(`✅ Container exists\n`);
    }

    // Get all files to upload
    console.log('📂 Scanning files...');
    const allFiles = getAllFiles(uploadsPath);
    console.log(`Found ${allFiles.length} file(s) to upload\n`);

    if (allFiles.length === 0) {
      console.log('⚠️  No files found to upload');
      return;
    }

    // Upload files with progress tracking
    let successCount = 0;
    let errorCount = 0;
    let totalSize = 0;

    console.log('📤 Uploading files...\n');
    
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      const fileName = path.relative(uploadsPath, filePath);
      
      process.stdout.write(`[${i + 1}/${allFiles.length}] ${fileName}... `);
      
      const result = await uploadFile(containerClient, filePath, uploadsPath);
      
      if (result.success) {
        successCount++;
        totalSize += result.size;
        const sizeMB = (result.size / 1024 / 1024).toFixed(2);
        console.log(`✅ (${sizeMB} MB)`);
      } else {
        errorCount++;
        console.log(`❌ Error: ${result.error}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Upload Summary:');
    console.log(`   Total files: ${allFiles.length}`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📦 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('='.repeat(50));

    if (errorCount === 0) {
      console.log('\n🎉 All files uploaded successfully!');
      console.log(`\n🌐 Your files are available at:`);
      console.log(`   https://${accountName}.blob.core.windows.net/${containerName}/`);
    } else {
      console.log(`\n⚠️  ${errorCount} file(s) failed to upload. Please check the errors above.`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the upload
uploadToBlob().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});


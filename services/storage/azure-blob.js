// Azure Blob Storage Service
require('dotenv').config();
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

// Only use Azure Blob Storage when actually running on Azure App Service
// Check for Azure App Service environment variables (WEBSITE_SITE_NAME is set by Azure)
const isAzureAppService = !!process.env.WEBSITE_SITE_NAME;
const isProduction = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'Production') && isAzureAppService;
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.AZURE_STORAGE_ACCOUNT;
// Account key is only needed for SAS token generation, not for main operations
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCESS_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads';

let blobServiceClient = null;
let containerClient = null;
let credential = null;

// Initialize Azure Blob Storage client (only in production)
function initializeBlobClient() {
  if (!isProduction || !accountName) {
    return null;
  }

  if (!blobServiceClient) {
    // Use DefaultAzureCredential for authentication
    // This will try, in order:
    // 1. Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
    // 2. Managed Identity (when running on Azure)
    // 3. Azure CLI (for local development)
    // 4. Visual Studio Code
    // 5. Azure PowerShell
    credential = new DefaultAzureCredential();
    
    const accountUrl = `https://${accountName}.blob.core.windows.net`;
    blobServiceClient = new BlobServiceClient(accountUrl, credential);
    containerClient = blobServiceClient.getContainerClient(containerName);
  }

  return { blobServiceClient, containerClient };
}

// Ensure container exists
async function ensureContainer() {
  if (!isProduction) return;
  
  const clients = initializeBlobClient();
  if (!clients) return;

  try {
    const exists = await clients.containerClient.exists();
    if (!exists) {
      try {
        await clients.containerClient.create({ access: 'blob' });
      } catch (err) {
        // If public access not allowed, create with private access
        if (err.message.includes('Public access is not permitted')) {
          await clients.containerClient.create();
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    // Don't throw - just log a warning. This allows the app to continue running
    // even if Azure Storage isn't configured (e.g., in local development)
    if (error.message && error.message.includes('ChainedTokenCredential')) {
      console.warn('⚠️  Azure Blob Storage: Authentication not available. This is normal in local development.');
      console.warn('   Azure Storage will be skipped. Files will use local storage instead.');
    } else {
      console.warn('⚠️  Azure Blob Storage container initialization warning:', error.message || error);
    }
    // Don't throw - allow app to continue
  }
}

// Initialize on module load (only when actually on Azure App Service)
// Skip initialization in local development to avoid authentication errors
if (isProduction && accountName && isAzureAppService) {
  try {
    initializeBlobClient();
    ensureContainer().catch(err => {
      // Silently handle - already logged in ensureContainer
    });
  } catch (error) {
    // Silently fail - Azure Storage not available in local dev
    console.warn('⚠️  Azure Blob Storage initialization skipped (not on Azure App Service)');
  }
}

const azureBlobService = {
  /**
   * Upload a file to Azure Blob Storage
   * @param {string} blobName - The blob name/path (e.g., 'profiles/profile-123.jpg')
   * @param {Buffer} fileBuffer - The file content as a buffer
   * @param {string} contentType - The MIME type of the file
   * @returns {Promise<{success: boolean, url?: string, blobName?: string, error?: string}>}
   */
  uploadFile: async (blobName, fileBuffer, contentType) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      await ensureContainer();
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blockBlobClient = clients.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: contentType }
      });

      return {
        success: true,
        blobName: blobName,
        url: blockBlobClient.url
      };
    } catch (error) {
      console.error('Azure Blob upload error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Download a file from Azure Blob Storage
   * @param {string} blobName - The blob name/path
   * @returns {Promise<{success: boolean, data?: Buffer, contentType?: string, error?: string}>}
   */
  downloadFile: async (blobName) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blockBlobClient = clients.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download(0);
      const chunks = [];
      
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const contentType = downloadResponse.contentType || 'application/octet-stream';

      return {
        success: true,
        data: buffer,
        contentType: contentType
      };
    } catch (error) {
      console.error('Azure Blob download error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a file from Azure Blob Storage
   * @param {string} blobName - The blob name/path
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteFile: async (blobName) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blockBlobClient = clients.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.delete();

      return { success: true };
    } catch (error) {
      console.error('Azure Blob delete error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get a SAS URL for temporary access to a private blob
   * @param {string} blobName - The blob name/path
   * @param {number} expiresInMinutes - URL expiration time in minutes (default: 60)
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  getSasUrl: async (blobName, expiresInMinutes = 60) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blockBlobClient = clients.containerClient.getBlockBlobClient(blobName);
      
      // Check if blob exists
      const exists = await blockBlobClient.exists();
      if (!exists) {
        return { success: false, error: 'Blob not found' };
      }

      // For SAS token generation, we still need the account key
      // This is a limitation of Azure Storage - SAS tokens require the account key
      // If account key is not available, we can use User Delegation SAS (requires additional setup)
      if (!accountKey) {
        // Fallback: return the blob URL directly if public, or use User Delegation SAS
        // For now, return the URL (assuming container has public read access)
        // In production, you might want to implement User Delegation SAS
        return {
          success: true,
          url: blockBlobClient.url
        };
      }

      // Generate SAS token using account key
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: containerName,
          blobName: blobName,
          permissions: BlobSASPermissions.parse('r'), // Read permission
          startsOn: new Date(),
          expiresOn: new Date(new Date().valueOf() + expiresInMinutes * 60 * 1000)
        },
        sharedKeyCredential
      ).toString();

      const sasUrl = `${blockBlobClient.url}?${sasToken}`;

      return {
        success: true,
        url: sasUrl
      };
    } catch (error) {
      console.error('Azure Blob SAS URL error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * List blobs in a specific container prefix
   * @param {string} prefix - The folder prefix to list (e.g., 'profiles/')
   * @returns {Promise<{success: boolean, blobs?: Array, error?: string}>}
   */
  listBlobs: async (prefix) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blobs = [];
      for await (const blob of clients.containerClient.listBlobsFlat({ prefix })) {
        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength,
          contentType: blob.properties.contentType,
          lastModified: blob.properties.lastModified
        });
      }

      return { success: true, blobs };
    } catch (error) {
      console.error('Azure Blob list error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if a blob exists
   * @param {string} blobName - The blob name/path
   * @returns {Promise<{success: boolean, exists?: boolean, error?: string}>}
   */
  blobExists: async (blobName) => {
    if (!isProduction) {
      return { success: false, error: 'Azure Blob Storage only used in production' };
    }

    try {
      const clients = initializeBlobClient();
      if (!clients) {
        return { success: false, error: 'Azure Blob Storage not configured' };
      }

      const blockBlobClient = clients.containerClient.getBlockBlobClient(blobName);
      const exists = await blockBlobClient.exists();

      return { success: true, exists };
    } catch (error) {
      console.error('Azure Blob exists check error:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = azureBlobService;

// Storage configuration (Azure, AWS, etc.)
module.exports = {
  azure: {
    accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
    accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads',
    enabled: !!(process.env.AZURE_STORAGE_ACCOUNT_NAME && process.env.AZURE_STORAGE_ACCOUNT_KEY)
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucketName: process.env.AWS_S3_BUCKET_NAME,
    enabled: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  },

  local: {
    uploadsDir: './public/uploads',
    maxFileSize: 50 * 1024 * 1024, // 50MB
    enabled: true
  },

  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN,
    enabled: !!process.env.MAPBOX_ACCESS_TOKEN
  }
};

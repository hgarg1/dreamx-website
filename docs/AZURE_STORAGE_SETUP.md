# Azure Storage Blob Setup Guide

## Understanding Azure Storage Access

Your application uses Azure Storage Blob for file uploads. Access is handled at **runtime** (when the app is running), not during pipeline deployment.

## How Storage Access Works

### Runtime Access (Current Setup)

Your app uses **Managed Identity** for Azure Storage Blob access:

1. **In `services/storage/azure-blob.js`**:
   - Uses `@azure/identity` with `DefaultAzureCredential()`
   - Automatically authenticates using the App Service's Managed Identity
   - No storage keys needed in code

2. **Azure App Service Configuration**:
   - Managed Identity must be enabled on your App Service
   - Storage account must grant access to the App Service's Managed Identity

### Pipeline Deployment

The `azureSubscription` service connection in `azure-pipelines.yml` is used for:
- Deploying your app to Azure App Service
- **NOT** for accessing Storage Blob during deployment

## Setting Up Managed Identity for Storage

### Step 1: Enable Managed Identity on App Service

1. Go to Azure Portal → Your App Service (`dream-x-app`)
2. Go to **Identity** (under Settings)
3. Turn **ON** System assigned managed identity
4. Note the **Object (principal) ID** - you'll need this

### Step 2: Grant Storage Access to Managed Identity

1. Go to Azure Portal → Your Storage Account (`dreamxapp`)
2. Go to **Access control (IAM)**
3. Click **Add** → **Add role assignment**
4. Role: **Storage Blob Data Contributor**
5. Assign access to: **Managed identity**
6. Select: Your App Service (`dream-x-app`)
7. Click **Save**

### Step 3: Verify Environment Variables

Ensure these are set in App Service Configuration:
- `AZURE_STORAGE_ACCOUNT_NAME`: `dreamxapp`
- `AZURE_STORAGE_CONTAINER_NAME`: `uploads`
- `AZURE_STORAGE_ACCOUNT_KEY`: (optional if using Managed Identity, but can be used as fallback)

## Service Connection for Pipeline

The `azureSubscription` in `azure-pipelines.yml` should be:

1. **Created in Azure DevOps**:
   - Project Settings → Service connections
   - Type: **Azure Resource Manager**
   - Name: `dream-x-azure-connection` (or your preferred name)
   - Scope: **Subscription** or **Resource group**

2. **This connection allows**:
   - Deploying to App Service
   - Accessing Azure resources during pipeline execution
   - **NOT** runtime storage access (that's handled by Managed Identity)

## Alternative: Using Storage Account Key

If you prefer to use storage account keys instead of Managed Identity:

1. Get storage account key:
   - Azure Portal → Storage Account → **Access keys**
   - Copy **key1** or **key2**

2. Set in App Service Configuration:
   - `AZURE_STORAGE_ACCOUNT_KEY`: (paste the key)

3. Update `services/storage/azure-blob.js`:
   - Use `StorageSharedKeyCredential` instead of `DefaultAzureCredential`
   - (Note: Your current code uses Managed Identity, which is more secure)

## Summary

- **Pipeline deployment**: Uses `azureSubscription` service connection
- **Runtime storage access**: Uses Managed Identity (recommended) or storage keys
- **No separate service connection needed** for Storage Blob in the pipeline
- The same Azure Resource Manager service connection covers both App Service and Storage

## Troubleshooting

### Error: "ManagedIdentityCredential authentication failed"

- **Solution**: Ensure Managed Identity is enabled on App Service
- Verify the identity has "Storage Blob Data Contributor" role

### Error: "Storage account not found"

- **Solution**: Check `AZURE_STORAGE_ACCOUNT_NAME` environment variable
- Verify storage account exists and is accessible

### Error: "Access denied"

- **Solution**: Check IAM permissions on storage account
- Verify Managed Identity has correct role assignment

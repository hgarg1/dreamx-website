# Azure Pipelines Setup Guide

This guide explains how to set up Azure DevOps Pipelines for deployment.

## Getting the Azure Subscription Value (Line 15)

The `azureSubscription` value in `azure-pipelines.yml` refers to the **Azure DevOps Service Connection name**, not the actual Azure subscription ID.

### Step 1: Create Azure Service Connection in Azure DevOps

1. Go to [Azure DevOps](https://dev.azure.com)
2. Select your organization and project
3. Go to **Project Settings** (bottom left gear icon)
4. Under **Pipelines**, click **Service connections**
5. Click **New service connection**
6. Select **Azure Resource Manager**
7. Choose **Workload Identity federation (automatic)** (recommended) or **Service principal (manual)**
8. Select your Azure subscription
9. Select your resource group
10. **Service connection name**: Enter a name like `dream-x-azure-connection`
11. Click **Save**

### Step 2: Update azure-pipelines.yml

Replace line 15 with the service connection name you created:

```yaml
azureSubscription: 'dream-x-azure-connection'  # Use the service connection name from Step 1
```

### Step 3: Update App Name (Line 16)

Replace line 16 with your actual App Service name:

```yaml
appName: 'dream-x-app'  # Your actual Azure App Service name
```

## Complete Setup Steps

### 1. Create Azure DevOps Project

1. Go to [Azure DevOps](https://dev.azure.com)
2. Create a new project or use existing one
3. Push your code to the repository

### 2. Create Pipeline

1. In Azure DevOps, go to **Pipelines** → **Pipelines**
2. Click **New pipeline**
3. Select your repository (GitHub, Azure Repos, etc.)
4. Choose **Existing Azure Pipelines YAML file**
5. Select `azure-pipelines.yml` from your repository
6. Click **Continue**

### 3. Configure Variables

Before running, ensure:
- `azureSubscription` matches your service connection name
- `appName` matches your App Service name exactly

### 4. Run Pipeline

1. Click **Run** to test the pipeline
2. Monitor the pipeline execution
3. Check your App Service after completion

## Alternative: Using Subscription ID (Not Recommended)

If you prefer to use the actual subscription ID:

1. Get your subscription ID:
   - Azure Portal → **Subscriptions** → Copy Subscription ID
2. Update line 15:
   ```yaml
   azureSubscription: '12345678-1234-1234-1234-123456789012'  # Your subscription ID
   ```
3. You'll need to configure authentication differently

**Note**: Using service connections is recommended as it handles authentication automatically.

## Troubleshooting

### Error: "Could not find service connection"

- **Solution**: Verify the service connection name matches exactly (case-sensitive)
- Check **Project Settings** → **Service connections** for the exact name

### Error: "Resource not found"

- **Solution**: Verify `appName` matches your App Service name exactly
- Check Azure Portal → App Services for the exact name

### Error: "Authorization failed"

- **Solution**: Ensure the service connection has proper permissions
- Go to **Service connections** → Edit → Verify subscription and permissions

## Service Connection Name vs Subscription ID

- **Service Connection Name**: Friendly name you create in Azure DevOps (e.g., `dream-x-azure-connection`)
- **Subscription ID**: GUID from Azure (e.g., `12345678-1234-1234-1234-123456789012`)

**Use the Service Connection Name** - it's easier and handles authentication automatically.

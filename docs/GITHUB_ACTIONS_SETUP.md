# GitHub Actions Setup for Azure App Service Deployment

This guide walks you through setting up automated deployment from GitHub to Azure App Service.

## Prerequisites

1. Your code is in a GitHub repository
2. You have an Azure App Service instance created
3. You have access to Azure Portal

## Step-by-Step Setup

### Step 1: Get Azure Publish Profile

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service: **App Services** → **dream-x-app** (or your app name)
3. Click **Get publish profile** button (top toolbar)
4. This downloads a `.PublishSettings` file
5. **Important**: Keep this file secure - it contains deployment credentials

### Step 2: Add GitHub Secret

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
5. Value: Open the `.PublishSettings` file you downloaded and copy its **entire contents**
6. Click **Add secret**

### Step 3: Update Workflow File (if needed)

1. Open `.github/workflows/azure-deploy.yml`
2. Update the `AZURE_WEBAPP_NAME` environment variable if your app name is different:
   ```yaml
   env:
     AZURE_WEBAPP_NAME: dream-x-app  # Change this to your actual app name
   ```

### Step 4: Commit and Push

1. Commit the workflow file:
   ```bash
   git add .github/workflows/azure-deploy.yml
   git commit -m "Add GitHub Actions workflow for Azure deployment"
   git push
   ```

### Step 5: Verify Deployment

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see the workflow running
4. Click on the workflow run to see logs
5. Once complete, check your Azure App Service to verify deployment

## Workflow Behavior

The workflow will automatically run when:
- You push to `main` or `master` branch
- You manually trigger it via **Actions** → **Deploy to Azure App Service** → **Run workflow**

## What the Workflow Does

1. **Checks out code** from your repository
2. **Sets up Node.js** (version 20.x)
3. **Installs dependencies** using `npm ci` (clean install from package-lock.json)
4. **Runs build** using `npm run build`
5. **Deploys to Azure** using the publish profile

## Troubleshooting

### Workflow Fails at "Deploy to Azure Web App"

**Error**: "Error: Error: Resource not found"
- **Solution**: Verify `AZURE_WEBAPP_NAME` matches your App Service name exactly

**Error**: "Error: Failed to deploy web package"
- **Solution**: Check Azure Portal → App Service → Deployment Center for detailed error logs

### Dependencies Not Installing

**Error**: Missing modules in production
- **Solution**: Ensure `package-lock.json` is committed to repository
- Verify `npm ci` step completes successfully in workflow logs

### Build Fails

**Error**: Build script fails
- **Solution**: Check your `package.json` build script
- Ensure all build dependencies are in `dependencies` not `devDependencies`

## Manual Deployment (Alternative)

If you prefer manual deployment:

1. **Via Azure Portal**:
   - App Service → **Deployment Center** → **GitHub** → Configure

2. **Via Azure CLI**:
   ```bash
   az webapp deployment source config \
     --name dream-x-app \
     --resource-group your-resource-group \
     --repo-url https://github.com/yourusername/yourrepo \
     --branch main \
     --manual-integration
   ```

3. **Via ZIP Deploy**:
   ```bash
   npm install --production
   zip -r deploy.zip . -x "*.git*" "node_modules/.cache/*"
   az webapp deployment source config-zip \
     --resource-group your-resource-group \
     --name dream-x-app \
     --src deploy.zip
   ```

## Security Best Practices

1. **Never commit** `.PublishSettings` file to repository
2. **Use GitHub Secrets** for all sensitive data
3. **Rotate publish profile** periodically (get new one from Azure Portal)
4. **Review workflow logs** regularly for security issues
5. **Limit branch access** - only deploy from `main`/`master` branch

## Next Steps

After setup:
1. Test deployment by making a small change and pushing
2. Monitor Azure App Service logs for any runtime errors
3. Set up staging environment (optional) using deployment slots
4. Configure custom domains and SSL certificates

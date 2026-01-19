# How to Verify Your Azure Deployment is Working

## Quick Verification Steps

### 1. Check GitHub Actions Runs
Go to: `https://github.com/hgarg1/dreamx-website/actions`

Look for:
- ✅ Recent workflow runs after your commits
- ✅ Green checkmarks (success) or red X (failure)
- ✅ Click on a run to see detailed logs

**If no runs appear**: The workflow isn't triggering. Check:
- Is your code pushed to `main` or `master` branch?
- Is the workflow file committed to the repository?

### 2. Check Deployment Step Logs
In a successful GitHub Actions run:
1. Click on the run
2. Expand "Deploy to Azure Web App" step
3. Look for messages like:
   - "Deploying to Azure App Service..."
   - "Deployment successful"
   - Any error messages

**Common errors**:
- `Resource not found` → App name mismatch
- `Invalid publish profile` → Missing or incorrect secret
- `Deployment failed` → Check Azure logs

### 3. Check Azure Portal Deployment History
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service: **dream-x** (or your app name)
3. Go to **Deployment Center** (or **Deployments**)
4. Check the deployment history:
   - Latest deployment timestamp should match your recent push
   - Commit SHA should match your GitHub commit
   - Status should be "Success"

**If no deployments appear**: The workflow isn't deploying to Azure

### 4. Verify Files Are Actually Updated
**Option A: Check file timestamps via Kudu**
1. In Azure Portal → App Service → **Advanced Tools** → **Go**
2. Click **Debug console** → **CMD** (or **PowerShell**)
3. Navigate to `site/wwwroot`
4. Check file timestamps:
   ```bash
   dir app.js
   dir db\index.js
   ```
   Timestamps should match your recent deployment time

**Option B: Add a version endpoint**
Add this to your `app.js` temporarily:
```javascript
app.get('/version', (req, res) => {
  res.json({ 
    version: process.env.DEPLOYMENT_VERSION || 'unknown',
    commit: process.env.GITHUB_SHA || 'unknown',
    deployed: new Date().toISOString()
  });
});
```

Then visit: `https://dream-x.app/version` to see deployment info

### 5. Test with a Visible Change
Make a small, visible change to verify deployment:
1. Add a comment or console.log with current timestamp
2. Commit and push
3. Check if the change appears in production

## Troubleshooting

### Workflow Not Running
- ✅ Check if workflow file is in `.github/workflows/` directory
- ✅ Verify it's committed to the `main` branch
- ✅ Check GitHub Actions is enabled for your repository

### Workflow Running But Not Deploying
- ✅ Check `AZURE_WEBAPP_PUBLISH_PROFILE` secret exists
- ✅ Verify app name matches exactly: `dream-x`
- ✅ Check deployment step logs for errors

### Files Not Updating in Azure
- ✅ Check if Azure has its own build process enabled (might overwrite files)
- ✅ Verify `SCM_DO_BUILD_DURING_DEPLOYMENT` setting
- ✅ Check if there's a deployment slot conflict

## Current Workflow Configuration

Your workflow:
- ✅ Triggers on push to `main`/`master`
- ✅ Installs dependencies with `npm ci`
- ✅ Runs build with `npm run build`
- ✅ Deploys entire directory with `package: .`
- ⚠️ Deploys `node_modules` (large, but ensures dependencies are present)

## Next Steps

1. **Check GitHub Actions**: Verify recent runs exist
2. **Check Azure Portal**: Verify deployment history
3. **Test with a change**: Make a small change and verify it deploys
4. **Check logs**: Look for any errors in deployment step

If deployments aren't working, the most common issues are:
- Missing `AZURE_WEBAPP_PUBLISH_PROFILE` secret
- App name mismatch (`dream-x` vs actual app name)
- Workflow file not committed to repository

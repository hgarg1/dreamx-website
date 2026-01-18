# Deployment Configuration Guide

This document outlines the deployment configuration for Azure App Service.

## Critical Dependencies

The following transitive dependencies have been explicitly added to `package.json` to prevent missing module errors in production:

- `cookie` & `cookie-signature` - Required by express-session
- `debug` - Used by multiple Express middleware
- `encodeurl` - Required by finalhandler (Express)
- `finalhandler` - Express error handler
- `mime-types` - Used by various packages
- `qs` - Query string parser (used by Express, body-parser)
- `raw-body` - Required by body-parser
- `send` & `serve-static` - Express static file serving
- `type-is` - Content type detection

## Azure App Service Configuration

### Option 1: GitHub Actions (Recommended)

1. Create a GitHub Actions workflow (`.github/workflows/azure-deploy.yml`)
2. Add Azure publish profile as secret: `AZURE_WEBAPP_PUBLISH_PROFILE`
3. The workflow will:
   - Run `npm ci` for clean install
   - Run `npm run build` 
   - Deploy to Azure App Service

### Option 2: Azure DevOps Pipelines

1. Use `azure-pipelines.yml` for Azure DevOps
2. Configure Azure subscription connection
3. Update `appName` variable

### Option 3: Direct Deployment

1. Ensure `.deployment` file is in root (already created)
2. Configure App Service → Configuration → General Settings:
   - **SCM_DO_BUILD_DURING_DEPLOYMENT**: `true`
   - **POST_BUILD_COMMAND**: `npm install --production`

### Option 4: Manual Deployment

If deploying via ZIP or FTP:

1. Run locally: `npm install --production`
2. Include `node_modules` in deployment package
3. Or ensure App Service runs `npm install` on startup

## Verification Steps

After deployment, verify dependencies are installed:

1. SSH into App Service: `az webapp ssh --name dream-x-app --resource-group your-resource-group`
2. Check node_modules: `ls node_modules | grep encodeurl`
3. Test app startup: Check logs for any missing module errors

## Troubleshooting

### Missing Module Errors

If you see errors like "Cannot find module 'X'":
1. Check if module is in `package.json` dependencies
2. Verify `npm install` ran during deployment
3. Check App Service logs for installation errors
4. Add missing module explicitly to `package.json`

### Build Failures

- Ensure `NODE_VERSION` matches your App Service Node.js version
- Check `package-lock.json` is committed
- Verify all native modules (like `better-sqlite3`) build correctly

## Environment Variables

Ensure these are set in Azure App Service Configuration:
- `NODE_ENV`: `production`
- `DB_TYPE`: `postgresql`
- PostgreSQL connection variables (`PG_HOST`, `PG_PORT`, etc.)
- OAuth credentials
- Other required environment variables

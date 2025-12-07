#!/usr/bin/env node
/**
 * Security Audit Script
 * 
 * Performs basic security checks on the application
 * Run with: node scripts/security-audit.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔒 Dream X Security Audit\n');

let warnings = 0;
let errors = 0;
let passes = 0;

function pass(message) {
    console.log(`✅ ${message}`);
    passes++;
}

function warn(message) {
    console.log(`⚠️  ${message}`);
    warnings++;
}

function error(message) {
    console.log(`❌ ${message}`);
    errors++;
}

console.log('1. Environment Configuration\n');

// Check .env file
if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    
    // Check for SESSION_SECRET
    if (envContent.includes('SESSION_SECRET=')) {
        const match = envContent.match(/SESSION_SECRET=(.+)/);
        if (match && match[1].trim().length >= 32) {
            pass('SESSION_SECRET is set and appears strong');
        } else {
            error('SESSION_SECRET is too short (should be 32+ characters)');
        }
    } else {
        warn('SESSION_SECRET not found in .env file');
    }
    
    // Check for dangerous default values
    if (envContent.includes('SESSION_SECRET=your secret') || 
        envContent.includes('SESSION_SECRET=secret123')) {
        error('Using default/weak SESSION_SECRET');
    }
    
    // Check for NODE_ENV in production
    if (envContent.includes('NODE_ENV=production')) {
        pass('NODE_ENV set to production');
    } else {
        warn('NODE_ENV not set to production (okay for development)');
    }
    
    // Check for HTTPS
    if (envContent.includes('BASE_URL=https://')) {
        pass('BASE_URL uses HTTPS');
    } else if (envContent.includes('BASE_URL=http://localhost')) {
        warn('BASE_URL uses HTTP (okay for local development)');
    } else {
        warn('BASE_URL should use HTTPS in production');
    }
} else {
    warn('.env file not found (okay if using environment variables)');
}

console.log('\n2. Dependencies\n');

// Check package.json for known vulnerable packages
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (packageJson.dependencies) {
    const deps = packageJson.dependencies;
    
    // Check for security-related packages
    if (deps['helmet']) {
        pass('Helmet.js installed for security headers');
    } else {
        error('Helmet.js not installed');
    }
    
    if (deps['express-rate-limit']) {
        pass('express-rate-limit installed');
    } else {
        error('express-rate-limit not installed');
    }
    
    if (deps['express-validator']) {
        pass('express-validator installed');
    } else {
        error('express-validator not installed');
    }
    
    if (deps['bcrypt']) {
        pass('bcrypt installed for password hashing');
    } else {
        error('bcrypt not installed');
    }
}

console.log('\n3. File Permissions\n');

// Check critical file permissions
const criticalFiles = [
    '.env',
    'data/dreamx.db',
    'data/sessions.sqlite3'
];

for (const file of criticalFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const mode = (stats.mode & parseInt('777', 8)).toString(8);
        
        if (mode === '600' || mode === '644') {
            pass(`${file} has secure permissions (${mode})`);
        } else {
            warn(`${file} has permissions ${mode} (should be 600 or 644)`);
        }
    }
}

console.log('\n4. Code Security Checks\n');

// Check for dangerous patterns in code
const routesDir = path.join(process.cwd(), 'routes');
const middlewareDir = path.join(process.cwd(), 'middleware');

function scanDirectory(dir, pattern, description) {
    let found = false;
    
    function scanFile(filePath) {
        if (fs.statSync(filePath).isDirectory()) {
            fs.readdirSync(filePath).forEach(file => {
                scanFile(path.join(filePath, file));
            });
        } else if (filePath.endsWith('.js')) {
            const content = fs.readFileSync(filePath, 'utf8');
            if (pattern.test(content)) {
                found = true;
                warn(`${description} found in ${path.relative(process.cwd(), filePath)}`);
            }
        }
    }
    
    if (fs.existsSync(dir)) {
        scanFile(dir);
    }
    
    if (!found) {
        pass(`No ${description.toLowerCase()} found`);
    }
}

// Check for eval usage
scanDirectory(routesDir, /\beval\s*\(/g, 'eval() usage');

// Check for exec usage
scanDirectory(routesDir, /require\(['"]child_process['"]\)\.exec/g, 'child_process.exec() usage');

// Check for innerHTML in unsafe contexts
const viewsDir = path.join(process.cwd(), 'views');
if (fs.existsSync(viewsDir)) {
    let unsafeInnerHTML = 0;
    
    function checkViews(dir) {
        fs.readdirSync(dir).forEach(file => {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                checkViews(fullPath);
            } else if (file.endsWith('.ejs')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                // Check for innerHTML without escaping
                const matches = content.match(/innerHTML\s*=/g);
                if (matches) {
                    unsafeInnerHTML += matches.length;
                }
            }
        });
    }
    
    checkViews(viewsDir);
    
    if (unsafeInnerHTML > 0) {
        warn(`Found ${unsafeInnerHTML} instances of innerHTML usage (may be XSS vulnerable)`);
    } else {
        pass('No dangerous innerHTML usage found');
    }
}

console.log('\n5. Security Middleware\n');

// Check if security middleware is imported in app.js
const appJs = fs.readFileSync('app.js', 'utf8');

if (appJs.includes('require(\'./middleware/security\')') || 
    appJs.includes('require("./middleware/security")')) {
    pass('Security middleware imported');
    
    if (appJs.includes('configureHelmet()')) {
        pass('Helmet configured');
    } else {
        error('Helmet not configured');
    }
    
    if (appJs.includes('authLimiter') || appJs.includes('rate-limit')) {
        pass('Rate limiting configured');
    } else {
        error('Rate limiting not configured');
    }
} else {
    error('Security middleware not imported');
}

console.log('\n6. Database Security\n');

// Check for SQL injection prevention
const dbFiles = ['db/index.js', 'db.js'];
let dbFileFound = false;

for (const dbFile of dbFiles) {
    if (fs.existsSync(dbFile)) {
        dbFileFound = true;
        const content = fs.readFileSync(dbFile, 'utf8');
        
        // Check for prepared statements
        if (content.includes('.prepare(') || content.includes('prepared')) {
            pass('Using prepared statements (SQL injection protected)');
        } else {
            warn('Cannot verify SQL injection protection');
        }
        break;
    }
}

if (!dbFileFound) {
    warn('Database file not found for inspection');
}

console.log('\n7. Session Security\n');

if (appJs.includes('express-session')) {
    pass('express-session configured');
    
    // Check session options
    if (appJs.includes('httpOnly: true')) {
        pass('Session cookies set to httpOnly');
    } else {
        error('Session cookies should be httpOnly');
    }
    
    if (appJs.includes('secure:') && appJs.includes('production')) {
        pass('Secure cookies enabled in production');
    } else {
        warn('Verify secure cookies are enabled in production');
    }
    
    if (appJs.includes("sameSite: 'lax'") || appJs.includes('sameSite: "lax"')) {
        pass('SameSite cookie attribute set');
    } else {
        warn('SameSite cookie attribute not set');
    }
} else {
    error('express-session not configured');
}

console.log('\n=== Summary ===\n');
console.log(`✅ Passed: ${passes}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log(`❌ Errors: ${errors}`);

if (errors > 0) {
    console.log('\n❌ Security audit failed. Please fix the errors above.');
    process.exit(1);
} else if (warnings > 0) {
    console.log('\n⚠️  Security audit passed with warnings. Review warnings for production deployment.');
    process.exit(0);
} else {
    console.log('\n✅ Security audit passed!');
    process.exit(0);
}

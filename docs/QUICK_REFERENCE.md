# Quick Reference Guide

## Essential Commands

### Development
```bash
npm run dev              # Start server with auto-reload
npm test                # Run all tests
npm run test:watch     # Watch mode for tests
npm run test:coverage  # Coverage report
```

### Database
```bash
npm run db:migrate:chat      # Migrate chat attachments
npm run db:clear-reels       # Clear all reels [--dry-run]
npm run cleanup:uploads      # Clean orphaned uploads [--dry-run]
npm run storage:upload       # Upload to Azure Blob
```

### Git Workflow
```bash
git checkout -b feature/my-feature
git add .
git commit -m "feat: description of change"
git push origin feature/my-feature
# Create PR on GitHub
```

## Project Structure

```
config/              → Configuration files (database, oauth, payments, email, storage)
middleware/          → Custom middleware (auth, rbac, error handling)
routes/              → API & page routes
services/            → Business logic (logger, email, payments, etc)
utils/               → Utility functions
db/                  → Database setup & adapter
tests/               → Jest tests (unit, integration, fixtures)
scripts/             → Maintenance scripts organized by type
public/              → Static files (CSS, JS, images, uploads)
views/               → EJS templates
data/                → Local databases (git-ignored)
logs/                → Application logs (git-ignored)
docs/                → Documentation
```

## Configuration

All config values come from:
1. Environment variables (`.env` file)
2. `config/` modules
3. Defaults in application code

**Never hardcode** credentials or settings.

## Authentication

### Checking User Role
```javascript
const { ensureAuthenticated, requireAdmin } = require('../middleware/auth');

// Protect a route
router.get('/admin', requireAdmin, (req, res) => {
  // User is admin
});
```

### Role-Based Access
```javascript
const { requirePermission } = require('../middleware/rbac');

router.delete('/user/:id', 
  requirePermission('delete_users'),
  (req, res) => { /* ... */ }
);
```

## Logging

```javascript
const logger = require('./services/logger');

logger.info('User logged in', { userId: 1, email: 'user@example.com' });
logger.warn('High memory usage', { memory: '512MB' });
logger.error('Payment failed', { orderId: 123, error: err.message });
```

## Testing

### Running Tests
```bash
npm test                              # All tests
npm test -- tests/unit/auth.test.js  # Specific file
npm test -- --testNamePattern="login" # Matching pattern
npm run test:coverage                 # With coverage
```

### Test Structure
```javascript
const fixtures = require('../fixtures/data');
const MockDB = require('../fixtures/mock-db');

describe('Feature Name', () => {
  let db;

  beforeEach(() => {
    db = new MockDB();
  });

  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Using Fixtures
```javascript
fixtures.users.standard              // Regular user
fixtures.users.admin                 // Admin user
fixtures.posts.text                  // Text post
fixtures.tokens.validJWT             // JWT token
fixtures.requests.validLogin         // Login request
```

## Database Operations

### Query
```javascript
const { db } = require('./db');

// Single result
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(1);

// Multiple results
const users = db.prepare('SELECT * FROM users WHERE role = ?').all('admin');

// Insert
db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
  .run('john', 'john@example.com');
```

### Transactions
```javascript
const transaction = db.transaction((data) => {
  db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)')
    .run(data.userId, data.content);
  
  db.prepare('UPDATE users SET post_count = post_count + 1 WHERE id = ?')
    .run(data.userId);
});

transaction({ userId: 1, content: 'Hello' });
```

## Error Handling

```javascript
// Middleware catches errors automatically
router.get('/user/:id', async (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new Error('User not found');
    res.json(user);
  } catch (error) {
    next(error); // Pass to error handler
  }
});
```

## Environment Variables

Essential variables in `.env`:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_ENV=development

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT=consumers

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Azure Storage
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...
AZURE_STORAGE_CONTAINER_NAME=uploads
```

## Common Issues

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

### Database Issues
```bash
# Reset local database
rm data/dreamx.db data/sessions.sqlite3
npm run dev  # Reinitialize on startup
```

### OAuth Errors
- Check CLIENT_ID and CLIENT_SECRET are correct
- Verify callback URLs match OAuth provider settings
- For Microsoft, ensure MICROSOFT_TENANT='consumers'

### Tests Failing
```bash
# Clear Jest cache
npm test -- --clearCache

# Run with debug output
DEBUG_TESTS=true npm test
```

## Code Style

- **Indentation:** 2 spaces
- **Semicolons:** Always use them
- **Naming:** camelCase for variables, PascalCase for classes
- **Async:** Use async/await (prefer over .then())
- **Comments:** JSDoc for functions

## Git Best Practices

```bash
# Create feature branch
git checkout -b feature/cool-feature

# Make commits
git add .
git commit -m "feat: add cool feature"
git commit -m "test: add tests for cool feature"

# Push and create PR
git push origin feature/cool-feature

# After PR approval, merge
git checkout main
git pull origin main
git merge feature/cool-feature
git push origin main

# Delete branch
git branch -d feature/cool-feature
```

## Useful Links

- [Express Documentation](https://expressjs.com/)
- [Jest Documentation](https://jestjs.io/)
- [SQLite Documentation](https://www.sqlite.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## Getting Help

1. Check `CONTRIBUTING.md` for setup issues
2. Check `TESTING.md` for test questions
3. Look in `routes/README.md` for API documentation
4. Review existing tests for examples
5. Check application logs in `logs/` directory
6. Ask in team discussions or create an issue

---

**Pro Tip:** Use `npm run dev` + `npm run test:watch` in separate terminals for quick feedback loop!

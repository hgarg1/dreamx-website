# Contributing to DreamX

Thank you for your interest in contributing to the DreamX project! This guide will help you get started with development, testing, and submitting changes.

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm 8+
- SQLite3 (for development)
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dreamx-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your local configuration:
   ```env
   NODE_ENV=development
   DATABASE_ENV=development
   
   # OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   MICROSOFT_CLIENT_ID=your_microsoft_client_id
   MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
   MICROSOFT_TENANT=consumers
   
   APPLE_TEAM_ID=your_apple_team_id
   APPLE_CLIENT_ID=your_apple_client_id
   APPLE_KEY_ID=your_apple_key_id
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   
   The server will start on `http://localhost:3000` with auto-reload enabled.

## Project Structure

```
dreamx-website/
├── app.js                 # Main application entry point
├── config/               # Configuration management
│   ├── index.js         # Central config loader
│   ├── database.js      # Database configuration
│   ├── oauth.js         # OAuth provider setup
│   ├── payments.js      # Payment integration config
│   ├── email.js         # Email service config
│   └── storage.js       # Azure storage config
├── middleware/          # Custom middleware
│   ├── auth.js         # Authentication/authorization
│   ├── rbac.js         # Role-based access control
│   ├── error.js        # Request error handling
│   └── errorHandler.js # Global error handler
├── routes/             # API and page routes
├── services/           # Business logic services
│   ├── logger.js      # Winston logger setup
│   ├── email.js       # Email service
│   └── ...
├── utils/             # Utility functions
├── db/               # Database configuration
│   ├── index.js     # Database initialization
│   └── adapter.js   # Database adapter
├── data/            # Local database files (git-ignored)
├── logs/            # Application logs (git-ignored)
├── public/          # Static files
│   ├── css/
│   ├── js/
│   └── uploads/     # User uploads (git-ignored)
├── views/           # EJS templates
├── tests/           # Test files
│   ├── unit/       # Unit tests
│   ├── integration/ # Integration tests
│   ├── fixtures/    # Test data & mocks
│   └── setup.js    # Jest setup
└── scripts/         # Maintenance scripts
    ├── db/         # Database scripts
    ├── cleanup/    # Cleanup scripts
    ├── storage/    # Storage scripts
    └── maintenance/# Maintenance scripts
```

## Code Style

This project follows these conventions:

- **Spacing**: 2 spaces for indentation
- **Semicolons**: Always use semicolons
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Comments**: JSDoc style for functions and modules
- **Error Handling**: Always use try-catch for async operations

### Example

```javascript
/**
 * Authenticate user with email and password
 * @param {string} email - User email address
 * @param {string} password - User password
 * @returns {Promise<Object>} User object with authentication token
 * @throws {Error} If authentication fails
 */
async function authenticateUser(email, password) {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      throw new Error('User not found');
    }
    // ... rest of implementation
  } catch (error) {
    logger.error('Authentication failed', { email, error: error.message });
    throw error;
  }
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

Tests are located in `tests/` with the following structure:
- `tests/unit/` - Unit tests for individual functions/modules
- `tests/integration/` - Integration tests for features
- `tests/fixtures/` - Test data and mock helpers

**Unit Test Example** (`tests/unit/utils.test.js`):
```javascript
const fixtures = require('../fixtures/data');

describe('Authentication Utils', () => {
  describe('hashPassword', () => {
    it('should hash passwords securely', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(hash).toHaveLength.greaterThan(10);
    });

    it('should verify correct passwords', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });
  });
});
```

**Integration Test Example** (`tests/integration/auth.test.js`):
```javascript
const request = require('supertest');
const app = require('../../app');
const fixtures = require('../fixtures/data');

describe('Authentication Routes', () => {
  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send(fixtures.requests.validLogin);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword'
        });
      
      expect(response.status).toBe(401);
    });
  });
});
```

### Test Fixtures

Common test data is available in `tests/fixtures/data.js`:

```javascript
const fixtures = require('../fixtures/data');

// Use fixture data in tests
const testUser = fixtures.users.standard;
const testPost = fixtures.posts.text;
const validToken = fixtures.tokens.validJWT;
```

For database operations, use the mock database:

```javascript
const MockDB = require('../fixtures/mock-db');

describe('Database Operations', () => {
  let db;

  beforeEach(() => {
    db = new MockDB();
  });

  afterEach(() => {
    db.close();
  });

  it('should insert and retrieve users', () => {
    db.prepare('INSERT INTO users (username, email) VALUES (?, ?)').run('test', 'test@example.com');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('test');
    
    expect(user.username).toBe('test');
  });
});
```

## Database Scripts

Maintenance scripts are organized in `scripts/`:

### Database Scripts (`scripts/db/`)
```bash
# Migrate chat attachment paths
npm run db:migrate:chat [--dry-run] [--report]

# Delete all WebAuthn credentials
node scripts/db/deleteWebAuthn.js
```

### Cleanup Scripts (`scripts/cleanup/`)
```bash
# Clear all reels from database
npm run db:clear-reels [--dry-run]
```

### Storage Scripts (`scripts/storage/`)
```bash
# Upload local uploads to Azure Blob Storage
npm run storage:upload
```

### Maintenance Scripts (`scripts/maintenance/`)
```bash
# Clean up orphaned upload files
node scripts/maintenance/cleanup-uploads.js [--dry-run]
```

## Git Workflow

### Branch Naming
- Feature: `feature/description`
- Bug fix: `fix/description`
- Documentation: `docs/description`

### Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

**Example:**
```bash
git commit -m "feat: implement OAuth callback URL auto-generation"
git commit -m "fix: resolve database initialization timing issue"
git commit -m "docs: add development setup guide"
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes and write tests
3. Ensure all tests pass: `npm test`
4. Run coverage check: `npm run test:coverage`
5. Submit PR with detailed description
6. Address review comments
7. Merge after approval

## Logging

The application uses Winston logger via `services/logger.js`:

```javascript
const logger = require('./services/logger');

logger.info('User logged in', { userId: user.id, email: user.email });
logger.warn('Rate limit approaching', { userId: user.id, requests: 95 });
logger.error('Payment processing failed', { 
  orderId: order.id, 
  error: error.message 
});
```

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- `console` - In development

## API Documentation

API routes are documented in `routes/README.md`. Key points:

- All authenticated endpoints require `Authorization: Bearer <token>` header
- Admin endpoints require `role: 'admin'`
- Rate limiting is applied per user/IP
- CORS is configured for `ALLOWED_ORIGINS`

## Security Notes

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Database files** in `data/` are git-ignored for development
3. **Uploads** in `public/uploads/` are git-ignored
4. **Always validate and sanitize** user input
5. **Use parameterized queries** to prevent SQL injection
6. **Hash passwords** with bcrypt (min 10 rounds)

## Troubleshooting

### Database Issues
```bash
# Reset local database
rm data/dreamx.db data/sessions.sqlite3

# Reinitialize on next start
npm run dev
```

### OAuth Errors
- Verify callback URLs match OAuth provider settings
- Check that CLIENT_ID and CLIENT_SECRET are correct
- For Microsoft OAuth, ensure MICROSOFT_TENANT is set to 'consumers'

### Port Already in Use
```bash
# Change port in .env
PORT=3001

# Or kill the process using port 3000
lsof -ti:3000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3000   # Windows
```

## Questions?

For issues, feature requests, or questions:
1. Check existing issues on GitHub
2. Create a detailed issue with reproduction steps
3. Join our community discussions
4. Contact maintainers directly

Happy coding! 🚀

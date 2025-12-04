# Testing Guide

Comprehensive guide for writing and running tests in the DreamX project.

## Test Organization

Tests are organized by type and location:

```
tests/
├── unit/           # Unit tests for individual functions/modules
├── integration/    # Integration tests for features
├── fixtures/       # Test data, mocks, and helpers
├── setup.js       # Jest configuration and global setup
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (Reruns on file changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

This generates a coverage report showing:
- Branch coverage
- Function coverage
- Line coverage
- Statement coverage

**Coverage Thresholds:** Currently set to 50% minimum across all metrics.

### Run Specific Test File
```bash
npm test -- tests/unit/auth.test.js
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="login"
```

## Test Structure

### Unit Tests

Unit tests verify individual functions in isolation. Located in `tests/unit/`.

**File naming:** `<module>.test.js`

**Example:** `tests/unit/auth.test.js`

```javascript
describe('Authentication', () => {
  describe('hashPassword', () => {
    it('should hash a password securely', async () => {
      // Arrange
      const password = 'TestPassword123!';
      
      // Act
      const hashed = await hashPassword(password);
      
      // Assert
      expect(hashed).not.toBe(password);
      expect(hashed.length).toBeGreaterThan(10);
    });

    it('should produce different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });
});
```

### Integration Tests

Integration tests verify multiple components working together. Located in `tests/integration/`.

**File naming:** `<feature>.test.js`

**Example:** `tests/integration/auth.test.js`

```javascript
const request = require('supertest');
const app = require('../../app');
const MockDB = require('../fixtures/mock-db');
const fixtures = require('../fixtures/data');

describe('Authentication Integration', () => {
  let db;

  beforeAll(() => {
    db = new MockDB();
  });

  afterAll(() => {
    db.close();
  });

  describe('User Registration', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(fixtures.requests.validRegistration);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('token');
    });

    it('should reject duplicate email', async () => {
      // Insert existing user
      db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
        .run('existing', 'test@example.com', 'hashedpwd');

      const response = await request(app)
        .post('/auth/register')
        .send(fixtures.requests.validRegistration);

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/email.*exists/i);
    });
  });

  describe('User Login', () => {
    beforeEach(() => {
      // Create test user
      db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
        .run('testuser', 'test@example.com', hashedPassword);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send(fixtures.requests.validLogin);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
    });
  });
});
```

## Using Test Fixtures

Fixtures provide reusable test data. Located in `tests/fixtures/`.

### Data Fixtures (`tests/fixtures/data.js`)

Pre-defined test data for common scenarios:

```javascript
const fixtures = require('../fixtures/data');

// User data
fixtures.users.standard;     // Regular user
fixtures.users.admin;        // Admin user
fixtures.users.moderator;    // Moderator user

// Post data
fixtures.posts.text;         // Text post
fixtures.posts.media;        // Media post

// Authentication tokens
fixtures.tokens.validJWT;    // Valid JWT token
fixtures.tokens.expiredJWT;  // Expired token
fixtures.tokens.invalidJWT;  // Invalid token

// Request data
fixtures.requests.validLogin;          // Valid login request
fixtures.requests.validRegistration;   // Valid registration request
fixtures.requests.invalidEmail;        // Invalid email request
```

### Mock Database (`tests/fixtures/mock-db.js`)

In-memory database for isolated tests:

```javascript
const MockDB = require('../fixtures/mock-db');

describe('User Database', () => {
  let db;

  beforeEach(() => {
    db = new MockDB();  // Fresh database for each test
  });

  afterEach(() => {
    db.close();
  });

  it('should insert and retrieve users', () => {
    db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
      .run('testuser', 'test@example.com');

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('testuser');
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });

  it('should enforce unique constraint on email', () => {
    db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
      .run('user1', 'test@example.com');

    expect(() => {
      db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
        .run('user2', 'test@example.com');
    }).toThrow();
  });
});
```

## Mocking Strategies

### Mocking Modules

```javascript
// Mock a service
jest.mock('../../services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true })
}));

const emailService = require('../../services/email');

describe('User Notification', () => {
  it('should send welcome email on registration', async () => {
    // ... registration logic
    
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ 
        to: 'user@example.com',
        subject: expect.stringContaining('Welcome')
      })
    );
  });
});
```

### Mocking Database

```javascript
const MockDB = require('../fixtures/mock-db');

describe('Post Service', () => {
  let db;
  let postService;

  beforeEach(() => {
    db = new MockDB();
    
    // Replace real database with mock
    jest.doMock('../../db', () => ({ db }));
    
    postService = require('../../services/posts');
  });

  it('should create a post', () => {
    const post = postService.createPost({
      userId: 1,
      content: 'Test post'
    });

    expect(post.id).toBeDefined();
    expect(post.content).toBe('Test post');
  });
});
```

### Mocking HTTP Requests

```javascript
const axios = require('axios');
jest.mock('axios');

describe('External API Calls', () => {
  it('should handle API response', async () => {
    axios.get.mockResolvedValue({
      data: { users: [{ id: 1, name: 'Test' }] }
    });

    const result = await getExternalUsers();
    
    expect(result).toHaveLength(1);
    expect(axios.get).toHaveBeenCalledWith('https://api.example.com/users');
  });

  it('should handle API errors', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));

    await expect(getExternalUsers()).rejects.toThrow('Network error');
  });
});
```

## Common Testing Patterns

### Testing Async Functions

```javascript
describe('Async Operations', () => {
  it('should resolve promise', async () => {
    const result = await fetchUserData(1);
    expect(result.id).toBe(1);
  });

  it('should handle promise rejection', async () => {
    await expect(fetchUserData(-1)).rejects.toThrow('Invalid ID');
  });
});
```

### Testing Middleware

```javascript
describe('Authentication Middleware', () => {
  it('should call next() for authenticated request', () => {
    const req = {
      headers: { authorization: 'Bearer valid-token' },
      user: { id: 1 }
    };
    const res = {};
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 401 for missing token', () => {
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

### Testing Database Transactions

```javascript
describe('Database Transactions', () => {
  it('should rollback on error', () => {
    const db = new MockDB();
    
    expect(() => {
      const transaction = db.transaction(() => {
        db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
          .run('user1', 'test@example.com');
        
        // This will fail due to unique constraint
        db.prepare('INSERT INTO users (username, email) VALUES (?, ?)')
          .run('user2', 'test@example.com');
      });
      
      transaction();
    }).toThrow();

    // Verify first insert was rolled back
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    expect(count).toBe(0);
  });
});
```

## Assertions

Common Jest assertions:

```javascript
// Equality
expect(value).toBe(expected);              // Strict equality (===)
expect(value).toEqual(expected);           // Deep equality
expect(value).toStrictEqual(expected);     // Strict deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeUndefined();
expect(value).toBeNull();

// Numbers
expect(value).toBeGreaterThan(5);
expect(value).toBeGreaterThanOrEqual(5);
expect(value).toBeLessThan(5);
expect(value).toBeLessThanOrEqual(5);
expect(0.1 + 0.2).toBeCloseTo(0.3);

// Strings
expect(value).toMatch(/regex/);
expect(value).toMatch('substring');
expect(value).toContain('substring');
expect(value).toHaveLength(5);

// Arrays
expect(arr).toContain('item');
expect(arr).toHaveLength(3);
expect(arr).toEqual(expect.arrayContaining([1, 2]));

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toEqual(expect.objectContaining({ key: value }));

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledWith(arg1, arg2);
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveReturnedWith(value);

// Exceptions
expect(fn).toThrow();
expect(fn).toThrow('message');
expect(fn).toThrow(Error);
expect(promise).rejects.toThrow();
```

## Debugging Tests

### Run Single Test
```bash
npm test -- tests/unit/auth.test.js
```

### Run Specific Test Suite
```bash
npm test -- --testNamePattern="login"
```

### Enable Debug Output
```bash
DEBUG_TESTS=true npm test
```

### Use Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open Chrome DevTools at `chrome://inspect`

## Performance Optimization

### Use `beforeAll` for Expensive Setup
```javascript
describe('API Tests', () => {
  let db;

  // Runs once before all tests
  beforeAll(() => {
    db = new MockDB();
    // Expensive initialization
  });

  // Runs after all tests
  afterAll(() => {
    db.close();
  });

  // Runs before each test
  beforeEach(() => {
    // Clean state
  });
});
```

### Skip/Focus Tests
```javascript
// Skip a test
it.skip('should do something', () => {
  // This test is skipped
});

// Skip a suite
describe.skip('API Tests', () => {
  // All tests in this suite are skipped
});

// Focus on specific test
it.only('should do critical thing', () => {
  // Only this test runs
});
```

## Coverage Goals

Current threshold: **50%**

To view coverage:
```bash
npm run test:coverage
```

This generates a report in the terminal and creates `coverage/` directory with detailed HTML reports.

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to `main`
- Commits to `develop`

See `.github/workflows/` for CI/CD configuration.

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Best Practices](https://jestjs.io/docs/tutorial-react)

## Questions?

For help writing tests or questions about testing strategy, check the `CONTRIBUTING.md` guide or contact the team.

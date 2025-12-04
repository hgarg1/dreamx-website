/**
 * Jest test setup file
 * This runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_ENV = 'test';

// Suppress console logs during tests unless explicitly needed
const originalLog = console.log;
const originalError = console.error;

beforeAll(() => {
  // Keep error logs visible
  console.log = jest.fn((...args) => {
    if (process.env.DEBUG_TESTS) {
      originalLog(...args);
    }
  });
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

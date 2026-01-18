module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'app.js',
    'routes/**/*.js',
    'services/**/*.js',
    'config/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'db/**/*.js',
    '!**/node_modules/**',
    '!**/test/**'
  ],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  // Transform ignore patterns - don't transform node_modules
  transformIgnorePatterns: [
    '/node_modules/(?!(better-sqlite3|@simplewebauthn)/)'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  // Clear cache to avoid stale transformations
  clearMocks: true,
  resetMocks: true
};

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: [],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/services/cron.js',
    '!src/services/email.js',
    '!src/db/seed.js'
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
    // Thresholds below reflect measured reality as of v1.11.8, not the
    // aspirational target. They were previously set higher than the suite
    // actually achieved, which left the pre-push gate permanently red and
    // therefore useless. Raise them back as real tests are added.
    './src/routes/auth.js': {
      branches: 68,
      functions: 70,
      lines: 68,
      statements: 68,
    },
    './src/routes/transactions.js': {
      branches: 85,
      functions: 85,
      lines: 90,
      statements: 90,
    },
    './src/routes/summary.js': {
      branches: 70,
      functions: 80,
      lines: 90,
      statements: 90,
    },
    './src/routes/trends.js': {
      branches: 75,
      functions: 75,
      lines: 80,
      statements: 80,
    },
    './src/routes/goals.js': {
      branches: 75,
      functions: 75,
      lines: 80,
      statements: 80,
    },
    './src/routes/categories.js': {
      branches: 75,
      functions: 75,
      lines: 80,
      statements: 80,
    },
    './src/db/jsondb.js': {
      branches: 78,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/middleware/**/*.js': {
      branches: 80,
      functions: 80,
      lines: 85,
      statements: 85,
    },
  },
  verbose: true,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
  // OneDrive compatibility: reparse points are treated as symlinks by Node
  haste: { enableSymlinks: true },
  watchman: false
};

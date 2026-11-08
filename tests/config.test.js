describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should export default config values', () => {
    const config = require('../src/config');
    expect(config.port).toBeDefined();
    expect(config.sessionSecret).toBeDefined();
    expect(config.appUrl).toBeDefined();
    expect(config.dataDir).toBeDefined();
    expect(config.smtp).toBeDefined();
    expect(config.smtpFrom).toBeDefined();
    expect(config.onesignal).toBeDefined();
  });

  it('should use PORT env var when set', () => {
    process.env.PORT = '8080';
    const config = require('../src/config');
    expect(config.port).toBe(8080);
  });

  it('should use DATA_DIR env var when set', () => {
    process.env.DATA_DIR = '/tmp/test-data';
    const config = require('../src/config');
    expect(config.dataDir).toBe('/tmp/test-data');
  });

  it('should use SESSION_SECRET env var when set', () => {
    process.env.SESSION_SECRET = 'my-secret';
    const config = require('../src/config');
    expect(config.sessionSecret).toBe('my-secret');
  });

  it('should fail closed in production when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';

    expect(() => require('../src/config')).toThrow('SESSION_SECRET must be configured in production');
  });

  it('should generate a new ephemeral session secret outside production', () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'test';

    const firstSecret = require('../src/config').sessionSecret;
    jest.resetModules();
    const secondSecret = require('../src/config').sessionSecret;

    expect(firstSecret).toHaveLength(64);
    expect(secondSecret).toHaveLength(64);
    expect(secondSecret).not.toBe(firstSecret);
  });

  it('should use APP_URL env var when set', () => {
    process.env.APP_URL = 'https://example.com';
    const config = require('../src/config');
    expect(config.appUrl).toBe('https://example.com');
  });

  it('should detect test environment', () => {
    process.env.NODE_ENV = 'test';
    const config = require('../src/config');
    expect(config.isTest).toBe(true);
  });

  it('should default isTest to false', () => {
    delete process.env.NODE_ENV;
    const config = require('../src/config');
    expect(config.isTest).toBe(false);
  });
});

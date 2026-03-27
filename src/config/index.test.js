/**
 * Tests for centralized config module.
 */

const { validate, get, ConfigSchema } = require('./index');

describe('Config Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear module cache and reset config
    delete require.cache[require.resolve('./index')];
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('validates minimal config with defaults', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'this-is-a-32-char-secret-for-testing-only-do-not-use-in-prod';

    const config = validate();
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.JWT_SECRET).toBe(process.env.JWT_SECRET);
  });

  test('overrides defaults', () => {
    process.env.PORT = '8080';
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'prod-secret-32-chars-minimum-required';

    const config = validate();
    expect(config.PORT).toBe(8080);
    expect(config.NODE_ENV).toBe('production');
  });

  test('rejects short JWT_SECRET', () => {
    process.env.JWT_SECRET = 'too-short';
    expect(() => validate()).toThrow(/string/i);
  });

  test('rejects invalid PORT', () => {
    process.env.PORT = 'invalid';
    expect(() => validate()).toThrow(/number/i);
  });

  test('rejects invalid NODE_ENV', () => {
    process.env.NODE_ENV = 'invalid';
    expect(() => validate()).toThrow(/Enum/i);
  });

  test('get() throws if not validated', () => {
    // Mock to clear config
    jest.doMock('./index', () => ({ config: null, get: () => { throw new Error('unvalidated'); } }));
    expect(() => get()).toThrow('not validated');
  });

  test('schema type safety', () => {
    const result = ConfigSchema.parse({
      NODE_ENV: 'test',
      PORT: 3001,
      JWT_SECRET: 'valid-secret',
    });
    expect(result).toMatchObject({ NODE_ENV: 'test', PORT: 3001 });
  });
});


'use strict';

describe('DB knex bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDatabaseUrl;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses lightweight pg client config in test environment', () => {
    process.env.NODE_ENV = 'test';

    const knexMock = jest.fn(() => ({ mocked: true }));
    jest.doMock('knex', () => knexMock);

    const db = require('../../../src/db/knex');

    expect(knexMock).toHaveBeenCalledWith({ client: 'pg' });
    expect(db).toEqual({ mocked: true });
  });

  test('uses configured database URL outside test environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://secure:pass@db:5432/liquifact';

    const knexMock = jest.fn(() => ({ connected: true }));
    jest.doMock('knex', () => knexMock);

    const db = require('../../../src/db/knex');

    expect(knexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'pg',
        connection: 'postgresql://secure:pass@db:5432/liquifact',
      })
    );
    expect(db).toEqual({ connected: true });
  });
});

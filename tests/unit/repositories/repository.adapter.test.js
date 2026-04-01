'use strict';

jest.mock('../../../src/services/soroban', () => ({
  callSorobanContract: jest.fn((handler) => handler()),
}));

const InMemoryInvoiceRepository = require('../../../src/repositories/in-memory-invoice.repository');
const InMemoryEscrowRepository = require('../../../src/repositories/in-memory-escrow.repository');
const SorobanEscrowRepository = require('../../../src/repositories/soroban-escrow.repository');
const {
  createInvoiceRepositoryAdapter,
  createEscrowRepositoryAdapter,
  createRepositoryAdapters,
} = require('../../../src/repositories/repository-adapter');

/**
 * Runs shared invoice repository contract tests.
 *
 * @param {string} title Test title.
 * @param {() => import('../../../src/repositories/invoice.repository')} createRepository Factory for repository instance.
 * @returns {void}
 */
function runInvoiceRepositoryContract(title, createRepository) {
  describe(title, () => {
    /** @type {import('../../../src/repositories/invoice.repository')} */
    let repository;

    beforeEach(() => {
      repository = createRepository();
    });

    test('creates and retrieves an invoice', async () => {
      const created = await repository.create({ amount: 125, customer: 'acme' });
      const fetched = await repository.findById(created.id);

      expect(created.id).toBeDefined();
      expect(fetched).not.toBeNull();
      expect(fetched.id).toBe(created.id);
      expect(fetched.amount).toBe(125);
    });

    test('supports soft delete and restore lifecycle', async () => {
      const created = await repository.create({ amount: 200, customer: 'luna' });

      const softDeleted = await repository.softDelete(created.id);
      expect(softDeleted).not.toBeNull();
      expect(softDeleted.deletedAt).toBeTruthy();

      const activeInvoices = await repository.findAll();
      const allInvoices = await repository.findAll({ includeDeleted: true });

      expect(activeInvoices.find((inv) => inv.id === created.id)).toBeUndefined();
      expect(allInvoices.find((inv) => inv.id === created.id)).toBeDefined();

      const restored = await repository.restore(created.id);
      expect(restored).not.toBeNull();
      expect(restored.deletedAt).toBeNull();
    });

    test('returns null/false for non-existent entities', async () => {
      await expect(repository.findById('missing-id')).resolves.toBeNull();
      await expect(repository.update('missing-id', { status: 'paid' })).resolves.toBeNull();
      await expect(repository.softDelete('missing-id')).resolves.toBeNull();
      await expect(repository.restore('missing-id')).resolves.toBeNull();
      await expect(repository.delete('missing-id')).resolves.toBe(false);
    });
  });
}

/**
 * Runs shared escrow repository contract tests.
 *
 * @param {string} title Test title.
 * @param {() => import('../../../src/repositories/escrow.repository')} createRepository Factory for repository instance.
 * @returns {void}
 */
function runEscrowRepositoryContract(title, createRepository) {
  describe(title, () => {
    /** @type {import('../../../src/repositories/escrow.repository')} */
    let repository;

    beforeEach(() => {
      repository = createRepository();
    });

    test('returns escrow state with expected shape', async () => {
      const state = await repository.getEscrowState('invoice-123');

      expect(state).toEqual(
        expect.objectContaining({
          invoiceId: 'invoice-123',
          status: expect.any(String),
          fundedAmount: expect.any(Number),
        })
      );
    });
  });
}

runInvoiceRepositoryContract('Invoice repository contract: in-memory adapter', () => {
  return createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());
});

runEscrowRepositoryContract('Escrow repository contract: in-memory adapter', () => {
  return createEscrowRepositoryAdapter(new InMemoryEscrowRepository());
});

runEscrowRepositoryContract('Escrow repository contract: soroban adapter', () => {
  return createEscrowRepositoryAdapter(new SorobanEscrowRepository());
});

describe('Repository adapter security', () => {
  test('rejects invalid repository contracts', () => {
    expect(() => {
      createRepositoryAdapters({ invoiceRepo: {}, escrowRepo: {} });
    }).toThrow('missing method');
  });

  test('rejects non-object repositories', () => {
    expect(() => createInvoiceRepositoryAdapter(null)).toThrow('must be a non-null object');
  });

  test('rejects invalid optional method types', () => {
    expect(() => {
      createInvoiceRepositoryAdapter({
        findAll: jest.fn(),
        findById: jest.fn(),
        create: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
        update: 'not-a-function',
      });
    }).toThrow('method must be a function: update');
  });

  test('rejects empty invoice IDs', async () => {
    const invoiceRepo = createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());
    await expect(invoiceRepo.findById('')).rejects.toThrow('invoice id cannot be empty');
  });

  test('rejects non-string and oversized IDs', async () => {
    const invoiceRepo = createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());

    await expect(invoiceRepo.findById(123)).rejects.toThrow('invoice id must be a string');
    await expect(invoiceRepo.findById('x'.repeat(129))).rejects.toThrow('invoice id is too long');
  });

  test('rejects prototype pollution keys in payloads', async () => {
    const invoiceRepo = createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());
    const poisonedPayload = JSON.parse('{"amount":100,"__proto__":{"polluted":true}}');

    await expect(invoiceRepo.create(poisonedPayload)).rejects.toThrow('Payload contains prohibited key: __proto__');
  });

  test('rejects nested prohibited keys inside arrays', async () => {
    const invoiceRepo = createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());
    const payload = {
      amount: 100,
      metadata: [{ safe: true }, { nested: { constructor: { a: 1 } } }],
    };

    await expect(invoiceRepo.create(payload)).rejects.toThrow('Payload contains prohibited key: constructor');
  });

  test('optional methods throw not implemented when missing', async () => {
    const invoiceRepo = createInvoiceRepositoryAdapter({
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ok' }),
      softDelete: jest.fn().mockResolvedValue(null),
      restore: jest.fn().mockResolvedValue(null),
    });

    await expect(invoiceRepo.update('invoice-1', { status: 'paid' })).rejects.toThrow('Method not implemented: update');
    await expect(invoiceRepo.delete('invoice-1')).rejects.toThrow('Method not implemented: delete');
  });

  test('freezes adapted repositories to prevent runtime mutation', () => {
    const invoiceRepo = createInvoiceRepositoryAdapter(new InMemoryInvoiceRepository());

    expect(Object.isFrozen(invoiceRepo)).toBe(true);
  });
});

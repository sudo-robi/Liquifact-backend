const InMemoryInvoiceRepository = require('./in-memory-invoice.repository');
const InMemoryEscrowRepository = require('./in-memory-escrow.repository');
const SorobanEscrowRepository = require('./soroban-escrow.repository');

/**
 * @fileoverview Repository factory for easily switching between persistence implementations.
 * This pattern decouples the app from specific adapter classes.
 */

/**
 * Registry of available repository implementations.
 */
const providers = {
  invoice: {
    memory: InMemoryInvoiceRepository,
  },
  escrow: {
    memory: InMemoryEscrowRepository,
    soroban: SorobanEscrowRepository,
  },
};

/**
 * Creates an instance of an invoice repository based on the environment or provider name.
 * 
 * @param {string} [provider='memory'] The provider to use.
 * @returns {import('./invoice.repository')} A concrete instance of InvoiceRepository.
 */
function createInvoiceRepository(provider = process.env.INVOICE_REPO || 'memory') {
  const RepoClass = providers.invoice[provider] || providers.invoice.memory;
  return new RepoClass();
}

/**
 * Creates an instance of an escrow repository based on the environment or provider name.
 * 
 * @param {string} [provider='soroban'] The provider to use.
 * @returns {import('./escrow.repository')} A concrete instance of EscrowRepository.
 */
function createEscrowRepository(provider = process.env.ESCROW_REPO || 'soroban') {
  const RepoClass = providers.escrow[provider] || providers.escrow.memory;
  return new RepoClass();
}

/**
 * Encapsulated repositories for dependency injection.
 * Provides a central point for configuring and retrieving repositories.
 */
class RepositoryRegistry {
  constructor(options = {}) {
    /** @type {import('./invoice.repository')} */
    this.invoiceRepo = options.invoiceRepo || createInvoiceRepository(options.invoiceProvider);
    /** @type {import('./escrow.repository')} */
    this.escrowRepo = options.escrowRepo || createEscrowRepository(options.escrowProvider);
  }
}

module.exports = {
  createInvoiceRepository,
  createEscrowRepository,
  RepositoryRegistry,
};

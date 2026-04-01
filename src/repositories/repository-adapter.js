'use strict';

/**
 * @fileoverview Repository adapter layer.
 *
 * Provides runtime contract checks and input hardening so business logic can
 * depend on stable repository interfaces rather than concrete persistence
 * implementations.
 */

const PROHIBITED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Ensures a repository object implements required methods.
 *
 * @param {string} name Human-readable repository name.
 * @param {object} repository Candidate implementation.
 * @param {string[]} requiredMethods Required method names.
 * @returns {void}
 * @throws {TypeError} If repository contract is invalid.
 */
function assertRepositoryContract(name, repository, requiredMethods) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError(`${name} repository must be a non-null object`);
  }

  for (const methodName of requiredMethods) {
    if (typeof repository[methodName] !== 'function') {
      throw new TypeError(`${name} repository is missing method: ${methodName}`);
    }
  }
}

/**
 * Ensures optional methods are functions when provided.
 *
 * @param {string} name Human-readable repository name.
 * @param {object} repository Candidate implementation.
 * @param {string[]} optionalMethods Optional method names.
 * @returns {void}
 * @throws {TypeError} If provided optional methods are invalid.
 */
function assertOptionalMethods(name, repository, optionalMethods) {
  for (const methodName of optionalMethods) {
    if (methodName in repository && typeof repository[methodName] !== 'function') {
      throw new TypeError(`${name} repository method must be a function: ${methodName}`);
    }
  }
}

/**
 * Validates invoice IDs and escrow IDs.
 *
 * @param {string} id Entity identifier.
 * @param {string} label Logical label for error messages.
 * @returns {void}
 * @throws {TypeError} If ID format is invalid.
 */
function assertValidId(id, label) {
  if (typeof id !== 'string') {
    throw new TypeError(`${label} id must be a string`);
  }

  const normalized = id.trim();
  if (!normalized) {
    throw new TypeError(`${label} id cannot be empty`);
  }

  if (normalized.length > 128) {
    throw new TypeError(`${label} id is too long`);
  }
}

/**
 * Recursively checks for prototype-pollution-sensitive keys.
 *
 * @param {unknown} value Payload value.
 * @returns {void}
 * @throws {TypeError} If prohibited keys are present.
 */
function assertSafePayload(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafePayload(item);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const key of Object.keys(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new TypeError(`Payload contains prohibited key: ${key}`);
    }
    assertSafePayload(value[key]);
  }
}

/**
 * Builds a secure invoice repository adapter.
 *
 * @param {import('./invoice.repository')} repository Concrete repository implementation.
 * @returns {import('./invoice.repository')} Contract-safe adapter.
 */
function createInvoiceRepositoryAdapter(repository) {
  const requiredMethods = ['findAll', 'findById', 'create', 'softDelete', 'restore'];
  const optionalMethods = ['update', 'delete'];
  assertRepositoryContract('Invoice', repository, requiredMethods);
  assertOptionalMethods('Invoice', repository, optionalMethods);

  /**
   * Delegates invoice list retrieval.
   * @param {object} [filter={}] Query filter.
   * @returns {Promise<import('./invoice.repository').Invoice[]>}
   */
  async function findAll(filter = {}) {
    return repository.findAll(filter);
  }

  /**
   * Delegates invoice retrieval by ID.
   * @param {string} id Invoice identifier.
   * @returns {Promise<import('./invoice.repository').Invoice|null>}
   */
  async function findById(id) {
    assertValidId(id, 'invoice');
    return repository.findById(id);
  }

  /**
   * Delegates invoice creation.
   * @param {Partial<import('./invoice.repository').Invoice>} [invoiceData={}] Invoice payload.
   * @returns {Promise<import('./invoice.repository').Invoice>}
   */
  async function create(invoiceData = {}) {
    assertSafePayload(invoiceData);
    return repository.create(invoiceData);
  }

  /**
   * Delegates invoice updates.
   * @param {string} id Invoice identifier.
   * @param {Partial<import('./invoice.repository').Invoice>} [updateData={}] Update payload.
   * @returns {Promise<import('./invoice.repository').Invoice|null>}
   */
  async function update(id, updateData = {}) {
    assertValidId(id, 'invoice');
    assertSafePayload(updateData);
    if (typeof repository.update !== 'function') {
      throw new Error('Method not implemented: update');
    }
    return repository.update(id, updateData);
  }

  /**
   * Delegates invoice soft deletion.
   * @param {string} id Invoice identifier.
   * @returns {Promise<import('./invoice.repository').Invoice|null>}
   */
  async function softDelete(id) {
    assertValidId(id, 'invoice');
    return repository.softDelete(id);
  }

  /**
   * Delegates invoice restoration.
   * @param {string} id Invoice identifier.
   * @returns {Promise<import('./invoice.repository').Invoice|null>}
   */
  async function restore(id) {
    assertValidId(id, 'invoice');
    return repository.restore(id);
  }

  /**
   * Delegates invoice hard deletion.
   * @param {string} id Invoice identifier.
   * @returns {Promise<boolean>}
   */
  async function remove(id) {
    assertValidId(id, 'invoice');
    if (typeof repository.delete !== 'function') {
      throw new Error('Method not implemented: delete');
    }
    return repository.delete(id);
  }

  return Object.freeze({
    findAll,
    findById,
    create,
    update,
    softDelete,
    restore,
    delete: remove,
  });
}

/**
 * Builds a secure escrow repository adapter.
 *
 * @param {import('./escrow.repository')} repository Concrete repository implementation.
 * @returns {import('./escrow.repository')} Contract-safe adapter.
 */
function createEscrowRepositoryAdapter(repository) {
  const requiredMethods = ['getEscrowState'];
  assertRepositoryContract('Escrow', repository, requiredMethods);

  /**
   * Delegates escrow retrieval by invoice ID.
   * @param {string} invoiceId Invoice identifier.
   * @returns {Promise<import('./escrow.repository').EscrowState>}
   */
  async function getEscrowState(invoiceId) {
    assertValidId(invoiceId, 'invoice');
    return repository.getEscrowState(invoiceId);
  }

  return Object.freeze({
    getEscrowState,
  });
}

/**
 * Creates a pair of secure repository adapters for app use.
 *
 * @param {Object} deps Repository dependencies.
 * @param {import('./invoice.repository')} deps.invoiceRepo Invoice repository implementation.
 * @param {import('./escrow.repository')} deps.escrowRepo Escrow repository implementation.
 * @returns {{invoiceRepo: import('./invoice.repository'), escrowRepo: import('./escrow.repository')}}
 */
function createRepositoryAdapters({ invoiceRepo, escrowRepo }) {
  return {
    invoiceRepo: createInvoiceRepositoryAdapter(invoiceRepo),
    escrowRepo: createEscrowRepositoryAdapter(escrowRepo),
  };
}

module.exports = {
  createInvoiceRepositoryAdapter,
  createEscrowRepositoryAdapter,
  createRepositoryAdapters,
  assertRepositoryContract,
  assertOptionalMethods,
  assertSafePayload,
  assertValidId,
};

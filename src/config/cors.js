/**
 * @fileoverview CORS allowlist parsing and policy for the LiquiFact API.
 *
 * Reads trusted origins from the `CORS_ALLOWED_ORIGINS` environment variable
 * (comma-separated list of exact origins) and builds an `options` object
 * compatible with the `cors` npm package.
 *
 * Behaviour summary:
 *   - Requests with **no Origin header** (curl, Postman, server-to-server) are
 *     always allowed — the `origin` callback receives `undefined` and passes.
 *   - Requests from an **allowed origin** receive normal CORS response headers.
 *   - Requests from a **disallowed origin** receive a 403 Forbidden response
 *     via a dedicated `Error` whose `.isCorsOriginRejected` flag is `true`.
 *   - In `NODE_ENV=development`, when `CORS_ALLOWED_ORIGINS` is not set, a set
 *     of common local development origins is permitted automatically.
 *   - In all other environments, when `CORS_ALLOWED_ORIGINS` is not set, every
 *     browser origin is denied.
 *
 * @module config/cors
 */

'use strict';

const CORS_REJECTION_MESSAGE = 'CORS policy: origin is not allowed.';

/** @type {string[]} Origins allowed when no env var is set during development. */
const DEV_DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Parses `CORS_ALLOWED_ORIGINS` into a trimmed, de-duplicated array of origin
 * strings.
 *
 * @param {string|undefined} raw - Raw value of the environment variable.
 * @returns {string[]} Array of allowed origins.
 */
function parseAllowedOrigins(raw) {
  if (!raw || raw.trim() === '') {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Returns development fallback origins.
 *
 * @returns {string[]} Development fallback origins.
 */
function getDevelopmentFallbackOrigins() {
  return [...DEV_DEFAULT_ORIGINS];
}

/**
 * Resolves allowed origins from environment values.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment values.
 * @returns {string[]} Effective allowlist.
 */
function getAllowedOriginsFromEnv(env = process.env) {
  const fromEnv = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (fromEnv.length > 0) {
    return fromEnv;
  }

  if (env.NODE_ENV === 'development') {
    return getDevelopmentFallbackOrigins();
  }

  return [];
}

/**
 * Backward-compatible alias used by older callers.
 *
 * @returns {string[]|null} Allowlist or null when fail-closed.
 */
function resolveAllowlist() {
  const allowed = getAllowedOriginsFromEnv(process.env);
  return allowed.length > 0 ? allowed : null;
}

/**
 * Sentinel error thrown when an incoming `Origin` is not on the allowlist.
 * The `isCorsOriginRejected` flag lets downstream error handlers identify it
 * without `instanceof` checks across module boundaries.
 *
 * @param {string} [origin] - The rejected origin value.
 * @returns {Error} Annotated error instance.
 */
function createCorsRejectionError(origin) {
  const err = new Error(CORS_REJECTION_MESSAGE);
  err.isCorsOriginRejected = true;
  err.isCorsOriginRejectedError = true;
  err.status = 403;
  err.origin = origin;
  return err;
}

/**
 * Returns `true` if `err` is the dedicated blocked-origin CORS error produced
 * by {@link createCorsRejectionError}.
 *
 * @param {unknown} err - Value to test.
 * @returns {boolean}
 */
function isCorsOriginRejectedError(err) {
  return (
    err !== null &&
    err !== undefined &&
    (err.isCorsOriginRejected === true || err.isCorsOriginRejectedError === true)
  );
}

/**
 * Builds the options object for the `cors` middleware package.
 *
 * The `origin` callback implements exact-match checking against the resolved
 * allowlist.  It calls `callback(null, true)` to approve an origin, and
 * `callback(err)` with the rejection error to deny it.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment values override.
 * @returns {import('cors').CorsOptions} Options ready to pass to `cors()`.
 *
 * @example
 * const cors = require('cors');
 * const { createCorsOptions } = require('./config/cors');
 * app.use(cors(createCorsOptions()));
 */
function createCorsOptions(env = process.env) {
  const allowedOriginsSet = new Set(getAllowedOriginsFromEnv(env));

  /**
   * Validates whether a request origin is permitted by the configured allowlist.
   *
   * @param {string | undefined} origin Incoming request Origin header.
   * @param {(error: Error | null, allow?: boolean) => void} callback CORS callback.
   * @returns {void}
   */
  function validateOrigin(origin, callback) {
    if (!origin || allowedOriginsSet.has(origin)) {
      callback(null, true);
      return;
    }

    callback(createCorsRejectionError(origin));
  }

  return {
    origin: validateOrigin,
  };
}

module.exports = {
  CORS_REJECTION_MESSAGE,
  createCorsRejectionError,
  createCorsOptions,
  getAllowedOriginsFromEnv,
  getDevelopmentFallbackOrigins,
  isCorsOriginRejectedError,
  parseAllowedOrigins,
  resolveAllowlist,
  DEV_DEFAULT_ORIGINS,
};

# LiquiFact Backend

API gateway and server for **LiquiFact** — the global invoice liquidity network on Stellar. This repo provides the Express-based REST API for invoice uploads, escrow state, and (future) Stellar/Horizon integration.

Part of the LiquiFact stack: **frontend** (Next.js) | **backend** (this repo) | **contracts** (Soroban).

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 9+

---

## Setup

1. **Clone the repo**

   ```bash
   git clone <this-repo-url>
   cd liquifact-backend
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env for CORS, Stellar/Horizon, or future DB settings
   ```

---

## Development

| Command               | Description                             |
|-----------------------|-----------------------------------------|
| `npm run dev`         | Start API with watch mode               |
| `npm run start`       | Start API (production-style)           |
| `npm run lint`        | Run ESLint on `src/`                   |
| `npm run lint:fix`    | Auto-fix linting issues                |
| `npm test`            | Run unit tests (Vitest)                |
| `npm run test:coverage`| Run tests with coverage report         |

Default port: **3001**. After starting:

- Health: [http://localhost:3001/health](http://localhost:3001/health)
- API info: [http://localhost:3001/api](http://localhost:3001/api)
- Invoices: [http://localhost:3001/api/invoices](http://localhost:3001/api/invoices)
  - `GET /api/invoices` - List active invoices
  - `GET /api/invoices?includeDeleted=true` - List all invoices
  - `POST /api/invoices` - Create invoice
  - `DELETE /api/invoices/:id` - Soft delete invoice
  - `PATCH /api/invoices/:id/restore` - Restore deleted invoice

---

## Code Quality & Testing

### ESLint Rule Hardening
We enforce strict linting rules using `eslint:recommended` and `eslint-plugin-security`. All code must include JSDoc comments for better maintainability.

- **Local Workflow**: Before committing, run `npm run lint:fix` to automatically address style issues.
- **CI Enforcement**: The CI pipeline will fail if linting errors are present or if test coverage falls below **95%**.

### Testing
We use **Vitest** and **Supertest** for testing.
- Run tests: `npm test`
- Check coverage: `npm run test:coverage`

Current coverage targets: **>95% Lines and Statements**.

---

## Authentication

Protected endpoints (such as invoice mutations and escrow operations) require a JSON Web Token (JWT) in the `Authorization` header:

```http
Authorization: Bearer <jwt_token_here>
```

The middleware authenticates the token against the `JWT_SECRET` environment variable (defaults to `test-secret` for local development). Unauthenticated requests will be rejected with a `401 Unauthorized` status.

---

## Rate Limiting

The API implements request throttling to prevent abuse:

- **Global Limit**: 100 requests per 15 minutes per IP or User ID.
- **Sensitive Operations**: (Invoice uploads, Escrow writes) 10 requests per hour per IP.

Clients exceeding these limits will receive a `429 Too Many Requests` response. Check the standard `RateLimit-*` headers for your current quota and reset time.

---

## Tenant-Aware Data Isolation
- **Overview**
Every /api/* route enforces tenant-scoped isolation. A caller's tenant identity is resolved once per request by the middleware chain and then applied to every read and write operation. No route handler ever accepts a tenant ID from the request body — the tenant is always derived from the verified middleware context.


- **Middleware chain**
All protected routes use this stack:
[globalLimiter] → [authenticateToken] → [extractTenant] → route handler

| Step                  | Responsibility                                   |
|-----------------------|--------------------------------------------------|
| `globalLimiter`       | Rate limiting (existing)                         |
| `authenticateToken`   | Validates JWT, attaches req.user                 |
| `extractTenant`       | Resolves req.tenantId from header or JWT claim   |


- **Tenant ID resolution**
extractTenant resolves the tenant in priority order:

x-tenant-id request header — for service-to-service / API-key flows
req.user.tenantId JWT claim — set by authenticateToken

If neither yields a valid identifier, the request is rejected immediately with 400 Bad Request. The server never falls back to a default tenant.


- **Data isolation guarantee**
Invoices are stored in a nested Map<tenantId, Map<invoiceId, Invoice>>. Every repository function requires tenantId as its first argument and queries only that tenant's bucket:
Tenant A's data  →  { inv_001, inv_002 }
Tenant B's data  →  { inv_003, inv_004 }
A caller from Tenant B holding a valid invoice ID from Tenant A will always receive 404 Not Found — the invoice is simply invisible outside its owning tenant's scope.

- **Escrow validation**
Before forwarding to the Soroban contract, the escrow endpoint verifies the invoiceId exists in the requesting tenant's scope. A cross-tenant guess returns 404 without making any contract call.

- **API Reference**:
| Method          | Path                                | Auth/Tenat  | Decription                  |
|-----------------|-------------------------------------|-------------|-----------------------------|
| `GET`           | `health`                            | None        | Health check                |
| `GET`           | `api`                               | None        | Endpoint listing            |
| `GET`           | `api/invoices`                      | Yes         | List tenant invoices        |
| `POST`          | `api/invoices`                      | Yes         | Create tenant invoice       |
| `DELETE`        | `/api/invoices/:id`                 | Yes         | Soft delete invoice         |
| `PATCH`         | `/api/invoices/:id/restore`         | Yes         | Restore Soft deleted invoice|
| `GET`           | `/api/escrow/:invoiceId`            | Yes         | Read escrow data            |

- **Response Headers**:
| Header          | Required On                         |  Decription       |
|-----------------|-------------------------------------|-------------------|
| `x-tenant-id`   | All routes                          | Tenant identifier | 


- **Security Notes**:
Teant id is never read from `req.body`

## Configuration

### CORS Allowlist

The API enforces an environment-driven CORS allowlist for browser-originated requests.

- `CORS_ALLOWED_ORIGINS`: Comma-separated list of trusted frontend origins.
- Example:
  `CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`

Behavior:
- Requests without an `Origin` header are allowed, as it can be curl, postman, etc. 
- Requests from allowed origins receive normal CORS headers.
- Requests from disallowed origins are rejected with `403 Forbidden`.
- Origin matching is exact only. Wildcards and regex patterns are not supported.

Development default:
- If `NODE_ENV=development` and `CORS_ALLOWED_ORIGINS` is not set, common local development origins are allowed by default.

Production default:
- If `CORS_ALLOWED_ORIGINS` is not set outside development, browser origins are denied by default.

---

## Project structure

```
liquifact-backend/
├── src/
│   ├── config/
│   │   └── cors.js     # CORS allowlist parsing and policy
│   ├── services/
│   │   └── soroban.js  # Contract interaction wrappers
│   ├── utils/
│   │   └── retry.js    # Exponential backoff utility
│   ├── app.js          # Express app, middleware, routes
│   └── index.js        # Runtime bootstrap
├── .env.example        # Env template
├── eslint.config.js
└── package.json
```

---

## Resiliency & Retries

To ensure reliable communication with Soroban contract provider APIs, this backend implements a robust **Retry and Backoff** mechanism (`src/utils/retry.js`). 

### Key Features
- **Exponential Backoff (`withRetry`)**: Automatically retries transient errors (e.g., HTTP 429, 502, 503, 504, network timeouts).
- **Jitter**: Adds ±20% randomness to the delay to prevent thundering herd problems.
- **Security Caps**:
  - `maxRetries` is hard-capped at 10 to prevent unbounded retry loops.
  - `maxDelay` is hard-capped to 60,000ms (1 minute).
  - `baseDelay` is hard-capped to 10,000ms.
- **Contract Integration**: `src/services/soroban.js` wraps raw API calls securely with this utility, ensuring all escrow and invoice state interactions are fault-tolerant.

---

## CI/CD

GitHub Actions runs on every push and pull request to `main`:

- **Lint** — `npm run lint`
- **Tests** — `npm test`
- **Build check** — `node --check src/index.js` (syntax)

Ensure your branch passes these before opening a PR.

---

## Contributing

1. **Fork** the repo and clone your fork.
2. **Create a branch** from `main`: `git checkout -b feature/your-feature` or `fix/your-fix`.
3. **Setup locally**: `npm ci`, optionally `cp .env.example .env`.
4. **Make changes**. Keep the style consistent:
   - Run `npm run lint` and fix any issues.
   - Use the existing Express/route patterns in `src/index.js`.
5. **Commit** with clear messages (e.g. `feat: add X`, `fix: Y`).
6. **Push** to your fork and open a **Pull Request** to `main`.
7. Wait for CI to pass and address any review feedback.

We welcome docs improvements, bug fixes, and new API endpoints aligned with the LiquiFact product (invoices, escrow, Stellar integration).

---

## License

MIT (see root LiquiFact project for full license).

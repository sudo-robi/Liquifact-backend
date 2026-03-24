const express = require('express');
const cors = require('cors');
const invoiceRoutes = require('./routes/invoiceRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'liquifact-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'LiquiFact API',
    description: 'Global Invoice Liquidity Network on Stellar',
    endpoints: {
      health: 'GET /health',
      invoices: 'GET /api/invoices/:id', // Updated to show new endpoint
    },
  });
});

// Register routes
app.use('/api/invoices', invoiceRoutes);

// Placeholder: Escrow (to be wired to Soroban)
app.get('/api/escrow/:invoiceId', (req, res) => {
  const { invoiceId } = req.params;
  res.json({
    data: { invoiceId, status: 'not_found', fundedAmount: 0 },
    message: 'Escrow state will be read from Soroban contract.',
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, _next) => {
  // Simple error handler for non-403 errors
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
    ...(status === 500 && { details: err.message }),
  });
});

module.exports = app;

/**
 * LiquiFact API Gateway
 * Main entry point for the Express server.
 */

const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`LiquiFact API running at http://localhost:${PORT}`);
});

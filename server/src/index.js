require('dotenv').config();
const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');
const { router: authRouter, requireAuth } = require('./auth');
const readingsRouter = require('./readings');
const reportsRouter = require('./reports');

// Fail fast: without a JWT secret, logins would fail with a confusing 500.
if (!process.env.JWT_SECRET) {
  console.error(
    'Missing JWT_SECRET. Copy server/.env.example to server/.env and set JWT_SECRET to a long random string.'
  );
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'sweety-api' }));
app.use('/auth', authRouter);
app.use('/readings', requireAuth, readingsRouter);
app.use('/reports', requireAuth, reportsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler: malformed JSON (and anything else unexpected)
// becomes a JSON error, never an HTML stack trace.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sweety API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });

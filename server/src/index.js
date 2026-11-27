require('dotenv').config();
const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');
const { router: authRouter, requireAuth } = require('./auth');
const readingsRouter = require('./readings');
const reportsRouter = require('./reports');

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'sweety-api' }));
app.use('/auth', authRouter);
app.use('/readings', requireAuth, readingsRouter);
app.use('/reports', requireAuth, reportsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

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

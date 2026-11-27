require('dotenv').config();
const { Pool, types } = require('pg');

// Return Postgres DATE columns as plain 'YYYY-MM-DD' strings instead of
// JS Date objects. A Date at local midnight serialises to the previous day
// in UTC (e.g. 2026-11-27 -> "2026-11-26T18:30:00.000Z"), which shifted
// readings by a day in API responses and in the UI.
types.setTypeParser(1082, (v) => v);

// Tests use a separate database via TEST_DATABASE_URL (see README).
const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'sweety',
      user: process.env.DB_USER || 'sweety',
      password: process.env.DB_PASSWORD || '',
    });

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
});

module.exports = pool;

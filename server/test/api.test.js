// API tests (node:test — no extra dependencies).
// Runs the real server against a separate test database and talks to it
// over HTTP, so these tests cover exactly what the frontend sees.
//
//   npm test
//
// The test database is `sweety_test` (see README). Override with
// TEST_DATABASE_URL. The server under test runs on port 5001 with a
// throwaway JWT secret.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = 5001;
const BASE = `http://localhost:${PORT}`;
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  `postgres://sweety:${encodeURIComponent(process.env.DB_PASSWORD || '')}@localhost:5432/sweety_test`;

const admin = new Pool({ connectionString: TEST_DB_URL });
let server;

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('Test server did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
}

before(async () => {
  server = spawn('node', ['src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'test-secret-only',
      JWT_EXPIRES_IN: '1h',
      TEST_DATABASE_URL: TEST_DB_URL,
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(async () => {
  server.kill();
  await admin.end();
});

beforeEach(async () => {
  await admin.query('TRUNCATE users, readings RESTART IDENTITY CASCADE');
});

let n = 0;
async function register(name = 'Test User') {
  n += 1;
  const email = `user${n}@test.local`;
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'secret1' }),
  });
  const data = await res.json();
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(data)}`);
  return { ...data, email };
}

async function createReading(token, body) {
  const res = await fetch(`${BASE}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('register + login return a token and the password is stored hashed', async () => {
  const { token, user, email } = await register();
  assert.ok(token);
  assert.equal(user.email, email);
  assert.equal(user.password_hash, undefined, 'password hash must never be returned');

  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret1' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);

  const { rows } = await admin.query('SELECT password_hash FROM users WHERE email = $1', [email]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].password_hash, 'secret1');
  assert.match(rows[0].password_hash, /^\$2[ab]\$/);
});

test('validation: missing value', async () => {
  const { token } = await register();
  const { status, data } = await createReading(token, {
    reading_date: '2026-11-20',
    slot: 'morning',
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Please enter a glucose value.');
});

test('validation: value must be a whole number between 40 and 600', async () => {
  const { token } = await register();
  for (const bad of [39, 601, 110.5, 'abc', '0x78']) {
    const { status, data } = await createReading(token, {
      reading_date: '2026-11-20',
      slot: 'morning',
      value: bad,
    });
    assert.equal(status, 400, `value ${bad} should be rejected`);
    assert.equal(data.error, 'Value must be between 40 and 600 mg/dl.');
  }
  const { status } = await createReading(token, {
    reading_date: '2026-11-20',
    slot: 'morning',
    value: '120',
  });
  assert.equal(status, 201, 'numeric string "120" is accepted');
});

test('validation: duplicate slot, max 4/day, future date', async () => {
  const { token } = await register();
  const day = '2026-11-20';
  await createReading(token, { reading_date: day, slot: 'morning', value: 120 });

  let r = await createReading(token, { reading_date: day, slot: 'morning', value: 130 });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'You already have a Morning (fasting) reading for this date.');

  for (const [slot, value] of [
    ['after_breakfast', 150],
    ['after_lunch', 140],
    ['after_dinner', 160],
  ]) {
    r = await createReading(token, { reading_date: day, slot, value });
    assert.equal(r.status, 201, `creating ${slot} failed: ${JSON.stringify(r.data)}`);
  }
  // Day is full (4 readings) and the slot is taken: duplicate wins over max-4.
  r = await createReading(token, { reading_date: day, slot: 'morning', value: 130 });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'You already have a Morning (fasting) reading for this date.');

  r = await createReading(token, { reading_date: '2026-11-21', slot: 'morning', value: 100 });
  assert.equal(r.status, 201);
  // Move that reading onto the full day: duplicate (morning taken) fires first.
  const move = await fetch(`${BASE}/readings/${r.data.reading.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reading_date: day, slot: 'after_lunch', value: 100 }),
  });
  assert.equal(move.status, 400);
  assert.equal(
    (await move.json()).error,
    'You already have a After lunch reading for this date.'
  );

  r = await createReading(token, { reading_date: '2999-01-01', slot: 'morning', value: 120 });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Date cannot be in the future.');

  r = await createReading(token, { reading_date: '2026-02-30', slot: 'morning', value: 120 });
  assert.equal(r.status, 400, 'impossible date must be a 400, not a 500');
});

test('user A cannot read, edit or delete user B’s reading', async () => {
  const a = await register('User A');
  const b = await register('User B');
  const created = await createReading(b.token, {
    reading_date: '2026-11-20',
    slot: 'morning',
    value: 120,
  });
  assert.equal(created.status, 201);
  const id = created.data.reading.id;

  const list = await fetch(`${BASE}/readings`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const listData = await list.json();
  assert.deepEqual(listData.readings, [], 'A must not see B’s readings');

  const put = await fetch(`${BASE}/readings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ reading_date: '2026-11-20', slot: 'morning', value: 130 }),
  });
  assert.equal(put.status, 404);

  const del = await fetch(`${BASE}/readings/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${a.token}` },
  });
  assert.equal(del.status, 404);

  const stillThere = await fetch(`${BASE}/readings`, {
    headers: { Authorization: `Bearer ${b.token}` },
  });
  assert.equal((await stillThere.json()).readings.length, 1, 'B’s reading must survive');
});

test('reports: daily / month-to-date / monthly maths and empty state', async () => {
  const { token } = await register();
  const rows = [
    ['2026-11-15', 'morning', 100],
    ['2026-11-15', 'after_breakfast', 150],
    ['2026-11-15', 'after_lunch', 120],
    ['2026-11-10', 'morning', 90],
    ['2026-10-20', 'morning', 110],
    ['2026-10-25', 'after_dinner', 130],
  ];
  for (const [reading_date, slot, value] of rows) {
    const r = await createReading(token, { reading_date, slot, value });
    assert.equal(r.status, 201, `seeding ${reading_date} ${slot} failed`);
  }

  async function report(kind, date) {
    const res = await fetch(`${BASE}/reports/${kind}?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    return res.json();
  }

  const daily = await report('daily', '2026-11-15');
  assert.deepEqual(
    { highest: daily.highest, lowest: daily.lowest, average: daily.average, count: daily.count },
    { highest: 150, lowest: 100, average: 123.3, count: 3 }
  );
  assert.deepEqual(
    daily.readings.map((r) => r.slot),
    ['morning', 'after_breakfast', 'after_lunch']
  );

  const mtd = await report('month-to-date', '2026-11-15');
  assert.deepEqual(
    { highest: mtd.highest, lowest: mtd.lowest, average: mtd.average, count: mtd.count },
    { highest: 150, lowest: 90, average: 115, count: 4 }
  );
  assert.equal(mtd.start_date, '2026-11-01');
  assert.equal(mtd.end_date, '2026-11-15');

  const monthly = await report('monthly', '2026-11-15');
  assert.deepEqual(
    {
      highest: monthly.highest,
      lowest: monthly.lowest,
      average: monthly.average,
      count: monthly.count,
    },
    { highest: 130, lowest: 110, average: 120, count: 2 }
  );
  assert.equal(monthly.start_date, '2026-10-01');
  assert.equal(monthly.end_date, '2026-10-31');

  const empty = await report('daily', '2026-11-01');
  assert.equal(empty.count, 0);
  assert.equal(empty.highest, null);
  assert.equal(empty.lowest, null);
  assert.equal(empty.average, null);
});

test('reading_date comes back as a plain YYYY-MM-DD string', async () => {
  const { token } = await register();
  const created = await createReading(token, {
    reading_date: '2026-11-20',
    slot: 'morning',
    value: 120,
  });
  assert.equal(created.data.reading.reading_date, '2026-11-20');
});

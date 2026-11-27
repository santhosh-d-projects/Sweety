// Seed script: creates the demo user and sample readings.
// Idempotent — run it as many times as you like; existing rows are updated,
// never duplicated. All dates are relative to today, so the daily,
// month-to-date and monthly reports always have data.
//
//   npm run seed
//   Demo login: demo@sweety.test / Demo@1234
const bcrypt = require('bcrypt');
const pool = require('./db');
const migrate = require('./migrate');
const { todayIST } = require('./slots');

const DEMO_USER = { name: 'Demo User', email: 'demo@sweety.test', password: 'Demo@1234' };

function fmt(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Sample readings: [days offset from today, slot, value].
// Covers today, a few days this month, and several days last month.
// Values include 42 and 595 (near the 40 / 600 limits, still valid).
function sampleReadings(today) {
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? { y: y - 1, mo: 12 } : { y, mo: m - 1 };
  const lastPrev = new Date(Date.UTC(prev.y, prev.mo, 0)).getUTCDate();
  const prevDay = (day) => fmt(prev.y, prev.mo, Math.min(day, lastPrev));

  return [
    [addDays(today, 0), 'morning', 118],
    [addDays(today, 0), 'after_lunch', 145],
    [addDays(today, -1), 'morning', 105],
    [addDays(today, -1), 'after_breakfast', 152],
    [addDays(today, -1), 'after_dinner', 138],
    [addDays(today, -3), 'morning', 98],
    [addDays(today, -3), 'after_lunch', 171],
    [addDays(today, -3), 'after_dinner', 121],
    [addDays(today, -6), 'morning', 110],
    [addDays(today, -6), 'after_breakfast', 139],
    [addDays(today, -6), 'after_lunch', 158],
    [addDays(today, -6), 'after_dinner', 132],
    [addDays(today, -10), 'morning', 42],
    [addDays(today, -10), 'after_dinner', 595],
    [prevDay(5), 'morning', 115],
    [prevDay(5), 'after_breakfast', 148],
    [prevDay(12), 'morning', 126],
    [prevDay(12), 'after_lunch', 165],
    [prevDay(12), 'after_dinner', 141],
    [prevDay(20), 'morning', 101],
    [prevDay(20), 'after_breakfast', 133],
    [prevDay(lastPrev), 'morning', 119],
    [prevDay(lastPrev), 'after_lunch', 154],
    [prevDay(lastPrev), 'after_dinner', 127],
  ];
}

async function seed() {
  await migrate();

  const hash = await bcrypt.hash(DEMO_USER.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, email`,
    [DEMO_USER.name, DEMO_USER.email, hash]
  );
  const user = rows[0];

  const today = todayIST();
  const readings = sampleReadings(today);
  for (const [date, slot, value] of readings) {
    await pool.query(
      `INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, reading_date, slot) DO UPDATE SET value = EXCLUDED.value`,
      [user.id, date, slot, value]
    );
  }

  console.log(`Seeded demo user ${user.email} with ${readings.length} sample readings.`);
  console.log('Demo login:');
  console.log('  Email:    demo@sweety.test');
  console.log('  Password: Demo@1234');
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = seed;

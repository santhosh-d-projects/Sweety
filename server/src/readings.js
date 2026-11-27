// Readings CRUD. Every query is scoped by the logged-in user_id, so a user
// only ever sees their own readings.
// Validation error strings are EXACT — they are the same strings Kenpath's
// spec requires and the frontend shows them verbatim.
// Check order on create: value required/range -> slot valid -> date valid
// -> future date -> duplicate slot -> max 4/day. On edit the same rules
// run, but the reading being edited is excluded from the duplicate and
// max-4 counts. The DB unique constraint (user_id, reading_date, slot) is
// the final guard against races; a 23505 is turned into the duplicate
// message, never a 500.
const express = require('express');
const pool = require('./db');
const { SLOTS, SLOT_KEYS, todayIST, isValidDateString } = require('./slots');

const router = express.Router();

// Parse the glucose value. Accepts a JSON number or a numeric string like
// "120" (coerced the same way every time). Rejects anything else —
// including decimals, hex ("0x78") and scientific notation ("1e2") —
// with the range message. Returns { value } or { error }.
function parseValue(value) {
  if (value === undefined || value === null || value === '') {
    return { error: 'Please enter a glucose value.' };
  }
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    n = Number(value.trim());
  } else {
    return { error: 'Value must be between 40 and 600 mg/dl.' };
  }
  if (!Number.isInteger(n) || n < 40 || n > 600) {
    return { error: 'Value must be between 40 and 600 mg/dl.' };
  }
  return { value: n };
}

// Validate the field-level rules (everything except duplicate / max-4,
// which need DB lookups). Returns { value } or { error }.
function validateFields({ value, reading_date, slot }) {
  const parsed = parseValue(value);
  if (parsed.error) return parsed;
  if (!SLOT_KEYS.includes(slot)) {
    return { error: 'Please select a time slot.' };
  }
  if (!isValidDateString(reading_date)) {
    return { error: 'Please select a valid date.' };
  }
  if (reading_date > todayIST()) {
    return { error: 'Date cannot be in the future.' };
  }
  return parsed;
}

function duplicateMessage(slot) {
  return `You already have a ${SLOTS[slot]} reading for this date.`;
}

// A non-numeric :id is not a reading — 404, never a Postgres error.
function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Reading not found.' });
    return null;
  }
  return id;
}

// List own readings, newest first.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, reading_date, slot, value, created_at, updated_at
       FROM readings WHERE user_id = $1
       ORDER BY reading_date DESC, created_at DESC`,
      [req.user.id]
    );
    return res.json({ readings: rows });
  } catch (err) {
    console.error('List readings error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/', async (req, res) => {
  const { value, reading_date, slot } = req.body || {};

  const checked = validateFields({ value, reading_date, slot });
  if (checked.error) return res.status(400).json({ error: checked.error });

  try {
    const dup = await pool.query(
      'SELECT id FROM readings WHERE user_id = $1 AND reading_date = $2 AND slot = $3',
      [req.user.id, reading_date, slot]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: duplicateMessage(slot) });
    }

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM readings WHERE user_id = $1 AND reading_date = $2',
      [req.user.id, reading_date]
    );
    if (count.rows[0].n >= 4) {
      return res.status(400).json({ error: 'You can add only 4 readings per day.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO readings (user_id, reading_date, slot, value)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reading_date, slot, value, created_at, updated_at`,
      [req.user.id, reading_date, slot, checked.value]
    );
    return res.status(201).json({ reading: rows[0] });
  } catch (err) {
    // Unique (user_id, reading_date, slot) violation — same message as the
    // in-code duplicate check.
    if (err.code === '23505') {
      return res.status(400).json({ error: duplicateMessage(slot) });
    }
    console.error('Create reading error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/:id', async (req, res) => {
  const { value, reading_date, slot } = req.body || {};
  const id = parseId(req, res);
  if (id === null) return;

  const checked = validateFields({ value, reading_date, slot });
  if (checked.error) return res.status(400).json({ error: checked.error });

  try {
    const existing = await pool.query(
      'SELECT id FROM readings WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reading not found.' });
    }

    // Duplicate and max-4 checks exclude the reading being edited.
    const clash = await pool.query(
      `SELECT id FROM readings
       WHERE user_id = $1 AND reading_date = $2 AND slot = $3 AND id <> $4`,
      [req.user.id, reading_date, slot, id]
    );
    if (clash.rows.length > 0) {
      return res.status(400).json({ error: duplicateMessage(slot) });
    }

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM readings
       WHERE user_id = $1 AND reading_date = $2 AND id <> $3`,
      [req.user.id, reading_date, id]
    );
    if (count.rows[0].n >= 4) {
      return res.status(400).json({ error: 'You can add only 4 readings per day.' });
    }

    const { rows } = await pool.query(
      `UPDATE readings SET reading_date = $1, slot = $2, value = $3,
       updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, reading_date, slot, value, created_at, updated_at`,
      [reading_date, slot, checked.value, id, req.user.id]
    );
    return res.json({ reading: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: duplicateMessage(slot) });
    }
    console.error('Update reading error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM readings WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Reading not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete reading error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;

// Readings CRUD. Every query is scoped by the logged-in user_id, so a user
// only ever sees their own readings.
// Validation error strings are EXACT — they are the same strings Kenpath's
// spec requires and the frontend shows them verbatim.
const express = require('express');
const pool = require('./db');
const { SLOTS, SLOT_KEYS, todayIST, isValidDateString } = require('./slots');

const router = express.Router();

// Validate a reading payload. Returns an error string or null.
// `countForDay` is the number of readings this user already has on the date
// (used only on create, to enforce the 4-per-day limit).
function validateReading({ value, reading_date, slot }, countForDay = null) {
  if (value === undefined || value === null || value === '') {
    return 'Please enter a glucose value.';
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 40 || n > 600) {
    return 'Value must be between 40 and 600 mg/dl.';
  }
  if (!isValidDateString(reading_date)) {
    return 'Please select a valid date.';
  }
  if (reading_date > todayIST()) {
    return 'Date cannot be in the future.';
  }
  if (!SLOT_KEYS.includes(slot)) {
    return 'Please select a time slot.';
  }
  if (countForDay !== null && countForDay >= 4) {
    return 'You can add only 4 readings per day.';
  }
  return null;
}

function duplicateMessage(slot) {
  return `You already have a ${SLOTS[slot]} reading for this date.`;
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

  const error = validateReading({ value, reading_date, slot });
  if (error) return res.status(400).json({ error });

  try {
    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM readings WHERE user_id = $1 AND reading_date = $2',
      [req.user.id, reading_date]
    );
    const dayError = validateReading({ value, reading_date, slot }, count.rows[0].n);
    if (dayError) return res.status(400).json({ error: dayError });

    const { rows } = await pool.query(
      `INSERT INTO readings (user_id, reading_date, slot, value)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reading_date, slot, value, created_at, updated_at`,
      [req.user.id, reading_date, slot, Number(value)]
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
  const id = Number(req.params.id);

  const error = validateReading({ value, reading_date, slot });
  if (error) return res.status(400).json({ error });

  try {
    const existing = await pool.query(
      'SELECT id FROM readings WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reading not found.' });
    }

    const clash = await pool.query(
      `SELECT id FROM readings
       WHERE user_id = $1 AND reading_date = $2 AND slot = $3 AND id <> $4`,
      [req.user.id, reading_date, slot, id]
    );
    if (clash.rows.length > 0) {
      return res.status(400).json({ error: duplicateMessage(slot) });
    }

    const { rows } = await pool.query(
      `UPDATE readings SET reading_date = $1, slot = $2, value = $3,
       updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, reading_date, slot, value, created_at, updated_at`,
      [reading_date, slot, Number(value), id, req.user.id]
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
  const id = Number(req.params.id);
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

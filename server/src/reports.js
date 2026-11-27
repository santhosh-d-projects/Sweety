// Reports: daily, month-to-date and monthly (previous month).
// Every query is scoped by the logged-in user_id, so a user only ever
// sees their own readings. Each report returns highest, lowest, average
// (rounded to 1 decimal) and count; with no readings those stats are
// null / 0 and the frontend shows a friendly empty state.
const express = require('express');
const pool = require('./db');
const { SLOTS, todayIST, isValidDateString } = require('./slots');

const router = express.Router();

const SLOT_ORDER = ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'];

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Ranges for the three reports, given the selected (reference) date.
// Daily: that date only. Month-to-date: 1st of the month to the date.
// Monthly: the whole previous calendar month.
function rangeFor(kind, dateStr) {
  const d = parseDate(dateStr);
  if (kind === 'daily') {
    return { start: dateStr, end: dateStr };
  }
  if (kind === 'month-to-date') {
    return { start: formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), end: dateStr };
  }
  // monthly: previous month
  const firstPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const lastPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return { start: formatDate(firstPrev), end: formatDate(lastPrev) };
}

async function buildReport(req, res, kind, title) {
  const date = req.query.date;
  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'Please select a valid date.' });
  }
  if (date > todayIST()) {
    return res.status(400).json({ error: 'Date cannot be in the future.' });
  }
  const { start, end } = rangeFor(kind, date);
  try {
    const { rows } = await pool.query(
      `SELECT id, reading_date, slot, value
       FROM readings WHERE user_id = $1 AND reading_date >= $2 AND reading_date <= $3
       ORDER BY reading_date ASC, created_at ASC`,
      [req.user.id, start, end]
    );
    const values = rows.map((r) => r.value);
    const count = values.length;
    const average =
      count === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / count) * 10) / 10;
    // Daily report lists each reading with its slot, in slot order.
    const readings =
      kind === 'daily'
        ? rows
            .slice()
            .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
            .map((r) => ({ id: r.id, reading_date: r.reading_date, slot: r.slot, slot_label: SLOTS[r.slot], value: r.value }))
        : undefined;
    return res.json({
      report: title,
      date,
      start_date: start,
      end_date: end,
      highest: count === 0 ? null : Math.max(...values),
      lowest: count === 0 ? null : Math.min(...values),
      average,
      count,
      ...(readings ? { readings } : {}),
    });
  } catch (err) {
    console.error('Report error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

router.get('/daily', (req, res) => buildReport(req, res, 'daily', 'Daily'));
router.get('/month-to-date', (req, res) => buildReport(req, res, 'month-to-date', 'Month to date'));
router.get('/monthly', (req, res) => buildReport(req, res, 'monthly', 'Monthly (previous month)'));

module.exports = router;

// Slot keys stored in the DB and their display names (shown in the UI and
// in validation messages).
const SLOTS = {
  morning: 'Morning (fasting)',
  after_breakfast: 'After breakfast',
  after_lunch: 'After lunch',
  after_dinner: 'After dinner',
};

const SLOT_KEYS = Object.keys(SLOTS);

// Today's date (YYYY-MM-DD) in Asia/Kolkata — the user's timezone — so a
// reading dated "today" is never wrongly rejected as a future date.
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// A real calendar date in YYYY-MM-DD form. A regex + Date.parse alone is
// not enough: "2026-02-30" parses (JS rolls it to 2 Mar) and then fails
// inside Postgres with a 500. The round-trip check below rejects it.
function isValidDateString(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

module.exports = { SLOTS, SLOT_KEYS, todayIST, isValidDateString };

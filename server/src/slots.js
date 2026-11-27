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

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

module.exports = { SLOTS, SLOT_KEYS, todayIST, isValidDateString };

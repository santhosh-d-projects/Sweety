const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('sweety_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('sweety_token', token);
  else localStorage.removeItem('sweety_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const api = {
  register: (name, email, password) =>
    request('/auth/register', { method: 'POST', body: { name, email, password }, auth: false }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  listReadings: () => request('/readings'),
  createReading: (reading) => request('/readings', { method: 'POST', body: reading }),
  updateReading: (id, reading) => request(`/readings/${id}`, { method: 'PUT', body: reading }),
  deleteReading: (id) => request(`/readings/${id}`, { method: 'DELETE' }),
  dailyReport: (date) => request(`/reports/daily?date=${date}`),
  monthToDateReport: (date) => request(`/reports/month-to-date?date=${date}`),
  monthlyReport: (date) => request(`/reports/monthly?date=${date}`),
};

export const SLOTS = [
  { key: 'morning', label: 'Morning (fasting)' },
  { key: 'after_breakfast', label: 'After breakfast' },
  { key: 'after_lunch', label: 'After lunch' },
  { key: 'after_dinner', label: 'After dinner' },
];

export function slotLabel(key) {
  return (SLOTS.find((s) => s.key === key) || {}).label || key;
}

// Today's date (YYYY-MM-DD) in the browser's local timezone.
export function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

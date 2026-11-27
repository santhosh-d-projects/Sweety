import { useEffect, useState } from 'react';
import { api, setToken, SLOTS, slotLabel, todayLocal } from './api';

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h1>Sweety</h1>
      <p className="subtitle">Blood glucose tracker</p>
      <div className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Log in
        </button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Register
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}

function ReadingForm({ initial, onSave, onCancel }) {
  const [date, setDate] = useState(initial?.reading_date?.slice(0, 10) || todayLocal());
  const [slot, setSlot] = useState(initial?.slot || 'morning');
  const [value, setValue] = useState(initial?.value != null ? String(initial.value) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({ reading_date: date, slot, value: value === '' ? '' : Number(value) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="reading-form" onSubmit={submit}>
      <label>
        Date
        <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Time slot
        <select value={slot} onChange={(e) => setSlot(e.target.value)}>
          {SLOTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Glucose (mg/dl)
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 110"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add reading'}
        </button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function ReportCard({ title, range, report, loading }) {
  return (
    <div className="card report-card">
      <h3>{title}</h3>
      <p className="muted">{range}</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && (!report || report.count === 0) && (
        <p className="muted">No readings in this period yet — add one above and it will show up here.</p>
      )}
      {!loading && report && report.count > 0 && (
        <div>
          <p>
            <strong>Highest:</strong> {report.highest} mg/dl · <strong>Lowest:</strong>{' '}
            {report.lowest} mg/dl
          </p>
          <p>
            <strong>Average:</strong> {report.average} mg/dl · <strong>Readings:</strong>{' '}
            {report.count}
          </p>
          {report.readings && (
            <ul className="reading-list">
              {report.readings.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.value} mg/dl</strong> · {r.slot_label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ReportsSection({ refreshKey }) {
  const [date, setDate] = useState(todayLocal());
  const [daily, setDaily] = useState(null);
  const [mtd, setMtd] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([api.dailyReport(date), api.monthToDateReport(date), api.monthlyReport(date)])
      .then(([d, m, mo]) => {
        if (cancelled) return;
        setDaily(d);
        setMtd(m);
        setMonthly(mo);
      })
      .catch((err) => {
        if (!cancelled) {
          setDaily(null);
          setMtd(null);
          setMonthly(null);
          setError(err.message || 'Could not load reports.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey]);

  function fmt(s) {
    if (!s) return '';
    return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="card">
      <h2>Reports</h2>
      <label>
        Report date
        <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="reports">
        <ReportCard title="Daily" range={daily ? fmt(daily.start_date) : fmt(date)} report={daily} loading={loading} />
        <ReportCard
          title="Month to date"
          range={mtd ? `${fmt(mtd.start_date)} – ${fmt(mtd.end_date)}` : ''}
          report={mtd}
          loading={loading}
        />
        <ReportCard
          title="Monthly (previous month)"
          range={monthly ? `${fmt(monthly.start_date)} – ${fmt(monthly.end_date)}` : ''}
          report={monthly}
          loading={loading}
        />
      </div>
    </div>
  );
}

function ReadingsPage({ user, onLogout }) {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [reportKey, setReportKey] = useState(0);
  const [formKey, setFormKey] = useState(0);

  async function refresh() {
    try {
      const data = await api.listReadings();
      setReadings(data.readings);
      setReportKey((k) => k + 1);
      setError('');
    } catch (err) {
      // An expired/invalid token means the session is over — go back to login.
      if (err.message.includes('log in')) {
        onLogout();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(payload) {
    await api.createReading(payload);
    await refresh();
    // Fresh, empty form after a successful save.
    setFormKey((k) => k + 1);
  }

  async function handleUpdate(payload) {
    await api.updateReading(editing.id, payload);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this reading?')) return;
    try {
      await api.deleteReading(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>Sweety</h1>
          <p className="subtitle">Hi {user.name} — your readings</p>
        </div>
        <button className="ghost" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="card">
        <h2>{editing ? 'Edit reading' : 'Add a reading'}</h2>
        <ReadingForm
          key={editing ? editing.id : `new-${formKey}`}
          initial={editing}
          onSave={editing ? handleUpdate : handleCreate}
          onCancel={editing ? () => setEditing(null) : null}
        />
      </div>

      <ReportsSection refreshKey={reportKey} />

      <div className="card">
        <h2>Your readings</h2>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && readings.length === 0 && (
          <p className="muted">No readings yet — add your first one above.</p>
        )}
        <ul className="reading-list">
          {readings.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.value} mg/dl</strong>
                <span className="muted">
                  {' '}
                  · {slotLabel(r.slot)} · {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="row-actions">
                <button className="ghost small" onClick={() => setEditing(r)}>
                  Edit
                </button>
                <button className="danger small" onClick={() => handleDelete(r.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  // Stay logged in across refreshes: the token and the user are in
  // localStorage from the last login.
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sweety_user'));
    } catch {
      return null;
    }
  });

  function handleAuth(u) {
    localStorage.setItem('sweety_user', JSON.stringify(u));
    setUser(u);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('sweety_user');
    setUser(null);
  }

  return (
    <div className="app">
      {user ? <ReadingsPage user={user} onLogout={logout} /> : <AuthForm onAuth={handleAuth} />}
    </div>
  );
}

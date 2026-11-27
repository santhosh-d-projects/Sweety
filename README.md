# Sweety — blood glucose tracker (Kenpath assessment)

Node.js + Express API, PostgreSQL, React (Vite) frontend.

## Run it

Prerequisites: Node 20+, PostgreSQL running locally.

```bash
# 1. Database (one time)
sudo -u postgres psql -c "CREATE USER sweety WITH PASSWORD 'your-password';"
sudo -u postgres psql -c "CREATE DATABASE sweety OWNER sweety;"

# 2. Server
cd server
cp .env.example .env   # fill in DB_PASSWORD + JWT_SECRET
npm install
npm run migrate        # creates users + readings tables (also runs on start)
npm start              # http://localhost:5000

# 3. Client (new terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```

## Environment variables

See `.env.example` (root) and `server/.env.example`. Every variable is
documented there with placeholder values only — no real secrets.

## API (today's slice)

- `POST /auth/register` — name, email, password (bcrypt-hashed)
- `POST /auth/login` — returns JWT
- `GET /readings` — own readings, newest first (auth required)
- `POST /readings` — add a reading (auth required)
- `PUT /readings/:id` — edit a reading (auth required)
- `GET /reports/daily?date=YYYY-MM-DD` — that day's readings, high/low/avg (1 decimal)/count
- `GET /reports/month-to-date?date=YYYY-MM-DD` — 1st of the month to that date
- `GET /reports/monthly?date=YYYY-MM-DD` — the whole previous month
  (Empty periods return count 0 with null stats and a friendly empty state in the UI.)

Validation messages are exact strings (see plan):
value required / 40–600 / one reading per slot per day / max 4 per day /
date cannot be in the future.

## Status (Fri 27 Nov — today's slice + reports, done early)

Done: scaffold, auth (register/login/JWT), readings CRUD with exact
validation strings, per-user isolation, unique(user_id, reading_date, slot)
in the DB, React login/register + readings page.
Reports done Fri 27 Nov afternoon (ahead of Sat plan): daily /
month-to-date / monthly API + three report cards in the UI, verified live —
daily 15 Nov 2026: high 150 / low 100 / avg 123.3 / count 3; month-to-date:
high 150 / low 90 / avg 115 / count 4; monthly (Oct): high 130 / low 110 /
avg 120 / count 2; empty day returns count 0; future date rejected; unauth
401. Test data cleaned (0 users, 0 readings); client builds.

Still to do (Sat 28 Nov): seed script, full README, 4 tests, clean-clone
run-through, screenshots + walkthrough recording, submit to Kenpath.
Still needed from Santhosh: create the empty public GitHub repo 'sweety'
so this code can be pushed (regular commits, not one big dump).

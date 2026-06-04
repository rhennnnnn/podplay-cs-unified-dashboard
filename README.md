# Client Opening Tracker

A live website for tracking client location opening dates, who's tracking each one, and follow-up reminders sent automatically via Slack 3 days before and 3 days after each opening.

## Project structure

```
/ (repo root)
├── index.html              the website / app (must stay at root for GitHub Pages)
├── README.md               this file
├── assets/
│   └── favicon.ico         browser tab icon (and any future images)
└── docs/
    └── database-setup.sql  Supabase table + security setup, for reference
```

Data is stored in a live Supabase database, so the whole team sees the same data in real time.

## How it works

The site connects to a **Supabase** database (free tier). Anyone with the link can view the tracker. To add or edit, click **Unlock editing** and enter the shared team password. Changes save instantly to the database and update live on everyone's screen.

Each location tracks: name, opening date, tracker, status, notes, and whether the pre-open and post-open follow-ups are done. Rows automatically flag when a follow-up is due (within 3 days before opening, or 3+ days after).

## Logins (Supabase Auth)

The site requires a real login. Data is readable and editable only by accounts you create in Supabase, so there is no longer a shared password.

To add a teammate: Supabase dashboard → Authentication → Users → Add user (email + password, tick "Auto Confirm User"). Public sign-up is turned off, so only accounts you create can log in. To remove someone's access, delete their user there.

## Features

- Active Queue / Opened / Activity Log tabs.
- Opened workflow: marking a client "Opened" records the actual open date and a "how it went" note.
- Activity Log: every add/edit/delete/opened is recorded with who did it and when.
- Export CSV: downloads the rows currently shown (respects tab + filters).

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo (public).
2. Repo **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
3. The site goes live at `https://<username>.github.io/<repo>/`.

## Database

- Hosted on Supabase, table `locations`.
- You can also view/edit rows directly in the Supabase dashboard (Table Editor) — handy as a spreadsheet-style backup.
- The publishable (anon) key in `index.html` is public-safe by design; data is protected by the row-level-security policies and the shared editing password.

## Slack reminders

A scheduled task runs daily, reads the locations from Supabase, and DMs each tracker on Slack:

- **3 days before opening** — check whether anything still needs changing or checking.
- **3 days after opening** — ask how the opening went and whether any problems came up.

Reminders only fire while the relevant follow-up is still unchecked. Mark it done in the site to stop them. Make sure tracker names match their Slack profile names so they can be matched.

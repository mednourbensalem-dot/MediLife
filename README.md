# MediLife — Smart Online Medical Dossier (database-free prototype)

*Your Health, Organized. Your Care, Connected.*

Plain HTML/CSS/JS. **No SQL database, no build step, no dependencies.**

## Run it
**Option A (VS Code):** install the *Live Server* extension → right-click `index.html` → *Open with Live Server*.
**Option B:** double-click `index.html`, or run `python -m http.server 8080` and open http://localhost:8080.

## Demo accounts (password: `demo`)
| Role | Email |
|---|---|
| Patient | patient@medilife.demo |
| Doctor | doctor@medilife.demo |
| Admin | admin@medilife.demo |

## Push to Git
```bash
git init && git add . && git commit -m "MediLife prototype"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Structure
```
index.html      app shell
css/style.css   responsive theme, RTL + print support
js/data.js      DATA LAYER: Store (localStorage) + fictional seed data
js/app.js       UI: auth, router, role views, scheduling, documents, actions
```
Replace `Store.load/save` in `js/data.js` with calls to a secure backend to migrate; the UI does not touch storage directly.

## What works
- **Patient:** dashboard, dossier, emergency card, health timeline, consent controls (who may see my dossier), documents (upload/preview/download), calendar (month/week/day, filters), booking/rescheduling/cancelling (24h clinic rule), slot suggestions, doctor directory + messages, medication reminders, notifications, data export.
- **Doctor:** patient list (consent-gated), consultation notes + diagnosis, prescriptions, allergy records, follow-up scheduling, appointment status workflow, printable summary.
- **Admin:** KPIs, user/role management, account approval, doctor schedules + rooms, appointment management, no-show list, statistics, audit log, announcements. Admins **cannot** see clinical notes or document contents.
- Conflict detection prevents double-booking (doctor and patient). EN / FR / AR with RTL.

## Prototype limits (read this)
- Login is **simulated**; passwords sit in browser storage. Use fictional data only.
- localStorage is device-specific, editable by the user, and **not** secure or legally compliant (incl. Tunisian personal-data law). Uploaded files are stored as base64 (400 KB max).
- "PDF export" uses the browser's *Print → Save as PDF*.
- Production needs: real authentication, server-side authorization, encryption at rest/in transit, protected file storage, access logging, consent/deletion workflows, retention and backup policies — with a non-SQL managed backend (e.g. document store) if desired.
- Assistant, family profiles, and multi-page separation (consult/prescription as separate pages) are folded into existing views or not yet built.

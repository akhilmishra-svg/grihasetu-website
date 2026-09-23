# GrihaSetu — Home Loan Lead Generation Website

Working prototype: Home page, Customer/Agent registration & login, Loan requirement form, Customer dashboard with a passport-stamp style application tracker, and an Admin panel to manage all leads.

## Run it locally

```bash
npm install
node seed-admin.js      # creates default admin login (run once)
node server.js
```

Open **http://localhost:3000**

## Setting up Email OTP (required for registration)

Registration now requires email OTP verification. You need a Gmail account to send these emails.

1. Go to your Google Account → **Security** → turn on **2-Step Verification** (required for the next step)
2. Go to **myaccount.google.com/apppasswords**
3. Create an app password for "Mail" — Google gives you a 16-character code
4. In your project folder, create a file named `.env` (copy `.env.example` and rename it)
5. Fill it in:
   ```
   EMAIL_USER=youraccount@gmail.com
   EMAIL_PASS=the16characterapppassword
   ```
6. Restart the server (`node server.js`) — OTP emails will now send from this Gmail account

**On Render (for the live site):** go to your service → **Environment** tab → add the same two variables (`EMAIL_USER`, `EMAIL_PASS`) there. Never commit your real `.env` file to GitHub — it's already excluded via `.gitignore`.

**Default admin login** (change this before going live):
- Mobile: `9999999999`
- Password: `admin123`
- Admin login page: `/admin-login.html`

## What's actually working

- Registration & login (Customer + Agent/Builder) with hashed passwords, stored in a real SQLite database (`griha.db`)
- Loan requirement form → saved to database, tied to the logged-in user
- Customer dashboard → shows all applications with a live status tracker (Lead Created → Documents Pending → Application Submitted → Credit Assessment → Sanction → Disbursement)
- Admin panel → sees every lead across all customers, can change status per application, basic MIS counts

## What's NOT built yet (next steps for a real launch)

1. **Document upload** (PAN, Aadhaar, salary slips) — needs file storage (e.g. AWS S3 / Cloudinary) and virus scanning before going live with real KYC docs
2. **OTP verification** — currently password-only login; add real SMS OTP (e.g. via MSG91, Twilio)
3. **Agent-specific dashboard views** (submit leads on behalf of customers, MIS filters) — schema supports it (`userType: 'agent'`), UI needs a dedicated view
4. **Proper session security** — right now the logged-in user is stored in the browser's localStorage after login. Fine for a prototype; for production, switch to signed JWT tokens or server sessions with HTTPS-only cookies
5. **SMS/WhatsApp/Email notifications** on status change
6. **Business/legal**: if you're facilitating home loans, check whether your business needs registration as a DSA (Direct Selling Agent) with banks/NBFCs — this is separate from the tech and worth checking early

## Deploying it "live"

This is a real Node.js + Express + SQLite app — it can be deployed for free/cheap on:
- **Render.com** (easiest — connect GitHub repo, auto-deploys)
- **Railway.app**
- **Fly.io**

Steps: push this folder to a GitHub repo → connect it on Render/Railway → set the start command to `node server.js` → done. Buy a domain (e.g. from Namecheap/GoDaddy) and point it to the deployed URL.

Note: SQLite (`griha.db`) is a single file — works fine for early traction but consider migrating to Postgres (Render/Railway both offer free Postgres) once you have real volume.

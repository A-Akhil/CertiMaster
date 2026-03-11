# Verification Backend Setup Guide

The CertiMaster frontend only needs a base URL that exposes a specific set of HTTP endpoints. **The backend can be anything** — the Cloudflare Worker in this folder is the reference implementation, but you can run an Express server, a FastAPI app, a Railway deployment, or any other stack as long as it implements the required API contract described below.

---

## Required API contract

Any backend you use must expose these endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Returns `{"status":"ok","db":"connected","certificates":<n>,"org":"<name>"}`. The frontend pings this before generation to verify the server is reachable and the DB is connected. Must return HTTP 200 when healthy, 503 when degraded. |
| `POST` | `/api/batch-save` | Accepts `Authorization: Bearer <API_KEY>` header and a JSON array of `{id, name, event, date}` objects. Saves records to a database. Returns `{"success":true,"saved":<n>}`. |
| `GET` | `/verify/:id` | Public. Returns an HTML page confirming the certificate is valid or not found. |
| `GET` | `/admin` | Optional. Admin panel UI. |

CORS headers (`Access-Control-Allow-Origin: *`) are required on `/health`, `/api/batch-save`, and `/verify/:id` since the frontend calls them cross-origin from the browser.

The Cloudflare Worker in `src/index.js` is a complete reference implementation of this contract. The rest of this guide covers deploying that specific implementation.

---

## What you will have at the end (Cloudflare deployment)

- A public verification URL: `https://your-worker.workers.dev/verify/<uuid>` — scannable QR codes on certificates open this page
- A batch-save API endpoint: `POST https://your-worker.workers.dev/api/batch-save` — called by CertiMaster frontend when generating certificates
- An admin panel: `https://your-worker.workers.dev/admin` — password-protected GUI to view, filter, add, edit, and delete certificate records

---

## Prerequisites

### 1. Node.js and npm

You need Node.js 18 or newer.

Check your version:
```bash
node --version
npm --version
```

If you do not have Node.js, download it from https://nodejs.org or use a version manager like `nvm`.

### 2. Wrangler CLI

Wrangler is the Cloudflare Workers command-line tool.

No install needed — use `npx` to run it directly from the project directory:
```bash
npx wrangler --version
```

### 3. Cloudflare account

Create a free account at https://dash.cloudflare.com/sign-up

Workers and D1 are both available on the free tier. No credit card is required.

### 4. Authenticate Wrangler with your account

```bash
npx wrangler login
```

This opens a browser window. Log in with your Cloudflare credentials. Wrangler stores your credentials locally for future commands.

---

## Step 1: Get the backend files

If you cloned the full CertiMaster repository, navigate to the backend folder:
```bash
cd verification-backend
```

The folder contains:
```
src/
  index.js       # Worker source — all routes and admin panel HTML
schema.sql        # D1 database schema
wrangler.toml     # Worker configuration
```

---

## Step 2: Create the D1 database

D1 is Cloudflare's serverless SQLite database. You need to create one and link it to your worker.

Run this command to create a new database:
```bash
npx wrangler d1 create certimaster-db
```

The output will look like this:
```
Successfully created DB 'certimaster-db'

[[d1_databases]]
binding = "DB"
database_name = "certimaster-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` value from the output.

---

## Step 3: Update wrangler.toml

Open `wrangler.toml` and replace the `database_id` with the one you just copied. Also change the `name` to something unique for your deployment.

The file should look like this:
```toml
name = "my-certimaster-verification"
main = "src/index.js"
compatibility_date = "2024-03-11"
workers_dev = true
base_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "certimaster-db"
database_id = "YOUR-DATABASE-ID-HERE"
```

Replace `my-certimaster-verification` with any name you want. This becomes part of your worker URL: `https://my-certimaster-verification.<your-subdomain>.workers.dev`

---

## Step 4: Run the database migration

This creates the two required tables in your D1 database.

```bash
npx wrangler d1 execute certimaster-db --remote --file=schema.sql
```

Expected output:
```
Executing on remote database certimaster-db...
🚣 Executed 2 commands in X.XXms
```

Verify the tables were created:
```bash
npx wrangler d1 execute certimaster-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

You should see both `certificates` and `login_attempts` listed.

---

## Step 5: Set your secret keys

The backend uses two keys:

| Key | Purpose | Who uses it |
|-----|---------|-------------|
| `API_KEY` | Authenticates certificate batch saves from the frontend | CertiMaster frontend |
| `ADMIN_KEY` | Password for the admin panel login | You only |

These are stored as encrypted secrets in Cloudflare and are never exposed in code or logs.

Set the API key (choose any strong string):
```bash
echo "YOUR_API_KEY_HERE" | npx wrangler secret put API_KEY
```

Set the admin key (this is your admin panel password):
```bash
echo "YOUR_ADMIN_PASSWORD_HERE" | npx wrangler secret put ADMIN_KEY
```

Example:
```bash
echo "MySecureApiKey123" | npx wrangler secret put API_KEY
echo "MyAdminPassword456" | npx wrangler secret put ADMIN_KEY
```

Write these values down. You will need:
- `API_KEY` when configuring the CertiMaster frontend
- `ADMIN_KEY` every time you log into the admin panel

Confirm secrets are registered (values are not shown, only names):
```bash
npx wrangler secret list
```

---

## Step 6: Deploy the worker

```bash
npx wrangler deploy
```

Output on success:
```
Uploading certimaster-verification (X.XX KiB)
Total Upload: X.XX KiB / gzip: X.XX KiB
Worker Startup Time: X ms
Deployed certimaster-verification triggers (X sec)
  https://my-certimaster-verification.<subdomain>.workers.dev
```

Note down your worker URL. You will need it in the next step.

---

## Step 7: Configure the CertiMaster frontend

Open the CertiMaster web application. In the certificate generation settings, fill in:

- **Verification Server URL**: `https://my-certimaster-verification.<subdomain>.workers.dev`
- **API Key**: the value you set for `API_KEY` in Step 5

When you generate certificates with QR verification enabled, each certificate gets a unique UUID, a QR code printed on it, and the record is saved to your D1 database. Scanning the QR opens the verification page.

---

## Step 8: Verify the deployment

Test the verification endpoint with a known-bad ID (should return 404):
```bash
curl -s https://your-worker.workers.dev/verify/test-id-that-does-not-exist
```

You should get an HTML page showing the certificate is not found.

Test admin login with the wrong password:
```bash
curl -s -X POST https://your-worker.workers.dev/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}' | python3 -m json.tool
```

Expected:
```json
{
  "error": "Invalid password",
  "attempts_remaining": 4
}
```

Test admin login with your actual ADMIN_KEY:
```bash
curl -s -X POST https://your-worker.workers.dev/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD_HERE"}' | python3 -m json.tool
```

Expected:
```json
{
  "token": "eyJyb2xlIjo..."
}
```

If you get a token, everything is working.

---

## Step 9: Access the admin panel

Open in your browser:
```
https://your-worker.workers.dev/admin
```

Log in with your `ADMIN_KEY`. The dashboard shows:
- Total certificates issued
- Unique events
- Unique recipients
- Latest issue date

From the records table you can:
- Search and filter by name, event, and date range
- Edit any record inline
- Delete records with a confirmation prompt
- Add new records manually

Sessions last 8 hours. After that you are automatically logged out and need to log in again.

---

## Security notes

### Brute-force protection

The login endpoint tracks failed attempts per IP address. After 5 wrong passwords, that IP is locked out for 15 minutes. A correct login clears the attempt history for that IP.

### API key vs admin key

The `API_KEY` only unlocks `POST /api/batch-save`. It cannot access admin routes. The `ADMIN_KEY` only works at `POST /admin/login`. They are completely independent.

### CORS

The verification and batch-save endpoints allow cross-origin requests (required for the frontend). Admin routes are same-origin only (served from the worker itself, no external fetch needed).

---

## Updating the worker

If you modify `src/index.js`, redeploy with:
```bash
npx wrangler deploy
```

Secrets and D1 data are preserved across deployments. Only the worker code changes.

---

## Rotating your keys

To change a secret at any time:
```bash
echo "NewKeyValue" | npx wrangler secret put API_KEY
echo "NewPassword" | npx wrangler secret put ADMIN_KEY
```

Changes take effect on the next request after Cloudflare propagates the update (usually a few seconds). Old sessions using the previous ADMIN_KEY will be invalidated immediately since tokens are verified against the current key on every request.

---

## Troubleshooting

### "Unauthorized" when generating certificates

The `API_KEY` in the frontend does not match the `API_KEY` secret on the worker. Double-check the value you entered in the CertiMaster frontend settings exactly matches what you set with `wrangler secret put API_KEY`.

### Admin login always fails

Run:
```bash
npx wrangler secret list
```

If `ADMIN_KEY` does not appear in the list, you have not set it. Run:
```bash
echo "your-password" | npx wrangler secret put ADMIN_KEY
```

### "Could not reach the verification server"

Check that:
1. The URL in the CertiMaster frontend matches your worker URL exactly (no trailing slash)
2. The worker is deployed: `npx wrangler deployments list`
3. The worker is not returning errors: `npx wrangler tail` (streams live logs)

### D1 query errors in logs

Your schema may not have been migrated, or the migration ran against the wrong database. Re-run:
```bash
npx wrangler d1 execute certimaster-db --remote --file=schema.sql
```

The `CREATE TABLE IF NOT EXISTS` statements are safe to re-run — they will not overwrite existing data.

### Checking live logs

```bash
npx wrangler tail
```

This streams real-time logs from the deployed worker. Useful for debugging errors that only appear in production.

---

## Quick reference

| Action | Command |
|--------|---------|
| Create D1 database | `npx wrangler d1 create certimaster-db` |
| Run schema migration | `npx wrangler d1 execute certimaster-db --remote --file=schema.sql` |
| Set API key | `echo "value" \| npx wrangler secret put API_KEY` |
| Set admin password | `echo "value" \| npx wrangler secret put ADMIN_KEY` |
| Deploy | `npx wrangler deploy` |
| View live logs | `npx wrangler tail` |
| List secrets | `npx wrangler secret list` |
| Query the DB directly | `npx wrangler d1 execute certimaster-db --remote --command "SELECT * FROM certificates LIMIT 10;"` |

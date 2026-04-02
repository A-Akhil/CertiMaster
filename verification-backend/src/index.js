/*
 * CertiMaster
 * Copyright (C) 2023 - 2026  A-Akhil
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// ── Verify page HTML templates (edit src/verify-valid.html or src/verify-invalid.html)
import verifyValidHTML   from './verify-valid.html';
import verifyInvalidHTML from './verify-invalid.html';
// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES    = 15;
const TOKEN_TTL_HOURS    = 8;

// CORS for public + generation routes (called cross-origin by CertiMaster frontend)
const corsPublic = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Entry point ───────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── CORS preflight (public routes only) ─────────────────────────────────
    if (method === "OPTIONS" && !path.startsWith("/admin")) {
      return new Response(null, { headers: corsPublic });
    }

    // ── Public: GET /health ──────────────────────────────────────────────────
    if (method === "GET" && path === "/health") {
      let dbOk = false;
      let certCount = 0;
      try {
        const row = await env.DB.prepare("SELECT COUNT(*) as n FROM certificates").first();
        dbOk = true;
        certCount = row.n;
      } catch { /* db unreachable */ }
      return json({
        status:      dbOk ? "ok" : "degraded",
        db:          dbOk ? "connected" : "error",
        certificates: certCount,
        org:         (env.VERIFY_ORG_NAME) || "CertiMaster",
        worker:      "certimaster-verification",
        ts:          new Date().toISOString(),
      }, dbOk ? 200 : 503, corsPublic);
    }

    // ── Public: GET /verify/:id ──────────────────────────────────────────────
    const verifyMatch = path.match(/^\/verify\/([^/]+)$/);
    if (method === "GET" && verifyMatch) {
      const id     = verifyMatch[1];
      const result = await env.DB.prepare(
        "SELECT id, name, event, date FROM certificates WHERE id = ?1"
      ).bind(id).first();

      const status = result ? 200 : 404;
      return new Response(renderVerifyHTML(!!result, result, env, id), {
        status,
        headers: { "Content-Type": "text/html", ...corsPublic },
      });
    }

    // ── Generation: POST /api/batch-save ─────────────────────────────────────
    if (method === "POST" && path === "/api/test-connection") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
        return json({ error: "Unauthorized" }, 401, corsPublic);
      }

      try {
        await env.DB.prepare("SELECT 1 as ok").first();
      } catch {
        return json({ error: "Database unavailable" }, 503, corsPublic);
      }

      return json({
        success: true,
        status: "ok",
        org: (env.VERIFY_ORG_NAME) || "CertiMaster",
        ts: new Date().toISOString(),
      }, 200, corsPublic);
    }

    if (method === "POST" && path === "/api/batch-save") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
        return json({ error: "Unauthorized" }, 401, corsPublic);
      }

      let records;
      try {
        records = await request.json();
        if (!Array.isArray(records) || records.length === 0) {
          return json({ error: "Body must be a non-empty array" }, 400, corsPublic);
        }
      } catch {
        return json({ error: "Invalid JSON" }, 400, corsPublic);
      }

      const stmt = env.DB.prepare(
        "INSERT OR IGNORE INTO certificates (id, name, event, date) VALUES (?1, ?2, ?3, ?4)"
      );
      await env.DB.batch(records.map(r => stmt.bind(r.id, r.name, r.event, r.date)));
      return json({ success: true, saved: records.length }, 200, corsPublic);
    }

    // ── Admin: GET /admin ─────────────────────────────────────────────────────
    if (method === "GET" && path === "/admin") {
      return new Response(renderAdminHTML(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // ── Admin: POST /admin/login ──────────────────────────────────────────────
    if (method === "POST" && path === "/admin/login") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const now = Date.now();

      // Check existing lockout
      const row = await env.DB.prepare(
        "SELECT attempts, locked_until FROM login_attempts WHERE ip = ?1"
      ).bind(ip).first();

      if (row && row.locked_until) {
        const lockedUntilMs = new Date(row.locked_until).getTime();
        if (now < lockedUntilMs) {
          return json({
            error: `Too many failed attempts. Try again after ${row.locked_until}`,
          }, 429);
        }
        // Lockout expired — treat as fresh
        await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?1").bind(ip).run();
      }

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

      if (!body.password || body.password !== env.ADMIN_KEY) {
        // Count this failure
        const current = (row && !row.locked_until) ? row.attempts : 0;
        const newAttempts = current + 1;
        const lockedUntil = newAttempts >= MAX_LOGIN_ATTEMPTS
          ? new Date(now + LOCKOUT_MINUTES * 60 * 1000).toISOString()
          : null;

        await env.DB.prepare(`
          INSERT INTO login_attempts (ip, attempts, locked_until, last_attempt)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT(ip) DO UPDATE SET
            attempts     = ?2,
            locked_until = ?3,
            last_attempt = ?4
        `).bind(ip, newAttempts, lockedUntil, new Date(now).toISOString()).run();

        if (lockedUntil) {
          return json({
            error: `Too many failed attempts. Try again after ${lockedUntil}`,
          }, 429);
        }
        return json({
          error: "Invalid password",
          attempts_remaining: MAX_LOGIN_ATTEMPTS - newAttempts,
        }, 401);
      }

      // Correct password — reset lockout row and issue token
      await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?1").bind(ip).run();

      const token = await makeToken(env.ADMIN_KEY);
      return json({ token });
    }

    // ── Admin API: all require valid session token ────────────────────────────
    if (path.startsWith("/admin/api/")) {
      const tokenHeader = request.headers.get("Authorization") || "";
      const token = tokenHeader.replace(/^Bearer\s+/i, "");
      const valid = await verifyToken(token, env.ADMIN_KEY);
      if (!valid) return json({ error: "Unauthorized" }, 401);

      // GET /admin/api/stats
      if (method === "GET" && path === "/admin/api/stats") {
        const total   = await env.DB.prepare("SELECT COUNT(*) as n FROM certificates").first();
        const events  = await env.DB.prepare("SELECT COUNT(DISTINCT event) as n FROM certificates").first();
        const names   = await env.DB.prepare("SELECT COUNT(DISTINCT name) as n FROM certificates").first();
        const latest  = await env.DB.prepare("SELECT MAX(date) as d FROM certificates").first();
        return json({
          total_certificates: total.n,
          unique_events:      events.n,
          unique_recipients:  names.n,
          latest_date:        latest.d || null,
        });
      }

      // GET /admin/api/records
      if (method === "GET" && path === "/admin/api/records") {
        const p         = url.searchParams;
        const page      = Math.max(1, parseInt(p.get("page") || "1"));
        const per_page  = Math.min(200, Math.max(1, parseInt(p.get("per_page") || "50")));
        const offset    = (page - 1) * per_page;

        const conditions = [];
        const bindings   = [];
        let   bIdx       = 1;

        if (p.get("name")) {
          conditions.push(`LOWER(name) LIKE LOWER(?${bIdx++})`);
          bindings.push(`%${p.get("name")}%`);
        }
        if (p.get("event")) {
          conditions.push(`LOWER(event) LIKE LOWER(?${bIdx++})`);
          bindings.push(`%${p.get("event")}%`);
        }
        if (p.get("date")) {
          conditions.push(`date = ?${bIdx++}`);
          bindings.push(p.get("date"));
        }
        if (p.get("date_from")) {
          conditions.push(`date >= ?${bIdx++}`);
          bindings.push(p.get("date_from"));
        }
        if (p.get("date_to")) {
          conditions.push(`date <= ?${bIdx++}`);
          bindings.push(p.get("date_to"));
        }

        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

        const countStmt   = env.DB.prepare(`SELECT COUNT(*) as n FROM certificates ${where}`);
        const recordsStmt = env.DB.prepare(
          `SELECT id, name, event, date FROM certificates ${where} ORDER BY date DESC, name ASC LIMIT ?${bIdx} OFFSET ?${bIdx + 1}`
        );

        const bindAll = (stmt) => bindings.reduce((s, v) => s.bind(v), stmt);

        const countRow = await bindAll(countStmt).bind(...bindings).first().catch(() =>
          env.DB.prepare(`SELECT COUNT(*) as n FROM certificates ${where}`)
            .bind(...bindings).first()
        );

        // Build properly bound statements
        const allBindings = [...bindings, per_page, offset];
        let countQ = `SELECT COUNT(*) as n FROM certificates ${where}`;
        let recQ   = `SELECT id, name, event, date FROM certificates ${where} ORDER BY date DESC, name ASC LIMIT ? OFFSET ?`;

        // Use raw prepare with positional bindings
        const countResult  = await env.DB.prepare(countQ).bind(...bindings).first();
        const recordResult = await env.DB.prepare(recQ).bind(...allBindings).all();

        const total       = countResult.n;
        const total_pages = Math.ceil(total / per_page);

        return json({
          records:     recordResult.results,
          total,
          page,
          per_page,
          total_pages,
        });
      }

      // GET /admin/api/records/:id
      const singleMatch = path.match(/^\/admin\/api\/records\/([^/]+)$/);
      if (method === "GET" && singleMatch) {
        const cert = await env.DB.prepare(
          "SELECT id, name, event, date FROM certificates WHERE id = ?1"
        ).bind(singleMatch[1]).first();
        if (!cert) return json({ error: "Not found" }, 404);
        return json(cert);
      }

      // POST /admin/api/records
      if (method === "POST" && path === "/admin/api/records") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { name, event, date } = body || {};
        if (!name || !event || !date) {
          return json({ error: "name, event, and date are required" }, 400);
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO certificates (id, name, event, date) VALUES (?1, ?2, ?3, ?4)"
        ).bind(id, name, event, date).run();
        return json({ id, name, event, date }, 201);
      }

      // PUT /admin/api/records/:id
      if (method === "PUT" && singleMatch) {
        const existing = await env.DB.prepare(
          "SELECT id FROM certificates WHERE id = ?1"
        ).bind(singleMatch[1]).first();
        if (!existing) return json({ error: "Not found" }, 404);

        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const { name, event, date } = body || {};
        if (!name || !event || !date) {
          return json({ error: "name, event, and date are required" }, 400);
        }
        await env.DB.prepare(
          "UPDATE certificates SET name = ?1, event = ?2, date = ?3 WHERE id = ?4"
        ).bind(name, event, date, singleMatch[1]).run();
        return json({ id: singleMatch[1], name, event, date });
      }

      // DELETE /admin/api/records/:id
      if (method === "DELETE" && singleMatch) {
        const existing = await env.DB.prepare(
          "SELECT id FROM certificates WHERE id = ?1"
        ).bind(singleMatch[1]).first();
        if (!existing) return json({ error: "Not found" }, 404);
        await env.DB.prepare(
          "DELETE FROM certificates WHERE id = ?1"
        ).bind(singleMatch[1]).run();
        return json({ success: true });
      }

      // DELETE /admin/api/records  — bulk delete by ids[] or by event
      if (method === "DELETE" && path === "/admin/api/records") {
        const body = await request.json().catch(() => ({}));
        if (body.event) {
          const r = await env.DB.prepare(
            "DELETE FROM certificates WHERE event = ?1"
          ).bind(body.event).run();
          return json({ success: true, deleted: r.meta?.changes ?? 0 });
        }
        if (Array.isArray(body.ids) && body.ids.length > 0) {
          const placeholders = body.ids.map((_, i) => '?'+(i+1)).join(',');
          const r = await env.DB.prepare(
            `DELETE FROM certificates WHERE id IN (${placeholders})`
          ).bind(...body.ids).run();
          return json({ success: true, deleted: r.meta?.changes ?? 0 });
        }
        return json({ error: 'Provide ids[] or event' }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function makeToken(secret) {
  const payload = btoa(JSON.stringify({
    role: "admin",
    exp:  Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 3600,
  }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = await hmacSign(payload, secret);
  if (sig !== expectedSig) return false;
  try {
    const data = JSON.parse(atob(payload));
    if (data.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── JSON helper ───────────────────────────────────────────────────────────────
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ── HTML escape helper ────────────────────────────────────────────────────────
function escHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Verify page HTML ──────────────────────────────────────────────────────────
// To customise the verification pages, edit:
//   src/verify-valid.html   — shown when a certificate ID exists
//   src/verify-invalid.html — shown when the ID is not found
//
// Available placeholders (all values are HTML-escaped before insertion):
//   {{NAME}}        — recipient name        (empty string if not found)
//   {{EVENT}}       — event name            (empty string if not found)
//   {{DATE}}        — issue date            (empty string if not found)
//   {{ID}}          — certificate UUID      (always from the URL)
//   {{ORG_NAME}}    — VERIFY_ORG_NAME env var, or "CertiMaster"
//   {{VERIFIED_ON}} — current date, e.g. "Mar 11, 2026"
//   {{VALID}}       — "true" or "false"
//   {{STATUS}}      — "valid" or "invalid"
//   {{STATUS_TEXT}} — "Verified Authentic" or "Certificate Not Found"
function renderVerifyHTML(valid, cert, env, checkedId) {
  const orgName    = (env && env.VERIFY_ORG_NAME) ? env.VERIFY_ORG_NAME : 'CertiMaster';
  const verifiedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const tokens = {
    NAME:        cert ? cert.name  : '',
    EVENT:       cert ? cert.event : '',
    DATE:        cert ? cert.date  : '',
    ID:          cert ? cert.id    : (checkedId || ''),
    ORG_NAME:    orgName,
    VERIFIED_ON: verifiedOn,
    VALID:       valid ? 'true' : 'false',
    STATUS:      valid ? 'valid' : 'invalid',
    STATUS_TEXT: valid ? 'Verified Authentic' : 'Certificate Not Found',
  };

  let html = valid ? verifyValidHTML : verifyInvalidHTML;
  for (const [key, val] of Object.entries(tokens)) {
    html = html.replaceAll('{{' + key + '}}', escHTML(String(val)));
  }
  return html;
}

// ── Admin panel HTML ──────────────────────────────────────────────────────────
function renderAdminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CertiMaster Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
  /* ── login ── */
  #login-screen{display:flex;justify-content:center;align-items:center;min-height:100vh}
  .login-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:2.5rem 2rem;width:340px;box-shadow:0 4px 24px rgba(0,0,0,.07)}
  .login-card h1{font-size:1.3rem;margin-bottom:.25rem}
  .login-card p{color:#64748b;font-size:.875rem;margin-bottom:1.5rem}
  .field{margin-bottom:1rem}
  .field label{display:block;font-size:.8rem;font-weight:600;margin-bottom:.35rem;color:#475569}
  .field input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:.55rem .75rem;font-size:.95rem;outline:none;transition:border-color .15s}
  .field input:focus{border-color:#3b82f6}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.55rem 1.2rem;border-radius:8px;font-size:.9rem;font-weight:600;border:none;cursor:pointer;transition:opacity .15s}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn-primary{background:#1e293b;color:#fff;width:100%}
  .btn-primary:hover:not(:disabled){background:#0f172a}
  .btn-danger{background:#fee2e2;color:#b91c1c;font-size:.8rem;padding:.35rem .75rem}
  .btn-danger:hover{background:#fecaca}
  .btn-ghost{background:#f1f5f9;color:#475569;font-size:.8rem;padding:.35rem .75rem}
  .btn-ghost:hover{background:#e2e8f0}
  .btn-sm{background:#e0f2fe;color:#0369a1;font-size:.8rem;padding:.35rem .75rem}
  .btn-sm:hover{background:#bae6fd}
  .error-msg{background:#fee2e2;color:#b91c1c;border-radius:6px;padding:.5rem .75rem;font-size:.85rem;margin-bottom:1rem}
  .info-msg{background:#dbeafe;color:#1d4ed8;border-radius:6px;padding:.5rem .75rem;font-size:.85rem;margin-bottom:1rem}
  /* ── dashboard ── */
  #dashboard{display:none;flex-direction:column;min-height:100vh}
  header{background:#1e293b;color:#fff;padding:.9rem 1.5rem;display:flex;align-items:center;justify-content:space-between}
  header h1{font-size:1.1rem}
  .stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;padding:1.25rem 1.5rem;background:#fff;border-bottom:1px solid #e2e8f0}
  .stat{text-align:center}
  .stat-n{font-size:1.6rem;font-weight:700;color:#1e293b}
  .stat-l{font-size:.78rem;color:#64748b;margin-top:.15rem}
  .main{padding:1.25rem 1.5rem;flex:1}
  /* filters */
  .filters{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;align-items:flex-end}
  .filters input,.filters select{border:1px solid #cbd5e1;border-radius:7px;padding:.45rem .7rem;font-size:.85rem;outline:none;min-width:130px}
  .filters input:focus,.filters select:focus{border-color:#3b82f6}
  /* table */
  .table-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  table{width:100%;border-collapse:collapse;font-size:.875rem}
  th{background:#f8fafc;padding:.65rem .85rem;text-align:left;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;white-space:nowrap}
  td{padding:.6rem .85rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr.editing td{background:#fffbeb}
  .id-cell{font-size:.7rem;color:#94a3b8;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .actions{display:flex;gap:.4rem;white-space:nowrap}
  /* edit inputs in row */
  td input.inline{border:1px solid #cbd5e1;border-radius:5px;padding:.3rem .5rem;font-size:.83rem;width:100%;outline:none}
  td input.inline:focus{border-color:#3b82f6}
  /* pagination */
  .pagination{display:flex;align-items:center;gap:.5rem;margin-top:1rem;justify-content:flex-end;font-size:.875rem}
  .pagination span{color:#64748b}
  /* add modal */
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
  .modal{background:#fff;border-radius:12px;padding:2rem;width:400px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.15)}
  .modal h2{font-size:1.1rem;margin-bottom:1.25rem}
  .modal-actions{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.25rem}
  .toast{position:fixed;bottom:1.5rem;right:1.5rem;background:#1e293b;color:#fff;padding:.7rem 1.2rem;border-radius:8px;font-size:.875rem;z-index:100;opacity:0;transition:opacity .3s}
  .toast.show{opacity:1}
  .empty{padding:3rem;text-align:center;color:#94a3b8}
  /* responsive */
  @media(max-width:640px){.stats-bar{grid-template-columns:1fr 1fr}.main{padding:1rem}}
</style>
</head>
<body>

<!-- LOGIN SCREEN -->
<div id="login-screen">
  <div class="login-card">
    <h1>CertiMaster Admin</h1>
    <p>Enter your admin key to continue.</p>
    <div id="login-error" class="error-msg" style="display:none"></div>
    <div class="field"><label>Admin Key</label>
      <input type="password" id="admin-key-input" placeholder="Your admin key" autocomplete="current-password"/>
    </div>
    <button class="btn btn-primary" id="login-btn" onclick="doLogin()">Login</button>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dashboard">
  <header>
    <h1>CertiMaster Admin Panel</h1>
    <button class="btn btn-ghost" onclick="doLogout()" style="font-size:.85rem;padding:.4rem .9rem">Logout</button>
  </header>

  <!-- Stats bar -->
  <div class="stats-bar" id="stats-bar">
    <div class="stat"><div class="stat-n" id="s-total">-</div><div class="stat-l">Total Certificates</div></div>
    <div class="stat"><div class="stat-n" id="s-events">-</div><div class="stat-l">Unique Events</div></div>
    <div class="stat"><div class="stat-n" id="s-recipients">-</div><div class="stat-l">Unique Recipients</div></div>
    <div class="stat"><div class="stat-n" id="s-latest">-</div><div class="stat-l">Latest Date</div></div>
  </div>

  <div class="main">
    <!-- Filters -->
    <div class="filters">
      <input type="text"   id="f-name"      placeholder="Filter by name"       oninput="debounceFilter()">
      <input type="text"   id="f-event"     placeholder="Filter by event"      oninput="debounceFilter()">
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:#64748b;white-space:nowrap">From <input type="date" id="f-date-from" oninput="applyFilters()" style="font-size:.8rem"></label>
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:#64748b;white-space:nowrap">To <input type="date" id="f-date-to" oninput="applyFilters()" style="font-size:.8rem"></label>
      <button class="btn btn-ghost" style="height:34px" onclick="clearFilters()">Clear</button>
      <button class="btn btn-sm"   style="height:34px;margin-left:auto" onclick="openAddModal()">+ Add Record</button>
    </div>

    <!-- Bulk action bar -->
    <div id="bulk-bar" style="display:none;align-items:center;gap:.75rem;padding:.5rem .75rem;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;margin-bottom:.5rem;font-size:.85rem">
      <span id="bulk-count" style="font-weight:600">0 selected</span>
      <button class="btn btn-danger" style="height:30px;font-size:.8rem" onclick="bulkDeleteSelected()">Delete selected</button>
      <button class="btn" style="height:30px;font-size:.8rem;background:#7c3aed;color:#fff" onclick="bulkDeleteByEvent()">Delete entire event</button>
      <button class="btn btn-ghost" style="height:30px;font-size:.8rem;margin-left:auto" onclick="clearSelection()">Cancel</button>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:2rem"><input type="checkbox" id="chk-all" onchange="toggleSelectAll(this.checked)" title="Select all"></th>
            <th>Name</th><th>Event</th><th>Date</th><th>Certificate ID</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="records-body">
          <tr><td colspan="6" class="empty">Loading...</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button class="btn btn-ghost" id="btn-prev" onclick="goPrev()" style="padding:.55rem 1.4rem;font-size:.875rem">Prev</button>
      <span id="page-info">-</span>
      <button class="btn btn-ghost" id="btn-next" onclick="goNext()" style="padding:.55rem 1.4rem;font-size:.875rem">Next</button>
    </div>
  </div>
</div>

<!-- ADD MODAL -->
<div class="modal-backdrop" id="add-modal" style="display:none" onclick="closeAddModal(event)">
  <div class="modal" onclick="event.stopPropagation()">
    <h2>Add Certificate Record</h2>
    <div id="add-error" class="error-msg" style="display:none"></div>
    <div class="field"><label>Name</label><input type="text" id="add-name" placeholder="Recipient name"></div>
    <div class="field"><label>Event</label>
      <select id="add-event-select" onchange="handleEventSelect()">
        <option value="" disabled selected>Loading events...</option>
      </select>
      <input type="text" id="add-event" placeholder="Type event name" style="display:none;margin-top:.5rem">
    </div>
    <div class="field"><label>Date</label><input type="date" id="add-date"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('add-modal').style.display='none'">Cancel</button>
      <button class="btn btn-primary" style="width:auto" onclick="submitAdd()">Add Record</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
  const BASE = '';
  let token = sessionStorage.getItem('cm_admin_token') || '';
  let page = 1;
  const PER_PAGE = 50;
  let filterTimer = null;
  let editingId = null;

  // ── Boot ────────────────────────────────────────────────────────────────────
  window.onload = () => {
    const input = document.getElementById('admin-key-input');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    if (token) showDashboard();
  };

  // ── Login ───────────────────────────────────────────────────────────────────
  async function doLogin() {
    const btn = document.getElementById('login-btn');
    const key = document.getElementById('admin-key-input').value.trim();
    const err = document.getElementById('login-error');
    if (!key) { showErr(err, 'Please enter your admin key.'); return; }
    btn.disabled = true; btn.textContent = 'Verifying...';
    err.style.display = 'none';

    try {
      const res = await fetch(BASE + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Login failed.';
        const rem = data.attempts_remaining != null
          ? ' (' + data.attempts_remaining + ' attempt' + (data.attempts_remaining !== 1 ? 's' : '') + ' remaining)'
          : '';
        showErr(err, msg + rem);
        return;
      }
      token = data.token;
      sessionStorage.setItem('cm_admin_token', token);
      showDashboard();
    } catch (e) {
      showErr(err, 'Network error. Could not reach the server.');
    } finally {
      btn.disabled = false; btn.textContent = 'Login';
    }
  }

  function doLogout() {
    sessionStorage.removeItem('cm_admin_token');
    token = '';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-key-input').value = '';
  }

  function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    loadStats();
    loadRecords();
  }

  // ── API helpers ─────────────────────────────────────────────────────────────
  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (res.status === 401) { doLogout(); throw new Error('Session expired.'); }
    return res;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const res  = await api('GET', '/admin/api/stats');
      const data = await res.json();
      document.getElementById('s-total').textContent      = data.total_certificates ?? '-';
      document.getElementById('s-events').textContent     = data.unique_events      ?? '-';
      document.getElementById('s-recipients').textContent = data.unique_recipients  ?? '-';
      document.getElementById('s-latest').textContent     = data.latest_date        ?? '-';
    } catch(e) { /* ignore */ }
  }

  // ── Records ─────────────────────────────────────────────────────────────────
  function buildQuery() {
    const p = new URLSearchParams();
    const name      = document.getElementById('f-name').value.trim();
    const event     = document.getElementById('f-event').value.trim();
    const dateFrom  = document.getElementById('f-date-from').value;
    const dateTo    = document.getElementById('f-date-to').value;
    if (name)     p.set('name', name);
    if (event)    p.set('event', event);
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to', dateTo);
    p.set('page', page);
    p.set('per_page', PER_PAGE);
    return p.toString();
  }

  async function loadRecords() {
    const tbody = document.getElementById('records-body');
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Loading...</td></tr>';
    try {
      const res  = await api('GET', '/admin/api/records?' + buildQuery());
      const data = await res.json();
      renderTable(data);
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Failed to load records.</td></tr>';
    }
  }

  function renderTable(data) {
    const tbody = document.getElementById('records-body');
    document.getElementById('page-info').textContent =
      'Page ' + data.page + ' of ' + (data.total_pages || 1) + ' (' + data.total + ' records)';
    document.getElementById('btn-prev').disabled = data.page <= 1;
    document.getElementById('btn-next').disabled = data.page >= data.total_pages;

    if (!data.records || data.records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No records found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.records.forEach(r => {
      const tr = document.createElement('tr');
      tr.id = 'row-' + r.id;
      tr.innerHTML = rowHTML(r);
      tbody.appendChild(tr);
    });
    clearSelection();
  }

  function rowHTML(r) {
    return \`      <td style="text-align:center"><input type="checkbox" class="row-chk" data-id="\${esc(r.id)}" data-event="\${esc(r.event)}" onchange="updateBulkBar()"></td>      <td>\${esc(r.name)}</td>
      <td>\${esc(r.event)}</td>
      <td>\${esc(r.date)}</td>
      <td class="id-cell" title="\${esc(r.id)}">\${esc(r.id)}</td>
      <td class="actions">
        <button class="btn btn-sm"     onclick="startEdit('\${esc(r.id)}','\${esc(r.name)}','\${esc(r.event)}','\${esc(r.date)}')">Edit</button>
        <button class="btn btn-danger" onclick="confirmDelete('\${esc(r.id)}')">Delete</button>
      </td>\`;
  }

  function editRowHTML(r) {
    return \`      <td></td>      <td><input class="inline" id="ei-name"  value="\${esc(r.name)}"></td>
      <td><input class="inline" id="ei-event" value="\${esc(r.event)}"></td>
      <td><input class="inline" type="date" id="ei-date" value="\${esc(r.date)}"></td>
      <td class="id-cell" title="\${esc(r.id)}">\${esc(r.id)}</td>
      <td class="actions">
        <button class="btn btn-sm"    onclick="saveEdit('\${esc(r.id)}')">Save</button>
        <button class="btn btn-ghost" onclick="cancelEdit('\${esc(r.id)}','\${esc(r.name)}','\${esc(r.event)}','\${esc(r.date)}')">Cancel</button>
      </td>\`;
  }

  function deleteConfirmHTML(id) {
    return \`      <td></td>      <td colspan="3" style="color:#b91c1c;font-weight:600">Delete this record?</td>
      <td class="id-cell" title="\${esc(id)}">\${esc(id)}</td>
      <td class="actions">
        <button class="btn btn-danger" onclick="doDelete('\${esc(id)}')">Confirm</button>
        <button class="btn btn-ghost"  onclick="loadRecords()">Cancel</button>
      </td>\`;
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function startEdit(id, name, event, date) {
    const tr = document.getElementById('row-' + id);
    if (!tr) return;
    tr.classList.add('editing');
    tr.innerHTML = editRowHTML({ id, name, event, date });
  }

  function cancelEdit(id, name, event, date) {
    const tr = document.getElementById('row-' + id);
    if (!tr) return;
    tr.classList.remove('editing');
    tr.innerHTML = rowHTML({ id, name, event, date });
  }

  async function saveEdit(id) {
    const name  = document.getElementById('ei-name').value.trim();
    const event = document.getElementById('ei-event').value.trim();
    const date  = document.getElementById('ei-date').value;
    if (!name || !event || !date) { toast('Name, event, and date are required.', true); return; }
    try {
      const res  = await api('PUT', '/admin/api/records/' + id, { name, event, date });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Update failed.', true); return; }
      const tr = document.getElementById('row-' + id);
      if (tr) { tr.classList.remove('editing'); tr.innerHTML = rowHTML(data); }
      loadStats();
      toast('Record updated.');
    } catch(e) { toast('Network error.', true); }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function confirmDelete(id) {
    const tr = document.getElementById('row-' + id);
    if (!tr) return;
    tr.innerHTML = deleteConfirmHTML(id);
  }

  async function doDelete(id) {
    try {
      const res = await api('DELETE', '/admin/api/records/' + id);
      if (!res.ok) { const d = await res.json(); toast(d.error || 'Delete failed.', true); return; }
      const tr = document.getElementById('row-' + id);
      if (tr) tr.remove();
      loadStats();
      toast('Record deleted.');
    } catch(e) { toast('Network error.', true); }
  }

  // ── Bulk selection ──────────────────────────────────────────────────────────
  function getCheckedIds() {
    return [...document.querySelectorAll('.row-chk:checked')].map(c => c.dataset.id);
  }

  function toggleSelectAll(checked) {
    document.querySelectorAll('.row-chk').forEach(c => c.checked = checked);
    updateBulkBar();
  }

  function updateBulkBar() {
    const ids = getCheckedIds();
    const bar = document.getElementById('bulk-bar');
    document.getElementById('bulk-count').textContent = ids.length + ' selected';
    bar.style.display = ids.length > 0 ? 'flex' : 'none';
    const all = document.querySelectorAll('.row-chk');
    const chkAll = document.getElementById('chk-all');
    if (chkAll) chkAll.indeterminate = ids.length > 0 && ids.length < all.length;
    if (chkAll) chkAll.checked = ids.length > 0 && ids.length === all.length;
  }

  function clearSelection() {
    document.querySelectorAll('.row-chk').forEach(c => c.checked = false);
    const chkAll = document.getElementById('chk-all');
    if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
    document.getElementById('bulk-bar').style.display = 'none';
  }

  async function bulkDeleteSelected() {
    const ids = getCheckedIds();
    if (!ids.length) return;
    if (!confirm('Delete ' + ids.length + ' selected record(s)?')) return;
    try {
      const res  = await api('DELETE', '/admin/api/records', { ids });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Bulk delete failed.', true); return; }
      toast('Deleted ' + (data.deleted ?? ids.length) + ' record(s).');
      clearSelection();
      loadRecords();
      loadStats();
    } catch(e) { toast('Network error.', true); }
  }

  async function bulkDeleteByEvent() {
    const checked = [...document.querySelectorAll('.row-chk:checked')];
    if (!checked.length) { toast('Select at least one record first.', true); return; }
    const events = [...new Set(checked.map(c => c.dataset.event))];
    if (events.length > 1) {
      toast('Selected rows span multiple events. Filter by a single event first, then use Select All.', true);
      return;
    }
    const ev = events[0];
    if (!confirm('Delete ALL certificates for event "' + ev + '"? This cannot be undone.')) return;
    try {
      const res  = await api('DELETE', '/admin/api/records', { event: ev });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Delete failed.', true); return; }
      toast('Deleted ' + (data.deleted ?? '?') + ' record(s) for "' + ev + '".');
      clearSelection();
      loadRecords();
      loadStats();
    } catch(e) { toast('Network error.', true); }
  }

  // ── Add ─────────────────────────────────────────────────────────────────────
  async function openAddModal() {
    document.getElementById('add-name').value  = '';
    document.getElementById('add-event').value = '';
    document.getElementById('add-event').style.display = 'none';
    document.getElementById('add-date').value  = new Date().toISOString().split('T')[0];
    document.getElementById('add-error').style.display = 'none';
    document.getElementById('add-modal').style.display = 'flex';
    await loadEventOptions();
  }

  async function loadEventOptions() {
    const sel = document.getElementById('add-event-select');
    sel.innerHTML = '<option value="" disabled selected>Loading...</option>';
    try {
      const res  = await api('GET', '/admin/api/records?per_page=200');
      const data = await res.json();
      const events = [...new Set((data.records || []).map(r => r.event))].sort();
      sel.innerHTML = '';
      events.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev; opt.textContent = ev;
        sel.appendChild(opt);
      });
      const other = document.createElement('option');
      other.value = '__other__'; other.textContent = 'Other (type below)';
      sel.appendChild(other);
      if (events.length > 0) sel.value = events[0];
    } catch {
      sel.innerHTML = '<option value="__other__">Type event name below</option>';
      document.getElementById('add-event').style.display = 'block';
    }
  }

  function handleEventSelect() {
    const sel   = document.getElementById('add-event-select');
    const input = document.getElementById('add-event');
    if (sel.value === '__other__') {
      input.style.display = 'block';
      input.focus();
    } else {
      input.style.display = 'none';
      input.value = '';
    }
  }

  function closeAddModal(e) {
    if (e.target.id === 'add-modal') document.getElementById('add-modal').style.display = 'none';
  }

  async function submitAdd() {
    const name  = document.getElementById('add-name').value.trim();
    const sel   = document.getElementById('add-event-select');
    const event = sel.value === '__other__'
      ? document.getElementById('add-event').value.trim()
      : sel.value.trim();
    const date  = document.getElementById('add-date').value;
    const err   = document.getElementById('add-error');
    err.style.display = 'none';
    if (!name || !event || !date) { showErr(err, 'All fields are required.'); return; }
    try {
      const res  = await api('POST', '/admin/api/records', { name, event, date });
      const data = await res.json();
      if (!res.ok) { showErr(err, data.error || 'Failed to add record.'); return; }
      document.getElementById('add-modal').style.display = 'none';
      loadRecords();
      loadStats();
      toast('Record added.');
    } catch(e) { showErr(err, 'Network error.'); }
  }

  // ── Filters / pagination ─────────────────────────────────────────────────────
  function debounceFilter() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilters, 300);
  }

  function applyFilters() { page = 1; loadRecords(); }
  function clearFilters() {
    ['f-name','f-event','f-date-from','f-date-to'].forEach(id => {
      document.getElementById(id).value = '';
    });
    page = 1; loadRecords();
  }
  function goPrev() { if (page > 1) { page--; loadRecords(); } }
  function goNext() { page++; loadRecords(); }

  // ── Utils ────────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

  function toast(msg, isErr) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isErr ? '#b91c1c' : '#1e293b';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
</script>
</body>
</html>`;
}

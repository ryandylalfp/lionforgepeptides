export interface Env {
  SUBSCRIBERS: KVNamespace;
}

const LANDING_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Lionforge Peptides — Coming Soon</title></head>
  <body style="font-family:system-ui;padding:40px;max-width:720px;margin:auto;">
    <h1>Lionforge Peptides</h1>
    <p>Launching soon. Join the list for updates.</p>

    <form method="post" action="/api/subscribe">
      <input name="email" type="email" required placeholder="you@example.com"
             style="padding:12px;width:100%;max-width:360px;">
      <button type="submit" style="padding:12px 16px;margin-left:8px;">Join</button>
      <p style="font-size:12px;opacity:0.7;margin-top:10px;">No spam. Unsubscribe anytime.</p>
    </form>
  </body>
</html>`;

function isValidEmail(email: string) {
  // Simple pragmatic check (not perfect, but good enough for signups)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export interface Env {
  DB: D1Database;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // --- EMAIL SIGNUP ---
    if (url.pathname === "/api/subscribe" && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let email = "";
      let source = "landing";

      // Handle form posts
      if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        email = String(form.get("email") || "").trim().toLowerCase();
        source = String(form.get("source") || "landing");

        // Optional honeypot: if filled, silently accept (bot)
        const honeypot = String(form.get("company") || "").trim();
        if (honeypot) {
          return Response.redirect(new URL("/?success=1", url.origin).toString(), 303);
        }
      } else if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({} as any));
        email = String(body.email || "").trim().toLowerCase();
        source = String(body.source || "landing");
      }

      if (!email || !isValidEmail(email)) {
        // For normal form submits, show a simple error
        if (!contentType.includes("application/json")) {
          return new Response("Please enter a valid email. Go back and try again.", { status: 400 });
        }
        return new Response(JSON.stringify({ ok: false, error: "invalid_email" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      // (Optional) capture some metadata for later debugging/anti-abuse
      const ua = req.headers.get("user-agent") || "";
      // If you later want real IP info behind proxies, we can add proper CF headers handling.
      const ip = req.headers.get("cf-connecting-ip") || "";
      const ipHash = ip ? await sha256(ip) : null;

      // Insert (dedupe via UNIQUE email)
      // If email already exists, this will no-op.
      await env.DB.prepare(
        `INSERT INTO subscribers (email, source, ip_hash, user_agent)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO NOTHING`
      )
        .bind(email, source, ipHash, ua)
        .run();

      // Redirect back for a friendly UX
      if (!contentType.includes("application/json")) {
        return Response.redirect(new URL("/?success=1", url.origin).toString(), 303);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    // --- your existing routes below ---
    // e.g. serve landing html at "/"
    // return new Response(landingHtml, { headers: { "content-type": "text/html" } });

    return new Response("Not found", { status: 404 });
  },
};

// Small helper to hash IP (optional)
async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}


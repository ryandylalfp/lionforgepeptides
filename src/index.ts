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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Serve landing page
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(LANDING_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Subscribe endpoint
    if (url.pathname === "/api/subscribe" && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";

      let email = "";

      // Handle both form submits and JSON fetch
      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        email = String(form.get("email") || "").trim().toLowerCase();
        // Optional honeypot
        const honeypot = String(form.get("company") || "").trim();
        if (honeypot) return new Response("OK", { status: 200 }); // silently ignore bots
      } else if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        email = String((body as any).email || "").trim().toLowerCase();
      }

      if (!email || !isValidEmail(email)) {
        // If it’s a normal form submit, show a simple page; otherwise JSON
        if (!contentType.includes("application/json")) {
          return new Response("Please enter a valid email. Go back and try again.", { status: 400 });
        }
        return json({ ok: false, error: "invalid_email" }, 400);
      }

      // Store in KV with a timestamp
      const key = `email:${email}`;
      const existing = await env.SUBSCRIBERS.get(key);
      if (!existing) {
        await env.SUBSCRIBERS.put(
          key,
          JSON.stringify({ email, subscribedAt: new Date().toISOString() })
        );
      }

      // Normal HTML form submit experience: redirect back to home with success flag
      if (!contentType.includes("application/json")) {
        return Response.redirect(new URL("/?success=1", url.origin).toString(), 303);
      }

      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
};

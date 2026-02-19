export interface Env {
  DB: D1Database;
}

const LANDING_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Lionforge Peptides — Coming Soon</title>
  </head>
  <body style="font-family:system-ui;padding:40px;max-width:720px;margin:auto;">
    <h1>Lionforge Peptides</h1>
    <p>Launching soon. Join the list for updates.</p>

    <form method="post" action="/api/subscribe">
      <input name="email" type="email" required placeholder="you@example.com"
             style="padding:12px;width:100%;max-width:360px;" />
      <button type="submit" style="padding:12px 16px;margin-left:8px;">Join</button>

      <!-- optional honeypot -->
      <input type="text" name="company" tabindex="-1" autocomplete="off"
             style="position:absolute;left:-9999px;" aria-hidden="true" />

      <p style="font-size:12px;opacity:0.7;margin-top:10px;">No spam. Unsubscribe anytime.</p>

      <div id="success" style="display:none;margin-top:12px;">
        Thanks! You’re on the list.
      </div>
    </form>

    <script>
      if (new URLSearchParams(location.search).get("success") === "1") {
        document.getElementById("success").style.display = "block";
      }
    </script>
  </body>
</html>`;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    if (req.method === "POST" && url.pathname === "/api/subscribe") {
      const contentType = req.headers.get("content-type") || "";

      let email = "";
      let source = "landing";

      // Form submit
      if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        email = String(form.get("email") || "").trim().toLowerCase();
        source = String(form.get("source") || "landing");

        // Honeypot: if filled, treat as bot and pretend success
        const honeypot = String(form.get("company") || "").trim();
        if (honeypot) {
          return Response.redirect(new URL("/?success=1", url.origin).toString(), 303);
        }
      }
      // JSON submit (optional)
      else if (contentType.includes("application/json")) {
        const body = (await req.json().catch(() => ({}))) as any;
        email = String(body.email || "").trim().toLowerCase();
        source = String(body.source || "landing");
      }

      if (!email || !isValidEmail(email)) {
        // For HTML form submits, a simple message is fine
        if (!contentType.includes("application/json")) {
          return new Response("Please enter a valid email. Go back and try again.", { status: 400 });
        }
        return new Response(JSON.stringify({ ok: false, error: "invalid_email" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const ua = req.headers.get("user-agent") || "";
      const ip = req.headers.get("cf-connecting-ip") || "";
      const ipHash = ip ? await sha256(ip) : null;

      // Store in D1 (requires subscribers table with UNIQUE(email))
      await env.DB.prepare(
        `INSERT INTO subscribers (email, source, ip_hash, user_agent)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO NOTHING`
      )
        .bind(email, source, ipHash, ua)
        .run();

      // UX: redirect back to home with success flag
      if (!contentType.includes("application/json")) {
        return Response.redirect(new URL("/?success=1", url.origin).toString(), 303);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

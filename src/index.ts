interface Env {
  PROGRESS_KV: KVNamespace;
  ASSETS: Fetcher;
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function passHash(username: string, password: string): Promise<string> {
  return sha256hex(`hamprep:${username}:${password}`);
}

function cleanPassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length < 4 || raw.length > 128) return null;
  return raw;
}

function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(u)) return null;
  return u;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /api/progress?username=foo
    if (url.pathname === "/api/progress" && request.method === "GET") {
      const username = cleanUsername(url.searchParams.get("username") ?? "");
      const cls = (url.searchParams.get("class") ?? "").toLowerCase();
      const suffix = /^[a-z0-9-]{1,16}$/.test(cls) ? `:${cls}` : "";
      if (!username) {
        return Response.json(
          { error: "invalid username (2-32 chars: a-z 0-9 _ -)" },
          { status: 400 }
        );
      }
      type Rec = { state: Record<string, unknown>; updatedAt: number; hash?: string } | null;
      let raw = await env.PROGRESS_KV.get(`progress:${username}${suffix}`, "json").catch(() => null) as Rec;
      if (!raw && suffix) {
        raw = await env.PROGRESS_KV.get(`progress:${username}`, "json").catch(() => null) as Rec;
      }
      if (!raw) {
        return Response.json({ username, state: {}, updatedAt: 0, empty: true });
      }
      if (raw.hash) {
        const pw = cleanPassword(url.searchParams.get("pw") ?? "");
        if (!pw) {
          return Response.json({ error: "password required" }, { status: 401 });
        }
        const h = await passHash(username, pw);
        if (h !== raw.hash) {
          return Response.json({ error: "wrong password" }, { status: 403 });
        }
      }
      return Response.json({ username, state: raw.state ?? {}, updatedAt: raw.updatedAt ?? 0 });
    }

    // PUT /api/progress  { username, state }
    if (url.pathname === "/api/progress" && request.method === "PUT") {
      let body: { username?: unknown; class?: unknown; password?: unknown; state?: unknown };
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }
      const username = cleanUsername(body.username);
      if (!username) {
        return Response.json(
          { error: "invalid username (2-32 chars: a-z 0-9 _ -)" },
          { status: 400 }
        );
      }
      if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
        return Response.json({ error: "state must be an object" }, { status: 400 });
      }
      const cls = typeof body.class === "string" ? body.class.toLowerCase() : "";
      const suffix = /^[a-z0-9-]{1,16}$/.test(cls) ? `:${cls}` : "";
      const password = cleanPassword(body.password ?? "");
      const serialized = JSON.stringify(body.state);
      // 1MB KV value guard
      if (serialized.length > 900_000) {
        return Response.json({ error: "state too large" }, { status: 413 });
      }
      const key = `progress:${username}${suffix}`;
      type Rec = { state: Record<string, unknown>; updatedAt: number; hash?: string } | null;
      const existing = await env.PROGRESS_KV.get(key, "json").catch(() => null) as Rec;
      let hash = existing?.hash;
      if (hash) {
        if (!password) {
          return Response.json({ error: "password required" }, { status: 401 });
        }
        if ((await passHash(username, password)) !== hash) {
          return Response.json({ error: "wrong password" }, { status: 403 });
        }
      } else if (password) {
        // First save with a password claims the account.
        hash = await passHash(username, password);
      }
      const updatedAt = Date.now();
      await env.PROGRESS_KV.put(
        key,
        JSON.stringify(hash ? { state: body.state, updatedAt, hash } : { state: body.state, updatedAt })
      );
      return Response.json({ ok: true, username, updatedAt, locked: Boolean(hash) });
    }

    // Fallback to static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

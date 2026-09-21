/**
 * An in-process stand-in for api.github.com, installed as `globalThis.fetch`.
 * It implements just the endpoints the app calls, keeps a log of every request,
 * and can be told to refuse pushes or run out of rate limit — so the tests can
 * assert the exact sequence of writes without a token or a network.
 */
export const REPO = "acme/shop";
export const HEAD = "1111111111111111111111111111111111111111";

export interface Call {
  method: string;
  path: string;
  body?: any;
}

export interface FakeGithub {
  calls: Call[];
  writes(): Call[];
  files: Record<string, string>;
  canPush: boolean;
  isPrivate: boolean;
  /** Blob reads allowed before the API starts answering 403 rate-limited. */
  blobBudget: number;
  openPulls: { number: number; html_url: string; head: { sha: string } }[];
  refs: Record<string, string>;
  maxInflight: number;
  reset(files: Record<string, string>): void;
}

const blobSha = (path: string, text: string) => {
  let h = 0;
  for (const ch of `${path}\n${text}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `b${(h >>> 0).toString(16).padStart(8, "0")}`.padEnd(40, "0");
};

export function installFakeGithub(): FakeGithub {
  let inflight = 0;
  let serial = 0;
  const gh: FakeGithub = {
    calls: [],
    writes: () => gh.calls.filter((c) => c.method !== "GET"),
    files: {},
    canPush: true,
    isPrivate: true,
    blobBudget: Infinity,
    openPulls: [],
    refs: { "heads/main": HEAD },
    maxInflight: 0,
    reset(files) {
      gh.calls = [];
      gh.files = { ...files };
      gh.canPush = true;
      gh.isPrivate = true;
      gh.blobBudget = Infinity;
      gh.openPulls = [];
      gh.refs = { "heads/main": HEAD };
      gh.maxInflight = 0;
    },
  };

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const notFound = () => json({ message: "Not Found" }, 404);

  const route = (method: string, path: string, body: any): Response => {
    if (method === "GET" && path === "/user") return json({ login: "tester", name: "Tester", avatar_url: "", html_url: "" });
    if (method === "GET" && path === "/rate_limit") return json({ resources: { core: { remaining: 4321, limit: 5000, reset: 2000000000 } } });
    if (!path.startsWith(`/repos/${REPO}`)) return notFound();
    const rest = path.slice(`/repos/${REPO}`.length);

    if (method === "GET" && rest === "") return json({ default_branch: "main", private: gh.isPrivate, has_issues: true, permissions: { push: gh.canPush } });
    if (method === "GET" && rest === "/commits/HEAD") return new Response(gh.refs["heads/main"], { status: 200 });

    if (method === "GET" && rest.startsWith("/git/trees/")) {
      const tree: { path: string; type: string; sha: string; size?: number }[] = [];
      const dirs = new Set<string>();
      for (const [p, text] of Object.entries(gh.files)) {
        const parts = p.split("/");
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
        tree.push({ path: p, type: "blob", sha: blobSha(p, text), size: text.length });
      }
      for (const d of dirs) tree.push({ path: d, type: "tree", sha: `t-${d}` });
      return json({ sha: "tree", tree, truncated: false });
    }

    if (method === "GET" && rest.startsWith("/git/blobs/")) {
      if (gh.blobBudget-- <= 0) return json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000000000" });
      const sha = rest.slice("/git/blobs/".length);
      const hit = Object.entries(gh.files).find(([p, text]) => blobSha(p, text) === sha);
      return hit ? new Response(hit[1], { status: 200 }) : notFound();
    }

    if (method === "GET" && rest.startsWith("/git/ref/")) {
      const sha = gh.refs[decodeURIComponent(rest.slice("/git/ref/".length))];
      return sha ? json({ object: { sha } }) : notFound();
    }
    if (method === "GET" && rest.startsWith("/git/commits/")) return json({ tree: { sha: "base-tree" } });
    if (method === "GET" && rest.startsWith("/pulls?")) return json(gh.openPulls);

    if (!gh.canPush && method !== "GET" && !rest.startsWith("/issues")) return json({ message: "Resource not accessible by personal access token" }, 403);
    if (method === "POST" && rest === "/git/blobs") return json({ sha: `newblob${++serial}` }, 201);
    if (method === "POST" && rest === "/git/trees") return json({ sha: `newtree${++serial}` }, 201);
    if (method === "POST" && rest === "/git/commits") return json({ sha: "c0ffee0000000000000000000000000000000000", html_url: `https://github.com/${REPO}/commit/c0ffee0` }, 201);
    if (method === "POST" && rest === "/git/refs") {
      gh.refs[String(body.ref).replace(/^refs\//, "")] = body.sha;
      return json({ ref: body.ref }, 201);
    }
    if (method === "PATCH" && rest.startsWith("/git/refs/")) return json({});
    if (method === "POST" && rest === "/pulls") return json({ number: 42, html_url: `https://github.com/${REPO}/pull/42` }, 201);
    if (method === "POST" && rest === "/issues") return json({ number: 7, html_url: `https://github.com/${REPO}/issues/7` }, 201);
    return notFound();
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== "api.github.com") throw new Error(`Unexpected host in a test: ${url.host}`);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    gh.calls.push({ method, path: url.pathname + url.search, body });
    inflight++;
    gh.maxInflight = Math.max(gh.maxInflight, inflight);
    await new Promise((r) => setTimeout(r, 1)); // let concurrent requests overlap, as they would on a network
    inflight--;
    return route(method, url.pathname + url.search, body);
  }) as typeof fetch;

  // github.ts (web flavour) keeps its session in localStorage.
  const rows = new Map<string, string>([["arcade.github", JSON.stringify({ token: "test-token", user: { login: "tester", name: "Tester", avatarUrl: "", url: "" } })]]);
  (globalThis as any).localStorage = { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => void rows.set(k, v), removeItem: (k: string) => void rows.delete(k) };
  return gh;
}

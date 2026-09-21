/**
 * Arcade rule set — the knowledge the assessment runs on.
 *
 * Each rule is a self-contained description of one class of weakness: how to
 * spot it (a per-line `pattern` or a whole-file `fileScan`), how to talk about
 * it (summary / description / narrative), how to fix it (`fix`), and where it
 * sits on the attack surface (`surface`).
 *
 * This is deliberately *static* analysis: rules read source, they never run it.
 * Nothing here executes the target, reaches the network, or produces a working
 * exploit — a match is evidence that a weak pattern is present and reachable in
 * the user's own code, which the agents then explain and help close.
 *
 * The rule set is the seam a model later augments: a Bedrock-backed provider can
 * add findings or refine these ones, but the shapes it emits are exactly these.
 */
import type { Mitigation, Severity, SurfaceNode } from "./types";

export type RuleCategory =
  | "authz"
  | "injection"
  | "secrets"
  | "crypto"
  | "xss"
  | "transport"
  | "ssrf"
  | "path"
  | "config";

/** A single place in one file where a rule fired. `path` is added by the scanner. */
export interface RuleMatch {
  line: number; // 1-based
  column: number; // 0-based
  excerpt: string; // the offending source line, trimmed for display
  captured?: string; // the specific token that matched, when useful
}

/** How the remediator should edit the matched line. */
export interface FixEdit {
  mode: "replace" | "remove" | "insert-above";
  /** Lines to add (the replacement, or the guard to insert above). */
  add?: string[];
  /** One-line human explanation of the edit. */
  note: string;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  cwe: string;
  category: RuleCategory;
  /** Which surface node this weakness attaches to. */
  surface: SurfaceNode["kind"];
  /** File extensions the rule applies to; omitted = every text file. */
  ext?: string[];
  /** Per-line matcher. Mutually exclusive with `fileScan`. */
  pattern?: RegExp;
  /** Cheap guard to cut false positives once `pattern` hits a line. */
  refine?: (line: string, path: string) => boolean;
  /** Whole-file matcher, for weaknesses no single line reveals. */
  fileScan?: (text: string, path: string) => RuleMatch[];
  summary: string;
  description: string;
  attackNarrative: string;
  mitigations: Mitigation[];
  /** Produce the edit for one match. Rule-based today; a model can override later. */
  fix: (ctx: { line: string; id: string; mitigation?: Mitigation }) => FixEdit;
}

/* ------------------------------------------------------------------ helpers */

const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const bySeverity = (a: { severity: Severity }, b: { severity: Severity }) => rank[a.severity] - rank[b.severity];

const isComment = (line: string) => {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("#");
};

/** Default fix: leave the code, insert a reviewable guard comment above it. */
const scaffold = (add: string[], note: string): FixEdit => ({ mode: "insert-above", add, note });
const guard = ({ id, mitigation }: { id: string; mitigation?: Mitigation }): FixEdit =>
  scaffold(
    [`// FIXME [${id}] ${mitigation?.title ?? "review this — a fix is proposed for approval"}`],
    mitigation?.title ?? "Insert a review guard above the weakness",
  );

const mit = (title: string, detail: string, recommended: boolean, effort: Mitigation["effort"]): Mitigation => ({
  title,
  detail,
  recommended,
  effort,
});

/* -------------------------------------------------------------------- rules */

export const RULES: Rule[] = [
  {
    id: "hardcoded-secret",
    title: "Hard-coded credential in source",
    severity: "high",
    cwe: "CWE-798 · Use of Hard-coded Credentials",
    category: "secrets",
    surface: "secrets",
    pattern:
      /(?:sk_(?:live|test)_[0-9a-zA-Z]{12,}|AKIA[0-9A-Z]{16}|gh[pousr]_[0-9A-Za-z]{20,}|(?:api[_-]?key|secret|token|passwd|password|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*["'][^"']{8,}["'])/i,
    refine: (line) =>
      !/process\.env|import\.meta\.env|getenv|os\.environ|example|changeme|placeholder|your[_-]?key|xxxx|<[^>]+>|\*{4,}/i.test(
        line,
      ),
    summary: "A secret is written directly into the source instead of being loaded from the environment.",
    description:
      "A credential (API key, token, or password) is embedded as a string literal. Anyone with read access to the repository — or its history — can extract and reuse it. Secrets in code cannot be rotated without a code change and are routinely leaked through forks, backups, and CI logs.",
    attackNarrative:
      "The credential is present in a file that ships with the repository, so it is readable by anyone who can clone or browse the code. No exploitation of the running app is required — the secret is already exposed at rest.",
    mitigations: [
      mit("Move the secret to an environment variable", "Read it from process.env / a secrets manager and remove the literal from source.", true, "low"),
      mit("Rotate the exposed credential", "Assume the value is compromised: revoke it at the provider and issue a new one.", false, "low"),
      mit("Add a pre-commit secret scanner", "Block future commits that contain key-shaped strings.", false, "medium"),
    ],
    fix: ({ id }) =>
      scaffold(
        [`// FIXME [${id}] load this from the environment (e.g. process.env) and rotate the exposed value`],
        "Flag the literal for removal and rotation",
      ),
  },
  {
    id: "private-key",
    title: "Private key committed to the repository",
    severity: "critical",
    cwe: "CWE-798 · Use of Hard-coded Credentials",
    category: "secrets",
    surface: "secrets",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    summary: "A PEM private key block is stored in the codebase.",
    description:
      "A private key is committed in the clear. Private keys sign tokens, terminate TLS, and authenticate to other systems; one in the repo compromises every trust that depends on it.",
    attackNarrative:
      "The key material is at rest in the repository and readable by anyone with clone access. It should be treated as compromised the moment it lands in version control.",
    mitigations: [
      mit("Remove the key and rotate it", "Delete the material, generate a new keypair, and re-issue anything it signed.", true, "medium"),
      mit("Store keys outside the repo", "Use a secrets manager or a mounted secret; never version-control key material.", false, "medium"),
    ],
    fix: ({ id }) => scaffold([`// FIXME [${id}] remove this key from source and rotate it — treat as compromised`], "Flag the key for removal and rotation"),
  },
  {
    id: "sql-injection",
    title: "SQL built from untrusted input",
    severity: "high",
    cwe: "CWE-89 · SQL Injection",
    category: "injection",
    surface: "database",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "php", "go", "java"],
    pattern: /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE)\b/i,
    refine: (line) => !isComment(line) && (/\$\{/.test(line) || /["'`]\s*\+/.test(line) || /\+\s*["'`]/.test(line) || /%\s*\(/.test(line)) && /\b(query|execute|exec|raw|sql|prepare|cursor)\b/i.test(line),
    summary: "A query string is assembled with string interpolation or concatenation, so input can change its structure.",
    description:
      "Values are spliced into a SQL statement as text rather than bound as parameters. Input that reaches this string can alter the query — reading, modifying, or destroying data beyond what the feature intends.",
    attackNarrative:
      "Because the query is concatenated, a crafted value in the interpolated field changes the statement's meaning rather than being treated as data. The weakness is reachable wherever that value originates from a request.",
    mitigations: [
      mit("Use parameterized queries", "Pass values as bound parameters ($1, ?, :name) so the driver never treats them as SQL.", true, "low"),
      mit("Use the ORM's query builder", "Let the data layer bind values instead of building strings by hand.", false, "medium"),
    ],
    fix: guard,
  },
  {
    id: "command-injection",
    title: "Shell command built from untrusted input",
    severity: "high",
    cwe: "CWE-78 · OS Command Injection",
    category: "injection",
    surface: "service",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "php", "go"],
    pattern: /\b(?:exec|execSync|execFile|spawn|spawnSync|system|popen|os\.system|subprocess\.(?:call|run|Popen))\s*\(/,
    refine: (line) => !isComment(line) && (/\$\{/.test(line) || /["'`]\s*\+/.test(line) || /req\.|request\.|params\.|argv|input\(/i.test(line)),
    summary: "A value is interpolated into a command line handed to a shell.",
    description:
      "Untrusted input is concatenated into a command executed by a shell. Shell metacharacters in that input let an attacker run additional commands with the process's privileges.",
    attackNarrative:
      "The command string is assembled from input, so metacharacters are interpreted by the shell rather than passed as a literal argument. Reachability follows the interpolated value back to its source.",
    mitigations: [
      mit("Pass arguments as an array", "Use the exec-file / argv form so the OS never invokes a shell to parse the string.", true, "low"),
      mit("Validate against an allow-list", "Constrain the input to a known set before it reaches the command.", false, "medium"),
    ],
    fix: guard,
  },
  {
    id: "code-injection",
    title: "Dynamic code execution",
    severity: "high",
    cwe: "CWE-95 · Eval Injection",
    category: "injection",
    surface: "service",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py"],
    pattern: /\beval\s*\(|new\s+Function\s*\(|\bexec\s*\(\s*(?![)'"])/,
    refine: (line) => !isComment(line) && !/eval\(\s*["'][^"']*["']\s*\)/.test(line),
    summary: "Source is turned into executable code at runtime via eval / new Function.",
    description:
      "eval and the Function constructor execute strings as code. If any part of the string can be influenced by input, the input becomes code running with the app's full authority.",
    attackNarrative:
      "The evaluated string is not a fixed literal, so whatever flows into it is executed. This is the strongest form of injection because there is no query or command layer in between.",
    mitigations: [
      mit("Remove eval / new Function", "Replace with an explicit parser, a lookup table, or JSON.parse for data.", true, "medium"),
      mit("Sandbox untrusted expressions", "If dynamic evaluation is unavoidable, run it in an isolated interpreter with no host access.", false, "high"),
    ],
    fix: guard,
  },
  {
    id: "xss-inner-html",
    title: "Unescaped HTML rendered from a value",
    severity: "high",
    cwe: "CWE-79 · Cross-site Scripting",
    category: "xss",
    surface: "browser",
    ext: ["ts", "tsx", "js", "jsx", "vue", "svelte", "html", "htm"],
    pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|v-html/,
    refine: (line) => !isComment(line) && !/\.innerHTML\s*=\s*["'`]\s*["'`]/.test(line),
    summary: "A value is inserted into the DOM as raw HTML rather than as text.",
    description:
      "Assigning to innerHTML (or React's dangerouslySetInnerHTML, Vue's v-html, document.write) parses the value as markup. If the value carries attacker-controlled content, embedded script runs in the victim's session.",
    attackNarrative:
      "The value is written to the page as HTML, so any markup it contains — including <script> or event handlers — is parsed and executed by the browser in the user's context.",
    mitigations: [
      mit("Render as text", "Use textContent / JSX children so the value is escaped, not parsed.", true, "low"),
      mit("Sanitize before rendering", "If HTML is genuinely required, run it through a vetted sanitizer (e.g. DOMPurify) first.", false, "medium"),
    ],
    fix: guard,
  },
  {
    id: "weak-hash",
    title: "Weak or broken hash algorithm",
    severity: "medium",
    cwe: "CWE-327 · Use of a Broken Cryptographic Algorithm",
    category: "crypto",
    surface: "auth",
    pattern: /createHash\s*\(\s*["'](md5|sha1)["']|hashlib\.(?:md5|sha1)\s*\(|\bMD5\s*\(|MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-?1)["']/i,
    summary: "A cryptographically broken hash (MD5 / SHA-1) is in use.",
    description:
      "MD5 and SHA-1 are broken against collision and, for passwords, far too fast. Using them for integrity, signatures, or password storage undermines the guarantee the hash is meant to provide.",
    attackNarrative:
      "The algorithm itself is the weakness: its known collision and speed properties let an attacker forge or brute-force values the design assumes are hard.",
    mitigations: [
      mit("Use SHA-256 for integrity", "Replace MD5/SHA-1 with SHA-256 (or SHA-3) for hashing and signatures.", true, "low"),
      mit("Use a password KDF for passwords", "Store passwords with argon2 / bcrypt / scrypt, never a raw hash.", false, "medium"),
    ],
    fix: ({ line, id }) => {
      // Only the algorithm name inside the call is rewritten — never an identifier that happens to
      // contain "md5". A bare MD5(...) helper has no drop-in replacement, so it goes to review.
      const fixed = line
        .replace(/(createHash\s*\(\s*["'])(?:md5|sha1)(["'])/gi, "$1sha256$2")
        .replace(/(hashlib\.)(?:md5|sha1)(\s*\()/g, "$1sha256$2")
        .replace(/(MessageDigest\.getInstance\s*\(\s*["'])(?:MD5|SHA-?1)(["'])/gi, "$1SHA-256$2");
      return fixed !== line ? { mode: "replace", add: [fixed], note: "Upgrade the hash to SHA-256" } : guard({ id });
    },
  },
  {
    id: "insecure-random",
    title: "Insecure randomness for a security value",
    severity: "medium",
    cwe: "CWE-338 · Use of Cryptographically Weak PRNG",
    category: "crypto",
    surface: "auth",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
    pattern: /Math\.random\s*\(\s*\)/,
    refine: (line) => !isComment(line) && /token|secret|password|otp|nonce|salt|session|api[_-]?key|csrf|reset|verify|code\b|uuid/i.test(line),
    summary: "Math.random() is used to generate a value that must be unpredictable.",
    description:
      "Math.random() is not cryptographically secure — its output is predictable given prior values. Using it for tokens, session ids, OTPs, or salts lets an attacker guess or reproduce them.",
    attackNarrative:
      "The generator is deterministic enough that observing outputs narrows the next ones, so a security value derived from it is guessable rather than random.",
    mitigations: [
      mit("Use a CSPRNG", "Generate the value with crypto.randomUUID() / crypto.getRandomValues / randomBytes.", true, "low"),
    ],
    fix: guard,
  },
  {
    id: "tls-verification-disabled",
    title: "TLS certificate verification disabled",
    severity: "high",
    cwe: "CWE-295 · Improper Certificate Validation",
    category: "transport",
    surface: "thirdparty",
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:0|false)/,
    summary: "Certificate checking is turned off for an outbound TLS connection.",
    description:
      "Disabling certificate verification means the client will trust any certificate, including an attacker's. It removes the guarantee that the peer is who it claims to be, opening the connection to interception.",
    attackNarrative:
      "With verification off, a machine-in-the-middle presenting any certificate is accepted, so traffic to the peer can be read or modified in transit.",
    mitigations: [
      mit("Re-enable verification", "Remove the flag so certificates are validated against trusted roots.", true, "low"),
      mit("Pin or add the real CA", "If the peer uses a private CA, trust that CA explicitly instead of disabling checks.", false, "medium"),
    ],
    fix: ({ line, id }) => {
      // Flip the flag where it stands. Deleting the line would take anything else on it along, and
      // an explicit `true` survives a later default change. Forms with no safe in-place value go to review.
      const fixed = line
        .replace(/(rejectUnauthorized\s*:\s*)false/, "$1true")
        .replace(/(\bverify\s*=\s*)False/, "$1True")
        .replace(/(InsecureSkipVerify\s*:\s*)true/, "$1false")
        .replace(/(CURLOPT_SSL_VERIFYPEER\s*,\s*)(?:0|false)/, "$1true");
      return fixed !== line ? { mode: "replace", add: [fixed], note: "Turn certificate verification back on" } : guard({ id });
    },
  },
  {
    id: "open-cors",
    title: "CORS allows any origin",
    severity: "medium",
    cwe: "CWE-942 · Overly Permissive Cross-domain Policy",
    category: "config",
    surface: "api",
    pattern: /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|origin\s*:\s*["']\*["']/i,
    summary: "The API returns Access-Control-Allow-Origin: * ",
    description:
      "A wildcard origin lets any website make cross-origin requests to the API. Combined with credentialed requests it lets a malicious page act on behalf of a signed-in user.",
    attackNarrative:
      "Any origin is permitted, so a page the victim visits can call the API in their context; the browser will not block the cross-origin response.",
    mitigations: [
      mit("Allow only known origins", "Echo back a specific, validated origin from an allow-list instead of '*'.", true, "low"),
      mit("Never pair '*' with credentials", "If cookies are sent, a concrete origin is mandatory.", false, "low"),
    ],
    // Which origins are legitimate is something only the project knows; a made-up host would break
    // the app, so this rule describes the fix and leaves writing it to an agent or a person.
    fix: guard,
  },
  {
    id: "weak-jwt",
    title: "Unverified or 'none'-algorithm JWT",
    severity: "high",
    cwe: "CWE-347 · Improper Verification of Cryptographic Signature",
    category: "authz",
    surface: "auth",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "java"],
    pattern: /algorithms?\s*:\s*\[?\s*["']none["']|jwt\.decode\s*\(|verify_signature\s*[:=]\s*False/i,
    refine: (line) => !isComment(line),
    summary: "A JWT is read without a verified signature, or the 'none' algorithm is accepted.",
    description:
      "Decoding a JWT without verifying its signature — or accepting alg: none — means the token's claims are trusted without proof. An attacker can forge a token asserting any identity or role.",
    attackNarrative:
      "The signature is never checked, so a token whose claims are attacker-chosen is accepted as authentic, granting whatever identity or role it asserts.",
    mitigations: [
      mit("Verify with a fixed algorithm", "Use jwt.verify() and pin the expected algorithm (e.g. RS256); never accept 'none'.", true, "low"),
      mit("Reject unexpected algorithms", "Validate the header alg against an allow-list before verifying.", false, "low"),
    ],
    fix: guard,
  },
  {
    id: "ssrf",
    title: "Outbound request to an untrusted URL",
    severity: "high",
    cwe: "CWE-918 · Server-Side Request Forgery",
    category: "ssrf",
    surface: "service",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rb"],
    pattern: /(?:fetch|axios(?:\.(?:get|post|put|delete|request))?|http\.get|https\.get|got|requests\.(?:get|post)|urllib)\s*\(/,
    refine: (line) => !isComment(line) && /req\.(query|params|body)|request\.(query|args|json|form)|params\.|\.body\.|input\(/i.test(line),
    summary: "A server-side request is made to a URL derived from user input.",
    description:
      "The destination of an outbound request comes from input. An attacker can point it at internal services, cloud metadata endpoints, or local files, using the server as a proxy past network controls.",
    attackNarrative:
      "The request target is caller-controlled, so it can be aimed at addresses the caller could not reach directly — internal hosts or metadata services behind the server's network boundary.",
    mitigations: [
      mit("Validate the URL against an allow-list", "Permit only known hosts/schemes; reject internal and metadata addresses.", true, "medium"),
      mit("Resolve and re-check the address", "After DNS resolution, block private/link-local ranges before connecting.", false, "high"),
    ],
    fix: guard,
  },
  {
    id: "path-traversal",
    title: "File path built from user input",
    severity: "high",
    cwe: "CWE-22 · Improper Limitation of a Pathname",
    category: "path",
    surface: "service",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rb", "php"],
    pattern: /(?:readFile(?:Sync)?|createReadStream|sendFile|res\.download|fs\.(?:read|open)|open\s*\(|Path\s*\()/,
    refine: (line) => !isComment(line) && /req\.(query|params|body)|request\.(query|args|json|form)|params\.|\.body\./i.test(line),
    summary: "A filesystem path is assembled from request input.",
    description:
      "A path used to read or send a file is built from input. Sequences like ../ let the caller escape the intended directory and reach files elsewhere on disk.",
    attackNarrative:
      "The path is caller-influenced, so traversal sequences resolve outside the intended folder, exposing files the endpoint was never meant to serve.",
    mitigations: [
      mit("Resolve and confine the path", "Normalize the path and verify it stays within the intended root before use.", true, "medium"),
      mit("Map input to safe identifiers", "Look the file up by an id/allow-list instead of using the raw path.", false, "medium"),
    ],
    fix: guard,
  },
  {
    id: "missing-authz",
    title: "Authenticated endpoint with no authorization check",
    severity: "critical",
    cwe: "CWE-862 · Missing Authorization",
    category: "authz",
    surface: "admin",
    ext: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go"],
    // Whole-file heuristic: a privileged handler that authenticates but never
    // checks a role/permission.
    fileScan: (text, path) => {
      const p = path.toLowerCase();
      const privilegedPath = /\/(api|admin|internal|route)s?\//.test(p) || /admin|export|delete|payout|refund|invite|role/.test(p);
      if (!privilegedPath) return [];
      const authRe = /(validateSession|getSession|getServerSession|requireAuth|requireLogin|authenticate|verifyToken|isAuthenticated|current_user|@login_required)/;
      const roleRe = /(role|isAdmin|is_admin|requireRole|require_role|hasPermission|has_permission|can\(|authorize|forbidden|403|scope\b|isOwner|owner_id|permission)/i;
      const privilegedVerb = /\b(POST|PUT|DELETE|PATCH)\b|def (post|put|delete|patch)|\.(post|put|delete|patch)\s*\(|SELECT\s+\*|DELETE\s+FROM|UPDATE\s+/i;
      if (!authRe.test(text) || roleRe.test(text) || !privilegedVerb.test(text)) return [];
      const lines = text.split("\n");
      // Point at where the handler authenticates, not at the line that imports the helper.
      const isImport = (l: string) => /^\s*(?:import\b|from\b|export\s+\{|(?:const|let|var)\s+.*=\s*require\s*\()/.test(l);
      const used = lines.findIndex((l) => authRe.test(l) && !isImport(l));
      const at = used >= 0 ? used : lines.findIndex((l) => authRe.test(l));
      if (at < 0) return [];
      return [{ line: at + 1, column: 0, excerpt: lines[at].trim(), captured: "authn without authz" }];
    },
    summary: "A privileged handler confirms who the caller is but not whether they are allowed.",
    description:
      "The handler authenticates the request but has no role or ownership check before performing a privileged action. Every authenticated user — not only the intended administrators or owners — can reach it.",
    attackNarrative:
      "Authentication proves identity, not permission. With no authorization gate, any signed-in caller can invoke the privileged action by making the same request an authorized user would.",
    mitigations: [
      mit("Add a role / ownership check", "After authenticating, reject callers who lack the required role or who do not own the resource (return 403).", true, "low"),
      mit("Default-deny privileged routes", "Require an explicit authorization decision for every privileged handler.", false, "medium"),
    ],
    fix: ({ id, mitigation }) =>
      scaffold(
        [`// FIXME [${id}] ${mitigation?.title ?? "add an authorization check (role/ownership) and return 403 for non-admins"}`],
        "Insert an authorization guard above the handler body",
      ),
  },
];

export const RULES_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.id, r]));

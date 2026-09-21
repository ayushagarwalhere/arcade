// Arcade argv parser — schema-driven, so a flag's value is never mistaken for a
// command or a positional argument.
//
//   --flag value   --flag=value   --bool   --no-bool   --bool=false   -h   -v
//   --             everything after it is positional, verbatim
//
// The first positional token is the command. `raw` is everything after that
// token, untouched — for sub-CLIs (`arcade sandbox …`) that parse their own
// flags. Unknown flags and missing values are usage errors, not guesses.
//
// Dependency-free.

export class UsageError extends Error {}

/** Flags every command accepts. `string` flags take a value; `boolean` flags don't. */
export const FLAGS = {
  json: "boolean",
  help: "boolean",
  version: "boolean",
  cwd: "string",
  // scan
  scope: "string",
  "fail-on": "string",
  sarif: "string",
  // fix
  apply: "boolean",
  commit: "boolean",
  push: "boolean",
  pr: "boolean",
  force: "boolean",
  branch: "string",
  // fix / agent
  agent: "string",
  model: "string",
  edit: "boolean",
  // findings
  severity: "string",
  all: "boolean",
};

const SHORT = { h: "help", v: "version", V: "version" };

/** Commands that own everything after their name; their flags are not ours to judge. */
const RAW_COMMANDS = new Set(["sandbox"]);

const FALSE = new Set(["false", "0", "no", "off"]);
const TRUE = new Set(["true", "1", "yes", "on"]);

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ command: string|null, positionals: string[], flags: Record<string, string|boolean>, raw: string[] }}
 */
export function parseArgv(argv, schema = FLAGS) {
  const flags = {};
  const positionals = [];
  let command = null;
  let raw = [];

  const take = (token) => {
    if (command == null) command = token;
    else positionals.push(token);
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--") {
      for (const rest of argv.slice(i + 1)) take(rest);
      break;
    }

    if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      let name = eq < 0 ? a.slice(2) : a.slice(2, eq);
      let value = eq < 0 ? undefined : a.slice(eq + 1);
      let negated = false;
      if (!(name in schema) && name.startsWith("no-") && schema[name.slice(3)] === "boolean") {
        name = name.slice(3);
        negated = true;
      }
      const kind = schema[name];
      if (!kind) throw new UsageError(`unknown option --${name}. Try "arcade help".`);

      if (kind === "boolean") {
        if (value === undefined) flags[name] = !negated;
        else if (TRUE.has(value.toLowerCase())) flags[name] = !negated;
        else if (FALSE.has(value.toLowerCase())) flags[name] = negated;
        else throw new UsageError(`--${name} is an on/off option; it doesn't take the value "${value}".`);
        continue;
      }

      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || next === "--" || (next.startsWith("--") && next.length > 2)) throw new UsageError(`--${name} needs a value.`);
        value = next;
        i++;
      }
      if (value === "") throw new UsageError(`--${name} needs a value.`);
      flags[name] = value;
      continue;
    }

    if (a.length === 2 && a[0] === "-" && SHORT[a[1]]) {
      flags[SHORT[a[1]]] = true;
      continue;
    }
    if (a.length > 1 && a[0] === "-" && command == null) throw new UsageError(`unknown option ${a}. Try "arcade help".`);

    const isCommand = command == null;
    take(a);
    if (isCommand && RAW_COMMANDS.has(a)) {
      raw = argv.slice(i + 1); // by position, never by searching for the word
      break;
    }
  }

  return { command, positionals, flags, raw };
}

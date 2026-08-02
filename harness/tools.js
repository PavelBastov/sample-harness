// Tools - the actions the model can ask the harness to run.
//
// A tool is just a function plus a JSON-schema contract (name, description,
// parameters, func). The registry turns those into OpenAI tool specs (so the
// model knows what it can call) and dispatches calls by name, parsing
// arguments and returning a string result - or an error string the model can
// read and recover from.
//
// Tools are an API surface you expose to a model: keep the list small, keep
// each contract narrow, and validate arguments. calculator() evaluates
// arithmetic without eval; readFile() returns a file's contents - and as of
// ch-08 it is confined to the workspace: a model-invoked tool must not wander
// the host filesystem, so paths are resolved and must live under the working
// directory.

import fs from "node:fs";
import path from "node:path";

const TOKEN_RE = /\s*(\*\*|\d+(?:\.\d+)?|[()+\-*/%])/y;

function tokenize(expression) {
  const tokens = [];
  let pos = 0;
  while (pos < expression.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(expression);
    if (!m) throw new Error("unsupported expression");
    tokens.push(m[1]);
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

// Recursive-descent parser over the token stream. Precedence (low to high):
// + - < * / % < unary minus < ** (right-associative, and the exponent may
// itself start with a unary minus, e.g. 2 ** -1).
function evaluate(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function primary() {
    const t = consume();
    if (t === "(") {
      const v = additive();
      if (consume() !== ")") throw new Error("unsupported expression");
      return v;
    }
    if (t !== undefined && /^\d+(\.\d+)?$/.test(t)) return Number(t);
    throw new Error("unsupported expression");
  }

  function power() {
    const base = primary();
    if (peek() === "**") {
      consume();
      return base ** unary();
    }
    return base;
  }

  function unary() {
    if (peek() === "-") {
      consume();
      return -unary();
    }
    return power();
  }

  function multiplicative() {
    let v = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = consume();
      const rhs = unary();
      v = op === "*" ? v * rhs : op === "/" ? v / rhs : v % rhs;
    }
    return v;
  }

  function additive() {
    let v = multiplicative();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const rhs = multiplicative();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = additive();
  if (pos !== tokens.length) throw new Error("unsupported expression");
  return result;
}

export function calculator(expression) {
  const result = evaluate(tokenize(String(expression).trim()));
  return String(Number.isInteger(result) ? result : result);
}

export function readFile(filePath) {
  // Confined to the workspace (ch-08 hardening): the model-invoked tool must
  // not wander the host filesystem (no /etc/passwd). Paths are resolved and
  // must live under the current working directory.
  const root = path.resolve(process.cwd());
  const p = path.resolve(filePath);
  if (p !== root && !p.startsWith(root + path.sep)) {
    return `error: path outside workspace: ${filePath}`;
  }
  return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, "utf8") : `error: no such file: ${filePath}`;
}

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(tool) {
    this._tools.set(tool.name, tool);
  }

  specs() {
    return [...this._tools.values()].map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async call(name, argumentsJson) {
    const tool = this._tools.get(name);
    if (!tool) return `error: unknown tool ${JSON.stringify(name)}`;
    let args;
    try {
      args = argumentsJson ? JSON.parse(argumentsJson) : {};
    } catch {
      return `error: could not parse arguments ${JSON.stringify(argumentsJson)}`;
    }
    try {
      return String(await tool.func(args));
    } catch (err) {
      return `error: ${err.message}`;
    }
  }

  get size() {
    return this._tools.size;
  }
}

export function defaultTools() {
  const registry = new ToolRegistry();
  registry.register({
    name: "calculator",
    description: "Evaluate an arithmetic expression like '47 * 89'.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    func: ({ expression }) => calculator(expression),
  });
  registry.register({
    name: "read_file",
    description: "Read a UTF-8 text file from disk and return its contents.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    func: ({ path: filePath }) => readFile(filePath),
  });
  return registry;
}

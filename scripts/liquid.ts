// Minimal renderer for the Liquid tags used in github/docs markdown.
//
// WHY this exists: GitHub Docs source files are not plain markdown. They pull in
// shared text ("reusables"), product names ("variables") and version-specific
// blocks ({% ifversion %}) at build time. Without resolving these, the corpus would
// be full of "{% data variables.product.prodname_actions %}" instead of
// "GitHub Actions", which hurts both retrieval and the answers we show.
//
// We render the "fpt" version (Free, Pro and Team plans on github.com), which is
// what docs.github.com shows by default. This is a deliberately small subset of
// Liquid, not a general implementation.

export type Resolver = {
  /** Returns the markdown of a reusable, e.g. "actions.cache-default-size", or null if missing. */
  reusable(path: string): Promise<string | null>;
  /** Returns the string value of a variable, e.g. "product.prodname_actions", or null if missing. */
  variable(path: string): Promise<string | null>;
  /** Returns true if a feature flag (data/features/<name>.yml) is enabled on fpt. */
  feature(name: string): Promise<boolean>;
};

const MAX_DEPTH = 8;

/** Removes {% comment %}...{% endcomment %} blocks and their content. */
export function stripComments(src: string): string {
  return src.replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, '');
}

/** Protects {% raw %} blocks from tag processing; returns the text and a restore function. */
function protectRaw(src: string): { text: string; restore: (s: string) => string } {
  const saved: string[] = [];
  const text = src.replace(/{%-?\s*raw\s*-?%}([\s\S]*?){%-?\s*endraw\s*-?%}/g, (_m, inner: string) => {
    saved.push(inner);
    return `@@RAW${saved.length - 1}@@`;
  });
  return {
    text,
    restore: (s) => s.replace(/@@RAW(\d+)@@/g, (_m, i: string) => saved[Number(i)] ?? ''),
  };
}

/** Replaces {% data ... %} and {% indented_data_reference ... %} tags, recursively. */
export async function resolveData(src: string, r: Resolver, depth = 0): Promise<string> {
  if (depth > MAX_DEPTH) return src;
  const re = /{%-?\s*(data|indented_data_reference)\s+([\w./-]+)(?:\s+spaces=(\d+))?\s*-?%}/g;
  const matches = [...src.matchAll(re)];
  if (matches.length === 0) return src;

  let out = '';
  let last = 0;
  for (const m of matches) {
    out += src.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    const ref = m[2];
    let value: string | null = null;
    if (ref.startsWith('reusables.')) {
      value = await r.reusable(ref.slice('reusables.'.length));
      if (value !== null) value = await resolveData(stripComments(value).trim(), r, depth + 1);
    } else if (ref.startsWith('variables.')) {
      value = await r.variable(ref.slice('variables.'.length));
      if (value !== null) value = await resolveData(value, r, depth + 1);
    }
    if (value === null) value = '';
    if (m[1] === 'indented_data_reference' && m[3]) {
      const pad = ' '.repeat(Number(m[3]));
      value = value
        .split('\n')
        .map((line) => (line.length ? pad + line : line))
        .join('\n');
    }
    out += value;
  }
  out += src.slice(last);
  return out;
}

/**
 * Evaluates an {% ifversion %} condition for the fpt version.
 * Supports "a or b", "a and b", "not a", version names and feature flags.
 * Liquid has no operator precedence rules we need here, so we treat it as OR of ANDs.
 */
export async function evalVersionCondition(cond: string, r: Resolver): Promise<boolean> {
  for (const orPart of cond.split(/\s+or\s+/)) {
    let all = true;
    for (const andPart of orPart.split(/\s+and\s+/)) {
      if (!(await evalAtom(andPart.trim(), r))) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

async function evalAtom(atom: string, r: Resolver): Promise<boolean> {
  if (atom.startsWith('not ')) return !(await evalAtom(atom.slice(4).trim(), r));
  const name = atom.split(/\s+/)[0];
  if (name === 'fpt') return true;
  // ghec, ghes (with or without a version comparison) and ghae are other products.
  if (name === 'ghec' || name === 'ghes' || name === 'ghae') return false;
  return r.feature(name);
}

/** Applies {% ifversion %}/{% elsif %}/{% else %}/{% endif %} for the fpt version. */
export async function resolveConditionals(src: string, r: Resolver): Promise<string> {
  const re = /{%-?\s*(ifversion|elsif|else|endif)\b([^%]*?)-?%}/g;
  // Each frame: is the parent emitting, has a branch already been taken, is this branch emitting.
  const stack: { parentOn: boolean; taken: boolean; on: boolean }[] = [];
  const isOn = () => (stack.length === 0 ? true : stack[stack.length - 1].on);

  let out = '';
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (isOn()) out += src.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    const tag = m[1];
    const cond = m[2].trim();
    if (tag === 'ifversion') {
      const parentOn = isOn();
      const ok = parentOn && (await evalVersionCondition(cond, r));
      stack.push({ parentOn, taken: ok, on: ok });
    } else if (tag === 'elsif') {
      const f = stack[stack.length - 1];
      if (!f) continue;
      const ok = f.parentOn && !f.taken && (await evalVersionCondition(cond, r));
      f.on = ok;
      f.taken = f.taken || ok;
    } else if (tag === 'else') {
      const f = stack[stack.length - 1];
      if (!f) continue;
      f.on = f.parentOn && !f.taken;
      f.taken = true;
    } else {
      stack.pop();
    }
  }
  if (isOn()) out += src.slice(last);
  return out;
}

/** Drops any remaining tags ({% note %}, {% octicon %}, {% webui %} ...) but keeps their inner text. */
export function dropRemainingTags(src: string): string {
  // Octicons are icons; drop the space after them so '**{% octicon %} Settings**' becomes '**Settings**'.
  return src.replace(/{%-?\s*octicon\b[^%]*%}[ \t]?/g, '').replace(/{%-?[\s\S]*?-?%}/g, '');
}

/** Full pipeline: comments, data references, conditionals, leftover tags, raw blocks. */
export async function renderLiquid(src: string, r: Resolver): Promise<string> {
  const { text, restore } = protectRaw(stripComments(src));
  let s = await resolveData(text, r);
  s = await resolveConditionals(s, r);
  s = dropRemainingTags(s);
  return restore(s);
}

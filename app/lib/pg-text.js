/**
 * Strip characters Postgres cannot store, before a payload reaches the DB.
 *
 * Two characters have no representation in a Postgres `text` column or
 * inside a JSON value: the NUL (code point 0) and an unpaired UTF-16
 * surrogate. Neither is a client error worth a 400 — both arrive as ordinary
 * content in an agent's payload (a source file that uses a NUL as a
 * separator, a binary excerpt, an emoji cut in half by a length cap) — and
 * the only thing the database can do with them is refuse the statement.
 *
 * Incident (my-dashclaw, 2026-09-14, reproduced 2026-09-15): a governed
 * session wrote a TypeScript file whose template literal used a NUL
 * separator. One character produced two separate outages:
 *
 *   1. The server stored the guard context (a TEXT column) as JSON, so the
 *      NUL became a `u0000` escape in that text. `claimActionExecution`
 *      reads three fields out of it with `d.context::jsonb`, and that cast
 *      fails with 22P05 "unsupported Unicode escape sequence" — so the
 *      folded claim in POST /api/guard 500'd, the hook's PATCH fallback hit
 *      the identical error, and the pretool hook blocked the tool call with
 *      "execution claim failed or returned an ambiguous response". Five
 *      blocked calls in one session.
 *   2. The same NUL in an outcome string reached a text parameter directly
 *      and failed with 22021 "invalid byte sequence for encoding UTF8: 0x00",
 *      so PATCH /api/actions/<id> 500'd and the row stayed `running` — a
 *      dangling ledger entry that the outcome sweep would later close as a
 *      false `lost_confirmation`.
 *
 * Stripping is the only option that keeps the evidence: the character cannot
 * be persisted in any form, and dropping it leaves the surrounding command,
 * diff or summary intact and readable.
 *
 * Written as a character scan rather than a regex on purpose — a regex for
 * these code points can only be spelled with the very escapes this module
 * exists to handle, and this file has to survive its own governance hook.
 *
 * Plain JS on purpose: app/lib/validate.js imports it, and Turbopack will not
 * map a .js -> .ts import from a .js importer.
 */

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;

/** Depth beyond which a payload is left alone. Guard and action payloads nest
 * a handful of levels; anything deeper is not evidence we need to rewrite. */
const MAX_DEPTH = 16;

function isHighSurrogate(code) {
  return code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX;
}

function isLowSurrogate(code) {
  return code >= LOW_SURROGATE_MIN && code <= LOW_SURROGATE_MAX;
}

/** True when the string holds a character Postgres cannot store. */
export function hasUnstorableChars(value) {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) return true;
    if (isHighSurrogate(code)) {
      if (!isLowSurrogate(value.charCodeAt(i + 1))) return true;
      i++;
      continue;
    }
    if (isLowSurrogate(code)) return true;
  }
  return false;
}

/**
 * Drop every unstorable character from a string. A well-formed surrogate
 * pair (any astral character — emoji, CJK extension, mathematical alphabet)
 * is kept whole; only an unpaired half is dropped.
 */
export function stripUnstorableString(value) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) continue;
    if (isHighSurrogate(code)) {
      if (isLowSurrogate(value.charCodeAt(i + 1))) {
        out += value[i] + value[i + 1];
        i++;
      }
      continue;
    }
    if (isLowSurrogate(code)) continue;
    out += value[i];
  }
  return out;
}

/**
 * Deep-strip unstorable characters from a JSON-shaped value.
 *
 * Returns the input itself when nothing had to change, so the common path
 * allocates nothing. Strings, arrays and plain objects are walked; every
 * other type (number, boolean, null, Date, class instance) passes through
 * untouched, because only a JSON payload is ours to rewrite.
 */
export function stripUnstorableChars(value, depth = 0) {
  if (typeof value === 'string') {
    return hasUnstorableChars(value) ? stripUnstorableString(value) : value;
  }
  if (!value || typeof value !== 'object' || depth >= MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = stripUnstorableChars(item, depth + 1);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  let changed = false;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const cleanKey = hasUnstorableChars(key) ? stripUnstorableString(key) : key;
    const next = stripUnstorableChars(item, depth + 1);
    if (next !== item || cleanKey !== key) changed = true;
    out[cleanKey] = next;
  }
  return changed ? out : value;
}

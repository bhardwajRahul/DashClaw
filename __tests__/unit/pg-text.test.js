import { describe, it, expect } from 'vitest';
import {
  hasUnstorableChars,
  stripUnstorableString,
  stripUnstorableChars,
} from '../../app/lib/pg-text.js';

// Built from char codes, never from escapes: a source file carrying a literal
// NUL or a lone surrogate is exactly what this module exists to keep out of
// payloads, and it would not survive the repo's own governance hook.
const NUL = String.fromCharCode(0);
const LONE_HIGH = String.fromCharCode(0xd800);
const LONE_LOW = String.fromCharCode(0xdfff);
const EMOJI = String.fromCharCode(0xd83d, 0xde00); // a well-formed pair

describe('hasUnstorableChars', () => {
  it('detects a NUL and each unpaired surrogate half', () => {
    expect(hasUnstorableChars(`a${NUL}b`)).toBe(true);
    expect(hasUnstorableChars(`a${LONE_HIGH}b`)).toBe(true);
    expect(hasUnstorableChars(`a${LONE_LOW}b`)).toBe(true);
  });

  it('leaves storable text alone, astral characters included', () => {
    expect(hasUnstorableChars('plain text')).toBe(false);
    expect(hasUnstorableChars(`hi ${EMOJI}`)).toBe(false);
    // The two-character escape sequence as literal text is storable: it is
    // only a problem once a JSON decoder has turned it into a real NUL.
    expect(hasUnstorableChars('const sep = "\\u0000"')).toBe(false);
    expect(hasUnstorableChars(42)).toBe(false);
    expect(hasUnstorableChars(null)).toBe(false);
  });
});

describe('stripUnstorableString', () => {
  it('drops the NUL and keeps the surrounding evidence', () => {
    expect(stripUnstorableString(`rm ${NUL}-rf /tmp/x`)).toBe('rm -rf /tmp/x');
  });

  it('drops an unpaired surrogate but never a well-formed pair', () => {
    expect(stripUnstorableString(`a${LONE_HIGH}b`)).toBe('ab');
    expect(stripUnstorableString(`a${LONE_LOW}b`)).toBe('ab');
    expect(stripUnstorableString(`ship it ${EMOJI}`)).toBe(`ship it ${EMOJI}`);
  });

  it('survives a trailing high surrogate at the end of a truncated string', () => {
    expect(stripUnstorableString(`cut here${LONE_HIGH}`)).toBe('cut here');
  });
});

describe('stripUnstorableChars', () => {
  it('walks strings, arrays and plain objects', () => {
    const cleaned = stripUnstorableChars({
      command: `echo ${NUL}hi`,
      systems: [`db${NUL}`, 'api'],
      act: { kind: 'file', content: `const sep = ${NUL};` },
    });
    expect(cleaned).toEqual({
      command: 'echo hi',
      systems: ['db', 'api'],
      act: { kind: 'file', content: 'const sep = ;' },
    });
  });

  it('cleans object keys too', () => {
    const cleaned = stripUnstorableChars({ [`bad${NUL}key`]: 'v' });
    expect(Object.keys(cleaned)).toEqual(['badkey']);
  });

  it('returns the very same reference when nothing had to change', () => {
    const input = { a: 'clean', b: [1, 2, { c: EMOJI }] };
    expect(stripUnstorableChars(input)).toBe(input);
  });

  it('passes non-JSON values through untouched', () => {
    const date = new Date('2026-09-14T00:00:00.000Z');
    expect(stripUnstorableChars(date)).toBe(date);
    expect(stripUnstorableChars(7)).toBe(7);
    expect(stripUnstorableChars(true)).toBe(true);
    expect(stripUnstorableChars(null)).toBe(null);
    expect(stripUnstorableChars(undefined)).toBe(undefined);
  });

  it('stops descending at the depth cap instead of recursing forever', () => {
    let deep = `leaf${NUL}`;
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => stripUnstorableChars(deep)).not.toThrow();
  });

  it('produces JSON that Postgres can parse as a jsonb value', () => {
    // The precise failure: JSON.stringify of a real NUL emits a u0000 escape,
    // and casting that text to jsonb raises 22P05. After stripping, the
    // serialized form carries no such escape.
    const nulEscape = JSON.stringify(NUL).slice(1, -1);
    expect(JSON.stringify({ content: `a${NUL}b` })).toContain(nulEscape);
    expect(JSON.stringify(stripUnstorableChars({ content: `a${NUL}b` }))).not.toContain(nulEscape);
  });
});

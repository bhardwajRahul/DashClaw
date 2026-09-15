/**
 * Verification contract — the disposition rule behind the `verification_contract`
 * policy type.
 *
 * An LLM verifier catches only what the specification named. When an obligation
 * was never written down and no convention settles it, the verifier is not
 * failing to reason — it is reasoning correctly over an input that does not
 * contain the answer, and it says "looks right" at roughly the same confidence
 * it uses when it IS right. Measured on a purpose-built corpus: a confident
 * false pass on 100% of the runs with the edge omitted, converting to a 98%
 * catch once the same edge was written into the spec. A bigger model does not
 * close that gap; a ~30x spend increase recovered nothing.
 *
 * So the governed action carries a contract, and each item in it carries a
 * verification tier. What this module decides is what to do when a tier cannot
 * be discharged:
 *
 *   test-tier item, violated .................... block
 *   test-tier item, not actually checked ........ block   (fail closed)
 *   non-inferable item, never resolved .......... require_approval (insufficient_spec)
 *   judgment-tier item, unconfirmable ........... require_approval (insufficient_spec)
 *
 * The middle line is the one that carries the weight. A check that could not be
 * RUN tells us exactly as much about the code as a check that ran and failed, so
 * it is treated the same way. Skipping it is how a pipeline manufactures a green.
 *
 * The third line is the paper's `insufficient_spec → human_needed`. DashClaw
 * already has a verdict that means human_needed — `require_approval` — so this
 * rides it and marks itself in the reason rather than adding a fifth verdict the
 * SDKs, contracts/ and schema.js would all have to learn. The distinction that
 * matters operationally is "a human must look", and that is preserved exactly.
 *
 * One property worth keeping in mind when reading this: the abstention is driven
 * by a tag the SPEC carries, never by asking a model whether it feels unsure.
 * Self-assessed uncertainty fires on whatever ambiguity the model happens to
 * notice and essentially never on the real blind spot, because the model cannot
 * feel a blind spot. A contract tag routes correctly even when the reader would
 * have named the wrong reason — which is the only kind of mechanism that helps
 * here, since a verifier able to name the true edge was never blind to it.
 */

/** Verification tier, orthogonal to disposition. */
export type ContractTier = 'test' | 'judgment';

/** What the spec-time probe decided to do with a raised edge. */
export type ContractDisposition = 'specify' | 'backstop' | 'dismiss' | 'defer';

/** What the caller claims actually happened to the item before this call. */
export type ContractStatus = 'verified' | 'violated' | 'unchecked';

export interface ContractItem {
  id: string;
  tier: ContractTier;
  status: ContractStatus;
  disposition?: ContractDisposition;
  /** The exogenous tag: correct behavior is not recoverable from the rest of the spec. */
  non_inferable?: boolean;
  requirement?: string;
}

export interface VerificationContract {
  subject?: string;
  must_haves: ContractItem[];
  prohibitions: ContractItem[];
}

export type ContractDispositionKind = 'violation' | 'unchecked_test' | 'insufficient_spec';

export interface ContractFinding {
  kind: ContractDispositionKind;
  id: string;
  detail: string;
}

const TIERS = new Set<ContractTier>(['test', 'judgment']);
const STATUSES = new Set<ContractStatus>(['verified', 'violated', 'unchecked']);
const DISPOSITIONS = new Set<ContractDisposition>(['specify', 'backstop', 'dismiss', 'defer']);

/** Caps: a contract rides in a request body, so it is bounded like any other input. */
const MAX_ITEMS = 200;
const MAX_ID_LEN = 64;

function normalizeItem(raw: unknown): ContractItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.slice(0, MAX_ID_LEN) : '';
  if (!id) return null;

  // An unrecognized tier is not a reason to wave the item through. Treating it
  // as judgment means the worst an unknown value can do is ask for a human.
  const tier: ContractTier = TIERS.has(o.tier as ContractTier) ? (o.tier as ContractTier) : 'judgment';
  // Same posture on status: anything we do not recognize is "we did not check".
  const status: ContractStatus = STATUSES.has(o.status as ContractStatus)
    ? (o.status as ContractStatus)
    : 'unchecked';
  const disposition = DISPOSITIONS.has(o.disposition as ContractDisposition)
    ? (o.disposition as ContractDisposition)
    : undefined;

  return {
    id,
    tier,
    status,
    disposition,
    non_inferable: o.non_inferable === true,
    requirement: typeof o.requirement === 'string' ? o.requirement.slice(0, 200) : undefined,
  };
}

function normalizeList(raw: unknown): ContractItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ContractItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const item = normalizeItem(entry);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Read a caller-supplied contract off the guard context. Returns null when there
 * is no contract at all, which is a different situation from an empty one — the
 * policy decides whether a missing contract is acceptable.
 */
export function parseVerificationContract(raw: unknown): VerificationContract | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const must_haves = normalizeList(o.must_haves);
  const prohibitions = normalizeList(o.prohibitions);
  if (must_haves.length === 0 && prohibitions.length === 0) return null;
  return {
    subject: typeof o.subject === 'string' ? o.subject.slice(0, 200) : undefined,
    must_haves,
    prohibitions,
  };
}

function describe(item: ContractItem): string {
  return item.requirement ? `${item.id} ("${item.requirement}")` : item.id;
}

/**
 * Findings in severity order: violations first, then test-tier items nobody ran,
 * then the items no check could settle. The caller takes the first group that is
 * non-empty, so a contract with a real violation reports the violation rather
 * than an abstention — knowing something is wrong is more actionable than
 * knowing we cannot tell.
 */
export function contractFindings(contract: VerificationContract): ContractFinding[] {
  const findings: ContractFinding[] = [];
  const all = [...contract.must_haves, ...contract.prohibitions];

  for (const item of all) {
    if (item.status === 'violated') {
      findings.push({ kind: 'violation', id: item.id, detail: `${describe(item)} is violated` });
    }
  }

  for (const item of all) {
    if (item.status === 'violated') continue;
    // Fail closed. `unchecked` on a mechanically-checkable obligation means the
    // gate did not actually run, which is not evidence of correctness.
    if (item.tier === 'test' && item.status !== 'verified') {
      findings.push({
        kind: 'unchecked_test',
        id: item.id,
        detail: `${describe(item)} is test-tier but was not checked`,
      });
    }
  }

  for (const item of all) {
    if (item.status === 'violated') continue;
    if (item.tier === 'test' && item.status !== 'verified') continue;
    // The exogenous tag. An edge that was surfaced but never resolved into an
    // explicit criterion is, by construction, something no reader can settle
    // from this artifact.
    if (item.non_inferable === true && item.disposition !== 'specify') {
      findings.push({
        kind: 'insufficient_spec',
        id: item.id,
        detail: `${describe(item)} is non-inferable and was never resolved into the spec`,
      });
      continue;
    }
    if (item.tier === 'judgment' && item.status === 'unchecked') {
      findings.push({
        kind: 'insufficient_spec',
        id: item.id,
        detail: `${describe(item)} is judgment-tier and unconfirmed`,
      });
    }
  }

  return findings;
}

export function firstKind(findings: ContractFinding[]): ContractDispositionKind | null {
  for (const kind of ['violation', 'unchecked_test', 'insufficient_spec'] as const) {
    if (findings.some((f) => f.kind === kind)) return kind;
  }
  return null;
}

/** Compact, bounded summary for the decision reason. */
export function summarize(findings: ContractFinding[], kind: ContractDispositionKind, limit = 3): string {
  const matching = findings.filter((f) => f.kind === kind);
  const shown = matching.slice(0, limit).map((f) => f.detail).join('; ');
  const extra = matching.length > limit ? ` (+${matching.length - limit} more)` : '';
  return `${shown}${extra}`;
}

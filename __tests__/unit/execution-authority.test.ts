import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ candidate: vi.fn(), claim: vi.fn(), evaluate: vi.fn(), invalidate: vi.fn(), cancelFacts: vi.fn() }));
vi.mock('@/lib/repositories/actions.repository.execution', () => ({ getExecutionCandidate: mocks.candidate, claimActionExecution: mocks.claim, getActionCancelFacts: mocks.cancelFacts }));
vi.mock('@/lib/guard/evaluate', () => ({ evaluateGuard: mocks.evaluate }));
vi.mock('@/lib/guard/caches', () => ({ invalidateGuardPolicyCache: mocks.invalidate, invalidateGuardSettingsCache: mocks.invalidate, invalidateGuardRiskTemplateCache: mocks.invalidate }));
import { authorizeActionExecution, authorizeActionExecutionDetailed } from '@/lib/guard/execution';

const input = { orgId: 'org_1', actionId: 'act_1', principalId: 'key_1', attemptId: 'attempt_123456789',
  act: { kind: 'shell', command: 'echo fixture' },
  identity: { agent_id: 'agent_1', verified: false, verification_status: 'unverified' } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.candidate.mockResolvedValue({ action_id: 'act_1', action_type: 'read', declared_goal: 'fixture',
    guard_context: JSON.stringify({ action_type: 'read', declared_goal: 'fixture', verification_status: 'verified' }) });
  mocks.evaluate.mockResolvedValue({ decision: 'allow', decision_id: 'fresh_decision' });
  mocks.claim.mockResolvedValue({ action_id: 'act_1', execution_attempt_id: input.attemptId });
  mocks.cancelFacts.mockResolvedValue({ action_id: 'act_1', claimed: false });
});
it('a fresh block cannot be bypassed by a previously allowed action', async () => {
  mocks.evaluate.mockResolvedValue({ decision: 'block', decision_id: 'fresh_block' });
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('claim uses fresh persisted policy authority and current identity', async () => {
  expect(await authorizeActionExecution({} as never, input)).toBeTruthy();
  expect(mocks.evaluate.mock.calls[0]?.[1]).toMatchObject({ verification_status: 'unverified', action_id: 'act_1', act: input.act });
  expect(mocks.claim).toHaveBeenCalledWith({}, expect.objectContaining({ decisionId: 'fresh_decision', principalId: 'key_1' }));
  expect(mocks.invalidate).toHaveBeenCalledWith('org_1');
});
it('verified-subject continuity and eligible record are required', async () => {
  mocks.candidate.mockResolvedValueOnce({ identity_verified: true });
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  mocks.candidate.mockResolvedValueOnce(null);
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  expect(mocks.evaluate).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('an unfinished policy evaluation cannot grant execution', async () => {
  mocks.evaluate.mockResolvedValue({ decision: 'allow', decision_id: 'degraded', degraded: true });
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('a new containment requirement cannot authorize an old direct execution', async () => {
  mocks.evaluate.mockResolvedValue({ decision: 'allow_contained', decision_id: 'new_containment',
    containment: { status: 'contained', ref: 'dashclaw/contained-fixture' } });
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('an originally contained action claims only its original containment target', async () => {
  mocks.candidate.mockResolvedValue({ action_type: 'read', declared_goal: 'fixture', guard_context: '{}',
    containment_status: 'contained', containment_ref: 'dashclaw/contained-fixture' });
  mocks.evaluate.mockResolvedValue({ decision: 'allow_contained', decision_id: 'same_containment',
    containment: { status: 'contained', ref: 'dashclaw/contained-fixture' } });
  expect(await authorizeActionExecution({} as never, input)).toBeTruthy();
  mocks.evaluate.mockResolvedValue({ decision: 'allow_contained', decision_id: 'changed_containment',
    containment: { status: 'contained', ref: 'dashclaw/contained-other' } });
  expect(await authorizeActionExecution({} as never, input)).toBeNull();
  expect(mocks.claim).toHaveBeenCalledTimes(1);
});

// --- folded claim (POST /api/guard?record=true passes the verdict it just computed) ---
it('a fresh decision from the same request is reused: no second evaluation, no cache flush', async () => {
  const fresh = { decision: 'allow', decision_id: 'gd_same_request', degraded: false, containment: null };
  expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeTruthy();
  expect(mocks.evaluate).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(mocks.claim).toHaveBeenCalledWith({}, expect.objectContaining({ decisionId: 'gd_same_request', attemptId: input.attemptId }));
});
it('a fresh decision still needs an eligible, identity-continuous record', async () => {
  const fresh = { decision: 'allow', decision_id: 'gd_same_request' };
  mocks.candidate.mockResolvedValueOnce(null);
  expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeNull();
  mocks.candidate.mockResolvedValueOnce({ identity_verified: true });
  expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeNull();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('a fresh decision that is not permissive, is degraded, or lacks an id cannot claim', async () => {
  for (const fresh of [
    { decision: 'block', decision_id: 'gd_1' },
    { decision: 'require_approval', decision_id: 'gd_2' },
    { decision: 'allow', decision_id: 'gd_3', degraded: true },
    { decision: 'allow' },
  ]) {
    expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeNull();
  }
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.evaluate).not.toHaveBeenCalled();
});
it('a fresh allow_contained verdict is held to the same containment binding as a re-evaluation', async () => {
  const fresh = { decision: 'allow_contained', decision_id: 'gd_c', containment: { ref: 'dashclaw/contained-fixture' } };
  // recorded row is not contained -> no claim
  expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeNull();
  mocks.candidate.mockResolvedValueOnce({ action_id: 'act_1', containment_status: 'contained', containment_ref: 'dashclaw/contained-fixture' });
  expect(await authorizeActionExecution({} as never, { ...input, freshDecision: fresh })).toBeTruthy();
});

// --- why a claim was refused (2026-09-15) ------------------------------------
//
// Only a lost race for the one execution slot is a conflict; everything else
// is the runtime unable to stamp a verdict it already rendered. The caller
// blocks the tool call on the first and proceeds on the second, so mislabelling
// one as the other either takes work away for nothing or lets a second
// executor through.

it('an already-claimed row is a conflict even though the candidate query skips it', async () => {
  // getExecutionCandidate filters on execution_claimed_at IS NULL, so a second
  // claim never reaches claimActionExecution and arrives here as "no candidate".
  mocks.candidate.mockResolvedValue(null);
  mocks.cancelFacts.mockResolvedValue({ action_id: 'act_1', claimed: true });
  const out = await authorizeActionExecutionDetailed({} as never, input);
  expect(out).toEqual({ claim: null, reason: 'claim_conflict' });
  expect(mocks.claim).not.toHaveBeenCalled();
});

it('a row this caller never had is not a conflict', async () => {
  mocks.candidate.mockResolvedValue(null);
  mocks.cancelFacts.mockResolvedValue(null);
  expect(await authorizeActionExecutionDetailed({} as never, input))
    .toEqual({ claim: null, reason: 'no_candidate' });
});

it('names each non-conflict refusal so a caller can tell them apart', async () => {
  mocks.candidate.mockResolvedValueOnce({ identity_verified: true });
  expect((await authorizeActionExecutionDetailed({} as never, input)).reason).toBe('identity_unverified');

  mocks.evaluate.mockResolvedValueOnce({ decision: 'allow', decision_id: 'd', degraded: true });
  expect((await authorizeActionExecutionDetailed({} as never, input)).reason).toBe('degraded_decision');

  mocks.evaluate.mockResolvedValueOnce({ decision: 'block', decision_id: 'd' });
  expect((await authorizeActionExecutionDetailed({} as never, input)).reason).toBe('decision_not_permissive');

  mocks.evaluate.mockResolvedValueOnce({ decision: 'allow' });
  expect((await authorizeActionExecutionDetailed({} as never, input)).reason).toBe('no_decision_id');
});

it('a lost race on the claim UPDATE itself is the conflict', async () => {
  mocks.claim.mockResolvedValueOnce(null);
  expect((await authorizeActionExecutionDetailed({} as never, input)).reason).toBe('claim_conflict');
});

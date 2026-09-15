import { computeActContentHash } from '../act-content-hash';
import { claimActionExecution, getExecutionCandidate } from '../repositories/actions.repository.execution';
import type { SqlTag } from '../types/db';
import { evaluateGuard } from './evaluate';
import { invalidateGuardPolicyCache, invalidateGuardSettingsCache, invalidateGuardRiskTemplateCache } from './caches';
import type { GuardEvalContext } from './types';

/** Current-policy authority for a recorded attempt. The database claim is the
 * only execution permission; the preceding reads never consume approval. */
/** A verdict the calling request computed for this same act moments ago
 * (the folded claim in POST /api/guard?record=true). Reused instead of a
 * second evaluation: there is no window for a policy change between an
 * evaluation and a claim made inside the same request. The database claim
 * stays the only execution permission either way. */
export type FreshDecision = { decision: string; decision_id?: string; degraded?: boolean; containment?: { ref?: string } | null };

/** Why a claim did not happen. Exactly one of these — `claim_conflict` — means
 * another attempt already holds this action's one execution slot; that is the
 * only outcome where letting the tool call proceed could double-execute.
 * Every other reason is the governance runtime failing to stamp a verdict it
 * already rendered, which is a ledger fault, not a policy hold. The folded
 * claim reports the distinction so a caller can tell the two apart instead of
 * treating every refusal as a conflict (2026-09-15: five blocked tool calls
 * across a day, all reported as EXECUTION_CLAIM_CONFLICT, none of them one). */
export type ClaimRefusalReason =
  | 'missing_principal'
  | 'no_candidate'
  | 'identity_unverified'
  | 'no_decision'
  | 'degraded_decision'
  | 'decision_not_permissive'
  | 'containment_mismatch'
  | 'no_decision_id'
  | 'claim_conflict';

export type ClaimOutcome =
  | { claim: Awaited<ReturnType<typeof claimActionExecution>>; reason: null }
  | { claim: null; reason: ClaimRefusalReason };

export async function authorizeActionExecutionDetailed(sql: SqlTag, input: {
  orgId: string; actionId: string; principalId: string; attemptId: string; act: unknown;
  identity: { agent_id: string | null; verified: boolean; verification_status: string };
  freshDecision?: FreshDecision;
}): Promise<ClaimOutcome> {
  if (!input.principalId || !input.identity.agent_id) return { claim: null, reason: 'missing_principal' };
  const binding = { orgId: input.orgId, actionId: input.actionId, principalId: input.principalId,
    agentId: input.identity.agent_id, actHash: computeActContentHash(input.act) };
  const candidate = await getExecutionCandidate(sql, binding);
  if (!candidate) return { claim: null, reason: 'no_candidate' };
  if (candidate.identity_verified === true && !input.identity.verified) {
    return { claim: null, reason: 'identity_unverified' };
  }
  const decision = input.freshDecision ?? await reevaluateForClaim(sql, input, candidate);
  if (!decision) return { claim: null, reason: 'no_decision' };
  if (decision.degraded) return { claim: null, reason: 'degraded_decision' };
  if (!['allow', 'warn', 'allow_contained'].includes(decision.decision)) {
    return { claim: null, reason: 'decision_not_permissive' };
  }
  if (decision.decision === 'allow_contained' && (candidate.containment_status !== 'contained'
    || !decision.containment?.ref || candidate.containment_ref !== decision.containment.ref)) {
    return { claim: null, reason: 'containment_mismatch' };
  }
  // A claim is bound to the decision that authorized it; no id, no claim.
  if (typeof decision.decision_id !== 'string' || !decision.decision_id) {
    return { claim: null, reason: 'no_decision_id' };
  }
  const claim = await claimActionExecution(sql, { ...binding, attemptId: input.attemptId,
    decisionId: decision.decision_id, identityVerified: input.identity.verified });
  // The claim UPDATE gates on execution_claimed_at IS NULL, so a null here is
  // the one genuine lost race.
  return claim ? { claim, reason: null } : { claim: null, reason: 'claim_conflict' };
}

export async function authorizeActionExecution(sql: SqlTag, input: {
  orgId: string; actionId: string; principalId: string; attemptId: string; act: unknown;
  identity: { agent_id: string | null; verified: boolean; verification_status: string };
  freshDecision?: FreshDecision;
}) {
  return (await authorizeActionExecutionDetailed(sql, input)).claim;
}

/** The PATCH path: a claim may arrive long after the guard verdict, so it is
 * a new policy checkpoint against the current policies, never a cached
 * pre-approval receipt. Returns null when the recorded context is unusable. */
async function reevaluateForClaim(
  sql: SqlTag,
  input: { orgId: string; actionId: string; principalId: string; act: unknown; identity: { agent_id: string | null; verification_status: string } },
  candidate: Record<string, unknown>,
) {
  let context: Record<string, unknown>;
  try {
    const parsed = typeof candidate.guard_context === 'string' ? JSON.parse(candidate.guard_context) : candidate.guard_context;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    context = { ...parsed };
  } catch { return null; }
  Object.assign(context, { action_id: input.actionId, agent_id: input.identity.agent_id,
    _execution_principal_id: input.principalId,
    action_type: candidate.action_type, declared_goal: candidate.declared_goal,
    act: input.act, verification_status: input.identity.verification_status,
    client_capabilities: Array.from(new Set([...(Array.isArray(context.client_capabilities) ? context.client_capabilities : []), 'execution_claims'])) });
  // Avoid replay-counting this internal evaluation as another client request.
  delete context.idempotency_key;
  invalidateGuardPolicyCache(input.orgId);
  invalidateGuardSettingsCache(input.orgId);
  invalidateGuardRiskTemplateCache(input.orgId);
  return evaluateGuard(input.orgId, context as GuardEvalContext, sql);
}

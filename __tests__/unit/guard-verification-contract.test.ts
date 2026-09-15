import { describe, it, expect, vi } from 'vitest';
import { createSqlMock } from '../helpers.js';

// Halt/predictive settings ride a repository read at the top of evaluateGuard;
// without this mock the REAL getSettings would consume the first taggedResponse
// meant for the policy loader (mock calls are ordered). Same pattern as
// guard-shape-exceptions.test.ts.
vi.mock('@/lib/repositories/settings.repository.js', () => ({ getSettings: vi.fn(async () => []) }));

import { evaluateGuard } from '@/lib/guard.js';

let orgCounter = 0;
const freshOrg = () => `org_vc_${++orgCounter}`;

function makePolicy(rules: unknown) {
  return {
    id: 'gp_verification_contract',
    name: 'Contract gate',
    policy_type: 'verification_contract',
    rules: JSON.stringify(rules),
  };
}

const makeSql = (policies: unknown[]) => createSqlMock({ taggedResponses: [policies] });

const run = (rules: unknown, contract: unknown, extra: Record<string, unknown> = {}) =>
  evaluateGuard(
    freshOrg(),
    { action_type: 'deploy', agent_id: 'a1', verification_contract: contract, ...extra },
    makeSql([makePolicy(rules)]),
  );

/** A single must_have, verified and fully specified — the clean case. */
const verifiedItem = {
  id: 'MH-01',
  tier: 'test',
  status: 'verified',
  disposition: 'specify',
  non_inferable: false,
};

describe('verification_contract — a discharged contract is the only pass', () => {
  it('allows when every item is verified', async () => {
    const result = await run({ action_types: ['deploy'] }, { must_haves: [verifiedItem] });
    expect(result.decision).toBe('allow');
    expect(result.matched_policies).toEqual([]);
  });

  it('allows a non-inferable edge that WAS resolved into the spec', async () => {
    // This is the whole point of the spec-time probe: the same edge that
    // produces a confident false pass while omitted becomes an ordinary
    // checkable criterion once it is written down.
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ ...verifiedItem, id: 'MH-02', non_inferable: true, disposition: 'specify' }],
    });
    expect(result.decision).toBe('allow');
  });

  it('ignores an action outside the policy scope', async () => {
    const result = await run(
      { action_types: ['email_send'] },
      { must_haves: [{ ...verifiedItem, status: 'violated' }] },
    );
    expect(result.decision).toBe('allow');
  });

  it('stays silent below the risk floor', async () => {
    const result = await run(
      { action_types: ['deploy'], min_risk: 80 },
      { must_haves: [{ ...verifiedItem, status: 'violated' }] },
      { risk_score: 10 },
    );
    expect(result.decision).toBe('allow');
  });
});

describe('verification_contract — fail closed', () => {
  it('blocks a violated item', async () => {
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ ...verifiedItem, status: 'violated', requirement: 'no PII in logs' }],
    });
    expect(result.decision).toBe('block');
    expect(result.reason).toMatch(/contract violated/);
    expect(result.reason).toMatch(/no PII in logs/);
  });

  it('blocks a test-tier item that was never checked', async () => {
    // A check that did not run tells us exactly as much about the code as a
    // check that ran and failed. Skipping it is how a pipeline invents a green.
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ ...verifiedItem, status: 'unchecked' }],
    });
    expect(result.decision).toBe('block');
    expect(result.reason).toMatch(/did not run/);
    expect(result.reason).toMatch(/fails closed/);
  });

  it('blocks a violated prohibition as readily as a violated must_have', async () => {
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [verifiedItem],
      prohibitions: [{ id: 'PR-01', tier: 'test', status: 'violated', requirement: 'never auto-reply' }],
    });
    expect(result.decision).toBe('block');
    expect(result.reason).toMatch(/PR-01/);
  });

  it('treats an unrecognized tier as judgment rather than waving it through', async () => {
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ id: 'MH-09', tier: 'vibes', status: 'unchecked', disposition: 'specify' }],
    });
    expect(result.decision).toBe('require_approval');
  });

  it('treats an unrecognized status as unchecked', async () => {
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ ...verifiedItem, status: 'probably-fine' }],
    });
    expect(result.decision).toBe('block');
  });
});

describe('verification_contract — insufficient_spec routes to a human', () => {
  it('holds an unresolved non-inferable edge for approval, not a block', async () => {
    // Nothing is known to be WRONG here. The spec simply does not contain the
    // answer, so no reader can supply one and a person has to decide.
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{
        id: 'MH-02',
        tier: 'test',
        status: 'verified',
        disposition: 'backstop',
        non_inferable: true,
        requirement: 'do touching intervals merge',
      }],
    });
    expect(result.decision).toBe('require_approval');
    expect(result.reason).toMatch(/insufficient_spec:/);
    expect(result.reason).toMatch(/touching intervals/);
    expect(result.matched_policies).toEqual(['gp_verification_contract']);
  });

  it('holds an unconfirmed judgment-tier item', async () => {
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [{ id: 'MH-03', tier: 'judgment', status: 'unchecked', disposition: 'specify' }],
    });
    expect(result.decision).toBe('require_approval');
    expect(result.reason).toMatch(/insufficient_spec:/);
  });

  it('reports a violation ahead of an abstention when both are present', async () => {
    // Knowing something is wrong is more actionable than knowing we cannot tell.
    const result = await run({ action_types: ['deploy'] }, {
      must_haves: [
        { id: 'MH-04', tier: 'test', status: 'violated', disposition: 'specify', non_inferable: false },
        { id: 'MH-05', tier: 'judgment', status: 'unchecked', disposition: 'specify', non_inferable: true },
      ],
    });
    expect(result.decision).toBe('block');
    expect(result.reason).toMatch(/contract violated/);
    expect(result.reason).not.toMatch(/insufficient_spec/);
  });

  it('can be tightened to a block when an org wants one', async () => {
    const result = await run({ action_types: ['deploy'], on_insufficient_spec: 'block' }, {
      must_haves: [{ id: 'MH-06', tier: 'judgment', status: 'unchecked', disposition: 'defer', non_inferable: true }],
    });
    expect(result.decision).toBe('block');
  });
});

describe('verification_contract — a missing contract', () => {
  it('is allowed by default, so an org can adopt contracts before demanding them', async () => {
    const result = await run({ action_types: ['deploy'] }, undefined);
    expect(result.decision).toBe('allow');
  });

  it('escalates when the policy requires one', async () => {
    const result = await run({ action_types: ['deploy'], require_contract: true }, undefined);
    expect(result.decision).toBe('require_approval');
    expect(result.reason).toMatch(/no verification contract attached/);
  });

  it('treats an empty contract as no contract', async () => {
    const result = await run(
      { action_types: ['deploy'], require_contract: true },
      { must_haves: [], prohibitions: [] },
    );
    expect(result.decision).toBe('require_approval');
    expect(result.reason).toMatch(/no verification contract attached/);
  });

  it('drops malformed items rather than trusting them', async () => {
    const result = await run({ action_types: ['deploy'], require_contract: true }, {
      must_haves: [null, 'nope', { tier: 'test' }],
    });
    expect(result.decision).toBe('require_approval');
    expect(result.reason).toMatch(/no verification contract attached/);
  });
});

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  compilePolicyPayload,
  decompilePolicyForm,
  buildPolicySummary,
  createDefaultPolicyFormState,
  POLICY_TYPE_OPTIONS,
} from '@/policies/lib/policyFormModel';
import { validatePolicy } from '@/lib/validate.js';

const { default: PolicyRuleBuilderSection } = await import(
  '@/policies/components/PolicyRuleBuilderSection'
);

const baseForm = {
  ...createDefaultPolicyFormState(),
  type: 'verification_contract',
  name: 'Contract gate',
  actionTypes: [],
};

function renderSection(form: Record<string, unknown> = baseForm, onChange = () => {}) {
  return render(
    <PolicyRuleBuilderSection form={form} actionOptions={['deploy', 'message']} onChange={onChange} />,
  );
}

describe('PolicyRuleBuilderSection — verification_contract', () => {
  it('renders one control per disposition', () => {
    renderSection();
    expect(screen.getByLabelText('Verification contract on violation')).toBeTruthy();
    expect(screen.getByLabelText('Verification contract on unchecked test tier')).toBeTruthy();
    expect(screen.getByLabelText('Verification contract on insufficient spec')).toBeTruthy();
    expect(screen.getByText('Require a contract')).toBeTruthy();
  });

  it('defaults to the strict dispositions', () => {
    renderSection();
    expect((screen.getByLabelText('Verification contract on violation') as HTMLSelectElement).value)
      .toBe('block');
    expect((screen.getByLabelText('Verification contract on unchecked test tier') as HTMLSelectElement).value)
      .toBe('block');
    // Not a block: nothing is known to be wrong, so it goes to a person.
    expect((screen.getByLabelText('Verification contract on insufficient spec') as HTMLSelectElement).value)
      .toBe('require_approval');
  });

  it('leaves "require a contract" off so an org can adopt contracts first', () => {
    const { container } = renderSection();
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box!.checked).toBe(false);
    expect(screen.queryByLabelText('Verification contract missing contract action')).toBeNull();
  });

  it('reveals the missing-contract consequence once the box is ticked', () => {
    renderSection({ ...baseForm, requireContract: true });
    expect(screen.getByLabelText('Verification contract missing contract action')).toBeTruthy();
  });

  it('writes a changed disposition back to the form', () => {
    const onChange = vi.fn();
    renderSection(baseForm, onChange);
    fireEvent.change(screen.getByLabelText('Verification contract on insufficient spec'), {
      target: { value: 'block' },
    });
    expect(onChange).toHaveBeenCalledWith('onInsufficientSpec', 'block');
  });

  it('renders nothing contract-specific for other policy types', () => {
    renderSection({ ...baseForm, type: 'rate_limit' });
    expect(screen.queryByLabelText('Verification contract on violation')).toBeNull();
  });
});

describe('verification_contract — form model', () => {
  it('is offered in the policy type picker', () => {
    const entry = POLICY_TYPE_OPTIONS.find((o: { value: string }) => o.value === 'verification_contract');
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe('Verification Contract');
  });

  it('compiles to rules the server accepts', () => {
    // compilePolicyPayload already carries name/policy_type/rules — the whole
    // point is that what the form builds is what the server takes.
    const payload = compilePolicyPayload({ ...baseForm, actionTypes: ['deploy'] });
    const { valid, errors } = validatePolicy(payload);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('round-trips compile → decompile exactly', () => {
    const form = {
      ...baseForm,
      actionTypes: ['deploy'],
      floorMinRisk: 40,
      requireContract: true,
      onViolation: 'require_approval',
      onUncheckedTestTier: 'require_approval',
      onInsufficientSpec: 'block',
      escalateAction: 'block',
    };
    const payload = compilePolicyPayload(form);
    const back = decompilePolicyForm({
      name: 'Contract gate',
      policy_type: 'verification_contract',
      rules: payload.rules,
    });
    expect(back.actionTypes).toEqual(['deploy']);
    expect(back.floorMinRisk).toBe(40);
    expect(back.requireContract).toBe(true);
    expect(back.onViolation).toBe('require_approval');
    expect(back.onUncheckedTestTier).toBe('require_approval');
    expect(back.onInsufficientSpec).toBe('block');
    expect(back.escalateAction).toBe('block');
  });

  it('summarizes what a human is actually turning on', () => {
    const summary = buildPolicySummary({ ...baseForm, actionTypes: ['deploy'] });
    expect(summary).toMatch(/deploy/);
    expect(summary).toMatch(/block a violated contract item/);
    expect(summary).toMatch(/never ran/);
    expect(summary).toMatch(/hold for a human/);
  });

  it('mentions the missing-contract escalation only when it is on', () => {
    expect(buildPolicySummary(baseForm)).not.toMatch(/no contract at all/);
    expect(buildPolicySummary({ ...baseForm, requireContract: true }))
      .toMatch(/no contract at all is held for approval/);
  });

  it('refuses a disposition that would turn an undischarged obligation into a pass', () => {
    // A contract may add a gate; it may never remove one.
    const { valid, errors } = validatePolicy({
      name: 'Contract gate',
      policy_type: 'verification_contract',
      rules: JSON.stringify({ on_insufficient_spec: 'allow' }),
    });
    expect(valid).toBe(false);
    expect(errors.join('\n')).toMatch(/on_insufficient_spec must be require_approval or block/);
  });
});

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Ledger's actions must be registered in the same commit as the DOM that
 * calls them.
 *
 * PolicyWorkbench's top row, the Short List and the inert-rule banner call
 * into Ledger through `ledgerActions.current?.…`, a ref Ledger fills through
 * `registerActions`. Registered in a passive effect, the ref stayed null after
 * the buttons were already in the DOM whenever React yielded between commit
 * and effects (a loaded CI box), so a click in that gap was a silent no-op.
 * That is the CI-only failure of policies-inert-banner-reveal.test.jsx: the
 * lens never left Table. A parent's layout effect runs after every child's
 * layout effect and before any passive effect, so it sees the ref only when
 * registration happens inside the commit.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

const { default: Ledger } = await import('@/policies/components/Ledger.tsx');

function Probe({ onCommit }) {
  const actions = React.useRef(null);
  React.useLayoutEffect(() => {
    onCommit(actions.current);
  }, [onCommit]);
  return (
    <Ledger
      summary={null}
      contract={null}
      highlightPolicy={null}
      prefill={null}
      refreshSignal={0}
      onChanged={() => {}}
      registerActions={(a) => { actions.current = a; }}
    />
  );
}

describe('Ledger action registration timing', () => {
  beforeEach(() => {
    // Never resolves: registration must not wait on the rule list either.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers its actions before the commit ends, not after paint', () => {
    let seen = null;
    render(<Probe onCommit={(a) => { seen = a; }} />);
    expect(seen).not.toBeNull();
    expect(typeof seen.revealSuppressed).toBe('function');
    expect(typeof seen.openNewRule).toBe('function');
  });
});

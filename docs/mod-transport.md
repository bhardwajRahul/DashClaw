# A Function-Hooks (Mod) transport for DashClaw governance

Status 2026-09-16: INTERFACE PREPARED. Nothing in DashClaw's enforcement path changed; the Python hook
(`hooks/dashclaw_pretool.py`, 3660 s approval seam) remains authoritative. This document fixes the
contract a Claude Code Function-Hooks adapter would speak so the policy core never learns about
Claude Code.

## Separation

```
DashClaw policy core (server: evaluateGuard, evaluators, ledger, approvals inbox, receipts)
        ▲ HTTP, guard_decisions vocabulary, client_capabilities
        │
  transport adapters:  Python PreToolUse hook (today, authoritative)  |  Function-Hooks Mod (prototype: agnostic-ai labs/claude-mods/prototypes/prodguard)
```

The pure subset already exists inside the app (`app/lib/guard/evidence.ts` 858 lines zero imports,
`risk.ts`, `riskTemplates.ts`, `containment.ts`, 15 of 20 evaluators). A dependency-free re-export
boundary for those files is the next step (not done in this sprint); until then the prototype carries a
cited port (`claude-mods-rnd/prototypes/prodguard/hooks/policy-core.ts`, 21 pure tests) and a replay
tool (`.../evidence/shadow-compare.mjs`) that runs REAL session commands from the runtime adapter's event
log through that core with no execution and no enforcement.

## `client_capabilities` tokens

`validateGuardInput` already accepts `context.client_capabilities` as an array of ≤ 8 short strings
(`app/lib/validate.js validateClientCapabilities`); `allow_contained` is the existing token. A Mod
transport advertises, in addition:

| token | meaning |
|---|---|
| `mod` | the caller is a Function-Hooks module: it can act BEFORE the tool runs |
| `tool_interception` | can deny or rewrite a tool call (`tool.call {deny}` / `next({...e, command})`) |
| `tool_result_mutation` | can replace the result the model receives (redaction, containment output) |
| `dynamic_permissions` | can answer the engine's permission verdict (`tool.check`) |
| `ui_ask` | can hold a call open on an in-terminal dialog (`$.ui.ask`, observed 28–33 s waits) |

No validation change is required for these tokens; evaluators may branch on them.

## Verdict → Mod mapping ("park approval, wake session")

| DashClaw decision | Mod action | Audit |
|---|---|---|
| `block` | `tool.call` returns `{deny: reason}`; the command never starts | `guard_decisions` row, `outcome: blocked` |
| `require_approval` | `tool.check` → `ask`, or `$.ui.ask("Allow once / Deny / Contain")`; the call is parked in-process (no 3660 s subprocess) and the session wakes on the answer; headless (`-p`) → fail closed | `outcome: allowed_once | denied | contained | denied_fail_closed`, `approved_by: person` |
| `allow_contained` | `next({...e, command: containedCommand(cmd)})` + a hidden `context[]` line telling the model the command was contained, not blocked | `decision: allow_contained`, `contained_command` |
| `allow` / `warn` | `next(e)`; warn adds `context[]` | `outcome: allowed` |

Every free-text field passes `sanitizeDashclawText` before it is logged; no secret reaches the audit.

## What stays server-side

Cross-session ledger, approvals inbox, rate limits across sessions, Ed25519 receipts (`node:crypto` is
unavailable inside a hooks module), tenant policy. The Mod is an enforcement adapter, not the policy.

## Evidence so far (from claude-mods-rnd)

Five production-shaped commands denied before execution headless (1.7–8 ms per decision vs the 1,099 ms
classic median); a `git status` under a demo "review every git action" rule held 33.4 s on the dialog and
was contained to an `echo`; the pure core flips its verdict with the environment (dev allow / prod deny)
in 21/21 tests. Missing before promotion: a comparison of the Python hook's decisions against the core
over the same real commands (`shadow-compare.mjs` produces the Mod side; the Python side is the
`dashclaw_posttool.py` ledger).

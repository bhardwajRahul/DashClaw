/**
 * Server-level agent identity for an OAuth connector client.
 *
 * Every OAuth Bearer caller of /api/mcp gets a pinned identity (identity is a
 * governance primitive: without it the LLM picks its own agent_id per call).
 * The identity is derived from the DCR-registered client_name so each agent
 * host shows up in the ledger under its own name: Meta Muse registers as
 * "Muse" / "Meta Muse", every other connector keeps the historical
 * `claude-desktop` default.
 */
export const DEFAULT_CONNECTOR_AGENT_ID = 'claude-desktop';

export function connectorAgentId(clientName: unknown): string {
  if (typeof clientName === 'string' && /\bmuse\b/i.test(clientName)) return 'muse';
  return DEFAULT_CONNECTOR_AGENT_ID;
}

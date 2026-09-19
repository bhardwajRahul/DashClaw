# DashClaw on Meta Muse: connector submission packet

> **Status:** packet ready, not yet submitted. The submit is a human click (Muse account, US, 18+).

Muse's model is "you bring the API, Muse brings the agent, the browser, and the context." For DashClaw that means a person can tell Muse *"check that with DashClaw before you do it"* and Muse governs its own action through the hosted MCP server, then waits for the owner's approval in the Approvals inbox.

| File | What it is |
|---|---|
| [`submission.json`](submission.json) | Paste-ready value for every field on the Muse submission form. Keys match the form's submit payload. |
| [`icon-512.png`](icon-512.png) | Connector icon, 512×512 PNG, 12 KB (Muse requires 512×512 PNG/SVG, 256 KiB or less). Same asset as `public/favicons/android-chrome-512x512.png`. |

## How Muse connectors work (researched 2026-09-19)

- **No manifest, no repo PR.** Submission is a hosted web form at [muse.ai/platform](https://muse.ai/platform) that only opens for a signed-in Muse account.
- **Connection type:** `Raw API` (API URL + optional OpenAPI URL) or `Existing MCP` (hosted HTTPS MCP endpoint). DashClaw uses **Existing MCP**.
- **Transport:** Muse builds a bridge on its cloud VM with the official MCP SDK over Streamable HTTP. Local servers are unreachable; the endpoint must be public.
- **Auth (multi-select):** `API keys`, `OAuth with PKCE`, `Other`. Keys go into Muse's Secure Credentials Store through a prompt outside the chat; every outbound request passes Muse's on-VM approval agent (Sentinel).
- **Review:** functional, security and legal checks plus end-to-end testing. Approved connectors appear in the Muse directory; editors pick featured placement by usage. No SLA published.
- **Terms:** submitting accepts the Muse Connector Terms (`muse.ai/platform/terms`, renders for signed-in users only).

### Form fields

**Step 1: Overview.** Connector name (≤80), Company or developer (≤120), Product website, Example prompts (one per line), Connector icon, Payments (accepts / does not), Your name, Work email, Support email or URL, Privacy policy URL, Terms of service URL, Anything else.

**Step 2: Technical specs.** Connection type, Hosted MCP endpoint (HTTPS), API or MCP documentation URL, Access requirements, Authentication methods.

**Step 3: Review.** Three attestations only the account owner ticks: authorized to submit the brand, submission does not guarantee approval, agrees to the Muse Connector Terms.

## DashClaw endpoint check (live, 2026-09-19)

| Check | Result |
|---|---|
| `POST https://hosted.dashclaw.io/api/mcp` without auth | `401`, `WWW-Authenticate: Bearer resource_metadata="https://hosted.dashclaw.io/.well-known/oauth-protected-resource"` |
| `/.well-known/oauth-protected-resource` | resource `https://hosted.dashclaw.io/api/mcp`, AS `https://hosted.dashclaw.io` |
| `/.well-known/oauth-authorization-server` | authorize `/api/oauth/authorize`, token `/api/oauth/token`, DCR `/api/oauth/register`, PKCE `S256`, scopes `governance:read governance:write` |
| Privacy, terms, support, docs URLs | `/privacy` and `/docs` live; `/terms` ships with this change |

## What changed in the product for Muse

- OAuth connector identity is derived from the DCR `client_name`: a Muse client records under agent id `muse`, everything else keeps `claude-desktop` (`app/lib/oauth/connectorIdentity.ts`). The middleware forwards it to `/api/mcp` as `x-oauth-agent-id`.
- `/terms` page (Muse requires a terms URL), linked from the public footer.
- Docs: "Custom connector: Meta Muse" block at `/docs#muse-connector`.

## Submitting (account owner only)

1. Sign in to Muse (US, 18+) as the DashClaw owner.
2. Open <https://muse.ai/platform> and click **Submit a connector**.
3. **Overview:** paste the values from `submission.json`, one example prompt per line, upload `icon-512.png`, fill in your name and work email.
4. **Technical specs:** choose **Existing MCP**, paste the endpoint, docs URL and access requirements, tick **OAuth with PKCE** and **API keys**.
5. **Review:** read the Muse Connector Terms, tick the three attestations, **Submit for review**.
6. Same account, before or right after: ask Muse *"Build a custom integration to DashClaw. Its MCP server URL is https://hosted.dashclaw.io/api/mcp"*, finish the OAuth consent, and confirm `dashclaw_status` returns data, so Muse's end-to-end review passes first try. The decision then shows in `/decisions` under agent `muse`.

### Open decisions

1. **Static OAuth client.** DashClaw supports DCR. If Muse's reviewers want a fixed `client_id` and redirect URI instead, register one against Muse's callback host and note it here.
2. **Review workspace.** Muse runs end-to-end tests. Either keep a demo workspace with sample decisions, or answer Muse's request when it comes. The notes offer one "on request".

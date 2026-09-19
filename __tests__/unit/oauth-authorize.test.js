// __tests__/unit/oauth-authorize.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '../helpers.js';

const mockGetToken = vi.fn();
const mockGetClient = vi.fn();
const mockInsertCode = vi.fn();
vi.mock('next-auth/jwt', () => ({ getToken: mockGetToken }));
vi.mock('../../app/lib/repositories/oauth.repository.js', () => ({
  getClient: mockGetClient,
  insertAuthCode: mockInsertCode,
}));
vi.mock('../../app/lib/db.js', () => ({ getSql: () => vi.fn() }));

const { GET, POST } = await import('../../app/api/oauth/authorize/route.js');

const VALID_QS =
  'response_type=code&client_id=ocl_1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback' +
  '&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=xyz&scope=governance:write';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClient.mockResolvedValue({ clientId: 'ocl_1', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
});

describe('GET /api/oauth/authorize', () => {
  it('redirects to /login when no session', async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await GET(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x' } }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('renders a consent page when authenticated', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1', userId: 'usr_1' });
    const res = await GET(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Authorize');
    // CSP form-action must allow the validated callback origin or the post-consent
    // redirect to claude.ai is blocked by the browser (Authorize button does nothing).
    expect(res.headers.get('content-security-policy')).toContain("form-action 'self' https://claude.ai");
  });

  it('rejects an unregistered client', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1' });
    mockGetClient.mockResolvedValue(null);
    const res = await GET(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('rejects a redirect_uri not registered to the client', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1' });
    const qs = VALID_QS.replace('https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback', 'https%3A%2F%2Fevil.example%2Fcb');
    const res = await GET(makeRequest(`https://x/api/oauth/authorize?${qs}`, { headers: { host: 'x' } }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/oauth/authorize', () => {
  it('issues a code and redirects to the client redirect_uri with state', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1', userId: 'usr_1' });
    // Same-origin headers satisfy the CSRF check on the consent POST.
    const res = await POST(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x', origin: 'https://x' } }));
    expect(res.status).toBe(303);
    const loc = res.headers.get('location');
    expect(loc).toContain('https://claude.ai/api/mcp/auth_callback?code=');
    expect(loc).toContain('state=xyz');
    expect(mockInsertCode).toHaveBeenCalledOnce();
  });

  it('binds the claude-desktop identity to the code for an unnamed client', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1', userId: 'usr_1' });
    await POST(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x', origin: 'https://x' } }));
    expect(mockInsertCode.mock.calls[0][1]).toMatchObject({ agentId: 'claude-desktop' });
  });

  it('binds the muse identity to the code when the DCR client is Meta Muse', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1', userId: 'usr_1' });
    mockGetClient.mockResolvedValue({ clientId: 'ocl_1', clientName: 'Meta Muse', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
    await POST(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x', origin: 'https://x' } }));
    expect(mockInsertCode.mock.calls[0][1]).toMatchObject({ agentId: 'muse' });
  });

  it('rejects a cross-origin consent POST with 403 (CSRF defense)', async () => {
    mockGetToken.mockResolvedValue({ orgId: 'org_1', userId: 'usr_1' });
    const res = await POST(makeRequest(`https://x/api/oauth/authorize?${VALID_QS}`, { headers: { host: 'x', origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect(mockInsertCode).not.toHaveBeenCalled();
  });
});

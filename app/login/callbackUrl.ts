/**
 * Where /login sends the browser after a successful sign-in.
 *
 * The middleware sends an unauthenticated visitor to
 * `/login?callbackUrl=<the page they asked for>`; the OAuth consent page
 * (`/api/oauth/authorize?...`) relies on this to get the user back to the
 * consent screen after Google. Only a same-origin path is honored, so the
 * parameter can never become an open redirect: anything else falls back to
 * /approvals, the historical default. Resolved through the URL constructor
 * because browsers normalize `\` to `/` (a bare leading-slash check passes
 * `/\evil.com`, which navigates cross-origin) — same rule as the `next`
 * param on the one-time-token path.
 */
export const DEFAULT_POST_LOGIN_PATH = '/approvals';

export function postLoginPath(search: string, origin: string): string {
  const raw = new URLSearchParams(search).get('callbackUrl');
  if (!raw || !raw.startsWith('/')) return DEFAULT_POST_LOGIN_PATH;
  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return DEFAULT_POST_LOGIN_PATH;
    if (resolved.pathname === '/login') return DEFAULT_POST_LOGIN_PATH;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
}

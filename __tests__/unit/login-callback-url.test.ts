import { describe, it, expect } from 'vitest';
import { postLoginPath, DEFAULT_POST_LOGIN_PATH } from '../../app/login/callbackUrl';

const ORIGIN = 'https://hosted.dashclaw.io';

describe('postLoginPath', () => {
  it('defaults to /approvals when no callbackUrl is given', () => {
    expect(postLoginPath('', ORIGIN)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(postLoginPath('?ott=abc', ORIGIN)).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it('honors a same-origin path, including the OAuth consent page with its query string', () => {
    const consent = '/api/oauth/authorize?response_type=code&client_id=ocl_1&redirect_uri=https%3A%2F%2Fmuse.ai%2Fcb&state=x';
    expect(postLoginPath(`?callbackUrl=${encodeURIComponent(consent)}`, ORIGIN)).toBe(consent);
    expect(postLoginPath('?callbackUrl=%2Fdecisions', ORIGIN)).toBe('/decisions');
  });

  it('refuses anything that could leave the origin (open-redirect defense)', () => {
    for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil.example', '/\\\\evil.example', 'javascript:alert(1)', 'approvals']) {
      expect(postLoginPath(`?callbackUrl=${encodeURIComponent(bad)}`, ORIGIN)).toBe(DEFAULT_POST_LOGIN_PATH);
    }
  });

  it('never loops back to /login', () => {
    expect(postLoginPath('?callbackUrl=%2Flogin%3FcallbackUrl%3D%252Fx', ORIGIN)).toBe(DEFAULT_POST_LOGIN_PATH);
  });
});

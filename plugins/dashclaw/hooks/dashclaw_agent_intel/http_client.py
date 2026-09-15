"""HTTP retry helper shared by every DashClaw hook script.

The Vercel and Neon cold start path can take 3 to 6 seconds combined,
which exceeds the timeout each hook uses for a single request. Without
retries, one cold start blocks a tool call, drops an action update, or
loses a token attribution. Three attempts with exponential backoff absorb
the common case while keeping the worst case bounded.

The latency-critical guard call overrides the retry count via
DASHCLAW_GUARD_RETRIES (default 0: a single attempt, so an unreachable
instance fails closed in ~one connect timeout instead of ~8s of retries
and backoff per tool call).

Stdlib only. No third party dependencies.
"""

import json
import os
import time
import urllib.error
import urllib.request


def env_retries(name, default):
    """Read a retry-count env var. Clamps to >= 0; bad values fall back."""
    raw = os.environ.get(name, "")
    try:
        value = int(raw) if raw != "" else default
    except ValueError:
        return default
    return max(0, value)


def request_with_retry(req, timeout, retries=2):
    """urlopen the given Request with up to retries+1 attempts.

    Returns the response body as bytes on success. Raises the final
    exception when every attempt fails. Sleeps 0.4 seconds after the
    first failure and 0.8 seconds after the second before retrying.

    Worst case latency when the API is down: 1.2 seconds of sleep plus
    one timeout per attempt. Best case when the first attempt succeeds:
    same as a single urlopen call. Cold start case where one attempt
    fails and the next succeeds: roughly 0.4 seconds of extra latency
    on top of the successful attempt.
    """
    last_exc = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            # Transient-only retries: a non-transient 4xx (auth failure,
            # validation error) fails identically on every attempt —
            # retrying burns latency and duplicates work downstream.
            # 408 (request timeout) and 429 (rate limit) stay retryable,
            # as do all 5xx.
            if exc.code < 500 and exc.code not in (408, 429):
                raise
            last_exc = exc
            if attempt < retries:
                time.sleep(0.4 * (2 ** attempt))
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                time.sleep(0.4 * (2 ** attempt))
    if last_exc is not None:
        raise last_exc
    return b""


# ---------------------------------------------------------------------------
# Payload sanitation
# ---------------------------------------------------------------------------

# Depth beyond which a payload is left alone. Hook payloads nest a handful of
# levels; anything deeper is not evidence worth rewriting.
_MAX_SANITIZE_DEPTH = 16


def _is_unstorable(ch):
    code = ord(ch)
    # NUL, and any UTF-16 surrogate code point. A Python str stores astral
    # characters as one code point, so a surrogate here is always an unpaired
    # half that survived a lenient decode.
    return code == 0 or (0xD800 <= code <= 0xDFFF)


def strip_unstorable(value, depth=0):
    """Drop characters Postgres cannot store from a JSON-shaped payload.

    A NUL or an unpaired surrogate anywhere in an act, a guard context or an
    outcome summary makes the server's whole INSERT fail: 22021 "invalid byte
    sequence for encoding UTF8: 0x00" on a text parameter, and 22P05
    "unsupported Unicode escape sequence" once the stored JSON is cast to
    jsonb. On 2026-09-14 one NUL inside a source file a governed session was
    editing blocked five tool calls (the execution claim 500'd, so the hook
    reported an ambiguous claim) and left five action rows stuck in 'running'
    (the outcome PATCH 500'd).

    The server strips the same characters in app/lib/validate.js; this is the
    client half, so an older server is protected too and the round trip is
    never spent on a payload that cannot be stored.

    A clean string is returned unchanged; containers are rebuilt.
    """
    if isinstance(value, str):
        if not any(_is_unstorable(ch) for ch in value):
            return value
        return "".join(ch for ch in value if not _is_unstorable(ch))
    if depth >= _MAX_SANITIZE_DEPTH:
        return value
    if isinstance(value, dict):
        return {strip_unstorable(k, depth + 1): strip_unstorable(v, depth + 1)
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        cleaned = [strip_unstorable(item, depth + 1) for item in value]
        return cleaned if isinstance(value, list) else tuple(cleaned)
    return value


def encode_json_body(body):
    """JSON-encode a request body after stripping unstorable characters.

    Every hook that POSTs or PATCHes governance state goes through this, so
    the sanitation cannot be forgotten on a new call site.
    """
    if body is None:
        return None
    return json.dumps(strip_unstorable(body)).encode("utf-8")

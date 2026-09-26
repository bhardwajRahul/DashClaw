"""Regression tests: a guard REFUSAL (HTTP 400) must not be reported as an outage.

/api/guard answers HTTP 400 with a refusal body when it refuses the declared
goal — the prompt-injection rejection is the canonical case:

    {"error": "Input rejected: prompt injection pattern detected",
     "risk_level": "critical", "categories": ["role_override"]}

Before this fix, guard_check() called api_request() without read_error_body, so
that body was discarded and the refusal reached main() as None — the same value
a dead host produces. The refusal was then:

1. reported to the operator as "guard ... is unreachable", and
2. recorded in the orphan log as guard_unreachable, and
3. DOWNGRADED by DASHCLAW_GUARD_UNAVAILABLE_POLICY: with =allow or =warn, an
   action the guard had explicitly refused was allowed to proceed.

These tests serve a refusal from a local stub server (no external network) and
assert the refusal is named, recorded as guard_rejected, and never downgraded by
an outage policy. A genuine outage must still report "unreachable".

Uses only the Python standard library. Follows the subprocess + unittest pattern
from test_pretool_guard_unavailable.py.
"""

import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid


_HOOKS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PRETOOL_SCRIPT = os.path.join(_HOOKS_DIR, "dashclaw_pretool.py")

_UNREACHABLE_URL = "http://127.0.0.1:1"

_REFUSAL_BODY = {
    "error": "Input rejected: prompt injection pattern detected",
    "risk_level": "critical",
    "categories": ["role_override"],
}


def _start_stub(status, body, delay=0):
    """Serve `status`/`body` for POST /api/guard (after `delay` seconds);
    200 {} for anything else."""

    class Handler(http.server.BaseHTTPRequestHandler):
        def _reply(self, status, body):
            payload = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            if "/api/guard" in self.path:
                if delay:
                    time.sleep(delay)
                self._reply(status, body)
            else:
                self._reply(200, {})

        def do_GET(self):
            self._reply(200, {})

        def log_message(self, format, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, "http://127.0.0.1:%d" % server.server_address[1]


def _run_hook(home_dir, tmp_dir, base_url, env_overrides=None, timeout=20):
    """Run the pretool hook as a subprocess with a scoped HOME + TMP.

    Returns (exit_code, stdout, stderr).
    """
    env = os.environ.copy()
    for key in list(env.keys()):
        if key.startswith("DASHCLAW_"):
            del env[key]
    env["DASHCLAW_DISABLE_DOTENV"] = "1"

    env["HOME"] = home_dir
    env["USERPROFILE"] = home_dir
    env["TEMP"] = tmp_dir
    env["TMP"] = tmp_dir
    env["TMPDIR"] = tmp_dir

    env["DASHCLAW_BASE_URL"] = base_url
    env["DASHCLAW_API_KEY"] = "test-key-guard-rejection"
    env["DASHCLAW_AGENT_ID"] = "test-agent-guard-rejection"
    env["DASHCLAW_WORKSPACE"] = tmp_dir
    env["DASHCLAW_PERMISSION_MODE"] = "danger"
    env["DASHCLAW_GUARD_TIMEOUT"] = "2"

    if env_overrides:
        env.update(env_overrides)

    payload = {
        "tool_name": "Bash",
        "tool_input": {"command": "rm -rf /tmp/dashclaw-rejection-test-fixture"},
        # A fresh action id per call: the hook claims the id locally, and a
        # reused id is refused by the claim check before the guard is consulted.
        "tool_use_id": "tu-" + uuid.uuid4().hex[:12],
    }
    proc = subprocess.run(
        [sys.executable, _PRETOOL_SCRIPT],
        input=json.dumps(payload).encode("utf-8"),
        capture_output=True,
        timeout=timeout,
        env=env,
    )
    return (
        proc.returncode,
        proc.stdout.decode("utf-8", errors="replace"),
        proc.stderr.decode("utf-8", errors="replace"),
    )


def _read_orphan_log(home_dir):
    path = os.path.join(home_dir, ".dashclaw", "orphan-actions.jsonl")
    if not os.path.exists(path):
        return []
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


class GuardRejectionTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="dc-rejection-home-")
        self.tmp = tempfile.mkdtemp(prefix="dc-rejection-tmp-")
        self.servers = []

    def tearDown(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()

    def _stub(self, status, body, delay=0):
        server, url = _start_stub(status, body, delay)
        self.servers.append(server)
        return url

    def test_refusal_blocks_with_the_real_reason(self):
        """A 400 refusal blocks, and the reason names the refusal."""
        url = self._stub(400, _REFUSAL_BODY)
        code, _out, err = _run_hook(self.home, self.tmp, url)

        self.assertEqual(code, 2, "a guard refusal must block")
        self.assertIn("rejected this action", err)
        self.assertIn("Input rejected: prompt injection pattern detected", err)
        self.assertIn("verdict, not an outage", err)
        self.assertNotIn("unreachable", err)

        records = _read_orphan_log(self.home)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["reason"], "guard_rejected")
        self.assertIn("role_override", str(records[0].get("detail")))

    def test_refusal_is_not_downgraded_by_allow_policy(self):
        """DASHCLAW_GUARD_UNAVAILABLE_POLICY=allow is an OUTAGE policy: a
        refusal is a verdict, so the action still blocks."""
        url = self._stub(400, _REFUSAL_BODY)
        code, _out, err = _run_hook(
            self.home, self.tmp, url,
            env_overrides={"DASHCLAW_GUARD_UNAVAILABLE_POLICY": "allow"},
        )

        self.assertEqual(code, 2, "a refusal must not be waved through by an outage policy")
        self.assertIn("rejected this action", err)
        records = _read_orphan_log(self.home)
        self.assertEqual(records[0]["reason"], "guard_rejected")
        self.assertEqual(records[0]["policy"], "block")

    def test_refusal_is_not_downgraded_by_warn_policy(self):
        url = self._stub(400, _REFUSAL_BODY)
        code, _out, err = _run_hook(
            self.home, self.tmp, url,
            env_overrides={"DASHCLAW_GUARD_UNAVAILABLE_POLICY": "warn"},
        )

        self.assertEqual(code, 2, "a refusal must not be waved through by an outage policy")
        self.assertIn("rejected this action", err)
        self.assertEqual(_read_orphan_log(self.home)[0]["reason"], "guard_rejected")

    def test_refusal_still_proceeds_in_observe_mode(self):
        """Observe is an explicit never-block mode and keeps its contract, but
        the message and the orphan record must still tell the truth."""
        url = self._stub(400, _REFUSAL_BODY)
        code, _out, err = _run_hook(
            self.home, self.tmp, url,
            env_overrides={"DASHCLAW_HOOK_MODE": "observe"},
        )

        self.assertEqual(code, 0)
        self.assertIn("[observe]", err)
        self.assertIn("rejected this action", err)
        self.assertNotIn("unreachable", err)
        self.assertEqual(_read_orphan_log(self.home)[0]["reason"], "guard_rejected")

    def test_throttled_guard_is_reported_as_transient_not_unreachable(self):
        """HTTP 429 is an answer without a verdict — not an outage."""
        url = self._stub(429, {"error": "rate limited"})
        code, _out, err = _run_hook(self.home, self.tmp, url)

        self.assertEqual(code, 2)
        self.assertIn("without a verdict", err)
        self.assertNotIn("unreachable", err)
        self.assertEqual(_read_orphan_log(self.home)[0]["reason"], "guard_transient")

    def test_timed_out_guard_is_not_reported_as_an_http_answer(self):
        """A timeout also ends without a verdict, but nothing answered: the
        message must not claim an HTTP status the host never sent."""
        url = self._stub(200, {"decision": "allow"}, delay=2)
        code, _out, err = _run_hook(
            self.home, self.tmp, url,
            env_overrides={"DASHCLAW_GUARD_TIMEOUT": "0.5"},
        )

        self.assertEqual(code, 2)
        self.assertIn("without a verdict", err)
        self.assertIn("timeout", err)
        self.assertNotIn("answered", err)
        self.assertEqual(_read_orphan_log(self.home)[0]["reason"], "guard_transient")

    def test_non_object_refusal_body_blocks_instead_of_crashing(self):
        """read_error_body hands back whatever JSON the error carried. A bare
        string is not a verdict; reading it as one crashed the hook, and a
        crashed PreToolUse hook lets the tool call through."""
        url = self._stub(400, "Bad Request")
        code, _out, err = _run_hook(self.home, self.tmp, url)

        self.assertEqual(code, 2, "a garbled refusal must fail closed, not crash open")
        self.assertNotIn("Traceback", err)

    def test_refusal_does_not_offer_the_outage_policy_as_a_way_out(self):
        """The outage policy cannot change a refusal, so the block message must
        not tell the operator to set it."""
        url = self._stub(400, _REFUSAL_BODY)
        _code, _out, err = _run_hook(self.home, self.tmp, url)

        self.assertNotIn("DASHCLAW_GUARD_UNAVAILABLE_POLICY", err)

    def test_genuine_outage_still_reports_unreachable(self):
        """The original behaviour must survive: a dead host is an outage."""
        code, _out, err = _run_hook(
            self.home, self.tmp, _UNREACHABLE_URL,
            env_overrides={"DASHCLAW_GUARD_TIMEOUT": "0.5"},
        )

        self.assertEqual(code, 2)
        self.assertIn("unreachable", err)
        self.assertEqual(_read_orphan_log(self.home)[0]["reason"], "guard_unreachable")


if __name__ == "__main__":
    unittest.main()

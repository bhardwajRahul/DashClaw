"""Characters Postgres cannot store never leave a hook.

A NUL or an unpaired surrogate anywhere in a payload makes the server's whole
INSERT fail (22021 on a text parameter, 22P05 once the stored JSON is cast to
jsonb). On 2026-09-14 one NUL inside a source file a governed session was
editing blocked five tool calls and left five action rows stuck in 'running'.
The server strips the same characters in app/lib/validate.js; this is the
client half, so an older server is protected too.

Built from chr() rather than escapes on purpose: a test file carrying a literal
NUL is exactly the payload this module exists to keep out of the wire.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashclaw_agent_intel.http_client import encode_json_body, strip_unstorable

NUL = chr(0)
LONE_HIGH = chr(0xD800)
LONE_LOW = chr(0xDFFF)
EMOJI = chr(0x1F600)


class PayloadSanitationTests(unittest.TestCase):
    def test_strips_a_nul_and_keeps_the_surrounding_evidence(self):
        self.assertEqual(strip_unstorable("rm " + NUL + "-rf /tmp/x"), "rm -rf /tmp/x")

    def test_strips_unpaired_surrogates_but_not_astral_characters(self):
        self.assertEqual(strip_unstorable("a" + LONE_HIGH + "b"), "ab")
        self.assertEqual(strip_unstorable("a" + LONE_LOW + "b"), "ab")
        self.assertEqual(strip_unstorable("ship it " + EMOJI), "ship it " + EMOJI)

    def test_walks_nested_payloads(self):
        cleaned = strip_unstorable({
            "act": {"kind": "file", "content": "const sep = " + NUL + ";"},
            "systems_touched": ["db" + NUL, "api"],
            "risk_score": 40,
            "reversible": True,
        })
        self.assertEqual(cleaned, {
            "act": {"kind": "file", "content": "const sep = ;"},
            "systems_touched": ["db", "api"],
            "risk_score": 40,
            "reversible": True,
        })

    def test_a_clean_string_is_returned_unchanged(self):
        value = "npm run build"
        self.assertIs(strip_unstorable(value), value)

    def test_encoded_body_carries_no_escape_postgres_rejects(self):
        encoded = encode_json_body({"declared_goal": "write " + NUL + " file"})
        # The precise failure: json.dumps of a real NUL emits the escape that
        # a ::jsonb cast raises 22P05 on.
        nul_escape = json.dumps(NUL)[1:-1].encode("utf-8")
        self.assertNotIn(nul_escape, encoded)
        self.assertEqual(json.loads(encoded.decode("utf-8")),
                         {"declared_goal": "write  file"})

    def test_an_empty_body_stays_none(self):
        self.assertIsNone(encode_json_body(None))


if __name__ == "__main__":
    unittest.main()

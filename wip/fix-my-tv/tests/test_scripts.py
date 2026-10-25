"""Offline tests for the deterministic parts: mDNS parsing and package classification."""
import os
import socket
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import find_tv  # noqa: E402
import tv  # noqa: E402


def record(name, rtype, rdata):
    return find_tv.encode_name(name) + struct.pack("!HHIH", rtype, 1, 120, len(rdata)) + rdata


class MdnsTest(unittest.TestCase):
    def test_query_asks_for_every_service(self):
        q = find_tv.build_query(list(find_tv.SERVICES))
        self.assertEqual(struct.unpack("!H", q[4:6])[0], len(find_tv.SERVICES))

    def test_parse_response(self):
        service = "_androidtvremote2._tcp.local"
        instance = "Living Room TV." + service
        txt = b"\x0bfn=Bedroom"
        body = (record(service, find_tv.TYPE_PTR, find_tv.encode_name(instance))
                + record(instance, find_tv.TYPE_SRV, struct.pack("!HHH", 0, 0, 6466) + find_tv.encode_name("Android.local"))
                + record(instance, find_tv.TYPE_TXT, txt)
                + record("Android.local", find_tv.TYPE_A, socket.inet_aton("10.0.0.9")))
        msg = struct.pack("!HHHHHH", 0, 0x8400, 0, 1, 0, 3) + body
        records = find_tv.parse_records(msg)
        self.assertIn((service, find_tv.TYPE_PTR, instance), records)
        self.assertIn((instance, find_tv.TYPE_SRV, ("Android.local", 6466)), records)
        self.assertIn(("Android.local", find_tv.TYPE_A, "10.0.0.9"), records)
        self.assertIn((instance, find_tv.TYPE_TXT, {"fn": "Bedroom"}), records)

    def test_compressed_names(self):
        # Header, then a question for "a.local", then an answer whose name points back at it.
        question = find_tv.encode_name("a.local") + struct.pack("!HH", 12, 1)
        answer = b"\xc0\x0c" + struct.pack("!HHIH", 12, 1, 120, 4) + b"\x01b\xc0\x0c"
        msg = struct.pack("!HHHHHH", 0, 0x8400, 1, 1, 0, 0) + question + answer
        self.assertEqual(find_tv.parse_records(msg), [("a.local", 12, "b.a.local")])


class ClassifyTest(unittest.TestCase):
    rules = tv.load_rules()

    def group(self, pkg, system=True):
        return tv.classify(pkg, system, self.rules)[0]

    def test_exact_beats_wildcard(self):
        self.assertEqual(self.group("com.android.providers.partnerbookmarks"), "bloat")
        self.assertEqual(self.group("com.android.providers.media"), "core")

    def test_core_wildcard_beats_vendor(self):
        self.assertEqual(self.group("com.mediatek.hdmi.service"), "core")
        self.assertEqual(self.group("com.sony.dtv.tvinput.hdmi"), "core")
        self.assertEqual(self.group("com.sony.dtv.photo"), "vendor")

    def test_unknown(self):
        self.assertEqual(self.group("com.example.thing"), "system")
        self.assertEqual(self.group("com.example.thing", system=False), "user")

    def test_known_groups(self):
        self.assertEqual(self.group("com.google.android.apps.tv.launcherx"), "home")
        self.assertEqual(self.group("tv.samba.ssm"), "ads")
        self.assertEqual(self.group("com.google.android.apps.mediashell"), "optional")


if __name__ == "__main__":
    unittest.main()

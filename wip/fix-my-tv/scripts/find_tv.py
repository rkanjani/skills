#!/usr/bin/env python3
"""Find Android TV and Google TV devices on the local network.

Asks the network over mDNS for the services every Android TV advertises (the remote-control
service, Chromecast built-in, wireless debugging), then sweeps the local /24 for the remote and
ADB ports to catch TVs that don't answer mDNS. Standard library only.

Usage: find_tv.py [--json] [--timeout SECONDS] [--no-scan]
"""
import argparse
import concurrent.futures
import ipaddress
import json
import socket
import struct
import sys
import time

SERVICES = {
    "_androidtvremote2._tcp.local": "tv-remote",
    "_androidtvremote._tcp.local": "tv-remote",
    "_googlecast._tcp.local": "cast",
    "_adb-tls-connect._tcp.local": "adb-wireless",
    "_adb-tls-pairing._tcp.local": "adb-pairing",
    "_adb._tcp.local": "adb",
}
PORTS = {5555: "adb", 6466: "tv-remote", 6467: "tv-remote-pairing", 8009: "cast"}
TYPE_A, TYPE_PTR, TYPE_TXT, TYPE_SRV = 1, 12, 16, 33


def encode_name(name):
    out = b""
    for part in name.rstrip(".").split("."):
        out += bytes([len(part)]) + part.encode()
    return out + b"\0"


def build_query(names):
    header = struct.pack("!HHHHHH", 0, 0, len(names), 0, 0, 0)
    return header + b"".join(encode_name(n) + struct.pack("!HH", TYPE_PTR, 1) for n in names)


def read_name(data, offset):
    labels, jumped, end = [], False, offset
    for _ in range(64):
        length = data[offset]
        if length == 0:
            offset += 1
            break
        if length & 0xC0 == 0xC0:
            pointer = struct.unpack("!H", data[offset:offset + 2])[0] & 0x3FFF
            if not jumped:
                end = offset + 2
            jumped, offset = True, pointer
            continue
        labels.append(data[offset + 1:offset + 1 + length].decode("utf-8", "replace"))
        offset += 1 + length
    return ".".join(labels), (end if jumped else offset)


def parse_records(data):
    """Return (name, type, rdata) for every record in a DNS message."""
    _, _, qd, an, ns, ar = struct.unpack("!HHHHHH", data[:12])
    offset = 12
    for _ in range(qd):
        _, offset = read_name(data, offset)
        offset += 4
    records = []
    for _ in range(an + ns + ar):
        name, offset = read_name(data, offset)
        rtype, _, _, length = struct.unpack("!HHIH", data[offset:offset + 10])
        offset += 10
        rdata = data[offset:offset + length]
        if rtype == TYPE_PTR:
            value = read_name(data, offset)[0]
        elif rtype == TYPE_SRV:
            _, _, port = struct.unpack("!HHH", rdata[:6])
            value = (read_name(data, offset + 6)[0], port)
        elif rtype == TYPE_A and length == 4:
            value = socket.inet_ntoa(rdata)
        elif rtype == TYPE_TXT:
            value, i = {}, 0
            while i < len(rdata):
                n = rdata[i]
                key, _, val = rdata[i + 1:i + 1 + n].decode("utf-8", "replace").partition("=")
                value[key] = val
                i += 1 + n
        else:
            value = None
        records.append((name, rtype, value))
        offset += length
    return records


def mdns_browse(timeout):
    """One-shot mDNS query from an ephemeral port; responders answer us directly (RFC 6762 6.7)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
    sock.bind(("", 0))
    sock.settimeout(0.3)
    query = build_query(list(SERVICES))
    found = []
    deadline = time.time() + timeout
    next_send = 0.0
    while time.time() < deadline:
        if time.time() >= next_send:
            try:
                sock.sendto(query, ("224.0.0.251", 5353))
            except OSError:
                break
            next_send = time.time() + 1.0
        try:
            data, (src, _) = sock.recvfrom(9000)
        except socket.timeout:
            continue
        except OSError:
            break
        try:
            found.append((src, parse_records(data)))
        except (IndexError, struct.error, UnicodeDecodeError):
            continue
    sock.close()
    return found


def local_ipv4():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))  # no packet is sent; this only picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def port_open(ip, port, timeout=0.4):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def sweep(ip, ports):
    net = ipaddress.ip_network(ip + "/24", strict=False)
    targets = [(str(h), p) for h in net.hosts() if str(h) != ip for p in ports]
    with concurrent.futures.ThreadPoolExecutor(max_workers=128) as pool:
        results = pool.map(lambda t: (t, port_open(*t)), targets)
        return [t for t, ok in results if ok]


def discover(timeout=3.0, scan=True):
    devices = {}

    def device(ip):
        return devices.setdefault(ip, {"ip": ip, "name": None, "model": None, "services": {}, "open_ports": []})

    for src, records in mdns_browse(timeout):
        addresses = {n.lower(): v for n, t, v in records if t == TYPE_A}
        srv = {n.lower(): v for n, t, v in records if t == TYPE_SRV}
        txt = {n.lower(): v for n, t, v in records if t == TYPE_TXT}
        for name, rtype, instance in records:
            name = name.lower()
            if rtype != TYPE_PTR or name not in SERVICES:
                continue
            host, port = srv.get(instance.lower(), (None, None))
            ip = addresses.get(host.lower(), src) if host else src
            d = device(ip)
            d["services"][SERVICES[name]] = port
            label = instance[: -len(name) - 1] if instance.lower().endswith(name) else instance
            meta = txt.get(instance.lower(), {})
            if SERVICES[name] == "cast":
                d["name"] = meta.get("fn") or d["name"]
                d["model"] = meta.get("md") or d["model"]
            elif SERVICES[name] == "tv-remote" and not d["name"]:
                d["name"] = label
    if scan:
        me = local_ipv4()
        if me:
            for (ip, port) in sweep(me, [5555, 6466]):
                device(ip)
    for d in devices.values():
        d["open_ports"] = [p for p in PORTS if port_open(d["ip"], p)]
        d["is_tv"] = "tv-remote" in d["services"] or 6466 in d["open_ports"]
        wireless = d["services"].get("adb-wireless")
        if 5555 in d["open_ports"]:
            d["adb"] = d["ip"] + ":5555"
        elif wireless:
            d["adb"] = "%s:%s" % (d["ip"], wireless)
        else:
            d["adb"] = None
    tvs = [d for d in devices.values() if d["is_tv"] or d["adb"]]
    return sorted(tvs, key=lambda d: (not d["is_tv"], d["adb"] is None, d["ip"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="print JSON")
    ap.add_argument("--timeout", type=float, default=3.0, help="seconds to listen for mDNS answers")
    ap.add_argument("--no-scan", action="store_true", help="skip the /24 port sweep")
    args = ap.parse_args()
    tvs = discover(args.timeout, not args.no_scan)
    if args.json:
        print(json.dumps(tvs, indent=2))
        return 0
    if not tvs:
        print("No Android TV found. Check the TV is on and on the same network as this computer.")
        return 1
    for d in tvs:
        name = d["name"] or "Unnamed device"
        model = " (%s)" % d["model"] if d["model"] else ""
        kind = "Android TV" if d["is_tv"] else "ADB device"
        if d["adb"]:
            adb = "ADB reachable at " + d["adb"]
        elif d["services"].get("adb-pairing"):
            adb = "wireless debugging pairing open on port %s" % d["services"]["adb-pairing"]
        else:
            adb = "ADB off: turn on network or wireless debugging"
        print("%-16s %s%s, %s, %s" % (d["ip"], name, model, kind, adb))
    return 0


if __name__ == "__main__":
    sys.exit(main())

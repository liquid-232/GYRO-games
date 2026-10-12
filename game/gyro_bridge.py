"""Local game server + latest-sample UDP/SSE bridge. Python 3.10+, no packages."""
from __future__ import annotations

import argparse
from collections import deque
import functools
import ipaddress
import json
import math
from pathlib import Path
import secrets
import socket
import struct
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MOTION = struct.Struct('<4sIII5fHH')
COMMAND = struct.Struct('<4sIII')
SENSOR_OK, CALIBRATING, READY = 1, 2, 4
STALE_MS = 150


def private_ipv4(value):
    address = ipaddress.IPv4Address(value)
    if not any(address in ipaddress.IPv4Network(cidr) for cidr in
               ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
        raise ValueError('控制器地址必须是局域网 IPv4 地址')
    return str(address)


class Controller:
    def __init__(self):
        self.lock = threading.RLock()
        self.sock = None
        self.session = 0
        self.target = '192.168.4.1'
        self.sample = None
        self.received = 0.0
        self.packet_received = 0.0
        self.received_wall = 0.0
        self.arrivals = deque()
        self.pings = {}
        self.rtt = None
        self.clock_anchor = None
        self.error = ''
        self.next_ping = 0.0
        self.closed = threading.Event()
        self.worker = threading.Thread(target=self.run, daemon=True)
        self.worker.start()

    def send(self, op, arg=0):
        if self.sock:
            self.sock.send(COMMAND.pack(b'GYC1', self.session, op, arg))

    def disconnect(self):
        with self.lock:
            if self.sock:
                try:
                    self.send(4)
                except OSError:
                    pass
                self.sock.close()
            self.sock = None
            self.sample = None
            self.session = 0
            self.rtt = None
            self.clock_anchor = None
            self.packet_received = 0.0
            self.arrivals.clear()
            self.pings.clear()
            self.error = ''

    def connect(self, target):
        target = private_ipv4(target)
        with self.lock:
            self.disconnect()
            connection = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                connection.connect((target, 4210))
                connection.setblocking(False)
            except OSError:
                connection.close()
                raise
            self.sock = connection
            self.target = target
            self.session = secrets.randbelow(0xffffffff) + 1
            self.next_ping = 0

    def calibrate(self):
        with self.lock:
            if not self.sock:
                raise ValueError('请先连接控制器')
            self.send(3)
            # Immediately invalidate the previous ready state until fresh telemetry arrives.
            if self.sample:
                self.sample['flags'] = CALIBRATING | SENSOR_OK

    def accept(self, data, now):
        if len(data) == COMMAND.size:
            magic, session, ping, device_us = COMMAND.unpack(data)
            if magic == b'GYP1' and session == self.session and ping in self.pings:
                self.rtt = (now - self.pings.pop(ping)) * 1000
                self.clock_anchor = (device_us, now)
            return
        if len(data) != MOTION.size:
            return
        magic, session, sequence, device_us, roll, pitch, gx, gy, gz, flags, period = MOTION.unpack(data)
        if magic != b'GYR1' or session != self.session:
            return
        if (flags & ~7 or not all(math.isfinite(n) for n in (roll, pitch, gx, gy, gz))
                or abs(roll) > 180.1 or abs(pitch) > 90.1
                or any(abs(g) > 501 for g in (gx, gy, gz))):
            return
        if flags & SENSOR_OK and self.clock_anchor:
            # Clock offset is bounded by the ping round trip. Even using the latest
            # possible sample time, reject data certainly older than the watchdog.
            anchor_us, anchor_received = self.clock_anchor
            device_delta = ((device_us - anchor_us + 0x80000000) & 0xffffffff) - 0x80000000
            if now - (anchor_received + device_delta / 1_000_000) > STALE_MS / 1000:
                return
        if self.sample:
            delta = (sequence - self.sample['sequence']) & 0xffffffff
            if delta == 0 or delta >= 0x80000000:
                # Repeated last-good samples must never refresh the watchdog.
                if delta == 0 and not flags & SENSOR_OK:
                    self.sample['flags'] = 0
                if delta == 0:
                    self.packet_received = now
                    self.arrivals.append(now)
                return
        self.sample = dict(sequence=sequence, device_us=device_us, roll=roll, pitch=pitch,
                           gx=gx, gy=gy, gz=gz, flags=flags, period_us=period)
        self.received = now
        self.packet_received = now
        self.received_wall = time.time() * 1000
        self.arrivals.append(now)
        self.error = ''

    def snapshot(self):
        with self.lock:
            now = time.monotonic()
            while self.arrivals and now - self.arrivals[0] > 1:
                self.arrivals.popleft()
            age = (now - self.received) * 1000 if self.sample else None
            flags = self.sample['flags'] if self.sample else 0
            connected = bool(self.sock and self.packet_received and (now-self.packet_received)*1000 < STALE_MS)
            return dict(session=self.session, target=self.target, requested=bool(self.sock),
                        connected=connected, ready=connected and age is not None and age < STALE_MS and bool(flags & READY) and bool(flags & SENSOR_OK),
                        calibrating=connected and bool(flags & CALIBRATING), sensor_ok=bool(flags & SENSOR_OK),
                        age_ms=round(age, 1) if age is not None else None,
                        packet_age_ms=round((now-self.packet_received)*1000, 1) if self.packet_received else None,
                        received_wall_ms=self.received_wall, sent_wall_ms=time.time() * 1000,
                        rtt_ms=round(self.rtt, 1) if self.rtt is not None else None,
                        receive_hz=len(self.arrivals), sample=dict(self.sample) if self.sample else None,
                        error=self.error)

    def run(self):
        while not self.closed.wait(.002):
            with self.lock:
                if not self.sock:
                    continue
                now = time.monotonic()
                try:
                    if now >= self.next_ping:
                        self.send(1)
                        ping = secrets.randbits(32)
                        self.pings = {key: value for key, value in self.pings.items() if now-value < 2}
                        self.pings[ping] = now
                        self.send(2, ping)
                        self.next_ping = now + .5
                    # Drain queued datagrams each pass; SSE observes only the newest sample.
                    for _ in range(128):
                        try:
                            data = self.sock.recv(256)
                        except BlockingIOError:
                            break
                        self.accept(data, time.monotonic())
                except OSError:
                    self.error = '未收到开发板回应，请连接 GYRO-C3 Wi-Fi 并检查供电'
                    self.next_ping = now + .5

    def close(self):
        self.closed.set()
        self.disconnect()
        self.worker.join(timeout=1)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.connection.settimeout(3)

    def allowed(self):
        hosts = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return (self.headers.get('Host') in hosts
                and self.headers.get('Sec-Fetch-Site') != 'cross-site'
                and (not origin or origin in {f'http://{host}' for host in hosts}))

    def json_response(self, body, status=200):
        data = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.allowed():
            self.send_error(403)
            return
        if self.path == '/api/gyro/status':
            self.json_response(self.server.controller.snapshot())
        elif self.path == '/api/gyro/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')
            self.end_headers()
            try:
                while not self.server.controller.closed.is_set():
                    state = self.server.controller.snapshot()
                    data = json.dumps(state, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
                    self.wfile.write(('data: ' + data + '\n\n').encode('utf-8'))
                    self.wfile.flush()
                    self.server.controller.closed.wait(.01 if state['requested'] else .2)
            except (OSError, ConnectionError):
                pass
            self.close_connection = True
        elif self.path.startswith('/api/'):
            self.send_error(404)
        else:
            super().do_GET()

    def do_HEAD(self):
        if not self.allowed():
            self.send_error(403)
            return
        super().do_HEAD()

    def do_POST(self):
        if not self.allowed():
            self.send_error(403)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 1024 or self.headers.get_content_type() != 'application/json':
                self.close_connection = True
                self.json_response({'error': '请求格式无效'}, 400)
                return
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('请求格式无效')
            if self.path == '/api/gyro/connect':
                self.server.controller.connect(body.get('address', '192.168.4.1'))
            elif self.path == '/api/gyro/disconnect':
                self.server.controller.disconnect()
            elif self.path == '/api/gyro/calibrate':
                self.server.controller.calibrate()
            else:
                self.json_response({'error': '未知操作'}, 404)
                return
            self.json_response(self.server.controller.snapshot())
        except (ValueError, TypeError, OSError) as error:
            self.json_response({'error': str(error)}, 400)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        if not self.path.startswith('/api/'):
            super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true', help='Open the game in the default browser')
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(Path(__file__).parent / 'dist'))
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            if port == min(args.port + 19, 65535):
                raise
    server.daemon_threads = True
    server.controller = Controller()
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'GYRO Skystrike: {url}\nKeep this window open. Ctrl+C to quit.', flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.controller.close()
        server.server_close()


if __name__ == '__main__':
    main()

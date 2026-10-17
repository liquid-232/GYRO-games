"""Serve local game assets. Controller communication goes directly through browser BLE."""
import argparse
import functools
import os
import json
import secrets
import socket
import threading
import time
from pathlib import Path
import subprocess
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class PageLifecycle:
    """Keep serving while any game document is alive, with a reload grace period."""
    def __init__(self, enabled, close_delay=2, lease=180, startup=120, clock=time.monotonic):
        self.enabled = enabled
        self.token = secrets.token_urlsafe(32)
        self.close_delay, self.lease, self.clock = close_delay, lease, clock
        self.clients, self.closed = {}, {}
        self.stop_at = clock() + startup
        self.lock = threading.Lock()

    def update(self, client, action):
        with self.lock:
            now = self.clock()
            self.closed = {key: expiry for key, expiry in self.closed.items() if expiry > now}
            if action == 'leave':
                self.clients.pop(client, None)
                # A delayed heartbeat/join must not revive a document that has closed.
                self.closed[client] = now + self.lease
                if not self.clients:
                    self.stop_at = now + self.close_delay
            elif client not in self.closed:
                self.clients[client] = now + self.lease
                self.stop_at = None

    def should_stop(self):
        with self.lock:
            now = self.clock()
            self.clients = {key: expiry for key, expiry in self.clients.items() if expiry > now}
            if self.clients:
                return False
            if self.stop_at is None:
                self.stop_at = now + self.close_delay
            return now >= self.stop_at


def watch_pages(server, stopped):
    while not stopped.wait(.25):
        if server.lifecycle.should_stop():
            print('All game pages closed. Stopping local server.', flush=True)
            server.shutdown()
            return


class GameServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can otherwise bind over an older game's listener.
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def do_GET(self):
        if not self.allowed():
            self.send_error(403)
        elif self.path == '/__game_lifecycle':
            payload = json.dumps({'enabled': self.server.lifecycle.enabled,
                                  'token': self.server.lifecycle.token if self.server.lifecycle.enabled else None}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            super().do_GET()

    def do_POST(self):
        origin = self.headers.get('Origin')
        valid_origins = {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}
        if not self.allowed() or origin not in valid_origins or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send_error(403)
            return
        if self.path != '/__game_lifecycle' or not self.server.lifecycle.enabled:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024:
                raise ValueError('Invalid body size')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Invalid payload')
            token, client, action = payload.get('token'), payload.get('client'), payload.get('action')
            if not isinstance(token, str) or not secrets.compare_digest(token, self.server.lifecycle.token):
                self.send_error(403)
                return
            if not isinstance(client, str) or not 1 <= len(client) <= 80 or action not in ('join', 'heartbeat', 'leave'):
                raise ValueError('Invalid action')
        except (ValueError, TypeError):
            self.send_error(400)
            return
        self.server.lifecycle.update(client, action)
        self.send_response(204)
        self.end_headers()

    def do_HEAD(self):
        if not self.allowed():
            self.send_error(403)
        else:
            super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def open_game(url):
    if os.name == 'nt':
        # Web Bluetooth needs a supported browser. Keep the default browser setting intact.
        candidates = [Path(os.environ.get('PROGRAMFILES(X86)', 'C:/Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe',
                      Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Microsoft/Edge/Application/msedge.exe',
                      Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe',
                      Path(os.environ.get('LOCALAPPDATA', '')) / 'Google/Chrome/Application/chrome.exe']
        for browser in candidates:
            if browser.is_file():
                try:
                    subprocess.Popen([str(browser), url])
                    return
                except OSError:
                    continue
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--page', choices=('index.html', 'maze.html', 'spaceplane-preview.html', 'concept-film.html'), default='index.html')
    parser.add_argument('--auto-close', action='store_true', help='Exit after all game pages close (also enabled by --open)')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    handler = functools.partial(Handler, directory=str(Path(__file__).parent / 'dist'))
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = GameServer(('127.0.0.1', port), handler)
            break
        except OSError:
            if port == min(args.port + 19, 65535):
                raise
    server.daemon_threads = True
    server.lifecycle = PageLifecycle(args.open or args.auto_close)
    stopped = threading.Event()
    if server.lifecycle.enabled:
        threading.Thread(target=watch_pages, args=(server, stopped), daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'GYRO Bluetooth Skystrike: {url}\nClose all game pages to stop automatically. Ctrl+C also quits.' if server.lifecycle.enabled else f'GYRO Bluetooth Skystrike: {url}\nCtrl+C to quit.', flush=True)
    if args.open:
        open_game(url + args.page)
    try:
        server.serve_forever(poll_interval=.1)
    except KeyboardInterrupt:
        pass
    finally:
        stopped.set()
        server.server_close()


if __name__ == '__main__':
    main()

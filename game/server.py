"""Serve local game assets. Controller communication goes directly through browser BLE."""
import argparse
import functools
import os
from pathlib import Path
import subprocess
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def do_GET(self):
        if not self.allowed():
            self.send_error(403)
        else:
            super().do_GET()

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
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    handler = functools.partial(Handler, directory=str(Path(__file__).parent / 'dist'))
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            if port == min(args.port + 19, 65535):
                raise
    server.daemon_threads = True
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'GYRO Bluetooth Skystrike: {url}\nKeep this window open. Ctrl+C to quit.', flush=True)
    if args.open:
        open_game(url)
    try:
        server.serve_forever(poll_interval=.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

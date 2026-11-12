#!/usr/bin/env python3
"""
Antigravity OAuth Localhost Bridge for 9Router
Listens on http://localhost:443/callback and automatically relays
OAuth tokens to 9Router on router.sentinelai.studio.
"""

import sys
import http.server
import socketserver
import urllib.parse
import threading

PORT = 443

HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Antigravity OAuth - 9Router Relay</title>
  <style>
    body {
      background: #090d16;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      padding: 36px 40px;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      max-width: 440px;
    }
    .icon {
      font-size: 44px;
      margin-bottom: 14px;
      animation: pulse 1.5s infinite;
    }
    h2 {
      margin: 0 0 10px;
      color: #38bdf8;
      font-size: 20px;
    }
    p {
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.6;
      margin: 0 0 20px;
    }
    .status {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
      font-size: 12px;
      font-weight: 600;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚡</div>
    <h2>Antigravity OAuth Diterima!</h2>
    <p>Pengesahan Google berjaya diterima. Mengalihkan ke 9Router portal...</p>
    <div class="status" id="st">Menyambungkan ke 9Router...</div>
  </div>
  <script>
    const search = window.location.search;
    const targetUrl = 'https://router.sentinelai.studio/callback' + search;
    
    // 1. Post to opener if possible
    if (window.opener) {
      try {
        const p = new URLSearchParams(search);
        window.opener.postMessage({
          type: 'oauth_callback',
          data: {
            code: p.get('code'),
            state: p.get('state'),
            error: p.get('error'),
            errorDescription: p.get('error_description'),
            fullUrl: window.location.href
          }
        }, '*');
      } catch(e) {}
    }

    // 2. Redirect immediately to 9router callback page on Cloudflare
    setTimeout(() => {
      window.location.replace(targetUrl);
    }, 400);
  </script>
</body>
</html>
"""

class OAuthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        print(f"[OAuth Bridge] Incoming request: {self.path}")
        parsed = urllib.parse.urlparse(self.path)
        
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(HTML_TEMPLATE.encode("utf-8"))

    def log_message(self, format, *args):
        # Clean logging
        sys.stdout.write(f"[Bridge 443] {args[0]} - {args[1]}\n")
        sys.stdout.flush()

def is_port_in_use(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def run_server():
    server_address = ("127.0.0.1", PORT)
    try:
        httpd = socketserver.TCPServer(server_address, OAuthHandler)
        print(f"[Bridge 443] Listening on http://127.0.0.1:{PORT}/callback...")
        httpd.serve_forever()
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or "10048" in str(e):
            print(f"[Bridge 443] Notice: Port {PORT} is already actively bound and listening in the background.")
            print(f"[Bridge 443] The Antigravity OAuth Relay is ALREADY ACTIVE and ready to receive callbacks.")
        else:
            print(f"[Bridge 443] Error starting server: {e}")
    except Exception as e:
        print(f"[Bridge 443] Unexpected error: {e}")

if __name__ == "__main__":
    run_server()

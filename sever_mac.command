#!/bin/bash
# 이 폴더를 http://localhost:8099 로 서빙하는 간단한 로컬 서버 (macOS용).
# file:// 로 열면 로컬 폰트 파일 등을 브라우저가 막을 수 있어서, 항상 이 서버로 열어야 합니다.
cd "$(dirname "$0")"
PORT=8099

if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "http://localhost:$PORT" &
else
    open "http://localhost:$PORT" &
fi

python3 - "$PORT" <<'EOF'
import sys
import http.server

port = int(sys.argv[1])

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        '': 'application/octet-stream',
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
    }

print(f"로컬 서버 시작: http://localhost:{port}/")
print("(이 창을 닫으면 서버가 멈춥니다. 종료하려면 Ctrl+C)")

# ThreadingHTTPServer: 요청마다 스레드를 하나씩 띄워서 동시에 여러 요청(폰트/CSS/JS 등)을
# 처리한다. 단일 스레드 서버(TCPServer)는 한 번에 한 요청만 처리해서, 페이지 전환처럼
# 여러 리소스가 동시에 몰릴 때 "서버에 연결할 수 없음" 에러가 간헐적으로 발생할 수 있었다.
with http.server.ThreadingHTTPServer(("", port), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
EOF

#!/usr/bin/env python3
# 이 폴더를 http://localhost:8099 로 서빙하는 간단한 로컬 서버 (윈도우·맥 공용).
# file:// 로 열면 로컬 폰트 파일 등을 브라우저가 막을 수 있어서, 항상 이 서버로 열어야 합니다.
# 더블클릭: serve.bat(윈도우) / serve.command(맥). Claude 미리보기(.claude/launch.json)도 이 파일을 쓴다.
# 다른 폴더를 열려면: python3 serve.py <폴더>  (예: python3 serve.py USB_제출용/program)
import errno
import functools
import http.server
import os
import socket
import sys

PORT = 8099

# 윈도우는 레지스트리 설정에 따라 .js를 text/plain으로 내보내 스크립트가 막히는 일이 있어서
# 확장자별 형식을 직접 정해 둔다. 여기 없는 확장자는 파이썬 기본값을 따른다.
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.stl': 'model/stl',
    '.wasm': 'application/wasm',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = MIME

    def end_headers(self):
        # 파일을 고친 뒤 새로고침만 해도 바로 보이도록 브라우저 캐시를 쓰지 않게 한다.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def list_directory(self, path):
        # index.html이 없는 폴더(홍보자료/ 등)의 파일 목록은 보여주지 않는다 — 같은 와이파이에서도 접속되므로.
        self.send_error(404)
        return None


class Server(http.server.ThreadingHTTPServer):
    # 요청마다 스레드를 띄워 폰트/CSS/JS 등 동시에 몰리는 요청을 함께 처리한다.
    # 윈도우의 SO_REUSEADDR는 이미 쓰고 있는 포트에도 겹쳐 열려 버려서, 두 번 켜면 서로 엉킨다.
    allow_reuse_address = sys.platform != 'win32'


class DualStackServer(Server):
    # 'localhost'가 IPv6(::1)로 먼저 풀리는 PC에서도 바로 열리도록 IPv6·IPv4를 함께 받는다.
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def lan_ip():
    # 실제로 패킷을 보내지 않고, 이 PC가 와이파이에서 쓰는 주소만 알아낸다.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    # 미리보기 도구처럼 출력이 파이프로 나갈 때 윈도우가 한글을 cp949로 내보내 깨지지 않게 한다.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except AttributeError:
            pass

    root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)

    # ''(모든 주소)로 열어야 같은 와이파이의 휴대폰에서도 접속된다. 처음 실행할 때 방화벽 허용 창이
    # 뜨면 '허용'을 누른다(거절해도 이 PC에서 여는 건 된다).
    in_use = (errno.EADDRINUSE, getattr(errno, 'WSAEADDRINUSE', None))
    try:
        try:
            httpd = DualStackServer(('::', PORT), handler)
        except OSError as e:
            # 포트가 이미 쓰이는 중이면 IPv4로 다시 열지 않는다 — 윈도우는 그걸 막지 않아 서버가 두 개 뜬다.
            if e.errno in in_use:
                raise
            httpd = Server(('', PORT), handler)  # IPv6를 못 쓰는 PC
    except OSError as e:
        print(f'서버를 시작하지 못했습니다. 이미 실행 중인지 확인해 주세요: http://localhost:{PORT}/  ({e})', flush=True)
        sys.exit(1)

    print(f'로컬 서버 시작: http://localhost:{PORT}/  (폴더: {root})', flush=True)
    ip = lan_ip()
    if ip:
        print(f'같은 와이파이의 휴대폰에서: http://{ip}:{PORT}/', flush=True)
    print('(이 창을 닫으면 서버가 멈춥니다. 종료하려면 Ctrl+C)', flush=True)

    with httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

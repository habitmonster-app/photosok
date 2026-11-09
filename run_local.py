"""Local development only; no install or build required."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

def main():
    parser = argparse.ArgumentParser(description="사진쏙 개발 서버")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
            print(f"앱: http://localhost:{args.port}/dist/", flush=True)
            print(f"검사: http://localhost:{args.port}/tests/", flush=True)
            print("종료: Ctrl+C | 개발 전용, 외부 네트워크에는 공개하지 않습니다.", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    except OSError as error:
        parser.exit(1, f"서버 시작 실패: {error}. --port 8001 등으로 바꿔 보세요.\n")

if __name__ == "__main__":
    main()

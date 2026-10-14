#!/bin/bash
# easy3D 미리보기(맥) — 더블클릭. 서버를 켜고 브라우저로 http://localhost:8099/ 를 연다.
# 이 창을 닫거나 Ctrl+C 를 누르면 서버가 꺼진다. 윈도우에서는 serve.bat 을 쓴다.
cd "$(dirname "$0")"
URL="http://localhost:8099/"

open_browser() {
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    open "$URL"
  fi
}

if curl -s -o /dev/null "$URL"; then
  echo "서버가 이미 켜져 있음 → 브라우저만 엽니다."
  open_browser
  exit 0
fi
python3 serve.py &
PID=$!
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "$URL" && break
  sleep 0.5
done
open_browser
wait $PID

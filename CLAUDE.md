# easy3D 규칙

## 글씨체(한글 폰트)를 고르는 칸 — 항상 공용 글씨체 목록을 쓴다 (2026-11-25 선생님)
글씨체를 고르는 칸이 있는 페이지는 기본 `<select>`를 쓰지 않고 **`assets/js/font-picker.js`(FontPicker)** 를 쓴다.
새 갤러리를 만들거나 기존 페이지에 글씨체 칸을 더할 때도 같다. (갤러리9에서 만든 것을 옮긴 것 — 지금 갤러리5·6·8·9가 씀)

- 모양(선생님이 정함): 이름을 그 글씨체 모양으로(한국어 화면 = 한글 이름, 영어 화면 = 영어 이름), 검색칸 없음,
  목록 맨 아래에 '내 폰트 파일 업로드...'·'내 폴더 가져오기...' 고정, 휴대폰도 같은 목록, 내 파일·폴더 글씨체는 파일 안의 이름으로.
- 불러오기 순서: `font-core.js`·`lang-core.js`·`font-list.js` 다음에 `font-name-previews.js` → `font-picker.js`.
- 칸 하나는 `FontPicker.create(holder, { value: '파일이름.ttf', onChange: function (key, font) { … } })`.
  `key`는 FontCore 캐시 키(사이트 글씨체 = 파일 이름, 내 파일 = `upload:…`), `font`는 opentype 글꼴. 초기화는 `.setValue(key)`.
  페이지 시작 끝에 `FontPicker.restoreSavedFolder()` 한 번(지난번 폴더, 모든 갤러리 공용 기억).
- 글상자처럼 화면에도 그 글씨체로 그려야 하면 `FontPicker.configure({ cssPrefix })` + `attach()`(갤러리9 참고).
- `font-list.js`에 글씨체를 더하거나 이름을 바꾸면 `python3 tools/make-font-name-previews.py`로 이름 그림을 다시 만들어 함께 커밋.
- 목록 모양·동작을 바꿀 때는 `font-picker.js` 한 곳만 고친다(페이지마다 따로 고치지 않는다).

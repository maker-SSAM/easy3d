# 초등 파라메트릭 디자인 스튜디오

초등학생을 위한 로그인 없는 웹 파라메트릭 디자인 도구입니다. 이름표, 상자 같은 간단한 디자인을 슬라이더로 조절해서 만들고, 3D 프린팅용 STL 파일로 내려받을 수 있습니다.

## 사용 방법

1. [index.html](index.html)을 웹 브라우저에서 엽니다 (별도 설치나 빌드 과정이 필요 없습니다).
2. 갤러리에서 원하는 디자인 카드를 클릭해 편집 페이지로 이동합니다.
3. 왼쪽 컨트롤 패널에서 크기, 글자 등 값을 조절하며 오른쪽 3D 화면에서 실시간으로 확인합니다.
4. "STL 다운로드" 버튼을 눌러 3D 프린팅에 사용할 STL 파일을 저장합니다.

## 폴더 구조

```
index.html              갤러리(첫 화면) — 디자인 목록을 카드로 보여주고 편집 페이지로 연결
designs/                 디자인별 편집 페이지 (예: nameplate-box.html)
assets/js/core.js        모든 편집 페이지가 공유하는 뷰어 셸 + Three.js 스캐폴드
assets/css/core.css      모든 편집 페이지가 공유하는 레이아웃/스타일
```

편집 페이지들은 `core.js`의 `ParametricCore.mountEditorShell()`로 컨트롤 패널/뷰어 뼈대를 동일하게 생성한 뒤, 그 위에 디자인별 컨트롤과 모델링 로직만 얹는 구조입니다. 그래서 디자인이 늘어나도 모든 편집 화면의 레이아웃이 항상 통일되어 있습니다.

## 새 디자인 추가하는 법

1. `designs/` 아래에 새 HTML 파일을 만들고, `assets/css/core.css`와 `assets/js/core.js`를 참조합니다 (`designs/nameplate-box.html` 참고).
2. `ParametricCore.mountEditorShell(rootEl)`로 셸을 만들고, 반환된 `controlsEl`에 디자인별 컨트롤 UI를 채웁니다.
3. `ParametricCore.initViewer()` / `setupResizer()` / `bindViewCube()` / `exportSTL()`을 이용해 뷰어와 STL 다운로드를 연결합니다.
4. `index.html`의 `designs` 배열에 `{ title, description, url, buildPreviewScene }` 항목을 추가하면 갤러리 카드가 자동으로 생깁니다.

## 사용 기술

- [Three.js](https://threejs.org/) — 3D 렌더링 및 STL 내보내기(`STLExporter`)
- [opentype.js](https://opentype.js.org/) — 브라우저에서 TTF 폰트의 벡터 패스를 직접 추출해 한글 글자를 3D 도형으로 변환

## 요구 사항

별도의 설치나 서버 없이 최신 웹 브라우저(Chrome, Edge 등)만 있으면 바로 사용할 수 있습니다.

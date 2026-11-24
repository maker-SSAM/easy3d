// 3D 글자에 쓰는 폰트 목록 — 폰트를 고르는 모든 디자인 페이지(갤러리5/6/8/9, festival01/02)가
// 이 목록 하나를 같이 쓴다. 폰트를 넣거나 뺄 때는 이 파일만 고치면 된다.
//   - label: 페이지의 폰트 선택 칸에 보이는 이름(영어)
//   - koLabel: 한글 이름 — 갤러리9 글씨체 목록이 한국어 화면에서 쓴다. 글씨체 파일 안의 한글 이름(name 표)을
//     그대로 옮겼고, 파일에 한글 이름이 없는 Noto 두 종만 직접 정함(2026-11-24).
//     label·koLabel을 바꾸면 tools/make-font-name-previews.py를 다시 실행한다(이름 그림).
//   - file: assets/fonts/ 안의 파일 이름 (.ttf 또는 .otf — opentype.js가 woff2는 못 읽는다)
// 목록 순서가 곧 선택 칸의 순서다. 페이지마다 처음 골라져 있는 폰트(기본값)는 각 페이지에서
// 파일 이름으로 찾아 정하므로(FONT_OPTIONS.findIndex(f => f.file === '...')), 기본값으로 쓰는
// 폰트를 빼거나 파일 이름을 바꾸면 그 페이지의 기본값도 함께 고쳐야 한다.
// 새 폰트 페이지를 만들 때는 font-core.js 다음에 이 파일을 불러오면 된다.
window.FontList = {
    OPTIONS: [
        { label: 'Noto Serif KR', koLabel: '노토 세리프 KR', file: 'NotoSerifKR-Black.ttf' },
        { label: 'Noto Sans KR', koLabel: '노토 산스 KR', file: 'NotoSansKR-Black.ttf' },
        { label: 'Paperlogy', koLabel: '페이퍼로지', file: 'Paperlogy-8ExtraBold.ttf' },
        { label: 'Cafe24 Ohsquare', koLabel: '카페24 아네모네', file: 'Cafe24Ohsquare-v2.0.ttf' },
        { label: 'Cafe24 Ssurround', koLabel: '카페24 써라운드', file: 'Cafe24Ssurround-v2.0.ttf' },
        { label: 'Mona12', koLabel: '모나12', file: 'Mona12-Bold.ttf' },
        { label: 'Cafe24 Proup', koLabel: '카페24 프로업', file: 'Cafe24PROUP.ttf' },
        // 아래 5종은 2026-10-16 추가 (fonts_OFL에서 가져옴, Mulmaru는 woff2를 ttf로 변환)
        { label: 'Mulmaru', koLabel: '물마루', file: 'Mulmaru.ttf' },
        { label: 'Ghanachocolate', koLabel: '가나초콜릿', file: 'Ghanachocolate.ttf' },
        { label: 'Hakgyoansim Eohangkkumigi B', koLabel: '학교안심 어항꾸미기 B', file: 'Hakgyoansim_EohangkkumigiB.ttf' },
        { label: 'Hakgyoansim TTeokbokki B', koLabel: '학교안심 떡볶이 B', file: 'Hakgyoansim_TteokbokkiB.ttf' },
        { label: 'KCCMurukmuruk', koLabel: 'KCC무럭무럭', file: 'KCCMurukmuruk.ttf' }
    ],
    // 이모지 전용 폰트 (선택 칸에는 나오지 않고 이모지 줄·이모지 대체 글꼴로만 쓴다)
    EMOJI_FILE: 'NotoEmoji-SemiBold.ttf'
};

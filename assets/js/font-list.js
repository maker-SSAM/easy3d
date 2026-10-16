// 3D 글자에 쓰는 폰트 목록 — 폰트를 고르는 모든 디자인 페이지(갤러리5/6/8/9, festival01/02)가
// 이 목록 하나를 같이 쓴다. 폰트를 넣거나 뺄 때는 이 파일만 고치면 된다.
//   - label: 페이지의 폰트 선택 칸에 보이는 이름
//   - file: assets/fonts/ 안의 파일 이름 (.ttf 또는 .otf — opentype.js가 woff2는 못 읽는다)
// 목록 순서가 곧 선택 칸의 순서다. 페이지마다 처음 골라져 있는 폰트(기본값)는 각 페이지에서
// 파일 이름으로 찾아 정하므로(FONT_OPTIONS.findIndex(f => f.file === '...')), 기본값으로 쓰는
// 폰트를 빼거나 파일 이름을 바꾸면 그 페이지의 기본값도 함께 고쳐야 한다.
// 새 폰트 페이지를 만들 때는 font-core.js 다음에 이 파일을 불러오면 된다.
window.FontList = {
    OPTIONS: [
        { label: 'Noto Serif KR', file: 'NotoSerifKR-Black.ttf' },
        { label: 'Noto Sans KR', file: 'NotoSansKR-Black.ttf' },
        { label: 'Paperlogy', file: 'Paperlogy-8ExtraBold.ttf' },
        { label: 'Cafe24 Ohsquare', file: 'Cafe24Ohsquare-v2.0.ttf' },
        { label: 'Cafe24 Ssurround', file: 'Cafe24Ssurround-v2.0.ttf' },
        { label: 'Mona12', file: 'Mona12-Bold.ttf' },
        { label: 'Cafe24 Proup', file: 'Cafe24PROUP.ttf' },
        // 아래 5종은 2026-10-16 추가 (fonts_OFL에서 가져옴, Mulmaru는 woff2를 ttf로 변환)
        { label: 'Mulmaru', file: 'Mulmaru.ttf' },
        { label: 'Ghanachocolate', file: 'Ghanachocolate.ttf' },
        { label: 'Hakgyoansim Eohangkkumigi B', file: 'Hakgyoansim_EohangkkumigiB.ttf' },
        { label: 'Hakgyoansim TTeokbokki B', file: 'Hakgyoansim_TteokbokkiB.ttf' },
        { label: 'KCCMurukmuruk', file: 'KCCMurukmuruk.ttf' }
    ],
    // 이모지 전용 폰트 (선택 칸에는 나오지 않고 이모지 줄·이모지 대체 글꼴로만 쓴다)
    EMOJI_FILE: 'NotoEmoji-SemiBold.ttf'
};

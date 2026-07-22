// 여러 파라메트릭 디자인 페이지가 공유하는 "폰트 파일 → 글자 윤곽선 점 배열" 모듈.
// 여기서는 opentype.js로 글자 하나하나의 하위경로(subpath)를 뽑아내는 부분까지만 담당한다.
// 그 점들을 가지고 실제로 무엇을 만들지(2D 합치기+압출, JSCAD union 등)는 이 모듈을 쓰는
// 각 디자인 페이지가 알아서 결정한다 — 그 부분은 갤러리마다 실험 중인 핵심 차이라 여기서
// 강제로 통일하지 않는다.
// 이 파일을 쓰는 페이지는 head에서 three.js와 opentype.js를 먼저 로드해야 한다.
window.FontCore = (function () {
    const fontCache = {};

    // 폰트 폴더 위치를 이 스크립트 파일 자체의 경로 기준으로 계산한다 — designs/ 아래
    // 페이지(상대경로 ../assets/fonts/)든 프로젝트 루트의 index.html(상대경로 assets/fonts/)이든
    // 어디서 이 파일을 불러오든 항상 올바른 위치를 가리키게 하기 위함.
    const scriptSrc = document.currentScript ? document.currentScript.src : '';
    const fontsBaseUrl = scriptSrc ? scriptSrc.replace(/assets\/js\/font-core\.js.*$/, 'assets/fonts/') : '../assets/fonts/';

    // 폰트 파일을 로드하고 캐시한다 (같은 파일을 다시 요청하면 재로딩 없이 즉시 콜백).
    function loadFont(file, callback) {
        if (fontCache[file]) { callback(fontCache[file]); return; }
        opentype.load(fontsBaseUrl + file, function (err, font) {
            if (err) { console.error('폰트 로딩 실패:', file, err); return; }
            fontCache[file] = font;
            callback(font);
        });
    }

    // 점이 {x,y} 객체(THREE.Vector2 등)든 [x,y] 배열이든 좌표 두 개를 뽑아낸다 —
    // 갤러리마다 점을 다루는 방식이 달라서(gallery-1/nameplate-box는 Vector2,
    // jscad-core는 [x,y] 배열) 호출부를 안 바꾸고도 양쪽 다 지원하기 위함.
    function coord(p) { return Array.isArray(p) ? p : [p.x, p.y]; }

    // 레이캐스팅(ray casting)으로 점이 다각형 안에 있는지 판별.
    function isPointInPolygon(point, polygon) {
        const [px, py] = coord(point);
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = coord(polygon[i]);
            const [xj, yj] = coord(polygon[j]);
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // opentype 글자 패스 명령을 하위경로(subpath)별 점 배열([x,y])로 분리.
    function extractGlyphContours(commands, curveSegments) {
        const subpaths = [];
        let current = null;
        commands.forEach(cmd => {
            if (cmd.type === 'M') { current = { commands: [cmd] }; subpaths.push(current); }
            else if (current) current.commands.push(cmd);
        });
        return subpaths.map(sp => {
            const path = new THREE.Path();
            sp.commands.forEach(cmd => {
                if (cmd.type === 'M') path.moveTo(cmd.x, -cmd.y);
                else if (cmd.type === 'L') path.lineTo(cmd.x, -cmd.y);
                else if (cmd.type === 'Q') path.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
                else if (cmd.type === 'C') path.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y);
            });
            let points = path.getPoints(curveSegments || 8);
            // 평면화된 점을 THREE.Path에 다시 한번 통과시켜 정규화한다 — 실제로 겪은 문제:
            // 이 재정규화 없이 바로 쓰면 특정 글자(뾰족한 꼭짓점이 있는 자모 등)에서
            // THREE.ShapeUtils.triangulateShape가 이상한 삼각형을 만드는 경우가 있었는데,
            // 이렇게 한 번 더 통과시키면 사라진다.
            points = new THREE.Path(points).getPoints(curveSegments || 8);
            return points.map(p => [p.x, p.y]);
        }).filter(pts => pts.length >= 3);
    }

    // 이미 로드된 폰트를 캐시에서 동기적으로 꺼내온다 (없으면 undefined) — 여러 폰트를
    // 미리 다 로드해두고 이름으로 바로 꺼내 쓰는 페이지(gallery-1의 3줄 텍스트 등)를 위한 것.
    function getFont(file) {
        return fontCache[file];
    }

    // 글자 하나의 윤곽선(x=0 기준 로컬 좌표, 즉 그 글자의 자간/배치와 무관한 순수 모양)을
    // (폰트파일, 글자, 크기, 곡선세그먼트) 키로 캐싱한다. 텍스트를 다루는 여러 갤러리(자간/장평
    // 조정 슬라이더가 있는 페이지들)가 공유해서 쓴다 — 자간/장평처럼 "배치(위치)"만 바뀌고
    // 글자 "모양" 자체는 그대로인 경우, opentype.js로 패스를 다시 뽑고 곡선을 다시 근사하는
    // 비용(글자 수가 많을수록, 특히 획이 복잡한 한글/한자일수록 커짐)을 반복하지 않기 위함.
    // 캐시된 배열은 절대 직접 변형하지 않는다(다른 호출이 같은 캐시를 계속 재사용하므로) —
    // buildCenteredContours()가 쓸 때마다 새 배열로 복제해서 위치를 옮긴다.
    const glyphShapeCache = new Map();

    function getGlyphShape(fontFile, font, ch, size, curveSegments) {
        const key = fontFile + '|' + ch + '|' + size + '|' + curveSegments;
        let cached = glyphShapeCache.get(key);
        if (cached) return cached;

        const glyph = font.charToGlyph(ch);
        if (!glyph) {
            cached = { contours: [], advance: 0 };
        } else {
            const path = glyph.getPath(0, 0, size); // x=0 기준 로컬 윤곽선
            cached = {
                contours: extractGlyphContours(path.commands || [], curveSegments),
                advance: glyph.advanceWidth / font.unitsPerEm * size
            };
        }
        glyphShapeCache.set(key, cached);
        return cached;
    }

    // 텍스트 한 줄 전체의 글자 윤곽선을 (x=0,y=0 중심 정렬해서) 뽑아낸다 — OpenSCAD
    // text()의 halign="center", valign="center"에 대응(가로뿐 아니라 세로도 중심 정렬).
    // curveSegments: 곡선 하나를 몇 개의 직선 조각으로 근사할지 — 호출부(미리보기/내보내기)가
    // 원하는 해상도를 넘겨준다.
    function buildCenteredContours(text, font, fontFile, size, spacingMultiplier, curveSegments) {
        const contours = [];
        let currentX = 0;
        Array.from(text).forEach(function (ch) {
            const glyphShape = getGlyphShape(fontFile, font, ch, size, curveSegments);
            glyphShape.contours.forEach(function (localPts) {
                // 캐시된 로컬 좌표를 그대로 쓰지 않고 새 배열로 복제하면서 현재 위치로 옮긴다.
                contours.push(localPts.map(function (p) { return [p[0] + currentX, p[1]]; }));
            });
            currentX += glyphShape.advance * spacingMultiplier;
        });
        if (!contours.length) return contours;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        contours.forEach(function (pts) {
            pts.forEach(function (p) {
                if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
                if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
            });
        });
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        contours.forEach(function (pts) { pts.forEach(function (p) { p[0] -= cx; p[1] -= cy; }); });
        return contours;
    }

    return {
        loadFont: loadFont,
        getFont: getFont,
        isPointInPolygon: isPointInPolygon,
        extractGlyphContours: extractGlyphContours,
        getGlyphShape: getGlyphShape,
        buildCenteredContours: buildCenteredContours
    };
})();

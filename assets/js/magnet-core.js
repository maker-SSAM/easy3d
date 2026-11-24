// 자석 홈 — 이름표·표지판 바닥판에 원형 자석을 넣을 홈을 만든다(갤러리5·9가 같이 쓴다, 2026-11-24).
//   열린 홈(open): 바닥판 뒷면에서 판 홈. 출력 뒤 자석을 끼우거나 붙인다.
//   숨긴 홈(hidden): 바닥판 속에 갇힌 홈(아래 0.2mm 한 층, 위 0.6mm). 출력 중 '일시정지'를 걸고 자석을 넣은 뒤 이어서 출력한다.
// 위치는 바닥판 안쪽(가장자리·키링 구멍에서 벽 두께만큼 떨어진 곳)에 자동으로 고르게 놓고, 개수만 고른다.
// 자석 크기는 지금 6 × 2mm 하나(선생님). 크기를 늘리려면 SIZES에 더하고 페이지에 고르는 칸을 둔다.
// 이 파일은 font-core.js(FontCore.isPointInPolygon)와 manifold-core.js(ManifoldCore) 다음에 쓰인다.
window.MagnetCore = (function () {
    const SIZES = [{ d: 6, t: 2 }];       // 자석 지름·두께(mm)
    const CLEARANCE = 0.2;                // 홈 지름 여유(자석이 잘 들어가게)
    const DEPTH_CLEARANCE = 0.2;          // 홈 깊이 여유
    const SKIN = 0.6;                     // 홈 위(앞면 쪽)로 남길 최소 두께(층 3개, 0.2mm 층 기준) — 앞면이 뚫리지 않게
    const SKIN_BOTTOM = 0.2;              // 숨긴 홈 아래(뒷면 쪽)는 한 층만 — 자석이 벽(철판)에 가까울수록 잘 붙는다(2026-11-24 선생님)
    const WALL = 1.0;                     // 홈과 바닥판 가장자리·키링 구멍·다른 홈 사이 최소 벽
    const LAYER = 0.2;                    // 일시정지 높이를 층 높이에 맞추는 기준(0.2mm 층)

    function ceilTo(v, step) { return Math.ceil(v / step - 1e-9) * step; }
    function round2(v) { return Math.round(v * 100) / 100; }

    // 홈 크기와 높이. mode: 'open' | 'hidden'. baseThick: 바닥판 두께(mm).
    // 돌려주는 값: { r, depth, z0, needBase, ok, pauseZ } — z0는 홈 바닥 높이(열린 홈은 0, 뒷면에서 뚫음)
    function spec(mode, baseThick, size) {
        const s = size || SIZES[0];
        const r = (s.d + CLEARANCE) / 2;
        const depth = round2(ceilTo(s.t + DEPTH_CLEARANCE, LAYER));
        if (mode === 'hidden') {
            const z0 = SKIN_BOTTOM;
            const needBase = round2(SKIN_BOTTOM + depth + SKIN);
            return { r: r, depth: depth, z0: z0, needBase: needBase, ok: baseThick >= needBase - 1e-6, pauseZ: round2(z0 + depth), size: s };
        }
        const needBase = round2(depth + SKIN);
        return { r: r, depth: depth, z0: 0, needBase: needBase, ok: baseThick >= needBase - 1e-6, pauseZ: null, size: s };
    }

    // 바닥판 안쪽에 자석 n개 자리를 고른다.
    // baseXS: 바닥판 단면(CrossSection), avoid: 피할 원 [{ x, y, r }](키링 구멍 등), r: 홈 반지름.
    // 돌려주는 값: [[x, y], …] (자리가 모자라면 n개보다 적을 수 있다)
    function placePoints(baseXS, avoid, n, r) {
        if (!baseXS || baseXS.isEmpty() || n < 1) return [];
        const scratch = [];
        function track(m) { scratch.push(m); return m; }
        try {
            // 홈 가장자리에서 바닥판 가장자리까지 WALL 이상 남도록 안쪽으로 줄인 영역 = 홈 중심이 올 수 있는 곳
            let safe = track(baseXS.offset(-(r + WALL), 'Round', 2, 32));
            (avoid || []).forEach(function (c) {
                const hole = track(track(ManifoldCore.circleXS(c.r + r + WALL, 48)).translate([c.x, c.y]));
                safe = track(safe.subtract(hole));
            });
            if (safe.isEmpty()) return [];
            const polys = track(safe.simplify(0.05)).toPolygons();
            if (!polys.length) return [];
            const bb = safe.bounds();
            const x0 = bb.min[0], y0 = bb.min[1], w = bb.max[0] - x0, h = bb.max[1] - y0;
            const inside = function (pt) {
                let c = 0;
                polys.forEach(function (poly) { if (FontCore.isPointInPolygon(pt, poly)) c++; });
                return c % 2 === 1;
            };
            // 놓을 목표점: 1개 = 가운데, 2·3개 = 가로로 고르게, 4개 = 2×2(가로로 아주 길면 한 줄)
            const cy = y0 + h / 2;
            let targets;
            if (n === 1) targets = [[x0 + w / 2, cy]];
            else if (n === 4 && w < h * 2.5) targets = [[x0 + w / 4, y0 + h / 4], [x0 + 3 * w / 4, y0 + h / 4], [x0 + w / 4, y0 + 3 * h / 4], [x0 + 3 * w / 4, y0 + 3 * h / 4]];
            else targets = Array.from({ length: n }, function (_, i) { return [x0 + w * (i + 0.5) / n, cy]; });
            // 영역 안의 후보 점(격자)에서 목표점에 가장 가깝고 다른 홈과 떨어진 점을 고른다
            const step = Math.max(0.5, Math.max(w, h) / 80);
            const cands = [];
            for (let x = x0; x <= x0 + w + 1e-9; x += step) {
                for (let y = y0; y <= y0 + h + 1e-9; y += step) {
                    if (inside([x, y])) cands.push([x, y]);
                }
            }
            const minGap = 2 * r + WALL;
            const chosen = [];
            targets.forEach(function (t) {
                let best = null, bestD = Infinity;
                cands.forEach(function (c) {
                    for (let i = 0; i < chosen.length; i++) {
                        if (Math.hypot(c[0] - chosen[i][0], c[1] - chosen[i][1]) < minGap) return;
                    }
                    const d = Math.hypot(c[0] - t[0], c[1] - t[1]);
                    if (d < bestD) { bestD = d; best = c; }
                });
                if (best) chosen.push(best);
            });
            return chosen;
        } finally {
            scratch.forEach(function (m) { if (m && typeof m.delete === 'function') m.delete(); });
        }
    }

    // 홈 모양 입체(원기둥들을 합친 것). 열린 홈은 뒷면 아래에서부터 뚫는다(아래로 1mm 더).
    // track: 만든 입체를 나중에 지우려고 넘겨받는 함수.
    // 돌려주는 값: { solid, ids } — ids는 원기둥마다의 originalID(홈 안쪽 면에 바닥판 색을 칠할 때 쓴다)
    function pocketSolid(points, sp, track, segments) {
        if (!points.length) return null;
        let all = null;
        const ids = [];
        points.forEach(function (pt) {
            const xs = track(track(ManifoldCore.circleXS(sp.r, segments || 48)).translate(pt));
            const bottom = sp.z0 > 0 ? sp.z0 : -1;
            const height = sp.z0 > 0 ? sp.depth : sp.depth + 1;
            const raw = track(ManifoldCore.extrudeXS(xs, height));
            ids.push(raw.originalID());
            const cyl = track(ManifoldCore.translateY(raw, bottom));
            all = all ? track(ManifoldCore.union(all, cyl)) : cyl;
        });
        return { solid: all, ids: ids };
    }

    // 화면 안내 글(한국어, 영어)
    function note(mode, sp, placed, wanted, pick) {
        if (!sp.ok) {
            return pick('바닥판이 얇아 홈을 만들지 않았습니다. ' + (mode === 'hidden' ? '숨긴 홈' : '열린 홈') + '은 바닥판 두께가 ' + sp.needBase + 'mm 이상이어야 합니다.',
                'The base plate is too thin for the pocket: it needs at least ' + sp.needBase + ' mm.');
        }
        const parts = [];
        parts.push(pick('자석 ' + sp.size.d + '×' + sp.size.t + 'mm (홈 ' + (sp.r * 2).toFixed(1) + '×' + sp.depth.toFixed(1) + 'mm)',
            'Magnet ' + sp.size.d + '×' + sp.size.t + ' mm (pocket ' + (sp.r * 2).toFixed(1) + '×' + sp.depth.toFixed(1) + ' mm)'));
        if (placed < wanted) parts.push(pick('자리가 모자라 ' + placed + '개만 넣었습니다.', 'Only ' + placed + ' fit.'));
        if (mode === 'hidden' && placed > 0) {
            parts.push(pick('슬라이서에서 ' + sp.pauseZ.toFixed(1) + 'mm 높이 층을 인쇄하기 전에 일시정지를 넣고, 멈추면 자석을 넣으세요(층 높이 0.2mm 기준, 자석 방향을 맞춰 넣기).',
                'In the slicer, add a pause before the layer at ' + sp.pauseZ.toFixed(1) + ' mm and insert the magnets when it stops (0.2 mm layers).'));
        }
        return parts.join(' ');
    }

    return { SIZES: SIZES, spec: spec, placePoints: placePoints, pocketSolid: pocketSolid, note: note };
})();

// 자석 홈 — 이름표·표지판 바닥판에 원형 자석을 넣을 홈을 만든다(갤러리5·9가 같이 쓴다, 2026-11-24).
//   열린 홈(open): 바닥판 뒷면에서 판 홈. 출력 뒤 자석을 끼우거나 붙인다.
//   숨긴 홈(hidden): 바닥판 속에 갇힌 홈(아래 0.2mm 한 층, 위 0.6mm). 출력 중 '일시정지'를 걸고 자석을 넣은 뒤 이어서 출력한다.
// 위치는 바닥판 안쪽(가장자리에서 2mm, 키링 구멍에서 1mm 떨어진 곳)에 가장자리 쪽으로 자동으로 고르게 놓고, 개수(1~8)만 고른다.
// 자석 크기는 지금 6 × 2mm 하나(선생님). 크기를 늘리려면 SIZES에 더하고 페이지에 고르는 칸을 둔다.
// 이 파일은 font-core.js(FontCore.isPointInPolygon)와 manifold-core.js(ManifoldCore) 다음에 쓰인다.
window.MagnetCore = (function () {
    const SIZES = [{ d: 6, t: 2 }];       // 자석 지름·두께(mm)
    const CLEARANCE = 0.2;                // 홈 지름 여유(자석이 잘 들어가게)
    const DEPTH_CLEARANCE = 0.2;          // 홈 깊이 여유
    const SKIN = 0.6;                     // 홈 위(앞면 쪽)로 남길 최소 두께(층 3개, 0.2mm 층 기준) — 앞면이 뚫리지 않게
    const SKIN_BOTTOM = 0.2;              // 숨긴 홈 아래(뒷면 쪽)는 한 층만 — 자석이 벽(철판)에 가까울수록 잘 붙는다(2026-11-24 선생님)
    const WALL = 1.0;                     // 홈과 키링 구멍·다른 홈 사이 최소 벽
    const EDGE_WALL = 2.0;                // 홈과 바닥판 바깥 가장자리 사이 벽 — 자리는 가장자리 쪽으로 붙이되 테두리가 너무 얇지 않게
    const MAX_COUNT = 8;
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
            n = Math.min(n, MAX_COUNT);
            // 홈 가장자리에서 바닥판 가장자리까지 EDGE_WALL 이상 남도록 안쪽으로 줄인 영역 = 홈 중심이 올 수 있는 곳
            let safe = track(baseXS.offset(-(r + EDGE_WALL), 'Round', 2, 32));
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
            // 영역 안의 후보 점(격자). 후보 점은 격자 칸의 한가운데 — 좌우·위아래가 똑같고, 경계선 위에 놓이지 않는다
            // (경계선 위의 점은 안/밖 판정이 왼쪽·오른쪽에서 달라 좌우 자리가 1.6mm 어긋났다).
            const step = Math.max(0.4, Math.max(w, h) / 120);
            const nx = Math.max(1, Math.ceil(w / step)), ny = Math.max(1, Math.ceil(h / step));
            const cands = [];
            const grid = [];                                     // grid[i][j] = 칸 (i, j)의 가운데가 영역 안인가
            for (let i = 0; i < nx; i++) {
                grid.push([]);
                for (let j = 0; j < ny; j++) {
                    const pt = [x0 + w * (i + 0.5) / nx, y0 + h * (j + 0.5) / ny];
                    const isIn = inside(pt);
                    grid[i].push(isIn);
                    if (isIn) cands.push(pt);
                }
            }
            // 놓을 목표점 — 가장자리 쪽으로, 끝에서 끝까지 고르게(2026-11-24 선생님이 정한 배치):
            //   1 = 가운데 · 2 = 가운데 줄 양 끝 · 3 = 가운데 줄 나란히 · 4 = 위 2·아래 2 · 5 = 위 2·아래 2 + 가운데
            //   6 = 위 3·아래 3 · 7 = 위 3·아래 3 + 가운데 · 8 = 위 4·아래 4
            //   두 줄이 들어갈 높이가 없으면(판이 아주 얇으면) 가운데 줄 하나에 n개. 세로로 긴 판은 가로·세로를 바꿔 같은 규칙.
            // 줄은 판을 감싸는 상자의 위·아래 끝이 아니라 '그 높이에서 판이 실제로 있는 가장 긴 구간'을 따른다
            // (2026-11-25 선생님: 글자 따라 판처럼 울퉁불퉁하면 상자 모서리가 판 밖 빈 곳이라, 가장 가까운 안쪽 점을 고르면
            //  한쪽 귀에 두 개가 몰렸다). 위 줄은 위쪽 절반, 아래 줄은 아래쪽 절반에서 가로로 그었을 때 판 안 구간이 가장 긴
            //  높이(거의 같으면 가장자리 쪽)를 고르고, 그 구간의 끝에서 끝까지 고르게 놓는다. 사각형 판은 어느 높이나 길이가
            //  같아 맨 가장자리 줄이 골라지므로 전과 같은 자리다.
            const tall = h > w * 1.2;
            const nA = tall ? ny : nx, nB = tall ? nx : ny;    // A = 긴 쪽(줄 방향), B = 짧은 쪽(줄 높이)
            const isIn = function (a, b) { return tall ? grid[b][a] : grid[a][b]; };
            const posA = function (a) { return tall ? y0 + h * (a + 0.5) / ny : x0 + w * (a + 0.5) / nx; };
            const posB = function (b) { return tall ? x0 + w * (b + 0.5) / nx : y0 + h * (b + 0.5) / ny; };
            const toXY = function (a, b) { return tall ? [b, a] : [a, b]; };
            // 줄 하나(높이 bPos)에서 판 안의 가장 긴 구간. 글자 사이 잘록한 곳처럼 홈 하나 자리(2r + 벽)보다 좁은 틈은
            // 끊긴 것으로 보지 않는다(그 틈에 걸린 목표점은 아래에서 가장 가까운 안쪽 점으로 옮겨진다). 넓게 떨어진 귀와
            // 몸통은 다른 구간 — 그래야 아래 줄이 위쪽 귀로 끌려가지 않는다.
            const gapCells = Math.floor((2 * r + WALL) / ((tall ? h / ny : w / nx)));
            const rows = [];
            const addRow = function (bPos, onAt) {
                let best = null, start = -1, last = -1;
                for (let a = 0; a <= nA; a++) {
                    const on = a < nA && onAt(a);
                    if (on) {
                        if (start < 0) start = a;
                        else if (a - last - 1 > gapCells) {     // 넓은 틈: 앞 구간을 닫고 새로 시작
                            if (!best || last - start > best.a1 - best.a0) best = { a0: start, a1: last };
                            start = a;
                        }
                        last = a;
                    }
                }
                if (start >= 0 && (!best || last - start > best.a1 - best.a0)) best = { a0: start, a1: last };
                if (best) rows.push({ b: bPos, lo: posA(best.a0), hi: posA(best.a1), len: posA(best.a1) - posA(best.a0) });
            };
            for (let b = 0; b < nB; b++) addRow(posB(b), function (a) { return isIn(a, b); });
            const midB = tall ? x0 + w / 2 : y0 + h / 2;
            // 정확히 가운데 높이의 줄도 하나 더(격자 칸 가운데만 쓰면 가운데 줄이 반 칸 아래로 어긋난다)
            addRow(midB, function (a) { return inside(toXY(posA(a), midB)); });
            if (!rows.length) return [];
            // s: 1 = 위 줄(위쪽 절반), 0 = 아래 줄(아래쪽 절반), 0.5 = 가운데 줄(어디서나, 가운데에 가까운 것)
            const pickRow = function (s) {
                const pool = rows.filter(function (rw) { return s === 1 ? rw.b >= midB : s === 0 ? rw.b <= midB : true; });
                if (!pool.length) return null;
                const maxLen = Math.max.apply(null, pool.map(function (rw) { return rw.len; }));
                // 이만큼 짧은 줄까지는 '거의 같은 길이'로 보고 가장자리 쪽을 고른다. 가운데 줄은 가운데에 있는 게 더 중요해서
                // 가장 긴 줄의 3/4까지 받아 준다(1개일 때 판 가운데에서 멀리 내려가지 않게).
                const tol = s === 0.5 ? Math.max(2 * step, 0.25 * maxLen) : Math.max(2 * step, 0.08 * maxLen);
                const near = pool.filter(function (rw) { return rw.len >= maxLen - tol; });
                const score = function (rw) { return s === 1 ? rw.b : s === 0 ? -rw.b : -Math.abs(rw.b - midB); };
                return near.reduce(function (p, q) { return score(q) > score(p) ? q : p; });
            };
            const lineOf = function (count, row) {              // 그 줄의 구간을 따라 count개(1개면 구간 한가운데)
                if (!row) return [];
                return Array.from({ length: count }, function (_, i) {
                    const u = count === 1 ? 0.5 : i / (count - 1);
                    return toXY(row.lo + u * (row.hi - row.lo), row.b);
                });
            };
            const PLAN = { 1: [[0.5, 1]], 2: [[0.5, 2]], 3: [[0.5, 3]], 4: [[1, 2], [0, 2]], 5: [[1, 2], [0, 2], [0.5, 1]],
                           6: [[1, 3], [0, 3]], 7: [[1, 3], [0, 3], [0.5, 1]], 8: [[1, 4], [0, 4]] };
            const topRow = pickRow(1), bottomRow = pickRow(0);
            // 위·아래 줄 홈이 서로 겹치지 않을 만큼(2r + 벽) 떨어져 있어야 두 줄
            const rowGap = 2 * r + WALL;
            const rowsFit = topRow && bottomRow && topRow.b - bottomRow.b >= rowGap;
            // 작은 키링처럼 판이 낮아 가장 긴 줄 둘이 너무 가까우면, 전처럼 상자의 위·아래 끝을 목표로 삼는다
            // (위·아래 끝 줄은 울퉁불퉁해서 짧게 끊기지만, 가장 가까운 안쪽 점으로 옮기면 양 끝에 잘 놓인다 — 2026-11-24 방식)
            const S = tall ? w : h;
            const boxLine = function (count, s) {
                return Array.from({ length: count }, function (_, i) {
                    const u = count === 1 ? 0.5 : i / (count - 1);
                    return tall ? [x0 + s * w, y0 + u * h] : [x0 + u * w, y0 + s * h];
                });
            };
            let targets;
            if (n >= 4 && !rowsFit && S >= rowGap) {
                targets = PLAN[n].reduce(function (all, row) {
                    return all.concat(row[0] === 0.5 ? lineOf(row[1], pickRow(0.5)) : boxLine(row[1], row[0]));
                }, []);
            } else if (n >= 4 && !rowsFit) targets = lineOf(n, pickRow(0.5));
            else targets = PLAN[n].reduce(function (all, row) {
                return all.concat(lineOf(row[1], row[0] === 1 ? topRow : row[0] === 0 ? bottomRow : pickRow(0.5)));
            }, []);
            // 후보 점 중 목표점에 가장 가깝고 다른 홈과 떨어진 점을 고른다
            // 목표점을 영역 끝에서 반 칸 안으로 당긴 점도 후보로 — 가운데·가운데 줄이 정확히 맞고, 경계선 위에 놓이지
            // 않아 좌우가 같다(끝에 놓인 목표점을 그대로 쓰면 왼쪽만 경계선 위 점이 '안'으로 판정됐다).
            const hx = w / nx / 2, hy = h / ny / 2;
            targets.forEach(function (t) {
                const pt = [Math.min(x0 + w - hx, Math.max(x0 + hx, t[0])), Math.min(y0 + h - hy, Math.max(y0 + hy, t[1]))];
                if (inside(pt)) cands.push(pt);
            });
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

    // 미리보기 전용 표시: 숨긴 홈은 판 속에 있어 화면에서 안 보이므로(2026-11-25 선생님), 홈 자리에 반투명 색 원기둥을
    // 그려 판·글자에 가려져도 비쳐 보이게 한다(depthTest 끔). three.js 메시라 받는 STL·3MF(Manifold로 따로 만듦)에는
    // 들어가지 않는다. 좌표: 단면 (x, y), 높이 h → three.js (x, h, -y) (manifold-core.js extrudeXS의 X축 -90도 회전과 같게).
    // 돌려주는 값: 메시 배열(userData.previewOnly = true, layerName = 'magnetMarker<번호>')
    const MARKER_COLOR = 0xe6007a;
    function previewMarkers(points, sp) {
        if (!window.THREE || !points || !points.length || !sp || !sp.ok) return [];
        return points.map(function (pt, i) {
            const geo = new THREE.CylinderGeometry(sp.r, sp.r, sp.depth, 40);
            const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pt[0], sp.z0 + sp.depth / 2, -pt[1]);
            mesh.renderOrder = 999;
            mesh.userData.previewOnly = true;
            mesh.userData.layerName = 'magnetMarker' + i;
            return mesh;
        });
    }

    // 화면 안내 글(한국어, 영어)
    function note(mode, sp, placed, wanted, pick) {
        if (!sp.ok) {
            return pick('바닥판이 얇아 홈을 만들지 않았습니다. ' + (mode === 'hidden' ? '숨긴 홈' : '열린 홈') + '은 바닥판 두께가 ' + sp.needBase + 'mm 이상이어야 합니다.',
                'The base plate is too thin for the pocket: it needs at least ' + sp.needBase + ' mm.');
        }
        // 자석 크기 글('자석 6×2mm (홈 …)')은 뺐다 — 크기는 '자석 홈 사용 (6×2mm)' 체크 칸에 적었다(2026-11-25 선생님).
        // 필요할 때만 나오는 알림(자리가 모자람·숨긴 홈 일시정지 높이)은 남긴다.
        const parts = [];
        if (placed < wanted) parts.push(pick('자리가 모자라 ' + placed + '개만 넣었습니다.', 'Only ' + placed + ' fit.'));
        if (mode === 'hidden' && placed > 0) {
            parts.push(pick('슬라이서에서 ' + sp.pauseZ.toFixed(1) + 'mm 높이 층을 인쇄하기 전에 일시정지를 넣고, 멈추면 자석을 넣으세요(층 높이 0.2mm 기준, 자석 방향을 맞춰 넣기).',
                'In the slicer, add a pause before the layer at ' + sp.pauseZ.toFixed(1) + ' mm and insert the magnets when it stops (0.2 mm layers).'));
        }
        return parts.join(' ');
    }

    return { SIZES: SIZES, MAX_COUNT: MAX_COUNT, spec: spec, placePoints: placePoints, pocketSolid: pocketSolid, previewMarkers: previewMarkers, note: note };
})();

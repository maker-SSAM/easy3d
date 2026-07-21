// JSCAD(@jscad/modeling) 기반 파라메트릭 디자인 페이지들이 공유하는 브릿지 코드.
// 폰트 파일 → 글자 윤곽선 추출 자체는 font-core.js(FontCore)가 맡고, 여기서는 그 윤곽선을
// JSCAD의 진짜 솔리드(geom2/geom3) 도형으로 만들고, JSCAD 결과물을 three.js가 그릴 수 있는
// BufferGeometry로 변환하는 부분만 담당한다.
// 이 파일을 쓰는 페이지는 head에서 three.js, @jscad/modeling, font-core.js를 먼저 로드해야 한다.
window.JscadCore = (function () {

    // ---------- 2D 다각형 유틸 (font-core.js로 이전, 여기서는 별칭만 유지) ----------
    const isPointInPolygon = FontCore.isPointInPolygon;
    const extractGlyphContours = FontCore.extractGlyphContours;

    // JSCAD의 geom2.fromPoints()는 점이 반시계 방향(CCW)이어야 정상 동작한다 — 시계 방향
    // 점을 넣으면 지오메트리가 "뒤집힌" 상태가 되어, 나중에 다른 솔리드와 union할 때
    // 오히려 상대편이 통째로 사라지는 심각한 버그가 생긴다(gallery-2에서 실제로 겪은 버그).
    // opentype.js에서 뽑은 폰트 외곽선은 방향이 문자마다 들쭉날쭉하므로, 신발끈 공식
    // (signed area)으로 판정해 항상 CCW가 되도록 강제한다.
    function signedArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[(i + 1) % points.length];
            area += (x1 * y2 - x2 * y1);
        }
        return area / 2;
    }
    function ensureCCW(points) {
        return signedArea(points) < 0 ? points.slice().reverse() : points;
    }
    function ensureCW(points) {
        return signedArea(points) > 0 ? points.slice().reverse() : points;
    }

    // three.js BufferGeometry(삼각형 목록)를 JSCAD geom3로 그대로 옮긴다.
    function threeGeometryToGeom3(bufferGeometry) {
        const { geom3, poly3 } = jscadModeling.geometries;
        const pos = bufferGeometry.attributes.position;
        const polys = [];
        function vert(i) { return [pos.getX(i), pos.getY(i), pos.getZ(i)]; }
        if (bufferGeometry.index) {
            const idx = bufferGeometry.index.array;
            for (let i = 0; i < idx.length; i += 3) {
                polys.push(poly3.fromPoints([vert(idx[i]), vert(idx[i + 1]), vert(idx[i + 2])]));
            }
        } else {
            for (let i = 0; i < pos.count; i += 3) {
                polys.push(poly3.fromPoints([vert(i), vert(i + 1), vert(i + 2)]));
            }
        }
        return geom3.create(polys);
    }

    // 폰트 굵은 글씨체(특히 Noto Sans/Serif KR Black)는 자모의 획 두 개가 서로 맞닿는 게
    // 아니라 실제로 겹치는(overlap) 경우가 있다(예: "스"의 ㅅ 두 획). 이런 하위경로들은
    // 각각 따로 보면 자기교차 없는 멀쩡한 폴리곤이라, 기존 방식대로 각각을 독립된
    // THREE.Shape로 만들어 압출하면 겹치는 부분에서 두 솔리드가 서로를 관통하게 되고,
    // 그 결과 JSCAD geom3로 변환했을 때 비매니폴드 모서리가 생겨 상자와 union할 때
    // 표면이 깨지는 문제가 있었다(실제로 Noto Sans/Serif KR의 "테스트"에서 겪음).
    // Clipper로 모든 하위경로를 한꺼번에 겹침 해소(self-union)하면, 겹치는 두 외곽선이
    // 하나로 합쳐지고 구멍(ㅇ, ㅁ 등)도 정상적으로 유지된다.
    const CLIPPER_SCALE = 10000;
    function cleanupOverlappingContours(contours) {
        if (typeof ClipperLib === 'undefined') return contours;
        const paths = contours.map(pts => pts.map(p => ({
            X: Math.round(p[0] * CLIPPER_SCALE),
            Y: Math.round(p[1] * CLIPPER_SCALE)
        })));
        const simplified = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero);
        return simplified
            .map(path => path.map(pt => [pt.X / CLIPPER_SCALE, pt.Y / CLIPPER_SCALE]))
            .filter(pts => pts.length >= 3);
    }

    // 하위경로 점 배열(외곽선+구멍 뒤섞인 상태) 하나를 z=0~height로 압출한 JSCAD geom3로
    // 만든다. 여러 가지 방식을 시도해보면서 겪은 문제들:
    //   1) 각 글자를 JSCAD geom2(fromPoints/union/subtract)로 만든 뒤 extrudeLinear()로
    //      압출 → geom2 왕복(fromPoints→toOutlines) 과정에서 좌표가 미세하게 정규화되며
    //      뾰족한 꼭짓점이 있는 자모(예: "스"의 ㅅ)에서 삼각분할이 깨져 표면에 삐죽 튀어나온
    //      삼각형이 생겼다.
    //   2) 캡/벽면 삼각형을 직접 손으로 조립 → 감김 방향을 아무리 맞줘도, 글자처럼 복잡한
    //      다중 하위경로 도형에서는 퇴화 삼각형·비매니폴드 모서리가 생기기 쉬웠고, 이 상태로
    //      상자와 union()하면 상자가 통째로(혹은 절반 넘게) 사라지는 심각한 버그가 났다.
    // 그래서 캡+벽면 조립 자체는 이미 수년간 검증된 THREE.ExtrudeGeometry에게 통째로
    // 맡기고(구멍 처리 포함, 항상 올바른 매니폴드를 만들어준다), 그 결과만 JSCAD geom3로
    // 옮긴다. JSCAD는 이렇게 만든 geom3를 상자와 union할 때만 사용한다.
    function contoursToGeom3(contours, height, curveSegments) {
        const { geom3 } = jscadModeling.geometries;
        if (!contours.length) return geom3.create();

        const cleanedContours = cleanupOverlappingContours(contours);
        const info = cleanedContours.map(pts => ({ points: pts, testPoint: pts[0], depth: 0 }));
        info.forEach(a => {
            info.forEach(b => {
                if (a !== b && isPointInPolygon(a.testPoint, b.points)) a.depth++;
            });
        });
        const outers = info.filter(c => c.depth % 2 === 0);
        const holes = info.filter(c => c.depth % 2 === 1);
        outers.forEach(o => { o.shape = new THREE.Shape(o.points.map(p => new THREE.Vector2(p[0], p[1]))); });
        holes.forEach(h => {
            let bestParent = null, bestArea = Infinity;
            outers.forEach(o => {
                if (isPointInPolygon(h.testPoint, o.points)) {
                    const area = Math.abs(signedArea(o.points));
                    if (area < bestArea) { bestArea = area; bestParent = o; }
                }
            });
            if (bestParent) bestParent.shape.holes.push(new THREE.Path(h.points.map(p => new THREE.Vector2(p[0], p[1]))));
        });
        if (!outers.length) return geom3.create();

        const shapes = outers.map(o => o.shape);
        const extrudeGeo = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false, curveSegments: curveSegments || 8 });
        return threeGeometryToGeom3(extrudeGeo);
    }

    // 텍스트 한 줄 전체를 하나의 JSCAD geom3로 생성 (글자 배치 + x=0 중심 정렬 + 압출까지
    // 한 번에). 각 글자의 원시 점 배열을 그대로 이어붙여 마지막에 딱 한 번만
    // contoursToGeom3로 삼각분할한다 — 글자별 union이 필요 없다.
    function buildTextGeom3(text, font, size, height, options) {
        const opts = options || {};
        const curveSegments = opts.curveSegments || 8;
        const scale = 1 / font.unitsPerEm * size;
        let currentX = 0;
        const allContours = [];

        const chars = Array.from(text); // 서로게이트 쌍(이모지 등) 문자가 반쪽씩 잘리지 않도록
        for (let i = 0; i < chars.length; i++) {
            const glyph = font.charToGlyph(chars[i]);
            if (!glyph) continue;
            const path = glyph.getPath(0, 0, size);
            const contours = extractGlyphContours(path.commands || [], curveSegments);
            contours.forEach(pts => {
                pts.forEach(p => { p[0] += currentX; });
                allContours.push(pts);
            });
            currentX += glyph.advanceWidth * scale;
        }

        if (!allContours.length) return null;

        // halign=center와 동일하게 전체 텍스트를 x=0 중심으로 이동
        let minX = Infinity, maxX = -Infinity;
        allContours.forEach(pts => pts.forEach(p => { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }));
        const centerX = (minX + maxX) / 2;
        allContours.forEach(pts => pts.forEach(p => { p[0] -= centerX; }));

        return contoursToGeom3(allContours, height, curveSegments);
    }

    // ---------- JSCAD geom3 → three.js BufferGeometry ----------
    // JSCAD의 불리언 연산 결과 폴리곤은 삼각형이 아닌 평면 다각형(볼록이 아닐 수도 있음)이라,
    // 각 폴리곤을 자신의 평면에 투영한 뒤 THREE.ShapeUtils.triangulateShape로 안전하게
    // 삼각분할한다(단순 팬 분할은 오목 다각형에서 잘못된 삼각형을 만들 수 있어 사용하지 않음).
    function newellNormal(verts) {
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < verts.length; i++) {
            const [x1, y1, z1] = verts[i];
            const [x2, y2, z2] = verts[(i + 1) % verts.length];
            nx += (y1 - y2) * (z1 + z2);
            ny += (z1 - z2) * (x1 + x2);
            nz += (x1 - x2) * (y1 + y2);
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
    }

    function geom3ToThreeGeometry(geom3Obj) {
        const { geom3 } = jscadModeling.geometries;
        const polys = geom3.toPolygons(geom3Obj);
        const positions = [];

        polys.forEach(poly => {
            const verts = poly.vertices;
            if (verts.length < 3) return;
            const normal = newellNormal(verts);
            const [nx, ny, nz] = normal;
            const helper = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            let ux = helper[1] * nz - helper[2] * ny;
            let uy = helper[2] * nx - helper[0] * nz;
            let uz = helper[0] * ny - helper[1] * nx;
            const ulen = Math.hypot(ux, uy, uz) || 1;
            ux /= ulen; uy /= ulen; uz /= ulen;
            const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;

            const origin = verts[0];
            const pts2d = verts.map(v => {
                const dx = v[0] - origin[0], dy = v[1] - origin[1], dz = v[2] - origin[2];
                return new THREE.Vector2(dx * ux + dy * uy + dz * uz, dx * vx + dy * vy + dz * vz);
            });
            const tris = THREE.ShapeUtils.triangulateShape(pts2d, []);
            tris.forEach(tri => {
                tri.forEach(idx => {
                    const v = verts[idx];
                    // JSCAD는 Z-up 좌표계(OpenSCAD와 동일) — three.js의 Y-up으로 축을 바꿔서 배치.
                    // (X,Y,Z)->(X,Z,-Y)로 매핑해야 진짜 "회전"이 되어 도형이 제대로 보인다.
                    // Y만 부호를 안 바꾸면 행렬식이 음수가 되어(거울반사) 좌우/상하로 뒤집혀
                    // 보이는 버그가 있었다(gallery-2에서 실제로 겪은 버그).
                    positions.push(v[0], v[2], -v[1]);
                });
            });
        });

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        return geo;
    }

    // JSCAD의 union() 등 불리언 연산은 절대 오차(epsilon)를 쓰는 것으로 보여, 원본 치수를
    // mm 단위 그대로(예: 60mm 상자) 넣으면 두 솔리드의 표면이 거의 겹치는 부분에서
    // 비매니폴드 모서리가 생기며 결과 표면이 깨지는 문제가 있었다(실제로 겪음: 이름표
    // 상자에 글자를 union할 때 작은 글자 크기에서 상자 윗면이 깨져 보였다). 두 도형을
    // 배율만큼 키운 뒤 union하고 다시 같은 배율로 축소하면, 같은 절대 오차가 상대적으로
    // 작아져서 문제가 사라진다.
    function robustUnion(a, b, scaleFactor) {
        const { transforms, booleans } = jscadModeling;
        const s = scaleFactor || 20;
        const up = g => transforms.scale([s, s, s], g);
        const fusedUp = booleans.union(up(a), up(b));
        return transforms.scale([1 / s, 1 / s, 1 / s], fusedUp);
    }

    return {
        isPointInPolygon: isPointInPolygon,
        extractGlyphContours: extractGlyphContours,
        signedArea: signedArea,
        ensureCCW: ensureCCW,
        ensureCW: ensureCW,
        contoursToGeom3: contoursToGeom3,
        buildTextGeom3: buildTextGeom3,
        threeGeometryToGeom3: threeGeometryToGeom3,
        newellNormal: newellNormal,
        geom3ToThreeGeometry: geom3ToThreeGeometry,
        robustUnion: robustUnion
    };
})();

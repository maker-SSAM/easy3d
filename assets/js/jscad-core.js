// JSCAD(@jscad/modeling) 기반 파라메트릭 디자인 페이지들이 공유하는 브릿지 코드.
// opentype.js로 뽑은 폰트 글자 외곽선을 JSCAD의 진짜 솔리드(geom2/geom3) 도형으로 만들고,
// JSCAD 결과물을 three.js가 그릴 수 있는 BufferGeometry로 변환하는 부분을 모아둔다.
// 이 파일을 쓰는 페이지는 head에서 three.js와 @jscad/modeling을 먼저 로드해야 한다.
window.JscadCore = (function () {

    // ---------- 2D 다각형 유틸 ----------
    function isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > point[1]) !== (yj > point[1])) &&
                (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // opentype 글자 패스 명령을 하위경로(subpath)별 점 배열(JSCAD 좌표 형식 [x,y])로 분리.
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
            return path.getPoints(curveSegments || 8).map(p => [p.x, p.y]);
        }).filter(pts => pts.length >= 3);
    }

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

    // 글자 하나의 하위경로들(외곽선+구멍)을 JSCAD geom2 하나로 변환.
    // point-in-polygon으로 구멍 여부만 판정하고(짝수 겹=외곽선, 홀수 겹=구멍) 실제 결합은
    // JSCAD의 subtract()가 처리한다 — 어떤 외곽선의 구멍인지 직접 매칭할 필요가 없다.
    function glyphContoursToGeom2(contours) {
        const { geom2 } = jscadModeling.geometries;
        const { union, subtract } = jscadModeling.booleans;
        const info = contours.map(pts => ({ points: pts, testPoint: pts[0], depth: 0 }));
        info.forEach(a => {
            info.forEach(b => {
                if (a !== b && isPointInPolygon(a.testPoint, b.points)) a.depth++;
            });
        });
        const outers = info.filter(c => c.depth % 2 === 0);
        const holes = info.filter(c => c.depth % 2 === 1);
        if (!outers.length) return null;

        let outerUnion = null;
        outers.forEach(o => {
            const g = geom2.fromPoints(ensureCCW(o.points));
            outerUnion = outerUnion ? union(outerUnion, g) : g;
        });
        if (holes.length) {
            outerUnion = subtract(outerUnion, ...holes.map(h => geom2.fromPoints(ensureCCW(h.points))));
        }
        return outerUnion;
    }

    // 텍스트 한 줄 전체를 하나의 JSCAD geom2로 생성 (글자 배치 + x=0 중심 정렬 포함).
    // curveSegments 기본값 8, 필요하면 옵션으로 조정 가능.
    function buildTextGeom2(text, font, size, options) {
        const opts = options || {};
        const curveSegments = opts.curveSegments || 8;
        const { geom2 } = jscadModeling.geometries;
        const { union } = jscadModeling.booleans;
        const { translate } = jscadModeling.transforms;
        const scale = 1 / font.unitsPerEm * size;
        let currentX = 0;
        let textUnion = null;

        const chars = Array.from(text); // 서로게이트 쌍(이모지 등) 문자가 반쪽씩 잘리지 않도록
        for (let i = 0; i < chars.length; i++) {
            const glyph = font.charToGlyph(chars[i]);
            if (!glyph) continue;
            const path = glyph.getPath(0, 0, size);
            const contours = extractGlyphContours(path.commands || [], curveSegments);
            if (contours.length) {
                let g = glyphContoursToGeom2(contours);
                if (g) {
                    g = translate([currentX, 0, 0], g);
                    textUnion = textUnion ? union(textUnion, g) : g;
                }
            }
            currentX += glyph.advanceWidth * scale;
        }

        if (textUnion) {
            // halign=center와 동일하게 전체 텍스트를 x=0 중심으로 이동
            const bbox = geom2.toOutlines(textUnion).flat();
            let minX = Infinity, maxX = -Infinity;
            bbox.forEach(p => { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; });
            const centerX = (minX + maxX) / 2;
            textUnion = translate([-centerX, 0, 0], textUnion);
        }
        return textUnion;
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

    return {
        isPointInPolygon: isPointInPolygon,
        extractGlyphContours: extractGlyphContours,
        signedArea: signedArea,
        ensureCCW: ensureCCW,
        glyphContoursToGeom2: glyphContoursToGeom2,
        buildTextGeom2: buildTextGeom2,
        newellNormal: newellNormal,
        geom3ToThreeGeometry: geom3ToThreeGeometry
    };
})();

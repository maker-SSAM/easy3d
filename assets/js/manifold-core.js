// Manifold-3D(WASM) 기반 파라메트릭 디자인 페이지들이 공유하는 브릿지 코드.
// jscad-core.js가 JSCAD(@jscad/modeling)로 하던 역할(글자 윤곽선 → 입체 → three.js 변환)을
// Manifold-3D로 다시 구현한다. 글자 → 윤곽선 추출 자체는 font-core.js(FontCore)를 그대로
// 재사용하고, 여기서는 "그 윤곽선으로 진짜 매니폴드 솔리드를 만들고 상자와 결합한 뒤,
// three.js가 그릴 수 있는 형태로 바꾸는" 부분만 담당한다.
//
// JSCAD/opentype.js와 달리 Manifold-3D는 WASM 모듈이라 두 가지가 다르다:
//   1) 로딩이 비동기다 — 이 파일 자체가 ES 모듈(<script type="module">)이라서, 페이지는
//      `await ManifoldCore.ready`로 WASM 초기화가 끝날 때까지 기다린 뒤에야 아래 함수들을
//      쓸 수 있다. core.js/jscad-core.js처럼 스크립트 태그만 넣으면 바로 쓸 수 있는 게 아니다.
//   2) 만든 Manifold 객체는 WASM 힙 위에 있어서 JS 가비지 컬렉터가 못 건드린다 — 다 쓴
//      객체는 반드시 dispose()로 직접 정리해야 메모리가 안 샌다.
//
// 사용법 예시:
//   <script type="module" src="../assets/js/manifold-core.js"></script>
//   ...
//   await ManifoldCore.ready;
//   const box = ManifoldCore.cuboid(60, 20, 60);              // 가로/높이/세로(Y-up), originalID 자동 부여
//   const text = ManifoldCore.extrudeContours(contours, 4);   // font-core.js가 뽑은 윤곽선, originalID 자동 부여
//   const positioned = ManifoldCore.translateY(text, 20);
//   const fused = ManifoldCore.union(box, positioned);
//   const idToColor = new Map([[box.originalID(), 0x1e88e5], [text.originalID(), 0xffca28]]);
//   const mesh = ManifoldCore.toThreeMesh(fused, idToColor);
//   ManifoldCore.dispose(box, text, positioned, fused);        // 중간 산출물은 다 쓰고 나면 정리
import Module from 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.1/manifold.min.js';

window.ManifoldCore = (function () {
    let Manifold = null;
    let CrossSection = null;

    // 페이지 코드가 await 할 수 있는 WASM 초기화 완료 Promise.
    const ready = Module().then(function (wasm) {
        wasm.setup();
        Manifold = wasm.Manifold;
        CrossSection = wasm.CrossSection;
    });

    // ---------- 도형 생성 (three.js와 동일한 Y-up 좌표계로 직접 만든다) ----------
    // jscad-core.js는 JSCAD의 Z-up 좌표계로 만든 뒤 마지막에 (X,Y,Z)->(X,Z,-Y) 축 치환으로
    // three.js Y-up에 맞췄는데, 이 수동 축 치환 자체가 부호를 하나만 놓치면 거울반사(좌우
    // 뒤집힘)가 되는 버그의 원인이었다(jscad-core.js 주석 참고). Manifold는 좌표계를
    // 강제하지 않으므로, 애초에 Y-up으로 만들어서 그 축 치환 자체를 없앤다.

    // 방금 만든 도형을 "독립된 원본"으로 표시한다 — 실제로 겪은 동작: 갓 만든 도형의
    // originalID()는 항상 -1이고, translate/rotate 같은 변형을 거쳐도 계속 -1을 반환한다.
    // 반드시 asOriginal()을 한 번 호출해야 실제 고유 ID가 생기고, 그 ID가 이후 union
    // 결과의 getMesh().runOriginalID에도 그대로 남는다(변형을 더 거쳐도 유지됨). 부품별
    // 색상 구분(originalID 추적)을 쓰려면 각 부품을 반드시 이 함수로 감싸야 한다.
    function markAsOriginal(manifold) {
        const original = manifold.asOriginal();
        manifold.delete();
        return original;
    }

    // 가로(X) x 높이(Y) x 세로(Z) 상자를 만든다. 바닥이 Y=0에 오도록 배치.
    function cuboid(width, height, depth) {
        const box = Manifold.cube([width, height, depth], true);
        const positioned = box.translate([0, height / 2, 0]);
        box.delete();
        return markAsOriginal(positioned);
    }

    // font-core.js의 extractGlyphContours/buildTextGeom3 계열이 돌려주는 [[ [x,y], ... ], ...]
    // 형태의 윤곽선을 받아 진짜 입체로 압출한다. Manifold의 CrossSection은 'NonZero' 규칙으로
    // 구멍(ㅇ,ㅁ,ㅎ 등)과 겹치는 획(굵은 폰트 자모 겹침)을 자동으로 정리해준다 — jscad-core.js가
    // isPointInPolygon으로 손수 하던 포함관계 판정, ClipperLib로 손수 하던 겹침 해소가
    // 둘 다 필요 없어진다.
    // 압출은 로컬 Z축 방향으로 일어나므로(대부분의 CAD 라이브러리 관례), 결과를 X축 기준
    // -90도 회전시켜 압출 방향을 Y축(three.js의 "위") 방향으로 맞춘다.
    function extrudeContours(contours, height) {
        if (!contours || !contours.length) return null;
        const cross = new CrossSection(contours, 'NonZero');
        const extruded = cross.extrude(height);
        cross.delete();
        const rotated = extruded.rotate([-90, 0, 0]);
        extruded.delete();
        return markAsOriginal(rotated);
    }

    function translateY(manifold, y) {
        return manifold.translate([0, y, 0]);
    }

    // 반지름이 다른 두 원판을 잇는 원뿔대(윗면 반지름=radiusTop, 아랫면 반지름=radiusBottom)를
    // 만든다. sides로 원 대신 N각형 단면(각기둥/각뿔대)도 만들 수 있다 — 갤러리2 보석 디자인의
    // 면(facet) 개수 조절이 여기서 나온다. Manifold의 cylinder()는 로컬 Z축을 따라
    // (아랫면 z=0, 윗면 z=height) 만들어지므로, extrudeContours와 동일하게 X축 -90도 회전으로
    // 아랫면이 y=0, 윗면이 y=height인 three.js Y-up 좌표계로 맞춘다.
    function cylinder(radiusBottom, radiusTop, height, sides) {
        const c = Manifold.cylinder(height, radiusBottom, radiusTop, sides || 0, false);
        const rotated = c.rotate([-90, 0, 0]);
        c.delete();
        return markAsOriginal(rotated);
    }

    // ---------- 불리언 결합 ----------
    function union(a, b) {
        return a.add(b);
    }

    function subtract(a, b) {
        return a.subtract(b);
    }

    function intersect(a, b) {
        return a.intersect(b);
    }

    // ---------- 고급 원본(raw) API — 갤러리3(나사 뚜껑 통) 같이 회전 압출/꼬임 압출을 여러 번
    // 조합해야 하는 디자인용. cuboid/cylinder/extrudeContours와 달리 originalID를 부여하지
    // 않고, Manifold의 기본 좌표계(Z축이 "위") 그대로 반환한다 — 여러 조각을 OpenSCAD 원본
    // 코드와 동일한 Z-up 좌표계에서 조합한 뒤, 마지막에 toYUp() 한 번만 호출해서 three.js
    // Y-up으로 바꾸는 편이 매번 개별 조각을 회전시키는 것보다 원본 공식을 그대로 옮기기 쉽다.

    // 아랫면 지름 dBottom(z=0), 윗면 지름 dTop(z=height)인 원기둥/원뿔대. Z-up 그대로.
    function rawCylinder(dBottom, dTop, height, segments) {
        return Manifold.cylinder(height, dBottom / 2, dTop / 2, segments || 0, false);
    }

    // 반지름 radius인 원 하나로 이루어진 2D 단면(CrossSection). OpenSCAD의 circle()에 대응.
    function circleXS(radius, segments) {
        return CrossSection.circle(radius, segments || 0);
    }

    // 2D 단면을 Z축 둘레로 revolveDegrees(기본 360도) 만큼 회전시켜 입체로 만든다.
    // OpenSCAD의 rotate_extrude()에 대응.
    function revolveXS(cross, segments, revolveDegrees) {
        return Manifold.revolve(cross, segments || 0, revolveDegrees === undefined ? 360 : revolveDegrees);
    }

    // 2D 단면을 비틀며(twist) Z축 방향으로 압출한다. OpenSCAD의
    // linear_extrude(height, twist=twistDegrees, slices=nDivisions)에 대응 — 나사산(cscrew)과
    // 널링(knurl) 홈이 둘 다 이 방식(편심 원을 꼬아서 압출)으로 만들어진다.
    function extrudeTwist(cross, height, nDivisions, twistDegrees, scaleTop) {
        return cross.extrude(height, nDivisions || 0, twistDegrees || 0, scaleTop || [1, 1], false);
    }

    // Z축 둘레로 deg만큼 회전.
    function rotateZ(manifold, deg) {
        return manifold.rotate([0, 0, deg]);
    }

    // rawCylinder 등으로 Z-up 좌표계에서 조합한 최종 결과 하나를 three.js Y-up으로 바꾼다.
    // cylinder()/extrudeContours()가 조각 하나하나에 매번 적용하는 것과 동일한 -90도 X축
    // 회전을 최종 결과에 딱 한 번만 적용한다.
    function toYUp(manifold) {
        return manifold.rotate([-90, 0, 0]);
    }

    // ---------- Manifold → three.js 변환 ----------
    // Manifold의 Mesh는 이미 삼각형만으로 이루어진 GL 스타일 버퍼(vertProperties/triVerts)라,
    // JSCAD의 임의 다각형(poly3)을 다시 삼각분할해야 했던 jscad-core.js의
    // geom3ToThreeGeometry(Newell 법선 계산 + 평면 투영 + ShapeUtils 재삼각분할)가 통째로
    // 필요 없다 — 정점 배열을 그대로 옮기기만 하면 된다.
    function toBufferGeometry(manifold) {
        const mesh = manifold.getMesh();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
        geo.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
        geo.computeVertexNormals();
        return { geo: geo, mesh: mesh };
    }

    // union된 결과를 부품별로 다른 색을 가진 THREE.Mesh 하나로 만든다. box/text 각각의
    // originalID를 기억해뒀다가, union 결과 메시의 runOriginalID(부품별 삼각형 구간 정보)로
    // 어느 구간이 어느 부품이었는지 되찾아 three.js 머티리얼 그룹으로 되살린다 — 최종
    // 내보내기는 STL 하나(색 정보 없음)로 하되, 화면 미리보기에서는 부품별 색을 구분해서
    // 보여줄 수 있다.
    function toThreeMesh(fusedManifold, idToColorMap, fallbackColor, materialOptions) {
        const { geo, mesh } = toBufferGeometry(fusedManifold);
        const materials = [];
        const idToMaterialIndex = new Map();
        const matOpts = materialOptions || {};
        // 아래 metalness/roughness 기본값은 갤러리1의 화면 설정 튜닝 패널로 실제 눈으로 보면서
        // 확정한 값이다. materialOptions로 필요하면 호출부에서 덮어쓸 수 있게는 열어둔다.
        const metalness = matOpts.metalness !== undefined ? matOpts.metalness : 0.2;
        const roughness = matOpts.roughness !== undefined ? matOpts.roughness : 0.45;
        // 실제로 겪은 문제: Manifold의 메시는 정점을 면끼리 공유(용접)한 형태라, 상자
        // 모서리 하나가 서로 다른 방향을 보는 3개 면(윗면+옆면 2개)에 동시에 속한다.
        // computeVertexNormals()는 이 공유 정점에서 세 면의 법선을 그대로 평균 내버려서
        // (실측: 상자 모서리 근처 법선이 위쪽에서 평균 57°, 최대 107°나 기울어짐), 평평해야
        // 할 상자 표면이 각 모서리에서 접힌 것처럼 보이는 사선 얼룩이 생겼다. flatShading은
        // 정점 법선 평균 대신 삼각형별 실제 법선을 그대로 쓰게 해서 이 문제를 없앤다.
        const flatShading = matOpts.flatShading !== undefined ? matOpts.flatShading : true;

        function materialIndexFor(originalID) {
            if (idToMaterialIndex.has(originalID)) return idToMaterialIndex.get(originalID);
            const color = idToColorMap.get(originalID);
            const idx = materials.length;
            materials.push(new THREE.MeshStandardMaterial({
                color: color !== undefined ? color : (fallbackColor || 0x9e9e9e),
                metalness: metalness,
                roughness: roughness,
                flatShading: flatShading
            }));
            idToMaterialIndex.set(originalID, idx);
            return idx;
        }

        const runIndex = mesh.runIndex;
        const runOriginalID = mesh.runOriginalID;
        if (runIndex && runOriginalID && runIndex.length > 1) {
            for (let r = 0; r < runOriginalID.length; r++) {
                geo.addGroup(runIndex[r], runIndex[r + 1] - runIndex[r], materialIndexFor(runOriginalID[r]));
            }
        } else {
            geo.addGroup(0, mesh.triVerts.length, materialIndexFor(-1));
        }

        return new THREE.Mesh(geo, materials);
    }

    // ---------- 메모리 정리 ----------
    // WASM 힙에 만든 Manifold/CrossSection은 JS GC 대상이 아니라서 직접 delete()해야 한다.
    // null/undefined는 조용히 건너뛴다(중간 단계에서 실패해 일부가 안 만들어졌을 때도 안전).
    function dispose() {
        for (let i = 0; i < arguments.length; i++) {
            const obj = arguments[i];
            if (obj && typeof obj.delete === 'function') obj.delete();
        }
    }

    return {
        ready: ready,
        markAsOriginal: markAsOriginal,
        cuboid: cuboid,
        cylinder: cylinder,
        extrudeContours: extrudeContours,
        translateY: translateY,
        union: union,
        subtract: subtract,
        intersect: intersect,
        rawCylinder: rawCylinder,
        circleXS: circleXS,
        revolveXS: revolveXS,
        extrudeTwist: extrudeTwist,
        rotateZ: rotateZ,
        toYUp: toYUp,
        toBufferGeometry: toBufferGeometry,
        toThreeMesh: toThreeMesh,
        dispose: dispose
    };
})();

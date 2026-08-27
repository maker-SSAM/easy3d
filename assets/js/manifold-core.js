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
    let MeshCtor = null;

    // 페이지 코드가 await 할 수 있는 WASM 초기화 완료 Promise.
    const ready = Module().then(function (wasm) {
        wasm.setup();
        Manifold = wasm.Manifold;
        CrossSection = wasm.CrossSection;
        MeshCtor = wasm.Mesh;
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

    function translate(manifold, x, y, z) {
        return manifold.translate([x, y, z]);
    }

    // three.js BufferGeometry(예: STLLoader가 읽어들인 원본 삼각형 데이터)를 Manifold로
    // 변환한다. STL은 삼각형마다 정점을 따로 갖는 "삼각형 수프"라, 이웃한 면끼리 같은
    // 위치의 정점이라도 서로 다른 인덱스를 쓴다 — Manifold는 완전히 닫힌(watertight)
    // 2-매니폴드를 요구하므로, Mesh.merge()로 같은 위치의 정점들을 자동 용접해 이어붙인
    // 뒤에야 Manifold로 만들 수 있다(갤러리7의 "몸체를 여러 개 배치해 하나로 합치기"
    // 기능에서, 고정 STL 부품을 union의 입력으로 쓰기 위해 필요).
    function fromGeometry(geometry) {
        const geo = geometry.index ? geometry.toNonIndexed() : geometry;
        const posAttr = geo.attributes.position;
        const vertProperties = Float32Array.from(posAttr.array);
        const triVerts = new Uint32Array(posAttr.count);
        for (let i = 0; i < triVerts.length; i++) triVerts[i] = i;
        const meshObj = new MeshCtor({ numProp: 3, vertProperties: vertProperties, triVerts: triVerts });
        meshObj.merge();
        return Manifold.ofMesh(meshObj);
    }

    // OpenSCAD의 polyhedron(points, faces)에 대응 — 임의의 점/면 배열로 작은 Manifold 솔리드를
    // 직접 짓는다. 면은 삼각형이든 볼록 다각형(사각형 등)이든 상관없이 첫 정점 기준 부채꼴로
    // 삼각분할한다. 갤러리9(볼트/너트)의 실제 나사산 폴리헤드론(Dan Kirshner의
    // thread_polyhedron 포팅)처럼, CrossSection 압출로는 만들 수 없는 원시 정점 좌표 형태의
    // 작은 솔리드가 필요할 때 쓴다. OpenSCAD는 "바깥에서 봤을 때 시계 방향" 순서를 쓰는데,
    // Manifold/three.js는 반시계 방향이 바깥을 향하는 관례라, 삼각분할 시 정점 순서를
    // 뒤집는다(faces 배열 자체는 원본 OpenSCAD 코드 그대로 넘기면 된다).
    function polyhedron(points, faces) {
        const vertProperties = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            vertProperties[i * 3] = points[i][0];
            vertProperties[i * 3 + 1] = points[i][1];
            vertProperties[i * 3 + 2] = points[i][2];
        }
        const triList = [];
        faces.forEach(function (face) {
            for (let i = 1; i < face.length - 1; i++) {
                // face[0], face[i+1], face[i] — OpenSCAD의 시계 방향을 Manifold의 반시계
                // 방향으로 뒤집기 위해 i/i+1 순서를 바꿔 넣는다.
                triList.push(face[0], face[i + 1], face[i]);
            }
        });
        const triVerts = new Uint32Array(triList);
        const meshObj = new MeshCtor({ numProp: 3, vertProperties: vertProperties, triVerts: triVerts });
        meshObj.merge();
        return Manifold.ofMesh(meshObj);
    }

    // font-core.js의 윤곽선으로 2D 단면(CrossSection)만 만들고 압출하지 않는다. extrudeContours와
    // 달리, 결과를 곧바로 offset()/add()/subtract() 같은 2D 연산에 먼저 쓴 뒤(예: 갤러리5의
    // 글자 외곽선/테두리 링처럼 폰트 윤곽선 자체를 부풀리거나 서로 합치는 경우) 원하는 시점에
    // extrudeXS()로 나중에 압출하고 싶을 때 쓴다.
    function contoursToXS(contours) {
        if (!contours || !contours.length) return null;
        return new CrossSection(contours, 'NonZero');
    }

    // 이미 만들어진(2D 연산을 거쳤을 수도 있는) CrossSection을 압출한다. extrudeContours와
    // 동일하게 Y-up으로 회전하고 originalID를 부여하지만, 입력이 원시 점 배열이 아니라
    // CrossSection 객체라는 점만 다르다. 입력으로 받은 cross 자체는 지우지 않는다 — 여러
    // 압출에 재사용하거나 호출부가 직접 정리(track)할 수 있도록.
    function extrudeXS(cross, height) {
        const extruded = cross.extrude(height);
        const rotated = extruded.rotate([-90, 0, 0]);
        extruded.delete();
        return markAsOriginal(rotated);
    }

    // 반지름이 다른 두 원판을 잇는 원뿔대(윗면 반지름=radiusTop, 아랫면 반지름=radiusBottom)를
    // 만든다. sides로 원 대신 N각형 단면(각기둥/각뿔대)도 만들 수 있다 — 갤러리1 보석 디자인의
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

    // 여러 Manifold의 볼록 껍질(convex hull)을 한 번에 계산한다. OpenSCAD의 hull()에 대응
    // (갤러리3 꽃병처럼 서로 다른 높이/모양의 두 조각을 매끄러운 곡면으로 이어붙일 때 쓴다).
    function hullOf(manifolds) {
        return Manifold.hull(manifolds);
    }

    // ---------- 고급 원본(raw) API — 갤러리4(나사 뚜껑 통) 같이 회전 압출/꼬임 압출을 여러 번
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
    // scaleTop: manifold-3d의 .d.ts는 Vec2([x,y] 배열)와 number(균일 배율) 둘 다 받는다고
    // 돼 있지만, 실제로 겪은 문제 — 숫자 하나만 그대로 넘기면 X/Y가 비대칭으로 깨져서
    // (갤러리3 꽃병에서 발견: 위로 갈수록 넓어져야 할 다각형이 한쪽 축만 거의 안 늘어나
    // 뾰족한 원뿔처럼 나왔다) 항상 [x,y] 배열로 정규화해서 넘긴다.
    function extrudeTwist(cross, height, nDivisions, twistDegrees, scaleTop) {
        let scale = scaleTop;
        if (scale === undefined || scale === null) scale = [1, 1];
        else if (typeof scale === 'number') scale = [scale, scale];
        return cross.extrude(height, nDivisions || 0, twistDegrees || 0, scale, false);
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
    // three.js BufferGeometryUtils(r150+ jsm 전용, 이 프로젝트가 쓰는 r146 classic 빌드에는
    // 없음)의 toCreasedNormals()를 그대로 옮겨왔다(MIT 라이선스, three.js 원작). 삼각형별
    // 법선을 미리 계산해서, 인접한 두 면의 각도 차이가 creaseAngle보다 작으면 부드럽게
    // 평균 내고 그보다 크면 그대로 나눠 각지게 남긴다 — computeVertexNormals()처럼 무조건
    // 평균 내지도, flatShading처럼 무조건 각지게 만들지도 않아서 "둥근 곡면은 매끈하게,
    // 진짜 모서리는 여전히 선명하게" 둘 다 가능하다. (원본:
    // three.js examples/jsm/utils/BufferGeometryUtils.js — toCreasedNormals)
    // 입력을 비인덱스(non-indexed)로 펼치되, 원래 삼각형 순서는 그대로 유지하므로 이후
    // toThreeMesh()가 Manifold의 runIndex(삼각형 순서 기준 구간)로 매기는 부품별 색상
    // 그룹핑도 그대로 들어맞는다.
    function creaseNormals(geo, creaseAngle) {
        const creaseDot = Math.cos(creaseAngle);
        const hashMultiplier = (1 + 1e-10) * 1e2;
        const verts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        const tempVec1 = new THREE.Vector3();
        const tempVec2 = new THREE.Vector3();
        const tempNorm = new THREE.Vector3();
        const tempNorm2 = new THREE.Vector3();

        function hashVertex(v) {
            const x = ~~(v.x * hashMultiplier);
            const y = ~~(v.y * hashMultiplier);
            const z = ~~(v.z * hashMultiplier);
            return x + ',' + y + ',' + z;
        }

        const resultGeometry = geo.index ? geo.toNonIndexed() : geo;
        const posAttr = resultGeometry.attributes.position;
        const vertexMap = {};

        // 같은 위치의 정점들이 공유하는 면 법선을 모두 모아둔다.
        for (let i = 0, l = posAttr.count / 3; i < l; i++) {
            const i3 = 3 * i;
            const a = verts[0].fromBufferAttribute(posAttr, i3 + 0);
            const b = verts[1].fromBufferAttribute(posAttr, i3 + 1);
            const c = verts[2].fromBufferAttribute(posAttr, i3 + 2);
            tempVec1.subVectors(c, b);
            tempVec2.subVectors(a, b);
            const normal = new THREE.Vector3().crossVectors(tempVec1, tempVec2).normalize();
            for (let n = 0; n < 3; n++) {
                const hash = hashVertex(verts[n]);
                if (!(hash in vertexMap)) vertexMap[hash] = [];
                vertexMap[hash].push(normal);
            }
        }

        // creaseAngle 안쪽에 있는 법선들만 평균 내서 최종 법선을 정한다.
        const normalArray = new Float32Array(posAttr.count * 3);
        const normAttr = new THREE.BufferAttribute(normalArray, 3, false);
        for (let i = 0, l = posAttr.count / 3; i < l; i++) {
            const i3 = 3 * i;
            const a = verts[0].fromBufferAttribute(posAttr, i3 + 0);
            const b = verts[1].fromBufferAttribute(posAttr, i3 + 1);
            const c = verts[2].fromBufferAttribute(posAttr, i3 + 2);
            tempVec1.subVectors(c, b);
            tempVec2.subVectors(a, b);
            tempNorm.crossVectors(tempVec1, tempVec2).normalize();

            for (let n = 0; n < 3; n++) {
                const hash = hashVertex(verts[n]);
                const otherNormals = vertexMap[hash];
                tempNorm2.set(0, 0, 0);
                for (let k = 0; k < otherNormals.length; k++) {
                    if (tempNorm.dot(otherNormals[k]) > creaseDot) tempNorm2.add(otherNormals[k]);
                }
                tempNorm2.normalize();
                normAttr.setXYZ(i3 + n, tempNorm2.x, tempNorm2.y, tempNorm2.z);
            }
        }

        resultGeometry.setAttribute('normal', normAttr);
        return resultGeometry;
    }

    // 갤러리7(이름표 상자 모서리)/갤러리4(나사산 스레드)처럼 실제 각져야 하는 부분과,
    // 갤러리1(보석 파빌리온 능선)처럼 실제 각져야 하는 다각형 면 사이의 경계는 살리면서도
    // 30° 미만의 미세한 삼각분할 각도 차이(둥근 부분을 근사하며 생기는 자잘한 꺾임)는
    // 부드럽게 이어붙이기 위한 기준각. Code and Make 저장소가 실측으로 확정한 35°를 그대로 썼다.
    const CREASE_ANGLE = (35 * Math.PI) / 180;

    // Manifold의 Mesh는 이미 삼각형만으로 이루어진 GL 스타일 버퍼(vertProperties/triVerts)라,
    // JSCAD의 임의 다각형(poly3)을 다시 삼각분할해야 했던 jscad-core.js의
    // geom3ToThreeGeometry(Newell 법선 계산 + 평면 투영 + ShapeUtils 재삼각분할)가 통째로
    // 필요 없다 — 정점 배열을 그대로 옮기기만 하면 된다.
    function toBufferGeometry(manifold) {
        const mesh = manifold.getMesh();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
        geo.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
        const creased = creaseNormals(geo, CREASE_ANGLE);
        return { geo: creased, mesh: mesh };
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
        // 아래 metalness/roughness 기본값은 갤러리7의 화면 설정 튜닝 패널로 실제 눈으로 보면서
        // 확정한 값이다. materialOptions로 필요하면 호출부에서 덮어쓸 수 있게는 열어둔다.
        const metalness = matOpts.metalness !== undefined ? matOpts.metalness : 0.2;
        const roughness = matOpts.roughness !== undefined ? matOpts.roughness : 0.45;
        // PMREM 환경광(core.js의 RoomEnvironment)이 재질에 얼마나 반영될지 — 이 값도
        // mountLightTuningPanel()로 확정했다.
        const envMapIntensity = matOpts.envMapIntensity !== undefined ? matOpts.envMapIntensity : 0.55;
        // 예전에는 flatShading:true로 이 문제를 막았었다 — Manifold 메시는 정점을 면끼리
        // 공유(용접)한 형태라, computeVertexNormals()가 상자 모서리 같은 곳까지 무조건
        // 평균 내버려 접힌 것처럼 보이는 사선 얼룩이 생겼기 때문이다. 지금은 toBufferGeometry()가
        // creaseNormals()로 각도 기준(35°)에 따라 진짜 모서리만 선택적으로 각지게 남기므로,
        // flatShading을 켤 필요가 없다 — 오히려 켜면 이 선택적 처리를 다 무시하고 모든 삼각형을
        // 강제로 각지게 만들어버린다.
        const flatShading = matOpts.flatShading !== undefined ? matOpts.flatShading : false;

        function materialIndexFor(originalID) {
            if (idToMaterialIndex.has(originalID)) return idToMaterialIndex.get(originalID);
            const color = idToColorMap.get(originalID);
            const idx = materials.length;
            materials.push(new THREE.MeshStandardMaterial({
                color: color !== undefined ? color : (fallbackColor || 0x9e9e9e),
                metalness: metalness,
                roughness: roughness,
                flatShading: flatShading,
                envMapIntensity: envMapIntensity
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
        contoursToXS: contoursToXS,
        extrudeXS: extrudeXS,
        translateY: translateY,
        translate: translate,
        fromGeometry: fromGeometry,
        polyhedron: polyhedron,
        union: union,
        subtract: subtract,
        intersect: intersect,
        hullOf: hullOf,
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

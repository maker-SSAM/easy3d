// 3MF(.3mf) 내보내기 공용 브릿지. three.js r146(이 프로젝트 고정 버전)에는 3MF 내보내기
// 기능이 없다(불러오기용 3MFLoader만 있음) — 그래서 manifold-core.js/font-core.js와 같은
// 방침으로, 필요한 만큼만 직접 만든다.
//
// 3MF는 사실 ZIP 파일 안에 XML을 담은 것뿐이다(OPC, Open Packaging Conventions 규격).
// 압축 라이브러리를 새로 끌어오는 대신 ZIP의 STORED(비압축) 저장 방식만 손으로 구현했다 —
// 압축률은 포기하지만 DEFLATE 알고리즘 구현이 통째로 필요 없어진다.
//
// STL 대비 진짜 이득: STL은 색 정보를 담을 수 없는 포맷이라 이 프로젝트의 exportSTL()은
// 부품별 색상을 늘 버려왔다. 3MF는 코어 스펙(확장 아님, Bambu Studio/PrusaSlicer/Cura 모두
// 지원)의 <basematerials>/<triangle pid/p1>만으로 삼각형 단위 색상을 저장할 수 있어서,
// 화면 미리보기에서만 보이던 부품별 색(이름표 글자색, 클리커 뚜껑 글자색 등)을 내보낸
// 파일에도 그대로 남길 수 있다.
window.ThreeMFCore = (function () {
    // ---------- ZIP(STORED) ----------
    const CRC_TABLE = (function () {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function strToBytes(str) {
        return new TextEncoder().encode(str);
    }

    // ZIP 로컬/중앙 헤더가 요구하는 DOS 시간/날짜 형식 — 실제 시각은 3MF 내용과 무관하므로
    // 고정값(1980-01-01)을 쓴다.
    const DOS_TIME = 0;
    const DOS_DATE = 0x21;

    // entries: [{ name: string(zip 안의 경로), data: Uint8Array }] -> 완성된 zip 파일 바이트.
    function buildZip(entries) {
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        entries.forEach(function (entry) {
            const nameBytes = strToBytes(entry.name);
            const data = entry.data;
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0, true);
            local.setUint16(8, 0, true); // method 0 = STORED
            local.setUint16(10, DOS_TIME, true);
            local.setUint16(12, DOS_DATE, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, nameBytes.length, true);
            local.setUint16(28, 0, true);
            localParts.push(new Uint8Array(local.buffer), nameBytes, data);

            const central = new DataView(new ArrayBuffer(46));
            central.setUint32(0, 0x02014b50, true);
            central.setUint16(4, 20, true);
            central.setUint16(6, 20, true);
            central.setUint16(8, 0, true);
            central.setUint16(10, 0, true);
            central.setUint16(12, DOS_TIME, true);
            central.setUint16(14, DOS_DATE, true);
            central.setUint32(16, crc, true);
            central.setUint32(20, data.length, true);
            central.setUint32(24, data.length, true);
            central.setUint16(28, nameBytes.length, true);
            central.setUint16(30, 0, true);
            central.setUint16(32, 0, true);
            central.setUint16(34, 0, true);
            central.setUint16(36, 0, true);
            central.setUint32(38, 0, true);
            central.setUint32(42, offset, true); // 이 항목의 로컬 헤더가 시작되는 오프셋
            centralParts.push(new Uint8Array(central.buffer), nameBytes);

            offset += local.byteLength + nameBytes.length + data.length;
        });

        const centralStart = offset;
        const centralSize = centralParts.reduce(function (sum, p) { return sum + p.length; }, 0);

        const eocd = new DataView(new ArrayBuffer(22));
        eocd.setUint32(0, 0x06054b50, true);
        eocd.setUint16(4, 0, true);
        eocd.setUint16(6, 0, true);
        eocd.setUint16(8, entries.length, true);
        eocd.setUint16(10, entries.length, true);
        eocd.setUint32(12, centralSize, true);
        eocd.setUint32(16, centralStart, true);
        eocd.setUint16(20, 0, true);

        const allParts = localParts.concat(centralParts, [new Uint8Array(eocd.buffer)]);
        const totalLen = allParts.reduce(function (sum, p) { return sum + p.length; }, 0);
        const result = new Uint8Array(totalLen);
        let pos = 0;
        allParts.forEach(function (p) { result.set(p, pos); pos += p.length; });
        return result;
    }

    // ---------- 3MF XML ----------
    function colorToHex8(colorLike) {
        const c = (colorLike && colorLike.isColor) ? colorLike : new THREE.Color(colorLike);
        function ch(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }
        // 3MF displaycolor는 #RRGGBBAA(8자리, 알파 포함) 형식을 요구한다 — 알파는 항상 불투명(FF).
        return '#' + ch(c.r) + ch(c.g) + ch(c.b) + 'FF';
    }

    // 화면 표시는 three.js 관례대로 Y-up인데 슬라이서는 Z-up을 기대한다 — core.js의
    // exportSTL()과 동일한 이유로 동일한 회전을 적용한다. 부품(THREE.Mesh)마다 색이 다를 수
    // 있으므로(geometry.groups + material 배열), 그룹별로 나눠 {positions, color} 목록을 만든다.
    function collectPartsFromGroup(modelGroup) {
        const parts = [];
        modelGroup.traverse(function (obj) {
            if (!obj.isMesh) return;
            const geo = obj.geometry.clone();
            geo.rotateX(Math.PI / 2); // Y-up(화면) -> Z-up(슬라이서 관례)
            const flat = geo.index ? geo.toNonIndexed() : geo;
            const posAttr = flat.attributes.position;
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            const groups = (flat.groups && flat.groups.length)
                ? flat.groups
                : [{ start: 0, count: posAttr.count, materialIndex: 0 }];

            groups.forEach(function (g) {
                const mat = materials[g.materialIndex] || materials[0];
                parts.push({
                    positions: posAttr.array.slice(g.start * 3, (g.start + g.count) * 3),
                    color: colorToHex8(mat.color)
                });
            });

            geo.dispose();
            if (flat !== geo) flat.dispose();
        });
        return parts;
    }

    // 좌표는 STL(이진, 4바이트 float)과 달리 텍스트로 풀어써야 하는 XML 포맷이라, 소수점을
    // 무제한으로 남기면(예: 부동소수점 오차로 12.00000000047 같은 긴 문자열) 파일이 불필요하게
    // 커진다 — 0.1마이크론(4자리)이면 FDM/레진 프린터 정밀도에 비해 충분히 여유 있어서 그
    // 이상은 잘라낸다.
    function fmt(n) { return n.toFixed(4); }

    // parts: collectPartsFromGroup()이 만든 {positions, color} 목록 -> 3dmodel.model XML 문자열.
    // 부품은 union하지 않고 삼각형 좌표를 그대로 이어붙인다(STL과 동일하게 "삼각형 수프" —
    // 이미 STL 내보내기에서 슬라이서 호환성이 검증된 방식). 다만 STL(이진, 정점당 12바이트)과
    // 달리 3MF는 좌표를 텍스트로 풀어써야 해서, 삼각형마다 정점을 새로 찍으면(원본
    // toBufferGeometry가 법선 계산용으로 이미 삼각형 수프로 펼쳐둔 상태 그대로 쓰면) 인접
    // 삼각형끼리 겹치는 정점이 실제로 겪은 문제로 파일 크기가 수십 MB까지 불어난다(갤러리6
    // 실측 45MB). 법선은 3MF에 안 실어도 되므로(슬라이서가 자체적으로 다시 계산), 좌표값이
    // (반올림 후) 같은 정점은 좌표 문자열을 키로 묶어 인덱스를 재사용한다 — 닫힌 매니폴드는
    // 정점 하나를 평균 6개 삼각형이 공유하므로 정점 목록이 수 배 줄어든다.
    //
    // 색 표현 방식(실제로 겪은 문제): 처음엔 3MF 코어 스펙의 <basematerials>/<base
    // displaycolor>로 만들었다 — 스펙상 맞고 Windows 기본 3D 뷰어(마이크로소프트 자체 구현)는
    // 정확히 색을 보여줬지만, Bambu Studio는 "Bambu Lab 출처 아님, 형상+색상만 로드" 안내를
    // 띄우고도 실제로는 색이 회색으로 나왔다 — basematerials는 슬라이서가 "다른 물성의
    // 재질"(필라멘트 종류) 힌트로 취급해서인 것으로 보인다. Bambu Studio/PrusaSlicer/OrcaSlicer가
    // 타사 3MF에서 실제로 읽어들이는 건 3MF Materials Extension의 <m:colorgroup>/<m:color>다
    // (네임스페이스 m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02", 마이크로소프트가
    // 만든 확장이라 Windows 3D 뷰어와도 호환됨) — triangle의 pid/p1 참조 방식은 동일하게 쓰되
    // 참조 대상만 colorgroup으로 바꾼다.
    function buildModelXML(parts) {
        const colorList = [];
        const colorIndex = new Map();
        function indexForColor(color) {
            if (colorIndex.has(color)) return colorIndex.get(color);
            const idx = colorList.length;
            colorList.push(color);
            colorIndex.set(color, idx);
            return idx;
        }

        const vertexLines = [];
        const triangleLines = [];
        const vertexIndex = new Map(); // "x,y,z"(반올림 문자열) -> 정점 인덱스
        let vertexCount = 0;

        function indexForVertex(x, y, z) {
            const fx = fmt(x), fy = fmt(y), fz = fmt(z);
            const key = fx + ',' + fy + ',' + fz;
            const existing = vertexIndex.get(key);
            if (existing !== undefined) return existing;
            const idx = vertexCount++;
            vertexIndex.set(key, idx);
            vertexLines.push('<vertex x="' + fx + '" y="' + fy + '" z="' + fz + '"/>');
            return idx;
        }

        parts.forEach(function (part) {
            const pIdx = indexForColor(part.color);
            const positions = part.positions;
            const triCount = positions.length / 9;
            for (let t = 0; t < triCount; t++) {
                const base = t * 9;
                const v1 = indexForVertex(positions[base], positions[base + 1], positions[base + 2]);
                const v2 = indexForVertex(positions[base + 3], positions[base + 4], positions[base + 5]);
                const v3 = indexForVertex(positions[base + 6], positions[base + 7], positions[base + 8]);
                triangleLines.push('<triangle v1="' + v1 + '" v2="' + v2 + '" v3="' + v3 + '" pid="1" p1="' + pIdx + '"/>');
            }
        });

        const colorGroupItems = colorList.map(function (color) {
            return '<m:color color="' + color + '"/>';
        }).join('');

        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
            'xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n' +
            '<resources>' +
            '<m:colorgroup id="1">' + colorGroupItems + '</m:colorgroup>' +
            '<object id="2" type="model">' +
            '<mesh>' +
            '<vertices>' + vertexLines.join('') + '</vertices>' +
            '<triangles>' + triangleLines.join('') + '</triangles>' +
            '</mesh>' +
            '</object>' +
            '</resources>' +
            '<build><item objectid="2"/></build>' +
            '</model>\n';
    }

    function buildContentTypesXML() {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
            '</Types>\n';
    }

    function buildRelsXML() {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
            '</Relationships>\n';
    }

    // modelGroup: exportSTL()과 동일하게 받는 THREE.Group(부품마다 THREE.Mesh, 색은
    // material.color 또는 material 배열+geometry.groups로 표현). 그 자리에서 바로 다운로드까지
    // 실행한다(exportSTL과 동일한 사용 패턴).
    function export3MF(modelGroup, filename) {
        if (!modelGroup) return;
        const parts = collectPartsFromGroup(modelGroup);
        if (!parts.length) return;

        const zipBytes = buildZip([
            { name: '[Content_Types].xml', data: strToBytes(buildContentTypesXML()) },
            { name: '_rels/.rels', data: strToBytes(buildRelsXML()) },
            { name: '3D/3dmodel.model', data: strToBytes(buildModelXML(parts)) }
        ]);

        const blob = new Blob([zipBytes], { type: 'model/3mf' });
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        document.body.removeChild(link);
    }

    return { export3MF: export3MF };
})();

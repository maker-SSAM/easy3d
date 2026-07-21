// 모든 파라메트릭 디자인 편집 페이지가 공유하는 뷰어 셸 + Three.js 스캐폴드.
// 디자인 페이지는 이 파일이 만드는 구조 위에 자기 컨트롤/모델링 로직만 얹는다.
window.ParametricCore = (function () {
    const DEFAULT_CAMERA_PRESETS = {
        TOP: [0, 220, 0],
        FRONT: [0, 40, 220],
        SIDE: [220, 40, 0],
        ISO: [120, 150, 200]
    };

    // #controls / #resizer / #viewer / #viewcube-container DOM을 생성해 rootEl에 삽입.
    // 모든 디자인 페이지에서 동일한 구조가 나오도록 마크업을 코드로 고정한다.
    function mountEditorShell(rootEl, viewCubeLabels, options) {
        const opts = options || {};
        const homeUrl = opts.homeUrl || '../index.html';
        const labels = viewCubeLabels || {
            TOP: '윗면(평면도)',
            FRONT: '정면(정면도)',
            SIDE: '측면(우측면도)',
            ISO: '기본입체'
        };

        const controlsEl = document.createElement('div');
        controlsEl.id = 'controls';

        // #controls는 header(홈 버튼) / body(스크롤 영역) / footer(다운로드 등 액션 버튼)
        // 3단 flex 레이아웃이다 — body만 스크롤되고, header/footer는 컨트롤 패널 내용이
        // 아무리 길어져도 화면에 항상 고정으로 보인다. header/footer는 배경색을 body보다
        // 살짝 진하게 줘서 "이 부분은 고정돼 있다"는 걸 시각적으로 알 수 있게 한다.
        const controlsHeaderEl = document.createElement('div');
        controlsHeaderEl.className = 'controls-header';
        controlsEl.appendChild(controlsHeaderEl);

        const homeLink = document.createElement('a');
        homeLink.className = 'home-link';
        homeLink.href = homeUrl;
        homeLink.textContent = '← 메인화면으로';
        controlsHeaderEl.appendChild(homeLink);

        // "초기화" 버튼 — 리셋 동작 자체는 갤러리마다 기본값이 달라서 각 디자인 페이지가
        // 직접 정의해야 한다. 여기서는 홈 버튼 옆에 나란히 놓이는 버튼 자리만 만들어준다.
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = '초기화';
        controlsHeaderEl.appendChild(resetBtn);

        const controlsBodyEl = document.createElement('div');
        controlsBodyEl.className = 'controls-body';
        controlsEl.appendChild(controlsBodyEl);

        // 다운로드 버튼처럼 항상 화면 하단에 고정으로 보여야 하는 액션 버튼을 넣는 자리.
        // 디자인 페이지는 다운로드 버튼을 controlsBodyEl이 아니라 여기에 넣어야 한다.
        const controlsFooterEl = document.createElement('div');
        controlsFooterEl.className = 'controls-footer';
        controlsEl.appendChild(controlsFooterEl);

        const resizerEl = document.createElement('div');
        resizerEl.id = 'resizer';

        const viewerEl = document.createElement('div');
        viewerEl.id = 'viewer';

        const cubeContainer = document.createElement('div');
        cubeContainer.id = 'viewcube-container';

        const cubeTitle = document.createElement('div');
        cubeTitle.className = 'viewcube-title';
        cubeTitle.textContent = '시점 변경';
        cubeContainer.appendChild(cubeTitle);

        const viewTypes = ['TOP', 'FRONT', 'SIDE', 'ISO'];
        const cubeButtons = {};
        viewTypes.forEach(function (viewType) {
            const btn = document.createElement('button');
            btn.className = 'cube-btn';
            btn.textContent = labels[viewType];
            btn.dataset.view = viewType;
            cubeContainer.appendChild(btn);
            cubeButtons[viewType] = btn;
        });

        viewerEl.appendChild(cubeContainer);

        rootEl.appendChild(controlsEl);
        rootEl.appendChild(resizerEl);
        rootEl.appendChild(viewerEl);

        return {
            controlsEl: controlsEl,
            controlsHeaderEl: controlsHeaderEl,
            controlsBodyEl: controlsBodyEl,
            controlsFooterEl: controlsFooterEl,
            resetBtn: resetBtn,
            resizerEl: resizerEl,
            viewerEl: viewerEl,
            cubeButtons: cubeButtons
        };
    }

    // scene/camera/renderer/조명/그리드/바닥/애니메이션 루프 초기화.
    function initViewer(viewerEl, options) {
        const opts = options || {};
        const initialPosition = opts.initialCameraPosition || DEFAULT_CAMERA_PRESETS.ISO;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe0e0e0);

        const camera = new THREE.PerspectiveCamera(45, viewerEl.clientWidth / viewerEl.clientHeight, 1, 1000);
        camera.position.set(initialPosition[0], initialPosition[1], initialPosition[2]);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 그림자 경계를 부드럽게
        // sRGBEncoding/ACESFilmicToneMapping을 다시 시도해봤지만(조명 세기를 낮춘 뒤에도)
        // 여전히 색이 하얗게 씻겨나갔다 — 실측(픽셀 색상 비교)으로 재현 확인함. 원인은 빛
        // 세기가 아니라, 색상 입력이 sRGB로 제대로 인식되지 않은 상태에서 출력에 sRGB
        // 인코딩을 한 번 더 씌워 감마 보정이 이중으로 걸리는 것으로 보인다 — 제대로 고치려면
        // THREE.ColorManagement와 모든 색상 지정 방식을 함께 손봐야 해서 범위가 커진다.
        // 안전하게 기존 색 재현 방식(선형)을 유지한다.
        viewerEl.insertBefore(renderer.domElement, viewerEl.firstChild);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.zoomSpeed = 0.5; // 마우스 휠 확대/축소 속도를 기본값의 절반으로

        // 하늘/바닥 느낌으로 은은하게 전체를 채워주는 조명 (평평한 회색 AmbientLight 대체)
        // 아래 조명 값들은 mountLightTuningPanel()로 실제 눈으로 보면서 확정한 값이다 —
        // PMREM 환경광(아래)이 추가된 뒤로는 방향광 세기를 낮게 잡아야 전체적으로 과하게
        // 밝지 않다.
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x999999, 0.2);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
        // 높이각 50°, 방위각 37°, 반지름 180(그림자 카메라 범위 안에 들도록)의 위치.
        dirLight.position.set(92.4, 137.9, 69.6);
        dirLight.castShadow = true;
        // 그림자 카메라(그림자가 계산되는 범위)의 기본값은 아주 작아서(-5~5), 모델이 그 밖으로
        // 나가는 순간 그림자 계산 경계선이 바닥에 사각형 테두리로 그대로 보이는 문제가 있었다.
        // 그리드 크기(300)에 맞춰 범위를 넉넉히 키운다.
        dirLight.shadow.camera.left = -220;
        dirLight.shadow.camera.right = 220;
        dirLight.shadow.camera.top = 220;
        dirLight.shadow.camera.bottom = -220;
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 600;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.bias = -0.0015; // 그림자 여드름(shadow acne) 방지
        scene.add(dirLight);

        // 주 조명 반대편에서 살짝 채워주는 보조광 — 그림자 쪽이 완전히 새까매지지 않도록
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
        fillLight.position.set(-120, 90, -80);
        scene.add(fillLight);

        // 방향광 하나만으로는 표면에 은은한 반사/하이라이트가 안 생겨서 밋밋해 보인다.
        // PMREMGenerator로 가상의 방(RoomEnvironment)을 IBL(이미지 기반 조명) 큐브맵으로
        // 구워서 scene.environment에 넣으면, MeshStandardMaterial이 이 반사 정보를 받아서
        // 훨씬 입체감 있게 보인다 — scene.background(바닥 배경색)에는 영향을 주지 않고
        // 재질의 반사에만 반영된다. (RoomEnvironment.js 애드온 스크립트 태그가 있는
        // 페이지에서만 동작하도록 방어적으로 체크.)
        if (THREE.RoomEnvironment && THREE.PMREMGenerator) {
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            const roomEnv = new THREE.RoomEnvironment();
            scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
            roomEnv.dispose();
            pmremGenerator.dispose();
        }

        scene.add(new THREE.GridHelper(300, 30, 0x888888, 0xbbbbbb));
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0 }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        function onWindowResize() {
            if (!viewerEl.clientWidth || !viewerEl.clientHeight) return; // 레이아웃이 아직 확정 안 된 순간(0 크기) 무시
            camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
        }
        // 실제로 겪은 문제: renderer 최초 생성 시점에 #viewer의 레이아웃(flex)이 아직 확정되기
        // 전이라 clientWidth/clientHeight가 0으로 읽혀서 캔버스가 0x0 크기로 굳어버렸다.
        // 그 뒤로는 브라우저 창 자체를 리사이즈해야만 정상 크기로 복구됐다 — 왼쪽 컨트롤
        // 패널 너비를 드래그로 바꿔도(브라우저 창 크기는 그대로라 'resize' 이벤트가 안 뜸)
        // #viewer 실제 크기와 캔버스 크기가 어긋나 시점 큐브가 엉뚱한 곳에 있는 것처럼
        // 보였다. ResizeObserver는 #viewer 자체의 실제 크기 변화를 직접 감시하므로,
        // 레이아웃이 뒤늦게 확정되는 최초 로딩 시점과 컨트롤 패널 리사이즈 양쪽 다 잡아낸다.
        const resizeObserver = new ResizeObserver(onWindowResize);
        resizeObserver.observe(viewerEl);

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        return {
            scene: scene, camera: camera, renderer: renderer, controls: controls, onWindowResize: onWindowResize,
            // 화면 튜닝 패널(조명/그림자 실시간 조절 등)이 직접 값을 바꿀 수 있도록 참조를 노출.
            lights: { hemi: hemiLight, key: dirLight, fill: fillLight },
            floor: floor
        };
    }

    // 컨트롤 패널 폭을 드래그로 조절하는 리사이저. 조절 후 onResize 콜백으로 뷰어 크기 갱신.
    function setupResizer(resizerEl, controlsEl, onResize) {
        let isDragging = false;
        resizerEl.addEventListener('mousedown', function () {
            isDragging = true;
            resizerEl.classList.add('active');
        });
        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            let newWidth = e.clientX;
            if (newWidth < 280) newWidth = 280;
            if (newWidth > 500) newWidth = 500;
            controlsEl.style.width = newWidth + 'px';
            if (onResize) onResize();
        });
        document.addEventListener('mouseup', function () {
            if (isDragging) {
                isDragging = false;
                resizerEl.classList.remove('active');
            }
        });
    }

    // 뷰큐브 버튼 클릭 시 카메라를 프리셋 위치로 리셋.
    function bindViewCube(cubeButtons, camera, controls, presets) {
        const cameraPresets = presets || DEFAULT_CAMERA_PRESETS;
        Object.keys(cubeButtons).forEach(function (viewType) {
            cubeButtons[viewType].addEventListener('click', function () {
                resetCameraTo(camera, controls, cameraPresets[viewType]);
            });
        });
    }

    function resetCameraTo(camera, controls, position) {
        controls.reset();
        camera.position.set(position[0], position[1], position[2]);
        controls.update();
    }

    function exportSTL(modelGroup, filename) {
        if (!modelGroup) return;
        // 화면 표시는 three.js 관례대로 Y-up으로 만드는데, 3D 프린트 슬라이서(큐라, 프루사슬라이서
        // 등)는 보통 Z축을 "위"로 본다(Z-up). 그대로 내보내면 모델이 옆으로 누운 것처럼 보인다
        // — 실제로 겪은 문제. 내보낼 때만 지오메트리를 복제해서 Z-up으로 회전시키고, 화면에
        // 보이는 원본(modelGroup)은 건드리지 않는다.
        const exportGroup = new THREE.Group();
        modelGroup.traverse(function (obj) {
            if (obj.isMesh) {
                const geo = obj.geometry.clone();
                geo.rotateX(Math.PI / 2); // Y-up(화면) -> Z-up(슬라이서 관례)
                exportGroup.add(new THREE.Mesh(geo, obj.material));
            }
        });

        const exporter = new THREE.STLExporter();
        const result = exporter.parse(exportGroup, { binary: true });
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        document.body.removeChild(link);
    }

    // 조명 값을 실시간으로 조절해보면서 마음에 드는 값을 찾기 위한 임시 튜닝 패널.
    // 값을 확정했으면 core.js의 hemiLight/dirLight/fillLight/floor 기본값에 그 숫자를
    // 반영하고, 각 갤러리 페이지에서 이 함수를 부르는 줄은 지워도 된다(패널 자체는 화면
    // 표시용 상태만 바꿀 뿐 core.js 기본값을 고치지는 않는다).
    function mountLightTuningPanel(viewer) {
        const lights = viewer.lights;
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed; top:12px; right:12px; z-index:1000; width:220px;' +
            'background:rgba(20,20,24,0.85); color:#fff; font:12px/1.4 sans-serif; padding:12px 14px;' +
            'border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.3);';

        function row(id, label, min, max, step, value) {
            return '<div style="margin-bottom:8px;">' +
                '<label style="display:flex; justify-content:space-between;">' +
                '<span>' + label + '</span><span id="' + id + 'Val">' + value + '</span></label>' +
                '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" style="width:100%;">' +
                '</div>';
        }

        panel.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
            '<strong>조명 튜닝</strong><button id="lightPanelClose" style="background:none; border:none; color:#fff; cursor:pointer; font-size:14px;">✕</button>' +
            '</div>' +
            row('hemiIntensity', '반구광(Hemisphere)', 0, 2, 0.05, lights.hemi.intensity) +
            row('keyIntensity', '주광(Key)', 0, 3, 0.05, lights.key.intensity) +
            row('fillIntensity', '보조광(Fill)', 0, 2, 0.05, lights.fill.intensity) +
            row('envIntensity', '환경 반사(Environment)', 0, 3, 0.05, 1) +
            row('floorOpacity', '바닥 그림자 진하기', 0, 1, 0.05, viewer.floor.material.opacity) +
            '<button id="lightPanelCopy" style="width:100%; margin-top:4px; padding:6px; cursor:pointer;">현재 값 복사</button>' +
            '<textarea id="lightPanelOutput" readonly style="width:100%; height:70px; margin-top:6px; font:11px monospace; box-sizing:border-box;"></textarea>';

        document.body.appendChild(panel);

        // envMapIntensity는 scene 전체가 아니라 재질 하나하나에 붙는 값이라, 슬라이더를
        // 움직일 때마다 현재 화면에 있는 모든 메시를 훑어서 즉시 적용한다. (참고: 이 값을
        // 바꾼 뒤 갤러리 쪽에서 모델을 다시 만들면(updateModel) 새로 생기는 재질은 기본값
        // 1로 돌아가므로, 그럴 땐 슬라이더를 한 번 더 움직여서 다시 적용해주면 된다.)
        let envIntensity = 1;
        function applyEnvIntensity(v) {
            envIntensity = v;
            viewer.scene.traverse(function (obj) {
                if (!obj.isMesh || !obj.material) return;
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(function (m) { if ('envMapIntensity' in m) m.envMapIntensity = envIntensity; });
            });
        }

        function bind(id, onInput) {
            const input = panel.querySelector('#' + id);
            const label = panel.querySelector('#' + id + 'Val');
            input.addEventListener('input', function () {
                const v = parseFloat(input.value);
                label.textContent = v;
                onInput(v);
            });
        }

        bind('hemiIntensity', function (v) { lights.hemi.intensity = v; });
        bind('keyIntensity', function (v) { lights.key.intensity = v; });
        bind('fillIntensity', function (v) { lights.fill.intensity = v; });
        bind('envIntensity', function (v) { applyEnvIntensity(v); });
        bind('floorOpacity', function (v) { viewer.floor.material.opacity = v; });

        panel.querySelector('#lightPanelCopy').addEventListener('click', function () {
            const text = 'hemi: ' + lights.hemi.intensity +
                '\nkey: ' + lights.key.intensity +
                '\nfill: ' + lights.fill.intensity +
                '\nenvMapIntensity: ' + envIntensity +
                '\nfloor.opacity: ' + viewer.floor.material.opacity;
            panel.querySelector('#lightPanelOutput').value = text;
            if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
        });

        panel.querySelector('#lightPanelClose').addEventListener('click', function () {
            document.body.removeChild(panel);
        });

        return panel;
    }

    return {
        DEFAULT_CAMERA_PRESETS: DEFAULT_CAMERA_PRESETS,
        mountEditorShell: mountEditorShell,
        initViewer: initViewer,
        setupResizer: setupResizer,
        bindViewCube: bindViewCube,
        resetCameraTo: resetCameraTo,
        exportSTL: exportSTL,
        mountLightTuningPanel: mountLightTuningPanel
    };
})();

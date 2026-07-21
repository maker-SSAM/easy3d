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
        // 주의: sRGBEncoding/ACESFilmicToneMapping을 같이 켜봤더니 디자인 색상이 하얗게
        // 씻겨나가는(밝게 날아가는) 부작용이 있어서 뺐다 — 사이트 전체 색상에 영향을 주는
        // 변경이라 안전하게 기존 색 재현 방식(선형)을 유지한다.
        viewerEl.insertBefore(renderer.domElement, viewerEl.firstChild);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.zoomSpeed = 0.5; // 마우스 휠 확대/축소 속도를 기본값의 절반으로

        // 하늘/바닥 느낌으로 은은하게 전체를 채워주는 조명 (평평한 회색 AmbientLight 대체)
        // 아래 조명 값들은 갤러리1의 화면 설정 튜닝 패널로 실제 눈으로 보면서 확정한 값이다.
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x999999, 0.3);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
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
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-120, 90, -80);
        scene.add(fillLight);

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

    return {
        DEFAULT_CAMERA_PRESETS: DEFAULT_CAMERA_PRESETS,
        mountEditorShell: mountEditorShell,
        initViewer: initViewer,
        setupResizer: setupResizer,
        bindViewCube: bindViewCube,
        resetCameraTo: resetCameraTo,
        exportSTL: exportSTL
    };
})();

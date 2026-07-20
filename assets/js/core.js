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
    function mountEditorShell(rootEl, viewCubeLabels) {
        const labels = viewCubeLabels || {
            TOP: '윗면 (탑다운)',
            FRONT: '정면',
            SIDE: '측면',
            ISO: '기본 입체'
        };

        const controlsEl = document.createElement('div');
        controlsEl.id = 'controls';

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

        return { controlsEl: controlsEl, resizerEl: resizerEl, viewerEl: viewerEl, cubeButtons: cubeButtons };
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
        viewerEl.insertBefore(renderer.domElement, viewerEl.firstChild);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0x555555));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(80, 150, 60);
        dirLight.castShadow = true;
        scene.add(dirLight);

        scene.add(new THREE.GridHelper(300, 30, 0x888888, 0xbbbbbb));
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0.2 }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        function onWindowResize() {
            camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
        }
        window.addEventListener('resize', onWindowResize, false);

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        return { scene: scene, camera: camera, renderer: renderer, controls: controls, onWindowResize: onWindowResize };
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
        const exporter = new THREE.STLExporter();
        const result = exporter.parse(modelGroup, { binary: true });
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

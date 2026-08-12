// 모든 파라메트릭 디자인 편집 페이지가 공유하는 뷰어 셸 + Three.js 스캐폴드.
// 디자인 페이지는 이 파일이 만드는 구조 위에 자기 컨트롤/모델링 로직만 얹는다.
window.ParametricCore = (function () {
    // TOP은 원래 [0, 220, 0]이었다 — 카메라가 타깃 바로 위, 월드 Y축(위쪽 방향)과
    // 완전히 일직선에 놓이는 위치다. 실제로 겪은 문제: OrbitControls.update()는 카메라
    // 위치를 구면좌표(phi/theta)로 바꿔서 회전을 계산하는데, 카메라가 정확히 극점(pole)에
    // 있으면 방위각(theta)이 수학적으로 정의되지 않는다 — x/z가 완전히 0이면 atan2(0, 0)이
    // 되는 셈이라, 부동소수점 반올림 오차가 그때그때 아주 조금씩 다른 theta를 만들어내고,
    // 그게 "가끔씩" 뷰가 비뚤어져 보이는 원인이었다. 사실상 안 보일 만큼(220mm 중 0.02mm,
    // 약 0.005˚) 살짝 z축으로 비켜서 극점을 피하면, 방위각이 항상 일정한 값으로 고정돼서
    // 매번 정확히 같은 "완전한 윗면" 시점이 재현된다.
    const DEFAULT_CAMERA_PRESETS = {
        TOP: [0, 220, 0.02],
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
        //
        // header와 footer를 controlsTopBarEl로 한 번 더 감싸두는 이유는 모바일 전용이다 —
        // core.css의 480px 미디어 쿼리에서 이 래퍼만 실제 박스(가로 flex row)로 켜고 header/
        // footer/format-picker는 display:contents로 투명하게 만들어서, 그 안의 버튼들(홈/
        // 초기화/STL/3MF/다운로드)이 전부 한 줄로 나란히 붙게 한다. 데스크톱에서는 이 래퍼가
        // display:contents라 있으나 마나라, header가 맨 위/footer가 맨 아래(각각 CSS order로
        // 지정)라는 기존 배치가 그대로 유지된다.
        const controlsTopBarEl = document.createElement('div');
        controlsTopBarEl.className = 'controls-topbar';
        controlsEl.appendChild(controlsTopBarEl);

        const controlsHeaderEl = document.createElement('div');
        controlsHeaderEl.className = 'controls-header';
        controlsTopBarEl.appendChild(controlsHeaderEl);

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
        controlsTopBarEl.appendChild(controlsFooterEl);

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

        // "시점 변경" 구간과 아래쪽 기능 버튼들을 구분선으로 나눈다.
        const modeDivider = document.createElement('div');
        modeDivider.className = 'viewcube-divider';
        cubeContainer.appendChild(modeDivider);

        const modeTitle = document.createElement('div');
        modeTitle.className = 'viewcube-title';
        modeTitle.textContent = '모드 변경';
        cubeContainer.appendChild(modeTitle);

        // 다크모드 토글 — theme-core.js가 모든 편집화면 페이지에 core.js보다 먼저 로드되어
        // 있다는 전제(버튼 자체는 그 파일이 만들고, 여기서는 자리만 배치).
        if (window.ThemeCore) {
            cubeContainer.appendChild(window.ThemeCore.createToggleButton());
        }

        const dimensionToggleBtn = document.createElement('button');
        dimensionToggleBtn.type = 'button';
        dimensionToggleBtn.className = 'cube-btn';
        cubeContainer.appendChild(dimensionToggleBtn);

        const screenshotBtn = document.createElement('button');
        screenshotBtn.type = 'button';
        screenshotBtn.className = 'cube-btn';
        screenshotBtn.textContent = '📷 화면 캡쳐';
        cubeContainer.appendChild(screenshotBtn);

        viewerEl.appendChild(cubeContainer);

        // 모바일 화면(480px 이하, core.css의 미디어 쿼리)에서는 이 패널이 좁은 뷰어를 너무
        // 많이 가려서, 기본은 접어두고 이 작은 버튼으로만 펼치고 접게 한다. 데스크톱에서는
        // core.css가 이 버튼을 숨기고 패널을 항상 펼쳐진 상태로 보여주므로 동작에 영향이 없다.
        const cubeToggleBtn = document.createElement('button');
        cubeToggleBtn.type = 'button';
        cubeToggleBtn.id = 'viewcube-toggle';
        cubeToggleBtn.textContent = '⚙️';
        cubeToggleBtn.setAttribute('aria-label', '시점/모드 패널 열기');
        cubeToggleBtn.addEventListener('click', function () {
            const open = cubeContainer.classList.toggle('viewcube-open');
            cubeToggleBtn.textContent = open ? '✕' : '⚙️';
            cubeToggleBtn.setAttribute('aria-label', open ? '시점/모드 패널 닫기' : '시점/모드 패널 열기');
        });
        viewerEl.appendChild(cubeToggleBtn);

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
            cubeButtons: cubeButtons,
            dimensionToggleBtn: dimensionToggleBtn,
            screenshotBtn: screenshotBtn
        };
    }

    // scene/camera/renderer/조명/그리드/바닥/애니메이션 루프 초기화.
    function initViewer(viewerEl, options) {
        const opts = options || {};
        const initialPosition = opts.initialCameraPosition || DEFAULT_CAMERA_PRESETS.ISO;

        const scene = new THREE.Scene();
        // 색상 값은 core.css의 --scene-bg 변수(라이트/다크 테마별로 값이 다름)에서 읽어온다 —
        // CSS 쪽 색상표 하나만 관리하면 되고, 여기서는 그 값을 읽어 THREE.Color로 바꾸기만 한다.
        function readSceneBgColor() {
            const varValue = getComputedStyle(document.documentElement).getPropertyValue('--scene-bg').trim();
            return new THREE.Color(varValue || '#e0e0e0');
        }
        scene.background = readSceneBgColor();
        // 다크모드 토글 시(themechange 이벤트) 이미 만들어진 씬의 배경색도 즉시 갱신한다.
        window.addEventListener('themechange', function () {
            scene.background = readSceneBgColor();
        });

        const camera = new THREE.PerspectiveCamera(45, viewerEl.clientWidth / viewerEl.clientHeight, 1, 1000);
        camera.position.set(initialPosition[0], initialPosition[1], initialPosition[2]);

        // preserveDrawingBuffer:true — 화면 캡쳐(captureScreenshot) 기능이 렌더 직후
        // domElement.toDataURL()로 픽셀을 읽어가야 하는데, 기본값(false)이면 브라우저가
        // 다음 프레임을 위해 드로잉 버퍼를 이미 지워버려서 캡쳐가 빈 화면으로 나올 수 있다.
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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

        const gridHelper = new THREE.GridHelper(300, 30, 0x888888, 0xbbbbbb);
        // 치수선(바닥 높이=y=0 근처를 지나는 가로/세로 선)과 그리드가 같은 y=0 평면에 겹쳐서,
        // depthTest:true인 치수선이 그리드 격자선에 부분적으로 가려 끊겨 보이는 문제가 있었다.
        // depthWrite만 끄면 그리드는 여전히 모델(불투명 메시)에는 정상적으로 가려지면서
        // (모델 쪽 depth 기록에는 영향 안 줌), 그리드 자신의 depth는 기록하지 않아 나중에
        // 그려지는 치수선을 가리지 않는다.
        gridHelper.material.depthWrite = false;
        scene.add(gridHelper);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0 }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        // opacity:0이라 눈에는 안 보이지만, depthWrite 기본값(true)이 살아있으면 depth buffer에는
        // 여전히 기록된다 — 치수선(updateDimensionOverlay)이 depthTest:true로 바뀐 뒤로, 바닥
        // 높이(y=0) 아래로 내려가는 치수선 눈금/숫자 라벨이 이 안 보이는 바닥판에 가려 사라지는
        // 문제가 생겼다. 바닥은 그림자만 받으면 되고 depth buffer에 낄 이유가 없으므로 끈다.
        floor.material.depthWrite = false;
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
            floor: floor,
            // 화면 캡쳐 시 바닥 그리드를 잠깐 숨기기 위해 필요(captureScreenshot).
            grid: gridHelper
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

    // 작업 중인 모델 옆에 가로(X)/세로(깊이, Z)/높이(Y) 치수선을 그려 보여준다. 모든 갤러리가
    // 공유하는 단일 오버레이 그룹(dimensionOverlayGroup)을 이 모듈이 직접 들고 있다가, 모델이
    // 갱신될 때마다(updateModel 안에서 scene.add(currentGroup) 직후) updateDimensionOverlay를
    // 다시 부르면 이전 오버레이를 지우고 새 바운딩박스 기준으로 다시 그린다. 페이지당 스크립트가
    // 하나씩만 돌기 때문에 모듈 전역 변수 하나로 충분하다.
    let dimensionOverlayGroup = null;
    // 사용자가 치수선 켜기/끄기 토글로 고른 상태 — updateDimensionOverlay가 모델 갱신마다
    // 오버레이를 새로 만들 때마다 이 값을 그대로 이어받아야 토글한 상태가 유지된다.
    let dimensionOverlayVisible = true;

    // three.js에는 내장 텍스트가 없어서, 캔버스에 숫자를 그려 텍스처로 만든 뒤 항상 카메라를
    // 보는 Sprite에 입힌다(CSS2DRenderer를 새로 얹는 대신 기존 스크립트 구성 그대로 쓰기 위함).
    // worldHeight는 스프라이트의 월드 공간 크기(mm 단위) — 모델 크기에 비례해서 정해준다.
    function makeDimensionLabel(text, worldHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 56px sans-serif';
        ctx.fillStyle = '#e53935';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        // depthTest를 켜서, 라벨보다 카메라에 더 가까운 모델 표면이 있으면 실제로 가려지게 한다
        // (시점을 돌렸을 때 모델 뒤로 넘어간 치수선이 그대로 비쳐 보이면 비현실적이라는 피드백 반영).
        const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 999;
        const aspect = canvas.width / canvas.height;
        sprite.scale.set(worldHeight * aspect, worldHeight, 1);
        return sprite;
    }

    // 바운딩박스 바깥에 가로/세로/높이 치수선 3개를 그린다. 각 치수선은 모델 모서리에서
    // 뻗어나온 옅은 보조선(extension line) + 실제 치수를 나타내는 선 + 양 끝 눈금(tick) +
    // 반올림한 mm 숫자 라벨로 구성된다(제도 도면의 치수선 표기 방식과 동일).
    function buildDimensionAnnotations(box) {
        const group = new THREE.Group();
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        // 카메라 기본 시점이 이 여백까지 감안해서 넓게 잡혀있지 않다 — 꽃병처럼 키가 큰
        // 모델에서는 여백을 너무 넉넉히 주면 라벨이 화면 밖으로 나갈 수 있어, 최대한
        // 타이트하게 잡는다(그래도 아주 큰 모델은 화면을 축소해야 라벨이 다 보일 수 있음).
        const gap = maxDim * 0.08 + 2.5; // 모델 표면에서 치수선까지 띄우는 거리
        const tick = maxDim * 0.015 + 0.6; // 치수선 양 끝 눈금 길이의 절반
        const labelSize = Math.max(maxDim * 0.07, 4); // 숫자 라벨의 월드 공간 높이
        const lineColor = 0xe53935;
        // depthTest를 켜서 모델에 가려지는 부분은 실제로 안 보이게 한다(라벨과 동일한 이유).
        const lineMat = new THREE.LineBasicMaterial({ color: lineColor, depthTest: true, transparent: true });
        const extMat = new THREE.LineBasicMaterial({ color: lineColor, opacity: 0.4, transparent: true, depthTest: true });

        function line(a, b, mat) {
            const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
            const obj = new THREE.Line(geo, mat || lineMat);
            obj.renderOrder = 998;
            group.add(obj);
        }

        function label(text, pos) {
            const sprite = makeDimensionLabel(text, labelSize);
            sprite.position.copy(pos);
            group.add(sprite);
        }

        // 가로(X): 모델 앞쪽(Z 최대면, 기본 ISO 카메라에서 가까운 쪽) 바닥 높이에 띄운다.
        // Z 최소면(카메라에서 먼 쪽, 뒤쪽)에 두면 처음 보이는 화면 기준으로 모델 뒤에 숨어
        // 잘 안 보인다는 피드백을 반영해 앞쪽으로 옮겼다.
        {
            const ly = box.min.y, lz = box.max.z + gap;
            const p1 = new THREE.Vector3(box.min.x, ly, lz);
            const p2 = new THREE.Vector3(box.max.x, ly, lz);
            line(p1, p2);
            line(new THREE.Vector3(p1.x, ly - tick, lz), new THREE.Vector3(p1.x, ly + tick, lz));
            line(new THREE.Vector3(p2.x, ly - tick, lz), new THREE.Vector3(p2.x, ly + tick, lz));
            line(new THREE.Vector3(box.min.x, box.min.y, box.max.z), p1, extMat);
            line(new THREE.Vector3(box.max.x, box.min.y, box.max.z), p2, extMat);
            label(Math.round(size.x) + 'mm', new THREE.Vector3((box.min.x + box.max.x) / 2, ly, lz + labelSize * 0.5));
        }

        // 세로/깊이(Z): 모델 오른쪽(X 최대면) 바닥 높이에 띄운다.
        {
            const lx = box.max.x + gap, ly = box.min.y;
            const p1 = new THREE.Vector3(lx, ly, box.min.z);
            const p2 = new THREE.Vector3(lx, ly, box.max.z);
            line(p1, p2);
            line(new THREE.Vector3(lx, ly - tick, p1.z), new THREE.Vector3(lx, ly + tick, p1.z));
            line(new THREE.Vector3(lx, ly - tick, p2.z), new THREE.Vector3(lx, ly + tick, p2.z));
            line(new THREE.Vector3(box.max.x, box.min.y, box.min.z), p1, extMat);
            line(new THREE.Vector3(box.max.x, box.min.y, box.max.z), p2, extMat);
            label(Math.round(size.z) + 'mm', new THREE.Vector3(lx + labelSize * 0.5, ly, (box.min.z + box.max.z) / 2));
        }

        // 높이(Y): 모델 뒤쪽 왼쪽 모서리(X 최소, Z 최대)에 세로로 띄운다.
        {
            const lx = box.min.x - gap, lz = box.max.z + gap;
            const p1 = new THREE.Vector3(lx, box.min.y, lz);
            const p2 = new THREE.Vector3(lx, box.max.y, lz);
            line(p1, p2);
            line(new THREE.Vector3(lx - tick, p1.y, lz), new THREE.Vector3(lx + tick, p1.y, lz));
            line(new THREE.Vector3(lx - tick, p2.y, lz), new THREE.Vector3(lx + tick, p2.y, lz));
            line(new THREE.Vector3(box.min.x, box.min.y, box.max.z), p1, extMat);
            line(new THREE.Vector3(box.min.x, box.max.y, box.max.z), p2, extMat);
            label(Math.round(size.y) + 'mm', new THREE.Vector3(lx - labelSize * 0.5, (box.min.y + box.max.y) / 2, lz));
        }

        return group;
    }

    function clearDimensionOverlay() {
        if (!dimensionOverlayGroup) return;
        if (dimensionOverlayGroup.parent) dimensionOverlayGroup.parent.remove(dimensionOverlayGroup);
        dimensionOverlayGroup.traverse(function (obj) {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        });
        dimensionOverlayGroup = null;
    }

    // targetObject(현재 화면에 있는 모델 그룹/메시)의 바운딩박스를 기준으로 치수선을 다시 그린다.
    // targetObject가 없으면(모델이 비워졌으면) 기존 치수선만 지우고 끝낸다. 갤러리 쪽에서는
    // updateModel()이 scene.add(currentGroup) 직후 이 함수를 부르고, disposeCurrentThreeMesh()
    // 안에서도 (targetObject 없이) 불러서 모델이 사라질 때 치수선도 같이 지운다.
    function updateDimensionOverlay(scene, targetObject) {
        clearDimensionOverlay();
        if (!targetObject) return;
        const box = new THREE.Box3().setFromObject(targetObject);
        if (box.isEmpty()) return;
        dimensionOverlayGroup = buildDimensionAnnotations(box);
        dimensionOverlayGroup.visible = dimensionOverlayVisible;
        scene.add(dimensionOverlayGroup);
    }

    // 치수선 켜기/끄기 버튼(mountEditorShell의 dimensionToggleBtn)에 연결한다. 버튼 라벨은
    // "지금 누르면 무슨 일이 일어나는지"를 보여준다(테마 토글과 같은 관례).
    function bindDimensionToggle(button) {
        function updateLabel() {
            button.textContent = dimensionOverlayVisible ? '📏 치수선 끄기' : '📏 치수선 켜기';
        }
        updateLabel();
        button.addEventListener('click', function () {
            dimensionOverlayVisible = !dimensionOverlayVisible;
            if (dimensionOverlayGroup) dimensionOverlayGroup.visible = dimensionOverlayVisible;
            updateLabel();
        });
    }

    // 화면 캡쳐 버튼(mountEditorShell의 screenshotBtn)에 연결한다. 바닥 그리드와 치수선을
    // 캡쳐하는 순간만 잠깐 숨겨서 모델만 깔끔하게 찍고, 찍은 뒤 원래 표시 상태로 되돌린다.
    function bindScreenshotButton(button, viewer, filename) {
        button.addEventListener('click', function () {
            const grid = viewer.grid;
            const gridWasVisible = grid.visible;
            const dimWasVisible = dimensionOverlayGroup ? dimensionOverlayGroup.visible : null;

            grid.visible = false;
            if (dimensionOverlayGroup) dimensionOverlayGroup.visible = false;
            viewer.renderer.render(viewer.scene, viewer.camera);
            const dataURL = viewer.renderer.domElement.toDataURL('image/png');

            grid.visible = gridWasVisible;
            if (dimensionOverlayGroup) dimensionOverlayGroup.visible = dimWasVisible;
            viewer.renderer.render(viewer.scene, viewer.camera);

            const link = document.createElement('a');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.href = dataURL;
            link.download = filename || '3d-모델-캡쳐.png';
            link.click();
            document.body.removeChild(link);
        });
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

    // containerEl(보통 shell.controlsBodyEl) 안의 모든 <input type="range"> 슬라이더에
    // "−/슬라이더/+" 단계 버튼을 씌우고, 값 표시용 <span id="valX">를 클릭하면 숫자를 직접
    // 입력할 수 있게 만든다. 갤러리마다 슬라이더가 수십 개씩 있어서 마크업을 일일이 손보는
    // 대신, 각 컨트롤 패널을 한 번 만들고 난 직후 이 함수 한 줄만 불러주면 전부 적용된다.
    //
    // 값 표시 span은 관례상 슬라이더 id 앞에 "val"을 붙이고 첫 글자를 대문자로 바꾼 이름을
    // 쓴다(id="size1" -> id="valSize1") — 이 프로젝트의 모든 갤러리가 이미 이 규칙을 따르고
    // 있어서, id 문자열만으로 대응되는 표시 span을 찾을 수 있다. 각 갤러리의 updateModel()이
    // 그 span의 textContent/innerText를 계속 자기 값으로 다시 채워주므로(기존 코드 변경 없음),
    // 여기서는 슬라이더 값과 표시를 맞추는 이벤트만 걸어주면 된다 — 최종 표시값은 항상
    // updateModel()이 다음 갱신 때 다시 확정한다.
    function enhanceRangeInputs(containerEl) {
        const ranges = containerEl.querySelectorAll('input[type="range"]');
        ranges.forEach(function (range) {
            if (range.dataset.enhanced) return; // 같은 컨테이너에 두 번 불려도 중복 적용 안 되게
            range.dataset.enhanced = 'true';

            const row = document.createElement('div');
            row.className = 'range-row';
            range.parentNode.insertBefore(row, range);

            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'range-step-btn';
            minusBtn.textContent = '−';
            minusBtn.setAttribute('aria-label', '한 칸 감소');

            const plusBtn = document.createElement('button');
            plusBtn.type = 'button';
            plusBtn.className = 'range-step-btn';
            plusBtn.textContent = '+';
            plusBtn.setAttribute('aria-label', '한 칸 증가');

            row.appendChild(minusBtn);
            row.appendChild(range);
            row.appendChild(plusBtn);

            // step 소수 자릿수에 맞춰 반올림한다 — 그렇지 않으면 0.1을 여러 번 더할 때
            // 흔한 부동소수점 오차(0.1+0.1+0.1 = 0.30000000000000004 같은)가 슬라이더 값에
            // 그대로 남아, valX 표시가 지저분해지거나 max에 딱 안 맞고 어긋나는 문제가 생긴다.
            const stepDecimals = ((range.step || '1').split('.')[1] || '').length;

            function clamp(v) {
                const min = parseFloat(range.min), max = parseFloat(range.max);
                if (!isNaN(min) && v < min) v = min;
                if (!isNaN(max) && v > max) v = max;
                return v;
            }

            function fireChange() {
                // 기존 oninput="scheduleUpdate()" 등은 그대로 두고, 진짜 input/change 이벤트를
                // 직접 쏴서(값은 이미 위에서 바꿔둠) 각 갤러리가 이미 붙여둔 핸들러가 그대로
                // 반응하게 한다 — 갤러리 쪽 코드를 하나도 안 건드려도 된다.
                range.dispatchEvent(new Event('input', { bubbles: true }));
                range.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function step(dir) {
                const stepVal = parseFloat(range.step) || 1;
                let v = parseFloat(range.value) + dir * stepVal;
                v = parseFloat(v.toFixed(stepDecimals));
                range.value = clamp(v);
                fireChange();
            }

            minusBtn.addEventListener('click', function () { step(-1); });
            plusBtn.addEventListener('click', function () { step(1); });

            const valSpanId = 'val' + range.id.charAt(0).toUpperCase() + range.id.slice(1);
            const valSpan = document.getElementById(valSpanId);
            if (!valSpan) return;

            valSpan.classList.add('range-value-editable');
            valSpan.title = '클릭해서 숫자 직접 입력';
            valSpan.addEventListener('click', function () {
                if (valSpan.querySelector('input')) return; // 이미 편집 중이면 무시

                const editInput = document.createElement('input');
                editInput.type = 'number';
                editInput.className = 'range-value-input';
                editInput.value = range.value;
                editInput.min = range.min;
                editInput.max = range.max;
                editInput.step = range.step;

                let committed = false;
                function commit() {
                    if (committed) return;
                    committed = true;
                    const parsed = parseFloat(editInput.value);
                    const v = isNaN(parsed) ? parseFloat(range.value) : clamp(parsed);
                    range.value = v;
                    valSpan.textContent = String(v); // 다음 updateModel()이 다시 정확한 값으로 덮어씀
                    fireChange();
                }

                editInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') editInput.blur();
                    else if (e.key === 'Escape') { committed = true; valSpan.textContent = range.value; }
                });
                editInput.addEventListener('blur', commit);

                valSpan.textContent = '';
                valSpan.appendChild(editInput);
                editInput.focus();
                editInput.select();
            });
        });
    }

    // controlsFooterEl에 "형식 선택 카드(STL/3MF) + 다운로드 버튼 하나"를 만들어 붙인다.
    // 예전에는 갤러리마다 "STL 다운로드"/"3MF 다운로드" 버튼을 나란히 두 개 뒀는데, 먼저
    // 형식을 고르고 버튼 하나로 받는 편이 사용자 입장에서 더 명확하다는 요청으로 바뀌었다.
    // 각 갤러리가 이미 갖고 있는 downloadSTL/download3MF 함수는 그대로 두고, 여기서는
    // "지금 선택된 형식의 함수를 부른다"는 배선만 담당한다.
    function mountDownloadPanel(footerEl, options) {
        const opts = options || {};
        const formats = opts.formats || [
            { id: 'stl', name: 'STL', desc: '높은 범용성', handler: opts.onSTL },
            { id: '3mf', name: '3MF', desc: '멀티컬러 프린팅', handler: opts.on3MF }
        ];

        const picker = document.createElement('div');
        picker.className = 'format-picker';

        const cards = {};
        let selectedId = formats[0].id;
        formats.forEach(function (f) {
            const card = document.createElement('div');
            card.className = 'format-option';
            card.innerHTML = '<div class="format-name">' + f.name + '</div><div class="format-desc">' + f.desc + '</div>';
            card.addEventListener('click', function () {
                selectedId = f.id;
                Object.keys(cards).forEach(function (id) { cards[id].classList.toggle('selected', id === selectedId); });
            });
            cards[f.id] = card;
            picker.appendChild(card);
        });
        cards[selectedId].classList.add('selected');

        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'download-btn';
        downloadBtn.textContent = '파일 다운로드';
        downloadBtn.addEventListener('click', function () {
            const format = formats.find(function (f) { return f.id === selectedId; });
            if (format && typeof format.handler === 'function') format.handler();
        });

        footerEl.appendChild(picker);
        footerEl.appendChild(downloadBtn);
    }

    return {
        DEFAULT_CAMERA_PRESETS: DEFAULT_CAMERA_PRESETS,
        mountEditorShell: mountEditorShell,
        initViewer: initViewer,
        setupResizer: setupResizer,
        bindViewCube: bindViewCube,
        resetCameraTo: resetCameraTo,
        updateDimensionOverlay: updateDimensionOverlay,
        bindDimensionToggle: bindDimensionToggle,
        bindScreenshotButton: bindScreenshotButton,
        exportSTL: exportSTL,
        enhanceRangeInputs: enhanceRangeInputs,
        mountDownloadPanel: mountDownloadPanel,
        mountLightTuningPanel: mountLightTuningPanel
    };
})();

// 다크모드 공용 로직 — 메인화면(index.html)과 편집화면 8개가 모두 이 파일을 쓴다.
// 실제 <html data-theme="..."> 적용은 각 페이지 <head>의 짧은 인라인 스크립트가 이 파일보다
// 먼저(첫 페인트 전에) 동기적으로 해준다(외부 파일이라 네트워크 왕복 시간만큼 늦게 실행되면
// 잠깐 밝은 화면이 보였다가 바뀌는 깜빡임이 생기기 때문). 이 파일은 그 상태를 이어받아
// 토글 버튼 생성, localStorage 저장, 탭 간 동기화, 3D 뷰어(core.js)에 테마 변경을 알리는
// themechange 이벤트를 담당한다.
window.ThemeCore = (function () {
    const STORAGE_KEY = 'theme';

    function getStoredTheme() {
        return localStorage.getItem(STORAGE_KEY);
    }

    function getPreferredTheme() {
        return getStoredTheme() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    }

    function setTheme(theme) {
        localStorage.setItem(STORAGE_KEY, theme);
        applyTheme(theme);
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
    }

    function toggleTheme() {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    }

    // 다른 탭에서 테마를 바꾼 경우(같은 출처면 localStorage를 공유하므로) 이 탭도 맞춰준다.
    window.addEventListener('storage', function (e) {
        if (e.key === STORAGE_KEY && e.newValue) {
            applyTheme(e.newValue);
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: e.newValue } }));
        }
    });

    // 뷰큐브 버튼 아래에 붙는 작은 토글 버튼. 편집화면(core.js의 mountEditorShell)과
    // 메인화면(index.html)이 각자 원하는 위치에 이 버튼을 붙여 쓴다.
    function createToggleButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle-btn';

        function updateLabel() {
            const isDark = currentTheme() === 'dark';
            // 다크모드 버튼 자체의 라벨도 영어 전환 대상이다 — lang-core.js가 이 파일보다
            // 먼저 로드되어 있다는 보장이 없어(theme-core.js가 항상 먼저 로드됨) 매번
            // window.LangCore 존재 여부를 확인하고, 없으면 한글 그대로 보여준다.
            const pick = window.LangCore ? window.LangCore.pick : function (ko) { return ko; };
            btn.textContent = isDark ? pick('☀️ 라이트모드', '☀️ Light mode') : pick('🌙 다크모드', '🌙 Dark mode');
            btn.setAttribute('aria-label', isDark ? pick('라이트모드로 전환', 'Switch to light mode') : pick('다크모드로 전환', 'Switch to dark mode'));
        }
        updateLabel();

        btn.addEventListener('click', function () {
            toggleTheme();
            updateLabel();
        });
        window.addEventListener('themechange', updateLabel);
        window.addEventListener('langchange', updateLabel);

        return btn;
    }

    return {
        getPreferredTheme: getPreferredTheme,
        applyTheme: applyTheme,
        currentTheme: currentTheme,
        setTheme: setTheme,
        toggleTheme: toggleTheme,
        createToggleButton: createToggleButton
    };
})();

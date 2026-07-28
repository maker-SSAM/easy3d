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
            btn.textContent = isDark ? '☀️ 밝은 화면' : '🌙 어두운 화면';
            btn.setAttribute('aria-label', isDark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
        }
        updateLabel();

        btn.addEventListener('click', function () {
            toggleTheme();
            updateLabel();
        });
        window.addEventListener('themechange', updateLabel);

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

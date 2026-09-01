// 영어 전환 공용 로직 — 메인화면(index.html)과 편집화면 8개가 모두 이 파일을 쓴다.
// theme-core.js(다크모드)와 완전히 같은 구조다: <html data-lang="..."> 속성 + localStorage +
// 탭 간 동기화 + langchange 이벤트. 다크모드와 달리 텍스트 자체를 바꿔야 하므로, 이 파일이
// [data-i18n-en] 계열 속성이 붙은 요소를 찾아 텍스트를 직접 치환하는 applyTranslations()도
// 함께 제공한다 — 각 페이지는 한글 텍스트를 평소처럼 그대로 마크업/JS에 써두고, 거기에
// data-i18n-en="영문 텍스트"만 추가해두면 된다(최초 1회 원본 한글은 자동으로 백업됨).
window.LangCore = (function () {
    const STORAGE_KEY = 'lang';

    function getStoredLang() {
        return localStorage.getItem(STORAGE_KEY);
    }

    // 다크모드와 달리 OS/브라우저 언어를 따라가지 않는다 — 이 사이트의 기본 언어는 한국어이고,
    // 영어는 명시적으로 선택했을 때만 켜지는 옵션이다.
    function getPreferredLang() {
        return getStoredLang() || 'ko';
    }

    function applyLang(lang) {
        document.documentElement.setAttribute('data-lang', lang);
    }

    function currentLang() {
        return document.documentElement.getAttribute('data-lang') || getPreferredLang();
    }

    // container(기본값 document) 안에서 data-i18n-en* 속성이 붙은 요소를 전부 찾아 현재
    // 언어에 맞는 텍스트/속성으로 갱신한다. 각 data-i18n-en-* 속성은 처음 적용되는 순간
    // 원래 있던 한글 값을 data-i18n-ko-*에 백업해두고, 이후로는 그 백업과 영문 값을
    // 왔다갔다하며 번역한다 — 페이지가 몇 번을 다시 그려도(langchange를 여러 번 받아도)
    // 원본 한글 텍스트를 잃어버리지 않는다.
    function applyTranslations(container) {
        const scope = container || document;
        const lang = currentLang();

        function swap(selector, prop, enAttr, koDataKey) {
            scope.querySelectorAll(selector).forEach(function (el) {
                if (el.dataset[koDataKey] === undefined) {
                    el.dataset[koDataKey] = prop === 'textContent' ? el.textContent
                        : prop === 'innerHTML' ? el.innerHTML
                        : el.getAttribute(prop);
                }
                const enValue = el.getAttribute(enAttr);
                const value = lang === 'en' ? enValue : el.dataset[koDataKey];
                if (prop === 'textContent') el.textContent = value;
                else if (prop === 'innerHTML') el.innerHTML = value;
                else el.setAttribute(prop, value);
            });
        }

        swap('[data-i18n-en]', 'textContent', 'data-i18n-en', 'i18nKo');
        swap('[data-i18n-en-html]', 'innerHTML', 'data-i18n-en-html', 'i18nKoHtml');
        swap('[data-i18n-en-title]', 'title', 'data-i18n-en-title', 'i18nKoTitle');
        swap('[data-i18n-en-aria]', 'aria-label', 'data-i18n-en-aria', 'i18nKoAria');
        swap('[data-i18n-en-placeholder]', 'placeholder', 'data-i18n-en-placeholder', 'i18nKoPlaceholder');
        swap('[data-i18n-en-alt]', 'alt', 'data-i18n-en-alt', 'i18nKoAlt');
    }

    function setLang(lang) {
        localStorage.setItem(STORAGE_KEY, lang);
        applyLang(lang);
        applyTranslations(document);
        window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
    }

    function toggleLang() {
        setLang(currentLang() === 'en' ? 'ko' : 'en');
    }

    // 한글 문자열과 영문 문자열을 넘기면 현재 언어에 맞는 쪽을 돌려준다. alert() 메시지나
    // 다운로드 파일명처럼 DOM에 상시 존재하지 않아 data-i18n-en 속성을 못 붙이는 곳에서 쓴다.
    function pick(ko, en) {
        return currentLang() === 'en' ? en : ko;
    }

    // 다른 탭에서 언어를 바꾼 경우(같은 출처면 localStorage를 공유하므로) 이 탭도 맞춰준다.
    window.addEventListener('storage', function (e) {
        if (e.key === STORAGE_KEY && e.newValue) {
            applyLang(e.newValue);
            applyTranslations(document);
            window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: e.newValue } }));
        }
    });

    // 다크모드 토글 버튼 바로 옆에 붙는 작은 토글 버튼(편집화면은 "모드 변경" 구간, 메인화면은
    // 우측 상단). 버튼 라벨은 "지금 누르면 바뀔 언어"를 보여준다(다크모드 토글과 같은 관례).
    function createToggleButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lang-toggle-btn';

        function updateLabel() {
            const isEn = currentLang() === 'en';
            btn.textContent = isEn ? '🌐 한국어' : '🌐 English';
            btn.setAttribute('aria-label', isEn ? 'Switch to Korean' : '영어로 전환');
        }
        updateLabel();

        btn.addEventListener('click', function () {
            toggleLang();
            updateLabel();
        });
        window.addEventListener('langchange', updateLabel);

        return btn;
    }

    return {
        getPreferredLang: getPreferredLang,
        applyLang: applyLang,
        currentLang: currentLang,
        setLang: setLang,
        toggleLang: toggleLang,
        applyTranslations: applyTranslations,
        pick: pick,
        createToggleButton: createToggleButton
    };
})();

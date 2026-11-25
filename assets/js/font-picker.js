// 글씨체 고르는 목록 — easy3D 공용(2026-11-25, 갤러리9에서 만든 것을 옮겨 모든 글씨체 페이지가 같이 쓴다).
// 선생님이 정한 모양(2026-11-24): 이름을 그 글씨체 모양으로, 검색칸 없음, '내 폰트 파일 업로드'·'내 폴더 가져오기'는
// 목록 맨 아래 고정, 휴대폰도 같은 목록. 한국어 화면은 한글 이름, 영어 화면은 영어 이름.
//
// 쓰는 법(쉬운 길 — 글씨체 칸 하나):
//   <script src="../assets/js/font-list.js"></script>
//   <script src="../assets/js/font-name-previews.js"></script>
//   <script src="../assets/js/font-picker.js"></script>   (font-core.js·lang-core.js 다음)
//   const fp = FontPicker.create(holderEl, { value: 'Cafe24PROUP.ttf', onChange: function (key, font) { … } });
//   fp.value — 지금 글씨체 키(사이트 글씨체 = 파일 이름, 내 파일 = 'upload:이름:크기:수정시각' = FontCore 캐시 키)
//   fp.setValue(key) — 코드로 바꾸기(초기화 등). 불러온 뒤 onChange(key, opentype 글꼴)를 부른다.
//   처음 값은 바로 불러와 onChange를 한 번 부른다. 시작할 때 FontPicker.restoreSavedFolder()를 한 번 부르면
//   지난번에 가져온 폴더를 다시 연다.
// 자세한 길(갤러리9 — 숨긴 <select>를 페이지가 직접 다룰 때): FontPicker.attach(select, holder, opts).
//
// 사이트 글씨체 이름 그림 = assets/js/font-name-previews.js(tools/make-font-name-previews.py로 만듦 —
// font-list.js에 글씨체를 더하거나 이름을 바꾸면 다시 만들어 함께 커밋).
// 내 PC 글씨체는 목록에 이름만 올리고, 고를 때 그 파일만 읽는다(폴더가 수백 개·1GB여도 멈추지 않게). 서버로 보내지 않는다.
// 아이콘: Google Material Symbols(font_download·folder·folder_open), Apache License 2.0
//   https://github.com/google/material-design-icons · https://www.apache.org/licenses/LICENSE-2.0
window.FontPicker = (function () {
    const FONTS_BASE = (function () {
        const src = document.currentScript ? document.currentScript.src : '';
        return src ? src.replace(/assets\/js\/font-picker\.js.*$/, 'assets/fonts/') : '../assets/fonts/';
    })();

    // 페이지 설정(configure): cssPrefix가 있으면 글씨체를 고를 때 CSS 글꼴(이름 cssPrefix + id)로도 불러온다
    // (갤러리9처럼 화면 글상자에 그 글씨체로 그려야 하는 페이지). onRefresh: 목록을 다시 만든 뒤 페이지가 할 일.
    const cfg = { cssPrefix: null, cssFallback: 'sans-serif', onRefresh: null };
    function configure(o) { Object.assign(cfg, o || {}); }
    function pick(ko, en) { return window.LangCore ? LangCore.pick(ko, en) : ko; }
    function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---------- 모양(CSS) — 한 번만 넣는다 ----------
    const CSS = `
        .font-picker { flex: 1; min-width: 0; }
        .fp-button {
            width: 100%; height: 34px; display: flex; align-items: center; gap: 6px; padding: 0 8px; box-sizing: border-box;
            background: var(--input-bg); color: var(--text-color); border: 1px solid var(--input-border); border-radius: 4px;
            cursor: pointer; text-align: left; font: inherit;
        }
        .fp-button:focus-visible, .fp-button.open { border-color: #1e88e5; outline: none; }
        .fp-cur { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; }
        .fp-arrow { flex: none; font-size: 0.65em; color: var(--text-muted); }
        /* 이름 그림의 세로 = 1.15em(tools/make-font-name-previews.py). em을 보통 글자(.fp-plain)와 같은 15px로 맞춘다 */
        .fp-name { display: block; height: calc(15px * 1.15); width: auto; max-width: 100%; fill: currentColor; overflow: visible; }
        .fp-plain { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 15px; line-height: 20px; }
        .fp-plain.fp-bad { color: var(--text-muted); font-style: italic; }
        .fp-pop {
            position: fixed; z-index: 10000; display: flex; flex-direction: column; box-sizing: border-box;
            background: var(--input-bg); color: var(--text-color); border: 1px solid var(--input-border); border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); overflow: hidden;
        }
        .fp-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0; overscroll-behavior: contain; }
        .fp-foot { flex: none; border-top: 1px solid var(--input-border); padding: 4px 0; background: var(--panel-accent-bg); }
        .fp-head { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 12px 4px; font-size: 0.78em; font-weight: bold; color: var(--text-muted); }
        .fp-head::before, .fp-head::after { content: ''; flex: 1; border-top: 1px solid var(--input-border); }
        .fp-head::before { margin-right: 4px; }
        .fp-head::after { margin-left: 4px; }
        .fp-head .fp-icon { width: 16px; height: 16px; }
        .fp-row { display: flex; align-items: center; padding: 6px 12px; min-height: 34px; box-sizing: border-box; cursor: pointer; }
        .fp-row.active { background: rgba(30, 136, 229, 0.15); }
        .fp-row.selected::after { content: '✓'; margin-left: 8px; color: #1e88e5; font-weight: bold; }
        .fp-cell { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; }
        .fp-icon { flex: none; width: 20px; height: 20px; fill: currentColor; }
        .fp-foot .fp-plain { font-size: 14px; }
        .fp-note { font-size: 0.78em; color: var(--text-muted); margin: 4px 0 0; }
    `;
    (function () {
        const st = document.createElement('style');
        st.id = 'font-picker-css';
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    })();

    // ---------- 글씨체 목록(사이트 글씨체 + 내 PC에서 가져온 글씨체) ----------
    // 키: 사이트 글씨체는 파일 이름, 내 파일은 'upload:이름:크기:수정시각'(FontCore.loadFontFromFile의 키와 같음).
    // id는 CSS 글꼴 이름(cssPrefix + id)에 쓴다 — 사이트 글씨체는 목록 순서 그대로.
    const registry = new Map();
    const keyById = [];
    function register(key, info) {
        if (registry.has(key)) return registry.get(key);
        const entry = Object.assign({ key: key, id: keyById.length }, info);
        registry.set(key, entry);
        keyById.push(key);
        return entry;
    }
    const SITE_FONTS = (window.FontList && FontList.OPTIONS) || [];
    SITE_FONTS.forEach(function (f) { register(f.file, { label: f.label, koLabel: f.koLabel, url: FONTS_BASE + encodeURI(f.file) }); });
    // 화면에 보일 이름: 사이트 글씨체는 한국어 화면이면 한글 이름(koLabel), 내 파일은 파일 안의 이름(없으면 파일 이름)
    function label(key) {
        const entry = registry.get(key);
        if (!entry) return key;
        if (entry.file) {
            const n = entry.names || {};
            return pick(n.ko || n.en || entry.label, n.en || entry.label);
        }
        return entry.koLabel ? pick(entry.koLabel, entry.label) : entry.label;
    }
    function userKey(file) { return 'upload:' + file.name + ':' + file.size + ':' + file.lastModified; }
    function fileLabel(file) { return file.name.replace(/\.(ttf|otf)$/i, ''); }
    function cssFamily(key) {
        const entry = registry.get(key);
        return entry && cfg.cssPrefix ? "'" + cfg.cssPrefix + entry.id + "', " + cfg.cssFallback : cfg.cssFallback;
    }
    function keyFromFamily(fam) {
        if (!cfg.cssPrefix) return null;
        const m = new RegExp(cfg.cssPrefix + '(\\d+)').exec(fam || '');
        return m && keyById[+m[1]] ? keyById[+m[1]] : null;
    }

    // ---------- 불러오기 — opentype.js(윤곽선, FontCore 캐시) + (cssPrefix가 있으면) CSS 글꼴 ----------
    // 한 번 불러온 글씨체는 그대로 두고 다시 쓰기만 한다. 실패하면 다시 시도하지 않는다.
    const state = {}; // 키 → { ready, failed, promise }
    function ensure(key) {
        if (state[key]) return state[key].promise;
        const st = state[key] = { ready: false };
        const entry = registry.get(key);
        if (!entry) { st.failed = true; st.promise = Promise.resolve(); return st.promise; }
        let glyph, cssSource;
        if (entry.file) {
            glyph = new Promise(function (resolve, reject) {
                FontCore.loadFontFromFile(entry.file, function () { resolve(); }, function (err) { reject(err || new Error('parse')); });
            });
            cssSource = cfg.cssPrefix ? entry.file.arrayBuffer() : null;
        } else {
            glyph = new Promise(function (resolve) { FontCore.loadFont(key, resolve); });
            cssSource = cfg.cssPrefix ? Promise.resolve('url(' + entry.url + ')') : null;
        }
        const css = cssSource ? cssSource.then(function (src) { return new FontFace(cfg.cssPrefix + entry.id, src).load(); })
            .then(function (face) { document.fonts.add(face); }) : Promise.resolve();
        st.promise = Promise.all([glyph, css]).then(function () { st.ready = true; })
            .catch(function (err) { console.error('글씨체 로딩 실패:', entry.label, err); st.failed = true; });
        return st.promise;
    }
    function isReady(key) { return !!(state[key] && state[key].ready); }
    function isFailed(key) { return !!(state[key] && state[key].failed); }

    // ---------- 고르는 칸(숨긴 <select>) ----------
    // select 값: 사이트 글씨체 → '내 폰트 파일 업로드...'(__upload__) → '내 폴더 가져오기...'(__folder__)
    //   (→ '지난번 폴더 다시 열기'(__reopen__)) → 가져온 글씨체(묶음마다 optgroup). 화면의 목록이 이 select를 읽어 그린다.
    const userGroups = []; // [{ id, title, keys }] — '내 폰트 파일'(files), 가져온 폴더마다
    const pickers = [];
    let lastPicker = null; // 마지막으로 쓴 칸 — 업로드·폴더 결과와 안내 글이 가는 곳
    function optionsHtml(withBaseChoice) {
        let h = '';
        if (withBaseChoice) h += '<option value="">' + escHtml(pick('(기본 글씨체)', '(Base font)')) + '</option>';
        h += SITE_FONTS.map(function (f) { return '<option value="' + escHtml(f.file) + '">' + escHtml(label(f.file)) + '</option>'; }).join('');
        h += '<option value="__upload__">' + escHtml(pick('내 폰트 파일 업로드...', 'Upload my font file...')) + '</option>';
        h += '<option value="__folder__">' + escHtml(pick('내 폴더 가져오기...', 'Load my font folder...')) + '</option>';
        if (savedDirHandle && !savedDirLoaded) {
            h += '<option value="__reopen__">' + escHtml(pick('지난번 폴더 다시 열기', 'Reopen last folder')) + ' (' + escHtml(savedDirHandle.name) + ')...</option>';
        }
        const lang = pick('ko', 'en');
        userGroups.forEach(function (g) {
            const title = g.id === 'files' ? pick('내 폰트 파일', 'My font files') : g.title;
            // 화면 언어의 이름으로 정렬하고, 이름이 같은 글씨체는 파일 이름을 덧붙여 구별한다
            const items = g.keys.map(function (k) { return { k: k, name: label(k) }; });
            const seen = {};
            items.forEach(function (it) { seen[it.name] = (seen[it.name] || 0) + 1; });
            items.forEach(function (it) { if (seen[it.name] > 1) it.name += ' (' + registry.get(it.k).label + ')'; });
            if (g.id !== 'files') items.sort(function (a, b) { return a.name.localeCompare(b.name, lang); });
            h += '<optgroup data-kind="' + (g.id === 'files' ? 'files' : 'folder') + '" label="' + escHtml(title) + '">' + items.map(function (it) {
                return '<option value="' + escHtml(it.k) + '">' + escHtml(it.name) + '</option>';
            }).join('') + '</optgroup>';
        });
        return h;
    }
    function setNote(msg, pk) {
        const p = pk || lastPicker;
        const el = p && p.noteEl;
        if (!el) return;
        el.hidden = !msg;
        el.textContent = msg || '';
    }
    // 목록을 다시 만든다(글씨체를 가져왔거나 화면 언어가 바뀌었을 때). 칸마다 고른 값은 그대로 둔다.
    function refresh() {
        pickers.forEach(function (pk) {
            const v = pk.select.value;
            pk.select.innerHTML = optionsHtml(pk.opts.withBaseChoice);
            if (Array.prototype.some.call(pk.select.options, function (o) { return o.value === v; })) pk.select.value = v;
            pk.shown = null;
        });
        close();
        if (cfg.onRefresh) cfg.onRefresh();
        sync();
    }
    // 고른 글씨체를 먼저 읽어 보고(못 읽으면 알리고 되돌림) 페이지에 알린다.
    function choose(pk, key) {
        lastPicker = pk;
        const entry = registry.get(key);
        if (!entry) { pk.opts.revert(pk.select); sync(); return; }
        if (entry.file) setNote(pick('글씨체를 읽는 중…', 'Loading font…'), pk);
        ensure(key).then(function () {
            if (!isReady(key)) {
                pk.opts.revert(pk.select);
                sync();
                setNote(pick('「' + label(key) + '」 글씨체 파일을 읽을 수 없습니다.', 'Could not read this font file.'), pk);
                return;
            }
            setNote('', pk);
            pk.opts.onChoose(key, pk.select);
            sync();
        });
    }
    // select 값이 바뀌었을 때(목록에서 골랐을 때, 페이지가 change를 보냈을 때)
    function handle(pk) {
        const v = pk.select.value;
        lastPicker = pk;
        if (v === '__upload__' || v === '__folder__' || v === '__reopen__') {
            pk.opts.revert(pk.select);
            sync();
            if (v === '__upload__') { uploadInput.value = ''; uploadInput.click(); }
            else if (v === '__folder__') importFolder();
            else reopenFolder();
            return;
        }
        if (!v) { if (pk.opts.onClear) pk.opts.onClear(pk.select); sync(); return; } // '(기본 글씨체)'
        choose(pk, v);
    }
    // 칸 붙이기. holder가 없으면 화면 단추 없이 select만 다룬다.
    // opts: withBaseChoice(맨 위 '(기본 글씨체)' 빈 값), shownValue(select) → 단추에 보일 키, onChoose(key, select),
    //       onClear(select), revert(select)(못 고르게 됐을 때 select를 앞 값으로), noteEl(안내 글 자리)
    function attach(select, holder, opts) {
        const pk = { select: select, btn: null, shown: null, opts: Object.assign({
            withBaseChoice: false,
            shownValue: function (sel) { return sel.value; },
            onChoose: function () {}, onClear: null, revert: function () {}
        }, opts || {}) };
        pk.noteEl = pk.opts.noteEl || null;
        if (holder) {
            holder.classList.add('font-picker');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fp-button';
            btn.setAttribute('aria-haspopup', 'listbox');
            btn.innerHTML = '<span class="fp-cur"></span><span class="fp-arrow" aria-hidden="true">▼</span>';
            holder.appendChild(btn);
            pk.btn = btn;
            // 단추를 눌러도 글상자의 선택(갤러리9 고른 글자)이 풀리지 않게
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            btn.addEventListener('click', function () { if (openFP && openFP.picker === pk) close(); else open(pk); });
            btn.addEventListener('keydown', function (e) {
                if (!openFP && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(pk); }
            });
            if (!pk.noteEl) {
                pk.noteEl = document.createElement('p');
                pk.noteEl.className = 'fp-note';
                pk.noteEl.hidden = true;
                holder.insertAdjacentElement('afterend', pk.noteEl);
            }
        }
        select.innerHTML = optionsHtml(pk.opts.withBaseChoice);
        select.addEventListener('change', function () { handle(pk); });
        pickers.push(pk);
        return pk;
    }
    // 쉬운 길: 칸 하나(숨긴 select를 holder 안에 만든다)
    function create(holder, opts) {
        const select = document.createElement('select');
        select.hidden = true;
        holder.appendChild(select);
        let committed = opts.value;
        const pk = attach(select, holder, {
            onChoose: function (key) {
                committed = key;
                select.value = key;
                if (opts.onChange) opts.onChange(key, FontCore.getFont(key));
            },
            revert: function () { select.value = committed; }
        });
        select.value = committed;
        const api = {
            get value() { return committed; },
            setValue: function (key) { select.value = key; choose(pk, key); },
            picker: pk
        };
        api.setValue(committed);
        return api;
    }

    // ---------- 화면 목록(단추 + 펼침) ----------
    const ICON_PATHS = {
        font: 'M256-240h84l44-122h192l44 122h84L522-720h-84L256-240Zm152-192 70-198h4l70 198H408ZM160-80q-33 0-56.5-23.5T80-160v-640q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v640q0 33-23.5 56.5T800-80H160Zm0-80h640v-640H160v640Zm0-640v640-640Z',
        folder: 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z',
        folderOpen: 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640H447l-80-80H160v480l96-320h684L837-217q-8 26-29.5 41.5T760-160H160Zm84-80h516l72-240H316l-72 240Zm0 0 72-240-72 240Zm-84-400v-80 80Z'
    };
    const ACTION_ICONS = { __upload__: 'font', __folder__: 'folder', __reopen__: 'folderOpen' };
    function iconSvg(name) {
        return '<svg class="fp-icon" viewBox="0 -960 960 960" aria-hidden="true"><path d="' + ICON_PATHS[name] + '"/></svg>';
    }
    function fontNameHtml(key, text) {
        const pvs = window.FontNamePreviews && window.FontNamePreviews[key];
        const pv = pvs && (pick(pvs.ko, pvs.en) || pvs.en); // 화면 언어에 맞는 이름 그림
        if (pv) {
            return '<svg class="fp-name" viewBox="' + pv.vb + '" preserveAspectRatio="xMinYMid meet" role="img" aria-label="' + escHtml(text) + '">'
                + '<title>' + escHtml(text) + '</title><path d="' + pv.d + '"/></svg>';
        }
        const entry = registry.get(key);
        return '<span class="fp-plain"' + (entry && entry.file ? ' data-preview-key="' + escHtml(key) + '"' : '') + '>' + escHtml(text) + '</span>';
    }
    function optionInnerHtml(opt) {
        const v = opt.value;
        if (ACTION_ICONS[v]) return iconSvg(ACTION_ICONS[v]) + '<span class="fp-plain">' + escHtml(opt.textContent) + '</span>';
        if (!v) return '<span class="fp-plain">' + escHtml(opt.textContent) + '</span>';
        return fontNameHtml(v, opt.textContent);
    }

    // 가져온 글씨체의 이름 미리보기(CSS 글꼴 'FPP<id>'). 이미 CSS 글꼴로 불러온 글씨체(cssPrefix)는 그대로 쓴다.
    const PREVIEW_MAX = 60;
    const previewFaces = new Map(); // 키 → { face, fam } — 넣은 순서 = 오래된 순서
    const previewPending = {};
    function previewFamilyFor(key) {
        if (cfg.cssPrefix && isReady(key)) return cssFamily(key);
        const p = previewFaces.get(key);
        if (!p) return null;
        previewFaces.delete(key); previewFaces.set(key, p); // 최근에 쓴 것으로
        return p.fam;
    }
    function loadPreview(key) {
        const entry = registry.get(key);
        if (!entry || !entry.file || entry.previewFailed || (cfg.cssPrefix && isReady(key)) || previewFaces.has(key)) return Promise.resolve();
        if (previewPending[key]) return previewPending[key];
        const fam = 'FPP' + entry.id;
        previewPending[key] = entry.file.arrayBuffer()
            .then(function (buf) { return new FontFace(fam, buf).load(); })
            .then(function (face) {
                document.fonts.add(face);
                previewFaces.set(key, { face: face, fam: "'" + fam + "', sans-serif" });
                while (previewFaces.size > PREVIEW_MAX) {
                    const oldest = previewFaces.keys().next().value;
                    document.fonts.delete(previewFaces.get(oldest).face);
                    previewFaces.delete(oldest);
                }
            })
            .catch(function () { entry.previewFailed = true; })
            .finally(function () { delete previewPending[key]; });
        return previewPending[key];
    }
    function applyPreview(el) {
        const key = el.dataset.previewKey;
        const fam = previewFamilyFor(key);
        if (fam) { el.style.fontFamily = fam; el.classList.remove('fp-bad'); return true; }
        const entry = registry.get(key);
        if (entry && entry.previewFailed) el.classList.add('fp-bad');
        return false;
    }

    let openFP = null; // 펼친 목록 { picker, pop, list, rows, active, io }
    // 단추에 지금 고른 글씨체를 보여 준다(값이 바뀐 때만 다시 그림)
    function sync() {
        pickers.forEach(function (pk) {
            if (!pk.btn) return;
            const shown = pk.opts.shownValue(pk.select);
            const opt = Array.prototype.find.call(pk.select.options, function (o) { return o.value === shown; });
            const sig = shown + '|' + (opt ? opt.textContent : '') + '|' + isReady(shown);
            if (pk.shown === sig) return;
            pk.shown = sig;
            const cur = pk.btn.querySelector('.fp-cur');
            cur.innerHTML = opt ? optionInnerHtml(opt) : '';
            pk.btn.title = opt ? opt.textContent : '';
            cur.querySelectorAll('[data-preview-key]').forEach(function (el) {
                if (!applyPreview(el)) loadPreview(el.dataset.previewKey).then(function () { applyPreview(el); });
            });
        });
    }
    function open(pk) {
        close();
        lastPicker = pk;
        const sel = pk.select;
        const pop = document.createElement('div');
        pop.className = 'fp-pop';
        pop.setAttribute('role', 'listbox');
        const list = document.createElement('div');
        list.className = 'fp-list';
        const foot = document.createElement('div');
        foot.className = 'fp-foot';
        const listRows = [], footRows = [];
        const shown = pk.opts.shownValue(sel);
        function addHead(icon, text) {
            const head = document.createElement('div');
            head.className = 'fp-head';
            head.innerHTML = (icon ? iconSvg(icon) : '') + '<span>' + escHtml(text) + '</span>';
            list.appendChild(head);
        }
        function addRow(opt, toFoot) {
            const row = document.createElement('div');
            row.className = 'fp-row' + (opt.value === shown && !ACTION_ICONS[opt.value] ? ' selected' : '');
            row.setAttribute('role', 'option');
            row.dataset.value = opt.value;
            row.innerHTML = '<span class="fp-cell">' + optionInnerHtml(opt) + '</span>';
            (toFoot ? foot : list).appendChild(row);
            (toFoot ? footRows : listRows).push(row);
        }
        let siteHead = false;
        Array.prototype.forEach.call(sel.children, function (child) {
            if (child.tagName === 'OPTGROUP') {
                addHead(child.dataset.kind === 'files' ? 'font' : 'folder', child.label + ' (' + child.children.length + ')');
                Array.prototype.forEach.call(child.children, function (o) { addRow(o, false); });
            } else if (ACTION_ICONS[child.value]) {
                addRow(child, true);
            } else if (child.value) { // '(기본 글씨체)'(값 '')는 목록에 두지 않는다(2026-11-24 선생님)
                if (!siteHead) { siteHead = true; addHead(null, pick('사이트 글씨체', 'Site fonts')); }
                addRow(child, false);
            }
        });
        pop.appendChild(list);
        pop.appendChild(foot);
        document.body.appendChild(pop);
        const rows = listRows.concat(footRows);
        openFP = { picker: pk, pop: pop, list: list, rows: rows, active: -1, io: null };
        pk.btn.classList.add('open');
        pk.btn.setAttribute('aria-expanded', 'true');
        position();

        pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
        pop.addEventListener('click', function (e) {
            const row = e.target.closest('.fp-row');
            if (row) chooseRow(row);
        });
        pop.addEventListener('mousemove', function (e) {
            const row = e.target.closest('.fp-row');
            if (row) setActiveRow(rows.indexOf(row), false);
        });
        const selected = listRows.find(function (r) { return r.classList.contains('selected'); });
        if (selected) {
            setActiveRow(rows.indexOf(selected), false);
            list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2;
        }
        // 가져온 글씨체: 화면에 0.2초 넘게 보인 줄만 그 파일을 읽어 이름을 그 글씨체로 그린다
        const previewEls = list.querySelectorAll('[data-preview-key]');
        previewEls.forEach(applyPreview);
        if (previewEls.length && 'IntersectionObserver' in window) {
            openFP.io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    const el = en.target;
                    clearTimeout(el._previewTimer);
                    if (!en.isIntersecting || el.style.fontFamily) return;
                    el._previewTimer = setTimeout(function () {
                        loadPreview(el.dataset.previewKey).then(function () { if (el.isConnected) applyPreview(el); });
                    }, 200);
                });
            }, { root: list });
            previewEls.forEach(function (el) { openFP.io.observe(el); });
        }
    }
    function position() {
        if (!openFP) return;
        const pop = openFP.pop, r = openFP.picker.btn.getBoundingClientRect();
        const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
        const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
        const placeBelow = below >= 280 || below >= above;
        pop.style.left = left + 'px';
        pop.style.width = width + 'px';
        pop.style.maxHeight = Math.min(460, placeBelow ? below : above) + 'px';
        pop.style.top = placeBelow ? (r.bottom + 4) + 'px' : '';
        pop.style.bottom = placeBelow ? '' : (window.innerHeight - r.top + 4) + 'px';
    }
    function close() {
        if (!openFP) return;
        if (openFP.io) openFP.io.disconnect();
        openFP.pop.remove();
        openFP.picker.btn.classList.remove('open');
        openFP.picker.btn.setAttribute('aria-expanded', 'false');
        openFP = null;
    }
    function setActiveRow(i, scroll) {
        if (!openFP || i < 0 || i >= openFP.rows.length) return;
        if (openFP.active >= 0) openFP.rows[openFP.active].classList.remove('active');
        openFP.active = i;
        const row = openFP.rows[i];
        row.classList.add('active');
        if (scroll && openFP.list.contains(row)) row.scrollIntoView({ block: 'nearest' });
    }
    function chooseRow(row) {
        const pk = openFP.picker;
        close();
        pk.select.value = row.dataset.value;
        handle(pk);
        sync();
    }
    // 펼친 동안: ↑↓로 옮기고 Enter로 고르고 Esc·Tab으로 닫는다(글상자에 커서가 있어도 목록이 먼저 받음)
    document.addEventListener('keydown', function (e) {
        if (!openFP) return;
        const n = openFP.rows.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            setActiveRow(((openFP.active < 0 ? (e.key === 'ArrowDown' ? -1 : 0) : openFP.active) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n, true);
        } else if (e.key === 'Enter') {
            if (openFP.active >= 0) chooseRow(openFP.rows[openFP.active]);
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            close();
            if (e.key === 'Tab') return;
        } else return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    // 바깥을 누르거나, 바깥이 스크롤되거나, 창 크기가 바뀌면 닫는다
    document.addEventListener('mousedown', function (e) {
        if (openFP && !openFP.pop.contains(e.target) && !openFP.picker.btn.contains(e.target)) close();
    }, true);
    document.addEventListener('scroll', function (e) {
        if (openFP && !openFP.pop.contains(e.target)) close();
    }, true);
    window.addEventListener('resize', close);
    // 한국어↔영어를 바꾸면 글씨체 이름(한글/영어)과 항목 글을 다시 그린다
    window.addEventListener('langchange', function () { refresh(); });

    // ---------- 글씨체 파일 안의 이름 읽기 ----------
    // 파일 맨 앞의 표 목록과 name 표(보통 몇 KB)만 잘라 읽는다. 돌려주는 값: { ko, en }(없으면 null).
    // Windows 이름 중 한국어(0x0412)·영어(0x0409), 전체 이름(4) → 가족 이름(1) 순서. 못 읽으면 null.
    async function readFontNames(file) {
        try {
            const head = new DataView(await file.slice(0, 12).arrayBuffer());
            const tag = head.getUint32(0);
            if (tag !== 0x00010000 && tag !== 0x4F54544F && tag !== 0x74727565) return null; // TrueType·'OTTO'·'true'
            const numTables = head.getUint16(4);
            const dir = new DataView(await file.slice(12, 12 + numTables * 16).arrayBuffer());
            let off = -1, len = 0;
            for (let i = 0; i < numTables; i++) {
                if (dir.getUint32(i * 16) === 0x6E616D65) { off = dir.getUint32(i * 16 + 8); len = dir.getUint32(i * 16 + 12); break; } // 'name'
            }
            if (off < 0 || len > 4 * 1024 * 1024) return null;
            const nv = new DataView(await file.slice(off, off + len).arrayBuffer());
            const count = nv.getUint16(2), strOff = nv.getUint16(4);
            const found = {};
            for (let i = 0; i < count; i++) {
                const r = 6 + i * 12;
                const plat = nv.getUint16(r), enc = nv.getUint16(r + 2), lang = nv.getUint16(r + 4);
                const id = nv.getUint16(r + 6), l = nv.getUint16(r + 8), o = nv.getUint16(r + 10);
                if (plat !== 3 || (enc !== 1 && enc !== 10) || (id !== 1 && id !== 4) || (lang !== 0x412 && lang !== 0x409)) continue;
                let s = '';
                for (let j = 0; j + 1 < l; j += 2) s += String.fromCharCode(nv.getUint16(strOff + o + j)); // UTF-16BE
                s = s.replace(/\0/g, '').trim();
                if (s) found[(lang === 0x412 ? 'ko' : 'en') + id] = s;
            }
            return { ko: found.ko4 || found.ko1 || null, en: found.en4 || found.en1 || null };
        } catch (err) {
            return null;
        }
    }
    // 여러 글씨체의 이름을 읽는다(8개씩 함께). OneDrive '온라인 전용'처럼 읽을 때 내려받는 파일이면 한 개에 오래 걸린다
    // → 남은 파일이 300MB 이상이면 한 번 묻는다(취소하면 나머지는 파일 이름으로 보임).
    const NAME_READ_BATCH = 8;
    const SLOW_NAME_READ_MS = 400;
    const DOWNLOAD_WARN_BYTES = 300 * 1024 * 1024;
    async function readNamesFor(entries, showProgress) {
        const todo = entries.filter(function (e) { return e && e.file && !e.namesRead; });
        let remaining = todo.reduce(function (s, e) { return s + e.file.size; }, 0);
        let asked = false;
        for (let i = 0; i < todo.length; i += NAME_READ_BATCH) {
            if (showProgress && todo.length > NAME_READ_BATCH) {
                setNote(pick('글씨체 이름을 읽는 중… (' + i + '/' + todo.length + ')', 'Reading font names… (' + i + '/' + todo.length + ')'));
            }
            const batch = todo.slice(i, i + NAME_READ_BATCH);
            let slowest = 0;
            await Promise.all(batch.map(function (e) {
                const t0 = performance.now();
                return readFontNames(e.file).then(function (names) {
                    e.names = names;
                    e.namesRead = true;
                    slowest = Math.max(slowest, performance.now() - t0);
                });
            }));
            batch.forEach(function (e) { remaining -= e.file.size; });
            if (!asked && slowest > SLOW_NAME_READ_MS && remaining >= DOWNLOAD_WARN_BYTES) {
                asked = true;
                const mb = Math.round(remaining / 1024 / 1024).toLocaleString();
                const go = window.confirm(pick(
                    '글씨체 파일을 내려받으면서 읽는 것 같습니다(OneDrive \'온라인 전용\' 파일 등).\n'
                    + '글씨체 이름을 모두 읽으려면 약 ' + mb + 'MB를 더 내려받을 수 있습니다.\n\n'
                    + '[확인] 계속 읽기\n[취소] 멈추고, 나머지 글씨체는 파일 이름으로 보기',
                    'The font files seem to be downloading while being read (e.g. OneDrive online-only files).\n'
                    + 'Reading all font names may download about ' + mb + ' MB more.\n\n'
                    + '[OK] Keep reading\n[Cancel] Stop and show file names for the rest'));
                if (!go) break;
            }
        }
    }
    function upsertGroup(id, title, keys) {
        const old = userGroups.find(function (g) { return g.id === id; });
        if (old) { old.title = title; old.keys = keys; }
        else if (id === 'files') userGroups.unshift({ id: id, title: title, keys: keys }); // 업로드한 파일 묶음은 폴더들보다 위에
        else userGroups.push({ id: id, title: title, keys: keys });
    }

    // ---------- [Aa] 내 폰트 파일 업로드: 파일 하나를 '내 폰트 파일' 묶음에 더하고 그 칸에 바로 적용 ----------
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = '.ttf,.otf';
    uploadInput.style.display = 'none';
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.multiple = true;
    folderInput.style.display = 'none';
    function mountInputs() { document.body.appendChild(uploadInput); document.body.appendChild(folderInput); }
    if (document.body) mountInputs(); else document.addEventListener('DOMContentLoaded', mountInputs);
    async function addUploadedFile(file) {
        const target = lastPicker;
        const key = userKey(file);
        const entry = register(key, { label: fileLabel(file), file: file });
        await readNamesFor([entry], false);
        const g = userGroups.find(function (x) { return x.id === 'files'; });
        upsertGroup('files', pick('내 폰트 파일', 'My font files'), (g ? g.keys.filter(function (k) { return k !== key; }) : []).concat([key]));
        refresh();
        if (target) { target.select.value = key; choose(target, key); }
        return key;
    }
    uploadInput.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (file) addUploadedFile(file);
    });

    // ---------- 📁 내 폴더 가져오기: 폴더(하위 폴더 포함) 안의 .ttf·.otf를 모두 목록에(이름만, 읽기는 고를 때) ----------
    // 크롬·엣지는 폴더 고르기 창(showDirectoryPicker)을 쓰고 그 폴더를 기억한다(IndexedDB, 모든 갤러리가 같이 씀)
    // → 다음 방문 때 '지난번 폴더 다시 열기' 한 번(허락 창). 다른 브라우저는 <input webkitdirectory>, 새로고침하면 다시 고른다.
    const FONT_EXT = /\.(ttf|otf)$/i;
    const MAX_FOLDER_FONTS = 3000;
    const canPickDir = typeof window.showDirectoryPicker === 'function';
    let savedDirHandle = null;
    let savedDirLoaded = false;
    async function setFolderFonts(folderName, items) {
        const fonts = items.filter(function (it) { return FONT_EXT.test(it.file.name); }).slice(0, MAX_FOLDER_FONTS);
        const count = {};
        fonts.forEach(function (it) { const l = fileLabel(it.file); count[l] = (count[l] || 0) + 1; });
        const keys = fonts.map(function (it) {
            let lb = fileLabel(it.file);
            if (count[lb] > 1) lb += ' (' + it.path.split('/').slice(0, -1).join('/') + ')'; // 이름이 같으면 폴더도 적는다
            const key = userKey(it.file);
            register(key, { label: lb, file: it.file });
            return key;
        });
        const uniq = Array.from(new Set(keys)); // 정렬은 목록을 그릴 때 화면 언어의 이름으로
        await readNamesFor(uniq.map(function (k) { return registry.get(k); }), true);
        upsertGroup('folder:' + folderName, folderName, uniq);
        refresh();
        // 가져온 뒤의 안내 글은 두지 않는다(2026-11-24 선생님) — 글씨체가 하나도 없을 때만 알린다
        setNote(uniq.length ? '' : pick('폴더 「' + folderName + '」에 글씨체 파일(.ttf·.otf)이 없습니다.', 'No .ttf/.otf files in "' + folderName + '".'));
        return uniq;
    }
    async function collectFromHandle(dir, prefix, out) {
        for await (const entry of dir.values()) {
            if (out.length >= MAX_FOLDER_FONTS) return;
            if (entry.kind === 'file') {
                if (FONT_EXT.test(entry.name)) out.push({ file: await entry.getFile(), path: prefix + entry.name });
            } else if (entry.kind === 'directory') {
                await collectFromHandle(entry, prefix + entry.name + '/', out);
            }
        }
    }
    async function loadFromHandle(dir) {
        setNote(pick('폴더를 읽는 중…', 'Reading folder…'));
        const out = [];
        try {
            await collectFromHandle(dir, dir.name + '/', out);
        } catch (err) {
            console.error('폴더 읽기 실패:', err);
            setNote(pick('폴더를 읽지 못했습니다.', 'Could not read the folder.'));
            return;
        }
        savedDirLoaded = true;
        setFolderFonts(dir.name, out);
    }
    // 폴더 기억(크롬·엣지): IndexedDB에 폴더 손잡이(handle)만 둔다. 글씨체 파일 내용은 저장하지 않는다.
    // 'easy3d-fonts'(모든 갤러리 공용). 예전 갤러리9가 기억해 둔 'easy3d-gallery9'도 읽는다.
    function idbDir(dbName, mode, value) {
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
            req.onerror = function () { reject(req.error); };
            req.onsuccess = function () {
                const db = req.result;
                const tx = db.transaction('kv', mode);
                const r = mode === 'readwrite' ? tx.objectStore('kv').put(value, 'fontDir') : tx.objectStore('kv').get('fontDir');
                tx.oncomplete = function () { db.close(); resolve(r.result); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            };
        });
    }
    async function importFolder() {
        if (!canPickDir) { folderInput.value = ''; folderInput.click(); return; }
        let dir;
        try {
            dir = await window.showDirectoryPicker({ id: 'easy3d-fonts', mode: 'read' });
        } catch (err) {
            if (err && err.name !== 'AbortError') setNote(pick('폴더를 열 수 없습니다.', 'Could not open the folder.'));
            return;
        }
        savedDirHandle = dir;
        idbDir('easy3d-fonts', 'readwrite', dir).catch(function (err) { console.warn('폴더 기억 실패:', err); });
        await loadFromHandle(dir);
    }
    async function reopenFolder() {
        if (!savedDirHandle) return;
        try {
            let perm = await savedDirHandle.queryPermission({ mode: 'read' });
            if (perm !== 'granted') perm = await savedDirHandle.requestPermission({ mode: 'read' });
            if (perm === 'granted') await loadFromHandle(savedDirHandle);
            else setNote(pick('폴더를 열도록 허락하지 않았습니다.', 'Permission was not given.'));
        } catch (err) {
            console.error('지난번 폴더 열기 실패:', err);
            setNote(pick('지난번 폴더를 열 수 없습니다(옮겼거나 지웠을 수 있음). 「내 폴더 가져오기」로 다시 고르세요.', 'Could not reopen the last folder.'));
        }
    }
    folderInput.addEventListener('change', function () {
        const files = Array.prototype.slice.call(this.files || []);
        if (!files.length) return;
        const folderName = (files[0].webkitRelativePath || '').split('/')[0] || pick('내 폴더', 'My folder');
        setFolderFonts(folderName, files.map(function (f) { return { file: f, path: f.webkitRelativePath || f.name }; }));
    });
    // 시작할 때: 기억해 둔 폴더가 있으면 '다시 열기'를 목록에 넣고, 이미 허락된 상태면 바로 읽는다.
    async function restoreSavedFolder() {
        if (!canPickDir || !window.indexedDB) return;
        try {
            savedDirHandle = await idbDir('easy3d-fonts', 'readonly');
            if (!savedDirHandle) savedDirHandle = await idbDir('easy3d-gallery9', 'readonly');
        } catch (err) { return; }
        if (!savedDirHandle) return;
        refresh();
        try {
            if (await savedDirHandle.queryPermission({ mode: 'read' }) === 'granted') await loadFromHandle(savedDirHandle);
        } catch (err) { /* 다시 열기 단추로 */ }
    }

    return {
        configure: configure, create: create, attach: attach, refresh: refresh, sync: sync, close: close,
        ensure: ensure, isReady: isReady, isFailed: isFailed, label: label, cssFamily: cssFamily, keyFromFamily: keyFromFamily,
        isKnown: function (key) { return registry.has(key); },
        restoreSavedFolder: restoreSavedFolder,
        // 시험용(자동화로 파일 창·폴더 창을 못 열 때): 파일을 넣은 것처럼
        _addFile: addUploadedFile, _addFolder: setFolderFonts
    };
})();

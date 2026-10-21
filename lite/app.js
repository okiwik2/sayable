// Sayable Lite: a small, fast version for old devices (e.g. iPad 4 on iOS 10).
// Plain ES5 on purpose, with no framework or build step, so old Safari runs it as written.
// The build (scripts/build-lite.mjs) checks it parses as ES5.
(function () {
  'use strict';

  var D = window.SAYABLE_DATA;
  var ITEMS = D.items;
  var CAT = {}, BOARD = {};
  var i;
  for (i = 0; i < D.cats.length; i++) CAT[D.cats[i][0]] = D.cats[i];
  for (i = 0; i < D.boards.length; i++) BOARD[D.boards[i][0]] = D.boards[i];

  var STRINGS = {
    en: {
      core: 'Core', topics: 'Topics', places: 'Places', phrases: 'Phrases', back: '‹ Back',
      settings: 'Settings', hint: 'Tap words to make a message',
      language: 'Language', size: 'Core words', starter: 'Fewer', standard: 'Standard', extended: 'More',
      speakTap: 'Say each word when tapped', on: 'On', off: 'Off',
      script: 'Chinese characters', hans: 'Simplified', hant: 'Traditional', pinyin: 'Show pinyin',
      textSize: 'Text size', normal: 'Normal', large: 'Large',
      clearAfter: 'Clear the message after speaking it', rate: 'Speaking speed', slow: 'Slower',
      done: 'Done', saving: 'Saving for offline use…', saved: 'Saved. Sayable Lite now works without internet.',
      saveFail: 'Could not save for offline use. Connect to the internet and open Sayable Lite again.',
      update: 'A new version is ready.', updateNow: 'Update', ok: 'OK',
      offlineOn: 'Works offline.', offlineOff: 'Not saved for offline use yet. Open it once with internet.',
      noSpeech: 'This device has no voice for speaking.',
      full: 'Open the full version (for newer devices)',
    },
    zh: {
      core: '核心词', topics: '话题', places: '地点', phrases: '短语', back: '‹ 返回',
      settings: '设置', hint: '点词语来组成句子',
      language: '语言', size: '核心词数量', starter: '少', standard: '标准', extended: '多',
      speakTap: '点击时读出每个词', on: '开', off: '关',
      script: '汉字', hans: '简体', hant: '繁体', pinyin: '显示拼音',
      textSize: '文字大小', normal: '正常', large: '大',
      clearAfter: '说完后清空句子', rate: '语速', slow: '慢一点',
      done: '完成', saving: '正在保存离线版本…', saved: '已保存。没有网络也能用。',
      saveFail: '无法保存离线版本。请连接网络后再打开。',
      update: '有新版本。', updateNow: '更新', ok: '好',
      offlineOn: '可以离线使用。', offlineOff: '还没有保存离线版本。请在有网络时打开一次。',
      noSpeech: '这台设备不能朗读。',
      full: '打开完整版（适用于较新的设备）',
    },
  };

  // ---- Settings (kept on this device) ----
  var KEY = 'sayable-lite';
  var S = { lang: 'en', level: 'standard', speakTap: true, script: 'hans', pinyin: true, big: false, clearAfter: false, rate: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (var k in saved) if (S.hasOwnProperty(k)) S[k] = saved[k];
  } catch (e) { /* private browsing or blocked storage: use the defaults */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not saved; still works */ }
  }
  function t(key) { return STRINGS[S.lang][key]; }

  // ---- Words ----
  // Item: [English, English spoken, simplified, traditional, pinyin, Chinese spoken, symbol, hue]
  function label(it) { return S.lang === 'zh' ? (S.script === 'hant' ? it[3] || it[2] : it[2]) : it[0]; }
  function spoken(it) { return S.lang === 'zh' ? it[5] || it[2] : it[1] || it[0]; }
  function catName(c) { return S.lang === 'zh' ? c[3] : c[2]; }
  function boardName(b) { return S.lang === 'zh' ? b[6] : b[5]; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  // ---- Speech ----
  var synth = window.speechSynthesis;
  function say(text) {
    if (!text) return;
    if (!synth || !window.SpeechSynthesisUtterance) return note(t('noSpeech'));
    if (synth.speaking || synth.pending) synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = S.lang === 'zh' ? 'zh-CN' : 'en-US';
    u.rate = S.rate;
    synth.speak(u);
  }

  // ---- Message ----
  var message = [];
  var $ = function (id) { return document.getElementById(id); };
  var msgEl = $('msg'), mainEl = $('main'), navEl = $('nav'), crumbEl = $('crumb'), sheetEl = $('sheet'), noteEl = $('note');

  function renderMessage() {
    if (!message.length) {
      msgEl.innerHTML = '<span class="hint">' + esc(t('hint')) + '</span>';
      return;
    }
    var h = '';
    for (var n = 0; n < message.length; n++) {
      var it = ITEMS[message[n]];
      h += it[6]
        ? '<span class="w"><img src="s/' + it[6] + '.png" alt="">' + esc(label(it)) + '</span>'
        : '<span class="w n">' + esc(label(it)) + '</span>';
    }
    msgEl.innerHTML = h;
    msgEl.scrollLeft = msgEl.scrollWidth;
  }
  function speakMessage() {
    var words = [];
    for (var n = 0; n < message.length; n++) words.push(spoken(ITEMS[message[n]]));
    say(words.join(S.lang === 'zh' ? '' : ' '));
    if (S.clearAfter) {
      message = [];
      renderMessage();
    }
  }
  function choose(id) {
    message.push(id);
    renderMessage();
    if (S.speakTap) say(spoken(ITEMS[id]));
  }

  // ---- Screens ----
  // view.tab: core | topics | places | phrases. view.cats: open topic folders. view.board: open place.
  var view = { tab: 'core', cats: [], board: null };
  var TABS = ['core', 'topics', 'places', 'phrases'];

  function renderNav() {
    var h = '';
    for (var n = 0; n < TABS.length; n++) {
      h += '<button type="button" data-tab="' + TABS[n] + '"' + (view.tab === TABS[n] ? ' class="on"' : '') + '>' + esc(t(TABS[n])) + '</button>';
    }
    h += '<button type="button" class="x" data-lang="1">' + (S.lang === 'zh' ? 'EN' : '中') + '</button>';
    h += '<button type="button" class="x" data-settings="1" aria-label="' + esc(t('settings')) + '">&#9881;</button>';
    navEl.innerHTML = h;
  }

  // One style rule sizes every tile, so the grid is laid out once instead of per tile.
  var sizeRule = document.createElement('style');
  document.head.appendChild(sizeRule);

  function autoCols(width) { return Math.max(3, Math.min(8, Math.floor(width / 150))); }

  function layout(cols, count, fit) {
    var width = mainEl.clientWidth - 6, height = mainEl.clientHeight - 6;
    var tileW = Math.floor(width / cols) - 6;
    var tileH = Math.min(Math.round(tileW * 0.95), 170);
    var fits = false;
    if (fit) {
      var rows = Math.ceil(count / cols);
      var h = Math.floor(height / rows) - 6;
      if (h >= 62) {
        tileH = Math.min(h, Math.round(tileW * 1.2));
        fits = true;
      }
    }
    var font = (tileH < 80 ? 13 : tileH < 110 ? 15 : 17) + (S.big ? 4 : 0);
    var extra = S.lang === 'zh' && S.pinyin ? 14 : 0;
    var img = Math.max(0, tileH - 10 - Math.round(font * 1.15) - extra);
    sizeRule.textContent = '.t{width:' + tileW + 'px;height:' + tileH + 'px}.t img{height:' + img + 'px}.t span{font-size:' + font + 'px}' +
      (img < 24 ? '.t img{display:none}' : '');
    mainEl.className = fits ? 'fit' : '';
  }

  function itemTile(id) {
    var it = id && ITEMS[id];
    var text = it && label(it);
    if (!text) return '<div class="t e"></div>';
    var py = S.lang === 'zh' && S.pinyin && it[4] ? '<small>' + esc(it[4]) + '</small>' : '';
    return '<button type="button" class="t' + (it[7] ? ' h-' + it[7] : '') + (it[6] ? '' : ' n') + '" data-item="' + esc(id) + '">' +
      (it[6] ? '<img src="s/' + it[6] + '.png" alt="">' : '') + '<span>' + esc(text) + '</span>' + py + '</button>';
  }
  function folderTile(attr, id, name, hue, sym) {
    return '<button type="button" class="t f' + (hue ? ' h-' + hue : '') + (sym ? '' : ' n') + '" ' + attr + '="' + esc(id) + '">' +
      (sym ? '<img src="s/' + sym + '.png" alt="">' : '') + '<span>' + esc(name) + '</span></button>';
  }
  function grid(html) { return '<div class="g">' + html + '</div>'; }
  function hasWord(id) { return !!(ITEMS[id] && label(ITEMS[id])); }

  function render() {
    renderNav();
    document.documentElement.lang = S.lang === 'zh' ? 'zh-Hans' : 'en';
    // The back row takes space from the grid, so it is set before tiles are measured.
    crumbEl.innerHTML = '';
    var width = mainEl.clientWidth - 6, h = '', n, cells;
    if (view.tab === 'core') {
      var core = BOARD['core-' + S.lang + '-' + S.level];
      cells = core[7];
      layout(core[4], cells.length, true);
      for (n = 0; n < cells.length; n++) h += itemTile(cells[n]);
      h = grid(h);
    } else if (view.tab === 'topics') {
      var open = view.cats.length ? CAT[view.cats[view.cats.length - 1]] : null;
      var folders = [], words = [];
      if (open) {
        folders = open[6];
        for (n = 0; n < open[7].length; n++) if (hasWord(open[7][n])) words.push(open[7][n]);
        crumbEl.innerHTML = '<button type="button" data-up="1">' + esc(t('back')) + '</button><span>' + esc(catName(open)) + '</span>';
      } else {
        for (n = 0; n < D.cats.length; n++) if (!D.cats[n][1]) folders.push(D.cats[n][0]);
      }
      layout(autoCols(width), folders.length + words.length, false);
      for (n = 0; n < folders.length; n++) {
        var c = CAT[folders[n]];
        h += folderTile('data-cat', c[0], catName(c), c[4], c[5]);
      }
      for (n = 0; n < words.length; n++) h += itemTile(words[n]);
      h = grid(h);
    } else if (view.tab === 'places') {
      if (view.board) {
        var b = BOARD[view.board];
        cells = b[7];
        crumbEl.innerHTML = '<button type="button" data-up="1">' + esc(t('back')) + '</button><span>' + esc(boardName(b)) + '</span>';
        layout(b[4], cells.length, true);
        for (n = 0; n < cells.length; n++) h += itemTile(cells[n]);
      } else {
        var places = [];
        for (n = 0; n < D.boards.length; n++) if (D.boards[n][1] === 'context') places.push(D.boards[n]);
        layout(autoCols(width), places.length, false);
        for (n = 0; n < places.length; n++) {
          var first = ITEMS[places[n][7][0]];
          h += folderTile('data-board', places[n][0], boardName(places[n]), 'teal', first && first[6]);
        }
      }
      h = grid(h);
    } else {
      layout(autoCols(width), 12, false);
      for (n = 0; n < D.quick.length; n++) {
        var q = D.quick[n], tiles = '';
        for (var m = 0; m < q[3].length; m++) if (hasWord(q[3][m])) tiles += itemTile(q[3][m]);
        if (tiles) h += '<h2>' + esc(S.lang === 'zh' ? q[2] : q[1]) + '</h2>' + grid(tiles);
      }
    }
    mainEl.innerHTML = h;
    mainEl.scrollTop = 0;
  }

  // ---- Settings ----
  var OPTIONS = [
    ['lang', 'language', [['en', 'English'], ['zh', '中文']]],
    ['level', 'size', [['starter', 'starter'], ['standard', 'standard'], ['extended', 'extended']]],
    ['speakTap', 'speakTap', [[true, 'on'], [false, 'off']]],
    ['rate', 'rate', [[0.8, 'slow'], [1, 'normal']]],
    ['clearAfter', 'clearAfter', [[false, 'off'], [true, 'on']]],
    ['big', 'textSize', [[false, 'normal'], [true, 'large']]],
    ['script', 'script', [['hans', 'hans'], ['hant', 'hant']]],
    ['pinyin', 'pinyin', [[true, 'on'], [false, 'off']]],
  ];
  function renderSettings() {
    var h = '<h1>' + esc(t('settings')) + '</h1>';
    for (var n = 0; n < OPTIONS.length; n++) {
      var o = OPTIONS[n];
      if ((o[0] === 'script' || o[0] === 'pinyin') && S.lang !== 'zh') continue;
      h += '<div class="row"><div>' + esc(t(o[1])) + '</div><div class="opts">';
      for (var m = 0; m < o[2].length; m++) {
        var v = o[2][m];
        h += '<button type="button" data-set="' + n + '" data-v="' + m + '"' + (S[o[0]] === v[0] ? ' class="on"' : '') + '>' +
          esc(o[0] === 'lang' ? v[1] : t(v[1])) + '</button>';
      }
      h += '</div></div>';
    }
    h += '<button type="button" class="done" data-done="1">' + esc(t('done')) + '</button>';
    h += '<p>' + esc(offlineStatus()) + '</p><p><a href="../">' + esc(t('full')) + '</a></p>';
    sheetEl.innerHTML = h;
  }
  function openSettings() {
    renderSettings();
    sheetEl.hidden = false;
  }
  function closeSettings() {
    sheetEl.hidden = true;
    renderMessage();
    render();
  }

  // ---- Notes (short messages at the bottom) ----
  var noteTimer = null;
  function note(text, action, run) {
    clearTimeout(noteTimer);
    noteEl.innerHTML = (action ? '<button type="button">' + esc(action) + '</button>' : '') + esc(text);
    noteEl.hidden = false;
    noteEl.onclick = function () {
      noteEl.hidden = true;
      if (run) run();
    };
    if (!action) noteTimer = setTimeout(function () { noteEl.hidden = true; }, 5000);
  }

  // ---- Offline (AppCache: the only offline option on iOS 10) ----
  var cache = window.applicationCache;
  var downloading = false;
  function offlineStatus() {
    if (!cache) return '';
    return cache.status === 1 || cache.status === 4 || cache.status === 2 ? t('offlineOn') : t('offlineOff');
  }
  if (cache) {
    cache.addEventListener('downloading', function () { downloading = true; }, false);
    cache.addEventListener('progress', function (e) {
      // Only the first save gets a progress note; updates download quietly.
      if (cache.status === 3 && !offlineReadyBefore && e.total) note(t('saving') + ' ' + e.loaded + '/' + e.total, t('ok'));
    }, false);
    cache.addEventListener('cached', function () {
      downloading = false;
      note(t('saved'));
    }, false);
    cache.addEventListener('updateready', function () {
      downloading = false;
      // Never reload by itself: someone may be in the middle of a message.
      note(t('update'), t('updateNow'), function () { location.reload(); });
    }, false);
    cache.addEventListener('error', function () {
      if (downloading && navigator.onLine) note(t('saveFail'), t('ok'));
      downloading = false;
    }, false);
  }
  var offlineReadyBefore = !!cache && cache.status !== 0;

  // ---- Touch handling ----
  // Taps use click (no delay with this viewport); touchstart only shows the press.
  var pressed = null;
  function unpress() {
    if (pressed) pressed.className = pressed.className.replace(' down', '');
    pressed = null;
  }
  mainEl.addEventListener('touchstart', function (e) {
    var el = e.target;
    while (el && el !== mainEl && !(el.className && /\bt\b/.test(el.className))) el = el.parentNode;
    if (el && el !== mainEl) {
      unpress();
      pressed = el;
      el.className += ' down';
    }
  }, false);
  mainEl.addEventListener('touchend', unpress, false);
  mainEl.addEventListener('touchcancel', unpress, false);
  mainEl.addEventListener('touchmove', unpress, false);

  function target(e, attr) {
    var el = e.target;
    while (el && el.getAttribute) {
      if (el.getAttribute(attr) !== null) return el.getAttribute(attr);
      el = el.parentNode;
    }
    return null;
  }

  mainEl.addEventListener('click', function (e) {
    var v;
    if ((v = target(e, 'data-item')) !== null) choose(v);
    else if ((v = target(e, 'data-cat')) !== null) { view.cats.push(v); render(); }
    else if ((v = target(e, 'data-board')) !== null) { view.board = v; render(); }
  }, false);
  crumbEl.addEventListener('click', function (e) {
    if (target(e, 'data-up') === null) return;
    if (view.tab === 'topics') view.cats.pop();
    else view.board = null;
    render();
  }, false);
  navEl.addEventListener('click', function (e) {
    var v;
    if ((v = target(e, 'data-tab')) !== null) {
      // Tapping the open tab again goes back to its start.
      if (v === view.tab) { view.cats = []; view.board = null; }
      view.tab = v;
      render();
    } else if (target(e, 'data-lang') !== null) {
      S.lang = S.lang === 'zh' ? 'en' : 'zh';
      save();
      message = [];
      renderMessage();
      render();
    } else if (target(e, 'data-settings') !== null) {
      openSettings();
    }
  }, false);
  sheetEl.addEventListener('click', function (e) {
    var set = target(e, 'data-set');
    if (set !== null) {
      var o = OPTIONS[+set], v = o[2][+target(e, 'data-v')][0];
      if (o[0] === 'lang' && v !== S.lang) message = [];
      S[o[0]] = v;
      save();
      renderSettings();
    } else if (target(e, 'data-done') !== null) {
      closeSettings();
    }
  }, false);
  msgEl.addEventListener('click', speakMessage, false);
  $('speak').addEventListener('click', speakMessage, false);
  $('back').addEventListener('click', function () {
    message.pop();
    renderMessage();
  }, false);
  $('clear').addEventListener('click', function () {
    message = [];
    renderMessage();
  }, false);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  }, false);

  renderMessage();
  render();
})();

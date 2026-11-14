/* Этап C: боковая панель для ПК. Работает только при ширине >= 1200px и наличии мыши/трекпада.
   На телефоне и планшете скрипт ничего не меняет. Панель сдвигает содержимое (не перекрывает),
   сворачивается кнопкой. Страница Алии (aliya/*) панель не получает. */
(function () {
  'use strict';
  if (window.__kkSideLoaded) return;
  window.__kkSideLoaded = true;
  var mq = window.matchMedia('(min-width:1200px) and (hover:hover) and (pointer:fine)');
  if (!mq.matches) return;
  if (location.pathname.indexOf('/aliya/') !== -1) return;
  // Корень сайта — по адресу самого скрипта (работает из подпапок и с подпутём хоста)
  var BASE = ((document.currentScript && document.currentScript.src) || '').replace(/desktop-sidebar\.js.*$/, '');

  var KEY = 'kk_side_collapsed';
  var items = [
    { href: 'index.html', label: 'Асосӣ', icon: '🏠' },
    { href: 'kitobho.html', label: 'Китобҳо', icon: '📚' },
    { href: 'winners.html', label: 'Ғолибон', icon: '🏆' },
    { href: 'dovtalab/index.html', label: 'Довталаб', icon: '🎓' },
    { href: 'Lenta.html', label: 'Лента', icon: '📰' },
    { href: 'chats.html', label: 'Чат', icon: '💬' },
    { href: 'aliya/index.html', label: 'Алия', icon: '✨' }
  ];

  var css = [
    '.kk-side{position:fixed;left:0;top:0;bottom:0;width:240px;background:#0b1729;border-right:1px solid rgba(201,168,76,.22);',
    'z-index:900;display:flex;flex-direction:column;padding:12px 10px;gap:4px;transition:width .2s;box-sizing:border-box;overflow:hidden}',
    '.kk-side.kk-min{width:68px}',
    '.kk-side-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:4px 6px}',
    '.kk-side-brand{color:#E8C96D;font:700 15px system-ui,sans-serif;white-space:nowrap;overflow:hidden}',
    '.kk-side.kk-min .kk-side-brand{display:none}',
    '.kk-side-toggle{background:#14263e;color:#E8C96D;border:1px solid rgba(201,168,76,.3);border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:18px;flex:0 0 34px}',
    '.kk-side a{display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;color:#F0EAD6;text-decoration:none;font:600 15px system-ui,sans-serif;white-space:nowrap;overflow:hidden}',
    '.kk-side a:hover{background:rgba(201,168,76,.12)}',
    '.kk-side a.on{background:rgba(201,168,76,.22);color:#E8C96D}',
    '.kk-side .kk-ic{width:28px;text-align:center;font-size:18px;flex:0 0 28px}',
    '.kk-side.kk-min .kk-lb{display:none}',
    '.kk-side.kk-min a{justify-content:center;padding:10px 0}',
    'body.kk-side-on{padding-left:240px!important;transition:padding-left .2s}',
    'body.kk-side-on.kk-side-min{padding-left:68px!important}',
    'body.kk-side-on .nav-bottom{display:none!important}',
    '#kkhDesktopNav,#kkhDesktopNavToggle{display:none!important}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'kk-side-style';
  style.textContent = css;
  document.head.appendChild(style);

  var here = location.pathname.split('/').slice(-2).join('/');
  var side = document.createElement('aside');
  side.className = 'kk-side';
  side.setAttribute('aria-label', 'Менюи асосӣ');

  var top = document.createElement('div');
  top.className = 'kk-side-top';
  top.innerHTML = '<span class="kk-side-brand">Китобхона</span>';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kk-side-toggle';
  btn.setAttribute('aria-label', 'Паҳн/ҷамъ кардани меню');
  btn.textContent = '☰';
  top.appendChild(btn);
  side.appendChild(top);

  items.forEach(function (it) {
    var a = document.createElement('a');
    a.href = BASE + it.href;
    a.setAttribute('aria-label', it.label);
    var isOn = location.pathname.slice(-it.href.length) === it.href;
    if (isOn) a.className = 'on';
    a.innerHTML = '<span class="kk-ic">' + it.icon + '</span><span class="kk-lb">' + it.label + '</span>';
    side.appendChild(a);
  });

  function apply(collapsed) {
    side.classList.toggle('kk-min', collapsed);
    document.body.classList.add('kk-side-on');
    document.body.classList.toggle('kk-side-min', collapsed);
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
  }

  btn.addEventListener('click', function () {
    apply(!side.classList.contains('kk-min'));
  });

  var saved = '0';
  try { saved = localStorage.getItem(KEY) || '0'; } catch (e) {}

  function mount() {
    document.body.appendChild(side);
    apply(saved === '1');
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();

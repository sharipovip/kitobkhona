/* =====================================================================
   native-fallback.js — v178
   Запасной мост ба нативному канали барномаи Android.

   Дар барномаи Android баъзан `window.AndroidBridge` сохта намешавад
   (хато дар JS-шими солии кӯҳна), ва он гоҳ мешавад мошини натиҷиро
   аз `KitobkhonaNative.postMessage` истифода барем — ҳамон методҳо,
   ҳамон форм.

   Чаро як файли алоҳида: Алия дар Reader як iframe аст, ва дар он
   AndroidBridge не буд. Бинобар ин бояд дар ҳамон iframe ҳам муҳайид
   шавад — иначе нативный диалоги «Сохранить как» ( ки дар Android
   як пурсиши воқеӣ медиҳад ) даст намерасад ва файл бе садо ба
   «Загрузки» меравад.

   Файлро дар reader.html ва aliyа/reader-aliya.html дар aliyа-bridge.js
   пеш аз он бор мекунем.
   ===================================================================== */
(function (window) {
  'use strict';
  try {
    var candidates = [];
    function push(w) { if (w && candidates.indexOf(w) === -1) candidates.push(w); }
    try { if (window.top) push(window.top); } catch (e) {}
    try { if (window.parent) push(window.parent); } catch (e) {}
    push(window);

    var realHost = null;
    var nativeHost = null;
    var i, c;
    for (i = 0; i < candidates.length; i++) {
      try {
        c = candidates[i];
        if (!realHost && c && c.AndroidBridge && c.AndroidBridge.__kkNativeFallback !== true &&
            (typeof c.AndroidBridge.saveFile === 'function' ||
             typeof c.AndroidBridge.saveBase64File === 'function' ||
             typeof c.AndroidBridge.saveSymbolFile === 'function')) {
          realHost = c;
        }
        if (!nativeHost && c && c.KitobkhonaNative && typeof c.KitobkhonaNative.postMessage === 'function') {
          nativeHost = c;
        }
      } catch (e) {}
    }
    if (!realHost && !nativeHost) return;

    var hadRealOwn = !!(window.AndroidBridge && window.AndroidBridge.__kkNativeFallback !== true);
    var bridge = window.AndroidBridge || {};
    var map = {
      saveBase64File: 'saveFile', saveFile: 'saveFile', saveSymbolFile: 'saveFile', openFile: 'openFile',
      shareFile: 'shareFile', shareText: 'shareText', shareTextWithWhatsAppChooser: 'shareTextWithWhatsAppChooser',
      shareImageWithText: 'shareImageWithText', shareRemoteImage: 'shareRemoteImage',
      shareRemoteImages: 'shareRemoteImages', saveUserId: 'saveUserId', saveAuthToken: 'saveAuthToken',
      openExternalUrl: 'openExternalUrl', openOfficialSite: 'openOfficialSite'
    };
    var saveMethods = { saveFile: true, saveBase64File: true, saveSymbolFile: true };
    Object.keys(map).forEach(function (name) {
      if (typeof bridge[name] === 'function') return;
      var hasRealFn = !!(realHost && realHost.AndroidBridge && typeof realHost.AndroidBridge[name] === 'function');
      var fn = function () {
        var args = Array.prototype.slice.call(arguments);
        if (realHost && realHost.AndroidBridge && typeof realHost.AndroidBridge[name] === 'function') {
          try {
            return realHost.AndroidBridge[name].apply(realHost.AndroidBridge, args);
          } catch (realErr) {
            if (!nativeHost && saveMethods[name]) throw realErr;
            console.warn('Real AndroidBridge call failed, trying KitobkhonaNative', realErr);
          }
        }
        if (nativeHost && nativeHost.KitobkhonaNative && typeof nativeHost.KitobkhonaNative.postMessage === 'function') {
          try {
            nativeHost.KitobkhonaNative.postMessage(JSON.stringify({ method: map[name], args: args }));
            return;
          } catch (e) {
            console.warn('Native feature is unavailable', e);
            if (saveMethods[name]) throw e;
          }
        } else if (saveMethods[name]) {
          throw new Error('Native save bridge unavailable');
        }
      };
      if (!hasRealFn) {
        try { fn.__kkNativeFallback = true; } catch (e) {}
      }
      bridge[name] = fn;
    });
    if (!hadRealOwn && !realHost) {
      try { bridge.__kkNativeFallback = true; } catch (e) {}
    }
    window.AndroidBridge = bridge;
  } catch (e) {}
})(window);

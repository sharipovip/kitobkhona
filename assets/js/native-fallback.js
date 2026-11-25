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
    var nativeHost = null;
    var candidates = [window];
    try { if (window.parent && candidates.indexOf(window.parent) === -1) candidates.push(window.parent); } catch (e) {}
    try { if (window.top && candidates.indexOf(window.top) === -1) candidates.push(window.top); } catch (e) {}
    for (var i = 0; i < candidates.length; i++) {
      try {
        var c = candidates[i];
        if (c && c.KitobkhonaNative && typeof c.KitobkhonaNative.postMessage === 'function') {
          nativeHost = c;
          break;
        }
      } catch (e) {}
    }
    if (!nativeHost) return;
    var bridge = window.AndroidBridge || {};
    var map = {
      saveBase64File: 'saveFile', saveFile: 'saveFile', saveSymbolFile: 'saveFile', openFile: 'openFile',
      shareFile: 'shareFile', shareText: 'shareText', shareTextWithWhatsAppChooser: 'shareTextWithWhatsAppChooser',
      shareImageWithText: 'shareImageWithText', shareRemoteImage: 'shareRemoteImage',
      shareRemoteImages: 'shareRemoteImages', saveUserId: 'saveUserId', saveAuthToken: 'saveAuthToken',
      openExternalUrl: 'openExternalUrl', openOfficialSite: 'openOfficialSite'
    };
    Object.keys(map).forEach(function (name) {
      if (typeof bridge[name] === 'function') return;
      bridge[name] = function () {
        try {
          nativeHost.KitobkhonaNative.postMessage(JSON.stringify({ method: map[name], args: Array.prototype.slice.call(arguments) }));
        } catch (e) {
          console.warn('Native feature is unavailable', e);
        }
      };
    });
    window.AndroidBridge = bridge;
  } catch (e) {}
})(window);

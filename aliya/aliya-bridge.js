/**
 * Aliya Platform Bridge v1.0.0
 * Мости ҳамгироӣ байни Алия ва муҳитҳои гуногун:
 * 1) Барномаи Android (AndroidBridge / KitobkhonaNative)
 * 2) Барномаи Windows PC (.exe / WebView2)
 * 3) Браузерҳои муосир (Web Share API / Blob Download)
 */

(function (window) {
  'use strict';

  var AliyaBridge = {
    /**
     * Окна, ки бояд сӯҳшуд: ҳамон чаҳр, родитель ва болои он.
     * Алия дар Reader як iframe аст, ва танҳо дар reader.html (родитель)
     * AndroidBridge-и қуfallback аст — бинобар ин дар iframe он нест.
     * v178: агар ин тиқоз дар як аз ин оконоҳо ҳаст, нативный диалог
     * «Сохранить как» кор мекунад.
     */
    hostWindows: function () {
      var list = [];
      function push(w) { if (w && list.indexOf(w) === -1) list.push(w); }
      push(window);
      try { push(window.parent); } catch (e) {}
      try { push(window.top); } catch (e) {}
      return list;
    },

    /**
     * v180: Окно, дар кӯм мумкин аст "Сохранить как"-и браузерро иҷро кунем.
     *
     * Проблема, ки корбар гӯшт: Алия дар Reader як iframe аст ва
     * showSaveFilePicker дар он кор намекунад — API танҳо дар болои
     * саҳифа (top-level browsing context) кор мекунад. Бинобар ин дар
     * iframe он ё нест, ё бо SecurityError мефавтад ва мост бе садо
     * ба боршаврии одӣ меафтад (корбар танҳо «Загрузки»-ро мебинад).
     *
     * Ҳамон тарзи кор кардани «Скачать книгу» (config.js → downloadFile):
     * он дар саҳифаи асоси кор мекунад ва ба болои оконо дастгирӣ мекунад.
     * Аз ҳамин сабаб мо болои оконоҳоро аз худ ба нав мешӯем — на танҳо
     * дар асоси худ.
     */
    pickerWindows: function () {
      var list = [], top = null;
      try { top = window.top; } catch (e) { top = null; }
      // Агар болои оконо ҳаст — пеш аз он, чунки API дар он кор мекунад.
      if (top) list.push(top);
      try { if (window.parent && window.parent !== window && list.indexOf(window.parent) === -1) list.push(window.parent); } catch (e) {}
      if (list.indexOf(window) === -1) list.push(window);
      return list;
    },

    /**
     * v180: Кӯшиши кушодани "Сохранить как" дар ҳама оконоҳо.
     * Бозгашт: {win, handle, method} ё null, агар имконият нест.
     *
     * Ин функсия БОРЕ дуруст дар дастгирии корбар (user gesture) даст
     * гирифта мешавад — барои он ки браузер имкон диҳад.
     */
    openSavePicker: async function (fileName, mimeType) {
      var ext = (String(fileName || '').match(/\.([A-Za-z0-9]+)$/) || ['', ''])[1].toLowerCase();
      var cleanMime = String(mimeType || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
      var types = [];
      if (ext) types.push({ description: ext.toUpperCase() + ' file', accept: { [cleanMime]: ['.' + ext] } });
      var opts = { suggestedName: fileName };
      if (types.length) opts.types = types;
      var wins = this.pickerWindows();
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i];
        try {
          if (!w || typeof w.showSaveFilePicker !== 'function') continue;
          var handle;
          try {
            handle = await w.showSaveFilePicker(opts);
          } catch (firstErr) {
            if (firstErr && firstErr.name === 'AbortError') throw firstErr;
            if (firstErr && firstErr.name === 'TypeError' && opts.types) {
              handle = await w.showSaveFilePicker({ suggestedName: fileName });
            } else {
              throw firstErr;
            }
          }
          return { win: w, handle: handle, method: 'file_picker', fileName: fileName };
        } catch (err) {
          // AbortError = корбар қатъ карда — ин хато нест.
          if (err && err.name === 'AbortError') { err.abortedByUser = true; throw err; }
          console.warn('[AliyaBridge] Save-As picker unavailable in this window:', err);
        }
      }
      return null;
    },

    /**
     * v180: Навиштани як файли интихобшуда (handle-и showSaveFilePicker).
     */
    writeToPicker: async function (target, blob) {
      if (!target || !target.handle) throw new Error('Мақсад сабт нест.');
      var writable = await target.handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, method: 'file_picker', fileName: target.fileName };
    },

    isAndroid: function () {
      var list = this.hostWindows();
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        try {
          if ((w.AndroidBridge && typeof w.AndroidBridge.saveFile === 'function') ||
              (w.AndroidBridge && typeof w.AndroidBridge.saveBase64File === 'function') ||
              (w.KitobkhonaNative && typeof w.KitobkhonaNative.postMessage === 'function')) return true;
        } catch (e) {}
      }
      return false;
    },

    isWindowsApp: function () {
      return !!(window.chrome && window.chrome.webview) || !!window.__TAURI__;
    },

    /**
     * Захира кардани файл (DOCX, PDF, сурат, матн)
     * @param {string|Blob} content - Base64 сатр ё Blob объект
     * @param {string} fileName - Номи файл (бо пасванд, масалан "Нақшаи_дарс.docx")
     * @param {string} mimeType - MIME-навъ (масалан "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
     */
    saveFile: async function (content, fileName, mimeType, opts) {
      mimeType = mimeType || 'application/octet-stream';
      opts = opts || {};
      var originalBlob = content instanceof Blob ? content : null;
      var base64 = '';

      if (originalBlob) {
        if (originalBlob.size === 0) throw new Error('Файл холӣ аст');
      } else if (typeof content === 'string') {
        if (content.indexOf('base64,') !== -1) {
          base64 = content.split('base64,')[1];
        } else {
          base64 = content;
        }
        if (!base64) throw new Error('Файл холӣ аст');
      } else {
        throw new Error('Файл холӣ аст');
      }

      // 1. Android Native Bridge — нативный диалог «Сохранить как».
      //    v178: ищем мост во всех окнах (своё / родитель / верхнее).
      //    В iframe Алии моста нет — он есть в reader.html.
      if (this.isAndroid()) {
        try {
          if (!base64 && originalBlob) base64 = await this.blobToBase64(originalBlob);
          if (!base64) throw new Error('Файл холӣ аст');
          var hosts = this.hostWindows(), done = false;
          for (var hi = 0; hi < hosts.length && !done; hi++) {
            var hw = hosts[hi];
            if (hw.AndroidBridge) {
              if (typeof hw.AndroidBridge.saveFile === 'function') {
                hw.AndroidBridge.saveFile(base64, fileName, mimeType);
                return { success: true, method: 'android_bridge' };
              }
              if (typeof hw.AndroidBridge.saveBase64File === 'function') {
                hw.AndroidBridge.saveBase64File(base64, fileName, mimeType);
                return { success: true, method: 'android_base64' };
              }
            }
            if (hw.KitobkhonaNative && typeof hw.KitobkhonaNative.postMessage === 'function') {
              hw.KitobkhonaNative.postMessage(JSON.stringify({
                method: 'saveFile',
                args: [base64, fileName, mimeType]
              }));
              return { success: true, method: 'native_post_message' };
            }
          }
        } catch (e) {
          console.warn('[AliyaBridge] Android save error, falling back to browser download', e);
        }
      }

      // 2. Browser & Windows PC: use the native Save As picker when available.
      //    v177: агар интихоби файл сар шуда (SecurityError — истифодабаран
      //    дар чаҳрони дигар, AbortError — корбар қатъ карда), мо ба боршаврӣ
      //    асӣ ҳӯд мегузарда мешавад. Пеш аз ин ҳар хато ба корбар
      //    «Ҳуҷҷат сабт нашуд» мекард ва файл ҳеҷ ҳеч ҷо намешуд.
      // v180: интихоби файл дар БОЛОИ ОКОН кушода мешавад — чунки API
      // танҳо дар саҳифаи асоси (top-level) кор мекунад. Дар iframe-и
      // Алия дар Reader он кор намекунад ва мост бе садо ба боршаврии
      // одӣ меафтад — корбар танҳо «Загрузки»-ро мебинад.
      // Ҳамон тарзи кор кардани «Скачать книгу» (config.js → downloadFile).
      if (originalBlob && !opts.skipPicker) {
        try {
          var target = await this.openSavePicker(fileName, mimeType);
          if (target) return await this.writeToPicker(target, originalBlob);
        } catch (err) {
          // AbortError = корбар ҳаққӣ қатъ карда; ин хато нест, амма файл
          // ҳеҷ сабт нашудааст. SecurityError/NotAllowedError = интихоби файл
          // иҷозат надошт — боз ҳамон файлро аз ҳамон чаҳр мефируем.
          if (err && err.name === 'AbortError') { err.abortedByUser = true; throw err; }
          console.warn('[AliyaBridge] Save-As picker unavailable, falling back to a normal download:', err);
        }
      }
      // 3. Боршаврии одӣ (гузариш аз интихоби файл) — дар ҳар браузер кор мекунад.
      //    v178: боршаврӣ дар БОЛОИ ОКНО (window.top) иҷро мешавад — ҳамон
      //    тарзи кор кардани боргирии китоб (config.js → downloadFile).
      //    Дар iframe Chrome метавонад диалоги «куда сохранить»-ро
      //    нишон надиҳад, ам дар болои окно — нишон медиҳад.
      try {
        var blob = originalBlob;
        if (!blob) {
          var byteCharacters = atob(base64);
          var byteNumbers = new Array(byteCharacters.length);
          for (var i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          var byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: mimeType });
        }
        // Кайд кардани равшан: файл ба «Загрузки» меравад, агар браузер
        // пурсиш накунад — корбар бояд инро бинад.
        var host = window;
        try { if (window.top && window.top !== window) host = window.top; } catch (e) { host = window; }
        var doc = (host && host.document && host.document.body) ? host.document : document;
        var urlHost = (host && host.URL && typeof host.URL.createObjectURL === 'function') ? host.URL : URL;
        var url = urlHost.createObjectURL(blob);
        var a = doc.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        doc.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { doc.body.removeChild(a); } catch (e) {}
          try { urlHost.revokeObjectURL(url); } catch (e) {}
        }, 15000);
        return { success: true, method: 'browser_blob', silent: true, fileName: fileName };
      } catch (err) {
        console.error('[AliyaBridge] Download error:', err);
        throw err;
      }
    },

    /**
     * Мубодилаи файл ё матн (Share)
     */
    shareFileOrText: async function (options) {
      options = options || {};
      var title = options.title || 'Китобхона · Алия';
      var text = options.text || '';
      var url = options.url || 'https://play.google.com/store/apps/details?id=com.kitobkhona.app&pcampaignid=web_share';

      // 1. Android Native share
      if (this.isAndroid()) {
        try {
          if (options.base64 && options.fileName && window.AndroidBridge && typeof window.AndroidBridge.shareFile === 'function') {
            window.AndroidBridge.shareFile(options.base64, options.fileName, options.mimeType || 'application/octet-stream');
            return true;
          }
          if (window.AndroidBridge && typeof window.AndroidBridge.shareText === 'function') {
            window.AndroidBridge.shareText(text + '\n' + url);
            return true;
          }
        } catch (e) {}
      }

      // 2. Web Share API
      if (navigator.share) {
        try {
          var shareData = { title: title, text: text, url: url };
          if (options.blob && options.fileName && navigator.canShare) {
            var file = new File([options.blob], options.fileName, { type: options.mimeType || 'application/octet-stream' });
            if (navigator.canShare({ files: [file] })) {
              shareData.files = [file];
            }
          }
          await navigator.share(shareData);
          return true;
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('[AliyaBridge] Web share error:', e);
        }
      }

      // 3. Clipboard fallback
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text + '\n' + url);
        return 'clipboard_copied';
      }

      return false;
    },

    blobToBase64: function (blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function () {
          var res = reader.result;
          if (typeof res === 'string') {
            var idx = res.indexOf('base64,');
            resolve(idx !== -1 ? res.substring(idx + 7) : res);
          } else {
            resolve('');
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  };

  window.AliyaBridge = AliyaBridge;
})(window);

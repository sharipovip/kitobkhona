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
    isAndroid: function () {
      return !!(
        (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') ||
        (window.AndroidBridge && typeof window.AndroidBridge.saveBase64File === 'function') ||
        (window.KitobkhonaNative && typeof window.KitobkhonaNative.postMessage === 'function')
      );
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
    saveFile: async function (content, fileName, mimeType) {
      mimeType = mimeType || 'application/octet-stream';
      var base64 = '';

      if (content instanceof Blob) {
        base64 = await this.blobToBase64(content);
      } else if (typeof content === 'string') {
        if (content.indexOf('base64,') !== -1) {
          base64 = content.split('base64,')[1];
        } else {
          base64 = content;
        }
      }

      // 1. Android Native Bridge
      if (this.isAndroid()) {
        try {
          if (window.AndroidBridge) {
            if (typeof window.AndroidBridge.saveFile === 'function') {
              window.AndroidBridge.saveFile(base64, fileName, mimeType);
              return { success: true, method: 'android_bridge' };
            }
            if (typeof window.AndroidBridge.saveBase64File === 'function') {
              window.AndroidBridge.saveBase64File(base64, fileName, mimeType);
              return { success: true, method: 'android_base64' };
            }
          }
          if (window.KitobkhonaNative && typeof window.KitobkhonaNative.postMessage === 'function') {
            window.KitobkhonaNative.postMessage(JSON.stringify({
              method: 'saveFile',
              args: [base64, fileName, mimeType]
            }));
            return { success: true, method: 'native_post_message' };
          }
        } catch (e) {
          console.warn('[AliyaBridge] Android save error, falling back to browser download', e);
        }
      }

      // 2. Browser & Windows PC Download
      try {
        var byteCharacters = atob(base64);
        var byteNumbers = new Array(byteCharacters.length);
        for (var i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        var byteArray = new Uint8Array(byteNumbers);
        var blob = new Blob([byteArray], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1500);
        return { success: true, method: 'browser_blob' };
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

/* Довталаб · dl.js — ягонаи зеркашии файл «ҳамчун китобҳои Китобхона».
   Ҳамон канали хонанда (downloadCurrent → downloadFile дар reader):
     боркунӣ бо пешрафт «Ҳифз шуда истодааст... N%»
       → AndroidBridge.saveFile (мости Android-и барномаи Китобхона)
       → Android ПАПКАИ НИГОҲДОРИРО интихоб мекунад (ACTION_CREATE_DOCUMENT)
       → ✓ «Файл барои захира кардан омода».
   Бе мости Android — зеркашии оддии браузерӣ (дар Dovtalab-и Capacitor/pywebview-ро
   cap-downloads.js мегирад). Барои истифода:
     DovDL.download(url, 'file.pdf', { localFirst:true })  — боркунӣ + захира
     DovDL.saveBlob(blob, 'file.pdf')                      — танҳо захира
     DovDL.progress(pct, text)                             — пешрафт (ихтиёрӣ) */
(function () {
  'use strict';

  /* Пули эҳтиётӣ (ҳамон тавре ки config.js дар саҳифаҳои Китобхона):
     агар AndroidBridge набошад, вале канали нативии KitobkhonaNative ҳаст —
     ҳамон методҳоро месозем. Бе ин «saveFile» дар саҳифаҳои Довталаб дастрас
     набуд ва Android папкаи нигоҳдориро пурсида наметавонист. */
  function installBridge() {
    try {
      if (!window.KitobkhonaNative || typeof window.KitobkhonaNative.postMessage !== 'function') return;
      var bridge = window.AndroidBridge || {};
      var map = { saveBase64File: 'saveFile', saveFile: 'saveFile', saveSymbolFile: 'saveFile', openFile: 'openFile', shareFile: 'shareFile',
        shareText: 'shareText', shareTextWithWhatsAppChooser: 'shareTextWithWhatsAppChooser', shareImageWithText: 'shareImageWithText',
        shareRemoteImage: 'shareRemoteImage', shareRemoteImages: 'shareRemoteImages', saveUserId: 'saveUserId', saveAuthToken: 'saveAuthToken',
        openExternalUrl: 'openExternalUrl', openOfficialSite: 'openOfficialSite' };
      Object.keys(map).forEach(function (name) {
        if (typeof bridge[name] === 'function') return;
        bridge[name] = function () {
          try { window.KitobkhonaNative.postMessage(JSON.stringify({ method: map[name], args: Array.prototype.slice.call(arguments) })); }
          catch (e) { console.warn('Native feature is unavailable', e); }
        };
      });
      window.AndroidBridge = bridge;
    } catch (e) {}
    try {
      /* Версияи кӯҳнаи APK: мости мустақими KitobAndroid */
      if (!window.AndroidBridge && window.KitobAndroid && typeof window.KitobAndroid.saveFile === 'function') {
        window.AndroidBridge = {
          saveFile: function (b64, n, m) { window.KitobAndroid.saveFile(b64, n, m); },
          shareFile: function (b64, n, m) { if (window.KitobAndroid.shareFile) window.KitobAndroid.shareFile(b64, n, m); }
        };
      }
    } catch (e) {}
  }
  installBridge();

  var boxEl, barEl, textEl, hideTimer;

  function ensureBox() {
    if (boxEl && boxEl.parentNode) return boxEl;
    boxEl = document.createElement('div');
    boxEl.id = 'dovDlProgress';
    boxEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;width:min(340px,86vw);padding:12px 16px;border-radius:14px;background:#132a23;color:#eaf4ee;font:13px/1.45 system-ui,sans-serif;border:1px solid #2b4a3e;box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;transition:opacity .25s';
    boxEl.innerHTML = '<div id="dovDlText" style="margin-bottom:8px"></div><div style="height:7px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden"><div id="dovDlBar" style="height:100%;width:0;border-radius:99px;background:#3e8f68;transition:width .25s"></div></div>';
    document.body.appendChild(boxEl);
    barEl = boxEl.querySelector('#dovDlBar');
    textEl = boxEl.querySelector('#dovDlText');
    return boxEl;
  }

  /* Пешрафт: pct 0..100 (ё -1 — ҳаҷм номаълум), done=1 муваффақ, done=2 хато */
  function progress(pct, text, done) {
    try {
      ensureBox();
      boxEl.style.borderColor = done ? '#3e8f68' : '#2b4a3e';
      textEl.textContent = text || '';
      if (pct >= 0) barEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
      boxEl.style.opacity = '1';
      clearTimeout(hideTimer);
      if (done) hideTimer = setTimeout(function () { boxEl.style.opacity = '0'; }, done === 2 ? 4000 : 3500);
    } catch (e) {}
  }

  function hide() { try { if (boxEl) boxEl.style.opacity = '0'; } catch (e) {} }

  function mimeByName(name) {
    var ext = (String(name).split('.').pop() || '').toLowerCase();
    return ({
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain', zip: 'application/zip',
      exe: 'application/octet-stream', msi: 'application/octet-stream',
      apk: 'application/vnd.android.package-archive',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      mp3: 'audio/mpeg', mp4: 'video/mp4'
    })[ext] || 'application/octet-stream';
  }

  function blobToBase64(blob) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
      fr.onerror = bad;
      fr.readAsDataURL(blob);
    });
  }

  function isAndroidApp() {
    installBridge();
    return !!(window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function');
  }

  function plainSave(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name || 'file';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 8000);
  }

  /* Захира «ҳамчун китоб»: Android → интихоби папка; вагарна — браузер */
  function saveBlob(blob, name, opts) {
    opts = opts || {};
    name = name || 'file';
    var ui = opts.ui !== false;
    return new Promise(function (resolve) {
      installBridge();
      if (isAndroidApp()) {
        if (ui) progress(92, 'Ҷойи нигоҳдориро интихоб кунед…');
        blobToBase64(blob).then(function (b64) {
          try {
            window.AndroidBridge.saveFile(b64, name, mimeByName(name));
            if (ui) progress(100, '✓ Файл барои захира кардан омода', 1);
          } catch (e) {
            plainSave(blob, name);
            if (ui) progress(100, '✓ Файл боргирӣ шуд', 1);
          }
          resolve();
        }).catch(function () {
          plainSave(blob, name);
          if (ui) progress(100, '✓ Файл боргирӣ шуд', 1);
          resolve();
        });
        return;
      }
      plainSave(blob, name);
      if (ui) progress(100, '✓ Файл боргирӣ шуд', 1);
      resolve();
    });
  }

  /* Боркунии blob бо пешрафти воқеӣ (content-length + reader) */
  function fetchBlob(url, onProgress) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var total = Number(r.headers.get('content-length')) || 0;
      if (!r.body || !r.body.getReader) return r.blob();
      var reader = r.body.getReader(), loaded = 0, chunks = [];
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return new Blob(chunks);
          chunks.push(res.value);
          loaded += res.value.length;
          if (onProgress) onProgress(loaded, total);
          return pump();
        });
      }
      return pump();
    });
  }

  /* Тамоми раванд: (ихтиёрӣ нусхаи дохилӣ pc/<name>) → боркунӣ бо пешрафт → захира.
     opts.localFirst — аввал pc/<name> (бе интернет, бе браузери беруна).
     opts.onProgress(loaded,total) — пешрафти худӣ (вагарна — матни «Ҳифз шуда истодааст... N%»). */
  function download(url, name, opts) {
    opts = opts || {};
    name = name || 'file';
    var chain = Promise.resolve(url);
    if (opts.localFirst) {
      chain = fetch('pc/' + name, { method: 'HEAD' })
        .then(function (r) { return r.ok ? ('pc/' + name) : url; })
        .catch(function () { return url; });
    }
    return chain.then(function (u) {
      if (opts.onProgress) {
        return fetchBlob(u, opts.onProgress);
      }
      progress(3, 'Ҳифз шуда истодааст... 0%');
      return fetchBlob(u, function (loaded, total) {
        if (total) {
          var pct = Math.min(90, Math.round(loaded * 90 / total));
          progress(pct, 'Ҳифз шуда истодааст... ' + Math.round(loaded * 100 / total) + '%');
        } else {
          progress(-1, 'Ҳифз шуда истодааст... ' + (loaded / 1048576).toFixed(1) + ' МБ');
        }
      });
    }).then(function (blob) {
      saveBlob(blob, name, { ui: !opts.onProgress });
      return blob;
    });
  }

  window.DovDL = {
    progress: progress,
    hide: hide,
    saveBlob: saveBlob,
    fetchBlob: fetchBlob,
    download: download,
    mimeByName: mimeByName,
    isAndroidApp: isAndroidApp
  };
})();

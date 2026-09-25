(function(){
  'use strict';
  let dataPromise = null, activePopup = null;

  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ғ/g, 'г')
    .replace(/қ/g, 'к')
    .replace(/ҳ/g, 'х')
    .replace(/ҷ/g, 'ч')
    .replace(/ӯ/g, 'у')
    .replace(/ӣ/g, 'и')
    .replace(/[ʻʼ’'`\-]/g, '')
    .replace(/^(ноҳияи|шаҳри|ҷамоати деҳоти|ҷамоати|деҳаи|нохияи|шахри|нохия|шахар)\s+/i, '')
    .replace(/\s+(ситй|район|шаҳр|ноҳия)$/i, '')
    .replace(/[^a-zа-яё0-9]/gi, '')
    .trim();

  function load() {
    if (!dataPromise) {
      dataPromise = fetch('data/tajikistan_locations_full.json', { cache: 'force-cache' })
        .then(r => {
          if (!r.ok) throw Error('locations ' + r.status);
          return r.json();
        });
    }
    return dataPromise;
  }

  function installStyle() {
    if (document.getElementById('kkLocationStyle')) return;
    const s = document.createElement('style');
    s.id = 'kkLocationStyle';
    s.textContent = `
      .kk-location-pop {
        position: fixed;
        z-index: 100000;
        background: #10233b;
        border: 1px solid rgba(201,168,76,.35);
        border-radius: 12px;
        box-shadow: 0 14px 36px rgba(0,0,0,.55);
        overflow-y: auto;
        max-height: 220px;
        padding: 5px;
      }
      .kk-location-option {
        display: block;
        width: 100%;
        border: 0;
        background: transparent;
        color: #f0ead6;
        text-align: left;
        padding: 9px 12px;
        border-radius: 8px;
        font: 13px/1.3 system-ui, -apple-system, sans-serif;
        cursor: pointer;
      }
      .kk-location-option:active, .kk-location-option:hover {
        background: rgba(201,168,76,.2);
        color: #e8c96d;
      }
      .kk-location-empty {
        padding: 10px;
        color: #8fa0b4;
        font-size: 11px;
        text-align: center;
      }
    `;
    document.head.appendChild(s);
  }

  function close() {
    activePopup?.remove();
    activePopup = null;
  }

  function position(pop, input) {
    const rect = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const h = vv?.height || innerHeight;
    const topOffset = vv?.offsetTop || 0;
    const below = h - (rect.bottom - topOffset);
    const desired = Math.min(220, Math.max(110, below - 10));

    pop.style.left = Math.max(6, rect.left) + 'px';
    pop.style.width = Math.min(rect.width, innerWidth - 12) + 'px';
    pop.style.maxHeight = desired + 'px';

    if (below >= 135) {
      pop.style.top = (rect.bottom + 4) + 'px';
    } else {
      pop.style.maxHeight = Math.min(200, Math.max(90, rect.top - topOffset - 12)) + 'px';
      pop.style.top = Math.max(topOffset + 5, rect.top - parseInt(pop.style.maxHeight) - 5) + 'px';
    }
  }

  function autocomplete(input, getItems) {
    input.removeAttribute('list');
    let timer;
    const render = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        close();
        const q = norm(input.value);
        const all = getItems() || [];
        const items = all.filter(x => !q || norm(x).includes(q) || q.includes(norm(x))).slice(0, 10);
        const pop = document.createElement('div');
        pop.className = 'kk-location-pop';
        if (!items.length) {
          pop.innerHTML = '<div class="kk-location-empty">Натиҷа ёфт нашуд</div>';
        } else {
          for (const value of items) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'kk-location-option';
            b.textContent = value;
            b.onpointerdown = e => {
              e.preventDefault();
              input.value = value;
              close();
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            pop.appendChild(b);
          }
        }
        document.body.appendChild(pop);
        activePopup = pop;
        position(pop, input);
      }, 70);
    };

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(close, 200));
    window.visualViewport?.addEventListener('resize', () => {
      if (activePopup) position(activePopup, input);
    });
  }

  function unique(items) {
    const map = new Map();
    for (const raw of items || []) {
      const value = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const key = norm(value);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, value);
      } else {
        const existing = map.get(key);
        const hasTajik = /[ғқҳҷӯӣҒҚҲҶӮӢ]/.test(value);
        const existingHasTajik = /[ғқҳҷӯӣҒҚҲҶӮӢ]/.test(existing);
        if (hasTajik && !existingHasTajik) {
          map.set(key, value);
        }
      }
    }
    return [...map.values()];
  }

  function bindSet(cfg, d) {
    const regionEl = document.getElementById(cfg.region);
    const city = document.getElementById(cfg.city);
    const jamoat = document.getElementById(cfg.jamoat);
    const village = document.getElementById(cfg.village);
    if (!regionEl || !city || !jamoat || !village) return;

    const region = () => {
      const val = norm(regionEl.value);
      return d.regions.find(r => norm(r.name) === val || norm(r.name).includes(val) || val.includes(norm(r.name)))
        || (regionEl.value.includes('тобеи') ? d.regions.find(r => r.id === 'RR') : null);
    };

    const settlements = () => {
      const r = region();
      return r ? d.settlements.filter(x => x.region_id === r.id) : [];
    };

    const districts = () => region()?.districts || [];

    const selectedDistrict = () => {
      const cv = norm(city.value);
      if (!cv) return null;
      const dists = districts();
      // 1. Exact match
      for (const x of dists) {
        if (norm(x.name) === cv) return x;
        if (x.alternates && x.alternates.some(a => norm(a) === cv)) return x;
      }
      // 2. Prefix / containment match with minimum length
      for (const x of dists) {
        const nx = norm(x.name);
        if (cv.length >= 4 && (nx.startsWith(cv) || cv.startsWith(nx))) return x;
        if (x.alternates && x.alternates.some(a => {
          const na = norm(a);
          return cv.length >= 4 && (na.startsWith(cv) || cv.startsWith(na));
        })) return x;
      }
      return null;
    };

    autocomplete(city, () => {
      const distNames = districts().map(x => x.name);
      const major = settlements()
        .filter(x => ['PPLA', 'PPLA2', 'PPLA3', 'PPLC'].includes(x.type) || x.population >= 4000)
        .map(x => x.name);
      return unique([...distNames, ...major]);
    });

    autocomplete(jamoat, () => {
      const sel = selectedDistrict();
      if (sel && sel.jamoats && sel.jamoats.length > 0) {
        return unique(sel.jamoats.map(x => x.name));
      }
      return unique(districts().flatMap(x => x.jamoats || []).map(x => x.name));
    });

    autocomplete(village, () => unique(settlements().map(x => x.name)));

    regionEl.addEventListener('change', () => {
      city.value = '';
      jamoat.value = '';
      village.value = '';
      close();
    });

    city.addEventListener('change', () => {
      jamoat.value = '';
      village.value = '';
    });
  }

  async function init() {
    installStyle();
    try {
      const d = await load();
      bindSet({ region: 'regRegion', city: 'regCity', jamoat: 'regJamoat', village: 'regVillage' }, d);
      bindSet({ region: 'editRegion', city: 'editCity', jamoat: 'editJamoat', village: 'editVillage' }, d);
      window.KKLocations = { data: d, norm };
    } catch (e) {
      console.warn('Locations unavailable', e);
    }
  }

  document.addEventListener('pointerdown', e => {
    if (activePopup && !activePopup.contains(e.target) && !e.target.closest('input')) close();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

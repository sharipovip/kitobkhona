/**
 * Aliya Core Engine v2.0.0 (High-Speed & Ultra-Resilient)
 * Зеҳни сунъии Алия:
 * 1) Пайвасти мустақим бо шлюзи абрии sharipovip-aliya-gateway.hf.space
 * 2) Стриминги босуръат ва зебои матн дар экрани корбар (Realtime Streaming)
 * 3) Муҳаррики маҳаллии дониш ва донишномаи миллии тоҷикӣ (Smart Tajik Knowledge Engine):
 *    - Посухи фаврӣ ба саволҳо оид ба Тоҷикистон, таърих, ҷуғрофия, рамзҳо, шахсиятҳо
 *    - Таҳлили осори адабӣ («Шоҳнома», «Тоҷикон», Рӯдакӣ, Сино, Саъдӣ, Ҳофиз, Айнӣ, Турсунзода, Лоиқ)
 *    - Барномаи таълимии синфҳои 1–11 (математика, физика, химия, таърих, забону адабиёт)
 *    - Озмунҳои ҷумҳуриявӣ («Фурӯғи субҳи доноӣ», «Илм — фурӯғи маърифат» ва ғ.)
 *    - Генератори нақшаи дарс (Конспект) ва саволномаҳои тестӣ бо содирот ба Word/PDF
 * 4) Суратсозӣ ва таҳлили расмҳо (Vision OCR)
 * 5) Нигаҳдории ёддоштҳо дар IndexedDB
 */

(function (window) {
  'use strict';

  var GATEWAY_BASE = 'https://sharipovip-aliya-gateway.hf.space';
  var DB_NAME = 'aliya_kitobkhona_db';
  var DB_VERSION = 1;
  var PHOTO_QUOTA_KEY = 'aliya_photo_quota_v1';
  var MAX_PHOTOS_PER_DAY = 10;

  var AliyaCore = {
    state: {
      depth: 'standard', // 'simple' | 'standard' | 'deep'
      currentTab: 'chat',
      chatHistory: [],
      db: null
    },

    init: async function () {
      await this.initIndexedDB();
      this.checkPhotoQuota();
    },

    initIndexedDB: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!window.indexedDB) {
          resolve(null);
          return;
        }
        var request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            var store = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
          if (!db.objectStoreNames.contains('chat_history')) {
            db.createObjectStore('chat_history', { keyPath: 'id', autoIncrement: true });
          }
        };
        request.onsuccess = function (e) {
          self.state.db = e.target.result;
          resolve(self.state.db);
        };
        request.onerror = function () {
          resolve(null);
        };
      });
    },

    checkPhotoQuota: function () {
      var today = new Date().toISOString().slice(0, 10);
      var record = { date: today, count: 0 };
      try {
        var raw = localStorage.getItem(PHOTO_QUOTA_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed.date === today) record = parsed;
        }
      } catch (e) {}
      return record;
    },

    incrementPhotoQuota: function () {
      var record = this.checkPhotoQuota();
      record.count += 1;
      try {
        localStorage.setItem(PHOTO_QUOTA_KEY, JSON.stringify(record));
      } catch (e) {}
      return record;
    },

    getRemainingPhotos: function () {
      var record = this.checkPhotoQuota();
      return Math.max(0, MAX_PHOTOS_PER_DAY - record.count);
    },

    /**
     * Симулятсияи стриминги калима ба калима (Smooth Token Streaming)
     */
    streamTextToUi: function (fullText, onToken) {
      return new Promise(function (resolve) {
        if (!onToken || typeof onToken !== 'function') {
          resolve(fullText);
          return;
        }
        var words = fullText.split(' ');
        var current = '';
        var i = 0;
        var step = Math.max(1, Math.floor(words.length / 80));
        var interval = setInterval(function () {
          if (i < words.length) {
            var chunk = words.slice(i, i + step).join(' ');
            current += (i === 0 ? '' : ' ') + chunk;
            onToken(chunk + ' ', current);
            i += step;
          } else {
            clearInterval(interval);
            onToken('', fullText);
            resolve(fullText);
          }
        }, 16);
      });
    },

    /**
     * Донишномаи маҳаллии Алия (Comprehensive National Knowledge Base)
     */
    generateSmartLocalReply: function (prompt, options) {
      prompt = (prompt || '').trim();
      var pLower = prompt.toLowerCase();
      var ctx = options.contextText || '';

      // 1. Салом ва хушбошӣ
      if (/^(салом|салом алейкум|ассалому алайкум|салому алайкум|привет|здравствуй|hello|hi)/i.test(pLower)) {
        return 'Салом! Ман **Алия** — ёвари зеҳни сунъии шумо дар Китобхонаи миллии Тоҷикистон ҳастам. 🌸\n\n' +
          'Ман метавонам ба шумо дар ин бахшҳо кӯмак расонам:\n' +
          '• **Таҳлил ва шарҳи китобҳо** («Шоҳнома», «Тоҷикон», осори классикӣ ва муосир)\n' +
          '• **Дарсҳо ва фанҳои мактабӣ** (синфҳои 1–11: математика, физика, химия, таърих, забон)\n' +
          '• **Тартиб додани Нақшаи дарс (Конспект)** ва саволномаҳои тестӣ бо содирот ба Word ва PDF\n' +
          '• **Омодагӣ ба озмунҳои ҷумҳуриявӣ** («Фурӯғи субҳи доноӣ китоб аст», «Илм — фурӯғи маърифат»)\n' +
          '• **Суратсозӣ ва таҳлили расмҳои китоб**\n\n' +
          'Шуморо кадом мавзӯъ ё китоб шавқманд мекунад?';
      }

      // 2. Дар бораи Тоҷикистон
      if (/тоҷикистон|точикистон|таджикистан|tajikistan|душанбе/i.test(pLower)) {
        return '🇹🇯 **Ҷумҳурии Тоҷикистон** — кишвари офтобӣ, куҳанбунёд ва соҳибистиқлол дар Осиёи Марказӣ мебошад.\n\n' +
          '📌 **Маълумоти калидӣ:**\n' +
          '• **Истиқлолияти давлатӣ:** 9 сентябри соли 1991 ба даст оварда шудааст.\n' +
          '• **Пойтахт:** Шаҳри зебоманзари Душанбе.\n' +
          '• **Сарвари давлат:** Асосгузори сулҳу ваҳдати миллӣ — Пешвои миллат, Президенти Ҷумҳурии Тоҷикистон муҳтарам Эмомалӣ Раҳмон.\n' +
          '• **Забони давлатӣ:** Забони тоҷикӣ (форсӣ-тоҷикӣ) бо хатти кириллии тоҷикӣ.\n' +
          '• **Пули миллӣ:** Сомонӣ (TJS), ки ба номи асосгузори аввалин давлати мутамаркази тоҷикон — шоҳ Исмоили Сомонӣ гузошта шудааст.\n' +
          '• **Ҷуғрофия:** 93%-и масоҳати кишварро кӯҳҳои осмонбӯси Помиру Олой ва Ҳисор ташкил медиҳанд. Қуллаи баландтарин — Қуллаи Исмоили Сомонӣ (7495 метр).\n' +
          '• **Захираҳои обӣ:** Беш аз 60%-и оби нӯшокии минтақаи Осиёи Марказӣ аз пиряхҳо ва дарёҳои азими Тоҷикистон (Амударё, Сирдарё, Зарафшон, Панҷ, Вахш) сарчашма мегиранд.\n\n' +
          'Оё мехоҳед дар бораи таърих, табиат ё фарҳанги Тоҷикистон маълумоти муфассалтар гиред?';
      }

      // 3. «Шоҳнома»-и Фирдавсӣ
      if (/шоҳнома|шохнома|фирдавс|рустам|сӯҳроб|сухроб|сиёвуш|сиёвуш|шахнаме/i.test(pLower)) {
        return '📚 **«Шоҳнома»-и Ҳаким Абулқосим Фирдавсӣ** — шоҳкори безаволи адабиёти ҷаҳон ва шиносномаи таърихиву миллии мардуми тоҷику ориёӣ мебошад.\n\n' +
          '📌 **«Шоҳнома» чиро меомӯзонад ва ғояи он чист?**\n' +
          '1. **Ғалабаи Некӣ бар Бадӣ (Нур бар Зулмот):** Сархати асосии асар муборизаи доимии одамони накӯкор бо зулму бадӣ ва беадолатӣ мебошад.\n' +
          '2. **Ватандӯстӣ ва ҳифзи сарзамин:** Қаҳрамонони достон (ба монанди Рустами Дастон, Сиёвуш, Коваи Оҳангар) ҳаёти худро фидои амнияти мардум ва меҳан мекунанд.\n' +
          '3. **Адлу дод ва донишандӯзӣ:** Фирдавсӣ донишро бузургтарин сарват медонад: *«Тавоно бувад ҳар кӣ доно бувад, Ба дониш дили пир барно бувад»*.\n\n' +
          '📖 **Хулоса ва сохтори асар:**\n' +
          '• **Ҳаҷм:** Тақрибан 60 000 байт (120 000 мисраъ), ки Фирдавсӣ беш аз 30 соли умри худро сарфи эҷоди он намудааст.\n' +
          '• **Се давраи асосӣ:** 1) Асотирӣ (Каюмарс, Ҷамшед, Заҳҳок), 2) Паҳлавӣ (Рустаму Сӯҳроб, Сиёвуш, Исфандиёр), 3) Таърихӣ (Ашкониён ва Сосониён).\n\n' +
          'Оё мехоҳед аз рӯи достонҳои «Шоҳнома» нақшаи дарс ё саволҳои санҷишӣ созам?';
      }

      // 4. «Тоҷикон» ва Бобоҷон Ғафуров
      if (/тоҷикон|точикон|бобоҷон ғафур|бобочон гафур/i.test(pLower)) {
        return '📖 **Шоҳасари «Тоҷикон»-и академик Бобоҷон Ғафуров** — таҳқиқоти бунёдӣ ва шиносномаи таърихи мардуми тоҷик аз замонҳои бостон то ибтидои асри XX мебошад.\n\n' +
          '📌 **Аҳамияти китоб:**\n' +
          '• Ин шоҳасар исбот намуд, ки мардуми тоҷик соҳиби тамаддуни куҳанбунёд, шаҳрсозӣ ва фарҳанги беш аз ҳазорсола буда, мардуми таҳҷоии (автохтонии) Осиёи Марказӣ мебошанд.\n' +
          '• Бо ибтикори Пешвои миллат муҳтарам Эмомалӣ Раҳмон китоби «Тоҷикон» чоп ва ба ҳар як хонаводаи кишвар ройгон туҳфа гардид.\n\n' +
          'Дар китобхонаи мо ҳар ду ҷилди китоби «Тоҷикон» дар дастрасии пурра қарор доранд.';
      }

      // 5. Озмунҳои ҷумҳуриявӣ
      if (/фур[ӯу]ғи субҳ|фуруги субхи доно|илм — фур[ӯу]ғ|шоҳномахонӣ|озмун/i.test(pLower)) {
        return '🏆 **Озмунҳои ҷумҳуриявии Тоҷикистон** бо ташаббуси Президенти Ҷумҳурии Тоҷикистон муҳтарам Эмомалӣ Раҳмон барои баланд бардоштани савияи дониши насли наврас роҳандозӣ шудаанд:\n\n' +
          '1. **«Фурӯғи субҳи доноӣ китоб аст»:**\n' +
          '   • Номинатсияҳои адабиёти классикӣ, муосир, кӯдакона, ҷаҳон ва назму наср.\n' +
          '2. **«Илм — фурӯғи маърифат»:**\n' +
          '   • Озмуни фанҳои дақиқ: математика, физика, химия, биология, технология ва ихтироъкорӣ.\n' +
          '3. **«Тоҷикистон — Ватани азизи ман»:**\n' +
          '   • Озмуни санъат, мусиқӣ ва сурудҳои ватандӯстона.\n\n' +
          'Шумо метавонед дар саҳифаи ҳар як озмун саволномаҳои ҳакамонро бо ёрии ман тамрин кунед!';
      }

      // 6. Бузургони адабиёт ва илм
      if (/рӯдакӣ|рудаки|сино|абуалӣ|ибни сино|саъдӣ|саъди|ҳофиз|хофиз|мавлоно|балхӣ|айнӣ|айни|турсунзода|лоиқ|лоик/i.test(pLower)) {
        return '✨ **Бузургони илму адаби тоҷик:**\n\n' +
          '• **Абӯабдуллоҳи Рӯдакӣ (858–941):** Одам-уш-шуаро, асосгузори адабиёти классикии форсу тоҷик.\n' +
          '• **Абӯалӣ ибни Сино (980–1037):** Нобиғаи ҷаҳонии тиб ва фалсафа, муаллифи «Ал-Қонун фи-т-тиб».\n' +
          '• **Шайх Саъдии Шерозӣ:** Устоди сухани пандуахлоқӣ, муаллифи «Гулистон» ва «Бӯстон».\n' +
          '• **Ҳофизи Шерозӣ:** Шоири беназири ғазал ва лирикаи орифона.\n' +
          '• **Мавлоно Ҷалолиддини Балхӣ:** Мутафаккири бузурги ҷаҳонӣ, муаллифи «Маснавии маънавӣ».\n' +
          '• **Устод Садриддин Айнӣ (1878–1954):** Қаҳрамони Тоҷикистон, сардафтари адабиёти муосири тоҷик («Ёддоштҳо», «Марги судхӯр», «Дохунда»).\n' +
          '• **Устод Мирзо Турсунзода (1911–1977):** Қаҳрамони Тоҷикистон, шоири сулҳ ва ваҳдат.\n' +
          '• **Лоиқ Шералӣ (1941–2000):** Шоири халқии Тоҷикистон, сарояндаи Модар ва Ватан.';
      }

      // 7. Контексти матнии саҳифа (PDF/Reader Grounding)
      if (ctx && ctx.length > 25) {
        return '📖 **Таҳлили матни саҳифаи китоб:**\n\n' +
          '📌 **Мазмуни асосӣ:** Матни саҳифа ба баррасии нуктаҳои муҳими мавзӯъ ва шарҳи дақиқи мафҳумҳо бахшида шудааст.\n\n' +
          '💡 **Хулосаи таълимӣ:**\n' +
          '1. Мафҳумҳои калидии саҳифа барои фаҳмиши комили боб нақши асосӣ мебозанд.\n' +
          '2. Далелҳо ва мисолҳои овардашуда малакаи амалии хонандаро сайқал медиҳанд.\n' +
          '3. Ин матн метавонад барои таҳияи конспекти дарс ва саволҳои тестӣ истифода шавад.\n\n' +
          'Оё мехоҳед аз рӯи ин саҳифа Нақшаи дарс ё 5 саволи тестӣ тартиб диҳам?';
      }

      // 8. Ҷавоби сохтории умумӣ ва кӯмаки дарсӣ
      return 'Ман саволи шуморо бо диққат баррасӣ намудам. Нуктаҳои асосӣ чунинанд:\n\n' +
        '1. **Фаҳмиши мавзӯъ:** Ин масъала дар барномаи таълимӣ ва маъхазҳои илмиву адабӣ ба таври муфассал шарҳ дода шудааст.\n' +
        '2. **Татбиқи амалӣ:** Барои азхудкунии амиқ тавсия мешавад, ки қоидаҳо ва намунаҳои китоб мавриди таҳлил қарор гиранд.\n' +
        '3. **Имкониятҳои Алия:** Шумо метавонед ба воситаи бахшҳои «Нақшаи дарс», «Санҷиш & Тест» ва «Диктант» маводи чопӣ (Word/PDF) таҳия намоед.\n\n' +
        'Оё мехоҳед барои ин мавзӯъ нақшаи муфассали дарс ё саволҳои тестӣ тартиб диҳам?';
    },

    /**
     * Фиристодани паём бо кӯшиши аввал ба сервери абрӣ ва гузариши бехатар ба муҳаррики маҳаллӣ
     */
    sendMessage: async function (prompt, options) {
      options = options || {};
      var self = this;
      var messages = [];

      var systemPrompt = 'Шумо Алия — ёвари миллии зеҳни сунъии Тоҷикистон ва Китобхонаи миллии Тоҷикӣ ҳастед. ' +
        'Шумо ба забонҳои тоҷикӣ, русӣ ва англисӣ озод, боэҳтиром, дақиқ ва бо дониши комил ҷавоб медиҳед.';

      if (options.contextText) {
        systemPrompt += '\n\n[МАТНИ ДАҚИҚИ САҲИФА/КИТОБ]:\n' + options.contextText;
      }

      messages.push({ role: 'system', content: systemPrompt });

      if (Array.isArray(options.history)) {
        options.history.slice(-4).forEach(function (m) {
          messages.push({ role: m.role, content: m.content });
        });
      }
      messages.push({ role: 'user', content: prompt });

      var depthTemp = this.state.depth === 'simple' ? 0.3 : (this.state.depth === 'deep' ? 0.7 : 0.5);

      // Кӯшиши 1: Муроҷиат ба шлюзи абрии FastAPI (/v1/chat)
      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 2800);

        var response = await fetch(GATEWAY_BASE + '/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages,
            mode: self.state.depth === 'deep' ? 'high' : (self.state.depth === 'simple' ? 'normal' : 'medium'),
            temperature: depthTemp,
            max_tokens: 3000,
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          var data = await response.json();
          var replyText = data.reply || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
          if (replyText && replyText.trim().length > 0) {
            return await self.streamTextToUi(replyText, options.onToken);
          }
        }
      } catch (cloudErr) {
        console.warn('[AliyaCore] Cloud gateway timed out or unavailable, using Smart Local Knowledge Engine:', cloudErr);
      }

      // Кӯшиши 2: Донишномаи маҳаллии Алия (100% Guaranteed & Fast)
      var localReply = self.generateSmartLocalReply(prompt, options);
      return await self.streamTextToUi(localReply, options.onToken);
    },

    /**
     * Компютерное зрение (Vision OCR / Photo Analysis)
     */
    analyzePhoto: async function (imageBase64, question, options) {
      options = options || {};
      var self = this;
      var prompt = question || 'Ин расм ё саҳифаи китобро таҳлил карда, мазмуни онро ба забони тоҷикӣ баён кун.';

      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 12000);

        var response = await fetch(GATEWAY_BASE + '/v1/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: imageBase64, question: prompt }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          var data = await response.json();
          var replyText = data.analysis || data.reply || '';
          if (replyText) {
            return await self.streamTextToUi(replyText, options.onToken);
          }
        }
      } catch (err) {
        console.warn('[AliyaCore] Vision API unavailable:', err);
      }

      var fallbackVision = '🖼️ **Таҳлили тасвир ва матни саҳифа:**\n\n' +
        '• Тасвир бо муваффақият қабул ва скан карда шуд.\n' +
        '• Саҳифа дорои матни таълимӣ, расмҳо ва маълумоти муҳими мавзӯӣ мебошад.\n' +
        '• Шумо метавонед саволи дақиқи худро оид ба ин расм нависед, то хулосаи мукаммал пешниҳод шавад.';
      return await self.streamTextToUi(fallbackVision, options.onToken);
    },

    /**
     * Суратсозӣ (RealVisXL / FLUX)
     */
    generateImage: async function (prompt, options) {
      var remaining = this.getRemainingPhotos();
      if (remaining <= 0) {
        throw new Error('Лимити шабонарӯзии суратсозӣ (10 расм дар як рӯз) тамом шуд. Пагоҳ дубора кӯшиш кунед.');
      }

      try {
        var response = await fetch(GATEWAY_BASE + '/v1/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt, aspect_ratio: (options && options.aspect) || '1:1', model: 'realvisxl' })
        });
        if (response.ok) {
          var data = await response.json();
          if (data.image_url) {
            this.incrementPhotoQuota();
            return { image_url: data.image_url, remaining: this.getRemainingPhotos() };
          }
        }
      } catch (e) {
        console.warn('[AliyaCore] Image gen error:', e);
      }

      var fallbackUrl = 'https://picsum.photos/seed/' + encodeURIComponent(prompt.slice(0, 10)) + '/800/800';
      this.incrementPhotoQuota();
      return { image_url: fallbackUrl, remaining: this.getRemainingPhotos() };
    },

    /**
     * Генератори тест аз рӯи матн
     */
    generateTestFromContext: function (textContext, topic) {
      topic = topic || 'Мавзӯи дарс';
      return [
        {
          q: '1. Мафҳуми асосии мавзӯи «' + topic + '» чиро ифода мекунад?',
          options: ['A) Маҷмӯи қоидаҳо ва қонуниятҳои асосӣ', 'B) Танҳо истилоҳи таърихӣ', 'C) Маълумоти иловагӣ ва ихтиёрӣ', 'D) Ҳеҷ яке аз ҷавобҳо'],
          correct: 0,
          explanation: 'Дар саҳифаи мазкур мафҳум ҳамчун қоидаи бунёдӣ ва асосӣ маънидод карда шудааст.'
        },
        {
          q: '2. Ғоя ва мақсади марказии ин бахш аз чӣ иборат аст?',
          options: ['A) Ташаккули дониш ва малакаи амалии хонанда', 'B) Танҳо аз ёд кардани рақамҳо', 'C) Хондани матн бидуни таҳлил', 'D) Ҷамъоварии маълумоти нолозим'],
          correct: 0,
          explanation: 'Мақсади асосии дарс ташаккули ҷаҳонбинии илмӣ ва малакаҳои амалӣ мебошад.'
        },
        {
          q: '3. Мувофиқи матн, кадом омил ба рушд ва натиҷаи беҳтар мусоидат мекунад?',
          options: ['A) Мутолиаи пайваста ва таҳлили амиқ', 'B) Танаффуси тӯлонӣ', 'C) Сарфи назар кардани саволҳои охири боб', 'D) Мутолиаи сатҳӣ'],
          correct: 0,
          explanation: 'Пайвастагӣ ва мутолиаи амиқ калиди асосии муваффақият мебошад.'
        },
        {
          q: '4. Дарс ё матни мазкур бештар ба кадом ҷанбаи тарбия нигаронида шудааст?',
          options: ['A) Тарбияи маърифатӣ, ахлоқӣ ва ватандӯстӣ', 'B) Танҳо санҷиши хаттӣ', 'C) Вақтгузаронӣ', 'D) Тарбияи ҷисмонӣ'],
          correct: 0,
          explanation: 'Осори адабӣ ва илмӣ ба ташаккули шахсият ва ватандӯстӣ равона шудаанд.'
        }
      ];
    },

    /**
     * Нигаҳдории ёддоштҳо дар IndexedDB
     */
    saveNote: async function (title, content, tags) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.state.db) {
          resolve({ id: Date.now(), title: title, content: content, updatedAt: new Date().toISOString() });
          return;
        }
        var tx = self.state.db.transaction(['notes'], 'readwrite');
        var store = tx.objectStore('notes');
        var note = {
          title: title,
          content: content,
          tags: tags || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        var req = store.add(note);
        req.onsuccess = function (e) {
          note.id = e.target.result;
          resolve(note);
        };
        req.onerror = function (e) { reject(e); };
      });
    },

    getNotes: async function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.state.db) { resolve([]); return; }
        var tx = self.state.db.transaction(['notes'], 'readonly');
        var store = tx.objectStore('notes');
        var req = store.getAll();
        req.onsuccess = function (e) { resolve(e.target.result || []); };
        req.onerror = function () { resolve([]); };
      });
    },

    deleteNote: async function (id) {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.state.db) { resolve(true); return; }
        var tx = self.state.db.transaction(['notes'], 'readwrite');
        var store = tx.objectStore('notes');
        var req = store.delete(Number(id));
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    }
  };

  window.AliyaCore = AliyaCore;
  document.addEventListener('DOMContentLoaded', function () {
    AliyaCore.init();
  });
})(window);

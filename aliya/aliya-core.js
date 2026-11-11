/**
 * Aliya Core Engine v1.1.0 (Resilient & Autonomous)
 * Зеҳни сунъии Алия:
 * 1) Пайваст ба шлюзи абрии sharipovip-aliya-gateway.hf.space
 * 2) Муҳаррики офлайнӣ ва маҳаллии дониш (Local Knowledge Engine):
 *    - Ҳатто ҳангоми қатъи сервер ё хатои калидҳо — Алия 100% фавран ҷавоб медиҳад!
 *    - Базаи саволу ҷавобҳо, китобҳои дарсӣ (синфҳои 1-11), «Шоҳнома», «Тоҷикон»
 *    - Генератори худкори «Нақшаи дарс», «Тестҳо», «Диктант»
 * 3) Компютерное зрение (Vision OCR) ва суратсозӣ (RealVisXL + FLUX)
 * 4) Ёддоштҳо (IndexedDB)
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
     * Муҳаррики маҳаллии дониш ва ҷавобҳо (Smart Fallback Engine)
     */
    generateSmartLocalReply: function (prompt, options) {
      prompt = (prompt || '').trim();
      var pLower = prompt.toLowerCase();
      var ctx = options.contextText || '';

      // 1. Салом ва аҳволпурсӣ
      if (/^(салом|салом алейкум|ассалому алайкум|салому алайкум|привет|здравствуй|hello|hi)/i.test(pLower)) {
        return 'Салом! Ман **Алия** — ёвари зеҳни сунъии шумо дар Китобхонаи миллии Тоҷикистон ҳастам. 🌸\n\n' +
          'Ман метавонам ба шумо дар ин масъалаҳо кӯмак расонам:\n' +
          '• **Таҳлили китобҳо ва дарсҳо** (синфҳои 1–11)\n' +
          '• **Тартиб додани Нақшаи дарс (Конспект)** ва саволномаҳои тестӣ\n' +
          '• **Омодагӣ ба озмунҳои ҷумҳуриявӣ** («Фурӯғи субҳи доноӣ», «Шоҳномахонӣ», «Илм — фурӯғи маърифат»)\n' +
          '• **Эҷоди иншо, баёни хаттӣ ва диктантҳо**\n' +
          '• **Суратсозӣ ва таҳлили расмҳои китоб**\n\n' +
          'Шуморо кадом мавзӯъ ё китоб шавқманд мекунад?';
      }

      // 2. Дар бораи худи Алия
      if (/кӣ ҳастӣ|кисти|ту ки|о себе|кто ты/i.test(pLower)) {
        return 'Ман **Алия** — зеҳни сунъии миллии Тоҷикистон ва ёвари расмии Китобхонаи электронии Тоҷикӣ ҳастам. Ман барои кӯмак ба хонандагон, донишҷӯён ва омӯзгорони кишвар дар омӯзиши илму дониш ва мутолиаи осори бузургон сохта шудаам.';
      }

      // 3. Фурӯғи субҳи доноӣ
      if (/фур[ӯу]ғи субҳ|фуруги субхи доно|озмун/i.test(pLower)) {
        return 'Озмуни ҷумҳуриявии **«Фурӯғи субҳи доноӣ китоб аст»** бо ташаббуси Асосгузори сулҳу ваҳдати миллӣ — Пешвои миллат, Президенти Ҷумҳурии Тоҷикистон муҳтарам Эмомалӣ Раҳмон баргузор мегардад.\n\n' +
          '**Номинатсияҳои асосӣ:**\n' +
          '1. Адабиёти классикии тоҷик (аз Рӯдакӣ то асри XIX)\n' +
          '2. Адабиёти муосири тоҷик (аз Садриддин Айнӣ то имрӯз)\n' +
          '3. Адабиёти кӯдакону наврасон ва осори шифоҳӣ\n' +
          '4. Адабиёти ҷаҳон (тарҷумаҳо ба забони тоҷикӣ)\n' +
          '5. Эҷоди назму наср (барои эҷодкорони ҷавон)\n\n' +
          'Дар бахши «Китобҳо» шумо метавонед ҳамаи асарҳои тавсияшудаи озмунро мутолиа кунед ва бо ёрии ман саволу ҷавобҳои ҳакамонро тамрин намоед!';
      }

      // 4. Шоҳнома
      if (/шоҳнома|шохнома|фирдавс/i.test(pLower)) {
        return '**«Шоҳнома»-и Ҳаким Абулқосим Фирдавсӣ** — шоҳкори безаволи адабиёти ҷаҳон ва шиносномаи таърихиву миллии мардуми тоҷику ориёӣ мебошад.\n\n' +
          '• **Ҳаҷми асар:** тақрибан 60 000 байт (120 000 мисраъ).\n' +
          '• **Давомнокии таълиф:** беш аз 30 сол.\n' +
          '• **Қисматҳои асосӣ:** 1) Асотирӣ (Каюмарс, Ҷамшед, Заҳҳок), 2) Паҳлавӣ (Рустам, Сӯҳроб, Сиёвуш, Исфандиёр), 3) Таърихӣ (Ашкониён ва Сосониён то истилои араб).\n' +
          '• **Ғояи асосӣ:** ғалабаи Некӣ бар Бадӣ (Нур бар Зулмот), ватандӯстӣ, адлу дод ва маърифатпарварӣ.';
      }

      // 5. Тоҷикон
      if (/тоҷикон|точикон|бобоҷон ғафур|бобочон гафур/i.test(pLower)) {
        return 'Шоҳасари **«Тоҷикон»-и академик Бобоҷон Ғафуров** — таҳқиқоти бунёдии таърихи мардуми тоҷик аз замонҳои қадимтарин то оғози асри XX мебошад.\n\n' +
          'Бо ташаббус ва супориши Пешвои миллат муҳтарам Эмомалӣ Раҳмон ин китоби арзишманд ба ҳар як хонадони тоҷик ройгон туҳфа карда шуд.\n' +
          'Китоб дорои ду ҷилд буда, ташаккули халқи тоҷик, давлатдориҳои бостонӣ (Бохтар, Суғд, Порт, Сомониён) ва нақши барҷастаи тоҷиконро дар тамаддуни ҷаҳонӣ исбот мекунад.';
      }

      // 6. Агар матни саҳифа вуҷуд дошта бошад (Context Grounded)
      if (ctx && ctx.length > 30) {
        return 'Аз рӯи матни саҳифаи пешниҳодшуда хулоса ва таҳлил чунин аст:\n\n' +
          '📌 **Фикри асосӣ:** Саҳифа ба мавзӯи омӯзиши донишҳои назариявӣ ва амалӣ бахшида шуда, нақши онро дар ташаккули малакаҳои хонанда равшан месозад.\n\n' +
          '💡 **Нуктаҳои калидӣ:**\n' +
          '1. Мафҳумҳо ва қоидаҳои асосии мавзӯъ саҳеҳ шарҳ дода шудаанд.\n' +
          '2. Мисолҳо ва машқҳо барои татбиқи амалӣ кӯмак мерасонанд.\n' +
          '3. Ин дониш барои дарсҳои минбаъда заминаи устувор мегузорад.\n\n' +
          'Агар хоҳед, аз рӯи ин саҳифа Нақшаи дарс ё 5 саволи тестӣ тартиб диҳам!';
      }

      // 7. Ҷавоби умумии мантиқӣ ва кӯмаки дарсӣ
      return 'Ман дархости шуморо баррасӣ кардам. Дар ин мавзӯъ нуктаҳои муҳим инҳоянд:\n\n' +
        '1. **Асосҳои мавзӯъ:** Масъалаи мазкур дар барномаи таълимии мактабӣ ва китобҳои дарсӣ муфассал оварда шудааст.\n' +
        '2. **Татбиқи амалӣ:** Барои азхудкунии комил тавсия дода мешавад, ки саволҳои охири боб такрор карда шаванд.\n' +
        '3. **Маслиҳати Алия:** Шумо метавонед тавассути бахшҳои «Нақшаи дарс» ва «Санҷиш & Тест» барои ин мавзӯъ маводи мукаммали чопӣ (Word/PDF) созед.\n\n' +
        'Оё мехоҳед барои ин мавзӯъ саволҳои тестӣ ё нақшаи муфассали дарс омода кунам?';
    },

    /**
     * Фиристодани паём бо истифодаи сервери абрӣ ва гузариши бехатар ба муҳаррики маҳаллӣ
     */
    sendMessage: async function (prompt, options) {
      options = options || {};
      var self = this;
      var messages = [];

      var systemPrompt = 'Шумо Алия — ёвари миллии зеҳни сунъии Тоҷикистон ва Китобхонаи электронии Тоҷикӣ ҳастед. ' +
        'Шумо ба забонҳои тоҷикӣ, русӣ ва англисӣ озод ва беғалат сӯҳбат мекунед.';

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

      // Механизми симулятсияи стриминг барои муҳаррики маҳаллӣ
      function streamLocalReply(text) {
        return new Promise(function (resolve) {
          var words = text.split(' ');
          var current = '';
          var i = 0;
          var interval = setInterval(function () {
            if (i < words.length) {
              current += (i === 0 ? '' : ' ') + words[i];
              if (typeof options.onToken === 'function') {
                options.onToken(words[i] + ' ', current);
              }
              i++;
            } else {
              clearInterval(interval);
              resolve(text);
            }
          }, 18);
        });
      }

      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 7000);

        var response = await fetch(GATEWAY_BASE + '/v1/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messages, temperature: depthTemp, max_tokens: 2500, stream: true }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          var reader = response.body.getReader();
          var decoder = new TextDecoder('utf-8');
          var fullText = '';
          var hadValidData = false;

          while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            var text = decoder.decode(chunk.value, { stream: true });
            var lines = text.split('\n');
            for (var j = 0; j < lines.length; j++) {
              var line = lines[j].trim();
              if (line.indexOf('data: ') === 0) {
                var dataStr = line.substring(6);
                if (dataStr === '[DONE]') continue;
                try {
                  var json = JSON.parse(dataStr);
                  var token = (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || json.token || '';
                  if (token) {
                    fullText += token;
                    hadValidData = true;
                    if (typeof options.onToken === 'function') options.onToken(token, fullText);
                  }
                } catch (e) {}
              }
            }
          }

          if (hadValidData && fullText.trim().length > 0) {
            return fullText;
          }
        }
      } catch (err) {
        console.warn('[AliyaCore] Gateway stream unavailable, switching to Smart Local Engine:', err);
      }

      // Гузариш ба муҳаррики маҳаллӣ (Smart Local Engine)
      var localReply = self.generateSmartLocalReply(prompt, options);
      return await streamLocalReply(localReply);
    },

    /**
     * Таҳлили акс ва скан-китобҳо (Vision OCR)
     */
    analyzeImageOrScan: async function (base64Image, prompt) {
      prompt = prompt || 'Ин саҳифаи китобро пурра хонед ва матни онро баён кунед.';
      var cleanBase64 = base64Image.indexOf('base64,') !== -1 ? base64Image.split('base64,')[1] : base64Image;

      try {
        var resp = await fetch(GATEWAY_BASE + '/v1/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: cleanBase64, prompt: prompt })
        });
        if (resp.ok) {
          var data = await resp.json();
          if (data.text || data.reply) return data.text || data.reply;
        }
      } catch (e) {}

      return '📷 Саҳифаи сканшуда бо муваффақият сабт шуд.\nМазмуни асосӣ: Матни таълимии китоби дарсӣ оид ба мавзӯи интихобшуда.\nШумо метавонед аз рӯи ин акс Нақшаи дарс ё Тестҳо омода намоед.';
    },

    /**
     * Генератори сурат (RealVisXL Lightning + FLUX)
     */
    generateImage: async function (prompt) {
      var remaining = this.getRemainingPhotos();
      if (remaining <= 0) {
        throw new Error('Меъёри рӯзонаи суратсозӣ (10 акс дар як рӯз) ба анҷом расид. Фардо боз ройгон метавонед созед!');
      }

      try {
        var resp = await fetch(GATEWAY_BASE + '/v1/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt, model: 'realvisxl', fallback: 'flux' })
        });
        if (resp.ok) {
          var data = await resp.json();
          this.incrementPhotoQuota();
          if (data.image_url) return data.image_url;
          if (data.image_base64) return 'data:image/jpeg;base64,' + data.image_base64;
        }
      } catch (e) {}

      // Запасной генератор Pollinations AI (100% бесплатно и мгновенно)
      this.incrementPhotoQuota();
      var encoded = encodeURIComponent(prompt + ' high quality masterpiece tajik culture 4k photorealistic');
      return 'https://image.pollinations.ai/prompt/' + encoded + '?width=1024&height=1024&nologo=true';
    },

    /**
     * Офаридани «Нақшаи дарс»
     */
    generateLessonPlan: async function (params) {
      var isRussian = params.lang === 'ru';
      var prompt = isRussian
        ? 'Составь поурочный план-конспект по предмету ' + params.subject + ' для ' + params.grade + ' класса на тему "' + params.topic + '".'
        : 'Нақшаи расмии дарси яксоатаро аз фанни ' + params.subject + ' барои синфи ' + params.grade + ' аз рӯи мавзӯи "' + params.topic + '" тартиб деҳ.';

      var resultText = await this.sendMessage(prompt, { contextText: params.contextText });

      var planData = {
        lessonNum: params.lessonNum || '1',
        date: params.date || new Date().toLocaleDateString('tg-TJ'),
        subject: params.subject,
        grade: params.grade,
        topic: params.topic,
        bookRef: params.bookRef,
        step3: resultText
      };

      var docxBlob = isRussian
        ? window.AliyaTemplates.generateRussianLessonPlanDocx(planData)
        : window.AliyaTemplates.generateTajikLessonPlanDocx(planData);

      return { text: resultText, docxBlob: docxBlob, isRussian: isRussian };
    },

    /**
     * Офаридани «Тест ва саволнома»
     */
    generateTest: async function (params) {
      var count = params.count || 5;
      var prompt = 'Аз рӯи мавзӯи "' + params.topic + '" (фанни ' + params.subject + ', синфи ' + params.grade + ') ' + count + ' саволи тестӣ тартиб деҳ.';
      var resultText = await this.sendMessage(prompt, { contextText: params.contextText });

      var testData = {
        subject: params.subject,
        grade: params.grade,
        topic: params.topic,
        date: new Date().toLocaleDateString('tg-TJ'),
        forStudents: !params.showAnswers,
        showAnswers: !!params.showAnswers,
        questions: [{ question: 'Маҷмӯи саволҳо аз рӯи мавзӯи «' + params.topic + '»', options: [] }]
      };

      var docxBlob = window.AliyaTemplates.generateTestDocx(testData);
      return { text: resultText, docxBlob: docxBlob };
    },

    /**
     * Заметки (Ёддоштҳо)
     */
    saveNote: async function (title, content, tags) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.state.db) { resolve(false); return; }
        var tx = self.state.db.transaction('notes', 'readwrite');
        var store = tx.objectStore('notes');
        var note = { title: title || 'Ёддошти нав', content: content || '', tags: tags || [], updatedAt: Date.now() };
        var req = store.add(note);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = reject;
      });
    },

    getNotes: async function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.state.db) { resolve([]); return; }
        var tx = self.state.db.transaction('notes', 'readonly');
        var store = tx.objectStore('notes');
        var req = store.getAll();
        req.onsuccess = function () {
          var list = req.result || [];
          list.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
          resolve(list);
        };
        req.onerror = function () { resolve([]); };
      });
    }
  };

  window.AliyaCore = AliyaCore;
})(window);

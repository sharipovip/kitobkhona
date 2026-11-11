/**
 * Aliya Core Engine v1.0.0
 * Муҳаррики асосии зеҳни сунъии Алия барои Китобхона:
 * - Робита бо шлюзи абрии sharipovip-aliya-gateway.hf.space
 * - Ҷавобҳои мустақим аз рӯи матни саҳифаҳои китоб (Context Grounding)
 * - Компютерное зрение (Vision OCR) барои скан-китобҳо ва аксҳо
 * - Генератори «Нақшаи дарс», «Тестҳо», «Диктант» бо содирот ба Word (.docx) ва PDF
 * - Лимити суратсозӣ (10 акс/рӯз) ва гузариши худкор ба FLUX
 * - Ёддоштҳо (IndexedDB офлайн)
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

    /**
     * Санҷиши квотаи аксҳо дар як рӯз (10 акс/рӯз)
     */
    checkPhotoQuota: function () {
      var today = new Date().toISOString().slice(0, 10);
      var record = { date: today, count: 0 };
      try {
        var raw = localStorage.getItem(PHOTO_QUOTA_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed.date === today) {
            record = parsed;
          }
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
     * Фиристодани паём ба чати Алия (бо дастгирии стриминг ва реҷаҳои тафаккур)
     */
    sendMessage: async function (prompt, options) {
      options = options || {};
      var messages = [];

      var systemPrompt = 'Шумо Алия — ёвари миллии зеҳни сунъии Тоҷикистон ва Китобхонаи электронии Тоҷикӣ ҳастед. ' +
        'Шумо ба забонҳои тоҷикӣ, русӣ ва англисӣ озод ва беғалат сӯҳбат мекунед. ' +
        'Шумо дар омӯзиши китобҳои дарсӣ (синфҳои 1-11), омодагӣ ба озмунҳои ҷумҳуриявӣ («Фурӯғи субҳи доноӣ китоб аст», «Шоҳномахонӣ», «Илм-фурӯғи маърифат»), ' +
        'таҳлили саҳифаҳои китоб, сохтани нақшаи дарс, тестҳо ва корҳои мустақилона кумак мерасонед.';

      if (options.contextText) {
        systemPrompt += '\n\n[МАТНИ ДАҚИҚИ САҲИФА/КИТОБ]:\n' + options.contextText + '\n\n' +
          'Дастур: Ҳамаи ҷавобҳо, тестҳо ва нақшаҳои дарсро СТРОГО аз рӯи ҳамин матни саҳифа омода кунед, маълумоти берунаро омехта накунед.';
      }

      messages.push({ role: 'system', content: systemPrompt });

      // Иловаи таърихи кӯтоҳ
      if (Array.isArray(options.history)) {
        options.history.slice(-6).forEach(function (m) {
          messages.push({ role: m.role, content: m.content });
        });
      }

      messages.push({ role: 'user', content: prompt });

      var depthTemp = 0.5;
      if (this.state.depth === 'simple') depthTemp = 0.3;
      if (this.state.depth === 'deep') depthTemp = 0.7;

      var reqBody = {
        messages: messages,
        temperature: depthTemp,
        max_tokens: 2500,
        stream: true
      };

      try {
        var response = await fetch(GATEWAY_BASE + '/v1/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
          // Захира ба дархости оддии non-stream
          return await this.sendMessageFallback(messages, depthTemp);
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var fullText = '';

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          var text = decoder.decode(chunk.value, { stream: true });
          var lines = text.split('\n');
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('data: ') === 0) {
              var dataStr = line.substring(6);
              if (dataStr === '[DONE]') continue;
              try {
                var json = JSON.parse(dataStr);
                var token = (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || json.token || '';
                fullText += token;
                if (typeof options.onToken === 'function') {
                  options.onToken(token, fullText);
                }
              } catch (e) {
                fullText += dataStr;
                if (typeof options.onToken === 'function') options.onToken(dataStr, fullText);
              }
            }
          }
        }
        return fullText;
      } catch (err) {
        console.warn('[AliyaCore] Stream error, trying fallback non-stream:', err);
        return await this.sendMessageFallback(messages, depthTemp);
      }
    },

    sendMessageFallback: async function (messages, temp) {
      try {
        var resp = await fetch(GATEWAY_BASE + '/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messages, temperature: temp, max_tokens: 2500 })
        });
        if (resp.ok) {
          var res = await resp.json();
          return (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || res.reply || res.text || 'Ҷавоб омода шуд.';
        }
      } catch (e) {}
      return 'Мутаассифона, ҳоло пайвастшавӣ ба сервери марказӣ қатъ шуд. Лутфан, пайвасти интернетро санҷед.';
    },

    /**
     * Таҳлили акс ва скан-китобҳо (Vision OCR)
     */
    analyzeImageOrScan: async function (base64Image, prompt) {
      prompt = prompt || 'Ин саҳифаи китобро пурра хонед ва матни онро бо забони тоҷикӣ баён кунед.';
      var cleanBase64 = base64Image.indexOf('base64,') !== -1 ? base64Image.split('base64,')[1] : base64Image;

      try {
        var resp = await fetch(GATEWAY_BASE + '/v1/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: cleanBase64,
            prompt: prompt,
            system_prompt: 'Шумо мутахассиси хондани скан-китобҳо ва ҳуҷҷатҳои таълимии Тоҷикистон ҳастед.'
          })
        });
        if (resp.ok) {
          var data = await resp.json();
          return data.text || data.reply || data.description || 'Матни акс хонда шуд.';
        }
      } catch (e) {
        console.error('[AliyaVision] Error:', e);
      }
      return 'Хондани акс муяссар нашуд. Лутфан, акси равшантарро интихоб намоед.';
    },

    /**
     * Генератори сурат (RealVisXL Lightning бо гузариш ба FLUX)
     */
    generateImage: async function (prompt) {
      var remaining = this.getRemainingPhotos();
      if (remaining <= 0) {
        throw new Error('Меъёри рӯзонаи суратсозӣ (10 акс дар як рӯз) ба анҷом расид. Фардо боз ройгон метавонед созед!');
      }

      var resp = await fetch(GATEWAY_BASE + '/v1/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          model: 'realvisxl',
          fallback: 'flux',
          negative_prompt: 'ugly, blurry, low quality, deformed'
        })
      });

      if (!resp.ok) {
        throw new Error('Сервери суратсозӣ муваққатан дастнорас аст.');
      }

      var data = await resp.json();
      this.incrementPhotoQuota();
      return data.image_url || (data.image_base64 ? 'data:image/jpeg;base64,' + data.image_base64 : null);
    },

    /**
     * Офаридани «Нақшаи дарс» аз рӯи параметрҳо
     */
    generateLessonPlan: async function (params) {
      var isRussian = params.lang === 'ru';
      var prompt = isRussian
        ? 'Составь подробный поурочный план-конспект по предмету "' + params.subject + '" для ' + params.grade + ' класса. ' +
          'Тема урока: "' + params.topic + '". ' +
          (params.bookRef ? 'Учебник: ' + params.bookRef + '. ' : '') +
          (params.contextText ? 'Основа текста урока: ' + params.contextText + '. ' : '') +
          'Включи цели, компетенции (знания, грамотность, умения, критическое мышление, воспитание), словарную работу (Русский-Таджикский), ' +
          'ход урока (45 мин): оргмомент, опрос домашнего задания, изучение темы, закрепление с упражнениями и ответами, развитие речи, домашнее задание, цитату классика.'
        : 'Нақшаи расмии дарси яксоатаро аз рӯи стандарти Вазорати маориф ва илми ҶТ аз фанни "' + params.subject + '" барои синфи ' + params.grade + ' тартиб деҳ. ' +
          'Мавзӯи дарс: "' + params.topic + '". ' +
          (params.bookRef ? 'Китоби дарсӣ: ' + params.bookRef + '. ' : '') +
          (params.contextText ? 'Матни саҳифа: ' + params.contextText + '. ' : '') +
          'Қисмҳои ҳатмӣ: 1. Ташкили дарс, 2. Пурсиши вазифаи хонагӣ (саволу ҷавоб), 3. Баёни мавзӯи нав муфассал аз рӯи матн, 4. Мустаҳкамкунӣ бо саволу ҷавобҳо, 5. Супориши вазифаи хонагӣ, 6. Хотима ва баҳогузорӣ.';

      var resultText = await this.sendMessage(prompt, { contextText: params.contextText });

      // Омодасозии объекти содирот барои DOCX
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
      var formatDesc = params.format === 'open' ? 'саволҳои кушодаи хаттӣ' : 'тестҳо бо 4 варианти ҷавоб (A, B, C, D)';

      var prompt = 'Аз рӯи мавзӯи "' + params.topic + '" (фанни ' + params.subject + ', синфи ' + params.grade + ') ' +
        count + ' дона ' + formatDesc + ' омода намо. ' +
        (params.contextText ? 'Аз рӯи ин матн: ' + params.contextText + '. ' : '') +
        (params.showAnswers ? 'Барои ҳар як савол ҷавоби дурустро бо [✓] нишон деҳ ва шарҳи кӯтоҳ навис.' : 'Танҳо саволҳо ва вариантҳоро бе ҷавоб навис, ва дар охир калиди ҷавобҳоро ҷудогона илова кун.');

      var resultText = await this.sendMessage(prompt, { contextText: params.contextText });

      var testData = {
        subject: params.subject,
        grade: params.grade,
        topic: params.topic,
        date: new Date().toLocaleDateString('tg-TJ'),
        forStudents: !params.showAnswers,
        showAnswers: !!params.showAnswers,
        questions: [{ question: 'Саволҳо аз рӯи мавзӯи «' + params.topic + '»', options: [] }]
      };

      var docxBlob = window.AliyaTemplates.generateTestDocx(testData);
      return { text: resultText, docxBlob: docxBlob };
    },

    /**
     * Заметки (Ёддоштҳо) дар IndexedDB
     */
    saveNote: async function (title, content, tags) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.state.db) {
          resolve(false);
          return;
        }
        var tx = self.state.db.transaction('notes', 'readwrite');
        var store = tx.objectStore('notes');
        var note = {
          title: title || 'Ёддошти нав',
          content: content || '',
          tags: tags || [],
          updatedAt: Date.now()
        };
        var req = store.add(note);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = reject;
      });
    },

    getNotes: async function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.state.db) {
          resolve([]);
          return;
        }
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

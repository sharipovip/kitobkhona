/**
 * Aliya Document & Template Engine v1.0.0
 * Модули сохтани ҳуҷҷатҳои касбии Word (.docx) ва PDF:
 * - Нақшаи дарс (формати давлатии Тоҷикистон)
 * - Поурочный план-конспект (формати синфҳои русӣ)
 * - Сохтани тест ва саволнома (бо бланки ҷавобҳо ё бо калиди омӯзгор)
 * - Диктант ва баёни хаттӣ (бо супоришҳои грамматикӣ)
 * - Конспекти китоб ва саҳифа
 * Ҳамаи ҳуҷҷатҳо бо блоки расмии таблиғотӣ ва пайванди Google Play оро дода шудаанд.
 */

(function (window) {
  'use strict';

  var AD_BRANDING = {
    line1: '📚 Омодашуда бо ёрии «Алия» — Зеҳни сунъии Тоҷикӣ',
    line2: '📖 Китобхонаи электронии Тоҷикӣ — Ҳамаи китобҳои дарсӣ ва бадеӣ',
    line3: '📲 Барномаи расмии Китобхона дар Google Play:',
    url: 'https://play.google.com/store/apps/details?id=com.kitobkhona.app&pcampaignid=web_share'
  };

  /**
   * Мини-созандаи ZIP дар Pure JS (бе ниёз ба китобхонаҳои беруна)
   */
  var MiniZip = {
    crcTable: (function () {
      var c, table = [];
      for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
          c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c >>> 0;
      }
      return table;
    })(),

    crc32: function (buf) {
      var crc = 0 ^ (-1);
      for (var i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ this.crcTable[(crc ^ buf[i]) & 0xFF];
      }
      return (crc ^ (-1)) >>> 0;
    },

    strToU8: function (str) {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
      }
      var utf8 = unescape(encodeURIComponent(str));
      var arr = new Uint8Array(utf8.length);
      for (var i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i);
      return arr;
    },

    buildZip: function (files) {
      var localHeaders = [];
      var centralDirs = [];
      var offset = 0;

      for (var path in files) {
        if (!Object.prototype.hasOwnProperty.call(files, path)) continue;
        var data = typeof files[path] === 'string' ? this.strToU8(files[path]) : files[path];
        var nameBuf = this.strToU8(path);
        var crc = this.crc32(data);
        var size = data.length;

        // Local file header (30 bytes + name + data)
        var lh = new Uint8Array(30 + nameBuf.length + size);
        var lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true); // signature
        lv.setUint16(4, 20, true);         // version needed
        lv.setUint16(6, 0, true);          // flags
        lv.setUint16(8, 0, true);          // compression (0 = store)
        lv.setUint16(10, 0x4821, true);    // time
        lv.setUint16(12, 0x556b, true);    // date
        lv.setUint32(14, crc, true);       // crc32
        lv.setUint32(18, size, true);      // compressed size
        lv.setUint32(22, size, true);      // uncompressed size
        lv.setUint16(26, nameBuf.length, true); // name length
        lv.setUint16(28, 0, true);         // extra field length
        lh.set(nameBuf, 30);
        lh.set(data, 30 + nameBuf.length);
        localHeaders.push(lh);

        // Central directory entry (46 bytes + name)
        var cd = new Uint8Array(46 + nameBuf.length);
        var cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true); // signature
        cv.setUint16(4, 20, true);         // version made by
        cv.setUint16(6, 20, true);         // version needed
        cv.setUint16(8, 0, true);          // flags
        cv.setUint16(10, 0, true);         // compression
        cv.setUint16(12, 0x4821, true);    // time
        cv.setUint16(14, 0x556b, true);    // date
        cv.setUint32(16, crc, true);       // crc32
        cv.setUint32(20, size, true);      // compressed size
        cv.setUint32(24, size, true);      // uncompressed size
        cv.setUint16(28, nameBuf.length, true); // name length
        cv.setUint16(30, 0, true);         // extra field len
        cv.setUint16(32, 0, true);         // comment len
        cv.setUint16(34, 0, true);         // disk number start
        cv.setUint16(36, 0, true);         // internal attrs
        cv.setUint32(38, 0, true);         // external attrs
        cv.setUint32(42, offset, true);    // local header offset
        cd.set(nameBuf, 46);
        centralDirs.push(cd);

        offset += lh.length;
      }

      var cdSize = centralDirs.reduce(function (acc, item) { return acc + item.length; }, 0);
      var eocd = new Uint8Array(22);
      var ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true); // EOCD signature
      ev.setUint16(4, 0, true);          // disk number
      ev.setUint16(6, 0, true);          // start disk
      ev.setUint16(8, centralDirs.length, true); // total entries on disk
      ev.setUint16(10, centralDirs.length, true); // total entries
      ev.setUint32(12, cdSize, true);    // size of central dir
      ev.setUint32(16, offset, true);    // offset of central dir
      ev.setUint16(20, 0, true);         // comment len

      var totalSize = offset + cdSize + 22;
      var out = new Uint8Array(totalSize);
      var cur = 0;
      for (var i = 0; i < localHeaders.length; i++) {
        out.set(localHeaders[i], cur);
        cur += localHeaders[i].length;
      }
      for (var j = 0; j < centralDirs.length; j++) {
        out.set(centralDirs[j], cur);
        cur += centralDirs[j].length;
      }
      out.set(eocd, cur);
      return out;
    }
  };

  /**
   * Генератори Word DOCX (Office Open XML)
   */
  function xmlEscape(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function createDocxDocument(bodyXml) {
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
      '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>\n' +
      '</Types>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
      '</Relationships>';

    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n' +
      '</Relationships>';

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      '  <w:docDefaults>\n' +
      '    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="tg-TJ"/></w:rPr></w:rPrDefault>\n' +
      '  </w:docDefaults>\n' +
      '</w:styles>';

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
      '  <w:body>\n' +
      bodyXml +
      '    <w:sectPr>\n' +
      '      <w:pgSz w:w="11906" w:h="16838"/>\n' + // A4 size in twips (210 x 297 mm)
      '      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1417"/>\n' + // Margins: Top/Right/Bottom 2cm, Left 2.5cm
      '    </w:sectPr>\n' +
      '  </w:body>\n' +
      '</w:document>';

    var files = {
      '[Content_Types].xml': contentTypes,
      '_rels/.rels': rels,
      'word/_rels/document.xml.rels': docRels,
      'word/styles.xml': stylesXml,
      'word/document.xml': documentXml
    };

    var zipBytes = MiniZip.buildZip(files);
    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function p(text, options) {
    options = options || {};
    var align = options.align ? ' w:val="' + options.align + '"' : '';
    var bold = options.bold ? '<w:b/>' : '';
    var italic = options.italic ? '<w:i/>' : '';
    var color = options.color ? '<w:color w:val="' + options.color + '"/>' : '';
    var size = options.size ? '<w:sz w:val="' + options.size + '"/>' : '<w:sz w:val="24"/>'; // 24 = 12pt
    var spaceBefore = options.before !== undefined ? ' w:before="' + options.before + '"' : ' w:before="60"';
    var spaceAfter = options.after !== undefined ? ' w:after="' + options.after + '"' : ' w:after="80"';
    var lineSpacing = ' w:line="276" w:lineRule="auto"'; // 1.15 line spacing

    return '<w:p>' +
      '<w:pPr><w:jc' + align + '/><w:spacing' + spaceBefore + spaceAfter + lineSpacing + '/></w:pPr>' +
      '<w:r><w:rPr>' + bold + italic + color + size + '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr>' +
      '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r>' +
      '</w:p>\n';
  }

  function adFooterXml() {
    var border = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="C9A84C"/></w:pBdr>';
    return '<w:p><w:pPr>' + border + '<w:spacing w:before="240" w:after="40"/><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="142236"/></w:rPr><w:t xml:space="preserve">' + xmlEscape(AD_BRANDING.line1) + '</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="4A5D73"/></w:rPr><w:t xml:space="preserve">' + xmlEscape(AD_BRANDING.line2) + '</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="C9A84C"/></w:rPr><w:t xml:space="preserve">' + xmlEscape(AD_BRANDING.line3 + ' ' + AD_BRANDING.url) + '</w:t></w:r></w:p>\n';
  }

  var AliyaTemplates = {
    AD_BRANDING: AD_BRANDING,

    /**
     * Генератори «Нақшаи дарс» (формати давлатии ҶТ)
     */
    generateTajikLessonPlanDocx: function (data) {
      var d = data || {};
      var xml = '';

      xml += p('Дарси № ' + (d.lessonNum || '___') + '   |   Сана: ' + (d.date || '_______________'), { bold: true, align: 'right', size: '22', color: '4A5D73' });
      xml += p('НАҚШАИ ДАРСИ ЯК СОАТА', { bold: true, align: 'center', size: '28', color: '0D1B2A', before: 120, after: 60 });
      xml += p('Аз фанни: ' + (d.subject || 'Технологияи иттилоотӣ') + ', синфи ' + (d.grade || '5'), { bold: true, align: 'center', size: '24', color: '1A2D44', after: 140 });

      xml += p('Мавзӯъ: ' + (d.topic || 'Андозагирии иттилоот') + (d.bookRef ? ' (' + d.bookRef + ')' : ''), { bold: true, size: '24', color: '0D1B2A' });
      xml += p('Мақсади дарс: ' + (d.goal || 'Омӯзонидани моҳияти мавзӯъ; ташаккули малакаҳои амалии хонандагон; тарбияи фарҳанги омӯзишӣ ва риояи қоидаҳои бехатарӣ.'), { size: '24' });
      xml += p('Методи дарс: ' + (d.method || 'Лексикаи муфассал, сӯҳбат, таҳлил, кор бо китоби дарсӣ, машқҳои амалӣ.'), { size: '24' });
      xml += p('Таҷҳизонидани дарс: ' + (d.equipment || 'Китоби дарсӣ, компютер/тахта, дафтари хонандагон, аёниятҳо.'), { size: '24', after: 140 });

      xml += p('РАВИШИ ДАРС', { bold: true, align: 'center', size: '26', color: '0D1B2A', before: 100, after: 100 });

      xml += p('1. ТАШКИЛИ ДАРС', { bold: true, size: '24', color: '1A2D44' });
      xml += p(d.step1 || 'Салом ва баҳисобгирии давомоти синф. Омода кардани хонандагон ба дарси нав, муайян намудани мавзӯъ ва мақсади дарс, шарҳи мухтасари аҳамияти он.', { size: '24' });

      xml += p('2. ПУРСИШИ ВАЗИФАИ ХОНАГӢ ВА ТАКРОР', { bold: true, size: '24', color: '1A2D44' });
      if (Array.isArray(d.step2Questions) && d.step2Questions.length) {
        d.step2Questions.forEach(function (q, idx) {
          xml += p('Саволи ' + (idx + 1) + ': ' + q.question, { bold: true, size: '24' });
          xml += p('Ҷавоб: ' + q.answer, { italic: true, size: '24', color: '2D3748' });
        });
      } else {
        xml += p(d.step2 || 'Пурсиши мазмуни дарси гузашта ва санҷиши машқҳои дафтар.', { size: '24' });
      }

      xml += p('3. БАЁНИ МАВЗӮИ НАВ (муфассал аз рӯи матни китоб)', { bold: true, size: '24', color: '1A2D44' });
      if (Array.isArray(d.step3Points) && d.step3Points.length) {
        d.step3Points.forEach(function (pt, idx) {
          xml += p((idx + 1) + '. ' + pt, { size: '24' });
        });
      } else {
        xml += p(d.step3 || 'Баёни пурраи нуктаҳои асосии мавзӯъ бо мисолҳо ва истифодаи китоби дарсӣ.', { size: '24' });
      }

      xml += p('4. МУСТАҲКАМКУНИИ ДАРС', { bold: true, size: '24', color: '1A2D44' });
      if (Array.isArray(d.step4Questions) && d.step4Questions.length) {
        d.step4Questions.forEach(function (q, idx) {
          xml += p('Саволи ' + (idx + 1) + ': ' + q.question, { bold: true, size: '24' });
          xml += p('Ҷавоб: ' + q.answer, { italic: true, size: '24', color: '2D3748' });
        });
      } else {
        xml += p(d.step4 || 'Иҷрои машқҳои шифоҳӣ ва амалӣ дар синф.', { size: '24' });
      }

      xml += p('5. СУПОРИШИ ВАЗИФАИ ХОНАГӢ', { bold: true, size: '24', color: '1A2D44' });
      xml += p(d.homework || '1) Матни дарсро аз китоб хонед.\n2) Қоидаҳо ва мафҳумҳои навро дар дафтар сабт намоед.', { size: '24' });

      xml += p('6. ХОТИМАИ ДАРС ВА БАҲОГУЗОРӢ', { bold: true, size: '24', color: '1A2D44' });
      xml += p(d.conclusion || 'Ҷамъбасти дарс, эълони баҳоҳои хонандагони фаъол ва додани тавсияҳо.', { size: '24', after: 180 });

      xml += adFooterXml();
      return createDocxDocument(xml);
    },

    /**
     * Генератори «Поурочный план-конспект» (русский стандарт)
     */
    generateRussianLessonPlanDocx: function (data) {
      var d = data || {};
      var xml = '';

      xml += p('Урок № ' + (d.lessonNum || '___') + '   |   Дата: ' + (d.date || '__________________'), { bold: true, align: 'right', size: '22', color: '4A5D73' });
      xml += p('ПОУРОЧНЫЙ ПЛАН-КОНСПЕКТ', { bold: true, align: 'center', size: '28', color: '0D1B2A', before: 120, after: 60 });
      xml += p('По предмету: ' + (d.subject || 'Русский язык') + ' для ' + (d.grade || '7') + ' класса', { bold: true, align: 'center', size: '24', color: '1A2D44', after: 140 });

      xml += p('Тема: ' + (d.topic || 'Почему нам необходимо знать русский язык'), { bold: true, size: '24', color: '0D1B2A' });
      if (d.topicTj) xml += p('Перевод (тадж.): ' + d.topicTj + (d.bookRef ? '  |  Учебник: ' + d.bookRef : ''), { italic: true, size: '22', color: '4A5D73' });

      xml += p('1. ЦЕЛЬ ОБУЧЕНИЯ', { bold: true, size: '24', color: '1A2D44' });
      xml += p(d.goal || 'Учить доказывать мысль; формировать умение строить связный текст; развивать устную и письменную речь.', { size: '24' });

      xml += p('2. КОМПЕТЕНЦИИ', { bold: true, size: '24', color: '1A2D44' });
      xml += p('• Знания: ' + (d.compKnowledge || 'Основные понятия темы, типы текстов, правила.'), { size: '24' });
      xml += p('• Грамотность: ' + (d.compLiteracy || 'Орфографическая и пунктуационная зоркость.'), { size: '24' });
      xml += p('• Умения: ' + (d.compSkills || 'Применение правил на практике, работа с упражнениями.'), { size: '24' });
      xml += p('• Критическое мышление: ' + (d.compThinking || 'Анализ прочитанного, ответы на проблемные вопросы.'), { size: '24' });
      xml += p('• Воспитание: ' + (d.compUpbringing || 'Уважение к языку, культуре и труду.'), { size: '24' });

      if (Array.isArray(d.vocabulary) && d.vocabulary.length) {
        xml += p('3. ЛЕКСИКА И СЛОВАРНАЯ РАБОТА', { bold: true, size: '24', color: '1A2D44' });
        d.vocabulary.forEach(function (v) {
          xml += p('• ' + v.ru + ' — ' + v.tj, { size: '24' });
        });
      }

      xml += p('4. ХОД УРОКА (45 МИН)', { bold: true, size: '24', color: '0D1B2A', before: 100, after: 80 });
      xml += p('1. Организационный момент (2 мин): ' + (d.step1 || 'Приветствие, проверка готовности к уроку.'), { size: '24' });
      xml += p('2. Опрос домашнего задания (5 мин): ' + (d.step2 || 'Проверка упражнений, устный опрос по прошлой теме.'), { size: '24' });
      xml += p('3. Изучение новой темы (20 мин): ' + (d.step3 || 'Чтение текста учебника, объяснение правил, примеры.'), { size: '24' });
      xml += p('4. Закрепление и отработка умений (10 мин): ' + (d.step4 || 'Выполнение упражнений у доски и в тетрадях.'), { size: '24' });
      xml += p('5. Развитие речи (5 мин): ' + (d.step5 || 'Составление предложений, устное рассуждение.'), { size: '24' });
      xml += p('6. Домашнее задание (3 мин): ' + (d.homework || 'Выучить правила, выполнить упражнения.'), { size: '24' });

      if (d.quote) {
        xml += p('«' + d.quote + '»' + (d.quoteAuthor ? ' (' + d.quoteAuthor + ')' : ''), { italic: true, align: 'center', size: '22', color: '2D3748', before: 100, after: 120 });
      }

      xml += adFooterXml();
      return createDocxDocument(xml);
    },

    /**
     * Генератори «Тест ва саволнома» (DOCX)
     */
    generateTestDocx: function (data) {
      var d = data || {};
      var xml = '';

      xml += p('СИНФИ: ' + (d.grade || '___') + '   |   ФАННИ: ' + (d.subject || '_______________') + '   |   САНА: ' + (d.date || '__________'), { bold: true, align: 'right', size: '22', color: '4A5D73' });
      xml += p('САНҶИШИ ТЕСТӢ АЗ РӮИ МАВЗӮИ:', { bold: true, align: 'center', size: '28', color: '0D1B2A', before: 100, after: 40 });
      xml += p('«' + (d.topic || 'Номи мавзӯъ') + '»', { bold: true, align: 'center', size: '26', color: '1A2D44', after: 140 });

      if (d.forStudents) {
        xml += p('Ному насаби хонанда: _____________________________________   Синф: _____', { bold: true, size: '24', after: 160 });
      }

      var questions = Array.isArray(d.questions) ? d.questions : [];
      questions.forEach(function (q, idx) {
        var qNum = (idx + 1) + '. ';
        xml += p(qNum + q.question, { bold: true, size: '24', color: '0D1B2A', before: 80, after: 40 });

        if (Array.isArray(q.options) && q.options.length) {
          q.options.forEach(function (opt) {
            var isCorrect = d.showAnswers && (opt.isCorrect || opt.key === q.correctKey);
            var prefix = isCorrect ? '[✓] ' : '[   ] ';
            var optColor = isCorrect ? '1E7E34' : '000000';
            xml += p('   ' + prefix + opt.key + ') ' + opt.text, { bold: isCorrect, size: '24', color: optColor, before: 20, after: 20 });
          });
        }

        if (d.showAnswers && q.explanation) {
          xml += p('   Шарҳ: ' + q.explanation, { italic: true, size: '22', color: '4A5D73', before: 20, after: 60 });
        }
      });

      // Бланки ҷавобҳо ё калиди омӯзгор
      if (d.forStudents && !d.showAnswers) {
        xml += p('───────────────────────────────────────────────────', { align: 'center', color: 'C9A84C', before: 180, after: 80 });
        xml += p('БЛАНКИ ҶАВОБҲО', { bold: true, align: 'center', size: '24', color: '0D1B2A' });
        var rowText = '';
        questions.forEach(function (q, idx) {
          rowText += '  ' + (idx + 1) + ': [____]  ';
          if ((idx + 1) % 5 === 0) {
            xml += p(rowText, { bold: true, align: 'center', size: '22' });
            rowText = '';
          }
        });
        if (rowText) xml += p(rowText, { bold: true, align: 'center', size: '22' });
      }

      xml += adFooterXml();
      return createDocxDocument(xml);
    },

    /**
     * Генератори «Ёвари диктант ва баёни хаттӣ» (DOCX)
     */
    generateDictationDocx: function (data) {
      var d = data || {};
      var xml = '';

      xml += p('СИНФИ: ' + (d.grade || '___') + '   |   ЧОРЯКИ: ' + (d.quarter || '___') + '   |   САНА: ' + (d.date || '__________'), { bold: true, align: 'right', size: '22', color: '4A5D73' });
      xml += p((d.type === 'bayon' ? 'БАЁНИ ХАТТӢ' : 'МАТНИ ДИКТАНТ'), { bold: true, align: 'center', size: '28', color: '0D1B2A', before: 100, after: 40 });
      xml += p('Мавзӯъ: «' + (d.topic || 'Ватан — модари ман') + '»', { bold: true, align: 'center', size: '26', color: '1A2D44', after: 120 });

      if (d.wordCount) {
        xml += p('Миқдори калимаҳо: ' + d.wordCount + ' калима  |  Сатҳи душворӣ: ' + (d.difficulty || 'Миёна'), { italic: true, align: 'center', size: '22', color: '4A5D73', after: 140 });
      }

      xml += p('МАТН:', { bold: true, size: '24', color: '0D1B2A' });
      xml += p(d.text || 'Матни диктант дар ин ҷо сабт мешавад...', { size: '24', lineSpacing: '300' });

      if (Array.isArray(d.grammarTasks) && d.grammarTasks.length) {
        xml += p('СУПОРИШҲОИ ГРАММАТИКӢ:', { bold: true, size: '24', color: '1A2D44', before: 120, after: 60 });
        d.grammarTasks.forEach(function (task, idx) {
          xml += p((idx + 1) + ') ' + task, { size: '24' });
        });
      }

      if (d.criteria) {
        xml += p('МЕЪЁРИ БАҲОГУЗОРӢ:', { bold: true, size: '24', color: '1A2D44', before: 100, after: 40 });
        xml += p(d.criteria, { italic: true, size: '22', color: '4A5D73' });
      }

      xml += adFooterXml();
      return createDocxDocument(xml);
    }
  };

  window.AliyaTemplates = AliyaTemplates;
})(window);

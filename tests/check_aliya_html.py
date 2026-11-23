"""Standard-library markup/script syntax checks: python tests/check_aliya_html.py"""
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.scripts=[]; self.in_script=False; self.script_src=False; self.buf=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if attrs.get('id'): self.ids.append(attrs['id'])
        if tag == 'script': self.in_script=True; self.script_src=bool(attrs.get('src')); self.buf=[]
    def handle_endtag(self, tag):
        if tag == 'script' and self.in_script:
            if not self.script_src: self.scripts.append(''.join(self.buf))
            self.in_script=False
    def handle_data(self, data):
        if self.in_script: self.buf.append(data)

def check_page(rel):
    text=(ROOT/rel).read_text(encoding='utf-8'); parser=PageParser(); parser.feed(text)
    dup=sorted({i for i in parser.ids if parser.ids.count(i)>1})
    assert not dup, f'{rel}: duplicate ids {dup}'
    for i, code in enumerate(parser.scripts):
        target=Path('/tmp/aliya-inline-check.js'); target.write_text(code,encoding='utf-8')
        result=subprocess.run(['node','--check',str(target)],capture_output=True,text=True)
        assert result.returncode == 0, f'{rel} inline script {i}: {result.stderr}'
    return len(parser.scripts)

for rel in ['aliya/index.html','reader.html','chat.html','maorif-books.html']:
    print(f'PASS {rel}: {check_page(rel)} inline script(s) parsed')
core=(ROOT/'aliya/aliya-core.js').read_text(encoding='utf-8')
assert "'/v1/vision'" in core and "'/v1/image'" in core and "'/v1/document/generate'" in core
assert 'picsum.photos' not in core and 'generateTestFromContext' not in core
sw=(ROOT/'sw.js').read_text(encoding='utf-8')
# v171: assert the cache-name *pattern*, not one hardcoded version — the version
# is bumped with every release and the hardcoded check broke on every bump.
import re as _re
assert _re.search(r"kitobkhona-v\d+[-\w]*", sw), 'sw.js must use a versioned cache name'
assert 'chat старй.html' not in sw and not (ROOT/'chat старй.html').exists()

# v176: мёртвая копия приложения удалена (app/reader.html, app/sw.js,
# app/aliya/*). На app/ никто не ссылался, в precache её не было — но в
# app/reader.html оставались старые баги (Z_MAX=2.2, тема через два нажатия),
# из-за чего легко было править не тот файл. Проверяем, что папка не вернулась
# и что в корне лежит единственная актуальная копия.
assert not (ROOT/'app').exists(), 'the stale app/ copy must stay deleted (see DELETE_FILES_RU.txt)'
for stale in ('app/reader.html', 'app/sw.js', 'app/aliya/index.html', 'app/aliya/aliya-ui.css'):
    assert stale not in sw, f'{stale} must not be referenced by the Service Worker'
    for page in ('reader.html', 'aliya/index.html', 'aliya/reader-aliya.html', 'index.html'):
        assert stale not in (ROOT/page).read_text(encoding='utf-8'), f'{page} must not reference {stale}'

# v176: Service Worker кеширует .js/.css по ключу БЕЗ учёта query (?v=...),
# поэтому старая версия ассета раздавалась бы из кэша. Спасает только новый
# CACHE_NAME — поэтому его имя должно совпадать с версией в ?v= у скриптов.
cache_name = _re.search(r"kitobkhona-v(\d+)", sw).group(1)
assert len(cache_name) >= 3, 'cache name must carry the release version'
for page in ('reader.html', 'aliya/index.html', 'aliya/reader-aliya.html'):
    text = (ROOT/page).read_text(encoding='utf-8')
    for asset in _re.findall(r'aliya-tasks\.js\?v=(\d+)', text):
        assert asset == cache_name, (
            f'{page}: aliya-tasks.js?v={asset} does not match CACHE_NAME v{cache_name} — '
            'users would keep the cached copy of the previous release')
print('PASS stale app/ copy is gone and asset versions match the Service Worker cache')

# v177: в корне репозитория было 71 .md-файл — десятки DEPLOY_v*.md и
# ИЗМЕНЕНИЯ_v*.md с историей релизов. Они ничего не объясняли на первой
# странице GitHub и мешали ориентироваться. Остались три: README.md (главная
# страница), СБОРКА_И_ПУБЛИКАЦИЯ.md (сборка/проверки/публикация) и
# MISSING_USER_ASSETS_RU.md (список файлов, которые подставляет владелец —
# на него ссылается dovtalab/index.html). Проверяем, что новые файлы релизов
# не заводятся снова.
root_md = sorted(p.name for p in ROOT.glob('*.md'))
allowed_md = {'README.md', 'СБОРКА_И_ПУБЛИКАЦИЯ.md', 'MISSING_USER_ASSETS_RU.md'}
extra_md = [name for name in root_md if name not in allowed_md]
assert not extra_md, (
    'unexpected .md files in the repository root: ' + ', '.join(extra_md) +
    ' — release notes belong in git history, not in the root')
assert (ROOT/'README.md').exists(), 'README.md is the front page of the repository'
assert (ROOT/'СБОРКА_И_ПУБЛИКАЦИЯ.md').exists(), 'the build/deploy guide must exist'
assert (ROOT/'MISSING_USER_ASSETS_RU.md').exists(), 'the missing-assets list must exist'
# Список недостающих файлов нужен рабочему «Довталабу» — ссылка не должна
# превратиться в 404.
dovtalab_index = (ROOT/'dovtalab/index.html').read_text(encoding='utf-8')
assert 'MISSING_USER_ASSETS_RU.md' in dovtalab_index, 'dovtalab must keep linking the missing-assets list'
# Сборка/публикация описана в README — иначе её не найти.
readme = (ROOT/'README.md').read_text(encoding='utf-8')
assert 'СБОРКА_И_ПУБЛИКАЦИЯ.md' in readme, 'README must link the build/deploy guide'
print('PASS the repository root keeps only the three current documents')

# v177: тугмаи «PDF»/«Word» дар Алияи дастгирӣ (iframe дар Reader) бояд
# файлро ҳақиқан сабт кунад. Три сабаби асосии хато:
#   1) сабт ба мошини ЧАҲРИ ДИГАР (window.parent.AliyaBridge) мефиристод —
#      иҷозати корбар барои интихоби файл дар чаҳри дигар нест, браузер
#      «Must be handling a user gesture» медиод;
#   2) агар интихоби файли иҷозат надод, хато ба корбар «Ҳуҷҷат сабт нашуд»
#      мекард ва файл асло сабт намешуд;
#   3) китобхонаҳо ва шрифтҳои PDF дар precache-и SW набуданд — офлайн
#      PDF ҳеҷ ҳеҷ сохта намешуд.
tasks_src = (ROOT/'aliya/aliya-tasks.js').read_text(encoding='utf-8')
bridge_src = (ROOT/'aliya/aliya-bridge.js').read_text(encoding='utf-8')

# (1) мошини сабти файл бояд дар ҳамон чаҳр истифода шавад.
own_bridge = tasks_src.find('window.AliyaBridge && typeof window.AliyaBridge.saveFile')
parent_bridge = tasks_src.find('window.parent.AliyaBridge && typeof window.parent.AliyaBridge.saveFile')
assert own_bridge != -1, 'the export must use the bridge of its own frame'
assert parent_bridge != -1, 'the parent frame bridge must stay as a fallback'
assert own_bridge < parent_bridge, (
    'the own-frame bridge must be tried first — the Save-As picker needs the '
    'user activation of the frame that handles the click')

# (2) интихоби файли иҷозат надошта бояд ба боршаврии одӣ гузаранд.
assert 'falling back to a normal download' in bridge_src, (
    'a refused Save-As picker must fall back to a normal download instead of '
    'failing with "Ҳуҷҷат сабт нашуд"')
assert 'abortedByUser' in bridge_src, 'a cancelled Save-As picker must be marked as user-cancelled'

# (3) китобхонаҳо ва шрифтҳои PDF бояд дар precache-и SW бошанд.
for asset in ('./assets/libs/pdf-lib.min.js', './assets/libs/fontkit.umd.min.js',
              './assets/fonts/NotoSans-Regular.sub.ttf', './assets/fonts/NotoSans-Bold.sub.ttf',
              './assets/fonts/NotoSans-Italic.sub.ttf', './assets/fonts/DejaVuSym.sub.ttf'):
    assert asset in sw, f'{asset} must be precached — otherwise the PDF export fails offline'
for asset in ('assets/libs/pdf-lib.min.js', 'assets/libs/fontkit.umd.min.js',
              'assets/fonts/NotoSans-Regular.sub.ttf', 'assets/fonts/DejaVuSym.sub.ttf'):
    assert (ROOT/asset).exists(), f'{asset} is missing from the repository'
print('PASS the Reader Aliya saves Word/PDF in its own frame and the PDF assets are precached')

# v178: корбар гӯшт, ки «сабт шуд, вале номи куҷо маълум нест». Сеанҳои:
#   1) Алия дар Reader — iframe, ва AndroidBridge танҳо дар reader.html
#      (родитель) ҳаст. Агар iframe таваффиқ накунад, нативный диалог
#      «Сохранить как» даст намерасад ва файл тихӣ ба «Загрузки» меравад.
#   2) Боршаврии одӣ бояд дар БОЛОИ ОКНО иҷро шавад — ҳамон тарзи
#      боргирии китоб, то Chrome пурсиши «куда сохранить»-ро нишон диҳад.
#   3) Тост бояд аниқ гӯяд, ки файл дар куҷо сабт шуд.
tasks_src2 = (ROOT/'aliya/aliya-tasks.js').read_text(encoding='utf-8')
bridge_src2 = (ROOT/'aliya/aliya-bridge.js').read_text(encoding='utf-8')

# (1) як файли муштарики мост бояд бо ҳар як саҳфа бор бошад.
assert (ROOT/'assets/js/native-fallback.js').exists(), 'the shared native fallback is missing'
for page in ('reader.html', 'aliya/reader-aliya.html', 'aliya/index.html'):
    text = (ROOT/page).read_text(encoding='utf-8')
    assert 'native-fallback.js' in text, f'{page} must load the shared native fallback'
reader_aliya_html = (ROOT/'aliya/reader-aliya.html').read_text(encoding='utf-8')
assert reader_aliya_html.index('native-fallback.js') < reader_aliya_html.index('aliya-bridge.js'), (
    'the Aliya iframe must set up the native fallback BEFORE the bridge reads it')

# (2) мост бояд дар ҳамон оконоҳо (своё/родитель/болои) ёбод.
assert 'hostWindows' in bridge_src2, 'the bridge must look for the native bridge in every host window'
assert 'window.top' in bridge_src2, 'the browser download must be triggered in the top window'

# (3) тост бояд ҷойи файлро ном бар орад.
assert '«Загрузки»' in tasks_src2, 'the toast must name the Downloads folder'
assert 'savedWhere' in tasks_src2, 'the toast must use the shared savedWhere() helper'
assert 'savedWhere' in (ROOT/'aliya/index.html').read_text(encoding='utf-8'), (
    'the main Aliya must use savedWhere() too')

# Резервный мост должен быть в precache, иначе офлайн его не будет.
assert './assets/js/native-fallback.js' in sw, 'the native fallback must be precached'
print('PASS the export asks where to save and tells the user where the file went')

desktop_css=(ROOT/'assets/css/desktop-layout.css').read_text(encoding='utf-8')
assert '@media screen and (min-width: 1024px)' in desktop_css
assert 'max-width: min(100%, 1720px)' in desktop_css
assert 'padding-bottom: 112px !important' in desktop_css
assert 'z-index: 12000 !important' in desktop_css
print('PASS desktop fit layer is isolated to wide screens and reserves safe scroll space')
print('PASS endpoint contract references, no fake image fallback, PWA cache version')

aliya_html=(ROOT/'aliya/index.html').read_text(encoding='utf-8')
aliya_css=(ROOT/'aliya/aliya-ui.css').read_text(encoding='utf-8')
assert 'id="micBtn"' not in aliya_html and 'SpeechRecognition' not in aliya_html and 'speechSynthesis' not in aliya_html
assert 'id="documentInput"' in aliya_html and 'AliyaCore.extractDocumentText' in aliya_html and 'options.documentText' in core
assert all(fmt in aliya_html for fmt in ['.pdf','.docx','.xlsx','.csv'])
assert 'loadDocumentLibrary' in core and '26000' in core
assert 'id="aliyaStatus"' in aliya_html and 'id="imageInput"' in aliya_html
assert '#FF6A3D' in aliya_css and '#0E0F12' in aliya_css and '@keyframes aliya-emblem-breathe' in aliya_css
assert _re.search(r'aliya-ui\.css\?v=\d+', aliya_html) and 'aliya-desktop.css?v=1' in aliya_html
assert 'function formatMarkdown(str)' in aliya_html and 'AliyaCore.formatMarkdown(safeText)' in aliya_html
assert 'rich-code-copy' in aliya_html and 'rich-code-download' in aliya_html
assert 'formatMarkdown: function (markdown)' in core and 'noopener noreferrer' in core
# v171: класс 'aliya-light' ставится не в HTML, а модулем темы (aliya-theme.js).
aliya_theme=(ROOT/'aliya/aliya-theme.js').read_text(encoding='utf-8')
assert 'id="settingsDarkTheme"' in aliya_html and 'function applyTheme' in aliya_html
assert 'aliya-light' in aliya_theme and "classList.toggle('aliya-light'" in aliya_theme
assert 'DarkAliyaPalette' not in aliya_html
assert '#F7F6F4' in aliya_css and '#ECEBE7' in aliya_css and '#E85A2D' in aliya_css
# v171: Пурвои корбарони чат бо CSS-переменнаяҳо (var(--soft)) ренг мешавад — лозим нест ки
# ҳамаи рангҳоро дар як қоидаи алоҳида дубора навишем. Танҳо мавжуд будни ки блоки
# «html.aliya-light .settings-card» санъат мешавад.
assert 'html.aliya-light .settings-card' in aliya_css
assert '.msg-row.user .msg-bubble{background:var(--soft)' in aliya_css
assert 'settingsSpeechVoice' not in aliya_html and 'settingsPreviewVoice' not in aliya_html and 'speechVoiceURI' not in aliya_html
assert all(identifier in aliya_html for identifier in ['PROFILE_KEY','settingsIncludeProfile','profileNameInput','profileCityInput','profileAboutInput','profileFactsInput','saveProfileBtn','buildProfileContext'])
# v171: «deep» ҳеҷ гоҳ 'high' намефиристад — 'high' дар шлюзи зиндагӣ + супоти амиқро дар ҳар паём
# фаъол мекард ва шлюз метавонист якчо даффа зиёд аз 150 с кор карда («бесконечно думает»).
assert "reasoning_mode: this.state.depth === 'deep' ? DEEP_REASONING_MODE" in core
assert "DEEP_REASONING_MODE = 'medium'" in core
assert "max_tokens: this.state.depth === 'deep' ? DEEP_MAX_TOKENS" in core
assert "DEEP_MAX_TOKENS = 2200" in core
assert "var MAX_ATTEMPTS = 2" in core
assert "var REQUEST_TIMEOUT_MS = 150000" in core
assert 'profileContext' in core and 'КОНТЕКСТИ ШАХСИИ ИХТИЁРИИ КОРБАР' in core
# v171: Матни розӣ аз нав навишта шудааст ( clearer wording ), аммо манъи он ҳамон мундааст:
# корбар бояд огоҳ шавад, ки профил ба шлюзи AI фиристода мешавад.
assert 'settingsPrefs.includeProfileContext?buildProfileContext():\'\'' in aliya_html
assert 'id="settingsIncludeProfile"' in aliya_html and 'розӣ мешавед' in aliya_html
assert 'profile:personalProfile' in aliya_html
assert 'data-tab="settings"' in aliya_html and 'id="pane-settings"' in aliya_html
assert all(identifier in aliya_html for identifier in ['settingsSaveHistory','settingsExportBtn','settingsClearDataBtn']) and 'settingsSpeakReplies' not in aliya_html
assert all(token in aliya_html for token in ['function saveSettingsPrefs','saveHistory','AliyaCore.clearNotes','format:\'kitobkhona-aliya-local-backup-v1\'']) and 'function speakChatReply' not in aliya_html
assert 'saveHistory' in aliya_html and 'localStorage.removeItem(CONVERSATIONS_KEY)' in aliya_html
assert 'clearNotes: async function' in core
assert 'id="noteEditorForm"' in aliya_html and 'id="noteChecklistInput"' in aliya_html
assert all(token in aliya_html for token in ['function openNoteEditor','function renderNotes','updateNote(updated)','note-check-item','pinned'])
assert 'updateNote: async function' in core and 'note.checklist' in core and 'aliya_notes_fallback_v1' in core
assert '.note-editor-modal' in aliya_css and '.note-check-item.is-done' in aliya_css
assert 'data-tab="voice"' not in aliya_html and 'id="pane-voice"' not in aliya_html
assert 'aliya_voice_turns_v1' not in aliya_html and 'voice-orb-' not in aliya_css
assert 'id="aliyaHistoryTrigger"' in aliya_html and 'openHistoryDrawer' in aliya_html
assert "state.depth = 'deep'" in aliya_html and "depth: 'deep'" in core
assert 'hidePersonalGithubAddress' in aliya_html
# v171: Нишонаҳои амалҳои содирот аз нав ба «Сабт ҳамчун Word/PDF» ишора карда шуданд —
# функсионал як аст, танҳо барои корбар равшантар шуд. Ҳамаи имкониятҳо санҷида мешаванд.
assert all(token in aliya_html for token in ['Нусхабардории ҷавоб','Сабт ҳамчун Word','Сабт ҳамчун PDF','Ба ёддоштҳо','Содироти ҷадвал ба Excel','AbortController'])
assert '📄 Word' in aliya_html and '⬇ PDF' in aliya_html and '🔖' in aliya_html
# v171: Генератори DOCX-ҷавоб аз aliya/index.html ба aliya-doc-templates.js кӯчид (модулии тозар),
# ва ҷавоби чат ҳоло тавассути як хелли умумии exportDoc соди мешавад.
templates=(ROOT/'aliya/aliya-doc-templates.js').read_text(encoding='utf-8')
assert 'function addMessageActions' in aliya_html and 'generateResponseDocx' in templates
assert "AT.exportDoc('docx'" in aliya_html and "AT.exportDoc('pdf'" in aliya_html
assert 'options.signal' in core and "'aborted'" in core
assert '.msg-actions' in aliya_css and '.msg-body' in aliya_css
print('PASS APK-aligned Aliya skin, responsive composer controls, voice mode removed; max reasoning enabled, cache-busted assets')

assert 'id="historyDrawer"' in aliya_html and 'id="historySearch"' in aliya_html and 'id="projectsGroup"' in aliya_html
assert 'aliya_chat_sessions_v1' in aliya_html and 'aliya_chat_projects_v1' in aliya_html and "dataset.action='pin'" in aliya_html and "dataset.action='move'" in aliya_html
assert 'function createProject()' in aliya_html and 'function openMoveFolderPicker' in aliya_html and '1600000' in aliya_html
svg=re.search(r'<svg\b.*?</svg>', aliya_html, re.S)
assert svg, 'inline brand SVG missing'
ET.fromstring(svg.group(0))
assert aliya_css.count('{') == aliya_css.count('}'), 'unbalanced CSS blocks'
aliya_desktop=(ROOT/'aliya/aliya-desktop.css').read_text(encoding='utf-8')
assert '@media screen and (min-width:1200px) and (hover:hover) and (pointer:fine)' in aliya_desktop
home_desktop=(ROOT/'assets/css/home-desktop.css').read_text(encoding='utf-8')
sidebar=(ROOT/'assets/css/desktop-sidebar.css').read_text(encoding='utf-8')
brand=(ROOT/'aliya/aliya-brand-animation.js').read_text(encoding='utf-8')
reader=(ROOT/'reader.html').read_text(encoding='utf-8')
assert '@media screen and (min-width: 1200px) and (hover: hover) and (pointer: fine)' in home_desktop
assert home_desktop.count('{') == home_desktop.count('}'), 'unbalanced home desktop CSS'
assert aliya_desktop.count('{') == aliya_desktop.count('}'), 'unbalanced Aliya desktop CSS'
assert '#notifBtn' in home_desktop and 'display: flex !important' in home_desktop
assert 'id="notifBtn"' in (ROOT/'index.html').read_text(encoding='utf-8')
assert '<button type="button" class="new-icon-btn-v3" id="notifBtn"' in (ROOT/'index.html').read_text(encoding='utf-8')
assert "'./assets/css/home-desktop.css'" in sw and "'./aliya/aliya-desktop.css'" in sw
assert "'./assets/css/desktop-sidebar.css'" in sw and "'./aliya/aliya-brand-animation.js'" in sw
assert 'kkh-dnav-open' in sidebar and 'aria-expanded' in (ROOT/'config.js').read_text(encoding='utf-8')
assert 'renderEmblem(canvas,target,p)' in brand and 'reverseOrder = [7, 6, 5, 4, 3, 2, 1, 0]' in brand
# v171: Алия дар хонакшида ҳоло тавассути iframe-и алоҳида (aliya/reader-aliya.html) кор мекунад —
# лозим нест ки тавассути функсияҳои кӯҳна бошад. Нишондоди он ва кушодани он саботан шаванд.
assert 'openAliyaOverlay' in reader and 'aliya/reader-aliya.html' in reader and 'readerAliyaBtn' in reader
# Оверлей создаётся скриптом (document.createElement), а не статической разметкой.
assert "id = 'aliyaOverlay'" in reader or "id='aliyaOverlay'" in reader
reader_aliya=(ROOT/'aliya/reader-aliya.html').read_text(encoding='utf-8')
assert 'AliyaTasks' in reader_aliya and 'aliya-tasks.js' in reader_aliya
assert '__kkCloseAliya' in reader_aliya and '__kkReaderDoc' in reader_aliya
# v171: Поля выбора страниц рисуются динамически (data-f="from"/"to") в общем модуле задач,
# а не статическими id в HTML. Проверяем реальные поля диапазона.
tasks=(ROOT/'aliya/aliya-tasks.js').read_text(encoding='utf-8')
assert 'data-f="from"' in tasks and 'data-f="to"' in tasks and 'data-f="page"' in tasks
assert 'pageFrom' in core and 'pageTo' in core and 'pageScope' in core
print('PASS multi-chat local history UI, search, pin/rename/delete hooks, SVG and CSS structure')

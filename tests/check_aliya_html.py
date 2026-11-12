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
assert "kitobkhona-v155-desktop-aliya-redesign" in sw
assert 'chat старй.html' not in sw and not (ROOT/'chat старй.html').exists()

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
assert 'aliya-ui.css?v=120' in aliya_html and 'aliya-desktop.css?v=1' in aliya_html
assert 'function formatMarkdown(str)' in aliya_html and 'AliyaCore.formatMarkdown(safeText)' in aliya_html
assert 'rich-code-copy' in aliya_html and 'rich-code-download' in aliya_html
assert 'formatMarkdown: function (markdown)' in core and 'noopener noreferrer' in core
assert 'id="settingsDarkTheme"' in aliya_html and 'function applyTheme' in aliya_html and 'aliya-light' in aliya_html
assert 'DarkAliyaPalette' not in aliya_html
assert '#F7F6F4' in aliya_css and '#ECEBE7' in aliya_css and '#E85A2D' in aliya_css
assert 'html.aliya-light .msg-row.user .msg-bubble' in aliya_css and 'html.aliya-light .settings-card' in aliya_css
assert 'settingsSpeechVoice' not in aliya_html and 'settingsPreviewVoice' not in aliya_html and 'speechVoiceURI' not in aliya_html
assert all(identifier in aliya_html for identifier in ['PROFILE_KEY','settingsIncludeProfile','profileNameInput','profileCityInput','profileAboutInput','profileFactsInput','saveProfileBtn','buildProfileContext'])
assert "reasoning_mode: this.state.depth === 'deep' ? 'high'" in core and "max_tokens: this.state.depth === 'deep' ? 4096" in core
assert 'profileContext' in core and 'КОНТЕКСТИ ШАХСИИ ИХТИЁРИИ КОРБАР' in core
assert 'settingsPrefs.includeProfileContext?buildProfileContext():\'\'' in aliya_html and 'Шумо розӣ ҳастед' in aliya_html
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
assert all(token in aliya_html for token in ['Нусхабардории ҷавоб','Захира кардан дар ёддоштҳо','Содирот ба Word','Содирот ба PDF','Содирот ба матн','Содироти ҷадвал ба Excel','AbortController'])
assert 'function addMessageActions' in aliya_html and 'generateResponseDocx' in aliya_html
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
assert '@media screen and (min-width: 1200px) and (hover: hover) and (pointer: fine)' in home_desktop
assert home_desktop.count('{') == home_desktop.count('}'), 'unbalanced home desktop CSS'
assert aliya_desktop.count('{') == aliya_desktop.count('}'), 'unbalanced Aliya desktop CSS'
assert '#notifBtn' in home_desktop and 'display: flex !important' in home_desktop
assert 'id="notifBtn"' in (ROOT/'index.html').read_text(encoding='utf-8')
assert '<button type="button" class="new-icon-btn-v3" id="notifBtn"' in (ROOT/'index.html').read_text(encoding='utf-8')
assert "'./assets/css/home-desktop.css'" in sw and "'./aliya/aliya-desktop.css'" in sw
print('PASS multi-chat local history UI, search, pin/rename/delete hooks, SVG and CSS structure')

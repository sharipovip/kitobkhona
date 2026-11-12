'use strict';
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

let server;
let mainWindow;
const root = path.resolve(app.getAppPath());
const mime = {
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.pdf':'application/pdf',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.mp3':'audio/mpeg',
  '.ogg':'audio/ogg', '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function safePath(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, '.' + pathname);
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

function startStaticServer() {
  server = http.createServer((req, res) => {
    const file = safePath(req.url || '/');
    if (!file) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      const stream = fs.createReadStream(file);
      stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
      stream.pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

async function createMainWindow() {
  const port = await startStaticServer();
  const origin = `http://127.0.0.1:${port}`;
  mainWindow = new BrowserWindow({
    width: 1360, height: 900, minWidth: 840, minHeight: 620,
    backgroundColor: '#0D1B2A', show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(origin + '/') && target !== origin) {
      event.preventDefault();
      if (/^https?:\/\//i.test(target)) shell.openExternal(target).catch(() => {});
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(origin + '/');
}

app.whenReady().then(createMainWindow).catch((error) => {
  console.error('[Kitobkhona Desktop] startup failed:', error);
  app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow().catch(console.error); });
app.on('before-quit', () => { if (server && server.listening) server.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

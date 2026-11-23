// QC App for Windows: a window around the installable web app.
// - Same data, offline cache and updates as the web version (service worker).
// - Google sign-in cannot run inside an embedded window, so it opens in the system browser
//   and comes back through the qcapp:// link (Supabase redirect qcapp://auth).
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = 'https://sittikorn0349.github.io/qc-app/';
const START = APP_URL;   // opens in the mode the user chose last (offline by default; online from Settings)
const AUTH_HOSTS = ['kcuhizrtegornpqtaijx.supabase.co', 'accounts.google.com'];
let win = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
if (process.defaultApp) app.setAsDefaultProtocolClient('qcapp', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('qcapp');

function authReturn(url) {
  // qcapp://auth?code=...  ->  load the app with ?code= so it finishes signing in
  try {
    const u = new URL(url);
    const q = new URLSearchParams(u.search);
    q.set('mode', 'online');
    if (win) { win.loadURL(APP_URL + '?' + q.toString()); if (win.isMinimized()) win.restore(); win.focus(); }
  } catch (e) { /* ignore malformed links */ }
}

function isAuth(url) { try { const h = new URL(url).host; return AUTH_HOSTS.includes(h) && /\/(authorize|signin|o\/oauth2)/.test(url); } catch (e) { return false; } }
function isApp(url) { return url.startsWith(APP_URL); }

function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 600, title: 'QC ตรวจงาน',
    icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#f1f3f0', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false }
  });
  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => {
    if (isApp(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);   // sign-in and outside links: system browser
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel|line):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  const arg = process.argv.find(a => a.startsWith('qcapp://'));
  if (arg) authReturn(arg); else win.loadURL(START);
}

app.on('second-instance', (e, argv) => {
  const link = argv.find(a => a.startsWith('qcapp://'));
  if (link) authReturn(link);
  else if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('open-url', (e, url) => { e.preventDefault(); authReturn(url); });
app.whenReady().then(() => { Menu.setApplicationMenu(null); create(); });
app.on('window-all-closed', () => app.quit());

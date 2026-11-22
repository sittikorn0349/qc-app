// Tells the web app it runs inside the Windows program (Google sign-in opens in the system browser).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('qcDesktop', { isDesktop: true, authRedirect: 'qcapp://auth' });

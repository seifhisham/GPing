require('electron-reload')(__dirname);

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ping = require('ping');

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    resizable: true,
    title: 'GPING',
  });

  win.setMenuBarVisibility(false);
  win.loadFile('src/index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('ping-host', async (event, host) => {
  try {
    const res = await ping.promise.probe(host, { timeout: 2 });
    return {
      host: res.host,
      alive: res.alive,
      time: res.time, // RTT in ms
      packetLoss: res.packetLoss || 0,
    };
  } catch (e) {
    return {
      host,
      alive: false,
      time: null,
      packetLoss: 100,
      error: e.message,
    };
  }
});

ipcMain.handle('exit-app', () => {
  app.quit();
}); 
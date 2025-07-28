const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pingHost: (host) => ipcRenderer.invoke('ping-host', host),
});

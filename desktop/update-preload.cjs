// oxlint-disable-next-line typescript/no-require-imports, typescript/no-var-requires -- Electron sandboxed preloads must use CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('juaiUpdate', {
  cancel: () => ipcRenderer.send('juai-update:cancel'),
  onProgress: (callback) => {
    ipcRenderer.on('juai-update:progress', (_event, state) => callback(state));
  },
});

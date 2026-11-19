const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("excalidrawDesktop", {
  getDocumentName: () => ipcRenderer.sendSync("document:get-name"),
  openExcalidraw: () => ipcRenderer.invoke("document:open"),
  activateDocument: (token) => ipcRenderer.invoke("document:activate", token),
  saveExcalidraw: (data, name, saveAs) =>
    ipcRenderer.invoke("document:save", data, name, saveAs),
  importAttachments: () => ipcRenderer.invoke("attachments:import"),
  openAttachment: (relativePath) =>
    ipcRenderer.invoke("attachments:open", relativePath),
});

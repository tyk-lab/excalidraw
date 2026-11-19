const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  copyAttachmentsForSaveAs,
  importAttachments,
  resolveAttachment,
} = require("./attachments.cjs");
const { installMenu } = require("./menu.cjs");

const ORIGIN = "excalidraw://app";
const documents = new Map();
const pendingDocumentPaths = new Map();
let mainWindow;
let currentDocumentPath = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "excalidraw",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
app.setName("Excalidraw Offline");
app.setAppUserModelId("org.excalidraw.offline");

function isTrustedSender(event) {
  return mainWindow && event.sender === mainWindow.webContents;
}

function documentArgument(argv) {
  return argv
    .slice(1)
    .find((arg) => path.isAbsolute(arg) && /\.excalidraw$/i.test(arg));
}

async function openDocument(filename) {
  try {
    // Read only explicitly chosen/launch-supplied documents, never renderer paths.
    const data = await fs.readFile(filename);
    currentDocumentPath = filename;
    const token = randomUUID();
    documents.set(token, data);
    const url = `${ORIGIN}/#url=${encodeURIComponent(
      `${ORIGIN}/document/${token}`,
    )}`;
    await mainWindow.loadURL(url);
    mainWindow.show();
    mainWindow.focus();
  } catch (error) {
    dialog.showErrorBox("无法打开文件", `${filename}\n${error.message}`);
  }
}

async function chooseDocument() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "打开 Excalidraw 文件",
    filters: [{ name: "Excalidraw 图纸", extensions: ["excalidraw"] }],
    properties: ["openFile"],
  });
  if (!result.canceled) {
    await openDocument(result.filePaths[0]);
  }
}

ipcMain.on("document:get-name", (event) => {
  event.returnValue =
    isTrustedSender(event) && currentDocumentPath
      ? path.basename(currentDocumentPath)
      : null;
});

ipcMain.handle("document:open", async (event) => {
  if (!isTrustedSender(event)) {
    throw new Error("Forbidden");
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "打开 Excalidraw 文件",
    filters: [{ name: "Excalidraw 图纸", extensions: ["excalidraw", "json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  const filename = result.filePaths[0];
  const data = await fs.readFile(filename);
  const token = randomUUID();
  pendingDocumentPaths.set(token, filename);
  return { data, name: path.basename(filename), token };
});

ipcMain.handle("document:activate", (event, token) => {
  const filename = isTrustedSender(event) && pendingDocumentPaths.get(token);
  if (!filename) {
    throw new Error("无效的文件打开请求");
  }
  currentDocumentPath = filename;
  pendingDocumentPaths.delete(token);
});

ipcMain.handle("document:save", async (event, data, name, saveAs) => {
  if (!isTrustedSender(event)) {
    throw new Error("Forbidden");
  }
  let filename = currentDocumentPath;
  if (saveAs || !filename) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "保存 Excalidraw 图纸",
      defaultPath: `${name}.excalidraw`,
      filters: [{ name: "Excalidraw 图纸", extensions: ["excalidraw"] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    filename = result.filePath;
  }
  const contents = Buffer.from(data);
  if (filename !== currentDocumentPath) {
    const scene = JSON.parse(contents.toString("utf8"));
    await copyAttachmentsForSaveAs(scene, currentDocumentPath, filename);
  }
  await fs.writeFile(filename, contents);
  currentDocumentPath = filename;
  return { name: path.basename(filename) };
});

ipcMain.handle("attachments:import", async (event) => {
  if (!isTrustedSender(event)) {
    throw new Error("Forbidden");
  }
  if (!currentDocumentPath) {
    throw new Error("UNSAVED_DOCUMENT");
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入附件",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "常用附件",
        extensions: ["emmx", "mm", "md", "markdown", "txt", "pdf"],
      },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (result.canceled) {
    return [];
  }
  return importAttachments(currentDocumentPath, result.filePaths);
});

ipcMain.handle("attachments:open", async (event, relativePath) => {
  if (!isTrustedSender(event) || !currentDocumentPath) {
    throw new Error("无法确定当前图纸位置");
  }
  const filename = resolveAttachment(currentDocumentPath, relativePath);
  const error = await shell.openPath(filename);
  if (error) {
    throw new Error(error);
  }
});

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== "app" || request.method !== "GET") {
    return new Response("Forbidden", { status: 403 });
  }
  if (url.pathname.startsWith("/document/")) {
    const token = url.pathname.slice("/document/".length);
    const data = documents.get(token);
    documents.delete(token);
    return data
      ? new Response(data, { headers: { "Content-Type": "application/json" } })
      : new Response("Not found", { status: 404 });
  }
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.join(__dirname, "../excalidraw-app/build");
  const filename = path.resolve(
    root,
    `.${decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    )}`,
  );
  const relative = path.relative(root, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const response = await net.fetch(pathToFileURL(filename).href);
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "font-src 'self' data: https:; connect-src 'self' blob:; " +
        "worker-src 'self' blob:; object-src 'none'; frame-src 'none'",
    );
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function start() {
  protocol.handle("excalidraw", serve);
  // All app resources are bundled. Block network even if an online control is invoked.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^(https?|wss?|ftp):/i.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      const url = contents && new URL(contents.getURL());
      callback(
        url?.protocol === "excalidraw:" &&
          url.host === "app" &&
          ["clipboard-sanitized-write", "fileSystem"].includes(permission),
      );
    },
  );
  mainWindow = new BrowserWindow({
    title: "Excalidraw 离线版",
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (target.protocol !== "excalidraw:" || target.host !== "app") {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code !== -3) {
      dialog.showErrorBox("程序加载失败", `${description} (${code})`);
    }
  });
  installMenu(mainWindow, chooseDocument);
  const filename = documentArgument(process.argv);
  if (filename) {
    await openDocument(filename);
  } else {
    await mainWindow.loadURL(`${ORIGIN}/`);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const filename = documentArgument(argv);
    if (filename && mainWindow) {
      void openDocument(filename);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("启动失败", error.stack || error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}

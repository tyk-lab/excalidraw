const {
  app,
  BrowserWindow,
  dialog,
  net,
  protocol,
  session,
} = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { installMenu } = require("./menu.cjs");

const ORIGIN = "excalidraw://app";
const documents = new Map();
let mainWindow;

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

function documentArgument(argv) {
  return argv
    .slice(1)
    .find((arg) => path.isAbsolute(arg) && /\.excalidraw$/i.test(arg));
}

async function openDocument(filename) {
  try {
    // Read only explicitly chosen/launch-supplied documents, never renderer paths.
    const data = await fs.readFile(filename);
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

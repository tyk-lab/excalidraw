const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const { _electron, chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const fromSource = process.argv.includes("--source");
const fromPortable = process.argv.includes("--portable");
let executablePath = fromSource
  ? require("electron")
  : path.resolve(
      root,
      fromPortable
        ? "dist/windows/Excalidraw-Offline-1.0.0-win-x64.exe"
        : "dist/windows/win-unpacked/Excalidraw Offline.exe",
    );
const output = path.join(root, "dist/windows/verification");

async function launch(profile, filename) {
  if (fromPortable) {
    return launchPortable(profile, filename);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return _electron.launch({
    executablePath,
    args: [
      ...(fromSource ? [path.join(root, "desktop")] : []),
      `--user-data-dir=${profile}`,
      ...(filename ? [filename] : []),
    ],
    env,
    timeout: 20000,
  });
}

async function launchPortable(profile, filename) {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      ...(filename ? [filename] : []),
    ],
    { stdio: "ignore" },
  );
  let browser;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 1000,
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const close = async () => {
    if (browser) {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close").catch(() => {});
      await browser.close();
    }
    if (child.exitCode === null) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };
  if (!browser) {
    await close();
    throw new Error(
      "Portable application did not expose its test debugging port",
    );
  }
  return { firstWindow: async () => browser.contexts()[0].pages()[0], close };
}

async function scene(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("excalidraw") || "[]"),
  );
}

async function waitForCount(page, count) {
  await page.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("excalidraw") || "[]").filter(
        (element) => !element.isDeleted,
      ).length === expected,
    count,
    { timeout: 15000 },
  );
}

async function exercise(profile, filename) {
  const app = await launch(profile, filename);
  const errors = [];
  try {
    if (!fromPortable) {
      assert.equal(
        await app.evaluate(({ app }) => app.isPackaged),
        !fromSource,
      );
    }
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByTestId("toolbar-rectangle").waitFor({ timeout: 15000 });
    await waitForCount(page, 3);
    assert.equal(
      (await scene(page)).find((e) => e.type === "text").text,
      "离线重开 Offline 123",
    );
    assert.notEqual(
      (await scene(page)).find((e) => e.type === "image").status,
      "error",
    );
    const offline = await page.evaluate(async () => {
      try {
        await fetch("https://example.com");
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(offline, true, "network must be blocked");
    await page.getByTestId("toolbar-rectangle").click();
    await page.mouse.move(750, 450);
    await page.mouse.down();
    await page.mouse.move(1000, 600, { steps: 8 });
    await page.mouse.up();
    await waitForCount(page, 4);
    assert.notEqual(
      (await scene(page)).find((e) => e.type === "image").status,
      "error",
    );
    await page.getByTestId("button-undo").click();
    await waitForCount(page, 3);
    await page.getByTestId("button-redo").click();
    await waitForCount(page, 4);
    await page.screenshot({ path: path.join(output, "desktop.png") });
    assert.deepEqual(errors, []);
  } catch (error) {
    const page = await app.firstWindow();
    console.error("Scene at failure:", await scene(page));
    await page.screenshot({ path: path.join(output, "failure.png") });
    throw error;
  } finally {
    await app.close();
  }
}

async function checkRestart(profile) {
  const app = await launch(profile);
  try {
    const page = await app.firstWindow();
    await waitForCount(page, 4);
    assert.equal(
      (await scene(page)).find((e) => e.type === "text").text,
      "离线重开 Offline 123",
    );
    await page.getByTestId("main-menu-trigger").click();
    assert.equal(
      await page
        .getByRole("menuitem", { name: "Excalidraw+", exact: true })
        .count(),
      0,
    );
  } finally {
    await app.close();
  }
}

async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "excalidraw-desktop-test-"),
  );
  try {
    await fs.mkdir(output, { recursive: true });
    if (fromPortable) {
      const copiedExecutable = path.join(temporary, "离线白板.exe");
      await fs.copyFile(executablePath, copiedExecutable);
      executablePath = copiedExecutable;
    }
    const imageData = (
      await fs.readFile(path.join(root, "public/favicon-32x32.png"))
    ).toString("base64");
    const filename = path.join(temporary, "离线图纸.excalidraw");
    const base = {
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: false,
    };
    await fs.writeFile(
      filename,
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "desktop-test",
        elements: [
          {
            ...base,
            id: "offline-image",
            type: "image",
            x: 650,
            y: 200,
            width: 64,
            height: 64,
            fileId: "offline-png",
            status: "saved",
            scale: [1, 1],
            crop: null,
          },
          {
            ...base,
            id: "offline-rectangle",
            type: "rectangle",
            x: 300,
            y: 200,
            width: 300,
            height: 150,
          },
          {
            ...base,
            id: "offline-text",
            type: "text",
            x: 340,
            y: 250,
            width: 260,
            height: 25,
            text: "离线重开 Offline 123",
            originalText: "离线重开 Offline 123",
            fontSize: 20,
            fontFamily: 5,
            lineHeight: 1.25,
            textAlign: "left",
            verticalAlign: "top",
            containerId: null,
            autoResize: true,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {
          "offline-png": {
            id: "offline-png",
            mimeType: "image/png",
            dataURL: "data:image/png;base64," + imageData,
            created: 1,
            lastRetrieved: 1,
          },
        },
      }),
    );
    const profile = path.join(temporary, "profile");
    await exercise(profile, filename);
    await checkRestart(profile);
    const result = {
      passed: true,
      checks: [
        fromSource
          ? "source app launch"
          : fromPortable
          ? "standalone portable EXE launch"
          : "packaged EXE launch",
        "Chinese filename import",
        "editable shapes and text",
        "embedded local image",
        "drawing",
        "undo and redo",
        "network blocked",
        "draft restored after restart",
        "online menu hidden",
      ],
    };
    await fs.writeFile(
      path.join(output, "result.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("excalidraw-desktop-test-"));
    await fs.rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

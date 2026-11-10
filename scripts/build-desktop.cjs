const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const result = spawnSync(
  process.execPath,
  [
    path.join(
      path.dirname(require.resolve("vite/package.json")),
      "bin/vite.js",
    ),
    "build",
    "--mode",
    "desktop",
  ],
  {
    cwd: path.join(root, "excalidraw-app"),
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const packaged = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--config",
    "desktop/electron-builder.yml",
    "--win",
    "portable",
    "--x64",
    "--publish",
    "never",
  ],
  { cwd: root, stdio: "inherit" },
);
if (packaged.error) throw packaged.error;
process.exit(packaged.status ?? 1);

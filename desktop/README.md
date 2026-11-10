# Windows 离线版

成品位置：`dist/windows/Excalidraw-Offline-1.0.0-win-x64.exe`。

## 使用

适用于 Windows 10/11 64 位。双击 EXE 即可启动，无需安装 Node.js 或浏览器，首次启动也不需要联网。单文件程序启动时会将内置运行环境解压到临时目录，请等待窗口出现。

- **打开图纸**：左上角菜单 → 打开，或 `Ctrl+O`。也可将 `.excalidraw` 文件拖到 EXE 图标上启动。程序运行时按 `Alt` 可显示桌面菜单，选择“文件 → 打开图纸”。
- **保存图纸**：`Ctrl+S`；首次保存选择位置。另存为请使用左上角菜单中的“保存到…”。
- **继续编辑**：重新打开 `.excalidraw` 文件。普通 PNG/SVG 是导出图片；只有在导出时勾选嵌入场景数据，才能从图片恢复可编辑图形。
- **携带和备份**：复制 EXE 和自己保存的 `.excalidraw` 文件即可。草稿、偏好和素材库自动保存在当前 Windows 用户的应用数据目录中，不会随单独复制 EXE 一起迁移。

本版阻止联网请求；本地绘图、文件保存和图片导出可离线使用。联网协作、云分享、在线素材下载、网页嵌入和 AI 服务不可用。程序未购买数字签名证书。

## 从源码重新打包

**推荐：双击项目根目录的 `一键打包.cmd`。** 脚本自动检查 Node.js、安装锁定的依赖，然后编译并打包 EXE。成功后会显示成品位置并打开输出目录；失败时保留错误提示。完整日志保存在 `logs/windows-build-*.log`。首次安装依赖、下载打包资源需要联网。

运行前请先关闭输出目录中的 Excalidraw 程序。电脑需要预先安装 Node.js 22 或更高版本，不需要预先安装 Yarn。构建过程中请等待窗口显示“打包成功”。

如需在终端中运行且不暂停、不打开目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -NoPause -NoOpenFolder
```

也可手动执行以下命令：

在项目根目录执行，需要 Node.js 22 和 Yarn 1.22.22。首次安装和构建需联网下载依赖，生成的成品使用时无需联网。

```powershell
npx --yes yarn@1.22.22 install --frozen-lockfile
npm run build:desktop
npm run test:desktop
npm run test:desktop -- --portable
```

`npm run start:desktop` 用于运行已构建的网页资源。 `dist/windows/win-unpacked/Excalidraw Offline.exe` 是目录版，必须保留整个目录； `dist/windows/Excalidraw-Offline-1.0.0-win-x64.exe` 才是可单独复制的免安装版。

`test:desktop` 检查目录版；加 `--portable` 会把单个 EXE 复制到临时目录，验证独立启动、图纸和嵌入图片导入、绘图、撤销重做、网络阻断及重启恢复草稿。

桌面入口与本地资源协议位于 `desktop/main.cjs`，桌面菜单位于 `desktop/menu.cjs`，打包配置位于 `desktop/electron-builder.yml`，离线构建变量位于 `.env.desktop`。

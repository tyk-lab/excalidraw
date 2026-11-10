const { Menu, dialog } = require("electron");

module.exports.installMenu = (mainWindow, chooseDocument) => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "文件",
        submenu: [
          { label: "打开图纸…", click: chooseDocument },
          { type: "separator" },
          { role: "quit", label: "退出" },
        ],
      },
      { label: "视图", submenu: [{ role: "togglefullscreen", label: "全屏" }] },
      {
        label: "帮助",
        submenu: [
          {
            label: "关于离线版",
            click: () =>
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "Excalidraw 离线版",
                message: "Excalidraw 离线版 1.0.0",
                detail:
                  "使用左上角菜单或 Ctrl+O 打开文件，Ctrl+S 保存图纸。\n支持 .excalidraw、PNG、SVG 及本地图形库。\n草稿自动保存在当前 Windows 用户的应用数据中；请保存 .excalidraw 文件作为正式备份。\n联网协作、云分享、在线素材和 AI 服务不可用。",
              }),
          },
        ],
      },
    ]),
  );
};

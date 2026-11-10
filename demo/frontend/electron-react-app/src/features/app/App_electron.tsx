import React, { useState, useEffect } from "react";
import "./App_electron.css";
import { Settings as ProjectSettingsUI } from "@features/settings";
import RecordEditor, { ProjectToast, useProjectWorkspace } from "@features/record";
import { ResourceManager } from "@features/resource";
import { TextToRecords } from "@features/text-to-records";
import { ProjectSettings as IProjectSettings, Record } from "@types";
import ApiService from "@services/ApiService";
import { loadSettings, saveSettings } from "@features/common/components/Settings/Settings";
import { normalizeStayFrames } from "@features/common/utils/projectSettings";
import { promptAndInstallFromFile } from "../common/updates/installFromFile";
import log from "electron-log";

function AppElectron() {
  const [activeTab, setActiveTab] = useState<
    "editor" | "resources" | "settings" | "textToRecords"
  >("editor");
  /**
   * 资源管理打开时默认停在哪个子页面。
   *
   * <p>剧情编辑页的「前往资源管理编辑动画」会把它设成 `animation-clips` 再切页，
   * 其它入口（顶部导航）保持默认的「角色」。
   */
  const [resourceTab, setResourceTab] = useState<
    "characters" | "backgrounds" | "audios" | "animation-clips"
  >("characters");
  const [appInitialized, setAppInitialized] = useState(false);
  /** 有新版本待处理（available / downloaded）：设置页 tab 上显示一个小红点 */
  const [updateReady, setUpdateReady] = useState(false);
  const [projectSettings, setProjectSettings] = useState<IProjectSettings>(() =>
    loadSettings(),
  );

  // 当前工程（记录 + 选中位置 + 关联的工程文件）由 App 层持有：
  // 切换到资源管理/设置等页面时会卸载编辑器组件，但工程内容不会丢，
  // 回到"剧情编辑"时仍是离开前的样子。详见 useProjectWorkspace.ts。
  //
  // 工程级设置（stayFrames）随工程文件往返：保存时写进 {settings} 段，
  // 导入带 settings 的工程后回填到这里（S2c-2）。旧工程没有这一段 → 保留当前值。
  const workspace = useProjectWorkspace(projectSettings.name, {
    stayFrames: projectSettings.stayFrames,
    onSettingsLoaded: (settings) =>
      setProjectSettings((prev) => ({
        ...prev,
        stayFrames: normalizeStayFrames(settings.stayFrames),
      })),
  });
  const { saveProject, importProject, newProject } = workspace;

  useEffect(() => {
    const initializeApp = async () => {
      try {
        log.info("开始应用初始化");
        try {
          await ApiService.healthCheck();
          log.info("后端连接成功");

          // 从后端数据库加载持久化设置，与本地（localStorage）设置对齐
          try {
            const backendSettings = await ApiService.getSettings();
            log.info("从后端加载设置:", backendSettings);

            // localStorage 是用户最近一次的选择，数据库只是备份：
            // 旧实现无条件用后端值覆盖本地值，只要有一次保存没能同步到后端
            // （后端没启动、请求失败等），下次启动就会被数据库里的旧路径盖回去，
            // 表现为"改过输出路径，下次打开又变回原来的"。
            const localPath = (loadSettings().outputPath || "").trim();
            const backendPath = (backendSettings?.videoOutputPath || "").trim();

            if (localPath) {
              // 本地有设置：以本地为准，并把数据库里的旧值刷新过来
              if (localPath !== backendPath) {
                ApiService.updateSettings({ videoOutputPath: localPath }).catch((err) =>
                  log.warn("把本地输出路径同步到后端失败:", err),
                );
              }
            } else if (backendPath) {
              // 本地没有（首次运行、换机器、清过缓存）：采用数据库里的备份值
              const merged = { ...loadSettings(), outputPath: backendPath };
              saveSettings(merged);
              setProjectSettings((prev) => ({ ...prev, outputPath: backendPath }));
            }
          } catch (settingsErr) {
            log.warn("加载后端设置失败，使用本地设置:", settingsErr);
          }
        } catch (error) {
          log.warn("后端连接失败，将使用模拟数据:", error);
        }

        await ApiService.initAudio();
        log.info("应用初始化完成");
        setAppInitialized(true);
      } catch (error) {
        log.error("应用初始化失败:", error);
        setAppInitialized(true);
      }
    };

    initializeApp();
  }, []);

  // 设置改动即持久化：用户改完输出路径（或其它设置）不用记得点"保存设置"，
  // 关掉软件重开还是上次改的值。
  useEffect(() => {
    saveSettings(projectSettings);
  }, [projectSettings]);

  // 输出路径变化后同步到后端数据库（防抖，避免在输入框里打字时每敲一个字符发一次请求）。
  // 数据库只是备份：即使后端没启动，localStorage 里的值也能保证下次启动不丢。
  useEffect(() => {
    const path = (projectSettings.outputPath || "").trim();
    if (!path) return;

    const timer = setTimeout(() => {
      ApiService.updateSettings({ videoOutputPath: path }).catch((err) =>
        log.warn("同步输出路径到后端失败:", err),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [projectSettings.outputPath]);

  const isElectron =
    window.navigator.userAgent.toLowerCase().indexOf("electron") > -1;

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      const handleNewProject = () => {
        // 菜单"新建项目"（Ctrl+N）：与剧情编辑页的「新建工程」按钮走同一套流程
        // （先问是否保存当前工程，然后清空剧情列表）。先把页面切回编辑器，
        // 这样确认框弹在用户马上要操作的那个页面上。
        setActiveTab("editor");
        newProject();
      };
      // 菜单"打开项目"：与"导入工程"按钮走同一套流程（载入工程文件并记住路径）
      const handleOpenProject = () => importProject();
      // 菜单"保存项目"：与 Ctrl+S / "保存工程"按钮走同一套流程。
      // 菜单项绑定了 CmdOrCtrl+S，快捷键会被菜单先截获（页面收不到 keydown），
      // 所以这里必须接上，否则在 Electron 里按 Ctrl+S 什么都不会发生。
      const handleSaveProject = () => saveProject();

      const handleExportVideo = () => console.log("导出视频");
      const handleAbout = () => {
        if (window.electronAPI.getAppVersion) {
          window.electronAPI.getAppVersion().then((version: string) => {
            alert(`LimbusCompany Plot Video Generator\n版本: ${version}`);
          });
        }
      };

      window.electronAPI.onMenuNewProject(handleNewProject);
      window.electronAPI.onMenuOpenProject(handleOpenProject);
      window.electronAPI.onMenuSaveProject(handleSaveProject);
      window.electronAPI.onMenuExportVideo(handleExportVideo);
      window.electronAPI.onMenuAbout(handleAbout);
      // 菜单"帮助 → 检查更新"：主进程已经开查了，这里只要把用户带到设置页的更新卡片
      const handleCheckUpdate = () => setActiveTab("settings");
      window.electronAPI.onMenuCheckUpdate?.(handleCheckUpdate);

      return () => {
        window.electronAPI.removeAllListeners("menu-new-project");
        window.electronAPI.removeAllListeners("menu-open-project");
        window.electronAPI.removeAllListeners("menu-save-project");
        window.electronAPI.removeAllListeners("menu-export-video");
        window.electronAPI.removeAllListeners("menu-about");
        window.electronAPI.removeAllListeners("menu-check-update");
      };
    }
    // saveProject / importProject / newProject 是稳定引用（内部用 ref 读取最新状态），
    // 这里不会因为编辑内容变化而反复解绑重绑菜单事件。
  }, [isElectron, saveProject, importProject, newProject]);

  // 有新版本时在「设置」tab 上点一个小红点：用户不进设置页就不知道有更新，
  // 而"不知道有新版本"正是这次要解决的问题本身。
  useEffect(() => {
    const api = isElectron ? window.electronAPI : undefined;
    if (!api?.onUpdateStatus) return undefined;
    let cancelled = false;
    const apply = (state: { phase?: string } | null | undefined) => {
      if (cancelled) return;
      setUpdateReady(state?.phase === "available" || state?.phase === "downloaded");
    };
    api.getUpdateState?.().then(apply).catch(() => {});
    const unsubscribe = api.onUpdateStatus(apply);
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isElectron]);

  // 把安装包拖进窗口 = 用本地安装包更新（GitHub 打不开时用户多半是手动下的包）。
  // 只接管 .exe：其它文件拖动（剧情列表内排序、文本框拖文本文件）保持原样，
  // 但所有"拖文件"都 preventDefault —— 否则 Electron 会把整个窗口导航到 file:// 那个文件。
  useEffect(() => {
    const api = isElectron ? window.electronAPI : undefined;
    if (!api?.installUpdateFromFile) return undefined;

    const isFileDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = async (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      const exePath = files
        .map((file) => api.getPathForFile(file))
        .find((filePath) => /\.exe$/i.test(filePath || ""));
      // 不认识的拖放（工程文件等）交给它们自己的入口，这里不接管
      if (!exePath) return;
      log.info("[App_electron] 拖入安装包:", exePath);
      await promptAndInstallFromFile(api, exePath);
      // 安装成功后应用会自己退出；取消或校验失败时提示已经弹过
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [isElectron]);

  const handleParsedRecords = (records: Record[]) => {
    log.info("[App_electron] 收到转换后的记录，数量:", records.length);
    log.info(
      "[App_electron] 第一条记录预览:",
      JSON.stringify(records[0], null, 2),
    );

    // 接入工程工作区：这批记录成为当前工程（尚未关联工程文件，Ctrl+S 会先让选保存位置）
    workspace.adoptParsedRecords(records);
    log.info("[App_electron] 已保存转换后的记录到当前工程");

    // 跳转到编辑器页面
    log.info("[App_electron] 准备跳转到编辑器页面");
    setActiveTab("editor");
    log.info("[App_electron] 已跳转到编辑器页面");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "editor":
        // 注意：这里以前每次渲染都会 log.info(...)，而 electron-log 的 console 传输是
        // 同步写。编辑器里每敲一个字都会触发 App 渲染 → 一次日志写入，
        // 打字越快堆得越多，输入框就表现为"跟不上手、像卡住了"。渲染函数里不要有副作用。
        return (
          <RecordEditor
            projectSettings={projectSettings}
            setProjectSettings={setProjectSettings}
            workspace={workspace}
            onOpenAnimationLibrary={() => {
              // 情绪动画的制作入口在资源管理：切页并停到「序列帧动画」子页面
              setResourceTab("animation-clips");
              setActiveTab("resources");
            }}
          />
        );
      case "resources":
        return <ResourceManager initialTab={resourceTab} />;
      case "settings":
        return (
          <ProjectSettingsUI
            projectSettings={projectSettings}
            setProjectSettings={setProjectSettings}
          />
        );
      case "textToRecords":
        return <TextToRecords onParsedRecords={handleParsedRecords} />;
      default:
        return <TextToRecords onParsedRecords={handleParsedRecords} />;
    }
  };

  if (!appInitialized) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>正在初始化应用...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="app-title">
          <h1>LimbusCompany Plot Video Generator</h1>
        </div>

        <div className="tab-navigation">

          

          <button
            className={activeTab === "editor" ? "active" : ""}
            onClick={() => setActiveTab("editor")}
          >
            🎬 剧情编辑
          </button>
          <button
            className={activeTab === "resources" ? "active" : ""}
            onClick={() => setActiveTab("resources")}
          >
            📦 资源管理
          </button>

          <button
            className={activeTab === "textToRecords" ? "active" : ""}
            onClick={() => setActiveTab("textToRecords")}
          >
            📝 文本转记录
          </button>

          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ 设置
            {updateReady && (
              <span className="tab-badge" title="有新版本可以更新">
                新
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">{renderActiveTab()}</main>

      {/* 保存/导入工程的文字提示（非弹窗），任何页面都能看到 */}
      <ProjectToast toast={workspace.toast} onDismiss={workspace.dismissToast} />
    </div>
  );
}

export default AppElectron;

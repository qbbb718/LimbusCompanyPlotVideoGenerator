import React, { useState, useEffect, useCallback, useRef } from "react";
import "./RecordEditor.css";
import ApiService from "@services/ApiService";
import { Record, ProjectSettings, Emotion, DialogueAlign } from "@types";
import RecordList from "./RecordList";
import RecordPreview from "./RecordPreview";
import PropertyTabs from "./PropertyTabs";
import TextProperties from "./properties/TextProperties";
import CharactersProperties from "./properties/CharactersProperties";
import BackgroundProperties from "./properties/BackgroundProperties";
import AudioProperties from "./properties/AudioProperties";
import GlobalProperties from "./properties/GlobalProperties";
import { generateUUID } from "./utils";
import ResizablePanel from "./ResizablePanel_updated";
import ExportSuccessDialog from "./ExportSuccessDialog";
import { ProjectWorkspace } from "./useProjectWorkspace";

interface RecordEditorProps {
  projectSettings: ProjectSettings;
  /**
   * 当前工程的工作区（记录、选中位置、文件关联与保存/导入操作）。
   * 由 App 层持有，所以切换到资源管理等页面再回来，编辑内容不会丢。
   * 详见 useProjectWorkspace.ts。
   */
  workspace: ProjectWorkspace;
}

const RecordEditor: React.FC<RecordEditorProps> = ({
  projectSettings,
  workspace,
}) => {
  const {
    records,
    setRecords,
    selectedRecordIndex,
    setSelectedRecordIndex,
    activePropertyTab,
    setActivePropertyTab,
    isLoadingProject,
    saveProject,
    importProject,
    fileName: projectFileName,
  } = workspace;

  const [topPanelHeight, setTopPanelHeight] = useState(400);

  // 视频生成进度状态
  const [videoProgress, setVideoProgress] = useState<{
    taskId: string;
    stage: number;
    current: number;
    total: number;
    message: string;
    percent: number;
    completed: boolean;
    error: boolean;
    outputPath?: string;
    elapsedMs?: number;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 视频导出成功弹窗数据（替代原来的 alert，含"打开输出文件夹"按钮与素材来源提示）
  const [exportSuccess, setExportSuccess] = useState<{
    outputPath?: string;
    elapsedMs?: number;
  } | null>(null);

  // Refs so the stable createNewRecord callback can read current visual context
  // (chars, bg, speaker) without being recreated on every state change.
  const recordsRef = useRef<Record[]>(records || []);
  recordsRef.current = records || [];
  const selectedIndexRef = useRef(selectedRecordIndex);
  selectedIndexRef.current = selectedRecordIndex;
  // 空工程只自动补一条记录，避免 StrictMode 下 effect 重跑出两条
  const autoCreatedRef = useRef(false);

  const createNewRecord = useCallback(() => {
    console.log("[RecordEditor] createNewRecord 开始执行");

    // 从当前选中的 record 继承视觉上下文（角色立绘、背景、说话人、音频指令），
    // 这样预览图立即显示角色名片与角色立绘，用户再按需修改。
    const currentRecords = recordsRef.current;
    const currentIndex = selectedIndexRef.current;
    const inherit = currentRecords.length > 0 ? currentRecords[currentIndex] : null;

    const inheritedChars = inherit?.chars ? JSON.parse(JSON.stringify(inherit.chars)) : [];
    const inheritedBg = inherit?.bg ? JSON.parse(JSON.stringify(inherit.bg)) : [];
    const inheritedAudioCommands = inherit?.audioCommands
      ? JSON.parse(JSON.stringify(inherit.audioCommands))
      : [];
    const inheritedSpeakerC = inherit?.dialogue?.speakerC
      ? JSON.parse(JSON.stringify(inherit.dialogue.speakerC))
      : [];
    const inheritedTempImages = inherit?.tempImages
      ? JSON.parse(JSON.stringify(inherit.tempImages))
      : [];

    const newRecord: Record = {
      uuid: generateUUID(),
      durationFrames: inherit?.durationFrames ?? 30,
      dialogue: {
        text: "",
        location: inherit?.dialogue?.location || "default",
        speakerC: inheritedSpeakerC,
        speakerName: inherit?.dialogue?.speakerName || "",
        faction: inherit?.dialogue?.faction || "",
        align: inherit?.dialogue?.align || DialogueAlign.LEFT,
        speed: 1,
        emotion: Emotion.NORMAL,
      },
      bg: inheritedBg,
      chars: inheritedChars,
      tempImages: inheritedTempImages,
      effects: [],
      audioCommands: inheritedAudioCommands,
      isDirty: true,
    };

    console.log("[RecordEditor] 创建新记录，UUID:", newRecord.uuid,
      "| 继承 chars:", inheritedChars.length,
      "| bg:", inheritedBg.length,
      "| audioCommands:", inheritedAudioCommands.length);

    const newRecords = [...currentRecords, newRecord];
    setRecords(newRecords);
    // 更新选中索引为最后一条
    setSelectedRecordIndex(newRecords.length - 1);
    console.log(`[RecordEditor] 新记录已添加，当前记录总数: ${newRecords.length}`);
  }, [setRecords, setSelectedRecordIndex]);

  // 工程记录由 App 层持有（useProjectWorkspace 负责首次从后端加载）。
  // 加载完成且确实没有任何记录时补一条空记录，让用户可以直接开始编辑。
  useEffect(() => {
    if (isLoadingProject) return;
    if (records && records.length === 0 && !autoCreatedRef.current) {
      autoCreatedRef.current = true;
      console.log("[RecordEditor] 工程为空，自动创建第一条记录");
      createNewRecord();
    }
  }, [isLoadingProject, records, createNewRecord]);

  const updateRecord = (index: number, updatedRecord: Record) => {
    setRecords((prev) => {
      const newRecords = [...(prev || [])];
      newRecords[index] = { ...updatedRecord, isDirty: true };
      return newRecords;
    });
  };

  const deleteRecord = (index: number) => {
    const currentRecords = recordsRef.current;
    if (currentRecords.length <= 1) {
      alert("至少需要保留一条记录");
      return;
    }

    const newRecords = currentRecords.filter((_, i) => i !== index);
    setRecords(newRecords);

    if (selectedRecordIndex >= newRecords.length) {
      setSelectedRecordIndex(newRecords.length - 1);
    }
  };

  const moveRecord = (index: number, direction: "up" | "down") => {
    const currentRecords = recordsRef.current;
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === currentRecords.length - 1)
    ) {
      return;
    }

    const newRecords = [...currentRecords];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newRecords[index], newRecords[targetIndex]] = [
      newRecords[targetIndex],
      newRecords[index],
    ];
    setRecords(newRecords);

    if (selectedRecordIndex === index) {
      setSelectedRecordIndex(targetIndex);
    } else if (selectedRecordIndex === targetIndex) {
      setSelectedRecordIndex(index);
    }
  };

  const duplicateRecord = (index: number) => {
    const currentRecords = recordsRef.current;
    const recordToDuplicate = currentRecords[index];
    const newRecord = {
      ...recordToDuplicate,
      uuid: generateUUID(),
      isDirty: true,
    };

    const newRecords = [...currentRecords];
    newRecords.splice(index + 1, 0, newRecord);
    setRecords(newRecords);
    setSelectedRecordIndex(index + 1);
  };

  const generateVideo = async (layerTypes: string[] = ["FULL"], keepTempFiles: boolean = false) => {
    const currentRecords = recordsRef.current;
    if (currentRecords.length === 0) {
      alert("没有可生成的记录");
      return;
    }

    // 传出去的是导出目录（不是文件名）：设置里选的/填的就是文件夹，
    // 目录不存在时由后端创建，视频文件名（video_<时间戳>_<分层>.mp4）也由后端生成。
    const outputPath = projectSettings.outputPath?.trim() || "./output";

    try {
      setIsGenerating(true);
      // 异步启动视频生成，立即返回 taskId
      const result = await ApiService.generateVideo(
        currentRecords,
        outputPath,
        projectSettings.videoWidth || 1920,
        projectSettings.videoHeight || 1080,
        30,
        layerTypes,
        keepTempFiles,
      );

      const taskId = result.taskId || result.outputPath; // 兼容旧格式
      if (!taskId) {
        throw new Error("未获取到任务ID");
      }

      setVideoProgress({
        taskId,
        stage: 1,
        current: 0,
        total: currentRecords.length,
        message: "视频生成已启动...",
        percent: 0,
        completed: false,
        error: false,
      });

      // 轮询进度
      const pollInterval = setInterval(async () => {
        try {
          const progress = await ApiService.getVideoProgress(taskId);
          setVideoProgress({
            taskId,
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
            message: progress.message,
            percent: progress.percent,
            completed: progress.completed,
            error: progress.error,
            outputPath: progress.outputPath,
            elapsedMs: progress.elapsedMs,
          });

          if (progress.completed || progress.error) {
            clearInterval(pollInterval);
            setIsGenerating(false);
            if (progress.completed) {
              // 用自定义弹窗展示成功信息：醒目提示素材来源，并提供打开输出文件夹的入口
              setExportSuccess({
                outputPath: progress.outputPath,
                elapsedMs: progress.elapsedMs,
              });
            } else {
              alert(`视频生成失败: ${progress.message}`);
            }
          }
        } catch (err) {
          console.error("查询进度失败:", err);
        }
      }, 1000); // 每秒轮询

      // 安全清理：最多轮询 30 分钟
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isGenerating) {
          setIsGenerating(false);
          setVideoProgress(null);
        }
      }, 30 * 60 * 1000);
    } catch (error) {
      console.error("生成视频失败:", error);
      alert("生成视频失败，请检查控制台日志");
      setIsGenerating(false);
    }
  };

  // Resizing handled by ResizablePanel; removed unused handler to avoid lint warnings.

  const isLoading = isLoadingProject || records === undefined;
  if (isLoading) return <div className="loading">加载中...</div>;

  const currentRecords = records || [];
  const selectedRecord =
    currentRecords[selectedRecordIndex] ||
    (currentRecords.length > 0 ? currentRecords[0] : null);
  if (!selectedRecord) {
    return (
      <div className="record-editor">
        <div className="editor-top">
          <div className="record-list-container">
            <div className="record-list-header">
              <div className="record-list-title">
                <h3>剧情记录</h3>
                <button
                  className="add-record-btn"
                  onClick={createNewRecord}
                  title="添加记录"
                  aria-label="添加记录"
                >
                  +
                </button>
              </div>
            </div>
            <div className="empty-state">
              <p>暂无剧情记录，请点击"+"按钮创建新记录</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderPropertyContent = () => {
    switch (activePropertyTab) {
      case "text":
        return (
          <TextProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "characters":
        return (
          <CharactersProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "background":
        return (
          <BackgroundProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "effects":
        return (
          <div className="effects-properties">
            <h4>特效设置</h4>
            <p>特效功能待实现</p>
          </div>
        );
      case "audio":
        return (
          <AudioProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "global":
        return <GlobalProperties projectSettings={projectSettings} />;
      default:
        return null;
    }
  };

  return (
    <div className="record-editor">
      <ResizablePanel
        direction="vertical"
        defaultSize={topPanelHeight}
        minSize={200}
        className="editor-top-panel"
        onResize={(size) => setTopPanelHeight(size)}
      >
        <div className="editor-top">
          <ResizablePanel
            direction="horizontal"
            defaultSize={600}
            minSize={200}
            className="preview-panel"
          >
            <RecordPreview
              selectedRecord={selectedRecord}
              videoWidth={projectSettings.videoWidth}
              videoHeight={projectSettings.videoHeight}
              records={currentRecords}
              selectedRecordIndex={selectedRecordIndex}
              setSelectedRecordIndex={setSelectedRecordIndex}
            />
          </ResizablePanel>

          <ResizablePanel
            direction="horizontal"
            defaultSize={200}
            minSize={200}
            className="properties-panel"
          >
            <div className="properties-container">
              <PropertyTabs
                activePropertyTab={activePropertyTab}
                setActivePropertyTab={setActivePropertyTab}
              />
              <div className="property-content">{renderPropertyContent()}</div>
            </div>
          </ResizablePanel>
        </div>
      </ResizablePanel>

      {isGenerating && videoProgress && (
        <div className="video-progress-bar-container">
          <div className="video-progress-bar">
            <div className="progress-header">
              <span className="progress-stage">
                {videoProgress.stage === 1 && "渲染Record视频"}
                {videoProgress.stage === 2 && "连接无声视频"}
                {videoProgress.stage === 3 && "处理音频"}
                {videoProgress.stage === 4 && "合并音视频"}
              </span>
              <span className="progress-percent">{videoProgress.percent}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${videoProgress.percent}%` }}
              />
            </div>
            <div className="progress-message">{videoProgress.message}</div>
          </div>
        </div>
      )}

      {exportSuccess && (
        <ExportSuccessDialog
          outputPath={exportSuccess.outputPath}
          elapsedMs={exportSuccess.elapsedMs}
          onClose={() => setExportSuccess(null)}
        />
      )}

      <div className="editor-bottom-panel" style={{ minHeight: "150px" }}>
        <div className="editor-bottom">
          <RecordList
            records={currentRecords}
            selectedRecordIndex={selectedRecordIndex}
            setSelectedRecordIndex={setSelectedRecordIndex}
            createNewRecord={createNewRecord}
            generateVideo={generateVideo}
            moveRecord={moveRecord}
            duplicateRecord={duplicateRecord}
            deleteRecord={deleteRecord}
            onSaveProject={saveProject}
            onImportProject={importProject}
            projectFileName={projectFileName}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordEditor;

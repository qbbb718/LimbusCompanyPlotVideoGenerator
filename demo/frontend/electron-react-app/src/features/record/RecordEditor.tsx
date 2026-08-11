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

interface RecordEditorProps {
  projectSettings: ProjectSettings;
  initialRecords?: Record[];
}

const RecordEditor: React.FC<RecordEditorProps> = ({
  projectSettings,
  initialRecords,
}) => {
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number>(0);
  const [activePropertyTab, setActivePropertyTab] = useState<
    "text" | "characters" | "background" | "effects" | "audio" | "global"
  >("text");
  const [isLoading, setIsLoading] = useState(true);
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

  // Refs so the stable createNewRecord callback can read current visual context
  // (chars, bg, speaker) without being recreated on every state change.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const selectedIndexRef = useRef(selectedRecordIndex);
  selectedIndexRef.current = selectedRecordIndex;

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

    setRecords((prev) => {
      const newRecords = prev.length > 0 ? [...prev, newRecord] : [newRecord];
      console.log(`[RecordEditor] 新记录已添加，当前记录总数: ${newRecords.length}`);

      // 更新选中索引为最后一条
      setSelectedRecordIndex(newRecords.length - 1);
      console.log(`[RecordEditor] 已设置选中记录索引为: ${newRecords.length - 1}`);

      return newRecords;
    });
  }, []);

  const fetchRecords = useCallback(async () => {
    console.log("[RecordEditor] fetchRecords 开始执行");
    try {
      setIsLoading(true);
      
      if (initialRecords && initialRecords.length > 0) {
        console.log(`[RecordEditor] 检测到 initialRecords，数量: ${initialRecords.length}`);
        console.log("[RecordEditor] initialRecords 预览:", JSON.stringify(initialRecords, null, 2));
        
        setRecords(initialRecords);
        console.log("[RecordEditor] 已设置 records 状态");
        
        setSelectedRecordIndex(0);
        console.log("[RecordEditor] 已设置选中记录索引为 0");
        
        return;
      }
      
      console.log("[RecordEditor] 未检测到 initialRecords，从后端获取记录");
      const data = await ApiService.getRecords();
      
      console.log(`[RecordEditor] 从后端获取到 ${data.length} 条记录`);
      setRecords(data);
      
      if (data.length === 0) {
        console.log("[RecordEditor] 后端返回空记录，创建新记录");
        createNewRecord();
      }
    } catch (error) {
      console.error("[RecordEditor] 获取记录失败，使用默认记录:", error);
      console.error("[RecordEditor] 错误详情:", JSON.stringify(error, null, 2));
      createNewRecord();
    } finally {
      console.log("[RecordEditor] fetchRecords 执行完成");
      setIsLoading(false);
    }
  }, [createNewRecord, initialRecords]);

  useEffect(() => {
    console.log("[RecordEditor] useEffect 触发，准备调用 fetchRecords");
    fetchRecords();
  }, [fetchRecords]);

  const updateRecord = (index: number, updatedRecord: Record) => {
    const newRecords = [...records];
    newRecords[index] = { ...updatedRecord, isDirty: true };
    setRecords(newRecords);
  };

  const deleteRecord = (index: number) => {
    if (records.length <= 1) {
      alert("至少需要保留一条记录");
      return;
    }

    const newRecords = records.filter((_, i) => i !== index);
    setRecords(newRecords);

    if (selectedRecordIndex >= newRecords.length) {
      setSelectedRecordIndex(newRecords.length - 1);
    }
  };

  const moveRecord = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === records.length - 1)
    ) {
      return;
    }

    const newRecords = [...records];
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
    const recordToDuplicate = records[index];
    const newRecord = {
      ...recordToDuplicate,
      uuid: generateUUID(),
      isDirty: true,
    };

    const newRecords = [...records];
    newRecords.splice(index + 1, 0, newRecord);
    setRecords(newRecords);
    setSelectedRecordIndex(index + 1);
  };

  const generateVideo = async (layerTypes: string[] = ["FULL"], keepTempFiles: boolean = false) => {
    if (records.length === 0) {
      alert("没有可生成的记录");
      return;
    }

    // 使用项目设置中的输出路径，如果为空则使用默认值
    const outputPath =
      projectSettings.outputPath ||
      `./output/video_${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;

    try {
      setIsGenerating(true);
      // 异步启动视频生成，立即返回 taskId
      const result = await ApiService.generateVideo(
        records,
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
        total: records.length,
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
              alert(
                `视频生成成功！\n保存路径: ${progress.outputPath}\n耗时: ${((progress.elapsedMs || 0) / 1000).toFixed(1)} 秒`,
              );
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

  const exportRecords = async () => {
    try {
      setIsLoading(true);
      const response = await ApiService.exportRecords(records);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `records_${new Date().toISOString().slice(0, 10)}.json`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      alert("导出成功！");
    } catch (error) {
      console.error("导出记录失败:", error);
      alert("导出记录失败，请检查控制台日志");
    } finally {
      setIsLoading(false);
    }
  };

  const importRecords = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsLoading(true);
      const file = event.target.files?.[0];
      if (!file) return;
      const importedRecords = await ApiService.importRecords(file);
      if (importedRecords && importedRecords.length > 0) {
        setRecords(importedRecords);
        setSelectedRecordIndex(0);
        alert(`成功导入 ${importedRecords.length} 条记录！`);
      } else {
        alert("导入的文件中没有找到有效记录");
      }
    } catch (error) {
      console.error("导入记录失败:", error);
      alert("导入记录失败，请检查文件格式和控制台日志");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  };

  // Resizing handled by ResizablePanel; removed unused handler to avoid lint warnings.

  if (isLoading) return <div className="loading">加载中...</div>;

  const selectedRecord =
    records[selectedRecordIndex] || (records.length > 0 ? records[0] : null);
  if (!selectedRecord) {
    return (
      <div className="record-editor">
        <div className="editor-top">
          <div className="record-list-container">
            <div className="record-list-header">
              <h3>剧情记录</h3>
              <div className="record-list-actions">
                <button onClick={createNewRecord}>添加记录</button>
              </div>
            </div>
            <div className="empty-state">
              <p>暂无剧情记录，请点击"添加记录"按钮创建新记录</p>
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
              records={records}
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

      <div className="editor-bottom-panel" style={{ minHeight: "150px" }}>
        <div className="editor-bottom">
          <RecordList
            records={records}
            selectedRecordIndex={selectedRecordIndex}
            setSelectedRecordIndex={setSelectedRecordIndex}
            createNewRecord={createNewRecord}
            generateVideo={generateVideo}
            moveRecord={moveRecord}
            duplicateRecord={duplicateRecord}
            deleteRecord={deleteRecord}
            exportRecords={exportRecords}
            importRecords={importRecords}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordEditor;

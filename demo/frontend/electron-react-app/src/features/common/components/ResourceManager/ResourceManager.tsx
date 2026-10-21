import React, { useState, useEffect, useCallback, useRef } from "react";
import "./ResourceManager.css";
import ApiService from "@services/ApiService";
import { BASE_URL } from "@services/ApiService";
import { MyCharacter, Background, Audio } from "@types";
import {
  downloadBlob,
  describeTransferError,
  zipFileName,
} from "@features/common/utils/resourceTransfer";
import ResourceTabs from "./ResourceTabs";
import CharactersTab from "./tabs/CharactersTab";
import BackgroundsTab from "./tabs/BackgroundsTab";
import AudiosTab from "./tabs/AudiosTab";

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "characters" | "backgrounds" | "audios"
  >("characters");
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [audios, setAudios] = useState<Audio[]>([]);
  const [selectedCharacter, setSelectedCharacter] =
    useState<MyCharacter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // ===== 页面顶部的「全部资源」导入导出 =====
  // 一次打包/恢复角色 + 背景 + 音频，换机或备份时不必分三次操作
  const allImportFileRef = useRef<HTMLInputElement>(null);
  const [isTransferringAll, setIsTransferringAll] = useState(false);

  /**
   * 拉取三类资源。
   * @param silent 静默刷新：不切换到整页"加载中"，避免导入完成后页面闪一下
   */
  const fetchResources = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }

      // 从API获取真实数据
      const [charactersData, backgroundsData, audiosData] = await Promise.all([
        ApiService.getCharacters(),
        ApiService.getBackgrounds(),
        ApiService.getAudios(),
      ]);

      setCharacters(charactersData);

      // 确保后台返回的背景路径可直接用于<img>
      const normalize = (src?: string) => {
        if (!src) return src;
        // 如果已经是完整URL或者data:, 无需处理
        if (src.startsWith("http") || src.startsWith("data:")) return src;
        // 以斜杠开头表示服务器路径
        if (src.startsWith("/")) {
          return BASE_URL + src;
        }
        // 其它相对路径也加上基础地址
        return `${BASE_URL}/${src}`;
      };
      const normalizedBackgrounds = backgroundsData.map((bg: any) => ({
        ...bg,
        thumbnailPath: normalize(bg.thumbnailPath),
        path: normalize(bg.path),
      }));
      setBackgrounds(normalizedBackgrounds);
      setAudios(audiosData);
    } catch (error) {
      console.error("获取资源失败:", error);
      // 如果API失败，使用空数组作为后备
      setCharacters([]);
      setBackgrounds([]);
      setAudios([]);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  /** 导出全部资源（角色 + 背景 + 音频） */
  const handleExportAll = async () => {
    if (isTransferringAll) return;
    setIsTransferringAll(true);
    try {
      const blob = await ApiService.exportAllResources();
      downloadBlob(blob, zipFileName("resources"));
      alert("成功导出全部资源（角色 + 背景 + 音频）");
    } catch (error) {
      console.error("导出全部资源失败:", error);
      alert(describeTransferError(error, "导出全部资源失败，请重试"));
    } finally {
      setIsTransferringAll(false);
    }
  };

  /** 导入全部资源包，完成后静默刷新三个列表 */
  const handleImportAll = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTransferringAll(true);
    try {
      const result = await ApiService.importAllResources(file);
      await fetchResources(true);
      alert(
        `成功导入资源：角色 ${result.characters} 个、背景 ${result.backgrounds} 张、音频 ${result.audios} 个`,
      );
    } catch (error) {
      console.error("导入全部资源失败:", error);
      alert(
        describeTransferError(error, "导入全部资源失败，请检查资源包是否完整"),
      );
    } finally {
      setIsTransferringAll(false);
      // 重置 input，便于再次选择同一个文件
      e.target.value = "";
    }
  };

  const openResourceFolder = (
    resourceType: "characters" | "backgrounds" | "audios",
  ) => {
    // 调用Electron主进程打开对应资源文件夹，如果不是Electron环境则提示
    if (window.electronAPI && window.electronAPI.openResourceFolder) {
      window.electronAPI
        .openResourceFolder(resourceType)
        .then((result) => {
          if (!result.success) {
            console.error("打开资源文件夹失败", result.error);
            alert(`无法打开${resourceType}文件夹: ${result.error}`);
          }
        })
        .catch((err) => {
          console.error("调用openResourceFolder出错", err);
          alert(`无法打开${resourceType}文件夹`);
        });
    } else {
      alert("当前环境不支持打开资源文件夹");
    }
  };

  const filteredCharacters = characters.filter((character) =>
    character.characterName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredBackgrounds = backgrounds.filter((background) =>
    background.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredAudios = audios.filter((audio) =>
    audio.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="resource-manager">
      {/* 页面顶部：全部资源（角色 + 背景 + 音频）一次性导入导出，便于整体迁移 */}
      <div className="resource-topbar">
        <div className="resource-topbar-info">
          <span className="resource-topbar-title">资源库</span>
          <span className="resource-topbar-hint">
            全部资源 = 角色 + 背景 + 音频，用于换机 / 备份
          </span>
        </div>
        <div className="resource-topbar-actions">
          <button
            className="btn-primary"
            onClick={handleExportAll}
            disabled={isTransferringAll}
            title="把角色、背景、音频打成一个 ZIP 导出"
          >
            {isTransferringAll ? "⏳ 处理中…" : "📦 导出全部资源"}
          </button>
          <button
            onClick={() => allImportFileRef.current?.click()}
            disabled={isTransferringAll}
            title="导入角色 + 背景 + 音频的资源包（也支持单一类型的资源包）"
          >
            📥 导入全部资源
          </button>
          <input
            type="file"
            ref={allImportFileRef}
            style={{ display: "none" }}
            accept=".zip"
            onChange={handleImportAll}
          />
        </div>
      </div>

      <ResourceTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="resource-content">
        {activeTab === "characters" && (
          <CharactersTab
            characters={filteredCharacters}
            selectedCharacter={selectedCharacter}
            setSelectedCharacter={setSelectedCharacter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setCharacters={setCharacters}
          />
        )}
        {activeTab === "backgrounds" && (
          <BackgroundsTab
            backgrounds={filteredBackgrounds}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setBackgrounds={setBackgrounds}
          />
        )}
        {activeTab === "audios" && (
          <AudiosTab
            audios={filteredAudios}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setAudios={setAudios}
          />
        )}
      </div>
    </div>
  );
};

export default ResourceManager;

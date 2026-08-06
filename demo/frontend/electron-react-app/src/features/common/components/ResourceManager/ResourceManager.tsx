import React, { useState, useEffect } from "react";
import "./ResourceManager.css";
import ApiService from "@services/ApiService";
import { BASE_URL } from "@services/ApiService";
import { MyCharacter, Background, Audio } from "@types";
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

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      setIsLoading(true);

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
      setIsLoading(false);
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

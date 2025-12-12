import React, { useState } from "react";
import { MyCharacter, Portrait } from "../../../types";
import ApiService from "../../../services/ApiService";
import { AppConfig } from "../../../config/appConfig";
import "../ResourceManager.css";
import PortraitModal from "./PortraitModal";
import CharacterDetailModal from "./CharacterDetailModal";
import CharacterAvatar from "./CharacterDetailModal/CharacterAvatar";

interface CharactersTabProps {
  characters: MyCharacter[];
  selectedCharacter: MyCharacter | null;
  setSelectedCharacter: (character: MyCharacter | null) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (
    resourceType: "characters" | "backgrounds" | "audios"
  ) => void;
  setCharacters: (characters: MyCharacter[]) => void;
}

/**
 * 角色标签页组件
 * 用于展示、添加、编辑和管理角色信息
 */
const CharactersTab: React.FC<CharactersTabProps> = ({
  characters, // 角色列表数据
  selectedCharacter, // 当前选中的角色
  setSelectedCharacter, // 设置选中角色的函数
  searchTerm,
  setSearchTerm, // 设置搜索关键词的函数
  openResourceFolder, // 打开资源文件夹的函数
  setCharacters,
}) => {
  // 控制角色详情弹窗的显示状态
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(
    null
  );
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[CharactersTab] ${message}`, data);
  };

  const handleAddCharacter = () => {
    log("添加新角色");
    // 创建一个新的角色对象
    const newCharacter: MyCharacter = {
      characterID: `char_${Date.now()}`,
      characterName: "新角色",
      height: 170,
      faction: "未设定",
      portraits: [],
      colorBg: "#4C361F",
      colorText: "#FBDB3",
      tags: [],
    };

    setCharacters([...characters, newCharacter]);
    setSelectedCharacter(newCharacter);
    setEditingCharacter(newCharacter);
    setShowCharacterModal(true);
  };

  const handleDeleteCharacter = async (
    characterId: string,
    deleteFiles: boolean
  ) => {
    try {
      log("删除角色", { characterId, deleteFiles });
      // 调用API删除角色
      await ApiService.deleteCharacter(characterId, deleteFiles);

      // 从本地状态中移除角色
      const updatedCharacters = characters.filter(
        (c) => c.characterID !== characterId
      );
      setCharacters(updatedCharacters);

      // 如果删除的是当前选中的角色，清除选中状态
      if (selectedCharacter?.characterID === characterId) {
        setSelectedCharacter(null);
      }

      log("角色删除成功", characterId);
      alert("角色删除成功");
    } catch (error) {
      console.error("删除角色失败:", error);
      log("角色删除失败", error);
      alert("删除角色失败，请重试");
    }
  };

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索角色..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder("characters")}>
          打开角色文件夹
        </button>
        <button className="btn-primary" onClick={handleAddCharacter}>
          添加角色
        </button>
      </div>

      <div className="characters-grid">
        {characters.map((character) => (
          <div
            key={character.characterID}
            className={`character-card ${
              selectedCharacter?.characterID === character.characterID
                ? "selected"
                : ""
            }`}
            onClick={() => setSelectedCharacter(character)}
            onDoubleClick={() => {
              log("双击角色", character.characterName);
              setEditingCharacter({ ...character });
              setShowCharacterModal(true);
            }}
          >
            <CharacterAvatar character={character} />
            <div className="character-info">
              <h3>{character.characterName}</h3>
              <p>阵营: {character.faction}</p>
              <p>立绘数量: {character.portraits.length}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 角色详情弹窗 */}
      {showCharacterModal && editingCharacter && (
        <CharacterDetailModal
          character={editingCharacter}
          portraits={editingCharacter.portraits}
          onDelete={handleDeleteCharacter}
          onClose={() => setShowCharacterModal(false)}
          onSave={(character) => {
            log("保存角色详情", character.characterName);
            if (
              editingCharacter?.characterID &&
              characters.find(
                (c) => c.characterID === editingCharacter.characterID
              )
            ) {
              // 更新现有角色
              setCharacters(
                characters.map((c) =>
                  c.characterID === editingCharacter.characterID ? character : c
                )
              );
              setSelectedCharacter(character);
            } else {
              // 添加新角色
              setCharacters([...characters, character]);
              setSelectedCharacter(character);
            }
            setShowCharacterModal(false);
          }}
          isNewCharacter={
            !characters.find(
              (c) => c.characterID === editingCharacter.characterID
            )
          }
        />
      )}

      {/* 立绘编辑弹窗 */}
      {showPortraitModal && selectedCharacter && (
        <PortraitModal
          characterId={selectedCharacter.characterID}
          portrait={editingPortrait}
          onClose={() => setShowPortraitModal(false)}
          onSave={(portrait) => {
            // 如果是编辑现有立绘
            if (
              editingPortrait?.portraitID &&
              selectedCharacter.portraits.find(
                (p) => p.portraitID === editingPortrait.portraitID
              )
            ) {
              // 更新现有角色
              const updatedCharacter = {
                ...selectedCharacter,
                portraits: selectedCharacter.portraits.map((p) =>
                  p.portraitID === portrait.portraitID ? portrait : p
                ),
              };
              setCharacters(
                characters.map((c) =>
                  c.characterID === selectedCharacter.characterID
                    ? updatedCharacter
                    : c
                )
              );
              setSelectedCharacter(updatedCharacter);
            } else {
              // 添加新立绘
              const updatedCharacter = {
                ...selectedCharacter,
                portraits: [...selectedCharacter.portraits, portrait],
              };
              setCharacters(
                characters.map((c) =>
                  c.characterID === selectedCharacter.characterID
                    ? updatedCharacter
                    : c
                )
              );
              setSelectedCharacter(updatedCharacter);
            }
            setShowPortraitModal(false);
            setEditingPortrait(null);
          }}
          isNewPortrait={
            !editingPortrait?.portraitID ||
            !selectedCharacter.portraits.find(
              (p) => p.portraitID === editingPortrait.portraitID
            )
          }
        />
      )}
    </div>
  );
};

export default CharactersTab;

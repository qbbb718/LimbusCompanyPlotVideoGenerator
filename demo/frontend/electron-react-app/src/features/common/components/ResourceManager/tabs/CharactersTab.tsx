import React, { useState, useRef, useEffect } from "react";
import { MyCharacter, Portrait } from "@types";
import ApiService from "@services/ApiService";
import { AppConfig } from "@root/features/common/config/appConfig";
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
    resourceType: "characters" | "backgrounds" | "audios",
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
    null,
  );
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // 导出多选状态
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 退出选择模式时清空勾选
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedExportIds(new Set());
  };

  // 全选复选框的 indeterminate（半选）状态
  useEffect(() => {
    if (selectAllRef.current) {
      const count = selectedExportIds.size;
      selectAllRef.current.indeterminate =
        count > 0 && count < characters.length;
    }
  }, [selectedExportIds, characters.length]);

  // 角色列表或搜索词变化时清除多选
  useEffect(() => {
    setSelectedExportIds(new Set());
  }, [characters.length, searchTerm]);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[CharactersTab] ${message}`, data);
  };

  /** 切换单个角色的导出勾选状态 */
  const toggleExportSelect = (characterId: string) => {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  /** 全选/取消全选（仅作用于当前可见角色） */
  const toggleSelectAll = () => {
    const allSelected = characters.every((c) => selectedExportIds.has(c.characterID));
    if (allSelected) {
      setSelectedExportIds(new Set());
    } else {
      setSelectedExportIds(new Set(characters.map((c) => c.characterID)));
    }
  };

  /** 导出角色 — 优先导出勾选的角色，无勾选时导出全部 */
  const handleExportCharacters = async () => {
    try {
      const ids = selectedExportIds.size > 0
        ? Array.from(selectedExportIds)
        : characters.map((c) => c.characterID);
      if (ids.length === 0) {
        alert("没有可导出的角色");
        return;
      }
      log("导出角色", ids);
      const blob = await ApiService.exportCharacters(ids);
      // 触发浏览器下载
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `characters_${new Date().toISOString().slice(0, 10)}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      alert(`成功导出 ${ids.length} 个角色`);
    } catch (error) {
      console.error("导出角色失败:", error);
      alert("导出角色失败，请重试");
    }
  };

  /** 导入角色 — 选择 ZIP 文件后上传 */
  const handleImportCharacters = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      log("导入角色", file.name);
      const importedChars = await ApiService.importCharacters(file);
      // 刷新列表
      const allChars = await ApiService.getCharacters();
      setCharacters(allChars);
      alert(`成功导入 ${importedChars.length} 个角色`);
    } catch (error) {
      console.error("导入角色失败:", error);
      alert("导入角色失败，请检查文件格式");
    } finally {
      // 重置 input 以便重复选择同一文件
      e.target.value = "";
    }
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
    deleteFiles: boolean,
  ) => {
    try {
      log("删除角色", { characterId, deleteFiles });
      // 调用API删除角色
      await ApiService.deleteCharacter(characterId, deleteFiles);

      // 从本地状态中移除角色
      const updatedCharacters = characters.filter(
        (c) => c.characterID !== characterId,
      );
      setCharacters(updatedCharacters);

      // 如果删除的是当前选中的角色，清除选中状态
      if (selectedCharacter?.characterID === characterId) {
        setSelectedCharacter(null);
      }

      log("角色删除成功", characterId);
    } catch (error) {
      console.error("删除角色失败:", error);
      log("角色删除失败", error);
      alert("删除角色失败，请重试");
    }
  };

  /**
   * 卡片右上角悬浮删除按钮的点击处理。
   * 整个流程只弹一个确认框，确认后连磁盘上的角色素材一起删除。
   */
  const handleDeleteCharacterFromCard = (
    e: React.MouseEvent,
    character: MyCharacter,
  ) => {
    // 阻止冒泡，避免同时触发卡片的「选中」与「双击编辑」
    e.stopPropagation();
    const confirmed = window.confirm(
      `确定删除角色「${character.characterName}」吗？\n\n将同时删除数据库记录和磁盘中的角色素材（立绘原图与缩略图）。`,
    );
    if (!confirmed) return;
    handleDeleteCharacter(character.characterID, true);
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
        {selectionMode && (
          <label className="select-all-checkbox">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={
                characters.length > 0 &&
                characters.every((c) => selectedExportIds.has(c.characterID))
              }
              onChange={toggleSelectAll}
            />
            全选
          </label>
        )}
        <button onClick={() => openResourceFolder("characters")}>
          打开角色文件夹
        </button>
        <button className="btn-primary" onClick={handleAddCharacter}>
          添加角色
        </button>
        {selectionMode ? (
          <>
            <button onClick={handleExportCharacters}>
              确认导出 ({selectedExportIds.size})
            </button>
            <button onClick={exitSelectionMode}>取消</button>
          </>
        ) : (
          <button onClick={() => setSelectionMode(true)}>选择导出</button>
        )}
        <input
          type="file"
          ref={importFileRef}
          style={{ display: "none" }}
          accept=".zip"
          onChange={handleImportCharacters}
        />
        <button onClick={() => importFileRef.current?.click()}>导入角色</button>
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
            {selectionMode && (
              <div
                className="character-card-checkbox"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedExportIds.has(character.characterID)}
                  onChange={() => toggleExportSelect(character.characterID)}
                />
              </div>
            )}
            {/* 悬浮在卡片右上角的操作按钮，与「背景」页面的卡片保持一致 */}
            <div className="card-hover-actions">
              <button
                className="card-action-btn card-delete-btn"
                title="删除角色"
                onClick={(e) => handleDeleteCharacterFromCard(e, character)}
              >
                🗑 删除
              </button>
            </div>
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
                (c) => c.characterID === editingCharacter.characterID,
              )
            ) {
              // 更新现有角色
              setCharacters(
                characters.map((c) =>
                  c.characterID === editingCharacter.characterID
                    ? character
                    : c,
                ),
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
              (c) => c.characterID === editingCharacter.characterID,
            )
          }
        />
      )}

      {/* 立绘编辑弹窗 */}
      {showPortraitModal && selectedCharacter && (
        <PortraitModal
          characterId={selectedCharacter.characterID}
          portrait={editingPortrait}
          defaultPortrait={
            selectedCharacter.portraits.length > 0
              ? selectedCharacter.portraits[0]
              : null
          }
          onClose={() => setShowPortraitModal(false)}
          onSave={(portrait) => {
            // 如果是编辑现有立绘
            if (
              editingPortrait?.portraitID &&
              selectedCharacter.portraits.find(
                (p) => p.portraitID === editingPortrait.portraitID,
              )
            ) {
              // 更新现有角色
              const updatedCharacter = {
                ...selectedCharacter,
                portraits: selectedCharacter.portraits.map((p) =>
                  p.portraitID === portrait.portraitID ? portrait : p,
                ),
              };
              setCharacters(
                characters.map((c) =>
                  c.characterID === selectedCharacter.characterID
                    ? updatedCharacter
                    : c,
                ),
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
                    : c,
                ),
              );
              setSelectedCharacter(updatedCharacter);
            }
            setShowPortraitModal(false);
            setEditingPortrait(null);
          }}
          isNewPortrait={
            !editingPortrait?.portraitID ||
            !selectedCharacter.portraits.find(
              (p) => p.portraitID === editingPortrait.portraitID,
            )
          }
        />
      )}
    </div>
  );
};

export default CharactersTab;

import React, { useState, useRef, useEffect } from "react";
import { MyCharacter, Portrait } from "@types";
import ApiService from "@services/ApiService";
import { AppConfig } from "@root/features/common/config/appConfig";
import "./CharacterModal.css";
import CharacterInfoSection from "./CharacterDetailModal/CharacterInfoSection";
import TagsSection from "./CharacterDetailModal/TagsSection";
import PortraitsSection from "./CharacterDetailModal/PortraitsSection";
import PortraitModal from "./PortraitModal";

interface CharacterDetailModalProps {
  character: MyCharacter | null;
  onClose: () => void;
  onSave: (character: MyCharacter) => void;
  onDelete?: (characterId: string, deleteFiles: boolean) => void;
  isNewCharacter: boolean;
  portraits: Portrait[];
}

/**
 * 角色详情模态框组件
 * 用于展示和编辑角色信息，包括基本信息、标签和立绘等
 */
const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onSave,
  onDelete,
  isNewCharacter,
  portraits,
}) => {
  // 编辑中的角色状态，初始化时传入角色数据或为null
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(
    character ? { ...character, portraits: character.portraits || [] } : null,
  );
  // 颜色选择器显示状态，控制文本和背景颜色选择器的显示
  const [showColorPicker, setShowColorPicker] = useState<{
    text: boolean;
    bg: boolean;
  }>({ text: false, bg: false });
  // 删除确认对话框显示状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // 是否删除相关文件的选项（默认勾选，删除角色时连同文件一并清理）
  const [deleteFiles, setDeleteFiles] = useState(true);
  // 立绘编辑模态框显示状态
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  // 当前正在编辑的立绘数据
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  // 是否正在添加新立绘
  const [isAddingNewPortrait, setIsAddingNewPortrait] = useState(false);
  // 追踪角色是否已存入后端。新角色在添加立绘前会自动保存，
  // 这样立绘上传时后端能找到对应角色，避免"角色不存在"错误。
  const [characterPersisted, setCharacterPersisted] = useState(!isNewCharacter);
  // 文件输入引用，用于触发文件选择
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 图片缓存状态，避免重复加载
  const [loadedImages, setLoadedImages] = useState<{ [key: string]: string }>(
    {},
  );

  // 追踪正在加载的图片，防止重复加载
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  // 使用useRef来持久化缓存，避免组件重新渲染时丢失
  const imageCacheRef = useRef<{ [key: string]: string }>({});

  // 只在角色ID真正变化时清空缓存
  useEffect(() => {
    const currentCharacterID = editingCharacter?.characterID;
    const previousCharacterID = imageCacheRef.current._lastCharacterID;

    if (currentCharacterID !== previousCharacterID) {
      console.log("[CharacterDetailModal] 角色ID变化，清空缓存", {
        previousCharacterID,
        currentCharacterID,
        characterName: editingCharacter?.characterName,
        previousCacheSize: Object.keys(imageCacheRef.current).length,
      });

      // 保留当前角色的缓存，只清空其他角色的缓存
      const newCache: { [key: string]: string } = {};
      Object.keys(imageCacheRef.current).forEach((key) => {
        if (key.startsWith(currentCharacterID + "_")) {
          newCache[key] = imageCacheRef.current[key];
        }
      });

      imageCacheRef.current = newCache;
      if (currentCharacterID) {
        imageCacheRef.current._lastCharacterID = currentCharacterID;
      }
      setLoadedImages(newCache);
    }
  }, [editingCharacter?.characterID]);

  const handleAddPortrait = async () => {
    if (!editingCharacter) return;

    // 新角色尚未存入后端时，先静默保存。
    // 否则 PortraitModal 上传立绘时后端会报"角色不存在"。
    // 使用局部变量持有最新角色数据，因为 setEditingCharacter 是异步的，
    // 当前函数作用域内的 editingCharacter 仍是旧值。
    let currentCharacter = editingCharacter;

    if (!characterPersisted) {
      try {
        console.log("[CharacterDetailModal] 添加立绘前自动保存新角色");
        const saved = await ApiService.addCharacter(editingCharacter);
        // 保留本地已有的立绘列表（后端返回的可能不包含）
        currentCharacter = {
          ...saved,
          portraits: editingCharacter.portraits || [],
        };
        setEditingCharacter(currentCharacter);
        setCharacterPersisted(true);
      } catch (error) {
        console.error("[CharacterDetailModal] 自动保存角色失败:", error);
        alert("保存角色失败，请先点击「保存」按钮保存角色后再添加立绘");
        return;
      }
    }

    // 获取角色的默认立绘裁剪状态
    const defaultCropState =
      currentCharacter.portraits.length > 0
        ? {
            faceX: currentCharacter.portraits[0].faceX || 0,
            faceY: currentCharacter.portraits[0].faceY || 0,
            length: currentCharacter.portraits[0].length || 100,
          }
        : {
            faceX: 0,
            faceY: 0,
            length: 100,
          };

    // 创建一个带有默认裁剪状态的空立绘对象
    const defaultPortrait: Portrait = {
      portraitID: `portrait_${Date.now()}`,
      characterID: currentCharacter.characterID,
      imagePath: "",
      portName: "",
      emotion: "NORMAL" as any,
      faceX: defaultCropState.faceX,
      faceY: defaultCropState.faceY,
      length: defaultCropState.length,
      adjX: 0,
      adjY: 0,
      thumbnailPath: "",
    };

    setEditingPortrait(defaultPortrait);
    setIsAddingNewPortrait(true);
    setShowPortraitModal(true);
    console.log("[CharacterDetailModal] 开始添加新立绘", {
      portraitId: defaultPortrait.portraitID,
      characterId: currentCharacter.characterID,
    });
  };

  const handleEditPortrait = (portrait: Portrait) => {
    setEditingPortrait(portrait);
    setIsAddingNewPortrait(false);
    setShowPortraitModal(true);
    console.log("[CharacterDetailModal] 开始编辑立绘", {
      portraitId: portrait.portraitID,
    });
  };

  const handleDeletePortrait = async (portraitId: string) => {
    if (!editingCharacter) return;

    try {
      // 调用API删除立绘
      await ApiService.deletePortrait(editingCharacter.characterID, portraitId);

      // 从本地状态中移除立绘
      setEditingCharacter({
        ...editingCharacter,
        portraits: editingCharacter.portraits.filter(
          (p) => p.portraitID !== portraitId,
        ),
      });
    } catch (error) {
      console.error("删除立绘失败:", error);
      alert("删除立绘失败，请重试");
    }
  };

  const handleSetDefaultPortrait = async (portraitId: string) => {
    if (!editingCharacter) return;

    try {
      // 调用API设置默认立绘
      await ApiService.setDefaultPortrait(
        editingCharacter.characterID,
        portraitId,
      );

      // 更新本地状态，将选中的立绘移到第一位
      const portraitIndex = editingCharacter.portraits.findIndex(
        (p) => p.portraitID === portraitId,
      );
      if (portraitIndex !== -1) {
        const newPortraits = [...editingCharacter.portraits];
        const defaultPortrait = newPortraits.splice(portraitIndex, 1)[0];
        newPortraits.unshift(defaultPortrait);

        setEditingCharacter({
          ...editingCharacter,
          portraits: newPortraits,
        });
      }
    } catch (error) {
      console.error("设置默认立绘失败:", error);
      alert("设置默认立绘失败，请重试");
    }
  };

  useEffect(() => {
    if (character) {
      setEditingCharacter({
        ...character,
        portraits: character.portraits || portraits || [],
      });
    }
  }, [character, portraits]);

  const handleSave = async () => {
    if (!editingCharacter) return;

    console.log("[CharacterDetailModal] 保存角色详情", {
      characterName: editingCharacter.characterName,
      characterID: editingCharacter.characterID,
      hasCardImagePath: !!editingCharacter.characterCardImagePath,
      cardImagePath: editingCharacter.characterCardImagePath,
      portraitsCount: editingCharacter.portraits?.length || 0,
      portraitIds: editingCharacter.portraits?.map((p) => p.portraitID) || [],
    });

    try {
      let savedCharacter;
      if (!characterPersisted) {
        // 角色尚未存入后端（首次保存）
        savedCharacter = await ApiService.addCharacter(editingCharacter);
      } else {
        // 角色已存入后端（可能是添加立绘时自动保存的），执行更新
        savedCharacter = await ApiService.updateCharacter(
          editingCharacter.characterID,
          editingCharacter,
        );
      }

      // 确保调用onSave更新父组件状态
      onSave(savedCharacter);
      onClose();
    } catch (error) {
      console.error("保存角色失败:", error);
      alert("保存角色失败，请重试");
    }
  };

  const handleDeleteCharacter = () => {
    if (!editingCharacter || !onDelete) return;

    onDelete(editingCharacter.characterID, deleteFiles);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleToggleColorPicker = (type: "text" | "bg") => {
    setShowColorPicker((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // 取消/关闭弹窗时的处理。
  // 如果新角色因添加立绘已自动保存到后端，取消时也要同步父组件状态，
  // 否则角色已存入数据库但角色列表不显示，用户会以为角色丢失了。
  const handleClose = () => {
    if (characterPersisted && isNewCharacter && editingCharacter) {
      onSave(editingCharacter);
    }
    onClose();
  };

  if (!editingCharacter) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            {isNewCharacter
              ? "添加新角色"
              : `编辑角色: ${editingCharacter.characterName}`}
          </h2>
          <div className="header-actions">
            <button className="btn-primary" onClick={handleSave}>
              保存
            </button>
            <button className="btn-secondary" onClick={handleClose}>
              取消
            </button>
            {!isNewCharacter && (
              <button
                className="btn-danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                删除角色
              </button>
            )}
            <button className="close-button" onClick={handleClose}>
              ×
            </button>
          </div>
        </div>

        <CharacterInfoSection
          character={editingCharacter}
          onCharacterUpdate={setEditingCharacter}
          showColorPicker={showColorPicker}
          onToggleColorPicker={handleToggleColorPicker}
        />

        <TagsSection
          character={editingCharacter}
          onCharacterUpdate={setEditingCharacter}
        />

        <PortraitsSection
          character={editingCharacter}
          onAddPortrait={handleAddPortrait}
          onEditPortrait={handleEditPortrait}
          onDeletePortrait={handleDeletePortrait}
          onSetDefaultPortrait={handleSetDefaultPortrait}
        />
      </div>

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <h3>确认删除</h3>
            <p>确定要删除角色 "{editingCharacter.characterName}" 吗？</p>
            <div className="checkbox-container">
              <label>
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                />
                同时删除相关文件
              </label>
            </div>
            <div className="dialog-actions">
              <button className="btn-danger" onClick={handleDeleteCharacter}>
                确认删除
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 立绘编辑弹窗 */}
      {showPortraitModal && editingCharacter && (
        <PortraitModal
          characterId={editingCharacter.characterID}
          portrait={editingPortrait}
          defaultPortrait={
            editingCharacter.portraits.length > 0
              ? editingCharacter.portraits[0]
              : null
          }
          isNewPortrait={isAddingNewPortrait}
          onClose={() => {
            setShowPortraitModal(false);
            setEditingPortrait(null);
            setIsAddingNewPortrait(false);
          }}
          onSave={(portrait) => {
            // 使用isAddingNewPortrait标志来判断是添加还是更新
            if (!isAddingNewPortrait) {
              // 更新现有立绘
              setEditingCharacter((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  portraits:
                    prev.portraits?.map((p) =>
                      p.portraitID === portrait.portraitID ? portrait : p,
                    ) || [],
                };
              });
              console.log("[CharacterDetailModal] 更新立绘", {
                portraitId: portrait.portraitID,
              });
            } else {
              // 添加新立绘
              setEditingCharacter((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  portraits: [...(prev.portraits || []), portrait],
                };
              });
              console.log("[CharacterDetailModal] 添加新立绘", {
                portraitId: portrait.portraitID,
                totalPortraits: (editingCharacter?.portraits?.length || 0) + 1,
              });
            }
            setShowPortraitModal(false);
            setEditingPortrait(null);
            setIsAddingNewPortrait(false);
          }}
        />
      )}
    </div>
  );
};

export default CharacterDetailModal;

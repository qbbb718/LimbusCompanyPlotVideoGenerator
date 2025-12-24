
import { useState, useEffect } from 'react';
import { Portrait, Emotion } from '../../../../../types';
import { mapEmotion, getStandardEmotions } from '../../../../../utils/emotionMapper';
import { loadImageAsBase64 } from '../utils/imageUtils';
import createLogger from '../utils/logger';

const log = createLogger('usePortraitState');

interface UsePortraitStateProps {
  characterId: string;
  portrait: Portrait | null;
  isNewPortrait: boolean;
}

export const usePortraitState = ({ characterId, portrait, isNewPortrait }: UsePortraitStateProps) => {
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(portrait);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [emotionInput, setEmotionInput] = useState<string>('');

  // 当portrait变化时，更新状态
  useEffect(() => {
    if (portrait) {
      log('加载立绘', portrait.portName);
      setEditingPortrait({ ...portrait });

      // 设置情绪输入框的值为标准情绪对应的显示名称
      const emotionNames = getStandardEmotions();
      setEmotionInput(emotionNames[portrait.emotion] || portrait.emotion);

      // 如果有图片路径，加载图片预览
      if (portrait.imagePath) {
        loadPortraitImage(portrait.imagePath);
      }
    }
  }, [portrait]);

  // 加载立绘图片
  const loadPortraitImage = async (imagePath: string) => {
    try {
      // 检查是否是相对路径（后端资源）
      if (!imagePath.startsWith('http') && !imagePath.startsWith('data:')) {
        // 在Electron环境中，使用file协议加载本地文件
        if (window.electronAPI) {
          // 使用Electron API读取文件并转换为data URL
          // 直接使用HTTP URL加载图片
          const imageUrl = `http://localhost:8080/assets/characters/${imagePath}`;
          log('使用HTTP URL加载图片', { imageUrl });
          setPortraitPreview(imageUrl);
          return;
          
          // 定义可能的路径数组
          const possiblePaths = [
            imagePath,
            `./assets/characters/${imagePath}`,
            `/assets/characters/${imagePath}`
          ];
          let fullImagePath = possiblePaths[0];

          // 尝试从多个可能的路径加载图片
          let loadedSuccessfully = false;

          for (const path of possiblePaths) {
            try {
              fullImagePath = path;
              const dataUrl = await loadImageAsBase64(fullImagePath);
              log('图片路径转换', { from: imagePath, to: 'data URL', usedPath: fullImagePath });
              setPortraitPreview(dataUrl);
              loadedSuccessfully = true;
              break;
            } catch (error) {
              log(`尝试路径失败: ${path}`, error);
            }
          }

          if (!loadedSuccessfully) {
            log('所有路径都失败，回退到HTTP URL');
            // 如果所有路径都失败，尝试使用HTTP URL
            const imageUrl = `http://localhost:8080/assets/characters/${imagePath}`;
            log('回退到HTTP URL', imageUrl);
            setPortraitPreview(imageUrl);
          }
        } else {
          // 非Electron环境，使用HTTP URL
          const imageUrl = `http://localhost:8080/assets/characters/${imagePath}`;
          log('图片路径转换', { from: imagePath, to: imageUrl });
          setPortraitPreview(imageUrl);
        }
      } else {
        // 如果是绝对路径或data URL，直接使用
        log('直接使用图片路径', imagePath);
        setPortraitPreview(imagePath);
      }
    } catch (error) {
      log('加载立绘图片失败', error);
    }
  };

  // 创建新的立绘对象
  const createNewPortrait = (imagePath: string, fileName: string, defaultCropState?: {faceX: number, faceY: number, length: number}): Portrait => {
    const portraitId = `portrait_${Date.now()}`;

    return {
      portraitID: portraitId,
      characterID: characterId,
      imagePath: imagePath,
      portName: fileName,
      emotion: Emotion.NORMAL,
      faceX: defaultCropState?.faceX || 0,
      faceY: defaultCropState?.faceY || 0,
      length: defaultCropState?.length || 100,
      adjX: 0,
      adjY: 0,
      thumbnailPath: ''
    };
  };

  // 更新情绪
  const updateEmotion = (emotionInput: string) => {
    if (!editingPortrait) return;

    const standardEmotion = mapEmotion(emotionInput);
    setEditingPortrait({
      ...editingPortrait,
      emotion: standardEmotion as unknown as Emotion
    });
  };

  // 如果是添加新立绘且 editingPortrait 为 null，创建一个默认的空对象
  const currentPortrait = editingPortrait || {
    portraitID: '',
    characterID: characterId,
    imagePath: '',
    portName: '',
    emotion: Emotion.NORMAL,
    faceX: 0,
    faceY: 0,
    length: 100,
    adjX: 0,
    adjY: 0,
    thumbnailPath: ''
  };

  return {
    editingPortrait,
    setEditingPortrait,
    portraitPreview,
    setPortraitPreview,
    emotionInput,
    setEmotionInput,
    currentPortrait,
    createNewPortrait,
    updateEmotion,
    loadPortraitImage
  };
};

export default usePortraitState;


import { useState, useEffect } from 'react';
import { Portrait, Emotion } from '@types';
import createLogger from '../utils/logger';
import { buildPortraitImageUrl } from '@features/common/utils/portraitUtils';

const log = createLogger('usePortraitState');

interface UsePortraitStateProps {
  characterId: string;
  portrait: Portrait | null;
  isNewPortrait: boolean;
}

export const usePortraitState = ({ characterId, portrait, isNewPortrait }: UsePortraitStateProps) => {
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(portrait);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);

  // 当portrait变化时，更新状态
  useEffect(() => {
    if (portrait) {
      log('加载立绘', portrait.portName);
      setEditingPortrait({ ...portrait });

      // 如果有图片路径，加载图片预览
      if (portrait.imagePath) {
        loadPortraitImage(portrait.imagePath);
      }
    }
  }, [portrait]);

  // 加载立绘图片
  const loadPortraitImage = async (imagePath: string) => {
    try {
      // 相对路径（后端资源）统一走 buildPortraitImageUrl 拼 URL
      const imageUrl = buildPortraitImageUrl(imagePath);
      log('加载立绘图片', { imagePath, imageUrl });
      setPortraitPreview(imageUrl);
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
    currentPortrait,
    createNewPortrait,
    loadPortraitImage
  };
};

export default usePortraitState;

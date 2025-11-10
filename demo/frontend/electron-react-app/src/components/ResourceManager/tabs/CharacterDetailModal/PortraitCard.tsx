import React from 'react';
import { Portrait } from '../../../../types';
import PortraitThumbnail from './PortraitThumbnail';

interface PortraitCardProps {
  portrait: Portrait;
  characterId: string;
  isDefault: boolean;
  onEdit: (portrait: Portrait) => void;
  onSetDefault: (portraitId: string) => void;
  onDelete: (portraitId: string) => void;
}

const PortraitCard: React.FC<PortraitCardProps> = ({
  portrait,
  characterId,
  isDefault,
  onEdit,
  onSetDefault,
  onDelete
}) => {
  const handleImageError = (portraitId: string, error: any) => {
    console.error('[PortraitCard] 缩略图加载失败', {
      portraitId,
      error
    });
  };

  const handleImageLoad = (portraitId: string, url: string) => {
    console.log('[PortraitCard] 缩略图加载成功', {
      portraitId,
      url
    });
  };

  return (
    <div className="portrait-card">
      <div className="portrait-thumbnail">
        <PortraitThumbnail
          portrait={portrait}
          characterId={characterId}
          onLoadComplete={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      <div className="portrait-info">
        <h4>{portrait.portName}</h4>
        <p>情绪: {portrait.emotion}</p>
        {isDefault && (
          <p className="default-portrait-indicator">默认立绘</p>
        )}
        <div className="portrait-actions">
          <button className="btn-primary" onClick={() => onEdit(portrait)}>编辑</button>
          {!isDefault && (
            <button className="btn-secondary" onClick={() => onSetDefault(portrait.portraitID)}>设为默认</button>
          )}
          <button className="btn-danger" onClick={() => onDelete(portrait.portraitID)}>删除</button>
        </div>
      </div>
    </div>
  );
};

export default PortraitCard;

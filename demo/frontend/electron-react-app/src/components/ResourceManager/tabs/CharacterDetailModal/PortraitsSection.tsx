import React from 'react';
import { MyCharacter, Portrait } from '../../../../types';
import PortraitCard from './PortraitCard';

interface PortraitsSectionProps {
  character: MyCharacter;
  onEditPortrait: (portrait: Portrait) => void;
  onSetDefaultPortrait: (portraitId: string) => void;
  onDeletePortrait: (portraitId: string) => void;
  onAddPortrait: () => void;
}

const PortraitsSection: React.FC<PortraitsSectionProps> = ({
  character,
  onEditPortrait,
  onSetDefaultPortrait,
  onDeletePortrait,
  onAddPortrait
}) => {
  const isDefaultPortrait = (portraitId: string) => {
    return character.portraits?.length > 0 && character.portraits[0].portraitID === portraitId;
  };

  return (
    <div className="portraits-section">
      <div className="section-header">
        <h3>立绘列表</h3>
        <button className="btn-primary" onClick={onAddPortrait}>添加立绘</button>
      </div>

      <div className="portraits-grid">
        {character.portraits?.map(portrait => (
          <PortraitCard
            key={portrait.portraitID}
            portrait={portrait}
            characterId={character.characterID}
            isDefault={isDefaultPortrait(portrait.portraitID)}
            onEdit={onEditPortrait}
            onSetDefault={onSetDefaultPortrait}
            onDelete={onDeletePortrait}
          />
        ))}
      </div>
    </div>
  );
};

export default PortraitsSection;

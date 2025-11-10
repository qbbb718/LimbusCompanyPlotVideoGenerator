import React from 'react';
import { MyCharacter } from '../../../../types';
import ColorPicker from './ColorPicker';
import NamePreview from './NamePreview';

interface CharacterInfoSectionProps {
  character: MyCharacter;
  onCharacterUpdate: (character: MyCharacter) => void;
  showColorPicker: { text: boolean, bg: boolean };
  onToggleColorPicker: (type: 'text' | 'bg') => void;
}

const CharacterInfoSection: React.FC<CharacterInfoSectionProps> = ({
  character,
  onCharacterUpdate,
  showColorPicker,
  onToggleColorPicker
}) => {
  const handleColorChange = (type: 'text' | 'bg', color: string) => {
    if (type === 'text') {
      onCharacterUpdate({ ...character, colorText: color });
    } else {
      onCharacterUpdate({ ...character, colorBg: color });
    }
  };

  return (
    <div className="character-info-section">
      <div className="info-grid">
        <div className="info-item">
          <label>角色名称</label>
          <input
            type="text"
            value={character.characterName}
            onChange={(e) => onCharacterUpdate({ ...character, characterName: e.target.value })}
          />
        </div>

        <div className="info-item">
          <label>阵营</label>
          <input
            type="text"
            value={character.faction}
            onChange={(e) => onCharacterUpdate({ ...character, faction: e.target.value })}
          />
        </div>

        <div className="info-item">
          <label>身高</label>
          <input
            type="number"
            value={character.height}
            onChange={(e) => onCharacterUpdate({ ...character, height: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="info-grid">
        <ColorPicker
          label="名片文字颜色"
          color={character.colorText}
          onChange={(color) => handleColorChange('text', color)}
          showPicker={showColorPicker.text}
          onTogglePicker={() => onToggleColorPicker('text')}
        />

        <ColorPicker
          label="名片背景颜色"
          color={character.colorBg}
          onChange={(color) => handleColorChange('bg', color)}
          showPicker={showColorPicker.bg}
          onTogglePicker={() => onToggleColorPicker('bg')}
        />
      </div>

      <div className="preview-section">
        <label>名片预览</label>
        <div className="name-preview-container">
          <NamePreview character={character} />
        </div>
      </div>
    </div>
  );
};

export default CharacterInfoSection;

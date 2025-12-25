
import React, { useState, useEffect } from 'react';
import { Record, Background, BackgroundVisual } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../RecordEditor.css';
import './BackgroundProperties.css';

interface BackgroundPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const BackgroundProperties: React.FC<BackgroundPropertiesProps> = ({ 
  selectedRecord, 
  selectedRecordIndex, 
  updateRecord 
}) => {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [showSelector, setShowSelector] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBackground, setSelectedBackground] = useState<Background | null>(null);
  const [filteredBackgrounds, setFilteredBackgrounds] = useState<Background[]>([]);

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  useEffect(() => {
    // 根据搜索词过滤背景
    if (searchTerm.trim() === '') {
      setFilteredBackgrounds(backgrounds);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = backgrounds.filter((bg: Background) => 
        bg.name.toLowerCase().includes(term) || 
        bg.path.toLowerCase().includes(term)
      );
      setFilteredBackgrounds(filtered);
    }
  }, [searchTerm, backgrounds]);

  const fetchBackgrounds = async () => {
    try {
      // 尝试从API获取数据
      const data = await ApiService.getBackgrounds();
      setBackgrounds(data);
      setFilteredBackgrounds(data);
    } catch (error) {
      console.error('获取背景列表失败，使用模拟数据:', error);
      // 使用模拟数据
      const mockBackgrounds: Background[] = [
        {
          uuid: "bg001",
          name: "办公室",
          path: "/images/backgrounds/office.png",
          tags: ["室内", "工作"]
        },
        {
          uuid: "bg002",
          name: "街道",
          path: "/images/backgrounds/street.png",
          tags: ["室外", "城市"]
        },
        {
          uuid: "bg003",
          name: "图书馆",
          path: "/images/backgrounds/library.png",
          tags: ["室内", "安静"]
        }
      ];
      setBackgrounds(mockBackgrounds);
      setFilteredBackgrounds(mockBackgrounds);
    }
  };

  const addBackground = () => {
    if (!selectedBackground) {
      alert('请选择背景');
      return;
    }

    const newBackground: BackgroundVisual = {
      background: selectedBackground,
      posX: 0,
      posY: 0,
      scale: 1,
      visible: true
    };

    const updatedBgs = [...selectedRecord.bg, newBackground];
    const updatedRecord = {
      ...selectedRecord,
      bg: updatedBgs
    };
    updateRecord(selectedRecordIndex, updatedRecord);

    // 重置表单
    setSelectedBackground(null);
    setShowSelector(false);
  };
  const updateBackground = (index: number, field: string, value: any) => {
    const updatedBgs = [...selectedRecord.bg];
    updatedBgs[index] = {
      ...updatedBgs[index],
      [field]: value
    };

    const updatedRecord = {
      ...selectedRecord,
      bg: updatedBgs
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteBackground = (index: number) => {
    const updatedBgs = selectedRecord.bg.filter((_, i) => i !== index);
    const updatedRecord = {
      ...selectedRecord,
      bg: updatedBgs
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <>
      <div className="background-properties">
        <h4>背景设置</h4>
        <div className="backgrounds-list">
          {selectedRecord.bg.map((bg, index) => (
            <div key={index} className="background-item">
              <div className="background-header">
                <h5>{bg.background.name}</h5>
                <button onClick={() => deleteBackground(index)}>删除</button>
              </div>

              <div className="background-details" style={{ padding: '10px' }}>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>X坐标</label>
                  <input
                    type="number"
                    value={bg.posX}
                    onChange={(e) => updateBackground(index, 'posX', parseInt(e.target.value))}
                    style={{ padding: '6px 8px', width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Y坐标</label>
                  <input
                    type="number"
                    value={bg.posY}
                    onChange={(e) => updateBackground(index, 'posY', parseInt(e.target.value))}
                    style={{ padding: '6px 8px', width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>缩放</label>
                  <input
                    type="number"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={bg.scale}
                    onChange={(e) => updateBackground(index, 'scale', parseFloat(e.target.value))}
                    style={{ padding: '6px 8px', width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', padding: '6px 0' }}>
                    <span style={{ marginRight: '8px' }}>可见</span>
                    <input
                      type="checkbox"
                      checked={bg.visible}
                      onChange={(e) => updateBackground(index, 'visible', e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}

          <button
            className="add-background-btn"
            onClick={() => setShowSelector(true)}
          >
            添加背景
          </button>
        </div>
      </div>

      {/* 背景选择对话框 */}
      {showSelector && (
        <div className="background-selector">
          <div className="background-selector-content">
            <div className="background-selector-header">
              <h3>选择背景</h3>
              <button className="cancel-btn" onClick={() => setShowSelector(false)}>
                取消
              </button>
            </div>
            
            <div className="background-selector-body">
              <div className="background-search">
                <input
                  type="text"
                  placeholder="搜索背景名称或文件路径..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="background-grid">
                {filteredBackgrounds.map((bg: Background) => (
                  <div
                    key={bg.uuid}
                    className={`background-item ${selectedBackground?.uuid === bg.uuid ? 'selected' : ''}`}
                    onClick={() => setSelectedBackground(bg)}
                  >
                    <div className="background-thumbnail">
                      {/* 这里应该显示背景缩略图 */}
                      背景图片
                    </div>
                    <div className="background-name">{bg.name}</div>
                    <div className="background-path">{bg.path}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="background-selector-footer">
              <button
                className="confirm-btn"
                onClick={addBackground}
                disabled={!selectedBackground}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BackgroundProperties;

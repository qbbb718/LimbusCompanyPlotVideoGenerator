
import React, { useState, useEffect } from 'react';
import './RecordEditor.css';
import ApiService from '../../services/ApiService';
import { Record, ProjectSettings, CharacterVisual, BackgroundVisual, Dialogue, Emotion, DialogueAlign } from '../../types';
import RecordList from './RecordList';
import RecordPreview from './RecordPreview';
import PropertyTabs from './PropertyTabs';
import TextProperties from './properties/TextProperties';
import CharactersProperties from './properties/CharactersProperties';
import BackgroundProperties from './properties/BackgroundProperties';
import AudioProperties from './properties/AudioProperties';
import GlobalProperties from './properties/GlobalProperties';
import { generateUUID } from './utils';
import ResizablePanel from './ResizablePanel_updated';

interface RecordEditorProps {
  projectSettings: ProjectSettings;
}

const RecordEditor: React.FC<RecordEditorProps> = ({ projectSettings }) => {
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number>(0);
  const [activePropertyTab, setActivePropertyTab] = useState<'text' | 'characters' | 'background' | 'effects' | 'audio' | 'global'>('text');
  const [isLoading, setIsLoading] = useState(true);
  const [topPanelHeight, setTopPanelHeight] = useState(400);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const data = await ApiService.getRecords();
      setRecords(data);
      if (data.length === 0) {
        // 如果没有记录，创建一个默认记录
        createNewRecord();
      }
    } catch (error) {
      console.error('获取记录失败，使用默认记录:', error);
      // 即使获取失败也创建一个默认记录
      createNewRecord();
    } finally {
      setIsLoading(false);
    }
  };

  const createNewRecord = () => {
    const newRecord: Record = {
      uuid: generateUUID(),
      durationFrames: 30, // 默认1秒，假设30fps
      dialogue: {
        text: '',
        location: 'default',
        speakerC: [],
        speakerName: '',
        faction: '',
        align: DialogueAlign.LEFT,
        speed: 1,
        emotion: Emotion.NORMAL
      },
      bg: [],
      chars: [],
      effects: [],
      audioCommands: [],
      isDirty: true
    };

    const newRecords = records.length > 0 ? [...records, newRecord] : [newRecord];
    setRecords(newRecords);
    setSelectedRecordIndex(newRecords.length - 1);
  };

  const updateRecord = (index: number, updatedRecord: Record) => {
    const newRecords = [...records];
    newRecords[index] = { ...updatedRecord, isDirty: true };
    setRecords(newRecords);

    // 可以在这里添加自动保存逻辑
    // saveRecordToBackend(updatedRecord);
  };

  const deleteRecord = (index: number) => {
    if (records.length <= 1) {
      alert('至少需要保留一条记录');
      return;
    }

    const newRecords = records.filter((_, i) => i !== index);
    setRecords(newRecords);

    if (selectedRecordIndex >= newRecords.length) {
      setSelectedRecordIndex(newRecords.length - 1);
    }
  };

  const moveRecord = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) ||
        (direction === 'down' && index === records.length - 1)) {
      return;
    }

    const newRecords = [...records];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // 交换位置
    [newRecords[index], newRecords[targetIndex]] = [newRecords[targetIndex], newRecords[index]];
    setRecords(newRecords);

    if (selectedRecordIndex === index) {
      setSelectedRecordIndex(targetIndex);
    } else if (selectedRecordIndex === targetIndex) {
      setSelectedRecordIndex(index);
    }
  };

  const duplicateRecord = (index: number) => {
    const recordToDuplicate = records[index];
    const newRecord = {
      ...recordToDuplicate,
      uuid: generateUUID(),
      isDirty: true
    };

    const newRecords = [...records];
    newRecords.splice(index + 1, 0, newRecord);
    setRecords(newRecords);
    setSelectedRecordIndex(index + 1);
  };

  const generateVideo = async () => {
    try {
      setIsLoading(true);
      const result = await ApiService.generateVideo(records);
      alert(`视频生成成功！保存路径: ${result.outputPath}`);
    } catch (error) {
      console.error('生成视频失败:', error);
      alert('视频生成失败，请检查控制台日志');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理垂直方向拖拽
  const handleVerticalResize = (e: React.MouseEvent) => {
    e.preventDefault();

    const startY = e.clientY;
    const startHeight = topPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = startHeight + deltaY;

      // 限制最小和最大高度
      if (newHeight >= 200 && newHeight <= window.innerHeight - 200) {
        setTopPanelHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  // 确保有选中的记录，如果没有则创建一个默认的
  const selectedRecord = records[selectedRecordIndex] || (records.length > 0 ? records[0] : null);

  // 如果仍然没有记录，则显示一个空状态
  if (!selectedRecord) {
    return (
      <div className="record-editor">
        <div className="editor-top">
          <div className="record-list-container">
            <div className="record-list-header">
              <h3>剧情记录</h3>
              <div className="record-list-actions">
                <button onClick={createNewRecord}>添加记录</button>
              </div>
            </div>
            <div className="empty-state">
              <p>暂无剧情记录，请点击"添加记录"按钮创建新记录</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderPropertyContent = () => {
    switch (activePropertyTab) {
      case 'text':
        return <TextProperties
                 selectedRecord={selectedRecord}
                 selectedRecordIndex={selectedRecordIndex}
                 updateRecord={updateRecord}
               />;
      case 'characters':
        return <CharactersProperties
                 selectedRecord={selectedRecord}
                 selectedRecordIndex={selectedRecordIndex}
                 updateRecord={updateRecord}
               />;
      case 'background':
        return <BackgroundProperties
                 selectedRecord={selectedRecord}
                 selectedRecordIndex={selectedRecordIndex}
                 updateRecord={updateRecord}
               />;
      case 'effects':
        return <div className="effects-properties">
                 <h4>特效设置</h4>
                 <p>特效功能待实现</p>
               </div>;
      case 'audio':
        return <AudioProperties
                 selectedRecord={selectedRecord}
                 selectedRecordIndex={selectedRecordIndex}
                 updateRecord={updateRecord}
               />;
      case 'global':
        return <GlobalProperties
                 projectSettings={projectSettings}
               />;
      default:
        return null;
    }
  };

  return (
    <div className="record-editor">
      <ResizablePanel 
        direction="vertical" 
        defaultSize={topPanelHeight} 
        minSize={200}
        className="editor-top-panel"
        onResize={(size) => setTopPanelHeight(size)}
      >
        <div className="editor-top">
          <ResizablePanel 
            direction="horizontal" 
            defaultSize={400} 
            minSize={300}
            className="preview-panel"
          >
            <RecordPreview selectedRecord={selectedRecord} />
          </ResizablePanel>

          <ResizablePanel 
            direction="horizontal" 
            defaultSize={400} 
            minSize={300}
            className="properties-panel"
          >
            <div className="properties-container">
              <PropertyTabs
                activePropertyTab={activePropertyTab}
                setActivePropertyTab={setActivePropertyTab}
              />

              <div className="property-content">
                {renderPropertyContent()}
              </div>
            </div>
          </ResizablePanel>
        </div>
      </ResizablePanel>

      <div className="editor-bottom-panel" style={{ minHeight: "150px" }}>
        <div className="editor-bottom">
          <RecordList
            records={records}
            selectedRecordIndex={selectedRecordIndex}
            setSelectedRecordIndex={setSelectedRecordIndex}
            createNewRecord={createNewRecord}
            generateVideo={generateVideo}
            moveRecord={moveRecord}
            duplicateRecord={duplicateRecord}
            deleteRecord={deleteRecord}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordEditor;

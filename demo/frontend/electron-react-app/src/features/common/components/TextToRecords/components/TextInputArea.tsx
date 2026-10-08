
import React from 'react';
import '../TextToRecords.css';

interface TextInputAreaProps {
  inputText: string;
  handleTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFileDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
}

const TextInputArea: React.FC<TextInputAreaProps> = ({ 
  inputText, 
  handleTextChange, 
  handleFileDrop, 
  handleDragOver 
}) => {
  return (
    <div
      className="text-input-area"
      onDrop={handleFileDrop}
      onDragOver={handleDragOver}
    >
      <textarea
        value={inputText}
        onChange={handleTextChange}
        placeholder="[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)<位置>
旁白: 对话内容

BGM名称与图片名称会使用搜索匹配BGM库中的名称/文件名
情绪用于设置立绘
<位置>：角色在画面中横向的位置，用百分比填写，0% 最左，50% 画面中间，100% 最右。不写则默认居中。
当设置新BGM时, 之前的BGM会自动停止
[-STOP]可以停止当前BGM"
        rows={15}
      />
    </div>
  );
};

export default TextInputArea;


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
        placeholder="在此输入文本内容，或将文本文件拖入此处..."
        rows={15}
      />
    </div>
  );
};

export default TextInputArea;

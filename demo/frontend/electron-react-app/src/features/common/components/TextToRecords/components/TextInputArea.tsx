import React from "react";
import "../TextToRecords.css";

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
  handleDragOver,
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
        placeholder="示例：
[巴士内部BGM]
{不xx就出不去的房间}
格里高尔: ……(ANGRY)<70%>
[-STOP]
旁白: 诶呀。"
      />
    </div>
  );
};

export default TextInputArea;

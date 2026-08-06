import React, { useState } from "react";
import "./TextToRecords.css";
import ApiService from "@services/ApiService";

const TextToRecords: React.FC = () => {
  const [inputText, setInputText] = useState(``);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target) {
          setInputText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    } else {
      alert("请拖入文本文件");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleConvert = async () => {
    if (!inputText.trim()) {
      alert("请输入文本内容");
      return;
    }

    try {
      setIsProcessing(true);
      const records = await ApiService.textToRecords(inputText);
      setResult(`成功转换文本，生成了 ${records.length} 条记录`);
    } catch (error) {
      console.error("文本转换失败:", error);
      setResult("文本转换失败，请检查控制台日志");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText("");
    setResult("");
  };

  return (
    <div className="text-to-records">
      <div className="text-input-container">
        <h2>文本转记录</h2>

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

        <div className="input-actions">
          <button
            onClick={handleConvert}
            disabled={isProcessing}
            className="convert-button"
          >
            {isProcessing ? "转换中..." : "转换为记录"}
          </button>
          <button onClick={handleClear} className="clear-button">
            清空
          </button>
        </div>
      </div>

      {result && (
        <div className="result-container">
          <h3>转换结果</h3>
          <div className="result-message">{result}</div>
        </div>
      )}

      <div className="help-container">
        <h3>格式说明</h3>
        <div className="format-help">
          <pre>{`[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)
旁白: 对话内容

BGM名称与图片名称会使用搜索匹配BGM库中的名称/文件名
情绪用于设置立绘
当设置新BGM时, 之前的BGM会自动停止
[-STOP]可以停止当前BGM`}</pre>
        </div>
      </div>
    </div>
  );
};

export default TextToRecords;

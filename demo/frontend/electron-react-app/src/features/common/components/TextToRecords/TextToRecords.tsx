import React, { useState } from "react";
import "./TextToRecords.css";
import ApiService from "@services/ApiService";
import { Record } from "@types";
import TextInputArea from "./components/TextInputArea";
import ConvertActions from "./components/ConvertActions";
import ResultDisplay from "./components/ResultDisplay";
import FormatHelp from "./components/FormatHelp";
const log = require("electron-log");

interface TextToRecordsProps {
  onParsedRecords?: (records: Record[]) => void;
}

const TextToRecords: React.FC<TextToRecordsProps> = ({ onParsedRecords }) => {
  const [inputText, setInputText] = useState('');
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
    log.info("[TextToRecords] 开始处理文本转换");
    
    if (!inputText.trim()) {
      console.warn("[TextToRecords] 输入文本为空，转换终止");
      alert("请输入文本内容");
      return;
    }

    console.log(`[TextToRecords] 输入文本长度: ${inputText.length} 字符`);
    console.log(`[TextToRecords] 输入文本预览: ${inputText.substring(0, 100)}...`);

    try {
      setIsProcessing(true);
      console.log("[TextToRecords] 开始调用后端API进行文本转换");
      
      // 调用后端API进行文本转换
      const records = await ApiService.textToRecords(inputText);
      
      console.log(`[TextToRecords] 后端返回记录数: ${records ? records.length : 0}`);
      
      if (records && records.length > 0) {
        console.log("[TextToRecords] 转换成功，准备传递记录给父组件");
        console.log(`[TextToRecords] 第一条记录预览:`, JSON.stringify(records[0], null, 2));
        
        // 转换成功，调用回调函数将记录传递给父组件
        // 这将触发跳转到 RecordEditor 页面并加载转换后的记录
        onParsedRecords?.(records);
        
        console.log("[TextToRecords] 已调用 onParsedRecords 回调，准备跳转到编辑器");
      } else {
        console.warn("[TextToRecords] 后端返回空记录数组");
        setResult("转换成功，但没有生成任何记录");
      }
    } catch (error) {
      console.error("[TextToRecords] 文本转换过程中发生错误:", error);
      console.error("[TextToRecords] 错误详情:", JSON.stringify(error, null, 2));
      setResult("文本转换失败，请检查控制台日志");
    } finally {
      console.log("[TextToRecords] 文本转换处理完成");
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

        <TextInputArea
          inputText={inputText}
          handleTextChange={handleTextChange}
          handleFileDrop={handleFileDrop}
          handleDragOver={handleDragOver}
        />

        <ConvertActions
          handleConvert={handleConvert}
          handleClear={handleClear}
          isProcessing={isProcessing}
        />
      </div>

      <ResultDisplay result={result} />

      <FormatHelp />
    </div>
  );
};

export default TextToRecords;

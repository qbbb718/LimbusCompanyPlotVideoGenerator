
import React, { useState } from 'react';
import './TextToRecords.css';
import ApiService from '../../services/ApiService';
import TextInputArea from './components/TextInputArea';
import ConvertActions from './components/ConvertActions';
import ResultDisplay from './components/ResultDisplay';
import FormatHelp from './components/FormatHelp';

const TextToRecords: React.FC = () => {
  const [inputText, setInputText] = useState(`[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)
旁白: 对话内容

BGM名称与图片名称会使用搜索匹配BGM库中的名称/文件名
情绪用于设置立绘
当设置新BGM时, 之前的BGM会自动停止
[-STOP]可以停止当前BGM`);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string>('');

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('text/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target) {
          setInputText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    } else {
      alert('请拖入文本文件');
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleConvert = async () => {
    if (!inputText.trim()) {
      alert('请输入文本内容');
      return;
    }

    try {
      setIsProcessing(true);
      const records = await ApiService.textToRecords(inputText);
      setResult(`成功转换文本，生成了 ${records.length} 条记录`);
    } catch (error) {
      console.error('文本转换失败:', error);
      setResult('文本转换失败，请检查控制台日志');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setResult('');
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


import React from 'react';
import '../TextToRecords.css';

const FormatHelp: React.FC = () => {
  const helpText = `[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)
旁白: 对话内容

BGM名称与图片名称会使用搜索匹配BGM库中的名称/文件名
情绪用于设置立绘
当设置新BGM时, 之前的BGM会自动停止
[-STOP]可以停止当前BGM`;

  return (
    <div className="help-container">
      <h3>格式说明</h3>
      <div className="format-help">
        <pre>{helpText}</pre>
      </div>
    </div>
  );
};

export default FormatHelp;

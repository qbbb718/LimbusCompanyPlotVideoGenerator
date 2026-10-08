import React from "react";
import "../TextToRecords.css";

const FormatHelp: React.FC = () => {
  const beforeExample = `文本格式：
[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)<位置>
旁白: 对话内容

--------------------------------

`;

  const example = `示例：
[巴士内部BGM]
{不xx就出不去的房间}
格里高尔: ……(ANGRY)<70%>
[-STOP]
旁白: 诶呀。

--------------------------------

`;

  const afterExample = `说明：

对话:
- 说话人：选择“角色管理”中的同名角色
- 对话内容：显示在底部文本框中的文字
- (情绪)：决定使用该角色的哪个立绘, 需要角色管理对立绘设置情绪
- <位置>：角色在画面中横向的位置，用百分比填写，0% 最左，50% 画面中间，100% 最右。不写则默认居中。
- “旁白”：底部文本框左侧的角色名UI将不显示

{背景图片名称}：切换背景图，自动搜索图片库中相同的名称或文件名。

音频:
- [BGM名称]：切换背景音乐，自动搜索 BGM 库中的名称或文件名。
- 出现新 BGM 时，上一首会自动停止。
- [-STOP]可停止当前 BGM。`;

  return (
    <div className="help-container">
      <h3>格式说明</h3>
      <div className="format-help">
        <pre>
          {beforeExample}
          <strong>{example}</strong>
          {afterExample}
        </pre>
      </div>
    </div>
  );
};

export default FormatHelp;

```mermaid

classDiagram

    @startuml
    class Record {
        ' 核心数据字段
        - uuid: String                 ' 唯一标识符，避免修改顺序破坏dirty标记
        - durationFrames: int          ' 持续时间（帧数）
        - dialogue: Dialogue           ' 文本对话内容
        - camera: Camera               ' 摄像机信息
        - bg: List<BackgroundVisual>   ' 背景视觉元素（可能有多个）
        - chars: List<CharacterVisual> ' 角色立绘列表（注意渲染顺序）
        - effects: List<EffectVisual>  ' 特效列表
        - audioCommands: List<AudioCommand> ' 音频操作列表（BGM/音效/语音）
        - isDirty: boolean             ' 导出后修改标记
        - preImage: BufferedImage      ' 无UI的预览图缓存

        ' 状态管理方法
        + markClean(): void            ' 清除修改标记

        ' 集合操作方法（自动标记dirty）
        + addBackgroundVisual(BackgroundVisual): void
        + addCharacterVisual(CharacterVisual): void
        + addEffectVisual(EffectVisual): void
        + addAudioCommand(AudioCommand): void
        + removeBackgroundVisual(BackgroundVisual): void
        + removeCharacterVisual(CharacterVisual): void

        ' 核心业务逻辑
        + autoRecord(): void           ' 生成下一条record时继承前一条内容（除对话）
        + calculateDuration(): int     ' 计算持续时间：max(语音时长, 显示时长)
        + setCamera(): void            ' 调整摄像机（自动对齐说话人）
        
        ' 渲染相关
        + renderPic(): void            ' 渲染预览图（有缓存机制）
        + renderVideo(recorder, durationFrames): void ' 渲染视频和音频轨道
    }

    ' 关联类（保持简洁，只展示关联关系）
    class Dialogue { ' 对话文本内容（可扩展表情/语气等字段） }
    class Camera { ' 摄像机位置/焦距等参数 }
    class BackgroundVisual { ' 背景图片/颜色/过渡效果 }
    class CharacterVisual { ' 角色立绘状态/位置/表情 }
    class EffectVisual { ' 视觉特效参数 }
    class AudioCommand { ' 音频控制指令（播放/停止/音量） }

    ' 关联关系（带多重性标注）
    Record "1" --> "1" Dialogue       ' 每条记录包含一个对话
    Record "1" --> "1" Camera         ' 一个摄像机配置
    Record "1" --> "*" BackgroundVisual ' 多个背景元素（通常1个，但保留扩展性）
    Record "1" --> "*" CharacterVisual ' 多个角色立绘（通常<10个）
    Record "1" --> "*" EffectVisual   ' 多个视觉特效
    Record "1" --> "*" AudioCommand   ' 多个音频指令（通常<10个）
    @enduml




```
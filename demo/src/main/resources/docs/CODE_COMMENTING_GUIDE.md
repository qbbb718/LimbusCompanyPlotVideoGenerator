# 代码注释指南 - LimbusCompanyPlotVideoGenerator

本文档提供代码注释的规范和指南，帮助AI助手更好地理解代码结构和功能。

## 注释标签体系

### 模块标签

#### @module
用于标识代码所属的模块或功能区域。

```java
/**
 * @module 剧情解析模块
 * 负责将纯文本转换为剧情记录对象
 */
public class PlotParser {
    // ...
}
```

```tsx
/**
 * @module 资源管理组件
 * 负责管理角色、背景和音频资源
 */
const ResourceManager: React.FC = () => {
    // ...
}
```

### 功能标签

#### @function
用于标识函数或方法的主要功能。

```java
/**
 * @function 解析纯文本为剧情记录
 * @param text 要解析的文本
 * @return 解析后的剧情记录列表
 */
public List<Record> parseText(String text) {
    // ...
}
```

```tsx
/**
 * @function 处理背景拖拽排序
 * @param result 拖拽结果对象
 */
const handleBackgroundDragEnd = (result: any) => {
    // ...
}
```

### API标签

#### @api
用于标识API端点及其用途。

```java
/**
 * @api 获取角色列表
 * @endpoint GET /api/resources/characters
 * @return 角色列表
 */
@GetMapping("/api/resources/characters")
public List<Character> getCharacters() {
    // ...
}
```

### 组件标签

#### @component
用于标识React组件及其用途。

```tsx
/**
 * @component 角色编辑对话框
 * 用于编辑角色属性和立绘
 */
const CharacterEditDialog: React.FC = () => {
    // ...
}
```

### 数据模型标签

#### @model
用于标识数据模型及其字段说明。

```java
/**
 * @model 剧情记录
 * 描述一个剧情片段，包含对白、背景、角色等元素
 */
public class Record {
    /**
     * 唯一标识符
     */
    private String uuid;

    /**
     * 对白内容
     */
    private Dialogue dialogue;

    /**
     * 背景视觉元素列表
     */
    private List<BackgroundVisual> bg;

    // ...
}
```

```tsx
/**
 * @model 角色接口
 * 描述角色属性
 */
interface Character {
    /**
     * 角色ID
     */
    id: string;

    /**
     * 角色名称
     */
    name: string;

    /**
     * 角色头像路径
     */
    avatar: string;

    /**
     * 角色身高
     */
    height: number;

    // ...
}
```

### 关联标签

#### @relatesTo
用于标识与其他模型或组件的关联关系。

```java
/**
 * @model 角色立绘
 * @relatesTo Character
 */
public class Portrait {
    /**
     * 所属角色ID
     * @relatesTo Character.id
     */
    private String characterID;

    // ...
}
```

## 注释最佳实践

1. **类/组件级别注释**：使用`@module`或`@component`标签说明整体功能
2. **方法/函数级别注释**：使用`@function`标签说明功能、参数和返回值
3. **复杂逻辑注释**：在代码内部添加注释解释复杂逻辑
4. **数据模型注释**：使用`@model`标签说明模型结构，使用`@relatesTo`说明关联关系
5. **API注释**：使用`@api`标签说明端点、参数和返回值

## 示例

### Java类示例

```java
/**
 * @module 视频渲染模块
 * 负责将剧情记录渲染为视频帧
 */
public class Renderer {
    /**
     * @function 渲染单个剧情记录为视频帧
     * @param record 要渲染的剧情记录
     * @param timeOffset 时间偏移量（毫秒）
     * @return 渲染后的视频帧列表
     */
    public List<BufferedImage> renderRecord(Record record, long timeOffset) {
        // 创建背景层
        BufferedImage background = renderBackground(record.getBg());

        // 添加角色层
        BufferedImage withCharacters = renderCharacters(background, record.getChars());

        // 添加文本层
        BufferedImage withText = renderDialogue(withCharacters, record.getDialogue());

        // 添加特效层
        BufferedImage finalFrame = renderEffects(withText, record.getEffects());

        return Arrays.asList(finalFrame);
    }

    /**
     * @function 渲染背景层
     * @param backgrounds 背景视觉元素列表
     * @return 渲染后的背景图像
     */
    private BufferedImage renderBackground(List<BackgroundVisual> backgrounds) {
        // 实现细节...
    }
}
```

### React组件示例

```tsx
/**
 * @component 剧情编辑器
 * 提供剧情记录的编辑界面，包括列表、预览和编辑功能
 */
const PlotEditor: React.FC = () => {
    const [records, setRecords] = useState<Record[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

    /**
     * @function 加载剧情记录
     * 从后端API获取剧情记录列表
     */
    const loadRecords = async () => {
        try {
            const response = await axios.get('/api/plots');
            setRecords(response.data);
        } catch (error) {
            console.error('加载剧情记录失败:', error);
        }
    };

    /**
     * @function 保存当前编辑的剧情记录
     * 将修改后的剧情记录保存到后端
     */
    const saveCurrentRecord = async () => {
        if (!selectedRecord) return;

        try {
            await axios.put(`/api/plots/${selectedRecord.uuid}`, selectedRecord);
            // 更新本地状态
            setRecords(records.map(r => r.uuid === selectedRecord.uuid ? selectedRecord : r));
        } catch (error) {
            console.error('保存剧情记录失败:', error);
        }
    };

    return (
        <Box>
            {/* 剧情记录列表 */}
            <RecordList 
                records={records} 
                selectedRecord={selectedRecord}
                onSelectRecord={setSelectedRecord}
            />

            {/* 剧情记录预览 */}
            {selectedRecord && (
                <RecordPreview record={selectedRecord} />
            )}

            {/* 剧情记录编辑器 */}
            {selectedRecord && (
                <RecordEditor 
                    record={selectedRecord}
                    onChange={setSelectedRecord}
                    onSave={saveCurrentRecord}
                />
            )}
        </Box>
    );
};
```

## 实施建议

1. **逐步实施**：先为新代码添加结构化注释，然后逐步为现有代码添加
2. **代码审查**：将结构化注释纳入代码审查清单
3. **文档同步**：当修改代码时，同步更新相关注释和CODE_INDEX.md文档
4. **工具支持**：考虑使用IDE插件或工具来验证注释的完整性

## 维护指南

1. **定期更新**：随着项目发展，定期更新注释指南
2. **收集反馈**：收集开发者和AI助手的反馈，持续改进注释体系
3. **版本控制**：将注释指南的变更纳入版本控制

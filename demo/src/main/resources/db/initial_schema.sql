-- 角色表

CREATE TABLE IF NOT EXISTS characters (
    character_id TEXT PRIMARY KEY NOT NULL,
    character_name TEXT NOT NULL,
    height INTEGER DEFAULT 170,
    color_bg TEXT DEFAULT '076,054,031',        -- 直接设置颜色字符串默认值
    color_text TEXT DEFAULT '251,219,179',    -- 直接设置颜色字符串默认值
    faction TEXT DEFAULT '无阵营'
);


-- 立绘表
CREATE TABLE IF NOT EXISTS portraits (
    portrait_id TEXT PRIMARY KEY NOT NULL,
    character_id TEXT NOT NULL, -- 所属角色ID
    image_path TEXT NOT NULL,
    port_name TEXT,
    emotion TEXT,
    face_x INTEGER DEFAULT 0,
    face_y INTEGER DEFAULT 0,
    length INTEGER DEFAULT 100,
    adj_x INTEGER DEFAULT 0,
    adj_y INTEGER DEFAULT 0,
    dim BOOLEAN DEFAULT 1,
    thumbnail_path TEXT
    --FOREIGN KEY (character_id) REFERENCES characters (character_id) ON DELETE CASCADE
);



-- 角色-立绘关联表（多对多关系）
CREATE TABLE IF NOT EXISTS character_portraits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    portrait_id TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0, -- 标记是否为默认立绘
    display_order INTEGER DEFAULT 0, -- 显示顺序
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 复合主键确保唯一性
    UNIQUE(character_id, portrait_id),
    
    -- 外键约束
    FOREIGN KEY (character_id) REFERENCES characters (character_id) ON DELETE CASCADE,
    FOREIGN KEY (portrait_id) REFERENCES portraits (portrait_id) ON DELETE CASCADE
);


-- 背景表：存储背景资源元数据（文件路径、显示名等）
CREATE TABLE IF NOT EXISTS backgrounds (
    background_id TEXT PRIMARY KEY NOT NULL,
    image_path TEXT NOT NULL,
    display_name TEXT,
    source TEXT,
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 背景标签表（可选）：用于将tag附加到背景
CREATE TABLE IF NOT EXISTS background_tags (
    tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_name TEXT UNIQUE NOT NULL
);

-- 背景-标签关联表（多对多）
CREATE TABLE IF NOT EXISTS background_tag_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    background_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (background_id) REFERENCES backgrounds(background_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES background_tags(tag_id) ON DELETE CASCADE,
    UNIQUE(background_id, tag_id)
);


-- 创建索引提高查询性能
--CREATE INDEX IF NOT EXISTS idx_character ON characters(character_id);

--CREATE INDEX IF NOT EXISTS idx_portraits_character ON portraits(character_id);
--CREATE INDEX IF NOT EXISTS idx_portraits_emotion ON portraits(emotion);

--CREATE INDEX IF NOT EXISTS idx_char_portrait_char ON character_portraits(character_id);
--CREATE INDEX IF NOT EXISTS idx_char_portrait_port ON character_portraits(portrait_id);



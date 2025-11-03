-- 创建角色表
CREATE TABLE IF NOT EXISTS characters (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    height INTEGER,
    faction TEXT,
    color_bg TEXT,
    color_text TEXT,
    tags TEXT
);

-- 创建立绘表
CREATE TABLE IF NOT EXISTS portraits (
    uuid TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    image_path TEXT NOT NULL,
    name TEXT NOT NULL,
    emotion TEXT,
    face_x INTEGER,
    face_y INTEGER,
    length INTEGER,
    adj_x INTEGER,
    adj_y INTEGER,
    thumbnail_path TEXT,
    FOREIGN KEY (character_id) REFERENCES characters(uuid)
);

-- 创建背景表
CREATE TABLE IF NOT EXISTS backgrounds (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    tags TEXT
);

-- 创建音频表
CREATE TABLE IF NOT EXISTS audios (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT
);

-- 创建记录表
CREATE TABLE IF NOT EXISTS records (
    uuid TEXT PRIMARY KEY,
    duration_frames INTEGER,
    dialogue TEXT,
    camera TEXT,
    bg TEXT,
    chars TEXT,
    effects TEXT,
    audio_commands TEXT,
    is_dirty BOOLEAN
);

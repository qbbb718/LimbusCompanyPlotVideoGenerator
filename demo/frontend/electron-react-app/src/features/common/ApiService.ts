import axios from 'axios';
import log from 'electron-log';

// API基础URL
// 后端地址和 API 前缀
export const BASE_URL = 'http://localhost:8081';
export const API_BASE_URL = BASE_URL + '/api';

// 资源访问路径常量（与后端 WebMvcConfig / AppConfig 保持一致）
export const ASSETS_BASE_URL = BASE_URL + '/assets';
export const BACKGROUNDS_ASSETS_URL = ASSETS_BASE_URL + '/backgrounds';
export const CHARACTERS_ASSETS_URL = ASSETS_BASE_URL + '/characters';
export const AUDIOS_ASSETS_URL = ASSETS_BASE_URL + '/audios';
export const EFFECTS_ASSETS_URL = ASSETS_BASE_URL + '/effects';
export const UI_ASSETS_URL = ASSETS_BASE_URL + '/ui';
export const THUMBNAILS_ASSETS_URL = ASSETS_BASE_URL + '/thumbnails';
export const CHARACTER_CARDS_BASE_URL = API_BASE_URL + '/character-card';

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 检查是否为404错误
const isNotFoundError = (error: any): boolean => {
  return error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    error.response.status === 404;
};

// API服务类
class ApiService {
  // 健康检查
  async healthCheck() {
    try {
      log.info('开始健康检查');
      const response = await apiClient.get('/health');
      log.info('健康检查成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('健康检查失败:', error);
      throw error;
    }
  }

  // 初始化音频系统
  async initAudio() {
    try {
      log.info('开始初始化音频系统');
      const response = await apiClient.get('/init-audio');
      log.info('音频系统初始化成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('初始化音频系统失败:', error);
      throw error;
    }
  }

  // 获取所有记录
  async getRecords() {
    try {
      log.info('开始获取记录列表');
      const response = await apiClient.get('/records');
      log.info('成功获取记录列表，数量:', response.data?.length || 0);
      return response.data;
    } catch (error) {
      log.error('获取记录失败:', error);
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        log.warn('记录接口未实现，返回空数组');
        return [];
      }
      throw error;
    }
  }

  // 创建新记录
  async createRecord(recordData: any) {
    try {
      log.info('开始创建记录:', recordData);
      const response = await apiClient.post('/records', recordData);
      log.info('记录创建成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('创建记录失败:', error);
      throw error;
    }
  }

  // 更新记录
  async updateRecord(id: string, recordData: any) {
    try {
      log.info('开始更新记录:', id, recordData);
      const response = await apiClient.put(`/records/${id}`, recordData);
      log.info('记录更新成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('更新记录失败:', error);
      throw error;
    }
  }

  // 删除记录
  async deleteRecord(id: string) {
    try {
      log.info('开始删除记录:', id);
      const response = await apiClient.delete(`/records/${id}`);
      log.info('记录删除成功');
      return response.data;
    } catch (error) {
      log.error('删除记录失败:', error);
      throw error;
    }
  }

  // 获取所有角色
  async getCharacters() {
    try {
      log.info('开始获取角色列表');
      const response = await apiClient.get('/characters');
      log.info('成功获取角色列表，数量:', response.data?.length || 0);
      return response.data;
    } catch (error) {
      log.error('获取角色失败:', error);
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        log.warn('角色接口未实现，返回空数组');
        return [];
      }
      throw error;
    }
  }

  // 获取所有背景
  async getBackgrounds() {
    try {
      log.info('开始获取背景列表');
      const response = await apiClient.get('/backgrounds');
      log.info('成功获取背景列表，数量:', response.data?.length || 0);
      return response.data;
    } catch (error) {
      log.error('获取背景失败:', error);
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        log.warn('背景接口未实现，返回空数组');
        return [];
      }
      throw error;
    }
  }

  // 获取单个背景
  async getBackground(id: string) {
    try {
      log.info('开始获取背景:', id);
      const response = await apiClient.get(`/backgrounds/${id}`);
      log.info('成功获取背景:', response.data);
      return response.data;
    } catch (error) {
      log.error('获取背景失败:', error);
      throw error;
    }
  }

  // 获取所有音频
  async getAudios() {
    try {
      log.info('开始获取音频列表');
      const response = await apiClient.get('/audios');
      log.info('成功获取音频列表，数量:', response.data?.length || 0);
      return response.data;
    } catch (error) {
      log.error('获取音频失败:', error);
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        log.warn('音频接口未实现，返回空数组');
        return [];
      }
      throw error;
    }
  }

  // 文本转记录
  async textToRecords(text: string) {
    try {

      log.info('[ApiService] 开始文本转记录，文本长度:', text.length);
      log.info('[ApiService] 文本预览:', text.substring(0, 100));
      
      const response = await apiClient.post('/text-to-records', { text });
      
      log.info('[ApiService] 后端响应状态:', response.status);
      log.info('[ApiService] 返回的记录数量:', response.data?.length || 0);
      
      if (response.data && response.data.length > 0) {
        log.info('[ApiService] 第一条记录预览:', JSON.stringify(response.data[0], null, 2));
      }
      
      log.info('[ApiService] 文本转记录成功');
      return response.data;
    } catch (error) {
      log.error('[ApiService] 文本转记录失败:', error);
      log.error('[ApiService] 错误详情:', JSON.stringify(error, null, 2));
      // 如果接口未实现，返回模拟数据
      if (isNotFoundError(error)) {
        log.warn('[ApiService] 文本转记录接口未实现，返回模拟数据');
        // 简单的文本解析，返回模拟记录
        const lines = text.split('\n').filter(line => line.trim());
        const mockRecords = lines.map((line, index) => ({
          uuid: `mock-record-${index}`,
          durationFrames: 120,
          dialogue: {
            text: line,
            location: "未知地点",
            speakerC: [],
            speakerName: "未知",
            faction: "未知",
            align: "LEFT" as any,
            speed: 1.0,
            emotion: "NORMAL" as any
          },
          bg: [],
          chars: [],
          effects: [],
          audioCommands: [],
          isDirty: false
        }));
        log.info('[ApiService] 生成的模拟记录数量:', mockRecords.length);
        return mockRecords;
      }
      throw error;
    }
  }

  // 获取应用设置（从后端数据库加载持久化配置）
  async getSettings(): Promise<Record<string, string>> {
    try {
      const response = await apiClient.get('/settings');
      log.info('获取应用设置成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('获取应用设置失败:', error);
      return {};
    }
  }

  // 保存应用设置到后端数据库
  async updateSettings(settings: Record<string, string>): Promise<Record<string, string>> {
    try {
      const response = await apiClient.put('/settings', settings);
      log.info('保存应用设置成功:', response.data);
      return response.data;
    } catch (error) {
      log.error('保存应用设置失败:', error);
      throw error;
    }
  }

  // 查询视频生成进度
  async getVideoProgress(taskId: string): Promise<{
    stage: number;
    current: number;
    total: number;
    message: string;
    completed: boolean;
    error: boolean;
    outputPath: string;
    elapsedMs: number;
    percent: number;
  }> {
    try {
      const response = await apiClient.get(`/generate-video/progress/${taskId}`);
      return response.data;
    } catch (error) {
      log.error('查询视频进度失败:', error);
      throw error;
    }
  }

  // 生成视频（异步 — 返回 taskId，前端轮询进度）
  async generateVideo(
    records: any[],
    outputPath: string,
    width: number,
    height: number,
    frameRate: number = 30,
  ) {
    try {
      const response = await apiClient.post('/generate-video', {
        records,
        outputPath,
        width,
        height,
        frameRate,
      });
      return response.data;
    } catch (error) {
      console.error('生成视频失败:', error);
      throw error;
    }
  }

  /**
   * 渲染单条记录的预览图
   * 将 Record JSON 发送到后端，由 RenderOfImage.renderPre() 渲染为 PNG 图片。
   * @param record 要渲染的 Record 对象
   * @param width  预览图宽度，默认 1280
   * @param height 预览图高度，默认 720
   * @returns blob URL，可直接用于 <img src>。调用方需在组件卸载时调用 URL.revokeObjectURL()
   */
  async getRecordPreview(record: any, width = 1920, height = 1080, forceRefresh = false): Promise<string> {
    try {
      const response = await apiClient.post(
        `/records/preview?width=${width}&height=${height}&forceRefresh=${forceRefresh}`,
        record,
        { responseType: 'blob' },
      );
      return URL.createObjectURL(response.data);
    } catch (error) {
      console.error('获取记录预览图失败:', error);
      throw error;
    }
  }

  // 添加新角色
  async addCharacter(characterData: any) {
    try {
      const response = await apiClient.post('/characters', characterData);
      return response.data;
    } catch (error) {
      console.error('添加角色失败:', error);
      throw error;
    }
  }

  // 更新角色
  async updateCharacter(id: string, characterData: any) {
    try {
      console.log('开始更新角色，ID:', id);
      console.log('角色数据:', JSON.stringify(characterData, null, 2));

      const response = await apiClient.put(`/characters/${id}`, characterData);
      console.log('更新角色成功，响应数据:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error: any) {
      console.error('更新角色失败，详细信息:');
      console.error('- 错误对象:', error);
      if (error.response) {
        console.error('- 错误状态码:', error.response.status);
        console.error('- 错误状态文本:', error.response.statusText);
        console.error('- 错误响应数据:', error.response.data);
      } else {
        console.error('- 无响应数据，可能是网络错误或请求未发送');
      }
      console.error('- 请求URL:', `/characters/${id}`);
      console.error('- 请求数据:', JSON.stringify(characterData, null, 2));
      throw error;
    }
  }

  // 删除角色
  async deleteCharacter(id: string, deleteFiles: boolean = false) {
    try {
      const response = await apiClient.delete(`/characters/${id}?deleteFiles=${deleteFiles}`);
      return response.data;
    } catch (error) {
      console.error('删除角色失败:', error);
      throw error;
    }
  }

  // 上传立绘图片文件到后端
  // 文件会被保存到角色目录（目录名=characterId）中，命名为 {portraitId}.{ext}
  async uploadPortraitFile(
    characterId: string,
    portraitId: string,
    file: File,
    emotion: string,
  ): Promise<{ imagePath: string; thumbnailPath: string | null }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('portraitId', portraitId);
      formData.append('emotion', emotion);

      const response = await apiClient.post(
        `/characters/${characterId}/portraits/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error('上传立绘文件失败:', error);
      throw error;
    }
  }

  // 上传立绘缩略图（前端裁剪后的小图）
  // 后端按 config 保存到 {characters}/{角色拼音}/{characterThumbnailsSubdir}/thumbnail_{portraitId}.png
  // 返回访问 URL 路径（形如 "/assets/characters/{拼音}/thumbnails/thumbnail_{portraitId}.png"），
  // 该路径会存入 DB portrait.thumbnail_path，前端 <img src> 直接拼接 baseUrl 访问。
  async uploadPortraitThumbnail(
    characterId: string,
    portraitId: string,
    formData: FormData,
  ): Promise<string> {
    try {
      const response = await apiClient.post(
        `/characters/${characterId}/portraits/${portraitId}/thumbnail`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error('上传立绘缩略图失败:', error);
      throw error;
    }
  }

  // 添加立绘
  async addPortrait(characterId: string, portraitData: any) {
    try {
      const response = await apiClient.post(`/characters/${characterId}/portraits`, portraitData);
      return response.data;
    } catch (error) {
      console.error('添加立绘失败:', error);
      throw error;
    }
  }

  // 更新立绘
  async updatePortrait(characterId: string, portraitId: string, portraitData: any) {
    try {
      const response = await apiClient.put(`/characters/${characterId}/portraits/${portraitId}`, portraitData);
      return response.data;
    } catch (error) {
      console.error('更新立绘失败:', error);
      throw error;
    }
  }

  // 删除立绘
  async deletePortrait(characterId: string, portraitId: string) {
    try {
      const response = await apiClient.delete(`/characters/${characterId}/portraits/${portraitId}`);
      return response.data;
    } catch (error) {
      console.error('删除立绘失败:', error);
      throw error;
    }
  }

  // 设置默认立绘
  async setDefaultPortrait(characterId: string, portraitId: string) {
    try {
      const response = await apiClient.put(`/characters/${characterId}/portraits/${portraitId}/default`);
      return response.data;
    } catch (error) {
      console.error('设置默认立绘失败:', error);
      throw error;
    }
  }

  // 添加背景
  async addBackground(backgroundData: any) {
    try {
      const response = await apiClient.post('/backgrounds', backgroundData);
      return response.data;
    } catch (error) {
      console.error('添加背景失败:', error);
      throw error;
    }
  }

  // 更新背景
  async updateBackground(id: string, backgroundData: any) {
    try {
      const response = await apiClient.put(`/backgrounds/${id}`, backgroundData);
      return response.data;
    } catch (error) {
      console.error('更新背景失败:', error);
      throw error;
    }
  }

  // 上传背景原图到后端，返回 { filename, imagePath, autoThumbnailPath }
  // 后端保存到 assets/backgrounds 目录，缩略图保存到 assets/backgrounds/thumbnails/
  async uploadBackgroundFile(
    file: File,
    name?: string,
  ): Promise<{ filename: string; imagePath: string; autoThumbnailPath: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name) formData.append('name', name);

      const response = await apiClient.post('/backgrounds/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('上传背景原图失败:', error);
      throw error;
    }
  }

  // 上传背景缩略图（前端裁剪后，单独上传）
  async uploadBackgroundThumbnail(id: string, file: File) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post(`/backgrounds/${id}/thumbnail`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('上传背景缩略图失败:', error);
      throw error;
    }
  }

  // ===== 临时图片（NPC、道具等） =====

  /**
   * 上传临时图片到项目文件夹
   * @returns { uuid, imagePath, url }
   */
  async uploadTempImage(file: File): Promise<{ uuid: string; imagePath: string; url: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/temp-images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log('[ApiService] 临时图片上传成功:', response.data);
      return response.data;
    } catch (error) {
      console.error('[ApiService] 上传临时图片失败:', error);
      throw error;
    }
  }

  /**
   * 删除临时图片文件
   */
  async deleteTempImage(uuid: string): Promise<{ success: boolean }> {
    try {
      const response = await apiClient.delete(`/temp-images/${uuid}`);
      console.log('[ApiService] 临时图片已删除:', uuid);
      return response.data;
    } catch (error) {
      console.error('[ApiService] 删除临时图片失败:', error);
      throw error;
    }
  }

  // 删除背景（默认连同磁盘文件一起删除）
  async deleteBackground(id: string, deleteFiles: boolean = true) {
    try {
      const response = await apiClient.delete(
        `/backgrounds/${id}?deleteFile=${deleteFiles ? 'true' : 'false'}`,
      );
      return response.data;
    } catch (error) {
      console.error('删除背景失败:', error);
      throw error;
    }
  }

  // 添加音频
  async addAudio(audioData: any) {
    try {
      const response = await apiClient.post('/audios', audioData);
      return response.data;
    } catch (error) {
      console.error('添加音频失败:', error);
      throw error;
    }
  }

  // 更新音频
  async updateAudio(id: string, audioData: any) {
    try {
      const response = await apiClient.put(`/audios/${id}`, audioData);
      return response.data;
    } catch (error) {
      console.error('更新音频失败:', error);
      throw error;
    }
  }

  // 删除音频
  async deleteAudio(id: string) {
    try {
      const response = await apiClient.delete(`/audios/${id}`);
      return response.data;
    } catch (error) {
      console.error('删除音频失败:', error);
      throw error;
    }
  }

  // 导入记录
  async importRecords(file: File) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post('/records/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('导入记录失败:', error);
      throw error;
    }
  }

  // 导出记录
  async exportRecords(records: any[]) {
    try {
      const response = await apiClient.post('/records/export', { records }, {
        responseType: 'blob'
      });
      return response;
    } catch (error) {
      console.error('导出记录失败:', error);
      throw error;
    }
  }

  // ============================================================
  // 资源URL辅助方法（用于构建正确的前端可访问资源路径）
  // 注意：所有方法均对路径段进行URL编码，以支持中文文件名
  // ============================================================

  /**
   * 构建背景图片URL
   * 背景文件统一通过 Spring 静态资源映射 /assets/backgrounds/ 访问
   * DB中存储的 path 可能是以下格式之一：
   *   - 仅文件名：Story_private_room.png
   *   - /assets/backgrounds/xxx.png（新上传格式）
   *   - assets/backgrounds/xxx.png
   *   - ./assets/backgrounds/xxx.png
   * @param pathOrFilename DB中存储的 path 字段
   */
  getBackgroundUrl(pathOrFilename: string): string {
    if (!pathOrFilename) return '';
    // 若是完整的 http(s) 或 blob: 或 data:，直接返回
    if (/^(https?:|blob:|data:)/i.test(pathOrFilename)) return pathOrFilename;
    // 若已包含 /assets/ 前缀，直接拼 base
    if (pathOrFilename.startsWith('/assets/')) {
      return BASE_URL + pathOrFilename;
    }
    // 其他情况当作文件名（或相对 assets/backgrounds 的路径）
    const normalized = pathOrFilename.replace(/\\/g, '/');
    const bgPrefix = 'assets/backgrounds/';
    const bgIdx = normalized.indexOf(bgPrefix);
    if (bgIdx !== -1) {
      return BASE_URL + '/' + normalized.substring(bgIdx);
    }
    // 旧格式：./assets/xxx.png 或 assets/xxx.png
    if (normalized.startsWith('./assets/')) {
      return BASE_URL + normalized.substring(1);
    }
    if (normalized.startsWith('assets/')) {
      return BASE_URL + '/' + normalized;
    }
    // 纯文件名：放到 backgrounds 目录下
    return `${BACKGROUNDS_ASSETS_URL}/${encodeURIComponent(normalized)}`;
  }

  /**
   * 构建背景缩略图URL
   * 新格式统一存储在 /assets/backgrounds/thumbnails/xxx
   * 兼容旧格式 /assets/thumbnails/xxx 或 ./assets/thumbnails/xxx
   * @param pathOrFilename DB中存储的 thumbnailPath 字段
   */
  getBackgroundThumbnailUrl(pathOrFilename: string): string {
    if (!pathOrFilename) return '';
    if (/^(https?:|blob:|data:)/i.test(pathOrFilename)) return pathOrFilename;
    if (pathOrFilename.startsWith('/assets/')) {
      return BASE_URL + pathOrFilename;
    }
    const normalized = pathOrFilename.replace(/\\/g, '/');
    if (normalized.startsWith('./assets/')) {
      return BASE_URL + normalized.substring(1);
    }
    if (normalized.startsWith('assets/')) {
      return BASE_URL + '/' + normalized;
    }
    // 纯文件名：默认看作 backgrounds/thumbnails 下的文件
    return `${BACKGROUNDS_ASSETS_URL}/thumbnails/${encodeURIComponent(normalized)}`;
  }

  /**
   * 构建角色名片图片URL
   * @param characterId 角色ID (如 "char_1762360609515")
   */
  getCharacterCardUrl(characterId: string): string {
    if (!characterId) return '';
    return `${CHARACTER_CARDS_BASE_URL}/${encodeURIComponent(characterId)}`;
  }

  /**
   * 构建立绘图片URL
   * 立绘文件存储在 /assets/characters/ 目录下，通过静态资源方式访问
   * 支持传入路径 (如 "assets/characters/格里高尔-face_depressed_L.png")
   * 或仅文件名 (如 "格里高尔-face_depressed_L.png")
   *
   * 关于中文路径说明：
   * - 文件系统层：Windows NTFS完全支持UTF-8中文文件名，后端 Java NIO Files 操作无问题
   * - URL传输层：通过 encodeURIComponent 对中文文件名编码，避免URL解析错误
   * - Spring Boot：默认使用 UTF-8 解码URL路径，WebMvcConfig已正确配置静态资源映射
   *
   * @param pathOrFilename 立绘的完整相对路径或仅文件名
   */
  getPortraitUrl(pathOrFilename: string): string {
    if (!pathOrFilename) return '';
    const filename = this.extractFilename(pathOrFilename);
    const encoded = encodeURIComponent(filename);
    return `${CHARACTERS_ASSETS_URL}/${encoded}`;
  }

  /**
   * 构建立绘缩略图URL
   * @param thumbnailPath 缩略图的相对路径或仅文件名
   */
  getPortraitThumbnailUrl(thumbnailPath: string): string {
    if (!thumbnailPath) return '';
    const filename = this.extractFilename(thumbnailPath);
    const encoded = encodeURIComponent(filename);
    return `${THUMBNAILS_ASSETS_URL}/${encoded}`;
  }

  /**
   * 构建音频文件URL
   * @param audioIdOrPath 音频ID，或音频文件名，或音频的相对路径
   * @param useApiIdMode true: 通过 /api/audios/{id}/file 方式；false: 通过静态资源路径
   */
  getAudioFileUrl(audioIdOrPath: string, useApiIdMode: boolean = false): string {
    if (!audioIdOrPath) return '';
    if (useApiIdMode) {
      return `${API_BASE_URL}/audios/${encodeURIComponent(audioIdOrPath)}/file`;
    }
    const filename = this.extractFilename(audioIdOrPath);
    const encoded = encodeURIComponent(filename);
    return `${AUDIOS_ASSETS_URL}/${encoded}`;
  }

  /**
   * 构建特效资源URL
   * @param filename 特效文件名
   */
  getEffectUrl(filename: string): string {
    if (!filename) return '';
    const encoded = encodeURIComponent(this.extractFilename(filename));
    return `${EFFECTS_ASSETS_URL}/${encoded}`;
  }

  /**
   * 构建UI资源URL
   * @param filename UI资源文件名
   */
  getUiAssetUrl(filename: string): string {
    if (!filename) return '';
    const encoded = encodeURIComponent(this.extractFilename(filename));
    return `${UI_ASSETS_URL}/${encoded}`;
  }

  // ============================================================
  // 内部辅助方法
  // ============================================================

  /**
   * 从完整路径中提取仅文件名部分
   * 支持以下输入格式：
   * - "文件名.png" → "文件名.png"
   * - "assets/characters/文件名.png" → "文件名.png"
   * - "assets\\characters\\文件名.png" → "文件名.png"
   * - "./assets/characters/文件名.png" → "文件名.png"
   */
  private extractFilename(pathOrFilename: string): string {
    if (!pathOrFilename) return '';
    const normalized = pathOrFilename.replace(/\\/g, '/');
    const lastSlashIndex = normalized.lastIndexOf('/');
    if (lastSlashIndex === -1) return normalized;
    return normalized.substring(lastSlashIndex + 1);
  }
}

// 导出单例
const apiServiceInstance = new ApiService();
export default apiServiceInstance;

import axios from 'axios';

// API基础URL
const API_BASE_URL = 'http://localhost:8080/api';

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// API服务类
class ApiService {
  // 健康检查
  async healthCheck() {
    try {
      const response = await apiClient.get('/health');
      return response.data;
    } catch (error) {
      console.error('健康检查失败:', error);
      throw error;
    }
  }

  // 初始化音频系统
  async initAudio() {
    try {
      const response = await apiClient.get('/init-audio');
      return response.data;
    } catch (error) {
      console.error('初始化音频系统失败:', error);
      throw error;
    }
  }

  // 获取所有记录
  async getRecords() {
    try {
      const response = await apiClient.get('/records');
      return response.data;
    } catch (error) {
      console.error('获取记录失败:', error);
      throw error;
    }
  }

  // 创建新记录
  async createRecord(recordData: any) {
    try {
      const response = await apiClient.post('/records', recordData);
      return response.data;
    } catch (error) {
      console.error('创建记录失败:', error);
      throw error;
    }
  }

  // 更新记录
  async updateRecord(id: string, recordData: any) {
    try {
      const response = await apiClient.put(`/records/${id}`, recordData);
      return response.data;
    } catch (error) {
      console.error('更新记录失败:', error);
      throw error;
    }
  }

  // 删除记录
  async deleteRecord(id: string) {
    try {
      const response = await apiClient.delete(`/records/${id}`);
      return response.data;
    } catch (error) {
      console.error('删除记录失败:', error);
      throw error;
    }
  }

  // 获取所有角色
  async getCharacters() {
    try {
      const response = await apiClient.get('/characters');
      return response.data;
    } catch (error) {
      console.error('获取角色失败:', error);
      throw error;
    }
  }

  // 获取所有背景
  async getBackgrounds() {
    try {
      const response = await apiClient.get('/backgrounds');
      return response.data;
    } catch (error) {
      console.error('获取背景失败:', error);
      throw error;
    }
  }

  // 获取所有音频
  async getAudios() {
    try {
      const response = await apiClient.get('/audios');
      return response.data;
    } catch (error) {
      console.error('获取音频失败:', error);
      throw error;
    }
  }

  // 文本转记录
  async textToRecords(text: string) {
    try {
      const response = await apiClient.post('/text-to-records', { text });
      return response.data;
    } catch (error) {
      console.error('文本转记录失败:', error);
      throw error;
    }
  }

  // 生成视频
  async generateVideo(records: any[]) {
    try {
      const response = await apiClient.post('/generate-video', { records });
      return response.data;
    } catch (error) {
      console.error('生成视频失败:', error);
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
      const response = await apiClient.put(`/characters/${id}`, characterData);
      return response.data;
    } catch (error) {
      console.error('更新角色失败:', error);
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

  // 删除背景
  async deleteBackground(id: string) {
    try {
      const response = await apiClient.delete(`/backgrounds/${id}`);
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
}

// 导出单例
export default new ApiService();

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
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        console.warn('记录接口未实现，返回空数组');
        return [];
      }
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
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        console.warn('角色接口未实现，返回空数组');
        return [];
      }
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
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        console.warn('背景接口未实现，返回空数组');
        return [];
      }
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
      // 如果接口未实现，返回空数组
      if (isNotFoundError(error)) {
        console.warn('音频接口未实现，返回空数组');
        return [];
      }
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
      // 如果接口未实现，返回模拟数据
      if (isNotFoundError(error)) {
        console.warn('文本转记录接口未实现，返回模拟数据');
        // 简单的文本解析，返回模拟记录
        const lines = text.split('\n').filter(line => line.trim());
        return lines.map((line, index) => ({
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
      }
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
}

// 导出单例
export default new ApiService();

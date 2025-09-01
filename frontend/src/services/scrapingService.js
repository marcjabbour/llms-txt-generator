import ApiService from './api';

class ScrapingService {
  async generate(url, options = {}) {
    const response = await ApiService.post('/api/generate', { url, options });
    return response;
  }

  async getStatus(jobId) {
    return await ApiService.get(`/api/generate/status/${jobId}`);
  }

  async waitForCompletion(jobId, onUpdate) {
    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const status = await this.getStatus(jobId);
          onUpdate?.(status);
          
          if (status.status === 'completed') resolve(status);
          else if (status.status === 'failed') reject(new Error(status.error));
          else setTimeout(check, 1000);
        } catch (error) {
          reject(error);
        }
      };
      check();
    });
  }

  async download(jobId, type = 'llms') {
    const url = `/api/generate/download/${jobId}/${type === 'full' ? 'llms-full.txt' : 'llms.txt'}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${type}.txt`;
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  async healthCheck() {
    try {
      const response = await ApiService.get('/health');
      return response.status === 'OK';
    } catch (error) {
      return false;
    }
  }
}

export default new ScrapingService();
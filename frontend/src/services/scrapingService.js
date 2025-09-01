import ApiService from './api';

class ScrapingService {
  async startGeneration(url, options = {}) {
    try {
      const response = await ApiService.post('/api/generate', {
        url,
        options: {
          maxPages: options.maxPages || 50,
          maxDepth: options.maxDepth || 3,
          generateFullText: options.generateFullText !== false,
          followLinks: options.followLinks !== false,
        },
      });

      return response;
    } catch (error) {
      console.error('Failed to start generation:', error);
      throw new Error(`Failed to start generation: ${error.message}`);
    }
  }

  async getGenerationStatus(jobId) {
    try {
      const response = await ApiService.get(`/api/generate/status/${jobId}`);
      return response;
    } catch (error) {
      console.error('Failed to get generation status:', error);
      throw new Error(`Failed to get generation status: ${error.message}`);
    }
  }

  async pollForCompletion(jobId, onUpdate = null) {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const status = await this.getGenerationStatus(jobId);
          
          if (onUpdate) {
            onUpdate(status);
          }

          if (status.status === 'completed') {
            resolve(status);
          } else if (status.status === 'failed') {
            reject(new Error(status.error || 'Generation failed'));
          } else {
            setTimeout(checkStatus, 1000);
          }
        } catch (error) {
          reject(error);
        }
      };

      checkStatus();
    });
  }

  async downloadLlmsFile(jobId) {
    try {
      const response = await fetch(`/api/generate/download/${jobId}/llms.txt`);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'llms.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('Failed to download LLMS file:', error);
      throw new Error(`Failed to download LLMS file: ${error.message}`);
    }
  }

  async downloadLlmsFullFile(jobId) {
    try {
      const response = await fetch(`/api/generate/download/${jobId}/llms-full.txt`);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'llms-full.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('Failed to download LLMS full file:', error);
      throw new Error(`Failed to download LLMS full file: ${error.message}`);
    }
  }

  async healthCheck() {
    try {
      const response = await ApiService.get('/health');
      return response.status === 'OK';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

export default new ScrapingService();
import ApiService from './api';

class ScrapingService {
  async startGeneration(url, options = {}) {
    try {
      const response = await ApiService.post('/api/generate', {
        url,
        options: {
          method: options.useDynamicScraping ? 'dynamic' : 'static',
          waitFor: options.waitTime || 0,
          extractText: true,
          extractLinks: options.extractLinks || false,
          extractImages: options.extractImages || false,
          selectors: options.customSelectors || {},
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
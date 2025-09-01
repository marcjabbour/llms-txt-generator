const customScrapingService = require('./customScrapingService');
const { validateUrl } = require('../../utils/validation');

class ScrapingService {
  constructor() {
    this.activeJobs = new Map();
  }

  async startScraping(jobId, url, options = {}) {
    try {
      if (!validateUrl(url)) {
        throw new Error('Invalid URL provided');
      }

      this.activeJobs.set(jobId, { status: 'running', startTime: Date.now() });

      // Use custom scraping service
      const result = await customScrapingService.scrapeAndGenerate(url, options);

      this.activeJobs.delete(jobId);
      return result;

    } catch (error) {
      this.activeJobs.delete(jobId);
      throw new Error(`Scraping failed: ${error.message}`);
    }
  }

  getJobStatus(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  cancelJob(jobId) {
    if (this.activeJobs.has(jobId)) {
      this.activeJobs.delete(jobId);
      return true;
    }
    return false;
  }

}

module.exports = new ScrapingService();
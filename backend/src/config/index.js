export default {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  scraping: {
    timeout: parseInt(process.env.SCRAPING_TIMEOUT) || 30000,
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 5,
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    maxPages: parseInt(process.env.SCRAPING_MAX_PAGES) || 50,
    maxDepth: parseInt(process.env.SCRAPING_MAX_DEPTH) || 3,
    rateLimit: parseInt(process.env.SCRAPING_RATE_LIMIT) || 1000 // ms between requests
  },
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  }
};
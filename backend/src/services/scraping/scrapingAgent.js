const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class ScrapingAgent {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async scrape(url, options = {}) {
    const { 
      method = 'static',
      waitFor = 0,
      selectors = {},
      extractText = true,
      extractLinks = false,
      extractImages = false
    } = options;

    try {
      let html;
      
      if (method === 'dynamic') {
        html = await this.dynamicScrape(url, { waitFor });
      } else {
        html = await this.staticScrape(url);
      }

      return this.parseHtml(html, {
        selectors,
        extractText,
        extractLinks,
        extractImages
      });

    } catch (error) {
      throw new Error(`Scraping error: ${error.message}`);
    }
  }

  async staticScrape(url) {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  }

  async dynamicScrape(url, { waitFor = 0 }) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      if (waitFor > 0) {
        await page.waitForTimeout(waitFor);
      }

      const html = await page.content();
      return html;
    } finally {
      await page.close();
    }
  }

  parseHtml(html, options) {
    const $ = cheerio.load(html);
    const result = {};

    if (options.extractText) {
      result.text = $('body').text().trim();
      result.title = $('title').text().trim();
      result.description = $('meta[name="description"]').attr('content') || '';
    }

    if (options.extractLinks) {
      result.links = [];
      $('a[href]').each((i, el) => {
        result.links.push({
          text: $(el).text().trim(),
          href: $(el).attr('href')
        });
      });
    }

    if (options.extractImages) {
      result.images = [];
      $('img[src]').each((i, el) => {
        result.images.push({
          src: $(el).attr('src'),
          alt: $(el).attr('alt') || ''
        });
      });
    }

    if (options.selectors && Object.keys(options.selectors).length > 0) {
      result.custom = {};
      Object.entries(options.selectors).forEach(([key, selector]) => {
        const elements = $(selector);
        result.custom[key] = elements.map((i, el) => $(el).text().trim()).get();
      });
    }

    return result;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new ScrapingAgent();
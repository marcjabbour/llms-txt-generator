const { validateUrl } = require('../utils/validation');

class Scraper {
  async scrape(url, options = {}) {
    if (!validateUrl(url)) {
      throw new Error('Invalid URL provided');
    }

    const { maxPages = 50, maxDepth = 3, generateFullText = true } = options;

    try {
      // Step 1: Find pages to scrape
      const urls = await this.findPages(url, maxPages, maxDepth);
      
      // Step 2: Scrape all pages
      const pages = await this.scrapePages(urls);
      
      // Step 3: Generate content
      const llmsContent = this.generateSummary(pages, url);
      const llmsFullContent = generateFullText ? this.generateFull(pages, url) : null;

      return {
        success: true,
        data: {
          url,
          totalPages: pages.length,
          llmsContent,
          llmsFullContent,
          pages: pages.map(p => ({
            url: p.url,
            title: p.title || 'Untitled',
            wordCount: this.countWords(p.content || '')
          }))
        },
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Scraping failed: ${error.message}`);
    }
  }

  async findPages(startUrl, maxPages, maxDepth) {
    // TODO: Implement page discovery
    console.log(`Finding pages from ${startUrl} (max: ${maxPages}, depth: ${maxDepth})`);
    return [startUrl]; // For now, just return the start URL
  }

  async scrapePages(urls) {
    // TODO: Implement parallel scraping
    const pages = [];
    for (const url of urls) {
      try {
        console.log(`Scraping: ${url}`);
        const page = await this.scrapePage(url);
        pages.push({ url, ...page });
      } catch (error) {
        console.error(`Failed to scrape ${url}:`, error.message);
      }
    }
    return pages;
  }

  async scrapePage(url) {
    // TODO: Implement single page scraping
    return {
      title: 'Sample Title',
      content: 'Sample content from the page',
      links: []
    };
  }

  generateSummary(pages, baseUrl) {
    const domain = new URL(baseUrl).hostname;
    let content = `# ${domain}\n\n`;
    
    if (pages[0]?.content) {
      const summary = this.truncate(pages[0].content, 500);
      content += `## Overview\n${summary}\n\n`;
    }

    content += `## Pages\n`;
    pages.forEach(page => {
      const path = page.url.replace(baseUrl, '') || '/';
      content += `- [${page.title}](${path})\n`;
    });

    return content;
  }

  generateFull(pages, baseUrl) {
    const domain = new URL(baseUrl).hostname;
    let content = `# ${domain} - Full Content\n\n`;

    pages.forEach(page => {
      if (page.content?.trim()) {
        content += `## ${page.title}\n`;
        content += `URL: ${page.url}\n\n`;
        content += `${page.content}\n\n---\n\n`;
      }
    });

    return content;
  }

  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.8 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  countWords(text) {
    return text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  }
}

module.exports = new Scraper();
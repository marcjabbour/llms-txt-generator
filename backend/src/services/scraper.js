import { PlaywrightCrawler, Configuration } from 'crawlee';
import { validateUrl } from '../utils/validation.js';
import contentProcessor from './contentProcessor.js';
import llmsTxtGenerator from './llmsTxtGenerator.js';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { rm } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Scraper {
  async scrape(url, options = {}) {
    if (!validateUrl(url)) {
      throw new Error('Invalid URL provided');
    }

    const { maxPages = 50, maxDepth = 3, generateFullText = true } = options;

    // Create unique storage directory for this crawl session
    const sessionId = randomUUID();
    const storageDir = path.join(__dirname, '../../storage', sessionId);
    
    console.log(`Using unique storage directory: ${storageDir}`);
    
    // Configure Crawlee with isolated storage for this session
    const config = new Configuration({
      storageClientOptions: {
        localDataDirectory: storageDir
      }
    });

    const pages = [];
    const seenCanonical = new Set();

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: Math.max(100, maxPages * 2),
      requestHandlerTimeoutSecs: 60,
      preNavigationHooks: [
        async (crawlingContext, gotoOptions) => {
          const url = crawlingContext.request.url;
          // Skip binary files before navigation
          if (/\.(pdf|zip|gz|rar|7z|jpg|jpeg|png|gif|webp|svg|ico|mp4|mov|avi|mp3|wav|xlsx|xls|doc|docx|ppt|pptx|exe|dmg|pkg)$/i.test(url)) {
            crawlingContext.log.debug(`Pre-navigation skip: ${url}`);
            return false;
          }
        }
      ],
      requestHandler: async ({ request, page, enqueueLinks, log }) => {
        log.info(`Processing: ${request.url}`);
        
        // Skip binary/download files early
        if (/\.(pdf|zip|gz|rar|7z|jpg|jpeg|png|gif|webp|svg|ico|mp4|mov|avi|mp3|wav|xlsx|xls|doc|docx|ppt|pptx|exe|dmg|pkg)$/i.test(request.url)) {
          log.debug(`Skipping binary file: ${request.url}`);
          return;
        }

        const safe = async (fn, fallback = null) => {
          try { return await fn(); } catch { return fallback; }
        };

        // Wait for page to load
        await page.waitForLoadState('domcontentloaded');

        const title = await safe(() => page.title(), null);
        
        const getAttr = (sel, attr = 'content') =>
          page.$eval(sel, (el, a) => el.getAttribute(a), attr);

        const description =
          (await safe(() => getAttr('meta[name="description"]'))) ||
          (await safe(() => getAttr('meta[property="og:description"]'))) ||
          (await safe(() => getAttr('meta[name="twitter:description"]')));

        const canonical =
          (await safe(() => getAttr('link[rel="canonical"]', 'href'))) ||
          request.loadedUrl || request.url;

        const h1 = await safe(
          () => page.$eval('h1', el => (el.textContent || '').trim()),
          null
        );

        // Extract main content text
        const textContent = await safe(() => page.evaluate(() => {
          // Remove script and style elements
          const scripts = document.querySelectorAll('script, style');
          scripts.forEach(script => script.remove());
          
          // Try to get main content area
          const contentSelectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '#content',
            '.main-content',
            'body'
          ];
          
          for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              return element.innerText.trim();
            }
          }
          
          return document.body.innerText.trim();
        }), '');

        const wordCount = textContent.split(/\s+/).length;

        // Extract headings structure
        const headings = await safe(() => page.$$eval('h1, h2, h3, h4, h5, h6', elements =>
          elements.map(el => ({
            level: parseInt(el.tagName.substring(1)),
            text: el.innerText.trim(),
            id: el.id || null
          }))
        ), []);

        // Extract links
        const links = await safe(() => page.$$eval('a[href]', elements =>
          elements.map(el => ({
            text: el.innerText.trim(),
            href: el.href,
            isExternal: el.hostname !== window.location.hostname
          })).filter(link => link.text.length > 0)
        ), []);

        // Extract images
        const images = await safe(() => page.$$eval('img[src]', elements =>
          elements.map(el => ({
            src: el.src,
            alt: el.alt || '',
            title: el.title || ''
          }))
        ), []);

        // Get page path for organization
        const urlObj = new URL(request.url);
        const path = urlObj.pathname;
        const domain = urlObj.hostname;

        // Skip pages with access restrictions but keep utility pages
        const isUtilityPage = /\/(login|privacy|terms|password|reset|contact|support|help)(?:\.|$|\/)/i.test(canonical);
        const isRestricted = 
          !isUtilityPage && (
            (title && /access.restricted|login.required|unauthorized|403|404/i.test(title)) ||
            (textContent && /access.restricted|login.required|unauthorized|please.log.?in/i.test(textContent)) ||
            (canonical.includes('/login') && !isUtilityPage) ||
            canonical.includes('redirect=')
          );

        if (!seenCanonical.has(canonical) && !isRestricted) {
          seenCanonical.add(canonical);
          
          const metadata = {
            url: canonical,
            success: true,
            timestamp: new Date().toISOString(),
            title,
            description,
            textContent,
            wordCount,
            headings,
            links,
            images,
            path,
            domain,
            h1
          };

          this.results.set(canonical, metadata);
          pages.push(metadata);
        }

        const depth = (request.userData?.depth ?? 0);
        if (depth < maxDepth) {
          log.info(`Depth ${depth}/${maxDepth}, enqueueing links from ${request.url}`);
          
          await enqueueLinks({
            strategy: 'same-domain',
            transformRequestFunction: (req) => {
              try {
                const u = new URL(req.url);
                
                // Skip binary files and downloads
                if (/\.(pdf|zip|gz|rar|7z|jpg|jpeg|png|gif|webp|svg|ico|mp4|mov|avi|mp3|wav|xlsx|xls|doc|docx|ppt|pptx|exe|dmg|pkg)$/i.test(u.pathname)) {
                  return null;
                }
                
                // Skip common non-content URLs
                const skipPatterns = [
                  /\/search\?/i,
                  /\/admin/i,
                  /\/wp-admin/i,
                  /\/logout$/i,
                  /^mailto:/i,
                  /^tel:/i,
                  /^ftp:/i,
                  /#$/,
                ];
                
                if (skipPatterns.some(pattern => pattern.test(req.url))) {
                  return null;
                }
                
                req.userData = { ...(req.userData || {}), depth: depth + 1 };
                log.info(`Enqueueing link: ${req.url} (depth ${depth + 1})`);
                return req;
              } catch (error) {
                log.error(`Error processing link ${req.url}:`, error);
                return null;
              }
            },
          });
        } else {
          log.info(`Max depth ${maxDepth} reached for ${request.url}`);
        }
      },
      
      failedRequestHandler: async ({ request, log }) => {
        log.error(`Request failed: ${request.url}`);
        this.results.set(request.url, {
          url: request.url,
          error: 'Request failed',
          timestamp: new Date().toISOString(),
          success: false
        });
      },
    }, config);

    // Start crawling
    console.log(`Starting crawler with startUrl: ${startUrl}`);
    await crawler.run([{ 
      url: startUrl, 
      userData: { depth: 0 } 
    }]);
    
    console.log(`Crawler finished. Total pages processed: ${this.results.size}`);

    // Clean up the temporary storage directory
    try {
      await rm(storageDir, { recursive: true, force: true });
      console.log(`Cleaned up storage directory: ${storageDir}`);
    } catch (error) {
      console.warn(`Failed to clean up storage directory: ${error.message}`);
    }

    // Convert results to array and generate consolidated data
    const pagesData = Array.from(this.results.values());
    const consolidatedData = await this.consolidateData(pagesData, startUrl);

    return {
      success: true,
      startUrl,
      totalPages: pagesData.length,
      pages: pagesData,
      data: consolidatedData,
      timestamp: new Date().toISOString()
    };
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
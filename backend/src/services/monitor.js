import { randomUUID } from 'crypto';
import db from '../database/db.js';
import scraper from './scraper.js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { stableContentHash } from '../utils/htmlCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATED_FILES_DIR = path.join(__dirname, '../../generated-files');

class UrlMonitor {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 300000; // Check every 5 minutes (5 * 60 * 1000ms)
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) {
      console.log('URL Monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting URL Monitor...');
    
    // Run initial check
    this.checkUrls();
    
    // Schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkUrls();
    }, this.checkInterval);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('URL Monitor stopped');
  }

  async checkUrls() {
    try {
      console.log('Checking URLs for updates...');
      const urlsToCheck = await db.getUrlsForMonitoring();
      
      if (urlsToCheck.length === 0) {
        console.log('No URLs need checking at this time');
        return;
      }

      console.log(`Found ${urlsToCheck.length} URLs to check`);

      // Process URLs in parallel but limit concurrency
      const maxConcurrent = 3;
      const chunks = [];
      
      for (let i = 0; i < urlsToCheck.length; i += maxConcurrent) {
        chunks.push(urlsToCheck.slice(i, i + maxConcurrent));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(url => this.checkSingleUrl(url)));
        // Small delay between chunks to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error('Error during URL monitoring check:', error);
    }
  }

  async checkSingleUrl(watchedUrl) {
    try {
      console.log(`Checking URL: ${watchedUrl.url}`);
      
      // Quick content check first - just get a content hash without full scraping
      const contentCheckResult = await this.hasContentChanged(watchedUrl);
      
      if (!contentCheckResult.changed) {
        console.log(`No changes detected for ${watchedUrl.url}`);
        // Update last_updated to reset the check timer with current content hash
        await db.updateContentHash(watchedUrl.id, contentCheckResult.currentHash);
        return;
      }

      console.log(`Content changed detected for ${watchedUrl.url}, triggering regeneration`);
      
      // Generate new job ID and start regeneration
      const jobId = randomUUID();
      
      await db.addGeneration({
        watchedUrlId: watchedUrl.id,
        jobId: jobId,
        url: watchedUrl.url,
        status: 'pending',
        trigger: 'automatic'
      });

      // Start regeneration asynchronously
      this.regenerateUrl(watchedUrl, jobId);
      
    } catch (error) {
      console.error(`Error checking URL ${watchedUrl.url}:`, error);
    }
  }

  async hasContentChanged(watchedUrl) {
    try {
      // Try HTTP header-based detection first (most efficient)
      const headerResult = await this.checkHttpHeaders(watchedUrl);
      if (headerResult.success) {
        return headerResult;
      }

      // Fallback to raw HTML hash comparison (avoids scraping differences)
      const htmlResult = await this.checkRawHtmlHash(watchedUrl);
      return htmlResult;
      
    } catch (error) {
      console.error(`Error checking content changes for ${watchedUrl.url}:`, error);
      return { changed: false, currentHash: watchedUrl.last_content_hash }; // Don't trigger regeneration on error
    }
  }

  async checkHttpHeaders(watchedUrl) {
    try {
      console.log(`Checking HTTP headers for ${watchedUrl.url}`);
      
      const response = await fetch(watchedUrl.url, { 
        method: 'HEAD',
        timeout: 10000 // 10 second timeout
      });

      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');
      const contentLength = response.headers.get('content-length');
      
      // Create a signature from available headers
      const headerSignature = [etag, lastModified, contentLength]
        .filter(Boolean)
        .join('|');

      if (!headerSignature) {
        console.log(`No useful headers found for ${watchedUrl.url}, falling back to HTML check`);
        return { success: false };
      }

      const currentHash = createHash('sha256')
        .update(headerSignature)
        .digest('hex');

      // If no previous hash exists, consider it changed (first time)
      if (!watchedUrl.last_content_hash) {
        console.log(`First time check for ${watchedUrl.url} using headers`);
        return { success: true, changed: true, currentHash };
      }

      const changed = currentHash !== watchedUrl.last_content_hash;
      console.log(`Header check for ${watchedUrl.url}: ${changed ? 'CHANGED' : 'no changes'}`);
      return { success: true, changed, currentHash };

    } catch (error) {
      console.log(`HTTP header check failed for ${watchedUrl.url}:`, error.message);
      return { success: false };
    }
  }

  async checkRawHtmlHash(watchedUrl) {
    try {
      console.log(`Checking raw HTML hash for ${watchedUrl.url}`);
      
      const response = await fetch(watchedUrl.url, {
        timeout: 15000 // 15 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rawHtml = await response.text();

      const currentHash = stableContentHash(rawHtml, { removeDates: false })
      
      // Create hash of raw HTML (this is consistent across checks)
      // const currentHash = createHash('sha256')
      //   .update(rawHtml)
      //   .digest('hex');

      // If no previous hash exists, consider it changed (first time)
      if (!watchedUrl.last_content_hash) {
        console.log(`First time check for ${watchedUrl.url} using HTML hash`);
        return { changed: true, currentHash };
      }

      const changed = currentHash !== watchedUrl.last_content_hash;
      console.log(`HTML hash check for ${watchedUrl.url}: ${changed ? 'CHANGED' : 'no changes'}`);
      return { changed, currentHash };

    } catch (error) {
      console.error(`Raw HTML check failed for ${watchedUrl.url}:`, error.message);
      return { changed: false, currentHash: watchedUrl.last_content_hash };
    }
  }

  async regenerateUrl(watchedUrl, jobId) {
    try {
      await db.updateGenerationStatus(jobId, 'in_progress');
      
      console.log(`Starting full regeneration for ${watchedUrl.url}`);
      const result = await scraper.scrape(watchedUrl.url);
      
      if (result.success) {
        // Save file to disk
        if (result.data && result.data.llmsContent) {
          try {
            const llmsFilePath = path.join(GENERATED_FILES_DIR, `${jobId}-llms.txt`);
            
            // Ensure directory exists
            await fs.mkdir(GENERATED_FILES_DIR, { recursive: true });
            
            // Write the file
            await fs.writeFile(llmsFilePath, result.data.llmsContent, 'utf8');
            console.log(`Regenerated file saved successfully: ${llmsFilePath}`);
          } catch (fileError) {
            console.error('Error saving regenerated file to disk:', fileError);
          }
        }
        
        await db.updateGenerationStatus(jobId, 'completed', {
          file_path: `${jobId}-llms.txt`
        });

        // Update content hash using the same method as detection
        // This ensures consistency between checks and regenerations
        try {
          const hashResult = await this.hasContentChanged(watchedUrl);
          if (hashResult.currentHash) {
            await db.updateContentHash(watchedUrl.id, hashResult.currentHash);
            console.log(`Updated content hash for ${watchedUrl.url}`);
          }
        } catch (hashError) {
          console.warn(`Failed to update content hash for ${watchedUrl.url}:`, hashError.message);
        }

        console.log(`Regeneration completed for ${watchedUrl.url}`);
      } else {
        throw new Error('Scraping failed');
      }
      
    } catch (error) {
      console.error(`Regeneration failed for ${watchedUrl.url}:`, error);
      await db.updateGenerationStatus(jobId, 'failed', {
        error_message: error.message
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval
    };
  }

  setCheckInterval(intervalMs) {
    this.checkInterval = intervalMs;
    
    if (this.isRunning) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }
}

export default new UrlMonitor();
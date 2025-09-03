import { randomUUID } from 'crypto';
import db from '../database/db.js';
import scraper from './scraper.js';
import { createHash } from 'crypto';

class UrlMonitor {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 60000; // Check every minute
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
      // For initial implementation, we'll do a simple approach:
      // Perform a lightweight scrape and compare content hashes
      
      // Quick scrape to get current content
      const result = await scraper.scrape(watchedUrl.url, { 
        maxPages: 5, // Limit pages for quick check
        maxDepth: 1  // Only check main pages
      });

      if (!result.success || !result.data || !result.data.llmsContent) {
        console.log(`Failed to get content for ${watchedUrl.url}`);
        return { changed: false, currentHash: watchedUrl.last_content_hash }; // Don't regenerate if we can't get content
      }

      // Create hash of current content
      const currentHash = createHash('sha256')
        .update(result.data.llmsContent)
        .digest('hex');

      // If no previous hash exists, consider it changed (first time)
      if (!watchedUrl.last_content_hash) {
        return { changed: true, currentHash };
      }

      const changed = currentHash !== watchedUrl.last_content_hash;
      return { changed, currentHash };
      
    } catch (error) {
      console.error(`Error checking content changes for ${watchedUrl.url}:`, error);
      return { changed: false, currentHash: watchedUrl.last_content_hash }; // Don't trigger regeneration on error
    }
  }

  async regenerateUrl(watchedUrl, jobId) {
    try {
      await db.updateGenerationStatus(jobId, 'in_progress');
      
      console.log(`Starting full regeneration for ${watchedUrl.url}`);
      const result = await scraper.scrape(watchedUrl.url);
      
      if (result.success) {
        await db.updateGenerationStatus(jobId, 'completed', {
          file_path: `generated/${jobId}.txt`
        });

        // Update content hash
        if (result.data && result.data.llmsContent) {
          const contentHash = createHash('sha256')
            .update(result.data.llmsContent)
            .digest('hex');
          await db.updateContentHash(watchedUrl.id, contentHash);
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
import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { validateUrl } from '../utils/validation.js';
import scraper from '../services/scraper.js';

const router = express.Router();

// Get all watched URLs
router.get('/', async (req, res) => {
  try {
    const watchedUrls = await db.getWatchedUrls();
    
    // Get recent generations for each URL
    const urlsWithGenerations = await Promise.all(
      watchedUrls.map(async (url) => {
        const generations = await db.getGenerationsForUrl(url.id, 5);
        return {
          ...url,
          recentGenerations: generations
        };
      })
    );

    res.json({
      success: true,
      data: urlsWithGenerations
    });
  } catch (error) {
    console.error('Error fetching watched URLs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch watched URLs'
    });
  }
});

// Add URL to watch list
router.post('/', async (req, res) => {
  try {
    const { url, checkFrequency = 60 } = req.body;

    if (!validateUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL provided'
      });
    }

    // Check if URL is already being watched
    const existingUrl = await db.getWatchedUrlByUrl(url);
    if (existingUrl && existingUrl.is_active) {
      return res.json({
        success: true,
        data: existingUrl,
        message: 'URL is already being watched'
      });
    }

    // Add to database
    const watchedUrl = await db.addWatchedUrl(url, checkFrequency);
    
    res.status(201).json({
      success: true,
      data: watchedUrl,
      message: 'URL added to watch list'
    });
  } catch (error) {
    console.error('Error adding watched URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add URL to watch list'
    });
  }
});

// Remove URL from watch list
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.removeWatchedUrl(parseInt(id));
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Watched URL not found'
      });
    }

    res.json({
      success: true,
      message: 'URL removed from watch list'
    });
  } catch (error) {
    console.error('Error removing watched URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove URL from watch list'
    });
  }
});

// Get generations for a specific watched URL
router.get('/:id/generations', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    const generations = await db.getGenerationsForUrl(parseInt(id), parseInt(limit));
    
    res.json({
      success: true,
      data: generations
    });
  } catch (error) {
    console.error('Error fetching generations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch generations'
    });
  }
});

// Manually trigger regeneration for a watched URL
router.post('/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;
    
    const watchedUrl = await db.getWatchedUrlById(parseInt(id));
    if (!watchedUrl) {
      return res.status(404).json({
        success: false,
        error: 'Watched URL not found'
      });
    }

    // Generate new job ID
    const jobId = randomUUID();
    
    // Add generation record
    await db.addGeneration({
      watchedUrlId: watchedUrl.id,
      jobId: jobId,
      url: watchedUrl.url,
      status: 'pending',
      trigger: 'manual'
    });

    // Start scraping asynchronously
    setImmediate(async () => {
      try {
        await db.updateGenerationStatus(jobId, 'in_progress');
        
        const result = await scraper.scrape(watchedUrl.url);
        
        await db.updateGenerationStatus(jobId, 'completed', {
          file_path: `generated/${jobId}.txt`
        });

        // Update content hash for change detection
        if (result.data && result.data.llmsContent) {
          const crypto = await import('crypto');
          const contentHash = crypto.createHash('sha256')
            .update(result.data.llmsContent)
            .digest('hex');
          await db.updateContentHash(watchedUrl.id, contentHash);
        }

      } catch (error) {
        console.error('Regeneration failed:', error);
        await db.updateGenerationStatus(jobId, 'failed', {
          error_message: error.message
        });
      }
    });

    res.json({
      success: true,
      jobId,
      message: 'Regeneration started'
    });
  } catch (error) {
    console.error('Error triggering regeneration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger regeneration'
    });
  }
});

export default router;
import scraper from '../services/scraper.js';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';
import websocket from '../services/websocket.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATED_FILES_DIR = path.join(__dirname, '../../generated-files');

const jobs = new Map();

const handleGenerate = async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const jobId = uuidv4();
    
    const startTime = new Date().toISOString();
    
    jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      createdAt: startTime,
      url,
      options
    });

    // Also add to generations table for tracking
    try {
      await db.addGeneration({
        watchedUrlId: null,
        jobId: jobId,
        url: url,
        status: 'pending',
        trigger: 'manual'
      });
      
      // Immediately add URL to watch list so it appears in dashboard
      try {
        const existingUrl = await db.getWatchedUrlByUrl(url);
        if (!existingUrl || !existingUrl.is_active) {
          const watchedUrl = await db.addWatchedUrl(url, 60); // Default 60 minute frequency
          console.log(`Immediately added ${url} to watch list for immediate display`);
          
          // Update the generation to link it to the watched URL
          await db.updateGenerationWatchedUrl(jobId, watchedUrl.id);
          
          // Notify WebSocket clients about the new watched URL
          websocket.notifyWatchedUrlAdded();
        } else if (existingUrl.is_active) {
          // URL already exists, just link the generation to it
          await db.updateGenerationWatchedUrl(jobId, existingUrl.id);
        }
      } catch (watchError) {
        console.warn('Failed to add URL to watch list immediately:', watchError);
      }
      
      // Notify WebSocket clients about new generation
      websocket.notifyGenerationUpdate(jobId, 'pending');
    } catch (dbError) {
      console.warn('Failed to add generation to database:', dbError);
    }

    // Update status to in_progress and notify clients
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'in_progress'
    });
    
    try {
      await db.updateGenerationStatus(jobId, 'in_progress');
      websocket.notifyGenerationUpdate(jobId, 'in_progress');
    } catch (dbError) {
      console.warn('Failed to update generation status to in_progress:', dbError);
    }

    scraper.scrape(url, options)
      .then(async result => {
        const completedTime = new Date().toISOString();
        
        // Save file to disk
        try {
          const domain = new URL(url).hostname;
          const llmsFilePath = path.join(GENERATED_FILES_DIR, `${jobId}-llms.txt`);
          
          // Ensure directory exists
          await fs.mkdir(GENERATED_FILES_DIR, { recursive: true });
          
          // Debug logging
          console.log('Scraping result:', {
            hasResult: !!result,
            hasData: !!result?.data,
            hasLlmsContent: !!result?.data?.llmsContent,
            llmsContentLength: result?.data?.llmsContent?.length || 0
          });
          
          // Save file
          if (result?.data?.llmsContent) {
            await fs.writeFile(llmsFilePath, result.data.llmsContent, 'utf8');
            console.log(`File saved successfully: ${llmsFilePath}`);
          } else {
            console.error('No llmsContent found in result to save');
            console.log('Result structure:', JSON.stringify(result, null, 2));
          }
        } catch (fileError) {
          console.error('Error saving file to disk:', fileError);
        }
        
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          result,
          completedAt: completedTime
        });
        
        // Update generation status
        try {
          await db.updateGenerationStatus(jobId, 'completed', {
            completed_at: completedTime,
            file_path: `${jobId}`
          });
          
          // URL is already in watch list from when generation started
          // Just ensure the generation is properly linked
          try {
            const existingUrl = await db.getWatchedUrlByUrl(url);
            if (existingUrl && existingUrl.is_active) {
              await db.updateGenerationWatchedUrl(jobId, existingUrl.id);
            }
          } catch (watchError) {
            console.warn('Failed to link generation to watched URL:', watchError);
          }
          
          // Notify WebSocket clients
          websocket.notifyGenerationUpdate(jobId, 'completed');
        } catch (dbError) {
          console.warn('Failed to update generation status:', dbError);
        }
      })
      .catch(async error => {
        const completedTime = new Date().toISOString();
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'failed',
          error: error.message,
          completedAt: completedTime
        });

        // Update generation status
        try {
          await db.updateGenerationStatus(jobId, 'failed', {
            completed_at: completedTime,
            error_message: error.message
          });
          // Notify WebSocket clients
          websocket.notifyGenerationUpdate(jobId, 'failed');
        } catch (dbError) {
          console.warn('Failed to update generation status:', dbError);
        }
      });

    res.status(202).json({
      jobId,
      status: 'pending',
      message: 'Scraping job started'
    });

  } catch (error) {
    console.error('Error in handleGenerate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getGenerateStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);

  } catch (error) {
    console.error('Error in getGenerateStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const downloadLlmsFile = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    // First try in-memory job
    if (job && job.status === 'completed') {
      let content, filename;
      const domain = job.url ? new URL(job.url).hostname : 'website';
      
      if (job.result?.data?.llmsContent) {
        content = job.result.data.llmsContent;
        filename = `${domain}-llms.txt`;
      }
      
      if (content) {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
        return;
      }
    }

    // If not in memory, try to get from local files
    try {
      const generation = await db.getGenerationByJobId(jobId);
      if (!generation) {
        return res.status(404).json({ error: 'Generation not found' });
      }

      if (generation.status !== 'completed') {
        return res.status(400).json({ error: 'Generation not completed yet' });
      }

      // Try to read from local storage
      const domain = new URL(generation.url).hostname;
      const filePath = path.join(GENERATED_FILES_DIR, `${jobId}-llms.txt`);
      const filename = `${domain}-llms.txt`;
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
        return;
      } catch (fileError) {
        console.error(`File not found at ${filePath}:`, fileError.message);
        
        // Check if this is a recently completed generation where the file should exist
        const generationTime = new Date(generation.started_at);
        const timeDiff = Date.now() - generationTime.getTime();
        
        if (timeDiff < 24 * 60 * 60 * 1000) { // Less than 24 hours old
          // This is a recent generation, file should exist - this is an error
          return res.status(500).json({
            error: `File generation error: Expected file not found at ${filePath}. Please try regenerating.`,
            canRegenerate: true,
            url: generation.url,
            debug: {
              jobId,
              filePath,
              generationStatus: generation.status,
              timeDiff: `${Math.round(timeDiff / 1000 / 60)} minutes ago`
            }
          });
        } else {
          // Older generation, file might have been cleaned up
          return res.status(410).json({ 
            error: 'File content no longer available. This generation was completed in a previous session and the content is not stored permanently. Please regenerate to download the file.',
            canRegenerate: true,
            url: generation.url
          });
        }
      }

    } catch (dbError) {
      console.warn('Failed to check database for generation:', dbError);
      return res.status(404).json({ error: 'Job not found' });
    }

  } catch (error) {
    console.error('Error in downloadLlmsFile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteGeneration = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Check if the job exists
    const job = jobs.get(jobId);
    if (!job) {
      // Try to get from database if not in memory
      try {
        const generation = await db.getGenerationByJobId(jobId);
        if (!generation) {
          return res.status(404).json({ error: 'Generation not found' });
        }
      } catch (dbError) {
        return res.status(404).json({ error: 'Generation not found' });
      }
    }

    // Remove from in-memory jobs
    if (job) {
      jobs.delete(jobId);
    }

    // Delete local file
    try {
      const llmsFilePath = path.join(GENERATED_FILES_DIR, `${jobId}-llms.txt`);
      
      await fs.unlink(llmsFilePath);
      
      console.log(`Deleted file for jobId: ${jobId}`);
    } catch (fileError) {
      console.warn('Error deleting file:', fileError);
    }

    // Mark as deleted in database (we'll keep the record for history but mark it as deleted)
    try {
      await db.updateGenerationStatus(jobId, 'deleted', {
        completed_at: new Date().toISOString()
      });
    } catch (dbError) {
      console.warn('Failed to update generation status to deleted:', dbError);
    }

    res.json({
      success: true,
      message: 'Generation deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteGeneration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getAllGenerations = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get from database (excluding deleted ones)
    const dbGenerations = await db.getAllGenerations(parseInt(limit));
    const validGenerations = dbGenerations.filter(gen => gen.status !== 'deleted');
    
    // Merge with in-memory jobs for recent ones
    const memoryJobs = Array.from(jobs.values())
      .map(job => ({
        id: job.id,
        job_id: job.id,
        url: job.url,
        status: job.status,
        started_at: job.createdAt,
        completed_at: job.completedAt,
        generation_trigger: 'manual'
      }))
      .slice(0, parseInt(limit));

    // Combine and deduplicate
    const allGenerations = [...memoryJobs];
    
    // Add database generations that aren't already in memory
    validGenerations.forEach(dbGen => {
      if (!memoryJobs.find(memJob => memJob.job_id === dbGen.job_id)) {
        allGenerations.push(dbGen);
      }
    });

    // Sort by started_at and limit
    const sortedGenerations = allGenerations
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: sortedGenerations
    });

  } catch (error) {
    console.error('Error in getAllGenerations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export {
  handleGenerate,
  getGenerateStatus,
  downloadLlmsFile,
  deleteGeneration,
  getAllGenerations
};
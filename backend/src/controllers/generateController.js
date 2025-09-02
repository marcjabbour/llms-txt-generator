import scraper from '../services/scraper.js';
import { v4 as uuidv4 } from 'uuid';

const jobs = new Map();

const handleGenerate = async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const jobId = uuidv4();
    
    jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      createdAt: new Date(),
      url,
      options
    });

    scraper.scrape(url, options)
      .then(result => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          result,
          completedAt: new Date()
        });
      })
      .catch(error => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        });
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
    const isFullFile = req.path.includes('llms-full.txt');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job not completed yet' });
    }

    let content, filename;
    const domain = job.url ? new URL(job.url).hostname : 'website';
    
    if (isFullFile && job.result?.data?.llmsFullContent) {
      content = job.result.data.llmsFullContent;
      filename = `${domain}-llms-full.txt`;
    } else if (job.result?.data?.llmsContent) {
      content = job.result.data.llmsContent;
      filename = `${domain}-llms.txt`;
    } else {
      return res.status(404).json({ error: 'LLMS content not available' });
    }
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);

  } catch (error) {
    console.error('Error in downloadLlmsFile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export {
  handleGenerate,
  getGenerateStatus,
  downloadLlmsFile
};
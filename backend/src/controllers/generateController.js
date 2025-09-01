const scrapingService = require('../services/scraping/scrapingService');
const { v4: uuidv4 } = require('uuid');

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

    scrapingService.startScraping(jobId, url, options)
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

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job not completed yet' });
    }

    if (!job.result?.data?.llmsContent) {
      return res.status(404).json({ error: 'LLMS content not available' });
    }

    const domain = job.url ? new URL(job.url).hostname : 'website';
    const filename = `${domain}-llms.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(job.result.data.llmsContent);

  } catch (error) {
    console.error('Error in downloadLlmsFile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const downloadLlmsFullFile = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job not completed yet' });
    }

    if (!job.result?.data?.llmsFullContent) {
      return res.status(404).json({ error: 'LLMS full content not available' });
    }

    const domain = job.url ? new URL(job.url).hostname : 'website';
    const filename = `${domain}-llms-full.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(job.result.data.llmsFullContent);

  } catch (error) {
    console.error('Error in downloadLlmsFullFile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleGenerate,
  getGenerateStatus,
  downloadLlmsFile,
  downloadLlmsFullFile
};
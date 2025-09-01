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

module.exports = {
  handleGenerate,
  getGenerateStatus
};
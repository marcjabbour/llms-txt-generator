const express = require('express');
const router = express.Router();
const generateController = require('../controllers/generateController');

router.post('/', generateController.handleGenerate);

router.get('/status/:jobId', generateController.getGenerateStatus);

router.get('/download/:jobId/llms.txt', generateController.downloadLlmsFile);

router.get('/download/:jobId/llms-full.txt', generateController.downloadLlmsFullFile);

module.exports = router;
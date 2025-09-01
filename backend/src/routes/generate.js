const express = require('express');
const router = express.Router();
const generateController = require('../controllers/generateController');

router.post('/', generateController.handleGenerate);

router.get('/status/:jobId', generateController.getGenerateStatus);

module.exports = router;
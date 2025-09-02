import express from 'express';
import { handleGenerate, getGenerateStatus, downloadLlmsFile } from '../controllers/generateController.js';

const router = express.Router();

router.post('/', handleGenerate);

router.get('/status/:jobId', getGenerateStatus);

router.get('/download/:jobId/llms.txt', downloadLlmsFile);
router.get('/download/:jobId/llms-full.txt', downloadLlmsFile);

export default router;
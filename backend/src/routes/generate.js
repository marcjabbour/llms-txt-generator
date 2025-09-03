import express from 'express';
import { handleGenerate, getGenerateStatus, downloadLlmsFile, deleteGeneration, getAllGenerations } from '../controllers/generateController.js';

const router = express.Router();

router.post('/', handleGenerate);

router.get('/status/:jobId', getGenerateStatus);

router.get('/download/:jobId/llms.txt', downloadLlmsFile);

router.delete('/:jobId', deleteGeneration);

router.get('/all', getAllGenerations);

export default router;
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
dotenv.config();

import generateRoutes from './routes/generate.js';
import watchRoutes from './routes/watch.js';
import db from './database/db.js';
import monitor from './services/monitor.js';
import websocket from './services/websocket.js';
import { createServer } from 'http';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/generate', generateRoutes);
app.use('/api/watch', watchRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      OPENAI_KEY_PRESENT: !!process.env.OPENAI_API_KEY,
      OPENAI_KEY_LENGTH: process.env.OPENAI_API_KEY?.length || 0
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start monitoring
async function startServer() {
  try {
    await db.init();
    console.log('Database initialized successfully');
    
    // Create HTTP server for both Express and WebSocket
    const server = createServer(app);
    
    // Initialize WebSocket server
    websocket.init(server);
    
    // Start URL monitoring service
    monitor.start();
    console.log('URL monitoring service started');
    
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
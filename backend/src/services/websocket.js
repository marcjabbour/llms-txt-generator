import { WebSocketServer } from 'ws';
import db from '../database/db.js';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  init(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, request) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial data
      this.sendWatchedUrls(ws);
    });

    console.log('WebSocket server initialized');
  }

  async handleMessage(ws, data) {
    switch (data.type) {
      case 'subscribe_watched_urls':
        await this.sendWatchedUrls(ws);
        break;
      
      case 'subscribe_generations':
        await this.sendRecentGenerations(ws);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type'
        }));
    }
  }

  async sendWatchedUrls(ws) {
    try {
      const watchedUrls = await db.getWatchedUrls();
      
      // Get recent generations for each URL
      const urlsWithGenerations = await Promise.all(
        watchedUrls.map(async (url) => {
          const generations = await db.getGenerationsForUrl(url.id, 3);
          return {
            ...url,
            recentGenerations: generations
          };
        })
      );

      ws.send(JSON.stringify({
        type: 'watched_urls',
        data: urlsWithGenerations
      }));
    } catch (error) {
      console.error('Error sending watched URLs:', error);
    }
  }

  async sendRecentGenerations(ws) {
    try {
      const generations = await db.getAllGenerations(20);
      ws.send(JSON.stringify({
        type: 'generations',
        data: generations
      }));
    } catch (error) {
      console.error('Error sending generations:', error);
    }
  }

  // Broadcast to all connected clients
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
          this.clients.delete(ws);
        }
      }
    });
  }

  // Notify about generation status updates
  async notifyGenerationUpdate(jobId, status) {
    try {
      const generation = await db.getGenerationByJobId(jobId);
      if (generation) {
        this.broadcast({
          type: 'generation_update',
          data: {
            ...generation,
            status
          }
        });

        // Also refresh watched URLs if this was an automatic generation
        if (generation.generation_trigger === 'automatic') {
          const watchedUrls = await db.getWatchedUrls();
          const urlsWithGenerations = await Promise.all(
            watchedUrls.map(async (url) => {
              const generations = await db.getGenerationsForUrl(url.id, 3);
              return {
                ...url,
                recentGenerations: generations
              };
            })
          );

          this.broadcast({
            type: 'watched_urls',
            data: urlsWithGenerations
          });
        }
      }
    } catch (error) {
      console.error('Error notifying generation update:', error);
    }
  }

  // Notify about new watched URLs
  async notifyWatchedUrlAdded(urlData) {
    const watchedUrls = await db.getWatchedUrls();
    const urlsWithGenerations = await Promise.all(
      watchedUrls.map(async (url) => {
        const generations = await db.getGenerationsForUrl(url.id, 3);
        return {
          ...url,
          recentGenerations: generations
        };
      })
    );

    this.broadcast({
      type: 'watched_urls',
      data: urlsWithGenerations
    });
  }

  getConnectedClients() {
    return this.clients.size;
  }
}

export default new WebSocketService();
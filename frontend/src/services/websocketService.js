class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 5000;
    this.maxReconnectAttempts = 10;
    this.reconnectAttempts = 0;
    this.listeners = new Map();
    this.isConnected = false;
    this.isConnecting = false;
    this.url = this.getWebSocketUrl();
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_WS_HOST || 'localhost:3001';
    return `${protocol}//${host}/ws`;
  }

  connect() {
    if (this.isConnecting || this.isConnected) {
      return Promise.resolve();
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Send subscription messages
          this.send({ type: 'subscribe_watched_urls' });
          this.send({ type: 'subscribe_generations' });
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this.isConnecting = false;
          this.ws = null;
          
          // Attempt reconnection
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnected = false;
          this.isConnecting = false;
          
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.reconnectInterval);
  }

  send(data) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send message:', data);
    }
  }

  handleMessage(data) {
    const listeners = this.listeners.get(data.type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket message handler:', error);
        }
      });
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
  }

  off(eventType, callback) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  // Convenience methods for common events
  onWatchedUrlsUpdate(callback) {
    this.on('watched_urls', callback);
  }

  onGenerationUpdate(callback) {
    this.on('generation_update', callback);
  }

  onGenerationsUpdate(callback) {
    this.on('generations', callback);
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // Send ping to keep connection alive
  ping() {
    this.send({ type: 'ping' });
  }

  // Start periodic ping to keep connection alive
  startKeepAlive() {
    setInterval(() => {
      if (this.isConnected) {
        this.ping();
      }
    }, 30000); // Ping every 30 seconds
  }
}

export default new WebSocketService();
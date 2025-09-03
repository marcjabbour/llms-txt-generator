import ApiService from './api';

class WatchService {
  async getWatchedUrls() {
    return await ApiService.get('/api/watch');
  }

  async addWatchedUrl(url, checkFrequency = 10) {
    return await ApiService.post('/api/watch', { url, checkFrequency });
  }

  async removeWatchedUrl(id) {
    return await ApiService.delete(`/api/watch/${id}`);
  }

  async getGenerations(urlId, limit = 10) {
    return await ApiService.get(`/api/watch/${urlId}/generations?limit=${limit}`);
  }

  async triggerRegeneration(urlId) {
    return await ApiService.post(`/api/watch/${urlId}/regenerate`);
  }

  async getAllGenerations(limit = 50) {
    return await ApiService.get(`/api/generate/all?limit=${limit}`);
  }

  async deleteGeneration(jobId) {
    return await ApiService.delete(`/api/generate/${jobId}`);
  }

  // Helper method to format timestamps
  formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // Format as precise timestamp
    const timeString = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    const dateString = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // Add relative time for recent timestamps
    let relativeTime = '';
    if (diffMinutes < 1) {
      relativeTime = 'Just now';
    } else if (diffMinutes < 60) {
      relativeTime = `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      relativeTime = `${diffHours}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      relativeTime = `${diffDays}d ago`;
    }

    return {
      full: `${timeString} on ${dateString}`,
      relative: relativeTime,
      timestamp: date.toISOString()
    };
  }

  // Helper to get status display info
  getStatusDisplay(status) {
    const statusMap = {
      pending: { text: 'Pending', color: '#fbbf24', icon: '⏳' },
      in_progress: { text: 'Generating', color: '#3b82f6', icon: '🔄' },
      completed: { text: 'Completed', color: '#10b981', icon: '✅' },
      failed: { text: 'Failed', color: '#ef4444', icon: '❌' },
      // Add mapping for null/undefined status - this happens when no generations exist yet
      null: { text: 'Monitoring', color: '#8b5cf6', icon: '👁️' },
      undefined: { text: 'Monitoring', color: '#8b5cf6', icon: '👁️' },
      monitoring: { text: 'Monitoring', color: '#8b5cf6', icon: '👁️' }
    };

    return statusMap[status] || { text: 'Monitoring', color: '#8b5cf6', icon: '👁️' };
  }

  // Calculate next check time
  getNextCheckTime(lastUpdated, checkFrequency) {
    // If no last updated time, it should check soon
    if (!lastUpdated) return 'Soon';
    
    const lastCheck = new Date(lastUpdated);
    const nextCheck = new Date(lastCheck.getTime() + (checkFrequency * 60 * 1000));
    console.log('Last checked:', lastCheck);
    console.log('Next check time:', nextCheck);
    console.log('Check frequency:', checkFrequency);
    console.log('Last Check Time' + lastCheck.getTime())
    const now = new Date();
    
    // If next check time has passed, it's overdue
    if (nextCheck <= now) {
      return 'Due now';
    }
    
    const diffMs = nextCheck - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    console.log('Diff Ms: ', diffMs)
    console.log('Diff Minutes: ', diffMinutes)
    
    if (diffMinutes < 1) {
      return 'Soon';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      if (remainingMinutes === 0) {
        return `${diffHours}h`;
      } else {
        return `${diffHours}h ${remainingMinutes}m`;
      }
    }
  }
}

export default new WatchService();
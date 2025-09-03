import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import watchService from '../services/watchService';
import websocketService from '../services/websocketService';
import scrapingService from '../services/scrapingService';
import './WatchedUrlsDashboard.css';

const WatchedUrlsDashboard = () => {
  const [watchedUrls, setWatchedUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({ isConnected: false });
  const [showAllGenerations, setShowAllGenerations] = useState(false);
  const [allGenerations, setAllGenerations] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadWatchedUrls();
    loadAllGenerations(); // Load all generations immediately on mount
    connectWebSocket();

    return () => {
      websocketService.disconnect();
    };
  }, []);

  const loadWatchedUrls = async () => {
    try {
      setLoading(true);
      const response = await watchService.getWatchedUrls();
      if (response.success) {
        setWatchedUrls(response.data);
      } else {
        setError('Failed to load watched URLs');
      }
    } catch (err) {
      setError(err.message || 'Failed to load watched URLs');
    } finally {
      setLoading(false);
    }
  };

  const loadAllGenerations = async () => {
    try {
      const response = await watchService.getAllGenerations();
      if (response.success) {
        setAllGenerations(response.data);
      }
    } catch (error) {
      console.error('Failed to load all generations:', error);
      // Don't set error here as it might interfere with loading state
    }
  };

  const connectWebSocket = async () => {
    try {
      await websocketService.connect();
      websocketService.startKeepAlive();

      // Listen for updates
      websocketService.onWatchedUrlsUpdate((data) => {
        setWatchedUrls(data.data);
      });

      websocketService.onGenerationUpdate((data) => {
        console.log('Generation update received:', data);
        
        // Update specific generation in the watched URLs list
        setWatchedUrls(prevUrls => {
          return prevUrls.map(url => ({
            ...url,
            recentGenerations: url.recentGenerations.map(gen => 
              gen.job_id === data.data.job_id ? { ...gen, ...data.data } : gen
            )
          }));
        });
        
        // Also update the all generations list
        setAllGenerations(prevGens => {
          // Check if generation already exists
          const existingGenIndex = prevGens.findIndex(gen => gen.job_id === data.data.job_id);
          
          if (existingGenIndex !== -1) {
            // Update existing generation
            return prevGens.map(gen => 
              gen.job_id === data.data.job_id ? { ...gen, ...data.data } : gen
            );
          } else {
            // Add new generation to the beginning of the list
            return [data.data, ...prevGens];
          }
        });
      });

      // Update connection status
      const updateConnectionStatus = () => {
        setConnectionStatus(websocketService.getConnectionStatus());
      };
      
      updateConnectionStatus();
      const interval = setInterval(updateConnectionStatus, 1000);
      
      return () => clearInterval(interval);
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setConnectionStatus({ isConnected: false, error: error.message });
    }
  };

  const handleRemoveUrl = async (urlId) => {
    if (!window.confirm('Are you sure you want to stop watching this URL?')) {
      return;
    }

    try {
      await watchService.removeWatchedUrl(urlId);
      setWatchedUrls(prevUrls => prevUrls.filter(url => url.id !== urlId));
    } catch (error) {
      setError(error.message || 'Failed to remove URL');
    }
  };

  const handleTriggerRegeneration = async (urlId) => {
    try {
      await watchService.triggerRegeneration(urlId);
      // WebSocket will handle the UI update
    } catch (error) {
      setError(error.message || 'Failed to trigger regeneration');
    }
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleViewAllGenerations = async () => {
    if (showAllGenerations) {
      setShowAllGenerations(false);
      return;
    }

    setShowAllGenerations(true);
    // Refresh the generations when switching to all generations view
    await loadAllGenerations();
  };

  const handleDeleteGeneration = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this generation? This action cannot be undone.')) {
      return;
    }

    try {
      await watchService.deleteGeneration(jobId);
      
      // Remove from all generations list if shown
      if (showAllGenerations) {
        setAllGenerations(prev => prev.filter(gen => gen.job_id !== jobId));
      }
      
      // Also refresh watched URLs to update their recent generations
      loadWatchedUrls();
    } catch (error) {
      setError('Failed to delete generation: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading watched URLs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>URL Monitoring Dashboard</h1>
        <div className="header-controls">
          <div className={`connection-status ${connectionStatus.isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-indicator"></span>
            {connectionStatus.isConnected ? 'Live Updates' : 'Reconnecting...'}
          </div>
          <div className="header-left">
            <button onClick={handleBackToHome} className="back-btn">
              ← Back to Generator
            </button>
            <button 
              onClick={handleViewAllGenerations} 
              className={`view-all-btn ${showAllGenerations ? 'active' : ''}`}
            >
              {showAllGenerations ? '🔍 View Watched URLs' : '📄 View All Generations'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)} className="close-btn">×</button>
        </div>
      )}

      {showAllGenerations ? (
        allGenerations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <h2>No generations found</h2>
            <p>Generate your first llms.txt file to see it here.</p>
            <button onClick={handleBackToHome} className="primary-btn">
              Generate Your First File
            </button>
          </div>
        ) : (
          <AllGenerationsView 
            generations={allGenerations}
            onDeleteGeneration={handleDeleteGeneration}
          />
        )
      ) : watchedUrls.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h2>No URLs being watched</h2>
          <p>Generate an llms.txt file and add it to your watch list to see automatic updates here.</p>
          <button onClick={handleBackToHome} className="primary-btn">
            Generate Your First File
          </button>
        </div>
      ) : (
        <div className="urls-grid">
          {watchedUrls.map(url => (
            <WatchedUrlCard
              key={url.id}
              url={url}
              onRemove={handleRemoveUrl}
              onRegenerate={handleTriggerRegeneration}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const WatchedUrlCard = ({ url, onRemove, onRegenerate }) => {
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const latestGeneration = url.recentGenerations?.[0];
  
  // Update current time every 30 seconds for relative timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleViewGeneration = async (generation, type = 'llms') => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
      const endpoint = type === 'full' ? 'llms-full.txt' : 'llms.txt';
      const response = await fetch(`${API_BASE_URL}/api/generate/download/${generation.job_id}/${endpoint}`);
      
      if (response.ok) {
        const content = await response.text();
        const title = `${new URL(url.url).hostname} - ${endpoint}`;
        
        // Open in a new window/tab for viewing
        const newWindow = window.open('');
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>${title}</title>
                <style>
                  body { 
                    font-family: 'Courier New', monospace; 
                    white-space: pre-wrap; 
                    padding: 20px; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    line-height: 1.4; 
                  }
                  h1, h2, h3 { color: #333; }
                </style>
              </head>
              <body>${content.replace(/\n/g, '<br>')}</body>
            </html>
          `);
          newWindow.document.close();
        } else {
          alert('Unable to open new window. Please check your browser\'s popup blocker settings.');
        }
      } else {
        // Parse error response
        try {
          const errorData = await response.json();
          alert(errorData.error || 'Unable to view file content.');
        } catch {
          alert('Unable to view file content.');
        }
      }
    } catch (error) {
      console.error('Failed to view generation:', error);
      alert('Unable to view file content.');
    }
  };

  const handleDownloadGeneration = async (generation, type = 'llms') => {
    try {
      await scrapingService.download(generation.job_id, type);
    } catch (error) {
      console.error('Download failed:', error);
      alert(error.message || 'Download failed. The file may no longer be available.');
    }
  };
  
  // If there are no recent generations, show "Monitoring" status
  // If there are recent generations, show the status of the latest one
  const displayStatus = latestGeneration?.status || 'monitoring';
  const statusDisplay = watchService.getStatusDisplay(displayStatus);
  const lastUpdatedFormat = watchService.formatTimestamp(url.last_updated);
  const nextCheck = watchService.getNextCheckTime(url.last_updated, url.check_frequency);

  return (
    <div className="url-card">
      <div className="url-header">
        <div className="url-info">
          <h3 className="url-title">{new URL(url.url).hostname}</h3>
          <p className="url-link">{url.url}</p>
        </div>
        <div className="url-actions">
          <button
            onClick={() => onRegenerate(url.id)}
            className="action-btn regenerate-btn"
            disabled={latestGeneration?.status === 'in_progress'}
          >
            🔄
          </button>
          <button
            onClick={() => onRemove(url.id)}
            className="action-btn remove-btn"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="url-status">
        <div className="status-badge" style={{ backgroundColor: statusDisplay.color }}>
          <span className="status-icon">{statusDisplay.icon}</span>
          <span className="status-text">{statusDisplay.text}</span>
        </div>
        {latestGeneration?.status === 'in_progress' && (
          <div className="progress-indicator">
            <div className="progress-bar"></div>
          </div>
        )}
      </div>

      <div className="url-details">
        <div className="detail-row">
          <span className="detail-label">Last Updated:</span>
          <span className="detail-value" title={lastUpdatedFormat.full}>
            {lastUpdatedFormat.relative}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Next Check:</span>
          <span className="detail-value">{nextCheck}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Check Frequency:</span>
          <span className="detail-value">{url.check_frequency}m</span>
        </div>
      </div>

      {latestGeneration && latestGeneration.status === 'completed' && (
        <div className="url-actions-row">
          <div className="action-group">
            <span className="action-label">Current llms.txt:</span>
            <button 
              onClick={() => handleViewGeneration(latestGeneration, 'llms')}
              className="view-btn small"
            >
              View
            </button>
            <button 
              onClick={() => handleDownloadGeneration(latestGeneration, 'llms')}
              className="download-btn small"
            >
              Download
            </button>
          </div>
        </div>
      )}

      {url.recentGenerations?.length > 0 && (
        <div className="generations-section">
          <button
            onClick={() => setExpanded(!expanded)}
            className="expand-btn"
          >
            Recent Generations ({url.recentGenerations.length})
            <span className={`expand-icon ${expanded ? 'expanded' : ''}`}>▼</span>
          </button>

          {expanded && (
            <div className="generations-list">
              {url.recentGenerations.map(generation => (
                <GenerationItem 
                  key={generation.id} 
                  generation={generation} 
                  onView={handleViewGeneration}
                  onDownload={handleDownloadGeneration}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AllGenerationsView = ({ generations, onDeleteGeneration }) => {
  return (
    <div className="all-generations-view">
      <h2>All Generations ({generations.length})</h2>
      {generations.length === 0 ? (
        <div className="empty-generations">
          <p>No generations found</p>
        </div>
      ) : (
        <div className="generations-grid">
          {generations.map(generation => (
            <div key={generation.job_id} className="generation-card">
              <div className="generation-card-header">
                <div className="generation-info">
                  <h4>{new URL(generation.url || generation.watched_url || 'https://example.com').hostname}</h4>
                  <p className="generation-url">{generation.url || generation.watched_url}</p>
                </div>
                <button
                  onClick={() => onDeleteGeneration(generation.job_id)}
                  className="delete-generation-btn"
                  title="Delete this generation"
                >
                  🗑️
                </button>
              </div>
              <GenerationItem generation={generation} showUrl={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const GenerationItem = ({ generation, showUrl = true, onView, onDownload }) => {
  const statusDisplay = watchService.getStatusDisplay(generation.status);
  const startedFormat = watchService.formatTimestamp(generation.started_at);
  const completedFormat = watchService.formatTimestamp(generation.completed_at);
  
  const duration = generation.started_at && generation.completed_at
    ? Math.round((new Date(generation.completed_at) - new Date(generation.started_at)) / 1000)
    : null;

  return (
    <div className="generation-item">
      <div className="generation-header">
        <div className="generation-status">
          <span className="status-icon">{statusDisplay.icon}</span>
          <span className="status-text">{statusDisplay.text}</span>
        </div>
        <div className="generation-actions">
          <div className="generation-trigger">
            {generation.generation_trigger === 'automatic' ? '🤖 Auto' : '👤 Manual'}
          </div>
          {generation.status === 'completed' && onView && onDownload && (
            <div className="generation-buttons">
              <button 
                onClick={() => onView(generation, 'llms')}
                className="view-btn tiny"
                title="View this generation"
              >
                👁️
              </button>
              <button 
                onClick={() => onDownload(generation, 'llms')}
                className="download-btn tiny"
                title="Download this generation"
              >
                📥
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="generation-times">
        <div className="time-info">
          <span className="time-label">Started:</span>
          <span className="time-value" title={startedFormat.full}>
            {startedFormat.relative}
          </span>
        </div>
        {generation.completed_at && (
          <div className="time-info">
            <span className="time-label">Completed:</span>
            <span className="time-value" title={completedFormat.full}>
              {completedFormat.relative}
            </span>
          </div>
        )}
        {duration && (
          <div className="time-info">
            <span className="time-label">Duration:</span>
            <span className="time-value">{duration}s</span>
          </div>
        )}
      </div>

      {generation.error_message && (
        <div className="generation-error">
          <strong>Error:</strong> {generation.error_message}
        </div>
      )}
    </div>
  );
};

export default WatchedUrlsDashboard;
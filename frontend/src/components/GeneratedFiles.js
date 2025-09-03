import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import scrapingService from '../services/scrapingService';
import watchService from '../services/watchService';

const GeneratedFiles = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [watchedUrls, setWatchedUrls] = useState(new Set());

  useEffect(() => {
    loadFiles();
    loadWatchedUrls();
  }, [location.state]);

  const loadFiles = () => {
    // Load files from localStorage
    const savedFiles = JSON.parse(localStorage.getItem('generatedFiles') || '[]');
    
    // Add new file if coming from generation
    if (location.state?.newFile) {
      const newFile = {
        ...location.state.newFile,
        domain: new URL(location.state.newFile.url).hostname,
        createdAt: new Date(location.state.newFile.completedAt).toLocaleDateString(),
        status: 'completed'
      };
      
      // Check if file already exists to prevent duplicates
      const fileExists = savedFiles.some(file => 
        file.id === newFile.id || 
        (file.url === newFile.url && Math.abs(new Date(file.completedAt) - new Date(newFile.completedAt)) < 1000)
      );
      
      if (!fileExists) {
        const fileToStore = {
          ...newFile,
          result: undefined // Don't store large content in localStorage
        };
        const updatedFiles = [fileToStore, ...savedFiles];
        setFiles([newFile, ...savedFiles]); // Keep full data in state
        try {
          localStorage.setItem('generatedFiles', JSON.stringify(updatedFiles));
        } catch (error) {
          console.warn('Failed to save to localStorage:', error);
          // Continue without saving to localStorage
        }
      } else {
        setFiles(savedFiles);
      }
      
      // Clear the state
      window.history.replaceState({}, document.title);
    } else {
      setFiles(savedFiles);
    }
    
    setLoading(false);
  };

  const loadWatchedUrls = async () => {
    try {
      const response = await watchService.getWatchedUrls();
      if (response.success) {
        const watchedUrlsSet = new Set(response.data.map(watchedUrl => watchedUrl.url));
        setWatchedUrls(watchedUrlsSet);
      }
    } catch (error) {
      console.error('Failed to load watched URLs:', error);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleWatchUrl = async (file) => {
    try {
      await watchService.addWatchedUrl(file.url);
      
      // Update the watched URLs state
      setWatchedUrls(prev => new Set([...prev, file.url]));
      
      // Show success message instead of navigating immediately
      alert(`Successfully added ${file.domain} to watch list! You can view monitoring status in the dashboard.`);
    } catch (error) {
      console.error('Failed to add URL to watch list:', error);
      // Check if it's already being watched
      if (error.message.includes('already being watched')) {
        setWatchedUrls(prev => new Set([...prev, file.url]));
      } else {
        alert('Failed to add URL to watch list: ' + error.message);
      }
    }
  };

  const handleStopWatching = async (file) => {
    try {
      // First get the watched URL ID
      const response = await watchService.getWatchedUrls();
      if (response.success) {
        const watchedUrl = response.data.find(wu => wu.url === file.url);
        if (watchedUrl) {
          await watchService.removeWatchedUrl(watchedUrl.id);
          
          // Update the watched URLs state
          setWatchedUrls(prev => {
            const newSet = new Set(prev);
            newSet.delete(file.url);
            return newSet;
          });
          
          alert(`Stopped watching ${file.domain} for changes.`);
        } else {
          // URL not found in watch list, update state
          setWatchedUrls(prev => {
            const newSet = new Set(prev);
            newSet.delete(file.url);
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error('Failed to stop watching URL:', error);
      alert('Failed to stop watching URL: ' + error.message);
    }
  };

  const goToDashboard = () => {
    navigate('/dashboard');
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Are you sure you want to delete the generated file for ${file.domain}? This action cannot be undone.`)) {
      return;
    }

    try {
      await scrapingService.deleteGeneration(file.id);
      
      // Remove from state
      setFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
      
      // Remove from localStorage
      const savedFiles = JSON.parse(localStorage.getItem('generatedFiles') || '[]');
      const updatedFiles = savedFiles.filter(f => f.id !== file.id);
      try {
        localStorage.setItem('generatedFiles', JSON.stringify(updatedFiles));
      } catch (error) {
        console.warn('Failed to update localStorage:', error);
      }

    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file: ' + error.message);
    }
  };

  const handleDownload = async (file, type = 'llms') => {
    try {
      // Try API download first
      await scrapingService.download(file.id, type);
    } catch (error) {
      console.error('API download failed:', error);
      // Fall back to client-side download if file has result data
      if (file.result) {
        handleDownloadFallback(file, type);
      } else {
        alert('Unable to download file. The file may have been generated in a previous session and the content is no longer available. Please regenerate the file.');
      }
    }
  };

  const handleDownloadFallback = (file, type = 'llms') => {
    if (!file.result) {
      console.error('No content available for download');
      return;
    }

    let content;
    let filename;
    
    if (file.result.data?.llmsContent) {
      content = file.result.data.llmsContent;
      filename = `${file.domain}-llms.txt`;
    } else {
      // Legacy format fallback
      content = `# ${file.domain}\n\n## URL\n${file.url}\n\n## Content\n${file.result.text || 'No text content extracted'}\n\n## Generated\n${file.createdAt}`;
      filename = `${file.domain}-llms.txt`;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleView = async (file, type = 'llms') => {
    let content;
    let title;
    
    // First try to get content from file.result (current session files)
    if (file.result) {
      if (file.result.data?.llmsContent) {
        content = file.result.data.llmsContent;
        title = `${file.domain} - llms.txt`;
      } else {
        // Legacy format fallback
        content = `URL: ${file.url}\nGenerated: ${file.createdAt}\n\n${file.result.text || 'No text content extracted'}`;
        title = `${file.domain} - llms.txt`;
      }
    } else {
      // For files without result data, try to fetch from backend
      try {
        const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
        const response = await fetch(`${API_BASE_URL}/api/generate/download/${file.id}/llms.txt`);
        
        if (response.ok) {
          content = await response.text();
          title = `${file.domain} - llms.txt`;
        } else {
          // Parse error response
          try {
            const errorData = await response.json();
            alert(errorData.error || 'Unable to view file content. The file may have been generated in a previous session and the content is no longer available. Please regenerate the file.');
          } catch {
            alert('Unable to view file content. The file may have been generated in a previous session and the content is no longer available. Please regenerate the file.');
          }
          return;
        }
      } catch (error) {
        console.error('Failed to fetch file content:', error);
        alert('Unable to view file content. The file may have been generated in a previous session and the content is no longer available. Please regenerate the file.');
        return;
      }
    }
    
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
  };

  return (
    <div className="generated-files">
      <div className="container">
        <div className="header">
          <button onClick={handleBack} className="back-btn">
            ← Back to Generator
          </button>
          <h1>Generated Files</h1>
          <button onClick={goToDashboard} className="dashboard-btn">
            📊 Monitoring Dashboard
          </button>
        </div>

        <div className="files-list">
          {loading ? (
            <div className="loading-state">
              <p>Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <p>No files generated yet</p>
              <button onClick={handleBack} className="generate-first-btn">
                Generate Your First File
              </button>
            </div>
          ) : (
            <div className="files-grid">
              {files.map((file) => (
                <div key={file.id} className="file-card">
                  <div className="file-info">
                    <div className="file-header">
                      <div className="file-title-section">
                        <h3>{file.domain}</h3>
                        <p className="file-url">{file.url}</p>
                        <p className="file-date">
                          Generated: {watchService.formatTimestamp(file.completedAt).full || file.createdAt}
                        </p>
                        <div className="status-row">
                          <span className={`status ${file.status}`}>
                            {file.status}
                          </span>
                          {watchedUrls.has(file.url) && (
                            <span className="watching-indicator" title="This URL is being actively monitored for changes">
                              👁️ Watching
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteFile(file)}
                        className="delete-file-btn"
                        title="Delete this generated file"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="file-actions">
                    <div className="action-group">
                      <span className="action-label">llms.txt:</span>
                      <button 
                        onClick={() => handleView(file, 'llms')}
                        className="view-btn small"
                      >
                        View
                      </button>
                      <button 
                        onClick={() => handleDownload(file, 'llms')}
                        className="download-btn small"
                      >
                        Download
                      </button>
                    </div>
                    <div className="watch-section">
                      {watchedUrls.has(file.url) ? (
                        <button 
                          onClick={() => handleStopWatching(file)}
                          className="stop-watch-btn"
                          title="Stop watching this URL for changes"
                        >
                          👁️ Stop Watching
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleWatchUrl(file)}
                          className="watch-btn"
                          title="Add this URL to your watch list for automatic updates"
                        >
                          👁️ Watch for Changes
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneratedFiles;
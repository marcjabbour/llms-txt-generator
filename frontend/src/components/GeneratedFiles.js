import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import scrapingService from '../services/scrapingService';

const GeneratedFiles = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        const updatedFiles = [newFile, ...savedFiles];
        setFiles(updatedFiles);
        localStorage.setItem('generatedFiles', JSON.stringify(updatedFiles));
      } else {
        setFiles(savedFiles);
      }
      
      // Clear the state
      window.history.replaceState({}, document.title);
    } else {
      setFiles(savedFiles);
    }
    
    setLoading(false);
  }, [location.state]);

  const handleBack = () => {
    navigate('/');
  };

  const handleDownload = async (file, type = 'llms') => {
    try {
      await scrapingService.download(file.id, type);
    } catch (error) {
      console.error('Download failed:', error);
      handleDownloadFallback(file, type);
    }
  };

  const handleDownloadFallback = (file, type = 'llms') => {
    if (!file.result) {
      console.error('No content available for download');
      return;
    }

    let content;
    let filename;
    
    if (type === 'full' && file.result.data?.llmsFullContent) {
      content = file.result.data.llmsFullContent;
      filename = `${file.domain}-llms-full.txt`;
    } else if (file.result.data?.llmsContent) {
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

  const handleView = (file, type = 'llms') => {
    if (!file.result) {
      console.error('No content available to view');
      return;
    }

    let content;
    let title;
    
    if (type === 'full' && file.result.data?.llmsFullContent) {
      content = file.result.data.llmsFullContent;
      title = `${file.domain} - llms-full.txt`;
    } else if (file.result.data?.llmsContent) {
      content = file.result.data.llmsContent;
      title = `${file.domain} - llms.txt`;
    } else {
      // Legacy format fallback
      content = `URL: ${file.url}\nGenerated: ${file.createdAt}\n\n${file.result.text || 'No text content extracted'}`;
      title = `${file.domain} - llms.txt`;
    }
    
    // Open in a new window/tab for viewing
    const newWindow = window.open('');
    newWindow.document.write(`
      <html>
        <head><title>${title}</title></head>
        <body style="font-family: monospace; white-space: pre-wrap; padding: 20px;">
          ${content.replace(/\n/g, '<br>')}
        </body>
      </html>
    `);
    newWindow.document.close();
  };

  return (
    <div className="generated-files">
      <div className="container">
        <div className="header">
          <button onClick={handleBack} className="back-btn">
            ← Back
          </button>
          <h1>Generated Files</h1>
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
                    <h3>{file.domain}</h3>
                    <p className="file-url">{file.url}</p>
                    <p className="file-date">Generated: {file.createdAt}</p>
                    <span className={`status ${file.status}`}>
                      {file.status}
                    </span>
                  </div>
                  <div className="file-actions">
                    <div className="action-group">
                      <span className="action-label">LLMS.txt:</span>
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
                    {file.result?.data?.llmsFullContent && (
                      <div className="action-group">
                        <span className="action-label">LLMS-Full.txt:</span>
                        <button 
                          onClick={() => handleView(file, 'full')}
                          className="view-btn small"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleDownload(file, 'full')}
                          className="download-btn small"
                        >
                          Download
                        </button>
                      </div>
                    )}
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
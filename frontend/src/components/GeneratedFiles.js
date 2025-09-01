import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

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

  const handleDownload = (file) => {
    if (!file.result) {
      console.error('No content available for download');
      return;
    }

    const content = `# ${file.domain}\n\n## URL\n${file.url}\n\n## Content\n${file.result.text || 'No text content extracted'}\n\n## Generated\n${file.createdAt}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.domain}-llms.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleView = (file) => {
    if (!file.result) {
      console.error('No content available to view');
      return;
    }

    const content = `URL: ${file.url}\nGenerated: ${file.createdAt}\n\n${file.result.text || 'No text content extracted'}`;
    
    // Open in a new window/tab for viewing
    const newWindow = window.open('');
    newWindow.document.write(`
      <html>
        <head><title>${file.domain} - llms.txt</title></head>
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
                    <button 
                      onClick={() => handleView(file)}
                      className="view-btn"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => handleDownload(file)}
                      className="download-btn"
                    >
                      Download
                    </button>
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
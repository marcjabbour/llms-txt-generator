import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import scrapingService from '../services/scrapingService';

const MainScreen = ({ isBackendHealthy }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleGenerate = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const jobResponse = await scrapingService.generate(url);
      const result = await scrapingService.waitForCompletion(
        jobResponse.jobId,
        (status) => console.log('Status:', status.status)
      );

      console.log('Generation completed:', result);
      navigate('/generated-files', { 
        state: { 
          newFile: {
            id: result.id,
            url: result.url,
            result: result.result,
            completedAt: result.completedAt
          }
        }
      });
    } catch (err) {
      setError(err.message || 'Failed to generate content');
      console.error('Generation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFiles = () => {
    navigate('/generated-files');
  };

  return (
    <div className="main-screen">
      <div className="container">
        <h1>LLMS.txt Generator</h1>
        <p className="subtitle">Generate llms.txt files from websites</p>
        
        {!isBackendHealthy && (
          <div className="error-banner">
            ⚠️ Backend service is not available. Please make sure the backend server is running.
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="url-section">
          <input
            type="url"
            placeholder="Enter website URL (e.g., https://example.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="url-input"
            disabled={isLoading}
          />
          <button 
            onClick={handleGenerate}
            className="generate-btn"
            disabled={!url.trim() || isLoading || !isBackendHealthy}
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </button>
        </div>

        <div className="divider">
          <span>or</span>
        </div>

        <button 
          onClick={handleViewFiles}
          className="view-files-btn"
        >
          View Generated Files
        </button>
      </div>
    </div>
  );
};

// Check backend health on component mount
const MainScreenWithHealthCheck = () => {
  const [isBackendHealthy, setIsBackendHealthy] = useState(true);

  useEffect(() => {
    const checkBackendHealth = async () => {
      const isHealthy = await scrapingService.healthCheck();
      setIsBackendHealthy(isHealthy);
    };

    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return <MainScreen isBackendHealthy={isBackendHealthy} />;
};

export default MainScreenWithHealthCheck;
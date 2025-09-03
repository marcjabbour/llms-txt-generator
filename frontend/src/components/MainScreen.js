import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import scrapingService from '../services/scrapingService';
import watchService from '../services/watchService';

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
      
      // Show immediate success message
      const domain = new URL(url).hostname;
      alert(`Initiating Generation for ${domain}, check status in Dashboard`);
      
      // Navigate to dashboard immediately to show the in-progress generation
      navigate('/dashboard');
      
      // Don't wait for completion - let the dashboard handle live updates via WebSocket
    } catch (err) {
      setError(err.message || 'Failed to generate content');
      console.error('Generation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDashboard = () => {
    navigate('/dashboard');
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

        <div className="action-buttons centered">
          <button 
            onClick={handleViewDashboard}
            className="dashboard-btn"
          >
            📊 Dashboard
          </button>
        </div>
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
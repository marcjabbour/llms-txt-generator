import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import MainScreen from './components/MainScreen';
import WatchedUrlsDashboard from './components/WatchedUrlsDashboard';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainScreen />} />
          <Route path="/dashboard" element={<WatchedUrlsDashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
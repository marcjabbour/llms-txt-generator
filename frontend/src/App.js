import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import MainScreen from './components/MainScreen';
import GeneratedFiles from './components/GeneratedFiles';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainScreen />} />
          <Route path="/generated-files" element={<GeneratedFiles />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
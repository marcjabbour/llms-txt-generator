# LLMS.txt Generator

A comprehensive web scraping solution that generates llms.txt files from websites with automatic monitoring and real-time updates.

## Project Structure

```
llms-txt-generator/
├── frontend/                    # React frontend application
│   ├── src/components/         # UI components
│   ├── src/services/          # API and WebSocket services
│   └── public/                # Static assets
├── backend/                    # Node.js backend API
│   ├── src/controllers/       # Request handlers
│   ├── src/services/          # Business logic (scraper, monitor, websocket)
│   ├── src/database/          # SQLite database layer
│   ├── src/routes/           # API routes
│   └── generated-files/      # Local file storage
└── README.md                 # This file
```

## Core Features

### 🔄 **Intelligent Web Monitoring**
- **Automatic URL monitoring** with configurable check frequencies (default: 10 minutes)
- **Advanced change detection** using HTTP headers (ETag, Last-Modified) and HTML content hashing
- **Smart content comparison** that avoids false positives from timestamps and dynamic content
- **Real-time notifications** via WebSocket connections

### 📄 **Content Generation**
- **AI-powered content extraction** using OpenAI for structured llms.txt generation
- **Multi-page scraping** with configurable depth and page limits
- **Dynamic content support** using Puppeteer for JavaScript-heavy sites
- **Persistent file storage** with automatic cleanup and organization

### 📊 **Dashboard & Management**
- **Generation history tracking** with detailed status and timing information
- **Watch/unwatch functionality** - manually control which URLs to monitor
- **Real-time status updates** showing pending, in-progress, completed, and failed generations
- **Bulk operations** for managing multiple URLs and generations

### 🛠 **Technical Architecture**
- **SQLite database** for persistent storage of URLs, generations, and monitoring data
- **WebSocket integration** for real-time UI updates
- **Background job processing** with proper error handling and retry logic
- **RESTful API** with comprehensive endpoints for all operations

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env`:
   ```bash
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   
   # OpenAI Configuration (required)
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Scraping Configuration
   SCRAPING_TIMEOUT=30000
   MAX_CONCURRENT_JOBS=5
   SCRAPING_MAX_PAGES=50
   SCRAPING_MAX_DEPTH=3
   
   # Monitoring Configuration
   DEFAULT_CHECK_FREQUENCY_MINUTES=10
   
   # Puppeteer Configuration
   PUPPETEER_HEADLESS=true
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env`:
   ```bash
   REACT_APP_API_BASE_URL=http://localhost:3001
   ```

4. Start the frontend development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`

## Usage Guide

### Basic Generation
1. Open `http://localhost:3000` in your browser
2. Enter a website URL and click "Generate"
3. Monitor progress in real-time via the Dashboard
4. Download completed llms.txt files

### URL Monitoring
1. Navigate to the Dashboard (shows all generations by default)
2. Click the **👁️** (eye) button on any generation card to start monitoring that URL
3. Watched URLs will automatically regenerate when content changes
4. Click the **👁️‍🗨️** (watched eye) button to stop monitoring
5. Switch between "All Generations" and "Watched URLs" views using the toggle button

### Advanced Features
- **Manual regeneration**: Use the 🔄 button on watched URLs
- **Generation deletion**: Use the 🗑️ button to remove unwanted generations
- **Real-time monitoring**: Live connection status indicator shows WebSocket health
- **Error handling**: Detailed error messages and retry capabilities

## API Endpoints

### Generation Management
- `POST /api/generate` - Start a new scraping job
- `GET /api/generate/status/:jobId` - Check the status of a scraping job
- `GET /api/generate/download/:jobId/llms.txt` - Download generated file
- `GET /api/generate/all` - Get all generations with pagination
- `DELETE /api/generate/:jobId` - Delete a specific generation

### URL Monitoring
- `GET /api/watch` - Get all watched URLs
- `POST /api/watch` - Add a URL to the watch list
- `DELETE /api/watch/:id` - Remove a URL from the watch list
- `POST /api/watch/:id/regenerate` - Manually trigger regeneration
- `GET /api/watch/:id/generations` - Get generation history for a URL

### System
- `GET /health` - Health check endpoint

## Database Schema

The application uses SQLite with two main tables:

### `watched_urls`
- `id` - Primary key
- `url` - The URL being monitored
- `first_created` - When monitoring started
- `last_updated` - Last successful check
- `check_frequency` - Minutes between checks
- `is_active` - Whether monitoring is enabled
- `last_content_hash` - Hash of last known content

### `generations`
- `id` - Primary key
- `watched_url_id` - Foreign key to watched_urls
- `job_id` - Unique identifier for the generation job
- `status` - Current status (pending, in_progress, completed, failed)
- `started_at` - When generation began
- `completed_at` - When generation finished
- `file_path` - Path to generated file
- `url` - Source URL
- `generation_trigger` - Whether manual or automatic
- `error_message` - Error details if failed

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_CHECK_FREQUENCY_MINUTES` | How often to check URLs for changes | 10 |
| `SCRAPING_MAX_PAGES` | Maximum pages to scrape per site | 50 |
| `SCRAPING_MAX_DEPTH` | Maximum link depth to follow | 3 |
| `SCRAPING_TIMEOUT` | Timeout for scraping operations (ms) | 30000 |
| `MAX_CONCURRENT_JOBS` | Maximum simultaneous scraping jobs | 5 |
| `OPENAI_API_KEY` | OpenAI API key for content processing | Required |

### Monitoring Behavior
- URLs are checked at their configured frequency (default 10 minutes)
- Change detection uses HTTP headers first, falls back to content hashing
- Failed checks don't trigger regeneration to avoid false positives
- Content hashes are normalized to avoid timestamp-based false changes

## Troubleshooting

### Common Issues
1. **WebSocket connection failures**: Check firewall settings and ensure backend is running
2. **Generation timeouts**: Increase `SCRAPING_TIMEOUT` for complex sites
3. **OpenAI API errors**: Verify your API key and quota
4. **File not found errors**: Check the `generated-files/` directory permissions

### Monitoring Issues
- **False positive regenerations**: The system uses intelligent content comparison to minimize these
- **Missed changes**: Increase check frequency or verify the target site supports proper HTTP headers
- **Memory usage**: The system automatically cleans up old files and limits concurrent operations
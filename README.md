# LLMS.txt Generator

Generate llms.txt files from websites using web scraping.

## Project Structure

```
llms-txt-generator/
├── frontend/          # React frontend application
├── backend/           # Node.js backend API
└── README.md         # This file
```

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

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Start the backend server:
   ```bash
   npm run dev
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

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Start the frontend development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`

## Usage

1. Make sure both backend and frontend servers are running
2. Open your browser and go to `http://localhost:3000`
3. Enter a website URL and click "Generate"
4. The system will scrape the website and generate a llms.txt file
5. View and download your generated files from the "Generated Files" page

## API Endpoints

- `POST /api/generate` - Start a new scraping job
- `GET /api/generate/status/:jobId` - Check the status of a scraping job
- `GET /health` - Health check endpoint

## Features

- Web scraping with both static and dynamic content support
- Asynchronous job processing
- File generation and download
- Responsive web interface
- Error handling and loading states
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    const dbPath = path.join(__dirname, '../../data/database.sqlite');
    
    // Ensure data directory exists
    await import('fs/promises').then(fs => fs.mkdir(path.dirname(dbPath), { recursive: true }));

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });

    await this.createTables();
    return this;
  }

  async createTables() {
    const createWatchedUrlsTable = `
      CREATE TABLE IF NOT EXISTS watched_urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        first_created DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        check_frequency INTEGER DEFAULT 60,
        is_active BOOLEAN DEFAULT 1,
        last_content_hash TEXT
      )
    `;

    const createGenerationsTable = `
      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watched_url_id INTEGER,
        job_id TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        file_path TEXT,
        error_message TEXT,
        url TEXT NOT NULL,
        generation_trigger TEXT DEFAULT 'manual',
        FOREIGN KEY (watched_url_id) REFERENCES watched_urls (id) ON DELETE CASCADE
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createWatchedUrlsTable, (err) => {
          if (err) {
            console.error('Error creating watched_urls table:', err);
            reject(err);
            return;
          }
        });

        this.db.run(createGenerationsTable, (err) => {
          if (err) {
            console.error('Error creating generations table:', err);
            reject(err);
            return;
          }
          console.log('Database tables created successfully');
          resolve();
        });
      });
    });
  }

  // Watched URLs methods
  async addWatchedUrl(url, checkFrequency = 60) {
    return new Promise((resolve, reject) => {
      // Don't set last_updated when first adding - let it be NULL so it gets checked soon
      const stmt = `INSERT OR REPLACE INTO watched_urls (url, check_frequency) VALUES (?, ?)`;
      this.db.run(stmt, [url, checkFrequency], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, url, checkFrequency });
        }
      });
    });
  }

  async getWatchedUrls() {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM watched_urls WHERE is_active = 1 ORDER BY first_created DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getWatchedUrlById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM watched_urls WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getWatchedUrlByUrl(url) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM watched_urls WHERE url = ?`, [url], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async removeWatchedUrl(id) {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE watched_urls SET is_active = 0 WHERE id = ?`, [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async updateContentHash(urlId, contentHash) {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE watched_urls SET last_content_hash = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`, 
        [contentHash, urlId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Generations methods
  async addGeneration(data) {
    const { watchedUrlId, jobId, url, status = 'pending', trigger = 'manual' } = data;
    return new Promise((resolve, reject) => {
      const stmt = `INSERT INTO generations (watched_url_id, job_id, url, status, generation_trigger, started_at) 
                    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`;
      this.db.run(stmt, [watchedUrlId, jobId, url, status, trigger], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, jobId, url, status });
        }
      });
    });
  }

  async updateGenerationStatus(jobId, status, data = {}) {
    return new Promise((resolve, reject) => {
      let updateFields = ['status = ?'];
      let values = [status];

      if (status === 'completed' && !data.completed_at) {
        updateFields.push('completed_at = datetime(\'now\', \'localtime\')');
      }
      
      if (data.completed_at) {
        updateFields.push('completed_at = ?');
        values.push(data.completed_at);
      }

      if (data.file_path) {
        updateFields.push('file_path = ?');
        values.push(data.file_path);
      }

      if (data.error_message) {
        updateFields.push('error_message = ?');
        values.push(data.error_message);
      }

      values.push(jobId);

      const stmt = `UPDATE generations SET ${updateFields.join(', ')} WHERE job_id = ?`;
      this.db.run(stmt, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async updateGenerationWatchedUrl(jobId, watchedUrlId) {
    return new Promise((resolve, reject) => {
      const stmt = `UPDATE generations SET watched_url_id = ? WHERE job_id = ?`;
      this.db.run(stmt, [watchedUrlId, jobId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async getGenerationByJobId(jobId) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM generations WHERE job_id = ?`, [jobId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getGenerationsForUrl(urlId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM generations WHERE watched_url_id = ? ORDER BY started_at DESC LIMIT ?`, 
        [urlId, limit], 
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getAllGenerations(limit = 50) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT g.*, w.url as watched_url 
        FROM generations g 
        LEFT JOIN watched_urls w ON g.watched_url_id = w.id 
        ORDER BY g.started_at DESC 
        LIMIT ?
      `;
      this.db.all(query, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getUrlsForMonitoring() {
    const query = `
      SELECT * FROM watched_urls 
      WHERE is_active = 1 
      AND (last_updated IS NULL OR 
           datetime('now') >= datetime(last_updated, '+' || check_frequency || ' minutes'))
    `;
    return new Promise((resolve, reject) => {
      this.db.all(query, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('Database connection closed');
          resolve();
        });
      });
    }
  }
}

export default new Database();
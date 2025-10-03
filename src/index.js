const express = require('express');
const cors = require('cors');
const promClient = require('prom-client');
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;
const register = new promClient.Registry();

let books = [];
let nextId = 1;

promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: 'backend_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'backend_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'endpoint', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Middleware to track HTTP request metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    httpRequestCounter.inc({
      method: req.method,
      endpoint: req.path,
      status: res.statusCode
    });
    httpRequestDuration.observe(
      { method: req.method, endpoint: req.path, status: res.statusCode },
      duration
    );
  });

  next();
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
    console.log('Metrics endpoint accessed');
  } catch (err) {
    console.error('Error generating metrics:', err);
    res.status(500).end();
  }
});

app.get('/health', (req, res) => { // Changed '/healthh' to '/health'
  const buildNumber = process.env.BUILD_NUMBER || 'dev';
  res.status(200).json({
    status: 'OK',
    message: 'Service is up and running',
    buildNumber: buildNumber
  });
});

app.get('/', (req, res) => {
  res.send('Hello Buddy!');
});

// Get all books
app.get('/books', (req, res) => {
  res.json(books); // Changed response to return books directly
});

// Get a book by id
app.get('/books/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const book = books.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.json(book); // Changed response to return book directly
});

// Create a new book
app.post('/books', (req, res) => {
  const { title, author } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const book = { id: nextId++, title, author };
  books.push(book);
  res.status(201).json(book); // Changed response to return book directly
});

// Update a book
app.put('/books/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const book = books.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  const { title, author } = req.body;
  if (title !== undefined) book.title = title;
  if (author !== undefined) book.author = author;
  res.json(book); // Changed response to return book directly
});

// Delete a book
app.delete('/books/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = books.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Book not found' });
  }
  books.splice(index, 1);
  res.status(204).send(); // No need to send a body for 204
});

// Only start the server if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Metrics available at http://localhost:${port}/metrics`);
  });
}

module.exports = app;

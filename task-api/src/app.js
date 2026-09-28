const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    endpoints: [
      'GET /tasks?status=&page=&limit=',
      'POST /tasks',
      'PUT /tasks/:id',
      'DELETE /tasks/:id',
      'PATCH /tasks/:id/complete',
      'PATCH /tasks/:id/assign',
      'GET /tasks/stats',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/tasks', taskRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;

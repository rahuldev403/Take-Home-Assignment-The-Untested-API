const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const createTask = async (body = {}) => {
  const res = await request(app).post('/tasks').send({ title: 'A task', ...body });
  return res.body;
};

describe('POST /tasks', () => {
  test('creates a task and returns 201 with the full task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('returns 400 for an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: 'pending' });
    expect(res.status).toBe(400);
  });

  test('does not persist a task that failed validation', async () => {
    await request(app).post('/tasks').send({ title: '' });
    const res = await request(app).get('/tasks');
    expect(res.body).toEqual([]);
  });

  // BUG: the global error handler turns body-parser's 400 into a 500 (see BUG_REPORT.md #6)
  test.failing('returns 400 for malformed JSON', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'one' });
    await createTask({ title: 'two' });

    const res = await request(app).get('/tasks');
    expect(res.body.map((t) => t.title)).toEqual(['one', 'two']);
  });

  test('filters by exact status', async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'in_progress' });

    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.body.map((t) => t.title)).toEqual(['b']);
  });

  // Regression test for BUG_REPORT.md #2 (fixed)
  test('does not return tasks for a partial status', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'done' });

    const res = await request(app).get('/tasks?status=do');
    expect(res.body).toEqual([]);
  });

  // Regression test for BUG_REPORT.md #1 (fixed)
  test('page=1 returns the first page', async () => {
    for (const title of ['t1', 't2', 't3']) await createTask({ title });

    const res = await request(app).get('/tasks?page=1&limit=2');
    expect(res.body.map((t) => t.title)).toEqual(['t1', 't2']);
  });

  test('limit alone defaults to the first page', async () => {
    for (const title of ['t1', 't2', 't3']) await createTask({ title });

    const res = await request(app).get('/tasks?limit=2');
    expect(res.body.map((t) => t.title)).toEqual(['t1', 't2']);
  });

  test('a page past the end is empty', async () => {
    await createTask();
    const res = await request(app).get('/tasks?page=5&limit=10');
    expect(res.body).toEqual([]);
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts by status and overdue count', async () => {
    await createTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not shadowed by the /:id routes', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toHaveProperty('overdue', 0);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates the task and returns it', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'Renamed', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'Renamed', status: 'in_progress' });
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/missing').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid fields', async () => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  // Regression test for BUG_REPORT.md #4 (fixed)
  test('ignores attempts to change the id', async () => {
    const task = await createTask();

    await request(app).put(`/tasks/${task.id}`).send({ id: 'hijacked' });

    const res = await request(app).get('/tasks');
    expect(res.body[0].id).toBe(task.id);
  });

  // BUG: status: null passes validation, is stored, then crashes the status filter (see BUG_REPORT.md #5)
  test.failing('rejects a null status instead of storing it', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: null });

    expect(res.status).toBe(400);
  });

  // BUG: completedAt is only ever set by /complete and never cleared (see BUG_REPORT.md #7)
  test.failing('clears completedAt when a done task is moved back to todo', async () => {
    const task = await createTask();
    await request(app).patch(`/tasks/${task.id}/complete`);

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'todo' });

    expect(res.body.completedAt).toBeNull();
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes the task and returns 204 with no body', async () => {
    const task = await createTask();

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/missing');
    expect(res.status).toBe(404);
  });

  test('returns 404 when deleting the same task twice', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);

    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks the task done and sets completedAt', async () => {
    const task = await createTask();

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/missing/complete');
    expect(res.status).toBe(404);
  });

  // Regression test for BUG_REPORT.md #3 (fixed)
  test('keeps the original priority', async () => {
    const task = await createTask({ priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body.priority).toBe('high');
  });
});

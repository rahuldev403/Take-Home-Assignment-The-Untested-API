const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');
const { validateAssignTask } = require('../src/utils/validators');

beforeEach(() => {
  taskService._reset();
});

const createTask = async (body = {}) => {
  const res = await request(app).post('/tasks').send({ title: 'A task', ...body });
  return res.body;
};

const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

describe('PATCH /tasks/:id/assign', () => {
  test('new tasks start unassigned', async () => {
    const task = await createTask();
    expect(task.assignee).toBeNull();
  });

  test('assigns the task and returns the updated task', async () => {
    const task = await createTask({ priority: 'high' });

    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'Alice', priority: 'high', title: 'A task' });
  });

  test('persists the assignee', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('Alice');
  });

  test('trims surrounding whitespace', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '  Alice  ' });
    expect(res.body.assignee).toBe('Alice');
  });

  test('reassigns a task that is already assigned', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const res = await assign(task.id, { assignee: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('assigning the same person again is a no-op success', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  test('null unassigns the task', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const res = await assign(task.id, { assignee: null });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  test('can assign a completed task', async () => {
    const task = await createTask();
    await request(app).patch(`/tasks/${task.id}/complete`);

    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'done', assignee: 'Alice' });
  });

  test('returns 404 for an unknown task', async () => {
    const res = await assign('missing', { assignee: 'Alice' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  test.each([
    ['missing', {}],
    ['empty', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['a number', { assignee: 42 }],
    ['an object', { assignee: { name: 'Alice' } }],
    ['too long', { assignee: 'a'.repeat(101) }],
  ])('returns 400 when assignee is %s', async (_, body) => {
    const task = await createTask();

    const res = await assign(task.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/);
  });

  test('a rejected request leaves the existing assignee untouched', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    await assign(task.id, { assignee: '' });

    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('Alice');
  });

  test('PUT cannot bypass validation to set the assignee', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ assignee: '' });

    expect(res.body.assignee).toBeNull();
  });
});

describe('validateAssignTask', () => {
  test('accepts a name at the max length and null', () => {
    expect(validateAssignTask({ assignee: 'a'.repeat(100) })).toBeNull();
    expect(validateAssignTask({ assignee: null })).toBeNull();
  });
});

describe('taskService.assignTask', () => {
  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('missing', 'Alice')).toBeNull();
  });
});

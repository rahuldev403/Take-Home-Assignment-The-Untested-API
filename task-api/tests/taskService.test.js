const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

const makeTasks = (n) =>
  Array.from({ length: n }, (_, i) => taskService.create({ title: `Task ${i + 1}` }));

describe('create', () => {
  test('applies defaults for optional fields', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(typeof task.id).toBe('string');
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  test('keeps provided fields', () => {
    const task = taskService.create({
      title: 'Ship',
      description: 'v1',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });

    expect(task).toMatchObject({
      description: 'v1',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
  });

  test('generates a unique id per task', () => {
    const [a, b] = makeTasks(2);
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns every task, in insertion order', () => {
    makeTasks(3);
    expect(taskService.getAll().map((t) => t.title)).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });

  test('getAll returns a copy, so callers cannot add/remove tasks from the store', () => {
    makeTasks(1);
    taskService.getAll().push({ id: 'x' });
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('findById returns the task or undefined', () => {
    const [task] = makeTasks(1);
    expect(taskService.findById(task.id)).toEqual(task);
    expect(taskService.findById('missing')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with that status', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });

    expect(taskService.getByStatus('todo').map((t) => t.title)).toEqual(['a']);
  });

  // Regression test for BUG_REPORT.md #2 (fixed)
  test('does not match on a partial status string', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });

    expect(taskService.getByStatus('do')).toEqual([]);
  });
});

describe('getPaginated', () => {
  // Regression test for BUG_REPORT.md #1 (fixed)
  test('page 1 returns the first `limit` tasks', () => {
    makeTasks(5);
    expect(taskService.getPaginated(1, 2).map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
  });

  test('page 3 returns the remaining task', () => {
    makeTasks(5);
    expect(taskService.getPaginated(3, 2).map((t) => t.title)).toEqual(['Task 5']);
  });

  test('a page past the end is empty', () => {
    makeTasks(2);
    expect(taskService.getPaginated(10, 10)).toEqual([]);
  });
});

describe('getStats', () => {
  test('counts by status and zeroes when empty', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });

    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'in_progress' });
    taskService.create({ title: 'c', status: 'done' });

    expect(taskService.getStats()).toMatchObject({ todo: 1, in_progress: 1, done: 1 });
  });

  test('counts past-due tasks that are not done as overdue', () => {
    const past = '2000-01-01T00:00:00.000Z';
    const future = '2999-01-01T00:00:00.000Z';
    taskService.create({ title: 'late', dueDate: past });
    taskService.create({ title: 'late but done', status: 'done', dueDate: past });
    taskService.create({ title: 'not due yet', dueDate: future });
    taskService.create({ title: 'no due date' });

    expect(taskService.getStats().overdue).toBe(1);
  });
});

describe('update', () => {
  test('merges the given fields and returns the updated task', () => {
    const [task] = makeTasks(1);
    const updated = taskService.update(task.id, { title: 'Renamed', priority: 'high' });

    expect(updated).toMatchObject({ id: task.id, title: 'Renamed', priority: 'high', status: 'todo' });
    expect(taskService.findById(task.id)).toEqual(updated);
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('missing', { title: 'x' })).toBeNull();
  });

  // Regression test for BUG_REPORT.md #4 (fixed)
  test('does not let callers overwrite id or createdAt', () => {
    const [task] = makeTasks(1);
    const updated = taskService.update(task.id, { id: 'hijacked', createdAt: 'yesterday' });

    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
  });
});

describe('remove', () => {
  test('deletes the task and returns true', () => {
    const [a, b] = makeTasks(2);
    expect(taskService.remove(a.id)).toBe(true);
    expect(taskService.getAll()).toEqual([b]);
  });

  test('returns false for an unknown id', () => {
    expect(taskService.remove('missing')).toBe(false);
  });
});

describe('completeTask', () => {
  test('sets status to done and stamps completedAt', () => {
    const [task] = makeTasks(1);
    const done = taskService.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(new Date(done.completedAt).toISOString()).toBe(done.completedAt);
    expect(taskService.findById(task.id)).toEqual(done);
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('missing')).toBeNull();
  });

  // Regression test for BUG_REPORT.md #3 (fixed)
  test('does not change the priority', () => {
    const task = taskService.create({ title: 'urgent', priority: 'high' });
    expect(taskService.completeTask(task.id).priority).toBe('high');
  });
});

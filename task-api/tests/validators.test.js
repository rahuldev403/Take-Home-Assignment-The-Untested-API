const { validateCreateTask, validateUpdateTask } = require('../src/utils/validators');

describe('validateCreateTask', () => {
  test('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'ok' })).toBeNull();
  });

  test('accepts a fully populated valid body', () => {
    expect(
      validateCreateTask({
        title: 'ok',
        status: 'in_progress',
        priority: 'low',
        dueDate: '2030-01-01T00:00:00.000Z',
      })
    ).toBeNull();
  });

  test.each([
    ['missing', {}],
    ['empty', { title: '' }],
    ['whitespace only', { title: '   ' }],
    ['not a string', { title: 42 }],
  ])('rejects a %s title', (_, body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  test('rejects an unknown status', () => {
    expect(validateCreateTask({ title: 'ok', status: 'pending' })).toMatch(/status/);
  });

  test('rejects an unknown priority', () => {
    expect(validateCreateTask({ title: 'ok', priority: 'urgent' })).toMatch(/priority/);
  });

  test('rejects an unparseable dueDate', () => {
    expect(validateCreateTask({ title: 'ok', dueDate: 'not a date' })).toMatch(/dueDate/);
  });

  // BUG: checks are guarded by `body.status &&`, so falsy values skip validation (see BUG_REPORT.md #5)
  test.failing.each([
    ['status', null],
    ['status', ''],
    ['priority', 0],
  ])('rejects a falsy %s (%p)', (field, value) => {
    expect(validateCreateTask({ title: 'ok', [field]: value })).not.toBeNull();
  });
});

describe('validateUpdateTask', () => {
  test('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  test('rejects an empty title only when one is provided', () => {
    expect(validateUpdateTask({ title: '' })).toMatch(/title/);
    expect(validateUpdateTask({ priority: 'high' })).toBeNull();
  });

  test('rejects an invalid status, priority or dueDate', () => {
    expect(validateUpdateTask({ status: 'nope' })).toMatch(/status/);
    expect(validateUpdateTask({ priority: 'nope' })).toMatch(/priority/);
    expect(validateUpdateTask({ dueDate: 'nope' })).toMatch(/dueDate/);
  });
});

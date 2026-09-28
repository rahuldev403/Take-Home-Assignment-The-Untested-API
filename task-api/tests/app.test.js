const request = require('supertest');
const app = require('../src/app');

describe('service routes', () => {
  test('GET / lists the available endpoints', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.endpoints).toContain('PATCH /tasks/:id/assign');
  });

  test('GET /health reports ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

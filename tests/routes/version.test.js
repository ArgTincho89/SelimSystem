const request = require('supertest');
const app = require('../../src/app');
const { version } = require('../../package.json');

describe('GET /version.json', () => {
  it('exposes the deployed package version without authentication', async () => {
    const res = await request(app).get('/version.json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version });
  });
});

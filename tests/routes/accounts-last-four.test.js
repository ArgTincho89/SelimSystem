const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Account last four digits', () => {
  let agent;

  beforeEach(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: `last-four-${Date.now()}@example.com`, password: '123456', nombre: 'Digits' });
  });

  afterEach(() => cleanupTestDb());

  it('stores the digits on create, lists them and updates or clears them', async () => {
    const created = await agent.post('/api/accounts').send({ name: 'Visa', currency: 'ARS', lastFour: '0123' });
    expect(created.body.error).toBeUndefined();
    expect(created.status).toBe(201);
    expect(created.body.lastFour).toBe('0123');
    const listed = await agent.get('/api/accounts');
    const accounts = listed.body.accounts || listed.body;
    expect(accounts.find(item => item.id === created.body.id).lastFour).toBe('0123');
    const updated = await agent.put(`/api/accounts/${created.body.id}`).send({ lastFour: '9876' });
    expect(updated.status).toBe(200);
    expect(app.locals.db.findById('accounts', created.body.id, created.body.userId || updated.body.userId)?.lastFour ?? updated.body.lastFour).toBe('9876');
    await agent.put(`/api/accounts/${created.body.id}`).send({ lastFour: '' });
    const after = await agent.get('/api/accounts');
    expect((after.body.accounts || after.body).find(item => item.id === created.body.id).lastFour).toBeNull();
  });

  it('keeps the digits when an update does not send them and defaults to null', async () => {
    const plain = await agent.post('/api/accounts').send({ name: 'Caja', currency: 'ARS' });
    expect(plain.body.lastFour).toBeNull();
    const withDigits = await agent.post('/api/accounts').send({ name: 'Banco', currency: 'ARS', lastFour: '4321' });
    await agent.put(`/api/accounts/${withDigits.body.id}`).send({ name: 'Banco Nación' });
    const listed = await agent.get('/api/accounts');
    expect((listed.body.accounts || listed.body).find(item => item.id === withDigits.body.id).lastFour).toBe('4321');
  });

  it.each(['123', '12345', 'abcd', '12 4', 1234.5])('rejects invalid digits %p', async value => {
    const created = await agent.post('/api/accounts').send({ name: 'Bad', currency: 'ARS', lastFour: value });
    expect(created.status).toBe(400);
    expect(created.body.error).toMatch(/4 números/);
    const valid = await agent.post('/api/accounts').send({ name: 'Ok', currency: 'ARS' });
    const updated = await agent.put(`/api/accounts/${valid.body.id}`).send({ lastFour: value });
    expect(updated.status).toBe(400);
  });

  it('shows the field in the account form and the digits on the card', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/settings.js'), 'utf8');
    expect(source).toContain("this.field('Últimos 4 dígitos', lastFour)");
    expect(source).toContain("id: 'account-last-four'");
    expect(source).toContain('`Dígitos: ${account.lastFour}`');
    expect(source.indexOf('`Dígitos: ${account.lastFour}`')).toBeGreaterThan(source.indexOf('`Titular: ${accountOwner?.name'));
  });
});

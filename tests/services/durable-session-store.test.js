const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const DurableSessionStore = require('../../src/services/durable-session-store');
const { createApp } = require('../../src/app');

describe('DurableSessionStore', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selimsystem-session-test-'));
  });

  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  it('persists sessions across store recreation and removes an expired session', done => {
    const filePath = path.join(dataDir, 'sessions.json');
    const firstStore = new DurableSessionStore(filePath);
    firstStore.set('persisted-id', { userId: 'synthetic-user', cookie: { expires: new Date(Date.now() + 60_000).toISOString() } }, error => {
      expect(error).toBeNull();
      const recreatedStore = new DurableSessionStore(filePath);
      recreatedStore.get('persisted-id', (readError, value) => {
        expect(readError).toBeNull();
        expect(value.userId).toBe('synthetic-user');
        recreatedStore.sessions['persisted-id'].expiresAt = Date.now() - 1;
        recreatedStore.get('persisted-id', (expiredError, expired) => {
          expect(expiredError).toBeNull();
          expect(expired).toBeNull();
          done();
        });
      });
    });
  });

  it('extends expiration on touch and persists the touched session', done => {
    const filePath = path.join(dataDir, 'sessions.json');
    const store = new DurableSessionStore(filePath);
    const shortExpiry = new Date(Date.now() + 5_000).toISOString();
    store.set('rolling-id', { userId: 'synthetic-user', cookie: { expires: shortExpiry } }, error => {
      expect(error).toBeNull();
      const renewedExpiry = Date.now() + 60_000;
      const renewed = { userId: 'synthetic-user', cookie: { expires: new Date(renewedExpiry).toISOString() } };
      store.touch('rolling-id', renewed, touchError => {
        expect(touchError).toBeNull();
        const recreatedStore = new DurableSessionStore(filePath);
        recreatedStore.get('rolling-id', (readError, value) => {
          expect(readError).toBeNull();
          expect(value.userId).toBe('synthetic-user');
          expect(recreatedStore.sessions['rolling-id'].expiresAt).toBeGreaterThanOrEqual(renewedExpiry);
          done();
        });
      });
    });
  });

  it('keeps a login valid across app recreation and invalidates it on logout', async () => {
    const firstApp = createApp({ dataDir, sessionSecret: 'synthetic-session-test-secret' });
    await request(firstApp).post('/api/auth/register').send({
      email: 'durable-session@example.test', password: 'synthetic-password', nombre: 'Durable Session User'
    }).expect(201);
    const login = await request(firstApp).post('/api/auth/login').send({
      nombre: 'Durable Session User', password: 'synthetic-password'
    }).expect(200);
    const cookie = login.headers['set-cookie'].find(value => value.startsWith('connect.sid=')).split(';')[0];

    const recreatedApp = createApp({ dataDir, sessionSecret: 'synthetic-session-test-secret' });
    await request(recreatedApp).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(recreatedApp).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(recreatedApp).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});

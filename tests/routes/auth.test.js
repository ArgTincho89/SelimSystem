const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');

describe('Auth Routes', () => {
  let db;

  beforeAll(() => {
    db = setupTestDb();
    app.locals.db = db;
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@test.com', password: '123456', nombre: 'NewUser' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('new@test.com');
      expect(res.body.nombre).toBe('NewUser');
    });

    it('should reject duplicate email', async () => {
      createTestUser(db, { email: 'dup@test.com', nombre: 'DupOriginal' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@test.com', password: '123456', nombre: 'Dup2' });

      expect(res.status).toBe(409);
    });

    it('should reject duplicate nombre', async () => {
      createTestUser(db, { email: 'a@test.com', nombre: 'TakenName' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'b@test.com', password: '123456', nombre: 'TakenName' });

      expect(res.status).toBe(409);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@test.com' });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@test.com', password: '123', nombre: 'X' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'notanemail', password: '123456', nombre: 'BadEmail' });

      expect(res.status).toBe(400);
    });

    it('should not create default categories', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'nocat@test.com', password: '123456', nombre: 'NoCat' });

      expect(res.status).toBe(201);

      const cats = db.findAll('categories', res.body.id);
      expect(cats.length).toBe(0);
    });

    it('should lowercase email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'UPPER@TEST.COM', password: '123456', nombre: 'UpperUser' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('upper@test.com');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials (nombre)', async () => {
      const hashedPw = await bcrypt.hash('123456', 12);
      createTestUser(db, { email: 'login@test.com', nombre: 'LoginUser', password: hashedPw });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombre: 'LoginUser', password: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('LoginUser');
    });

    it('should reject invalid password', async () => {
      const hashedPw = await bcrypt.hash('123456', 12);
      createTestUser(db, { email: 'login2@test.com', nombre: 'LoginUser2', password: hashedPw });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombre: 'LoginUser2', password: 'wrong' });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombre: 'Nobody', password: '123456' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombre: 'X' });

      expect(res.status).toBe(400);
    });

    it('should reject login without password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: '123456' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when logged in', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .send({ email: 'me@test.com', password: '123456', nombre: 'Me' });

      const res = await agent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Me');
    });

    it('should return 401 when not logged in', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .send({ email: 'out@test.com', password: '123456', nombre: 'Out' });

      const res = await agent.post('/api/auth/logout');
      expect(res.status).toBe(200);

      const meRes = await agent.get('/api/auth/me');
      expect(meRes.status).toBe(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return ok even for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexist@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should accept existing email and return ok', async () => {
      createTestUser(db, { email: 'fp@test.com', nombre: 'FP User' });
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'fp@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should reject missing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc' });

      expect(res.status).toBe(400);
    });

    it('should reject short new password', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'abc', newPassword: '123' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalidtoken', newPassword: '123456' });

      expect(res.status).toBe(400);
    });

    it('should accept valid token and reset password', async () => {
      const user = createTestUser(db, { email: 'reset@test.com', nombre: 'Reset User' });
      db.updateUser(user.id, { resetToken: 'validtoken123', resetTokenExpires: Date.now() + 3600000 });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'validtoken123', newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should reject expired token', async () => {
      const user = createTestUser(db, { email: 'expired@test.com', nombre: 'Expired User' });
      db.updateUser(user.id, { resetToken: 'expiredtoken', resetTokenExpires: Date.now() - 1000 });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'expiredtoken', newPassword: 'newpass123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'new123456' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('oldpass', 12);
      createTestUser(db, { email: 'cp@test.com', nombre: 'CP User', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CP User', password: 'oldpass' });

      const res = await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: 'oldpass' });

      expect(res.status).toBe(400);
    });

    it('should reject short new password', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('oldpass', 12);
      createTestUser(db, { email: 'cps@test.com', nombre: 'CPShort', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CPShort', password: 'oldpass' });

      const res = await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: 'oldpass', newPassword: '123' });

      expect(res.status).toBe(400);
    });

    it('should reject wrong current password', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('oldpass', 12);
      createTestUser(db, { email: 'cpw@test.com', nombre: 'CPWrong', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CPWrong', password: 'oldpass' });

      const res = await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: 'wrong', newPassword: 'newpass123' });

      expect(res.status).toBe(401);
    });

    it('should change password successfully', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('oldpass', 12);
      createTestUser(db, { email: 'cpos@test.com', nombre: 'CPOk', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CPOk', password: 'oldpass' });

      const res = await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: 'oldpass', newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const loginRes = await agent.post('/api/auth/login').send({ nombre: 'CPOk', password: 'newpass123' });
      expect(loginRes.status).toBe(200);
    }, 15000);
  });

  describe('POST /api/auth/change-email', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/auth/change-email')
        .send({ email: 'new@test.com', password: 'pass' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'ce@test.com', nombre: 'CE User', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CE User', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'new@test.com' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'cei@test.com', nombre: 'CEInv', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CEInv', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'notemail', password: 'pass123' });

      expect(res.status).toBe(400);
    });

    it('should reject wrong password', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'cew@test.com', nombre: 'CEWrong', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CEWrong', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'new@test.com', password: 'wrong' });

      expect(res.status).toBe(401);
    });

    it('should reject duplicate email from another user', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'ced@test.com', nombre: 'CEDup', password: hashedPw });
      createTestUser(db, { email: 'taken@test.com', nombre: 'Taken', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CEDup', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'taken@test.com', password: 'pass123' });

      expect(res.status).toBe(409);
    });

    it('should change email successfully', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'ceok@test.com', nombre: 'CEOk', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CEOk', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'updated@test.com', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('updated@test.com');
    });

    it('should allow keeping same email', async () => {
      const agent = request.agent(app);
      const hashedPw = await bcrypt.hash('pass123', 12);
      createTestUser(db, { email: 'cekeep@test.com', nombre: 'CEKeep', password: hashedPw });
      await agent.post('/api/auth/login').send({ nombre: 'CEKeep', password: 'pass123' });

      const res = await agent
        .post('/api/auth/change-email')
        .send({ email: 'cekeep@test.com', password: 'pass123' });

      expect(res.status).toBe(200);
    });
  });
});

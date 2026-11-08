const { errorHandler } = require('../../src/middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('should handle JSON parse errors', () => {
    const err = new Error('Unexpected token');
    err.type = 'entity.parse.failed';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'JSON inválido' });
  });

  it('should handle file size limit errors', () => {
    const err = new Error('File too large');
    err.code = 'LIMIT_FILE_SIZE';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'Archivo demasiado grande' });
  });

  it('should handle generic errors with status', () => {
    const err = new Error('Not found');
    err.status = 404;
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should default to 500 for errors without status', () => {
    const err = new Error('Internal');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should return message in non-production', () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const err = new Error('Debug message');
    err.status = 400;
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Debug message' });
    process.env.NODE_ENV = original;
  });

  it('should hide message in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('Sensitive');
    err.status = 500;
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor' });
    process.env.NODE_ENV = original;
  });
});

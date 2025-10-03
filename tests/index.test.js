const request = require('supertest');
const app = require('../src/index');

describe('Backend App', () => {
  describe('GET /', () => {
    it('should return "Hello Buddy!" message', async () => {
      const response = await request(app).get('/');
      expect(response.statusCode).toBe(200);
      expect(response.text).toBe('Hello Buddy!');
    });
  });

  describe('GET /health', () => {
    it('should return health status OK', async () => {
      const response = await request(app).get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toEqual('OK');
    });
  });

  describe('Non-existent routes', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route');
      expect(response.statusCode).toBe(404);
    });
  });
});

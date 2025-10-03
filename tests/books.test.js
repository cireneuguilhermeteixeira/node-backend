const request = require('supertest');
const app = require('../src/index');

describe('Books API', () => {
  it('should return empty list initially', async () => {
    const res = await request(app).get('/books');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should create a book', async () => {
    const res = await request(app)
      .post('/books')
      .send({ title: 'Book1', author: 'Author1' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 1, title: 'Book1', author: 'Author1' });
  });

  it('should list books', async () => {
    const res = await request(app).get('/books');
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('should get a book by id', async () => {
    const res = await request(app).get('/books/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Book1');
  });

  it('should update a book', async () => {
    const res = await request(app)
      .put('/books/1')
      .send({ title: 'Updated', author: 'Author2' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.author).toBe('Author2');
  });

  it('should delete a book', async () => {
    const res = await request(app).delete('/books/1');
    expect(res.statusCode).toBe(204);
    const res2 = await request(app).get('/books/1');
    expect(res2.statusCode).toBe(404);
  });
});

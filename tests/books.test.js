const request = require('supertest');
const app = require('../src/index');

describe('Books API', () => {
  it('should return empty list initially', async () => {
    const res = await request(app).get('/books');
    expect(res.statusCode).toBe(200);
    expect(res.body.books).toEqual([]); // Changed to expect res.body.books
  });

  it('should create a book', async () => {
    const res = await request(app)
      .post('/books')
      .send({ title: 'Book1', author: 'Author1' });
    expect(res.statusCode).toBe(201);
    expect(res.body.bookCreated).toMatchObject({ id: 1, title: 'Book1', author: 'Author1' }); // Changed to expect res.body.bookCreated
  });

  it('should list books', async () => {
    const res = await request(app).get('/books');
    expect(res.statusCode).toBe(200);
    expect(res.body.books.length).toBe(1); // Changed to expect res.body.books.length
  });

  it('should get a book by id', async () => {
    const res = await request(app).get('/books/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.book.title).toBe('Book1'); // Changed to expect res.body.book.title
  });

  it('should update a book', async () => {
    const res = await request(app)
      .put('/books/1')
      .send({ title: 'Updated', author: 'Author2' });
    expect(res.statusCode).toBe(200);
    expect(res.body.bookUpdated.title).toBe('Updated'); // Changed to expect res.body.bookUpdated.title
    expect(res.body.bookUpdated.author).toBe('Author2'); // Changed to expect res.body.bookUpdated.author
  });

  it('should delete a book', async () => {
    const res = await request(app).delete('/books/1');
    expect(res.statusCode).toBe(204);
    const res2 = await request(app).get('/books/1');
    expect(res2.statusCode).toBe(404);
  });
});

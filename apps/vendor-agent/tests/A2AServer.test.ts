import request from 'supertest';
import express from 'express';
import { A2AServer } from '../src/a2a_server/A2AServer';

describe('A2AServer', () => {
  let app: express.Application;
  let server: A2AServer;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    server = new A2AServer();

    app.post('/a2a/catalog.query', server.queryCatalog.bind(server));
    app.post('/a2a/quote.create', server.createQuote.bind(server));
    app.post('/a2a/negotiate', server.negotiate.bind(server));
    app.post('/a2a/cart.lock', server.lockCart.bind(server));
  });

  describe('POST /a2a/catalog.query', () => {
    it('should return catalog items', async () => {
      const response = await request(app)
        .post('/a2a/catalog.query')
        .send({
          categories: ['hot-snacks', 'fresh']
        })
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('should filter by dietary requirements', async () => {
      const response = await request(app)
        .post('/a2a/catalog.query')
        .send({
          categories: ['hot-snacks'],
          dietary: ['vegan']
        })
        .expect(200);

      expect(response.body.items).toBeDefined();
      response.body.items.forEach((item: any) => {
        expect(item.dietary).toContain('vegan');
      });
    });
  });

  describe('POST /a2a/quote.create', () => {
    it('should create a quote', async () => {
      const response = await request(app)
        .post('/a2a/quote.create')
        .send({
          items: [{ sku: 'snack-veg-001', quantity: 20 }],
          deliveryDate: '2025-01-01',
          headcount: 5
        })
        .expect(200);

      expect(response.body.quoteId).toBeDefined();
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.lineItems).toBeDefined();
    });
  });
});
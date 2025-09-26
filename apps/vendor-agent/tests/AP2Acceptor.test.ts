import request from 'supertest';
import express from 'express';
import { AP2Acceptor } from '../src/ap2_acceptor/AP2Acceptor';

describe('AP2Acceptor', () => {
  let app: express.Application;
  let acceptor: AP2Acceptor;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    acceptor = new AP2Acceptor();

    app.post('/ap2/mandate.create', acceptor.createMandate.bind(acceptor));
    app.post('/ap2/pay', acceptor.processPayment.bind(acceptor));
    app.get('/ap2/payment.status', acceptor.getPaymentStatus.bind(acceptor));
  });

  describe('POST /ap2/mandate.create', () => {
    it('should create a payment mandate', async () => {
      const ttl = new Date();
      ttl.setMinutes(ttl.getMinutes() + 10);

      const response = await request(app)
        .post('/ap2/mandate.create')
        .send({
          cartId: 'cart_123',
          payerRef: 'TEAM-OPS-001',
          amount: 2500,
          ttl: ttl.toISOString()
        })
        .expect(200);

      expect(response.body.mandateId).toBeDefined();
      expect(response.body.challengeData).toBeDefined();
      expect(response.body.amount).toBe(2500);
    });

    it('should reject invalid mandate requests', async () => {
      await request(app)
        .post('/ap2/mandate.create')
        .send({
          cartId: 'cart_123'
          // Missing required fields
        })
        .expect(400);
    });
  });

  describe('GET /ap2/payment.status', () => {
    it('should return 404 for non-existent payment', async () => {
      await request(app)
        .get('/ap2/payment.status?paymentId=nonexistent')
        .expect(404);
    });
  });
});
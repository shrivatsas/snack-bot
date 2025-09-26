import { Request, Response } from 'express';
import * as nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as crypto from 'crypto';

interface Mandate {
  mandateId: string;
  cartId: string;
  payerRef: string;
  amount: number;
  currency: string;
  ttl: string;
  challengeData: string;
  created: string;
  status: 'active' | 'used' | 'expired';
}

interface Payment {
  paymentId: string;
  mandateId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  created: string;
  updated: string;
  transactionRef?: string;
  failureReason?: string;
}

export class AP2Acceptor {
  private mandates: Map<string, Mandate> = new Map();
  private payments: Map<string, Payment> = new Map();

  async createMandate(req: Request, res: Response): Promise<void> {
    try {
      const { cartId, payerRef, amount, currency = 'USD', ttl, metadata } = req.body;

      if (!cartId || !payerRef || !amount || !ttl) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'cartId, payerRef, amount, and ttl are required'
        });
        return;
      }

      const mandateId = `mandate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create challenge data to be signed
      const challengeObj = {
        mandateId,
        cartId,
        payerRef,
        amount,
        currency,
        ttl,
        timestamp: Date.now()
      };

      const challengeString = JSON.stringify(challengeObj);
      const challengeData = encodeBase64(Buffer.from(challengeString, 'utf8'));

      const mandate: Mandate = {
        mandateId,
        cartId,
        payerRef,
        amount,
        currency,
        ttl,
        challengeData,
        created: new Date().toISOString(),
        status: 'active'
      };

      this.mandates.set(mandateId, mandate);

      // Schedule mandate expiration
      this.scheduleExpiration(mandateId, new Date(ttl));

      res.json({
        mandateId: mandate.mandateId,
        cartId: mandate.cartId,
        payerRef: mandate.payerRef,
        amount: mandate.amount,
        currency: mandate.currency,
        ttl: mandate.ttl,
        challengeData: mandate.challengeData,
        created: mandate.created
      });
    } catch (error) {
      console.error('Mandate creation error:', error);
      res.status(500).json({
        error: 'Failed to create mandate',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processPayment(req: Request, res: Response): Promise<void> {
    try {
      const { mandateId, signature, publicKey } = req.body;

      if (!mandateId || !signature || !publicKey) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'mandateId, signature, and publicKey are required'
        });
        return;
      }

      const mandate = this.mandates.get(mandateId);
      if (!mandate) {
        res.status(404).json({
          error: 'Mandate not found',
          message: `No mandate found with ID: ${mandateId}`
        });
        return;
      }

      if (mandate.status !== 'active') {
        res.status(400).json({
          error: 'Invalid mandate status',
          message: `Mandate status is ${mandate.status}, expected active`
        });
        return;
      }

      // Check if mandate has expired
      if (new Date() > new Date(mandate.ttl)) {
        mandate.status = 'expired';
        res.status(400).json({
          error: 'Mandate expired',
          message: 'The mandate has expired and cannot be used for payment'
        });
        return;
      }

      // Verify signature
      const isValidSignature = this.verifySignature(mandate.challengeData, signature, publicKey);
      if (!isValidSignature) {
        res.status(400).json({
          error: 'Invalid signature',
          message: 'The provided signature is not valid for this mandate'
        });
        return;
      }

      const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transactionRef = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const payment: Payment = {
        paymentId,
        mandateId,
        status: 'processing',
        amount: mandate.amount,
        currency: mandate.currency,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        transactionRef
      };

      this.payments.set(paymentId, payment);
      mandate.status = 'used';

      // Simulate payment processing
      setTimeout(() => {
        this.completePayment(paymentId);
      }, 2000);

      res.json({
        paymentId: payment.paymentId,
        status: payment.status,
        amount: payment.amount,
        transactionRef: payment.transactionRef,
        processed: payment.updated
      });
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({
        error: 'Failed to process payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.query;

      if (!paymentId || typeof paymentId !== 'string') {
        res.status(400).json({
          error: 'Missing paymentId',
          message: 'paymentId query parameter is required'
        });
        return;
      }

      const payment = this.payments.get(paymentId);
      if (!payment) {
        res.status(404).json({
          error: 'Payment not found',
          message: `No payment found with ID: ${paymentId}`
        });
        return;
      }

      res.json({
        paymentId: payment.paymentId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        mandateId: payment.mandateId,
        created: payment.created,
        updated: payment.updated,
        transactionRef: payment.transactionRef,
        failureReason: payment.failureReason
      });
    } catch (error) {
      console.error('Payment status error:', error);
      res.status(500).json({
        error: 'Failed to get payment status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private verifySignature(challengeData: string, signature: string, publicKey: string): boolean {
    try {
      const challengeBytes = decodeBase64(challengeData);
      const signatureBytes = decodeBase64(signature);
      const publicKeyBytes = decodeBase64(publicKey);

      return nacl.sign.detached.verify(challengeBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  private completePayment(paymentId: string): void {
    const payment = this.payments.get(paymentId);
    if (payment && payment.status === 'processing') {
      // Simulate random success/failure
      const success = Math.random() > 0.1; // 90% success rate

      if (success) {
        payment.status = 'completed';
      } else {
        payment.status = 'failed';
        payment.failureReason = 'Insufficient funds or payment processing error';
      }

      payment.updated = new Date().toISOString();
      console.log(`Payment ${paymentId} ${payment.status}`);
    }
  }

  private scheduleExpiration(mandateId: string, expiration: Date): void {
    const now = new Date();
    const timeToExpiration = expiration.getTime() - now.getTime();

    if (timeToExpiration > 0) {
      setTimeout(() => {
        const mandate = this.mandates.get(mandateId);
        if (mandate && mandate.status === 'active') {
          mandate.status = 'expired';
          console.log(`Mandate ${mandateId} expired`);
        }
      }, timeToExpiration);
    }
  }

  getMandate(mandateId: string): Mandate | undefined {
    return this.mandates.get(mandateId);
  }

  getPayment(paymentId: string): Payment | undefined {
    return this.payments.get(paymentId);
  }
}
import axios, { AxiosInstance } from 'axios';
import * as nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface MandateRequest {
  cartId: string;
  payerRef: string;
  amount: number;
  currency?: string;
  ttl: string;
  metadata?: any;
  paymentType?: 'full' | 'initial' | 'delivery';
  splitPayment?: {
    initialAmount: number;
    deliveryAmount: number;
    totalAmount: number;
  };
}

export interface MandateResponse {
  mandateId: string;
  cartId: string;
  payerRef: string;
  amount: number;
  currency: string;
  ttl: string;
  challengeData: string;
  created: string;
}

export interface PaymentRequest {
  mandateId: string;
  signature: string;
  publicKey: string;
}

export interface PaymentResponse {
  paymentId: string;
  status: string;
  amount: number;
  transactionRef?: string;
  processed: string;
}

export interface PaymentStatus {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  mandateId: string;
  created: string;
  updated: string;
  transactionRef?: string;
  failureReason?: string;
}

export class AP2Client {
  private client: AxiosInstance;
  private baseUrl: string;
  private keyPair: nacl.SignKeyPair | null = null;

  constructor() {
    this.baseUrl = process.env.PAYMENT_AGENT_URL || 'http://localhost:5000';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SnackBot-OfficeAgent/1.0'
      }
    });

    this.loadKeyPair();
  }

  private loadKeyPair(): void {
    const keyPath = process.env.PRIVATE_KEY_PATH;

    if (!keyPath) {
      // Generate ephemeral keypair for demo
      this.keyPair = nacl.sign.keyPair();
      console.log('Generated ephemeral Ed25519 keypair for demo');
      return;
    }

    try {
      if (fs.existsSync(keyPath)) {
        const keyData = fs.readFileSync(keyPath, 'utf8');
        const secretKey = this.parsePrivateKey(keyData);
        this.keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
        console.log('Loaded Ed25519 keypair from', keyPath);
      } else {
        // Generate and save new keypair
        this.keyPair = nacl.sign.keyPair();
        this.saveKeyPair(keyPath);
        console.log('Generated new Ed25519 keypair and saved to', keyPath);
      }
    } catch (error) {
      console.warn('Failed to load keypair, using ephemeral key:', error);
      this.keyPair = nacl.sign.keyPair();
    }
  }

  private parsePrivateKey(keyData: string): Uint8Array {
    // Handle PEM format
    if (keyData.includes('PRIVATE KEY')) {
      const lines = keyData.split('\n');
      const keyLines = lines.slice(1, -2);
      const keyString = keyLines.join('');
      return decodeBase64(keyString);
    }

    // Handle raw base64
    return decodeBase64(keyData.trim());
  }

  private saveKeyPair(keyPath: string): void {
    try {
      const keyDir = keyPath.substring(0, keyPath.lastIndexOf('/'));
      if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
      }

      const privateKeyB64 = encodeBase64(this.keyPair!.secretKey);
      const pemFormat = `-----BEGIN PRIVATE KEY-----\n${privateKeyB64}\n-----END PRIVATE KEY-----\n`;

      fs.writeFileSync(keyPath, pemFormat, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save keypair:', error);
    }
  }

  async createMandate(request: MandateRequest): Promise<MandateResponse> {
    try {
      const response = await this.client.post('/ap2/mandate.create', request);
      return response.data;
    } catch (error) {
      console.error('AP2 mandate creation failed:', error);
      throw new Error(`Failed to create mandate: ${error}`);
    }
  }

  async processPayment(mandate: MandateResponse): Promise<PaymentResponse> {
    if (!this.keyPair) {
      throw new Error('No keypair available for signing');
    }

    try {
      // Sign the challenge data
      const challengeBytes = decodeBase64(mandate.challengeData);
      const signature = nacl.sign.detached(challengeBytes, this.keyPair.secretKey);

      const paymentRequest: PaymentRequest = {
        mandateId: mandate.mandateId,
        signature: encodeBase64(signature),
        publicKey: encodeBase64(this.keyPair.publicKey)
      };

      const response = await this.client.post('/ap2/pay', paymentRequest);
      return response.data;
    } catch (error) {
      console.error('AP2 payment processing failed:', error);
      throw new Error(`Failed to process payment: ${error}`);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const response = await this.client.get('/ap2/payment.status', {
        params: { paymentId }
      });
      return response.data;
    } catch (error) {
      console.error('AP2 payment status query failed:', error);
      throw new Error(`Failed to get payment status: ${error}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async processSplitPayments(cartTotal: number, paymentTerms: { initialPayment: number; deliveryPayment: number }, cartId: string): Promise<{
    initialPayment: PaymentResponse;
    deliveryMandateId: string;
    totalPaid: number;
  }> {
    try {
      console.log(`Processing split payment: $${paymentTerms.initialPayment} initial + $${paymentTerms.deliveryPayment} on delivery`);

      // Create and process initial payment
      const initialTtl = new Date();
      initialTtl.setMinutes(initialTtl.getMinutes() + 10);

      const initialMandateRequest: MandateRequest = {
        cartId,
        payerRef: 'TEAM-OPS-001',
        amount: Math.round(paymentTerms.initialPayment * 100), // Convert to cents
        paymentType: 'initial',
        ttl: initialTtl.toISOString(),
        splitPayment: {
          initialAmount: paymentTerms.initialPayment,
          deliveryAmount: paymentTerms.deliveryPayment,
          totalAmount: cartTotal
        }
      };

      const initialMandate = await this.createMandate(initialMandateRequest);
      const initialPayment = await this.processPayment(initialMandate);

      // Create delivery payment mandate (not processed yet)
      const deliveryTtl = new Date();
      deliveryTtl.setDate(deliveryTtl.getDate() + 3); // Valid for 3 days

      const deliveryMandateRequest: MandateRequest = {
        cartId: `${cartId}_delivery`,
        payerRef: 'TEAM-OPS-001',
        amount: Math.round(paymentTerms.deliveryPayment * 100),
        paymentType: 'delivery',
        ttl: deliveryTtl.toISOString(),
        splitPayment: {
          initialAmount: paymentTerms.initialPayment,
          deliveryAmount: paymentTerms.deliveryPayment,
          totalAmount: cartTotal
        }
      };

      const deliveryMandate = await this.createMandate(deliveryMandateRequest);

      // Wait for initial payment confirmation
      await this.waitForPaymentConfirmation(initialPayment.paymentId);

      return {
        initialPayment,
        deliveryMandateId: deliveryMandate.mandateId,
        totalPaid: paymentTerms.initialPayment
      };
    } catch (error) {
      console.error('Split payment processing failed:', error);
      throw new Error(`Failed to process split payments: ${error}`);
    }
  }

  async processDeliveryPayment(deliveryMandateId: string): Promise<PaymentResponse> {
    try {
      // In a real scenario, this would be called when delivery is confirmed
      // For demo purposes, we'll just process it immediately
      console.log(`Processing delivery payment for mandate: ${deliveryMandateId}`);

      // This would need to retrieve the mandate and process the delivery payment
      // For now, we'll simulate it
      const deliveryPayment: PaymentResponse = {
        paymentId: `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        status: 'completed',
        amount: 0, // Would be set from mandate
        processed: new Date().toISOString()
      };

      return deliveryPayment;
    } catch (error) {
      console.error('Delivery payment processing failed:', error);
      throw new Error(`Failed to process delivery payment: ${error}`);
    }
  }

  private async waitForPaymentConfirmation(paymentId: string, maxWaitTime = 15000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 2000;

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const status = await this.getPaymentStatus(paymentId);

          if (status.status === 'completed') {
            resolve();
          } else if (status.status === 'failed') {
            reject(new Error(`Payment failed: ${status.failureReason || 'Unknown error'}`));
          } else if (Date.now() - startTime > maxWaitTime) {
            reject(new Error('Payment confirmation timeout'));
          } else {
            setTimeout(checkStatus, checkInterval);
          }
        } catch (error) {
          reject(error);
        }
      };

      checkStatus();
    });
  }

  getPublicKey(): string | null {
    return this.keyPair ? encodeBase64(this.keyPair.publicKey) : null;
  }
}
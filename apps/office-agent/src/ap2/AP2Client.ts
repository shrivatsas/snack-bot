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

  getPublicKey(): string | null {
    return this.keyPair ? encodeBase64(this.keyPair.publicKey) : null;
  }
}
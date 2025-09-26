import axios, { AxiosInstance } from 'axios';

export interface CatalogQuery {
  categories: string[];
  dietary?: string[];
  maxBudget?: number;
}

export interface CatalogItem {
  sku: string;
  name: string;
  price: number;
  category: string;
  dietary: string[];
  minQuantity?: number;
}

export interface LineItem {
  sku: string;
  quantity: number;
}

export interface QuoteRequest {
  items: LineItem[];
  deliveryDate: string;
  headcount: number;
}

export interface QuoteLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface QuoteResponse {
  quoteId: string;
  total: number;
  lineItems: QuoteLineItem[];
  deliveryWindow: string;
  expires: string;
}

export interface CounterOffer {
  targetTotal?: number;
  adjustedItems?: Array<{
    sku: string;
    newQuantity: number;
  }>;
  notes?: string;
}

export interface NegotiationRequest {
  quoteId: string;
  counterOffer: CounterOffer;
}

export interface NegotiationResponse {
  accepted: boolean;
  revisedQuote?: QuoteResponse;
  message?: string;
}

export interface CartLockResponse {
  cartId: string;
  total: number;
  lineItems: QuoteLineItem[];
  deliveryWindow: string;
  lockedUntil: string;
}

export class A2AClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.VENDOR_AGENT_URL || 'http://localhost:4000';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SnackBot-OfficeAgent/1.0'
      }
    });
  }

  async queryCatalog(query: CatalogQuery): Promise<CatalogItem[]> {
    try {
      const response = await this.client.post('/a2a/catalog.query', query);
      return response.data.items;
    } catch (error) {
      console.error('A2A catalog query failed:', error);
      throw new Error(`Failed to query catalog: ${error}`);
    }
  }

  async createQuote(request: QuoteRequest): Promise<QuoteResponse> {
    try {
      const response = await this.client.post('/a2a/quote.create', request);
      return response.data;
    } catch (error) {
      console.error('A2A quote creation failed:', error);
      throw new Error(`Failed to create quote: ${error}`);
    }
  }

  async negotiate(request: NegotiationRequest): Promise<NegotiationResponse> {
    try {
      const response = await this.client.post('/a2a/negotiate', request);
      return response.data;
    } catch (error) {
      console.error('A2A negotiation failed:', error);
      throw new Error(`Failed to negotiate: ${error}`);
    }
  }

  async lockCart(quoteId: string): Promise<CartLockResponse> {
    try {
      const response = await this.client.post('/a2a/cart.lock', { quoteId });
      return response.data;
    } catch (error) {
      console.error('A2A cart lock failed:', error);
      throw new Error(`Failed to lock cart: ${error}`);
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
}
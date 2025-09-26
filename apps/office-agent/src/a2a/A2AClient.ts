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
  vendor?: string;
  paymentTerms?: {
    initialPayment: number;
    deliveryPayment: number;
    initialPercentage: number;
  };
}

export interface VendorConfig {
  name: string;
  baseUrl: string;
  description: string;
}

export interface MultiVendorQuoteComparison {
  bestOverallQuote: QuoteResponse & { vendor: string; baseUrl: string };
  bestBudgetQuote: QuoteResponse & { vendor: string; baseUrl: string };
  allQuotes: Array<QuoteResponse & { vendor: string; baseUrl: string; error?: string }>;
  savings: {
    maxSavings: number;
    percentageSaved: number;
    recommendedVendor: string;
  };
}

export class A2AClient {
  private vendors: VendorConfig[];
  private clients: Map<string, AxiosInstance>;

  constructor() {
    this.vendors = [
      {
        name: 'Quick Snacks Ltd.',
        baseUrl: process.env.VENDOR_AGENT_URL || 'http://localhost:4000',
        description: 'Fast, affordable snacks and basics'
      },
      {
        name: 'Premium Foods Co.',
        baseUrl: process.env.PREMIUM_VENDOR_URL || 'http://localhost:4001',
        description: 'Premium, artisan, and gourmet options'
      }
    ];

    this.clients = new Map();
    this.vendors.forEach(vendor => {
      this.clients.set(vendor.name, axios.create({
        baseURL: vendor.baseUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SnackBot-OfficeAgent/1.0'
        }
      }));
    });
  }

  async queryCatalogFromAllVendors(query: CatalogQuery): Promise<{ [vendorName: string]: CatalogItem[] }> {
    const results: { [vendorName: string]: CatalogItem[] } = {};

    await Promise.all(
      this.vendors.map(async (vendor) => {
        try {
          const client = this.clients.get(vendor.name)!;
          const response = await client.post('/a2a/catalog.query', query);
          results[vendor.name] = response.data.items || [];
          console.log(`Catalog from ${vendor.name}: ${results[vendor.name].length} items`);
        } catch (error) {
          console.warn(`Failed to query catalog from ${vendor.name}:`, error);
          results[vendor.name] = [];
        }
      })
    );

    return results;
  }

  async createQuoteFromVendor(vendorName: string, request: QuoteRequest): Promise<QuoteResponse> {
    const client = this.clients.get(vendorName);
    if (!client) {
      throw new Error(`Unknown vendor: ${vendorName}`);
    }

    try {
      const response = await client.post('/a2a/quote.create', request);
      return response.data;
    } catch (error) {
      console.error(`Failed to get quote from ${vendorName}:`, error);
      throw error;
    }
  }

  async createQuoteFromAllVendors(request: QuoteRequest): Promise<MultiVendorQuoteComparison> {
    const allQuotes: Array<QuoteResponse & { vendor: string; baseUrl: string; error?: string }> = [];

    // Get quotes from all vendors
    await Promise.all(
      this.vendors.map(async (vendor) => {
        try {
          const client = this.clients.get(vendor.name)!;
          const response = await client.post('/a2a/quote.create', request);
          const quote = response.data;
          allQuotes.push({
            ...quote,
            vendor: vendor.name,
            baseUrl: vendor.baseUrl
          });
        } catch (error) {
          console.warn(`Failed to get quote from ${vendor.name}:`, error);
          allQuotes.push({
            quoteId: `failed_${vendor.name}`,
            total: Infinity,
            lineItems: [],
            deliveryWindow: '',
            expires: '',
            vendor: vendor.name,
            baseUrl: vendor.baseUrl,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    // Filter out failed quotes
    const validQuotes = allQuotes.filter(quote => !quote.error && quote.total !== Infinity);

    if (validQuotes.length === 0) {
      throw new Error('No valid quotes received from any vendor');
    }

    // Find best quotes
    const bestBudgetQuote = validQuotes.reduce((prev, current) =>
      current.total < prev.total ? current : prev
    );

    // For "best overall", consider factors like delivery time, payment terms, etc.
    // For now, we'll use the best budget quote, but this could be more sophisticated
    const bestOverallQuote = bestBudgetQuote;

    // Calculate savings
    const maxTotal = Math.max(...validQuotes.map(q => q.total));
    const maxSavings = maxTotal - bestBudgetQuote.total;
    const percentageSaved = maxSavings > 0 ? ((maxSavings / maxTotal) * 100) : 0;

    return {
      bestOverallQuote,
      bestBudgetQuote,
      allQuotes,
      savings: {
        maxSavings,
        percentageSaved,
        recommendedVendor: bestOverallQuote.vendor
      }
    };
  }

  async negotiate(request: NegotiationRequest, vendorName?: string, vendorUrl?: string): Promise<NegotiationResponse> {
    try {
      let client: AxiosInstance;
      if (vendorName && this.clients.has(vendorName)) {
        client = this.clients.get(vendorName)!;
      } else if (vendorUrl) {
        client = axios.create({
          baseURL: vendorUrl,
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SnackBot-OfficeAgent/1.0'
          }
        });
      } else {
        throw new Error('No vendor specified for negotiation');
      }

      const response = await client.post('/a2a/negotiate', request);
      return response.data;
    } catch (error) {
      console.error(`A2A negotiation failed with ${vendorName || vendorUrl}:`, error);
      throw new Error(`Failed to negotiate: ${error}`);
    }
  }

  async lockCart(quoteId: string, vendorName?: string, vendorUrl?: string): Promise<CartLockResponse> {
    try {
      let client: AxiosInstance;
      if (vendorName && this.clients.has(vendorName)) {
        client = this.clients.get(vendorName)!;
      } else if (vendorUrl) {
        client = axios.create({
          baseURL: vendorUrl,
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SnackBot-OfficeAgent/1.0'
          }
        });
      } else {
        throw new Error('No vendor specified for cart lock');
      }

      const response = await client.post('/a2a/cart.lock', { quoteId });
      const cart = response.data;

      // Add vendor information to cart
      cart.vendor = vendorName || 'Unknown Vendor';

      return cart;
    } catch (error) {
      console.error(`A2A cart lock failed with ${vendorName || vendorUrl}:`, error);
      throw new Error(`Failed to lock cart: ${error}`);
    }
  }

  async healthCheckAllVendors(): Promise<{ [vendorName: string]: boolean }> {
    const results: { [vendorName: string]: boolean } = {};

    await Promise.all(
      this.vendors.map(async (vendor) => {
        try {
          const client = this.clients.get(vendor.name)!;
          const response = await client.get('/health');
          results[vendor.name] = response.status === 200;
        } catch (error) {
          results[vendor.name] = false;
        }
      })
    );

    return results;
  }

  getVendors(): VendorConfig[] {
    return [...this.vendors];
  }
}
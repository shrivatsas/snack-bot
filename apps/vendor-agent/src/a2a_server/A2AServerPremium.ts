import { Request, Response } from 'express';

interface CatalogItem {
  sku: string;
  name: string;
  price: number;
  category: string;
  dietary: string[];
  minQuantity?: number;
  vendor: string;
}

interface QuoteLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Quote {
  quoteId: string;
  total: number;
  lineItems: QuoteLineItem[];
  deliveryWindow: string;
  expires: string;
  vendor: string;
  paymentTerms: {
    initialPayment: number;
    deliveryPayment: number;
    initialPercentage: number;
  };
}

export class A2AServerPremium {
  private catalog: CatalogItem[] = [];
  private quotes: Map<string, Quote> = new Map();
  private carts: Map<string, any> = new Map();

  constructor() {
    this.initializePremiumCatalog();
  }

  private initializePremiumCatalog(): void {
    this.catalog = [
      {
        sku: 'premium-gourmet-001',
        name: 'Artisan Cheese & Charcuterie Board (serves 15)',
        price: 280,
        category: 'gourmet',
        dietary: ['vegetarian'],
        minQuantity: 1,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-healthy-001',
        name: 'Organic Superfood Smoothie Bowls (12pc)',
        price: 180,
        category: 'healthy',
        dietary: ['vegan', 'gluten-free', 'organic'],
        minQuantity: 12,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-sushi-001',
        name: 'Fresh Sushi Platter Deluxe (40pc)',
        price: 320,
        category: 'sushi',
        dietary: [],
        minQuantity: 40,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-salad-001',
        name: 'Mediterranean Quinoa Salad Bowls (10pc)',
        price: 150,
        category: 'salads',
        dietary: ['vegetarian', 'gluten-free'],
        minQuantity: 10,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-pastry-001',
        name: 'French Pastry Selection (2 dozen)',
        price: 120,
        category: 'pastries',
        dietary: ['vegetarian'],
        minQuantity: 24,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-coffee-001',
        name: 'Premium Coffee Bar Service (serves 20)',
        price: 85,
        category: 'beverages',
        dietary: ['vegan', 'gluten-free'],
        minQuantity: 1,
        vendor: 'Premium Foods Co.'
      },
      {
        sku: 'premium-wrap-001',
        name: 'Gourmet Wrap Platter (16pc assorted)',
        price: 190,
        category: 'wraps',
        dietary: ['vegetarian'],
        minQuantity: 16,
        vendor: 'Premium Foods Co.'
      }
    ];
  }

  async queryCatalog(req: Request, res: Response): Promise<void> {
    try {
      const { categories, dietary, maxBudget } = req.body;

      let filteredItems = this.catalog;

      if (categories && categories.length > 0) {
        filteredItems = filteredItems.filter(item =>
          categories.includes(item.category)
        );
      }

      if (dietary && dietary.length > 0) {
        filteredItems = filteredItems.filter(item =>
          dietary.some((diet: string) => item.dietary.includes(diet))
        );
      }

      if (maxBudget) {
        filteredItems = filteredItems.filter(item => item.price <= maxBudget);
      }

      res.json({
        items: filteredItems,
        vendor: 'Premium Foods Co.',
        message: 'Premium quality ingredients, artisan preparation'
      });
    } catch (error) {
      console.error('Premium catalog query error:', error);
      res.status(500).json({ error: 'Failed to query premium catalog' });
    }
  }

  async createQuote(req: Request, res: Response): Promise<void> {
    try {
      const { items, deliveryDate, headcount } = req.body;

      const quoteId = `premium_quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const lineItems: QuoteLineItem[] = [];
      let total = 0;

      for (const item of items) {
        const catalogItem = this.catalog.find(c => c.sku === item.sku);
        if (!catalogItem) {
          res.status(400).json({ error: `Unknown Premium SKU: ${item.sku}` });
          return;
        }

        const quantity = Math.max(item.quantity, catalogItem.minQuantity || 1);
        const totalPrice = catalogItem.price * quantity;

        lineItems.push({
          sku: catalogItem.sku,
          name: catalogItem.name,
          quantity,
          unitPrice: catalogItem.price,
          totalPrice
        });

        total += totalPrice;
      }

      // Premium vendor offers volume discount for large orders
      if (total > 400) {
        total = Math.floor(total * 0.85); // 15% discount for premium orders
      }

      // Calculate split payment terms
      const initialPercentage = 30; // 30% upfront for premium orders
      const initialPayment = Math.floor(total * (initialPercentage / 100));
      const deliveryPayment = total - initialPayment;

      const deliveryWindow = this.calculateDeliveryWindow(deliveryDate);
      const expires = new Date();
      expires.setHours(expires.getHours() + 3); // Premium quotes valid for 3 hours

      const quote: Quote = {
        quoteId,
        total,
        lineItems,
        deliveryWindow,
        expires: expires.toISOString(),
        vendor: 'Premium Foods Co.',
        paymentTerms: {
          initialPayment,
          deliveryPayment,
          initialPercentage
        }
      };

      this.quotes.set(quoteId, quote);

      res.json(quote);
    } catch (error) {
      console.error('Premium quote creation error:', error);
      res.status(500).json({ error: 'Failed to create premium quote' });
    }
  }

  async negotiate(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId, counterOffer } = req.body;

      const quote = this.quotes.get(quoteId);
      if (!quote) {
        res.status(404).json({ error: 'Premium quote not found' });
        return;
      }

      const { targetTotal, adjustedItems, notes } = counterOffer;

      // Premium vendor negotiation logic - less flexible on price, more on terms
      const currentTotal = quote.total;
      const requestedTotal = targetTotal || currentTotal;

      // Accept if within 8% of original quote (premium vendors are less flexible)
      const discountPercentage = (currentTotal - requestedTotal) / currentTotal;
      const maxDiscount = 0.08;

      if (discountPercentage <= maxDiscount) {
        // Create revised quote
        const revisedQuote = { ...quote };
        revisedQuote.total = requestedTotal;

        if (adjustedItems && adjustedItems.length > 0) {
          // Apply quantity adjustments
          for (const adjustment of adjustedItems) {
            const lineItem = revisedQuote.lineItems.find(li => li.sku === adjustment.sku);
            if (lineItem) {
              lineItem.quantity = adjustment.newQuantity;
              lineItem.totalPrice = lineItem.unitPrice * lineItem.quantity;
            }
          }

          // Recalculate total and payment terms
          revisedQuote.total = revisedQuote.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
        }

        // Recalculate payment terms
        const initialPayment = Math.floor(revisedQuote.total * (revisedQuote.paymentTerms.initialPercentage / 100));
        revisedQuote.paymentTerms = {
          ...revisedQuote.paymentTerms,
          initialPayment,
          deliveryPayment: revisedQuote.total - initialPayment
        };

        this.quotes.set(quoteId, revisedQuote);

        res.json({
          accepted: true,
          revisedQuote,
          message: 'Premium quote revised. Payment terms: 30% upfront, 70% on delivery'
        });
      } else {
        res.json({
          accepted: false,
          message: `Premium pricing: cannot accept discount of ${Math.round(discountPercentage * 100)}%. Maximum discount is ${Math.round(maxDiscount * 100)}%. Consider adjusting quantities instead.`
        });
      }
    } catch (error) {
      console.error('Premium negotiation error:', error);
      res.status(500).json({ error: 'Failed to process premium negotiation' });
    }
  }

  async lockCart(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.body;

      const quote = this.quotes.get(quoteId);
      if (!quote) {
        res.status(404).json({ error: 'Premium quote not found' });
        return;
      }

      const cartId = `premium_cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + 20); // 20 minute lock for premium orders

      const cart = {
        cartId,
        quoteId,
        total: quote.total,
        lineItems: quote.lineItems,
        deliveryWindow: quote.deliveryWindow,
        lockedUntil: lockedUntil.toISOString(),
        status: 'locked',
        vendor: quote.vendor,
        paymentTerms: quote.paymentTerms
      };

      this.carts.set(cartId, cart);

      res.json({
        cartId: cart.cartId,
        total: cart.total,
        lineItems: cart.lineItems,
        deliveryWindow: cart.deliveryWindow,
        lockedUntil: cart.lockedUntil,
        vendor: cart.vendor,
        paymentTerms: cart.paymentTerms
      });
    } catch (error) {
      console.error('Premium cart lock error:', error);
      res.status(500).json({ error: 'Failed to lock premium cart' });
    }
  }

  private calculateDeliveryWindow(deliveryDate?: string): string {
    const date = deliveryDate ? new Date(deliveryDate) : new Date();
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Premium service offers earlier delivery
    const startHour = 9;
    const endHour = 11;

    const start = new Date(tomorrow);
    start.setHours(startHour, 0, 0, 0);

    const end = new Date(tomorrow);
    end.setHours(endHour, 0, 0, 0);

    return `${start.toISOString().slice(0, 16)}-${end.toISOString().slice(11, 16)}`;
  }

  getQuote(quoteId: string): Quote | undefined {
    return this.quotes.get(quoteId);
  }

  getCart(cartId: string): any {
    return this.carts.get(cartId);
  }
}
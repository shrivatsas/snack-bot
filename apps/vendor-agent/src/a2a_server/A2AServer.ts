import { Request, Response } from 'express';

interface CatalogItem {
  sku: string;
  name: string;
  price: number;
  category: string;
  dietary: string[];
  minQuantity?: number;
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
}

export class A2AServer {
  private catalog: CatalogItem[] = [];
  private quotes: Map<string, Quote> = new Map();
  private carts: Map<string, any> = new Map();

  constructor() {
    this.initializeCatalog();
  }

  private initializeCatalog(): void {
    this.catalog = [
      {
        sku: 'snack-veg-001',
        name: 'Mixed Vegetable Spring Rolls (20pc)',
        price: 120,
        category: 'hot-snacks',
        dietary: ['vegetarian', 'vegan'],
        minQuantity: 20
      },
      {
        sku: 'snack-fruit-001',
        name: 'Fresh Fruit Platter (serves 10)',
        price: 80,
        category: 'fresh',
        dietary: ['vegan', 'gluten-free', 'nut-allergy'],
        minQuantity: 1
      },
      {
        sku: 'snack-nuts-001',
        name: 'Mixed Nuts & Dried Fruits (1lb)',
        price: 45,
        category: 'snacks',
        dietary: ['vegan', 'gluten-free'],
        minQuantity: 1
      },
      {
        sku: 'snack-sandwich-001',
        name: 'Mini Sandwiches Variety Pack (24pc)',
        price: 150,
        category: 'sandwiches',
        dietary: [],
        minQuantity: 24
      },
      {
        sku: 'snack-cookies-001',
        name: 'Assorted Cookies (2 dozen)',
        price: 60,
        category: 'sweets',
        dietary: ['vegetarian'],
        minQuantity: 24
      },
      {
        sku: 'beverage-coffee-001',
        name: 'Coffee Service Setup (serves 15)',
        price: 40,
        category: 'beverages',
        dietary: ['vegan', 'gluten-free'],
        minQuantity: 1
      },
      {
        sku: 'snack-gf-001',
        name: 'Gluten-Free Crackers & Cheese (serves 8)',
        price: 75,
        category: 'specialty',
        dietary: ['vegetarian', 'gluten-free'],
        minQuantity: 1
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

      res.json({ items: filteredItems });
    } catch (error) {
      console.error('Catalog query error:', error);
      res.status(500).json({ error: 'Failed to query catalog' });
    }
  }

  async createQuote(req: Request, res: Response): Promise<void> {
    try {
      const { items, deliveryDate, headcount } = req.body;

      const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const lineItems: QuoteLineItem[] = [];
      let total = 0;

      for (const item of items) {
        const catalogItem = this.catalog.find(c => c.sku === item.sku);
        if (!catalogItem) {
          res.status(400).json({ error: `Unknown SKU: ${item.sku}` });
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

      // Apply bulk discount for large orders
      if (total > 500) {
        total = Math.floor(total * 0.9); // 10% discount
      }

      const deliveryWindow = this.calculateDeliveryWindow(deliveryDate);
      const expires = new Date();
      expires.setHours(expires.getHours() + 2);

      const quote: Quote = {
        quoteId,
        total,
        lineItems,
        deliveryWindow,
        expires: expires.toISOString()
      };

      this.quotes.set(quoteId, quote);

      res.json(quote);
    } catch (error) {
      console.error('Quote creation error:', error);
      res.status(500).json({ error: 'Failed to create quote' });
    }
  }

  async negotiate(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId, counterOffer } = req.body;

      const quote = this.quotes.get(quoteId);
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const { targetTotal, adjustedItems, notes } = counterOffer;

      // Simple negotiation logic
      const currentTotal = quote.total;
      const requestedTotal = targetTotal || currentTotal;

      // Accept if within 15% of original quote
      const discountPercentage = (currentTotal - requestedTotal) / currentTotal;
      const maxDiscount = 0.15;

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

          // Recalculate total
          revisedQuote.total = revisedQuote.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
        }

        this.quotes.set(quoteId, revisedQuote);

        res.json({
          accepted: true,
          revisedQuote,
          message: 'Counter-offer accepted with revisions'
        });
      } else {
        res.json({
          accepted: false,
          message: `Cannot accept discount of ${Math.round(discountPercentage * 100)}%. Maximum discount is ${Math.round(maxDiscount * 100)}%`
        });
      }
    } catch (error) {
      console.error('Negotiation error:', error);
      res.status(500).json({ error: 'Failed to process negotiation' });
    }
  }

  async lockCart(req: Request, res: Response): Promise<void> {
    try {
      const { quoteId } = req.body;

      const quote = this.quotes.get(quoteId);
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const cartId = `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + 15); // 15 minute lock

      const cart = {
        cartId,
        quoteId,
        total: quote.total,
        lineItems: quote.lineItems,
        deliveryWindow: quote.deliveryWindow,
        lockedUntil: lockedUntil.toISOString(),
        status: 'locked'
      };

      this.carts.set(cartId, cart);

      res.json({
        cartId: cart.cartId,
        total: cart.total,
        lineItems: cart.lineItems,
        deliveryWindow: cart.deliveryWindow,
        lockedUntil: cart.lockedUntil
      });
    } catch (error) {
      console.error('Cart lock error:', error);
      res.status(500).json({ error: 'Failed to lock cart' });
    }
  }

  private calculateDeliveryWindow(deliveryDate?: string): string {
    const date = deliveryDate ? new Date(deliveryDate) : new Date();
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startHour = 10;
    const endHour = 12;

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
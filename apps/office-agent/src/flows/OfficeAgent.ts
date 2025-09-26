import { SheetsClient, TeamMember } from '../mcp/SheetsClient';
import { WebhookClient } from '../mcp/WebhookClient';
import { A2AClient, CatalogQuery, QuoteRequest, MultiVendorQuoteComparison } from '../a2a/A2AClient';
import { AP2Client, MandateRequest } from '../ap2/AP2Client';
import { AuditLogger } from '../store/AuditLogger';

export interface SnackFlowResult {
  success: boolean;
  cartId?: string;
  paymentId?: string;
  deliveryMandateId?: string;
  total?: number;
  initialPayment?: number;
  deliveryPayment?: number;
  selectedVendor?: string;
  vendorComparison?: {
    quotesReceived: number;
    savings: number;
    percentageSaved: number;
  };
  error?: string;
  steps: string[];
}

export class OfficeAgent {
  private sheetsClient: SheetsClient;
  private webhookClient: WebhookClient;
  private a2aClient: A2AClient;
  private ap2Client: AP2Client;
  private auditLogger: AuditLogger;

  constructor() {
    this.sheetsClient = new SheetsClient();
    this.webhookClient = new WebhookClient();
    this.a2aClient = new A2AClient();
    this.ap2Client = new AP2Client();
    this.auditLogger = new AuditLogger();
  }

  async executeSnackFlow(): Promise<SnackFlowResult> {
    const steps: string[] = [];
    const flowId = `flow_${Date.now()}`;

    try {
      await this.auditLogger.logFlowStart(flowId, 'snack_ordering');

      // Step 1: Connect to MCP services
      steps.push('Connecting to MCP services');
      await this.sheetsClient.connect();

      // Step 2: Collect team preferences
      steps.push('Reading team preferences from sheets');
      const teamMembers = await this.sheetsClient.getTeamPreferences();
      await this.auditLogger.logStep(flowId, 'team_preferences_collected', { count: teamMembers.length });

      // Step 3: Analyze dietary requirements and budget
      const analysis = this.analyzeTeamRequirements(teamMembers);
      steps.push(`Analyzed team: ${teamMembers.length} members, budget $${analysis.totalBudget}`);

      // Step 4: Query catalogs from all vendors
      steps.push('Querying catalogs from all vendors via A2A');
      const catalogQuery: CatalogQuery = {
        categories: ['hot-snacks', 'fresh', 'snacks', 'beverages', 'gourmet', 'healthy', 'sushi', 'salads', 'pastries', 'wraps'],
        dietary: analysis.dietaryRequirements,
        maxBudget: Math.floor(analysis.totalBudget * 0.8) // Allow premium options up to 80% of total budget
      };

      const allCatalogs = await this.a2aClient.queryCatalogFromAllVendors(catalogQuery);
      const totalItems = Object.values(allCatalogs).reduce((sum, items) => sum + items.length, 0);
      await this.auditLogger.logStep(flowId, 'multi_vendor_catalog_queried', {
        vendorCount: Object.keys(allCatalogs).length,
        totalItems
      });

      // Step 5: Send multi-vendor options for approval
      steps.push('Sending multi-vendor options for team approval');
      await this.webhookClient.sendSnackOptions(Object.values(allCatalogs).flat());

      // Step 6: Create quotes from all vendors (let each vendor propose their best offering)
      steps.push('Requesting quotes from all vendors');

      // Let each vendor propose their best offering based on team size and budget
      const vendorComparison = await this.createVendorSpecificQuotes(allCatalogs, analysis, teamMembers.length);
      await this.auditLogger.logStep(flowId, 'multi_vendor_quotes', {
        quotesReceived: vendorComparison.allQuotes.length,
        bestVendor: vendorComparison.bestBudgetQuote.vendor,
        savings: vendorComparison.savings
      });

      steps.push(`Comparing ${vendorComparison.allQuotes.length} quotes - best: ${vendorComparison.bestBudgetQuote.vendor} ($${vendorComparison.bestBudgetQuote.total})`);

      // Step 7: Request approval for best quote
      steps.push('Requesting approval for selected vendor');
      await this.webhookClient.requestApproval(vendorComparison.bestOverallQuote);

      // Step 8: Negotiate with selected vendor if needed
      let finalQuote = vendorComparison.bestOverallQuote;
      if (finalQuote.total > analysis.totalBudget * 0.9) {
        steps.push(`Negotiating price with ${finalQuote.vendor}`);
        const negotiationResult = await this.a2aClient.negotiate({
          quoteId: finalQuote.quoteId,
          counterOffer: {
            targetTotal: Math.floor(analysis.totalBudget * 0.85),
            notes: 'Budget adjustment needed for team order'
          }
        }, finalQuote.vendor, finalQuote.baseUrl);

        if (negotiationResult.accepted && negotiationResult.revisedQuote) {
          await this.auditLogger.logStep(flowId, 'negotiation_successful', negotiationResult);
          Object.assign(finalQuote, negotiationResult.revisedQuote);
          steps.push(`Negotiation successful - new total: $${finalQuote.total}`);
        } else {
          await this.auditLogger.logStep(flowId, 'negotiation_failed', negotiationResult);
          steps.push('Negotiation failed - proceeding with original quote');
        }
      }

      // Step 9: Lock cart with selected vendor
      steps.push(`Locking cart with ${finalQuote.vendor}`);
      const cart = await this.a2aClient.lockCart(finalQuote.quoteId, finalQuote.vendor, finalQuote.baseUrl);
      await this.auditLogger.logStep(flowId, 'cart_locked', {
        cartId: cart.cartId,
        vendor: cart.vendor,
        paymentTerms: cart.paymentTerms
      });

      let paymentResult: any;
      let deliveryMandateId: string | undefined;
      let initialPayment = 0;
      let deliveryPayment = 0;

      // Step 10-12: Handle payments (split or full)
      if (cart.paymentTerms && cart.paymentTerms.initialPayment > 0) {
        steps.push(`Processing split payment: $${cart.paymentTerms.initialPayment} initial + $${cart.paymentTerms.deliveryPayment} on delivery`);

        const splitPaymentResult = await this.ap2Client.processSplitPayments(
          cart.total,
          cart.paymentTerms,
          cart.cartId
        );

        paymentResult = splitPaymentResult.initialPayment;
        deliveryMandateId = splitPaymentResult.deliveryMandateId;
        initialPayment = cart.paymentTerms.initialPayment;
        deliveryPayment = cart.paymentTerms.deliveryPayment;

        await this.auditLogger.logStep(flowId, 'split_payment_processed', {
          initialPaymentId: paymentResult.paymentId,
          deliveryMandateId,
          initialAmount: initialPayment,
          deliveryAmount: deliveryPayment
        });

        steps.push(`Initial payment of $${initialPayment} completed - delivery payment of $${deliveryPayment} scheduled`);
      } else {
        // Traditional full payment
        steps.push('Processing full payment');
        const ttl = new Date();
        ttl.setMinutes(ttl.getMinutes() + 10);

        const mandateRequest: MandateRequest = {
          cartId: cart.cartId,
          payerRef: 'TEAM-OPS-001',
          amount: Math.round(cart.total * 100),
          ttl: ttl.toISOString(),
          metadata: {
            flowId,
            teamSize: teamMembers.length,
            vendor: cart.vendor
          }
        };

        const mandate = await this.ap2Client.createMandate(mandateRequest);
        paymentResult = await this.ap2Client.processPayment(mandate);
        await this.waitForPaymentConfirmation(paymentResult.paymentId);

        steps.push(`Full payment of $${cart.total} completed`);
      }

      // Step 13: Send confirmation
      steps.push('Sending payment confirmation');
      await this.webhookClient.confirmPayment({
        ...paymentResult,
        vendor: cart.vendor,
        total: cart.total,
        paymentType: deliveryMandateId ? 'split' : 'full',
        initialPayment,
        deliveryPayment
      });

      // Step 14: Log order to sheets
      steps.push('Logging order to sheets');
      await this.sheetsClient.logOrder({
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        deliveryMandateId,
        vendor: cart.vendor,
        total: cart.total,
        initialPayment,
        deliveryPayment,
        timestamp: new Date().toISOString()
      });

      await this.auditLogger.logFlowComplete(flowId, {
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        deliveryMandateId,
        vendor: cart.vendor,
        total: cart.total,
        savings: vendorComparison.savings
      });

      return {
        success: true,
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        deliveryMandateId,
        total: cart.total,
        initialPayment,
        deliveryPayment,
        selectedVendor: cart.vendor,
        vendorComparison: {
          quotesReceived: vendorComparison.allQuotes.length,
          savings: vendorComparison.savings.maxSavings,
          percentageSaved: vendorComparison.savings.percentageSaved
        },
        steps
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      steps.push(`Error: ${errorMessage}`);

      await this.auditLogger.logFlowError(flowId, errorMessage);
      await this.webhookClient.sendError(errorMessage, { flowId, step: steps.length });

      return {
        success: false,
        error: errorMessage,
        steps
      };
    } finally {
      await this.sheetsClient.disconnect();
    }
  }

  private analyzeTeamRequirements(teamMembers: TeamMember[]) {
    const totalBudget = teamMembers.reduce((sum, member) => sum + member.budget, 0);
    const averageBudget = totalBudget / teamMembers.length;

    const dietaryRequirements = new Set<string>();
    teamMembers.forEach(member => {
      member.dietary.forEach(diet => dietaryRequirements.add(diet));
    });

    return {
      totalBudget,
      averageBudget,
      dietaryRequirements: Array.from(dietaryRequirements)
    };
  }

  private selectOptimalItemsFromAllVendors(allCatalogs: { [vendorName: string]: any[] }, analysis: any) {
    // For demo purposes, select items that exist in both vendors' catalogs to ensure fair comparison
    console.log('Catalog items by vendor:', Object.keys(allCatalogs).map(vendor => ({
      vendor,
      itemCount: allCatalogs[vendor].length,
      sampleItems: allCatalogs[vendor].slice(0, 2).map(item => ({ sku: item.sku, price: item.price }))
    })));

    // Look for common categories that both vendors can serve
    const allItems = Object.values(allCatalogs).flat();

    // Prioritize beverage items as both vendors have coffee services
    const beverageItems = allItems.filter(item =>
      item.category === 'beverages' &&
      item.price <= analysis.totalBudget * 0.6 // Affordable for team
    );

    // Select beverage items for fair comparison (coffee services)
    if (beverageItems.length > 0) {
      const selectedItems = [];

      // Pick one representative beverage item that's affordable
      const affordableBeverage = beverageItems.find(item =>
        item.price <= 100 && // Reasonable price
        (item.dietary.includes('vegan') || item.dietary.includes('vegetarian') || item.dietary.length === 0)
      );

      if (affordableBeverage) {
        selectedItems.push({
          sku: affordableBeverage.sku,
          quantity: Math.max(affordableBeverage.minQuantity || 1, 1)
        });
        console.log(`Selected beverage item for vendor comparison: ${affordableBeverage.sku} ($${affordableBeverage.price})`);
        return selectedItems;
      }
    }

    // Fallback: select cheapest suitable items across all vendors
    const suitableItems = allItems.filter(item => {
      return item.price <= analysis.totalBudget * 0.4 && ( // Affordable
        analysis.dietaryRequirements.some((diet: string) => item.dietary.includes(diet)) ||
        item.dietary.includes('vegan') || item.dietary.includes('vegetarian') ||
        item.dietary.length === 0 // No dietary restrictions
      );
    });

    const sortedItems = suitableItems.sort((a, b) => a.price - b.price);
    const selectedItems = [];

    if (sortedItems.length > 0) {
      selectedItems.push({
        sku: sortedItems[0].sku,
        quantity: Math.max(sortedItems[0].minQuantity || 1, 1)
      });
      console.log(`Selected fallback item: ${sortedItems[0].sku} ($${sortedItems[0].price})`);
    }

    console.log(`Selected ${selectedItems.length} items for multi-vendor comparison`);
    return selectedItems;
  }

  private async createVendorSpecificQuotes(allCatalogs: { [vendorName: string]: any[] }, analysis: any, headcount: number): Promise<any> {
    const allQuotes: Array<any> = [];
    const vendors = Object.keys(allCatalogs);

    // Create vendor-specific quotes
    for (const vendorName of vendors) {
      const vendorItems = allCatalogs[vendorName];
      if (vendorItems.length === 0) continue;

      try {
        // Select the best item from this vendor's catalog
        const affordableItems = vendorItems.filter(item =>
          item.price <= analysis.totalBudget * 0.8
        );

        if (affordableItems.length === 0) continue;

        // Pick the most suitable item (prefer beverages for universal appeal)
        const beverageItem = affordableItems.find(item => item.category === 'beverages');
        const selectedItem = beverageItem || affordableItems[0];

        const quoteRequest = {
          items: [{
            sku: selectedItem.sku,
            quantity: Math.max(selectedItem.minQuantity || 1, 1)
          }],
          deliveryDate: this.calculateDeliveryDate(),
          headcount: headcount
        };

        console.log(`Requesting quote from ${vendorName} for ${selectedItem.sku} ($${selectedItem.price})`);

        const quote = await this.a2aClient.createQuoteFromVendor(vendorName, quoteRequest);
        allQuotes.push({
          ...quote,
          vendor: vendorName
        });

      } catch (error) {
        console.warn(`Failed to get quote from ${vendorName}:`, error);
      }
    }

    // Process and compare quotes
    if (allQuotes.length === 0) {
      throw new Error('No valid quotes received from any vendor');
    }

    const validQuotes = allQuotes.filter(quote => quote.total > 0);
    const bestBudgetQuote = validQuotes.reduce((prev, current) =>
      current.total < prev.total ? current : prev
    );
    const bestOverallQuote = bestBudgetQuote; // For now, same as budget

    // Calculate savings
    const maxTotal = Math.max(...validQuotes.map(q => q.total));
    const maxSavings = maxTotal - bestBudgetQuote.total;
    const percentageSaved = maxSavings > 0 ? ((maxSavings / maxTotal) * 100) : 0;

    console.log(`Quote comparison: ${validQuotes.length} quotes, best: ${bestBudgetQuote.vendor} ($${bestBudgetQuote.total}), savings: $${maxSavings}`);

    return {
      bestOverallQuote,
      bestBudgetQuote,
      allQuotes: validQuotes,
      savings: {
        maxSavings,
        percentageSaved,
        recommendedVendor: bestOverallQuote.vendor
      }
    };
  }

  private calculateDeliveryDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  private async waitForPaymentConfirmation(paymentId: string, maxWaitTime = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 2000;

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const status = await this.ap2Client.getPaymentStatus(paymentId);

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
}
import { SheetsClient, TeamMember } from '../mcp/SheetsClient';
import { WebhookClient } from '../mcp/WebhookClient';
import { A2AClient, CatalogQuery, QuoteRequest } from '../a2a/A2AClient';
import { AP2Client, MandateRequest } from '../ap2/AP2Client';
import { AuditLogger } from '../store/AuditLogger';

export interface SnackFlowResult {
  success: boolean;
  cartId?: string;
  paymentId?: string;
  total?: number;
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

      // Step 4: Query catalog for suitable options
      steps.push('Querying vendor catalog via A2A');
      const catalogQuery: CatalogQuery = {
        categories: ['hot-snacks', 'fresh', 'snacks', 'beverages'],
        dietary: analysis.dietaryRequirements,
        maxBudget: Math.floor(analysis.averageBudget * 1.2)
      };

      const catalogItems = await this.a2aClient.queryCatalog(catalogQuery);
      await this.auditLogger.logStep(flowId, 'catalog_queried', { itemCount: catalogItems.length });

      // Step 5: Send options for approval
      steps.push('Sending snack options for team approval');
      await this.webhookClient.sendSnackOptions(catalogItems);

      // Step 6: Create quote (simulating approval)
      steps.push('Creating quote with vendor');
      const selectedItems = this.selectOptimalItems(catalogItems, analysis);

      const quoteRequest: QuoteRequest = {
        items: selectedItems,
        deliveryDate: this.calculateDeliveryDate(),
        headcount: teamMembers.length
      };

      const quote = await this.a2aClient.createQuote(quoteRequest);
      await this.auditLogger.logStep(flowId, 'quote_created', { quoteId: quote.quoteId, total: quote.total });

      // Step 7: Request approval for quote
      steps.push('Requesting approval for quote');
      await this.webhookClient.requestApproval(quote);

      // Step 8: Negotiate if needed (simple logic for demo)
      if (quote.total > analysis.totalBudget * 0.9) {
        steps.push('Negotiating price with vendor');
        const negotiationResult = await this.a2aClient.negotiate({
          quoteId: quote.quoteId,
          counterOffer: {
            targetTotal: Math.floor(analysis.totalBudget * 0.85),
            notes: 'Budget adjustment needed for team order'
          }
        });

        if (negotiationResult.accepted && negotiationResult.revisedQuote) {
          await this.auditLogger.logStep(flowId, 'negotiation_successful', negotiationResult);
          Object.assign(quote, negotiationResult.revisedQuote);
        } else {
          await this.auditLogger.logStep(flowId, 'negotiation_failed', negotiationResult);
        }
      }

      // Step 9: Lock cart
      steps.push('Locking cart for payment');
      const cart = await this.a2aClient.lockCart(quote.quoteId);
      await this.auditLogger.logStep(flowId, 'cart_locked', { cartId: cart.cartId });

      // Step 10: Create payment mandate
      steps.push('Creating payment mandate via AP2');
      const ttl = new Date();
      ttl.setMinutes(ttl.getMinutes() + 10); // 10 minutes to pay

      const mandateRequest: MandateRequest = {
        cartId: cart.cartId,
        payerRef: 'TEAM-OPS-001',
        amount: Math.round(cart.total * 100), // Convert to cents
        ttl: ttl.toISOString(),
        metadata: {
          flowId,
          teamSize: teamMembers.length
        }
      };

      const mandate = await this.ap2Client.createMandate(mandateRequest);
      await this.auditLogger.logStep(flowId, 'mandate_created', { mandateId: mandate.mandateId });

      // Step 11: Process payment
      steps.push('Processing payment with signed mandate');
      const paymentResult = await this.ap2Client.processPayment(mandate);
      await this.auditLogger.logStep(flowId, 'payment_initiated', { paymentId: paymentResult.paymentId });

      // Step 12: Wait for payment confirmation
      steps.push('Waiting for payment confirmation');
      await this.waitForPaymentConfirmation(paymentResult.paymentId);

      const finalStatus = await this.ap2Client.getPaymentStatus(paymentResult.paymentId);
      await this.auditLogger.logStep(flowId, 'payment_completed', finalStatus);

      // Step 13: Send confirmation
      steps.push('Sending payment confirmation');
      await this.webhookClient.confirmPayment(finalStatus);

      // Step 14: Log order to sheets
      steps.push('Logging order to sheets');
      await this.sheetsClient.logOrder({
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        total: cart.total,
        timestamp: new Date().toISOString()
      });

      await this.auditLogger.logFlowComplete(flowId, {
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        total: cart.total
      });

      return {
        success: true,
        cartId: cart.cartId,
        paymentId: paymentResult.paymentId,
        total: cart.total,
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

  private selectOptimalItems(catalogItems: any[], analysis: any) {
    // Simple selection logic for demo
    const selectedItems = [];
    let remainingBudget = analysis.totalBudget;

    // Prioritize items that satisfy dietary requirements
    const suitableItems = catalogItems.filter(item => {
      return analysis.dietaryRequirements.some((diet: string) =>
        item.dietary.includes(diet)
      ) || item.dietary.includes('vegan'); // Vegan works for everyone
    });

    // Select a variety of items within budget
    for (const item of suitableItems.slice(0, 3)) {
      if (remainingBudget >= item.price) {
        const quantity = Math.max(item.minQuantity || 1, 1);
        selectedItems.push({
          sku: item.sku,
          quantity
        });
        remainingBudget -= item.price * quantity;
      }
    }

    // If no suitable items, select basic options
    if (selectedItems.length === 0) {
      selectedItems.push({
        sku: catalogItems[0]?.sku || 'snack-fruit-001',
        quantity: 1
      });
    }

    return selectedItems;
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
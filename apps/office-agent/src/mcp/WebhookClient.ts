import axios from 'axios';

export interface NotificationPayload {
  type: 'snack_options' | 'approval_request' | 'payment_confirmation' | 'error';
  timestamp: string;
  data: any;
}

export class WebhookClient {
  private webhookUrl: string;
  private mockMode: boolean;

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL || '';
    this.mockMode = !this.webhookUrl || this.webhookUrl.includes('example');
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    if (this.mockMode) {
      console.log('Mock webhook notification:', JSON.stringify(payload, null, 2));
      return;
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SnackBot-OfficeAgent/1.0'
        },
        timeout: 5000
      });

      console.log(`Webhook sent: ${payload.type}`);
    } catch (error) {
      console.error('Failed to send webhook:', error);
      // In a real system, you might want to queue for retry
      throw error;
    }
  }

  async sendSnackOptions(options: any[]): Promise<void> {
    await this.sendNotification({
      type: 'snack_options',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Snack options available for team approval',
        options,
        action_required: 'Please review and approve preferred snacks'
      }
    });
  }

  async requestApproval(quote: any): Promise<void> {
    await this.sendNotification({
      type: 'approval_request',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Quote ready for approval',
        quote,
        total: quote.total,
        action_required: 'Please approve this snack order'
      }
    });
  }

  async confirmPayment(paymentResult: any): Promise<void> {
    await this.sendNotification({
      type: 'payment_confirmation',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Snack order payment processed',
        payment: paymentResult,
        status: paymentResult.status
      }
    });
  }

  async sendError(error: string, context?: any): Promise<void> {
    await this.sendNotification({
      type: 'error',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Error in snack ordering process',
        error,
        context
      }
    });
  }
}
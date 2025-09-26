import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface TeamMember {
  name: string;
  dietary: string[];
  budget: number;
}

export class SheetsClient {
  private client: Client | null = null;
  private mockMode: boolean;

  constructor() {
    this.mockMode = !process.env.SHEET_ID || process.env.SHEET_ID.includes('example');
  }

  async connect(): Promise<void> {
    if (this.mockMode) {
      console.log('SheetsClient running in mock mode');
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['@modelcontextprotocol/server-gdrive', process.env.SHEET_ID!]
      });

      this.client = new Client({
        name: 'office-agent',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {}
        }
      });

      await this.client.connect(transport);
    } catch (error) {
      console.warn('Failed to connect to MCP server, falling back to mock mode:', error);
      this.mockMode = true;
    }
  }

  async getTeamPreferences(): Promise<TeamMember[]> {
    if (this.mockMode) {
      return this.getMockTeamPreferences();
    }

    try {
      if (!this.client) {
        throw new Error('Client not connected');
      }

      const result = await this.client.callTool({
        name: 'gdrive_read_file',
        arguments: {
          file_id: process.env.SHEET_ID!
        }
      });

      return this.parseSheetData(result.content);
    } catch (error) {
      console.warn('Failed to read from sheets, using mock data:', error);
      return this.getMockTeamPreferences();
    }
  }

  async logOrder(orderData: any): Promise<void> {
    if (this.mockMode) {
      console.log('Mock order log:', orderData);
      return;
    }

    try {
      if (!this.client) {
        throw new Error('Client not connected');
      }

      await this.client.callTool({
        name: 'gdrive_append_to_file',
        arguments: {
          file_id: process.env.SHEET_ID!,
          content: this.formatOrderForSheet(orderData)
        }
      });
    } catch (error) {
      console.error('Failed to log order to sheets:', error);
    }
  }

  private getMockTeamPreferences(): TeamMember[] {
    return [
      { name: 'Alice', dietary: ['vegan'], budget: 25 },
      { name: 'Bob', dietary: [], budget: 30 },
      { name: 'Charlie', dietary: ['gluten-free'], budget: 20 },
      { name: 'Diana', dietary: ['vegetarian'], budget: 35 },
      { name: 'Eve', dietary: ['nut-allergy'], budget: 25 }
    ];
  }

  private parseSheetData(content: any): TeamMember[] {
    // In a real implementation, this would parse CSV or structured data
    // For now, return mock data
    return this.getMockTeamPreferences();
  }

  private formatOrderForSheet(orderData: any): string {
    const timestamp = new Date().toISOString();
    return `${timestamp},${orderData.cartId},${orderData.total},${orderData.paymentId}\n`;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
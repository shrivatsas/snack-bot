import { OfficeAgent } from '../src/flows/OfficeAgent';

// Mock the dependencies
jest.mock('../src/mcp/SheetsClient');
jest.mock('../src/mcp/WebhookClient');
jest.mock('../src/a2a/A2AClient');
jest.mock('../src/ap2/AP2Client');
jest.mock('../src/store/AuditLogger');

describe('OfficeAgent', () => {
  let agent: OfficeAgent;

  beforeEach(() => {
    agent = new OfficeAgent();
  });

  describe('executeSnackFlow', () => {
    it('should execute complete snack flow successfully', async () => {
      const result = await agent.executeSnackFlow();

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.cartId).toBeDefined();
      expect(result.paymentId).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Mock an error in the flow
      jest.spyOn(agent as any, 'sheetsClient').mockImplementation(() => {
        throw new Error('Mock error');
      });

      const result = await agent.executeSnackFlow();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });
});
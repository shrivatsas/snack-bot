import express from 'express';
import dotenv from 'dotenv';
import { OfficeAgent } from './flows/OfficeAgent';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const agent = new OfficeAgent();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Trigger snack ordering flow
app.post('/order-snacks', async (req, res) => {
  try {
    const result = await agent.executeSnackFlow();
    res.json(result);
  } catch (error) {
    console.error('Snack flow error:', error);
    res.status(500).json({
      error: 'Failed to execute snack flow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.listen(port, () => {
  console.log(`Office Agent running on port ${port}`);
  console.log('Environment:');
  console.log('- SHEET_ID:', process.env.SHEET_ID);
  console.log('- WEBHOOK_URL:', process.env.WEBHOOK_URL);
  console.log('- VENDOR_AGENT_URL:', process.env.VENDOR_AGENT_URL);
  console.log('- PAYMENT_AGENT_URL:', process.env.PAYMENT_AGENT_URL);
});
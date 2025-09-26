import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { A2AServer } from './a2a_server/A2AServer';
import { AP2Acceptor } from './ap2_acceptor/AP2Acceptor';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const paymentPort = process.env.PAYMENT_PORT || 5000;

app.use(cors());
app.use(express.json());

const a2aServer = new A2AServer();
const ap2Acceptor = new AP2Acceptor();

// A2A endpoints
app.post('/a2a/catalog.query', a2aServer.queryCatalog.bind(a2aServer));
app.post('/a2a/quote.create', a2aServer.createQuote.bind(a2aServer));
app.post('/a2a/negotiate', a2aServer.negotiate.bind(a2aServer));
app.post('/a2a/cart.lock', a2aServer.lockCart.bind(a2aServer));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vendor-agent' });
});

// AP2 payment server
const paymentApp = express();
paymentApp.use(cors());
paymentApp.use(express.json());

paymentApp.post('/ap2/mandate.create', ap2Acceptor.createMandate.bind(ap2Acceptor));
paymentApp.post('/ap2/pay', ap2Acceptor.processPayment.bind(ap2Acceptor));
paymentApp.get('/ap2/payment.status', ap2Acceptor.getPaymentStatus.bind(ap2Acceptor));

paymentApp.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ap2-acceptor' });
});

app.listen(port, () => {
  console.log(`Vendor Agent (A2A) running on port ${port}`);
});

paymentApp.listen(paymentPort, () => {
  console.log(`Payment Acceptor (AP2) running on port ${paymentPort}`);
});
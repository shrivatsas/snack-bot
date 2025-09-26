import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { A2AServer } from './a2a_server/A2AServer';
import { A2AServerPremium } from './a2a_server/A2AServerPremium';
import { AP2Acceptor } from './ap2_acceptor/AP2Acceptor';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const premiumPort = process.env.PREMIUM_PORT || 4001;
const paymentPort = process.env.PAYMENT_PORT || 5001;

app.use(cors());
app.use(express.json());

const a2aServer = new A2AServer();
const a2aPremiumServer = new A2AServerPremium();
const ap2Acceptor = new AP2Acceptor();

// Standard Vendor A2A endpoints
app.post('/a2a/catalog.query', a2aServer.queryCatalog.bind(a2aServer));
app.post('/a2a/quote.create', a2aServer.createQuote.bind(a2aServer));
app.post('/a2a/negotiate', a2aServer.negotiate.bind(a2aServer));
app.post('/a2a/cart.lock', a2aServer.lockCart.bind(a2aServer));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'standard-vendor-agent', vendor: 'Quick Snacks Ltd.' });
});

// Premium Vendor A2A server
const premiumApp = express();
premiumApp.use(cors());
premiumApp.use(express.json());

premiumApp.post('/a2a/catalog.query', a2aPremiumServer.queryCatalog.bind(a2aPremiumServer));
premiumApp.post('/a2a/quote.create', a2aPremiumServer.createQuote.bind(a2aPremiumServer));
premiumApp.post('/a2a/negotiate', a2aPremiumServer.negotiate.bind(a2aPremiumServer));
premiumApp.post('/a2a/cart.lock', a2aPremiumServer.lockCart.bind(a2aPremiumServer));

premiumApp.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'premium-vendor-agent', vendor: 'Premium Foods Co.' });
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
  console.log(`Standard Vendor Agent (A2A) running on port ${port}`);
});

premiumApp.listen(premiumPort, () => {
  console.log(`Premium Vendor Agent (A2A) running on port ${premiumPort}`);
});

paymentApp.listen(paymentPort, () => {
  console.log(`Payment Acceptor (AP2) running on port ${paymentPort}`);
});
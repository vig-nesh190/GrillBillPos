import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Invoice } from '../models/Invoice.js';
import { Product } from '../models/Product.js';
import { Settings } from '../models/Settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const ORDER_TYPES = new Set(['Dine-in', 'Takeaway', 'Delivery']);
const PAYMENT_METHODS = new Set(['Cash', 'UPI', 'Card', 'Other']);
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const publicInvoice = doc => ({
  id: doc.id,
  number: doc.number,
  createdAt: new Date(doc.createdAt).toISOString(),
  customerName: doc.customerName || '',
  customerPhone: doc.customerPhone || '',
  orderType: doc.orderType,
  items: (doc.items || []).map(item => ({
    productId: item.productId, name: item.name, price: item.price, quantity: item.quantity
  })),
  subtotal: doc.subtotal,
  discount: doc.discount,
  charges: doc.charges,
  total: doc.total,
  paymentMethod: doc.paymentMethod,
  status: doc.status
});

router.get('/', asyncHandler(async (_req, res) => {
  const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();
  res.json(invoices.map(publicInvoice));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { items, orderType, paymentMethod } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Add at least one product before checkout.' });
  }
  if (!ORDER_TYPES.has(orderType)) return res.status(400).json({ message: 'Choose a valid order type.' });
  if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ message: 'Choose a valid payment method.' });
  if (items.length > 100) return res.status(400).json({ message: 'A bill cannot contain more than 100 line items.' });

  const productIds = items.map(item => String(item?.productId || ''));
  if (productIds.some(id => !id)) return res.status(400).json({ message: 'Each bill item needs a product ID.' });
  const requested = new Map();
  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ message: 'Product quantities must be whole numbers between 1 and 999.' });
    }
    const id = String(item.productId);
    requested.set(id, (requested.get(id) || 0) + quantity);
    if (requested.get(id) > 999) return res.status(400).json({ message: 'Product quantity cannot exceed 999.' });
  }

  const products = await Product.find({ id: { $in: [...requested.keys()] } }).lean();
  const productsById = new Map(products.map(product => [product.id, product]));
  const invoiceItems = [];
  for (const [productId, quantity] of requested.entries()) {
    const product = productsById.get(productId);
    if (!product) return res.status(400).json({ message: `Product ${productId} was not found. Refresh the menu and try again.` });
    if (!product.available) return res.status(400).json({ message: `${product.name} is currently unavailable. Refresh the menu and try again.` });
    invoiceItems.push({ productId, name: product.name, price: money(product.price), quantity });
  }

  const settings = await Settings.findById('default').lean();
  const subtotal = money(invoiceItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const discountInput = Number(body.discount);
  const discount = money(Math.max(0, Math.min(Number.isFinite(discountInput) ? discountInput : 0, subtotal)));
  const chargesInput = Number(body.charges);
  const charges = money(Math.max(0, Number.isFinite(chargesInput) ? chargesInput : 0));
  const total = money(Math.max(0, subtotal - discount + charges));
  // Atomic sequence increment prevents duplicate invoice numbers under concurrent checkouts.
  const counter = await mongooseCounterIncrement();
  const prefix = String(settings?.invoicePrefix || 'EMBER-INV').trim() || 'EMBER-INV';
  const number = `${prefix}-${String(counter).padStart(4, '0')}`;
  const invoice = await Invoice.create({
    id: randomUUID(), number, createdAt: new Date(),
    customerName: String(body.customerName || '').trim().slice(0, 120),
    customerPhone: String(body.customerPhone || '').trim().slice(0, 40),
    orderType, items: invoiceItems, subtotal, discount, charges, total,
    paymentMethod,
    status: 'Completed'
  });
  res.status(201).json(publicInvoice(invoice));
}));

async function mongooseCounterIncrement() {
  const { Counter } = await import('../models/Counter.js');
  const counter = await Counter.findByIdAndUpdate('invoice', { $inc: { seq: 1 } }, {
    new: true, upsert: true, setDefaultsOnInsert: true
  });
  return counter.seq;
}

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOneAndUpdate(
    { id: req.params.id, status: 'Completed' },
    { $set: { status: 'Demo cancelled' } },
    { new: true, runValidators: true }
  );
  if (!invoice) return res.status(404).json({ message: 'Completed invoice not found. It may already be cancelled.' });
  res.json(publicInvoice(invoice));
}));

export default router;

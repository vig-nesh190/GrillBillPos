import { Router } from 'express';
import { Settings } from '../models/Settings.js';
import { DEFAULT_SETTINGS } from '../utils/defaults.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const FIELDS = ['shopName', 'address', 'phone', 'cashier', 'invoicePrefix'];
const publicSettings = doc => Object.fromEntries(FIELDS.map(key => [key, doc[key]]));

router.get('/', asyncHandler(async (_req, res) => {
  let settings = await Settings.findById('default');
  if (!settings) settings = await Settings.create({ _id: 'default', ...DEFAULT_SETTINGS });
  res.json(publicSettings(settings));
}));

router.put('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const shopName = String(body.shopName ?? '').trim();
  const invoicePrefix = String(body.invoicePrefix ?? '').trim();
  if (!shopName || !invoicePrefix) {
    return res.status(400).json({ message: 'Shop name and invoice prefix are required.' });
  }
  const update = {
    shopName: shopName.slice(0, 120),
    address: String(body.address ?? '').trim().slice(0, 300),
    phone: String(body.phone ?? '').trim().slice(0, 40),
    cashier: String(body.cashier ?? '').trim().slice(0, 120),
    invoicePrefix: invoicePrefix.slice(0, 32)
  };
  const settings = await Settings.findByIdAndUpdate('default', { $set: update }, {
    new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true
  });
  res.json(publicSettings(settings));
}));

export default router;

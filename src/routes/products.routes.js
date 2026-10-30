import { Router } from 'express';
import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const publicProduct = doc => ({
  id: doc.id,
  name: doc.name,
  category: doc.category,
  price: doc.price,
  image: doc.image || '',
  description: doc.description || '',
  sku: doc.sku || '',
  available: Boolean(doc.available)
});
const allowedFields = ['name', 'category', 'price', 'image', 'description', 'sku', 'available'];

function cleanProduct(input = {}) {
  const clean = {};
  for (const key of allowedFields) {
    if (Object.hasOwn(input, key)) clean[key] = input[key];
  }
  if (typeof clean.name === 'string') clean.name = clean.name.trim();
  if (typeof clean.category === 'string') clean.category = clean.category.trim();
  if (typeof clean.description === 'string') clean.description = clean.description.trim();
  if (typeof clean.sku === 'string') clean.sku = clean.sku.trim();
  if (typeof clean.image === 'string') clean.image = clean.image.trim();
  if (Object.hasOwn(clean, 'price')) clean.price = Number(clean.price);
  if (Object.hasOwn(clean, 'available')) clean.available = Boolean(clean.available);
  return clean;
}

router.get('/', asyncHandler(async (_req, res) => {
  const products = await Product.find().sort({ _id: 1 }).lean();
  res.json(products.map(publicProduct));
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = cleanProduct(req.body);
  if (!data.name || !data.category || !Number.isFinite(data.price) || data.price < 0) {
    return res.status(400).json({ message: 'Product name, category and a non-negative price are required.' });
  }
  data.id = `P${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
  const product = await Product.create(data);
  res.status(201).json(publicProduct(product));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const data = cleanProduct(req.body);
  if (!data.name || !data.category || !Number.isFinite(data.price) || data.price < 0) {
    return res.status(400).json({ message: 'Product name, category and a non-negative price are required.' });
  }
  const product = await Product.findOneAndUpdate({ id: req.params.id }, { $set: data }, {
    new: true,
    runValidators: true
  });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  res.json(publicProduct(product));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const product = await Product.findOneAndDelete({ id: req.params.id });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  res.status(204).end();
}));

export default router;

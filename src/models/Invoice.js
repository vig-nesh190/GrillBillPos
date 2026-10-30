import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1, max: 999, validate: Number.isInteger }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  number: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now, required: true, index: true },
  customerName: { type: String, default: '', trim: true, maxlength: 120 },
  customerPhone: { type: String, default: '', trim: true, maxlength: 40 },
  orderType: { type: String, enum: ['Dine-in', 'Takeaway', 'Delivery'], required: true },
  items: { type: [invoiceItemSchema], required: true, validate: value => value.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, required: true, min: 0 },
  charges: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Card', 'Other'], required: true },
  status: { type: String, enum: ['Completed', 'Demo cancelled'], default: 'Completed', index: true }
}, { timestamps: false, versionKey: false });

invoiceSchema.index({ status: 1, createdAt: -1 });
export const Invoice = mongoose.model('Invoice', invoiceSchema);

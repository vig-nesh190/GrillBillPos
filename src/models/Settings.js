import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'default' },
  shopName: { type: String, required: true, trim: true, maxlength: 120 },
  address: { type: String, default: '', trim: true, maxlength: 300 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  cashier: { type: String, default: '', trim: true, maxlength: 120 },
  invoicePrefix: { type: String, required: true, trim: true, maxlength: 32 }
}, { timestamps: true, versionKey: false, _id: true });

export const Settings = mongoose.model('Settings', settingsSchema);

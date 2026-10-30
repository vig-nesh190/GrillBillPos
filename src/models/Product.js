import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, trim: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  price: { type: Number, required: true, min: 0, max: 10000000 },
  image: { type: String, default: '', maxlength: 2000000 },
  description: { type: String, default: '', maxlength: 300 },
  sku: { type: String, default: '', trim: true, maxlength: 60 },
  available: { type: Boolean, default: true }
}, { timestamps: true, versionKey: false });

productSchema.index({ name: 1, category: 1 });
export const Product = mongoose.model('Product', productSchema);

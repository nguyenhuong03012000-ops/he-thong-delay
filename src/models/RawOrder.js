const mongoose = require('mongoose');

const rawOrderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    fetched_at: { type: Date, default: Date.now }
});

// Create index for fast upserts
rawOrderSchema.index({ id: 1 });

module.exports = mongoose.model('RawOrder', rawOrderSchema);

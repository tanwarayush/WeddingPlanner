// server.js — AI Wedding Cost Estimator Backend
// Node.js + Express + MongoDB

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// ── MONGODB CONNECTION ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/wedding_estimator', {
  useNewUrlParser: true, useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ── SCHEMAS ───────────────────────────────────────────────────────────────────
const EstimateSchema = new mongoose.Schema({
  sessionId:     String,
  inputs:        Object,
  result:        Object,
  totalCost:     Number,
  createdAt:     { type:Date, default:Date.now },
});
const Estimate = mongoose.model('Estimate', EstimateSchema);

// ── PRICING DATASETS (mirrors frontend dataset) ────────────────────────────────
const DATASET = {
  venues: {
    "Luxury Hotel":   {
      "ITC Maurya":          { base:800000, perGuest:4500 },
      "Hyatt Regency":       { base:700000, perGuest:4000 },
      "The Leela Ambience":  { base:900000, perGuest:5000 },
      "Taj Palace":          { base:1000000,perGuest:5500 },
    },
    "Farmhouse": {
      "Chattarpur Farmhouse A": { base:250000, perGuest:800 },
      "Chattarpur Farmhouse B": { base:180000, perGuest:600 },
      "Sultanpur Farmhouse":    { base:200000, perGuest:700 },
    },
    "Banquet Hall": {
      "Grand Banquet MG Road":  { base:150000, perGuest:500 },
      "Royal Banquet Dwarka":   { base:120000, perGuest:400 },
      "Crystal Banquet Noida":  { base:100000, perGuest:350 },
    },
  },
  catering: {
    "Veg Standard":         { perPlate:800  },
    "Veg Premium":          { perPlate:1400 },
    "Non-Veg Standard":     { perPlate:1200 },
    "Non-Veg Premium":      { perPlate:2000 },
    "Pure Veg Sattvic":     { perPlate:900  },
    "Premium International":{ perPlate:3000 },
  },
  decoration: {
    "Floral Minimal":    { base:80000,  extra:200 },
    "Floral Grand":      { base:250000, extra:400 },
    "Royal Theme":       { base:400000, extra:600 },
    "Destination Style": { base:600000, extra:900 },
    "Rustic Boho":       { base:120000, extra:250 },
    "Modern Luxe":       { base:350000, extra:550 },
  },
  artists: {
    "No Artist":0,"DJ":40000,"Live Band (Local)":80000,
    "Anchor/Emcee":30000,"Classical Performer":60000,
    "Bollywood Singer":250000,"Celebrity Performer":1500000,
    "DJ + Anchor":65000,"Band + DJ + Anchor":130000,
  },
  hospitality: {
    "Basic (Welcome Desk)":15000,"Standard (Welcome + Ushers)":35000,
    "Premium (Full Staff)":70000,"Luxury (Concierge + Valet)":120000,
  },
  eventManager: {
    "Self-Managed":0,"Part-time Coordinator":50000,
    "Full-Service Planner":150000,"Premium Wedding Planner":350000,
    "Celebrity Planner":800000,
  },
  production: {
    "Basic Sound + Lights":60000,"Standard AV Package":120000,
    "Premium Stage + Lights":250000,"Grand Production":500000,
    "Ultra LED + Trussing":800000,
  },
  hotelRate: 8000,
  liquorBase: 300000,
  liquorPerGuest: 800,
};

// ── PRICING ENGINE ─────────────────────────────────────────────────────────────
function calculateCosts(inputs) {
  const {
    venueType, venue, guests: guestStr, catering,
    decoration, hospitality, eventManager, artist,
    liquor, hotelRooms: roomsStr, production,
    miscPct: miscPctStr, margin: marginPctStr,
  } = inputs;

  const guests     = Math.max(10, Math.min(5000, parseInt(guestStr) || 200));
  const rooms      = Math.max(0, parseInt(roomsStr) || 0);
  const miscPct    = Math.max(0.02, Math.min(0.20, parseFloat(miscPctStr) / 100 || 0.05));
  const marginPct  = Math.max(0.10, Math.min(0.30, parseFloat(marginPctStr) / 100 || 0.15));

  const venueData    = DATASET.venues[venueType]?.[venue];
  const venueCost    = venueData ? venueData.base + venueData.perGuest * guests : 0;

  const catData      = DATASET.catering[catering];
  const cateringCost = catData ? catData.perPlate * guests * 1.15 : 0;

  const decoData     = DATASET.decoration[decoration];
  const decoCost     = decoData ? decoData.base + decoData.extra * guests * 0.3 : 0;

  const artistCost   = DATASET.artists[artist]     || 0;
  const hospCost     = DATASET.hospitality[hospitality] || 0;
  const plannerCost  = DATASET.eventManager[eventManager] || 0;
  const prodCost     = DATASET.production[production] || 0;
  const hotelCost    = rooms * DATASET.hotelRate * 2;
  const liquorCost   = liquor === 'Yes'
    ? DATASET.liquorBase + DATASET.liquorPerGuest * guests : 0;

  const subtotal   = venueCost + cateringCost + decoCost + artistCost
                   + hospCost + plannerCost + prodCost + hotelCost + liquorCost;
  const miscCost   = subtotal * miscPct;
  const afterMisc  = subtotal + miscCost;
  const margin     = afterMisc * marginPct;
  const total      = afterMisc + margin;

  const items = [
    { name:"Venue",          cost:venueCost   },
    { name:"Catering",       cost:cateringCost},
    { name:"Decoration",     cost:decoCost    },
    { name:"Artist/Anchor",  cost:artistCost  },
    { name:"Hospitality",    cost:hospCost    },
    { name:"Event Planner",  cost:plannerCost },
    { name:"Production",     cost:prodCost    },
    { name:"Hotel Rooms",    cost:hotelCost   },
    { name:"Liquor",         cost:liquorCost  },
    { name:"Miscellaneous",  cost:miscCost    },
  ].filter(i=>i.cost>0);

  return { items, subtotal:afterMisc, margin, total, guests,
    perGuestCost: Math.round(total/guests) };
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// POST /api/estimate — Calculate and save estimate
app.post('/api/estimate', async (req, res) => {
  try {
    const inputs = req.body;

    // Validation
    const guests = parseInt(inputs.guests);
    if (!guests || guests < 10 || guests > 5000)
      return res.status(400).json({ error: 'Guests must be between 10 and 5000' });

    const result = calculateCosts(inputs);

    // Persist to MongoDB
    const estimate = await Estimate.create({
      sessionId: inputs.sessionId || 'anonymous',
      inputs, result,
      totalCost: result.total,
    });

    res.json({ success:true, estimate: estimate._id, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Calculation failed', detail: err.message });
  }
});

// GET /api/estimate/:id — Retrieve saved estimate
app.get('/api/estimate/:id', async (req, res) => {
  try {
    const est = await Estimate.findById(req.params.id);
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    res.json(est);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/datasets — Return all pricing data
app.get('/api/datasets', (req, res) => res.json(DATASET));

// GET /api/compare — Location comparison for a given total
app.get('/api/compare', (req, res) => {
  const base = parseFloat(req.query.base) || 1000000;
  res.json([
    { name:"Chattarpur",    cost: base * 0.75 },
    { name:"ITC Hotels",    cost: base * 1.10 },
    { name:"Hyatt Regency", cost: base * 1.00 },
    { name:"Farmhouses",    cost: base * 0.65 },
    { name:"Banquet Hall",  cost: base * 0.45 },
    { name:"Leela Palace",  cost: base * 1.25 },
  ]);
});

// GET /api/analytics — Aggregate stats
app.get('/api/analytics', async (req, res) => {
  try {
    const total   = await Estimate.countDocuments();
    const avg     = await Estimate.aggregate([{ $group:{_id:null, avg:{$avg:'$totalCost'}} }]);
    const highest = await Estimate.findOne().sort({ totalCost:-1 }).select('totalCost inputs');
    res.json({ totalEstimates:total, avgCost:avg[0]?.avg||0, highest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status:'ok', uptime:process.uptime() }));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

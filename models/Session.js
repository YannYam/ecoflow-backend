const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionCode: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  state: { type: String, enum: ['lobby', 'grouping', 'preparation', 'quiz'], default: 'lobby' },
  teamCount: { type: Number, default: 0 },
  participants: [{
    id: String,
    name: String,
    pretestScore: Number,
    pretestCompleted: { type: Boolean, default: false }
  }]
});

module.exports = mongoose.model('Session', sessionSchema);

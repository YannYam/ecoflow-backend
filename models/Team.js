const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  sessionCode: { type: String, required: true },
  teamCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  members: [{ type: String }],
  isReady: { type: Boolean, default: false },
  answers: [{
    questionId: String,
    answer: String,
    reasoning: String
  }]
});

module.exports = mongoose.model('Team', teamSchema);

// config/ratingRules.js
module.exports = {
  // 🧮 Base rules by rating difference
  baseRules: [
    { range: [0, 10], win: +1, loss: -2, draw: 0 },
    { range: [11, 30], win: +2, loss: -3, draw: +1 },
    { range: [31, 100], win: +3, loss: -4, draw: +2 },
    { range: [101, 200], win: +4, loss: -5, draw: +3 },
    { range: [201, Infinity], win: +5, loss: -6, draw: +4 },
  ],

  // 🎯 Adjustments when the stronger player is involved
  adjustment: {
    strongerWin: { strong: +1, weak: -2 },   // Strong beats weak
    strongerLoss: { strong: -3, weak: +3 },  // Strong loses to weak
    strongerDraw: { strong: -1, weak: +1 },  // Strong draws with weak
  },
};


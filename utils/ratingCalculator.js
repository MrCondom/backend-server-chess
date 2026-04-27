// utils/ratingCalculator.js
const rules = require("../config/ratingRules");

function calculateRatingChange(ratingA, ratingB, scoreA, scoreB) {
  const diff = Math.abs(ratingA - ratingB);
  let changeA = 0, changeB = 0;

  // 🚫 0:0 means no game played
  if (scoreA === 0 && scoreB === 0) {
    return { changeA: 0, changeB: 0 };
  }

  // 🧮 Find base rule
  const rule = rules.baseRules.find(
    (r) => diff >= r.range[0] && diff <= r.range[1]
  );

  if (!rule) return { changeA: 0, changeB: 0 };

  // 🧠 Normal win/loss logic
  if (scoreA > scoreB) {
    changeA = rule.win;
    changeB = rule.loss;
  }
  else if (scoreB > scoreA) {
    changeA = rule.loss;
    changeB = rule.win;
  }

  // 🤝 Draw logic
  else {

    // same rating → no gain
    if (ratingA === ratingB) {
      return { changeA: 0, changeB: 0 };
    }

    // A stronger
    if (ratingA > ratingB) {
      changeA = 0;
      changeB = rule.draw;
    }

    // B stronger
    else {
      changeB = 0;
      changeA = rule.draw;
    }
  }

  // ⚖️ Adjust win/loss if stronger involved
  if (scoreA > scoreB) {
    if (ratingA > ratingB) {
      changeA = rules.adjustment.strongerWin.strong;
      changeB = rules.adjustment.strongerWin.weak;
    }
    else if (ratingB > ratingA) {
      changeB = rules.adjustment.strongerLoss.strong;
      changeA = rules.adjustment.strongerLoss.weak;
    }
  }

  else if (scoreB > scoreA) {
    if (ratingB > ratingA) {
      changeB = rules.adjustment.strongerWin.strong;
      changeA = rules.adjustment.strongerWin.weak;
    }
    else if (ratingA > ratingB) {
      changeA = rules.adjustment.strongerLoss.strong;
      changeB = rules.adjustment.strongerLoss.weak;
    }
  }

  return { changeA, changeB };
}

module.exports = { calculateRatingChange };

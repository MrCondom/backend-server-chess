// utils/ratingCalculator.js
const rules = require("../config/ratingRules");

function calculateRatingChange(ratingA, ratingB, scoreA, scoreB) {
  const diff = Math.abs(ratingA - ratingB);
  let changeA = 0, changeB = 0;

  // 🧮 Find the base rule for this difference
  const rule = rules.baseRules.find(
    (r) => diff >= r.range[0] && diff <= r.range[1]
  );
  if (!rule) {
    return {changeA: 0, changeB: 0};
  }

  // 🧠 Apply base gain/loss for the result
  if (scoreA > scoreB) {
    changeA = rule.win;
    changeB = rule.loss;
  } else if (scoreB > scoreA) {
    changeA = rule.loss;
    changeB = rule.win;
  } else {
    changeA = rule.draw;
    changeB = rule.draw;
  }

  // ⚖️ Adjust if one player is stronger
  if (ratingA > ratingB) {
    // A stronger
    if (scoreA > scoreB) {
      changeA = rules.adjustment.strongerWin.strong;
      changeB = rules.adjustment.strongerWin.weak;
    } else if (scoreB > scoreA) {
      changeA = rules.adjustment.strongerLoss.strong;
      changeB = rules.adjustment.strongerLoss.weak;
    } else {
      changeA += rules.adjustment.strongerDraw.strong;
      changeB += rules.adjustment.strongerDraw.weak;
    }
  } else if (ratingB > ratingA) {
    // B stronger
    if (scoreB > scoreA) {
      changeB = rules.adjustment.strongerWin.strong;
      changeA = rules.adjustment.strongerWin.weak;
    } else if (scoreA > scoreB) {
      changeB = rules.adjustment.strongerLoss.strong;
      changeA = rules.adjustment.strongerLoss.weak;
    } else {
      changeB += rules.adjustment.strongerDraw.strong;
      changeA += rules.adjustment.strongerDraw.weak;
    }
  }

  return { changeA, changeB };
}

module.exports = { calculateRatingChange };


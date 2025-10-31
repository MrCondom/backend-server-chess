// utils/accuracyCalculator.js

/**
 * Calculates dynamic accuracy for a player.
 * @param {number} points - Player's total points.
 * @param {number} totalRounds - Total rounds played in category.
 * @param {number} rating - Player's current rating.
 * @returns {string} Accuracy percentage (e.g., "87.5%")
 */
function calculateAccuracy(points, totalRounds, rating) {
  if (!totalRounds || totalRounds === 0) return "0%";

  const winRate = points / totalRounds;     // consistency per round
  const ratingFactor = rating / 2300;       // scaled to elite level baseline

  const accuracy = (winRate * ratingFactor * 100).toFixed(1);
  return `${accuracy}%`;
}

module.exports = { calculateAccuracy };


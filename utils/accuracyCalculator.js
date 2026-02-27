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

  const totalGames = totalRounds * 2;

  const winRate = Math.min(1, points / totalGames);     // consistency per round
  const ratingFactor = rating / 2000;       // scaled to elite level baseline

  const accuracy = (winRate * ratingFactor * 100).toFixed(1);
  return `${accuracy}%`;
}

module.exports = { calculateAccuracy };


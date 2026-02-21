const { normalize } = require("./normalize");

/**
 * Counts consecutive CLEAN WINS (2:0 OR 1:0)
 */
function getWinStreak(results, username, mode, category) {
  let streak = 0;

  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];

    // filter by mode & category
    if (r.mode !== mode || r.category !== category) continue;

    const isA = normalize(r.playerA) === normalize(username);
    const isB = normalize(r.playerB) === normalize(username);

    if (!isA && !isB) continue;

    const winAsA =
      isA && r.scoreA > r.scoreB; // covers 2:0 and 1:0

    const winAsB =
      isB && r.scoreB > r.scoreA; // covers 2:0 and 1:0

    if (winAsA || winAsB) {
      streak++;
    } else {
      break; // streak broken
    }
  }

  return streak;
}

/**
 * Counts consecutive LOSSES (0:2 OR 0:1)
 */
function getLossStreak(results, username, mode, category) {
  let streak = 0;

  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];

    if (r.mode !== mode || r.category !== category) continue;

    const isA = normalize(r.playerA) === normalize(username);
    const isB = normalize(r.playerB) === normalize(username);

    if (!isA && !isB) continue;

    const lossAsA =
      isA && r.scoreA < r.scoreB; // covers 0:2 and 0:1

    const lossAsB =
      isB && r.scoreB < r.scoreA; // covers 0:2 and 0:1

    if (lossAsA || lossAsB) {
      streak++;
    } else {
      break; // streak broken
    }
  }

  return streak;
}

/**
 * Win streak bonus
 */
function getWinMultiplier(winStreak) {
  if (winStreak >= 6) return 5;
  if (winStreak >= 3) return 3;
  return 1;
}

/**
 * Loss streak penalty (applies only to GAINS)
 */
function getLossMultiplier(lossStreak) {
  if (lossStreak >= 6) return 3;
  if (lossStreak >= 3) return 2;
  return 1;
}

module.exports = {
  getWinStreak,
  getLossStreak,
  getWinMultiplier,
  getLossMultiplier,
};

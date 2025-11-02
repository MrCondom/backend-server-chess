const { readJSON, writeJSON } = require("./fileHandler");

// helper to shuffle players
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

// auto-generate pairings for rounds
async function createPairings(category, rounds = 5, intervalHours = 24) {
  const playersObj = await readJSON("players.json");
  const players = Object.values(playersObj || {});
  const filtered = players.filter(p => p.category === category);

  if (!filtered || filtered.length < 2) {
    throw new Error("Not enough players to create pairings.");
  }

  //Automatically determine the number of rounds if not provided
  if (!rounds) rounds = filtered.length - 1;

  const now = Date.now();
  const pairingsData = {
    [category]: {
      countdown: intervalHours * 3600,
      rounds: [],
    },
  };

  for (let r = 1; r <= rounds; r++) {
    const shuffled = shuffle([...filtered]);
    const roundPairings = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i + 1]) {
        roundPairings.push({
          white: shuffled[i].username,
          black: shuffled[i + 1].username,
        });
      } else {
        // odd player — you could push bye or a placeholder
        roundPairings.push({
          white: shuffled[i].username,
          black: null,
        });
      }
    }

    const availableAt = new Date(now + (r - 1) * intervalHours * 3600 * 1000).toISOString();

    pairingsData[category].rounds.push({
      round: r,
      pairings: roundPairings,
      availableAt,
    });
  }

  // Merge into existing pairings.json rather than overwrite everything
  const existing = await readJSON("pairings.json");
  const merged = Object.assign(existing || {}, pairingsData);
  await writeJSON("pairings.json", merged);
  return merged;
}

module.exports = { createPairings };


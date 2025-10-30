import { readJSON, writeJSON } from "./fileHandler.js";

// helper to shuffle players
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

// auto-generate pairings for rounds
export async function createPairings(category, rounds = 5, intervalHours = 24) {
  const players = await readJSON("players.json");
  const filtered = players.filter(p => p.category === category);

  if (filtered.length < 2) {
    throw new Error("Not enough players to create pairings.");
  }

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
      }
    }

    const availableAt = new Date(now + (r - 1) * intervalHours * 3600 * 1000).toISOString();

    pairingsData[category].rounds.push({
      round: r,
      pairings: roundPairings,
      availableAt,
    });
  }

  await writeJSON("pairings.json", pairingsData);
  return pairingsData;
}

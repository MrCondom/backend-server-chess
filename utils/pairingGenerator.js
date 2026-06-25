const { readJSON, writeJSON } = require("./fileHandler");

// ✅ Round-robin pairing generator (no repeat)
async function createPairings(category, rounds, intervalHours = 24) {
  const playersObj = await readJSON("players.json");
  const allPlayers = Object.values(playersObj || {});
  const filtered = allPlayers.filter(p => p.category === category);

  if (!filtered || filtered.length < 2) {
    throw new Error("Not enough players to create pairings.");
  }

  let players = filtered.map(p => p.username);

  // ✅ If odd number of players, add a dummy "BYE"
  const hasBye = players.length % 2 !== 0;
  if (hasBye) players.push("BYE");

  const totalRounds = rounds || players.length - 1;
  const numPlayers = players.length;
  const half = numPlayers / 2;
  const now = Date.now();

  const pairingsData = {
    [category]: {
      countdown: intervalHours * 3600,
      rounds: [],
    },
  };

  // ✅ Generate all rounds
  for (let r = 0; r < totalRounds; r++) {
    const roundPairings = [];

    for (let i = 0; i < half; i++) {
      const playerA = players[i];
      const playerB = players[numPlayers - 1 - i];
      if (playerA !== "BYE" && playerB !== "BYE") {
        roundPairings.push({
          white: playerA,
          black: playerB,
        });
      }
    }

    // ✅ Rotate players (except first)
    const fixed = players[0];
    const rotated = [fixed, ...players.slice(-1), ...players.slice(1, -1)];
    players = rotated;

    const availableAt = new Date(
      now + r * intervalHours * 3600 * 1000
    ).toISOString();

    pairingsData[category].rounds.push({
      round: r + 1,
      pairings: roundPairings,
      availableAt,
    });
  }

  // ✅ Merge new data with existing pairings
  const existing = await readJSON("pairings.json");
  const merged = Object.assign(existing || {}, pairingsData);
  await writeJSON("pairings.json", merged);

  return merged;
}

module.exports = { createPairings };

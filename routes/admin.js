const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const { calculateRatingChange } = require("../utils/ratingCalculator");
const { calculateAccuracy } = require("../utils/accuracyCalculator");

// File paths
const dataDir = path.join(__dirname, "../data");
const pairingsFile = path.join(dataDir, "pairings.json");
const playersFile = path.join(dataDir, "players.json");
const resultsFile = path.join(dataDir, "results.json");
const logsFile = path.join(dataDir, "admin_logs.json");

//  Helpers
const readJSON = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8") || "{}") : {};
const writeJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

//  ADMIN LOGIN
router.post("/login", (req, res) => {
  const { password } = req.body;
  const validPasswords = [
    process.env.ADMIN_PASS_1,
    process.env.ADMIN_PASS_2,
    process.env.ADMIN_PASS_3,
  ];

  const matchIndex = validPasswords.indexOf(password);
  if (matchIndex === -1) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  //  Log admin usage
  const logs = fs.existsSync(logsFile) ? readJSON(logsFile) : [];
  logs.push({
    adminId: `ADMIN_${matchIndex + 1}`,
    usedAt: new Date().toISOString(),
    ip: req.ip,
  });
  writeJSON(logsFile, logs);

  res.json({ message: "✅ Login successful", adminId: `ADMIN_${matchIndex + 1}` });
});

//  INPUT SCORES + UPDATE RATINGS
router.post("/input-scores", (req, res) => {
  const { category, round, results } = req.body;

  if (!category || !round || !results) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const players = readJSON(playersFile);
  const pairings = readJSON(pairingsFile);
  const resultsData = fs.existsSync(resultsFile)
    ? readJSON(resultsFile)
    : {};

  if (!pairings[category]) {
    return res.status(404).json({ error: "Category not found" });
  }

  const roundData = pairings[category].rounds.find((r) => r.round === round);
  if (!roundData) {
    return res.status(404).json({ error: "Round not found" });
  }

  //  Process matches
  results.forEach((match) => {
    const { white, black, result } = match;
    const [whiteScore, blackScore] = result.split("-").map(parseFloat);

    const playerWhite = players[white];
    const playerBlack = players[black];
    if (!playerWhite || !playerBlack) return;

    //  Rating update using new calculator
    const { changeA, changeB } = calculateRatingChange(
      playerWhite.rating,
      playerBlack.rating,
      whiteScore,
      blackScore
    );

    playerWhite.rating += changeA;
    playerBlack.rating += changeB;

    // Track visible rating gain (for 7 days on public leaderboard)
  playerWhite.recentGain = (playerWhite.recentGain || 0) + changeA;
  playerWhite.lastGainDate = new Date().toISOString();

  playerBlack.recentGain = (playerBlack.recentGain || 0) + changeB;
  playerBlack.lastGainDate = new Date().toISOString();

    // 🏆 Points update
    playerWhite.points = (playerWhite.points || 0) + whiteScore;
    playerBlack.points = (playerBlack.points || 0) + blackScore;

    // 🕓 Save latest round
    playerWhite.lastRound = round;
    playerBlack.lastRound = round;

    //  Record result
    if (!resultsData[category]) resultsData[category] = [];
    resultsData[category].push({ round, white, black, result });
  });

  //  Save all updates
  writeJSON(playersFile, players);
  writeJSON(resultsFile, resultsData);

  res.json({ message: `✅ Round ${round} results recorded successfully.` });
});

//  TABLE / LEADERBOARD
router.get("/table/:category", (req, res) => {
  const { category } = req.params;
  const players = readJSON(playersFile);
  const resultsData = fs.existsSync(resultsFile)
    ? readJSON(resultsFile)
    : {};

  const categoryPlayers = Object.values(players).filter(
    (p) => p.category === category
  );

  if (!categoryPlayers.length)
    return res.status(404).json({ error: "No players found in this category" });

  const totalRounds = (resultsData[category]?.length || 1);

  //  Compute accuracy dynamically via utility
  categoryPlayers.forEach((p) => {
    p.accuracy = calculateAccuracy(p.points || 0, totalRounds, p.rating);
  });

  // Sort leaderboard
  const sorted = categoryPlayers.sort((a, b) => b.points - a.points);

  const table = sorted.map((p, i) => ({
    rank: i + 1,
    username: p.username,
    points: p.points || 0,
    rating: p.rating,
    accuracy: p.accuracy,
  }));

  res.json({ category, totalRounds, table });
});

//  ADMIN RESET (Clear category or all data)
router.post("/reset", (req, res) => {
  const { target } = req.body; // "all" or a specific category

  const players = readJSON(playersFile);
  const results = fs.existsSync(resultsFile) ? readJSON(resultsFile) : {};
  const pairings = fs.existsSync(pairingsFile) ? readJSON(pairingsFile) : {};

  if (target === "all") {
    //  Reset everything
    writeJSON(playersFile, {});
    writeJSON(resultsFile, {});
    writeJSON(pairingsFile, {});
    return res.json({ message: "✅ All tournament data cleared successfully." });
  }

  //  Reset only one category
  // Filter players and results belonging to the target category
  const filteredPlayers = Object.fromEntries(
    Object.entries(players).filter(([_, p]) => p.category !== target)
  );

  const filteredResults = Object.fromEntries(
    Object.entries(results).filter(([cat]) => cat !== target)
  );

  const filteredPairings = Object.fromEntries(
    Object.entries(pairings).filter(([cat]) => cat !== target)
  );

  writeJSON(playersFile, filteredPlayers);
  writeJSON(resultsFile, filteredResults);
  writeJSON(pairingsFile, filteredPairings);

  res.json({
    message: `✅ Category '${target}' cleared successfully.`,
  });
});

//  PLAYER MATCH HISTORY
router.get("/history/:username", (req, res) => {
  const { username } = req.params;

  const players = readJSON(playersFile);
  const resultsData = fs.existsSync(resultsFile) ? readJSON(resultsFile) : {};

  if (!players[username]) {
    return res.status(404).json({ error: "Player not found" });
  }

  //  Find all matches the player participated in
  const allMatches = [];
  for (const category in resultsData) {
    const categoryMatches = resultsData[category].filter(
      (m) => m.white === username || m.black === username
    );

    categoryMatches.forEach((match) => {
      const isWhite = match.white === username;
      const opponent = isWhite ? match.black : match.white;
      const result = isWhite
        ? match.result
        : match.result.split("-").reverse().join("-");

      allMatches.push({
        category,
        round: match.round,
        opponent,
        result,
      });
    });
  }

  if (allMatches.length === 0) {
    return res.status(404).json({ error: "No match history found for this player" });
  }

  // 🕓 Sort by round
  const sortedHistory = allMatches.sort((a, b) => a.round - b.round);

  res.json({
    username,
    totalMatches: sortedHistory.length,
    history: sortedHistory,
  });
});

//  Edit player name or move to another category
router.post("/edit-player", (req, res) => {
  const { username, newName, newCategory } = req.body;
  const players = readJSON(playersFile);

  if (!players[username]) {
    return res.status(404).json({ error: "Player not found" });
  }

  if (newName) players[username].name = newName;
  if (newCategory) players[username].category = newCategory;

  writeJSON(playersFile, players);
  res.json({ message: "✅ Player updated successfully." });
});

//  Delete category pairings only
router.post("/delete-pairings", (req, res) => {
  const { category } = req.body;
  const pairings = readJSON(pairingsFile);

  if (!pairings[category]) {
    return res.status(404).json({ error: "No pairings found for this category" });
  }

  delete pairings[category];
  writeJSON(pairingsFile, pairings);
  res.json({ message: `✅ Pairings for '${category}' deleted successfully.` });
});

app.put("/players/bio/:username", async (req, res) => {
  const { username } = req.params;
  const { bio } = req.body;

  const players = await readJSON("players.json");
  const player = players[username];

  if (!player) return res.status(404).json({ message: "Player not found" });

  player.bio = bio;
  await writeJSON("players.json", players);

  res.json({ message: "Bio updated successfully", player });
});

module.exports = router;

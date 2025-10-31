const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const { calculateRatingChange } = require("../utils/ratingCalculator");
const { calculateAccuracy } = require("../utils/accuracyCalculator");

// 🗂️ File paths
const dataDir = path.join(__dirname, "../data");
const pairingsFile = path.join(dataDir, "pairings.json");
const playersFile = path.join(dataDir, "players.json");
const resultsFile = path.join(dataDir, "results.json");
const logsFile = path.join(dataDir, "admin_logs.json");

// 📘 Helpers
const readJSON = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8") || "{}") : {};
const writeJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

// 🔐 ADMIN LOGIN
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

  // 🧾 Log admin usage
  const logs = fs.existsSync(logsFile) ? readJSON(logsFile) : [];
  logs.push({
    adminId: `ADMIN_${matchIndex + 1}`,
    usedAt: new Date().toISOString(),
    ip: req.ip,
  });
  writeJSON(logsFile, logs);

  res.json({ message: "✅ Login successful", adminId: `ADMIN_${matchIndex + 1}` });
});

// 🧮 INPUT SCORES + UPDATE RATINGS
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

  // ♟️ Process matches
  results.forEach((match) => {
    const { white, black, result } = match;
    const [whiteScore, blackScore] = result.split("-").map(parseFloat);

    const playerWhite = players[white];
    const playerBlack = players[black];
    if (!playerWhite || !playerBlack) return;

    // 📊 Rating update using new calculator
    const { changeA, changeB } = calculateRatingChange(
      playerWhite.rating,
      playerBlack.rating,
      whiteScore,
      blackScore
    );

    playerWhite.rating += changeA;
    playerBlack.rating += changeB;

    // 🏆 Points update
    playerWhite.points = (playerWhite.points || 0) + whiteScore;
    playerBlack.points = (playerBlack.points || 0) + blackScore;

    // 🕓 Save latest round
    playerWhite.lastRound = round;
    playerBlack.lastRound = round;

    // 🗃️ Record result
    if (!resultsData[category]) resultsData[category] = [];
    resultsData[category].push({ round, white, black, result });
  });

  // 💾 Save all updates
  writeJSON(playersFile, players);
  writeJSON(resultsFile, resultsData);

  res.json({ message: `✅ Round ${round} results recorded successfully.` });
});

// 📊 TABLE / LEADERBOARD
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

  // 🧠 Compute accuracy dynamically via utility
  categoryPlayers.forEach((p) => {
    p.accuracy = calculateAccuracy(p.points || 0, totalRounds, p.rating);
  });

  // 🏅 Sort leaderboard
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

module.exports = router;

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const dataDir = path.join(__dirname, "../data");
const pairingsFile = path.join(dataDir, "pairings.json");
const playersFile = path.join(dataDir, "players.json");
const resultsFile = path.join(dataDir, "results.json");
const logsFile = path.join(dataDir, "admin_logs.json");

// Helper: read/write JSON
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8") || "{}");
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

  // Log usage
  const logs = fs.existsSync(logsFile) ? readJSON(logsFile) : [];
  logs.push({
    adminId: `ADMIN_${matchIndex + 1}`,
    usedAt: new Date().toISOString(),
    ip: req.ip,
  });
  writeJSON(logsFile, logs);

  res.json({ message: "Login successful", adminId: `ADMIN_${matchIndex + 1}` });
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

  // Update ratings & scores
  results.forEach((match) => {
    const { white, black, result } = match;
    const [whiteScore, blackScore] = result.split("-").map(parseFloat);

    const playerWhite = players[white];
    const playerBlack = players[black];
    if (!playerWhite || !playerBlack) return;

    // Rating difference
    const diff = Math.abs(playerWhite.rating - playerBlack.rating);
    let gain = 3,
      loss = 2;
    if (diff >= 200 && diff < 300) {
      gain = 5;
      loss = 3;
    } else if (diff >= 300 && diff < 400) {
      gain = 6;
      loss = 4;
    }

    // Update ratings based on result
    if (whiteScore > blackScore) {
      if (playerWhite.rating < playerBlack.rating)
        playerWhite.rating += gain;
      else playerWhite.rating += 3;
      playerBlack.rating -= loss;
    } else if (blackScore > whiteScore) {
      if (playerBlack.rating < playerWhite.rating)
        playerBlack.rating += gain;
      else playerBlack.rating += 3;
      playerWhite.rating -= loss;
    }

    // Update scores
    playerWhite.points = (playerWhite.points || 0) + whiteScore;
    playerBlack.points = (playerBlack.points || 0) + blackScore;

    // Save result
    if (!resultsData[category]) resultsData[category] = [];
    resultsData[category].push({ round, white, black, result });
  });

  // Save updates
  writeJSON(playersFile, players);
  writeJSON(resultsFile, resultsData);

  res.json({ message: "Scores updated successfully" });
});

// 📊 TABLE VIEW (Ranked)
router.get("/table/:category", (req, res) => {
  const { category } = req.params;
  const players = readJSON(playersFile);

  const categoryPlayers = Object.values(players).filter(
    (p) => p.category === category
  );

  if (!categoryPlayers.length)
    return res.status(404).json({ error: "No players found in category" });

  // Accuracy formula
  categoryPlayers.forEach((p) => {
    const totalRounds = 4; // static or could be dynamic later
    const wins = p.points ? p.points / 2 : 0;
    p.accuracy = (
      ((wins * 2) / (totalRounds * 2)) *
      (p.rating / 2300) *
      100
    ).toFixed(1);
  });

  // Sort by points desc
  const sorted = categoryPlayers.sort((a, b) => b.points - a.points);

  const table = sorted.map((p, i) => ({
    rank: i + 1,
    username: p.username,
    points: p.points || 0,
    rating: p.rating,
    accuracy: `${p.accuracy}%`,
  }));

  res.json({ category, table });
});

module.exports = router;

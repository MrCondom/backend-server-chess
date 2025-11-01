const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const { calculateRatingChange } = require("../utils/ratingCalculator");
const { calculateAccuracy } = require("../utils/accuracyCalculator");
const {readJSON, writeJSON} = require("../utils/fileHandler");
const {createPairings} = require("../utils/pairingGenerator");

// File paths
const dataDir = path.join(__dirname, "../data");
const pairingsFile = path.join(dataDir, "pairings.json");
const playersFile = path.join(dataDir, "players.json");
const resultsFile = path.join(dataDir, "results.json");
const logsFile = path.join(dataDir, "admin_logs.json");


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

// ✅ 1. Add new player
router.post("/add-player", async (req, res) => {
  const { name, username } = req.body;

  if (!name || !username)
    return res.status(400).json({ message: "Name and username are required" });

  const players = await readJSON("players.json");

  if (players[username])
    return res.status(400).json({ message: "Player already exists" });

  players[username] = {
    name,
    username,
    rapid: 1200,
    blitz: 1200,
    bullet: 1200,
    recentGain: 0,
    bio: "",
    category: "",
  };

  await writeJSON("players.json", players);
  res.json({
    message: "Player added successfully",
    player: players[username],
  });
});

// ✅ 2. Delete player
router.delete("/delete-player/:username", async (req, res) => {
  const username = req.params.username;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  delete players[username];
  await writeJSON("players.json", players);

  res.json({ message: `${username} deleted successfully` });
});

// ✅ 3. Add player to a category
router.post("/add-to-category", async (req, res) => {
  const { username, category } = req.body;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  players[username].category = category;
  await writeJSON("players.json", players);

  res.json({
    message: `${username} added to category ${category}`,
    player: players[username],
  });
});

// ✅ 4. Create pairings (2-player pairing system)
router.post("/create-pairings", async (req, res) => {
  const { category } = req.body;
  const players = await readJSON("players.json");

  const filtered = Object.values(players).filter(
    (p) => p.category === category
  );

  if (filtered.length < 2)
    return res.status(400).json({ message: "Not enough players to pair" });

  const pairings = [];
  for (let i = 0; i < filtered.length; i += 2) {
    if (filtered[i + 1])
      pairings.push({
        white: filtered[i].username,
        black: filtered[i + 1].username,
      });
  }

  await writeJSON(`pairings_${category}.json`, pairings);
  res.json({
    message: `Pairings created for ${category}`,
    pairings,
  });
});

// ✅ 5. Update rating (Rapid, Blitz, or Bullet)
router.post("/update-rating", async (req, res) => {
  const { username, ratingChange, mode } = req.body; // mode: "rapid" | "blitz" | "bullet"
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  const validModes = ["rapid", "blitz", "bullet"];
  const selectedMode = validModes.includes(mode) ? mode : "rapid";

  // Apply rating change
  players[username][selectedMode] += ratingChange;
  players[username].recentGain =
    (players[username].recentGain || 0) + ratingChange;

  await writeJSON("players.json", players);
  res.json({
    message: `${username}'s ${selectedMode} rating updated successfully`,
    player: players[username],
  });
});

// ✅ 6. Reset weekly recent gains (to clear + values)
router.post("/reset-weekly-gains", async (req, res) => {
  const players = await readJSON("players.json");

  Object.values(players).forEach((p) => {
    p.recentGain = 0;
  });

  await writeJSON("players.json", players);
  res.json({
    message: "Weekly recent gains reset successfully",
  });
});

// ✅ 7. Update player bio
router.post("/update-bio", async (req, res) => {
  const { username, bio } = req.body;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  players[username].bio = bio.trim();
  await writeJSON("players.json", players);

  res.json({
    message: "Bio updated successfully",
    player: players[username],
  });
});

// ✅ 8. View player details (for leaderboard click)
router.get("/player/:username", async (req, res) => {
  const username = req.params.username;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  res.json(players[username]);
});

// ✅ 9. Leaderboard (sorted by Rapid rating)
router.get("/leaderboard", async (req, res) => {
  const players = await readJSON("players.json");

  const leaderboard = Object.values(players)
    .sort((a, b) => b.rapid - a.rapid)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      username: p.username,
      rapid: `${p.rapid}${p.recentGain ? `+${p.recentGain}` : ""}`,
      blitz: `${p.blitz}`,
      bullet: `${p.bullet}`,
    }));

  res.json(leaderboard);
});

module.exports = router;

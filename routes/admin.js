const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const { readJSON, writeJSON } = require("../utils/fileHandler");
const { createPairings } = require("../utils/pairingGenerator");
const { calculateAccuracy } = require("../utils/accuracyCalculator");
const { calculateRatingChange } = require("../utils/ratingCalculator");

// File paths
const dataDir = path.join(__dirname, "../data");
const logsFile = path.join(dataDir, "admin_logs.json");


// 🛡️ ADMIN LOGIN
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const validPasswords = [
    process.env.ADMIN_PASS_1,
    process.env.ADMIN_PASS_2,
    process.env.ADMIN_PASS_3,
  ];

  const matchIndex = validPasswords.indexOf(password);
  if (matchIndex === -1) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  // Log admin usage
  const logs = fs.existsSync(logsFile) ? await readJSON("admin_logs.json") : [];
  logs.push({
    adminId: `ADMIN_${matchIndex + 1}`,
    usedAt: new Date().toISOString(),
    ip: req.ip,
  });
  await writeJSON("admin_logs.json", logs);

  res.json({
    message: "✅ Login successful",
    adminId: `ADMIN_${matchIndex + 1}`,
  });
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
    points: 0,
    totalRounds: 0,
  };

  await writeJSON("players.json", players);
  res.json({
    message: "✅ Player added successfully",
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

  res.json({ message: `🗑️ ${username} deleted successfully` });
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
    message: `✅ ${username} added to category ${category}`,
    player: players[username],
  });
});


// ✅ 4. Create pairings (automatic)
router.post("/create-pairings", async (req, res) => {
  const { category } = req.body;

  try {
    const result = await createPairings(category);
    res.json({
      message: `✅ Pairings created for ${category}`,
      result,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ✅ 5. Update rating (auto-calculated)
router.post("/update-rating", async (req, res) => {
  const { playerA, playerB, scoreA, scoreB, mode } = req.body;
  const players = await readJSON("players.json");

  if (!players[playerA] || !players[playerB])
    return res.status(404).json({ message: "Player not found" });

  const validModes = ["rapid", "blitz", "bullet"];
  const selectedMode = validModes.includes(mode) ? mode : "rapid";

  const ratingA = players[playerA][selectedMode];
  const ratingB = players[playerB][selectedMode];

  const { changeA, changeB } = calculateRatingChange(ratingA, ratingB, scoreA, scoreB);

  // Apply rating updates
  players[playerA][selectedMode] += changeA;
  players[playerB][selectedMode] += changeB;

  // Track recent gain and stats
  players[playerA].recentGain = (players[playerA].recentGain || 0) + changeA;
  players[playerB].recentGain = (players[playerB].recentGain || 0) + changeB;

  players[playerA].points = (players[playerA].points || 0) + scoreA;
  players[playerB].points = (players[playerB].points || 0) + scoreB;

  players[playerA].totalRounds = (players[playerA].totalRounds || 0) + 1;
  players[playerB].totalRounds = (players[playerB].totalRounds || 0) + 1;

  await writeJSON("players.json", players);
  res.json({
    message: `✅ Ratings updated successfully for ${playerA} & ${playerB}`,
    updates: {
      [playerA]: players[playerA],
      [playerB]: players[playerB],
    },
  });
});


// ✅ 6. Reset weekly recent gains
router.post("/reset-weekly-gains", async (req, res) => {
  const players = await readJSON("players.json");

  Object.values(players).forEach((p) => {
    p.recentGain = 0;
  });

  await writeJSON("players.json", players);
  res.json({
    message: "🔄 Weekly recent gains reset successfully",
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
    message: "📝 Bio updated successfully",
    player: players[username],
  });
});


// ✅ 8. View player details (with accuracy)
router.get("/player/:username", async (req, res) => {
  const username = req.params.username;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  const p = players[username];
  const accuracy = calculateAccuracy(p.points || 0, p.totalRounds || 0, p.rapid);

  res.json({
    ...p,
    accuracy,
  });
});


// ✅ 9. Leaderboard (sorted by Rapid)
router.get("/leaderboard", async (req, res) => {
  const players = await readJSON("players.json");

  const leaderboard = Object.values(players)
    .sort((a, b) => b.rapid - a.rapid)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      username: p.username,
      rapid: `${p.rapid}${p.recentGain > 0 ? `+${p.recentGain}` : p.recentGain < 0 ? `${p.recentGain}` : ""}`,
      blitz: `${p.blitz}`,
      bullet: `${p.bullet}`,
      accuracy: calculateAccuracy(p.points || 0, p.totalRounds || 0, p.rapid),
    }));

  res.json(leaderboard);
});

// ✅ 10. Edit player details
router.post("/edit-player", async (req, res) => {
  const { username, updates } = req.body;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  Object.assign(players[username], updates);
  await writeJSON("players.json", players);

  res.json({
    message: "✏️ Player updated successfully",
    player: players[username],
  });
});

// ✅ Export router
module.exports = router;

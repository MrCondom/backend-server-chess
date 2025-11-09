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
//const playersPath = path.join(dataDir, "players.json");


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

  // 1. ✅ Add Player (object-based)
  router.post("/add-player", async (req, res) => {
  try {
    const { fullName, username, rapid, blitz, bullet, category, bio } = req.body;

    // ✂️ Trim and clean all string inputs
    const cleanFullName = fullName?.trim();
    const cleanUsername = username?.trim().toLowerCase(); // Key consistency
    const cleanCategory = category?.trim() || "Uncategorized";
    const cleanBio = bio?.trim() || "";

    const cleanRapid = Number(rapid);
    const cleanBlitz = Number(blitz);
    const cleanBullet = Number(bullet);

    // ✅ Validate required fields
    if (!cleanFullName || !cleanUsername || !cleanRapid || !cleanBlitz || !cleanBullet) {
      return res.status(400).json({
        success: false,
        message: "Full name, username, and all ratings are required.",
      });
    }

    // ✅ Load existing players
    const players = await readJSON("players.json");
    const playerData = typeof players === "object" && players !== null ? players : {};

    // ✅ Prevent duplicate username
    const exists = Object.keys(playerData).some(
      (key) => key.toLowerCase() === cleanUsername
    );
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Username already exists.",
      });
    }

    // ✅ Construct new player object
    const newPlayer = {
      id: Date.now(),
      fullName: cleanFullName,
      username: cleanUsername,
      category: cleanCategory,
      bio: cleanBio,
      ratings: {
        rapid: cleanRapid,
        blitz: cleanBlitz,
        bullet: cleanBullet,
      },
      createdAt: new Date().toISOString(),
      recentGain: 0,
      lastGainDate: null,
      points: 0,
      totalRounds: 0,
    };

    // ✅ Save new player
    playerData[cleanUsername] = newPlayer;
    await writeJSON("players.json", playerData);

    res.json({
      success: true,
      message: "Player added successfully.",
      player: newPlayer,
    });
  } catch (err) {
    console.error("Error adding player:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
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
  const username = req.body.username.trim().toLowerCase(); // ✂️ trim username
  const category = req.body.category.trim(); // ✂️ trim category
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
//Get Pairings
router.get("/pairings", async (req, res) => {
  try {
    const data = await readJSON("pairings.json");
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to read pairings", error: err.message });
  }
});

// ✅ DELETE pairings by category
router.delete("/pairings/:category", async (req, res) => {
  const category = req.params.category;
  try {
    const data = await readJSON("pairings.json");

    if (!data[category]) {
      return res.status(404).json({ message: `No pairings found for ${category}` });
    }

    delete data[category];
    await writeJSON("pairings.json", data);
    res.json({ message: `❌ Pairings deleted for ${category}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ✅ 5. Update rating (auto-calculated)
router.post("/record-result", async (req, res) => {
  try {
    const { white, black, result, ratings: mode, round } = req.body;

    // Helper to normalize names
    const normalize = (str) => str?.trim().toLowerCase();

    // Load data
    const players = await readJSON("players.json");
    const pairings = await readJSON("pairings.json");
    const results = await readJSON("results.json");

    // Trim and normalize
    const whiteName = normalize(white);
    const blackName = normalize(black);
    const category = Object.values(players).find(
      (p) => normalize(p.username) === whiteName || normalize(p.username) === blackName
    )?.category;

    if (!category || !pairings[category]) {
      return res.status(404).json({ message: "No valid category found for this match." });
    }

    // 🧩 1️⃣ Verify that the match exists in pairings.json
    const currentRound = pairings[category].rounds.find(
      (r) =>
        r.round == round &&
        r.pairings.some(
          (p) =>
            normalize(p.white) === whiteName && normalize(p.black) === blackName
        )
    );

    if (!currentRound) {
      return res.status(400).json({
        message: `❌ No such pairing found for Round ${round}.`,
      });
    }

    // 🧩 2️⃣ Prevent duplicate or reversed entry
    const duplicate = results.some(
      (r) =>
        normalize(r.playerA) === whiteName &&
        normalize(r.playerB) === blackName &&
        r.round == round
    );

    const reversed = results.some(
      (r) =>
        normalize(r.playerA) === blackName &&
        normalize(r.playerB) === whiteName &&
        r.round == round
    );

    if (duplicate || reversed) {
      return res.status(400).json({
        message: "❌ This match (or its reverse) has already been recorded.",
      });
    }

    // 🧩 3️⃣ Locate player objects safely
    const playerAKey = Object.keys(players).find(
      (k) => normalize(k) === whiteName
    );
    const playerBKey = Object.keys(players).find(
      (k) => normalize(k) === blackName
    );

    if (!playerAKey || !playerBKey)
      return res.status(404).json({ message: "One or both players not found." });

    const playerA = players[playerAKey];
    const playerB = players[playerBKey];

    // 🧩 4️⃣ Validate and parse result
    const [scoreA, scoreB] = result.split(":").map(Number);
    if (isNaN(scoreA) || isNaN(scoreB))
      return res
        .status(400)
        .json({ message: "Invalid score format (e.g., 1:0 or 0.5:0.5)" });

    // 🧩 5️⃣ Validate mode
    const validModes = ["rapid", "blitz", "bullet"];
    const selectedMode = validModes.includes(mode) ? mode : "rapid";

    // 🧩 6️⃣ Calculate rating changes
    const ratingA = playerA.ratings[selectedMode];
    const ratingB = playerB.ratings[selectedMode];
    const { changeA, changeB } = calculateRatingChange(ratingA, ratingB, scoreA, scoreB);

    // Apply rating updates
    playerA.ratings[selectedMode] += changeA;
    playerB.ratings[selectedMode] += changeB;

    // Update stats
    const now = new Date().toISOString();
    playerA.recentGain = (playerA.recentGain || 0) + changeA;
    playerB.recentGain = (playerB.recentGain || 0) + changeB;
    playerA.lastGainDate = playerB.lastGainDate = now;

    playerA.points = (playerA.points || 0) + scoreA;
    playerB.points = (playerB.points || 0) + scoreB;
    playerA.totalRounds = (playerA.totalRounds || 0) + 1;
    playerB.totalRounds = (playerB.totalRounds || 0) + 1;

    // 🧩 7️⃣ Record in results.json
    results.push({
      round,
      mode: selectedMode,
      playerA: playerA.username.trim(),
      playerB: playerB.username.trim(),
      scoreA,
      scoreB,
      changeA,
      changeB,
      date: now,
      category,
    });

    // Save files
    await writeJSON("players.json", players);
    await writeJSON("results.json", results);

    res.json({
      message: `✅ Round ${round} result recorded: ${playerA.username} vs ${playerB.username}`,
      changes: {
        [playerA.username]: { newRating: playerA.ratings[selectedMode], gained: changeA },
        [playerB.username]: { newRating: playerB.ratings[selectedMode], gained: changeB },
      },
    });
  } catch (error) {
    console.error("Error recording result:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/edit-result/:index", async (req, res) => {
  try {
    const { index } = req.params;
    const { white, black, result, ratings: mode, round } = req.body;

    const results = await readJSON("results.json");
    const players = await readJSON("players.json");

    const i = Number(index);
    if (isNaN(i) || i < 0 || i >= results.length) {
      return res.status(400).json({ message: "Invalid result index" });
    }

    const oldResult = results[i];
    const normalize = (s) => s?.trim().toLowerCase();

    // rollback old rating changes
    const playerAKey = Object.keys(players).find(k => normalize(k) === normalize(oldResult.playerA));
    const playerBKey = Object.keys(players).find(k => normalize(k) === normalize(oldResult.playerB));
    if (playerAKey && playerBKey) {
      const mode = oldResult.mode;
      players[playerAKey].ratings[mode] -= oldResult.changeA;
      players[playerBKey].ratings[mode] -= oldResult.changeB;
      players[playerAKey].points -= oldResult.scoreA;
      players[playerBKey].points -= oldResult.scoreB;
    }

    // compute new score and changes
    const [scoreA, scoreB] = result.split(":").map(Number);
    if (isNaN(scoreA) || isNaN(scoreB))
      return res.status(400).json({ message: "Invalid score format (use 1:0, 0:1, 0.5:0.5)" });

    const validModes = ["rapid", "blitz", "bullet"];
    const selectedMode = validModes.includes(mode) ? mode : "rapid";

    const playerA = players[playerAKey];
    const playerB = players[playerBKey];
    const { changeA, changeB } = calculateRatingChange(
      playerA.ratings[selectedMode],
      playerB.ratings[selectedMode],
      scoreA,
      scoreB
    );

    // apply new changes
    playerA.ratings[selectedMode] += changeA;
    playerB.ratings[selectedMode] += changeB;
    playerA.points += scoreA;
    playerB.points += scoreB;

    const now = new Date().toISOString();

    // update result entry
    results[i] = {
      ...oldResult,
      playerA: playerA.username,
      playerB: playerB.username,
      scoreA,
      scoreB,
      changeA,
      changeB,
      mode: selectedMode,
      round,
      date: now,
    };

    await writeJSON("players.json", players);
    await writeJSON("results.json", results);

    res.json({
      message: `✅ Result updated successfully for ${playerA.username} vs ${playerB.username}`,
      updated: results[i],
    });
  } catch (err) {
    console.error("Error editing result:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/results", async (req, res) => {
  const results = await readJSON("results.json");
  res.json(results);
});

router.delete("/delete-result", async (req, res) => {
  const { round, white, black } = req.body;
  const normalize = (s) => s.trim().toLowerCase();

  const results = await readJSON("results.json");
  const newResults = results.filter(
    (r) =>
      !(
        r.round == round &&
        normalize(r.playerA) === normalize(white) &&
        normalize(r.playerB) === normalize(black)
      )
  );

  await writeJSON("results.json", newResults);

  res.json({ message: `🗑️ Result for ${white} vs ${black} (Round ${round}) deleted.` });
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
// ✅ 6B. Apply and clear gains older than 7 days
router.post("/apply-rating-gains", async (req, res) => {
  const players = await readJSON("players.json");
  const now = new Date();

  let updatedCount = 0;

  Object.values(players).forEach((p) => {
    if (!p.lastGainDate || !p.recentGain) return;

    const lastGainDate = new Date(p.lastGainDate);
    const diffDays = (now - lastGainDate) / (1000 * 60 * 60 * 24);

    // Apply after 7 days
    if (diffDays >= 7 && p.recentGain !== 0) {
      // Add to rapid rating
      p.rapid += p.recentGain;
      p.recentGain = 0;
      p.lastGainDate = now.toISOString();
      updatedCount++;
    }
  });

  await writeJSON("players.json", players);

  res.json({
    message: `✅ ${updatedCount} player(s) had rating gains applied and cleared.`,
  });
});

// ✅ 7. Update player bio
router.post("/update-bio", async (req, res) => {
  const username = req.body.username.trim().toLowerCase(); // ✂️ trim username
  const bio = req.body.bio.trim(); // ✂️ trim bio
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json("Player Not found");

  players[username].bio = bio;
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

  // Find key case-insensitively and trim spaces
  const key = Object.keys(players).find(
    (k) => k.trim().toLowerCase() === username.trim().toLowerCase()
  );
  if (!key) return res.status(404).json({ message: "Player not found" });

  const player = players[key];

  // Only allow username, fullName, ratings
  const allowedFields = ["username", "fullName", "ratings"];
  const invalidFields = Object.keys(updates).filter(f => !allowedFields.includes(f));
  if (invalidFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid fields: ${invalidFields.join(", ")}. Only username, fullName, and ratings can be updated.`
    });
  }

  // Trim fullName and username if present
  if (updates.fullName) updates.fullName = updates.fullName.trim();
  if (updates.username) updates.username = updates.username.trim();

  // Merge ratings if present and trim numeric values
  if (updates.ratings) {
    player.ratings = {
      rapid: updates.ratings.rapid !== undefined ? Number(updates.ratings.rapid) : player.ratings.rapid,
      blitz: updates.ratings.blitz !== undefined ? Number(updates.ratings.blitz) : player.ratings.blitz,
      bullet: updates.ratings.bullet !== undefined ? Number(updates.ratings.bullet) : player.ratings.bullet,
    };
    delete updates.ratings;
  }

  // Merge remaining fields
  Object.assign(player, updates);

  // Handle username change → always lowercase key, trimmed
  const newKey = player.username.trim().toLowerCase();
  if (newKey !== key) {
    players[newKey] = player;
    delete players[key];
  } else {
    players[key] = player;
  }

  await writeJSON("players.json", players);

  res.json({
    success: true,
    message: "Player updated successfully",
    player,
  });
});


// ✅ 11. Manually edit player gain (for score corrections or testing)
router.post("/edit-gain", async (req, res) => {
  const username = req.body.username.trim().toLowerCase(); // ✂️ trim username
  const { recentGain } = req.body;
  const players = await readJSON("players.json");

  if (!players[username])
    return res.status(404).json({ message: "Player not found" });

  if (typeof recentGain !== "number")
    return res.status(400).json({ message: "recentGain must be a number" });

  players[username].recentGain = recentGain;
  players[username].lastGainDate = new Date().toISOString();

  await writeJSON("players.json", players);

  res.json({
    message: `✏️ Recent gain for ${username} updated to ${recentGain}`,
    player: players[username],
  });
});

// ✅ Export router
module.exports = router;

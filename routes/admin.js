const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
require("dotenv").config();

const { readJSON, writeJSON } = require("../utils/fileHandler");
const { createPairings } = require("../utils/pairingGenerator");
const { calculateAccuracy } = require("../utils/accuracyCalculator");
const { calculateRatingChange } = require("../utils/ratingCalculator");
const {getWinStreak, getLossStreak, getWinMultiplier, getLossMultiplier} = require ("../utils/streak");

// File paths
const dataDir = path.join(__dirname, "../data");
const logsFile = path.join(dataDir, "admin_logs.json");
const blockedIPsfile = path.join(dataDir,"blocked_ips.json");
const EXEMPT_IPS = ["192.168.1.117", "::1", "127.0.0.1"]; 
function normalizeIP(ip) {
  return ip.replace("::ffff:","");
}

// 🔒 Middleware: Block requests from blocked IPs
router.use(async (req, res, next) => {
  try {
    const rawIP = req.ip;
    const ip = normalizeIP(rawIP);

    const blockedIPs = await readJSON("blocked_ips.json");

    if (blockedIPs.includes(ip)) {
      return res.status(403).json({ message: "Your IP has been blocked."});
    }

    req.cleanedIP = ip;
    next();
  } catch (err) {
    console.error("IP check error:", err);
    next(); // Allow request if checking fails
  }
});
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
    return res.status(401).json({message:"Unauthorized Access"});
  }

  // Log admin usage
  const logs = fs.existsSync(logsFile) ? await readJSON("admin_logs.json") : [];
  logs.push({
    adminId: `ADMIN_${matchIndex + 1}`,
    usedAt: new Date().toISOString(),
    ip: req.cleanedIP,
  });
  await writeJSON("admin_logs.json", logs);

  res.json({
    message: "✅ Login successful",
    adminId: `ADMIN_${matchIndex + 1}`,
  });
});

// 🟢 GET all logs
router.get("/logs", async (req, res) => {
  try {
    const logs = await readJSON("admin_logs.json");
    const blockedIPs = await readJSON("blocked_ips.json");;

    res.json({ logs, blockedIPs });
  } catch (err) {
    console.error("fetch logs error:", err);
    res.status(500).json({ message: "Failed to fetch logs" });
  }
});

// 🔴 DELETE all logs except exempt IPs
router.delete("/logs", async (req, res) => {
  try {
      const logs = await readJSON("admin_logs.json");
      const filteredLogs = logs.filter((log) => EXEMPT_IPS.includes(log.ip));
      await writeJSON("admin_logs.json", filteredLogs);
    
    res.json({ message: "✅ Logs cleared (exempt IPs retained)" });
  } catch (err) {
    console.error("delete logs error:", err);
    res.status(500).json({ message: "Failed to clear logs" });
  }
});

// 🚫 BLOCK an IP
router.post("/block-ip", async (req, res) => {
  try {
    let { ip } = req.body;
    
    if (!ip) return res.status(400).json({ message: "IP address required" });
    ip = normalizeIP(ip);

    if (EXEMPT_IPS.includes(ip))
      return res.status(400).json({ message: "Cannot block an exempt IP" });

    let blockedIPs = await readJSON("blocked_ips.json") || [];
    if (!Array.isArray(blockedIPs)) blockedIPs=[];

    if (blockedIPs.includes(ip))
      return res.status(400).json({ message: "IP already blocked" });

    blockedIPs.push(ip);
    await writeJSON("blocked_ips.json", blockedIPs);

    res.json({ message: `🚫 IP ${ip} blocked successfully` });
  } catch (err) {
    console.error("block ip error:", err);
    res.status(500).json({ message: "Failed to block IP" });
  }
});

// ✅ UNBLOCK an IP
router.post("/unblock-ip", async (req, res) => {
  try {
    let { ip } = req.body;
    if (!ip) return res.status(400).json({ message: "IP address required" });
    ip = normalizeIP(ip);

    const blockedIPs = await readJSON("blocked_ips.json");

    const updated = blockedIPs.filter((bip) => bip !== ip);
    await writeJSON("blocked_ips.json", updated);

    res.json({ message: `✅ IP ${ip} unblocked successfully` });
  } catch (err) {
    console.error("unblock ip error:", err);
    res.status(500).json({ message: "Failed to unblock IP" });
  }
});

// 🧹 CLEAR ALL BLOCKED IPs
router.delete("/clear-blocked-ips", async (req, res) => {
  try {
    await writeJSON("blocked_ips.json", []);
    res.json({ message: "🧹 All blocked IPs cleared successfully" });
  } catch (err) {
    console.error("clear blocked ips error:", err);
    res.status(500).json({ message: "Failed to clear blocked IPs" });
  }
});


  // 1. ✅ Add Player (object-based)
  router.post("/add-player", async (req, res) => {
  try {
    const { fullName, username, rapid, blitz, bullet, category, bio } = req.body;

    // ✂️ Trim and clean all string inputs
    const cleanFullName = fullName?.trim();
    const cleanUsername = username?.trim().toLowerCase(); // Key consistency
    const cleanCategory = category && category.trim().length > 0 ? category.trim().toLowerCase() : "unavailable";
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
  const category = req.body.category.trim().toLowerCase(); // ✂️ trim category
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
  let { category, rounds, intervalHours = 2 } = req.body; // DO NOT default rounds to 5
  category = category.trim().toLowerCase();

  try {
    // Only pass rounds if user provided a number
    const roundsNum = typeof rounds === "number" ? rounds : undefined;

    // Call generator with optional rounds
    const result = await createPairings(category, roundsNum, intervalHours);

    // Save tracking info for countdown & current round
    const data = await readJSON("pairings.json");
    const catData = result[category];

    const nextRoundAt = catData.rounds.length
      ? catData.rounds[0].availableAt
      : new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();

    data[category] = {
      rounds: catData.rounds,
      currentRound: 1,
      intervalHours,
      nextRoundAt,
      countdown: intervalHours * 3600,
      completed: false,
    };

    await writeJSON("pairings.json", data);

    res.json({
      message: `✅ Pairings created for ${category}`,
      result: data[category],
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ✅ Get Pairings (auto-progressing rounds)
router.get("/pairings", async (req, res) => {
  try {
    const data = await readJSON("pairings.json");
    const now = Date.now();
    const result = {};

    for (const [category, info] of Object.entries(data)) {
      const { rounds, currentRound, intervalHours, nextRoundAt, completed } = info;

      let countdown = nextRoundAt
        ? Math.max(0, Math.floor((new Date(nextRoundAt).getTime() - now) / 1000))
        : 0;

      // ✅ Advance rounds automatically if countdown is zero
      if (countdown === 0 && !completed) {
        if (currentRound < rounds.length) {
          info.currentRound += 1;
          info.nextRoundAt = new Date(now + intervalHours * 3600 * 1000).toISOString();
          info.countdown = intervalHours * 3600;
        } else {
          info.completed = true;
          info.nextRoundAt = null;
          info.countdown = 0;
        }

        await writeJSON("pairings.json", data);
      }

      const visibleRounds = rounds.slice(0, info.currentRound);
      const activeRound = rounds[Math.min(info.currentRound - 1, rounds.length - 1)];

      result[category] = {
        rounds,
        visibleRounds,
        activeRound,
        nextRoundAt: info.nextRoundAt,
        countdown: info.countdown,
        completed: info.completed,
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to read pairings", error: err.message });
  }
});

// ✅ Delete Pairings
router.delete("/pairings/:category", async (req, res) => {
  const category = req.params.category.trim().toLowerCase();

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
// helper normalize
const normalize = (s) => (s ? s.trim().toLowerCase() : "");

/**
 * Helper: find player key by username (case-insensitive)
 */
function findPlayerKeyByName(players, name) {
  const n = normalize(name);
  return Object.keys(players).find((k) => normalize(players[k].username) === n || normalize(k) === n);
}

/**
 * Helper: check if a pairing exists (strict order white vs black) in a category and round
 */
function pairingExists(pairings, category, round, whiteName, blackName) {
  if (!pairings[category]) return false;
  const r = pairings[category].rounds.find((rr) => Number(rr.round) == Number(round));
  if (!r) return false;
  return r.pairings.some(
    (p) => normalize(p.white) === normalize(whiteName) && normalize(p.black) === normalize(blackName)
  );
}

router.post("/record-result", async (req, res) => {
  try {
    const { white, black, result, ratings: mode = "rapid", round } = req.body;

    if (!white || !black || !result || !round) {
      return res.status(400).json({ message: "white, black, result and round are required." });
    }

    const players = await readJSON("players.json");
    const pairings = await readJSON("pairings.json");
    const results = (await readJSON("results.json")) || [];

    // find category (try to locate player's category)
    const playerCat = Object.values(players).find(
      (p) => normalize(p.username) === normalize(white) || normalize(p.username) === normalize(black)
    )?.category;

    if (!playerCat || !pairings[playerCat]) {
      return res.status(404).json({ message: "No valid category found for this match." });
    }

    // verify pairing exists (white vs black in that round)
    if (!pairingExists(pairings, playerCat, round, white, black)) {
      return res.status(400).json({ message: `No such pairing found for Round ${round} in category ${playerCat}.` });
    }

    // prevent duplicate or reversed entry for same round
    const duplicate = results.some(
      (r) =>
        normalize(r.playerA) === normalize(white) &&
        normalize(r.playerB) === normalize(black) &&
        Number(r.round) === Number(round)
    );
    const reversed = results.some(
      (r) =>
        normalize(r.playerA) === normalize(black) &&
        normalize(r.playerB) === normalize(white) &&
        Number(r.round) === Number(round)
    );
    if (duplicate || reversed) {
      return res.status(400).json({ message: "This match (or its reverse) has already been recorded." });
    }

    // find player keys
    const playerAKey = findPlayerKeyByName(players, white);
    const playerBKey = findPlayerKeyByName(players, black);
    if (!playerAKey || !playerBKey) return res.status(404).json({ message: "One or both players not found." });

    const playerA = players[playerAKey];
    const playerB = players[playerBKey];

    // parse result
    const [scoreA_raw, scoreB_raw] = result.split(":").map((n) => n === "" ? NaN : Number(n));
    if (isNaN(scoreA_raw) || isNaN(scoreB_raw)) {
      return res.status(400).json({ message: "Invalid score format (e.g., 1:0 or 0.5:0.5)" });
    }
    const scoreA = scoreA_raw;
    const scoreB = scoreB_raw;

    // validate mode
    const validModes = ["rapid", "blitz", "bullet"];
    const selectedMode = validModes.includes(mode) ? mode : "rapid";

    // calculate rating change but DO NOT mutate real rating
    const ratingA = playerA.ratings?.[selectedMode] ?? 0;
    const ratingB = playerB.ratings?.[selectedMode] ?? 0;
  
// 🔹 compute streaks BEFORE this edited result is applied
let winStreakA = getWinStreak(results, playerA.username, selectedMode, playerCat);
let lossStreakA = getLossStreak(results, playerA.username, selectedMode, playerCat);

let winStreakB = getWinStreak(results, playerB.username, selectedMode, playerCat);
let lossStreakB = getLossStreak(results, playerB.username, selectedMode, playerCat);

// 🔹 Count this result IN ADVANCE
if (scoreA > scoreB) {
  winStreakA++;
} else if (scoreA < scoreB) {
  lossStreakA++;
}

if (scoreB > scoreA) {
  winStreakB++;
} else if (scoreB < scoreA) {
  lossStreakB++;
}


// 🔹 get multipliers
const winMultA = getWinMultiplier(winStreakA);
const lossMultA = getLossMultiplier(lossStreakA);

const winMultB = getWinMultiplier(winStreakB);
const lossMultB = getLossMultiplier(lossStreakB);

// 🔹 base rating change
let { changeA, changeB } = calculateRatingChange(ratingA, ratingB, scoreA, scoreB);

// 🔹 Apply only to gains (not losses)
if (changeA > 0) {
  changeA = Math.round(changeA * winMultA * lossMultA);
} else if (changeA < 0) {
  changeA = Math.round(changeA * lossMultA);
}

if (changeB > 0) {
  changeB = Math.round(changeB * winMultB * lossMultB);
} else if (changeB < 0) {
  changeB = Math.round(changeB * lossMultB);
}



    // apply to recentGain only
    playerA.recentGain = (playerA.recentGain || 0) + changeA;
    playerB.recentGain = (playerB.recentGain || 0) + changeB;

    // update points/rounds (these exist to build table)
    playerA.points = (playerA.points || 0) + scoreA;
    playerB.points = (playerB.points || 0) + scoreB;
    playerA.totalRounds = (playerA.totalRounds || 0) + 1;
    playerB.totalRounds = (playerB.totalRounds || 0) + 1;

    const now = new Date().toISOString();
    playerA.lastGainDate = playerB.lastGainDate = now;

    // push result record (store scoreA / scoreB and the change)
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
      category: playerCat,
    });

    // save players + results
    players[playerAKey] = playerA;
    players[playerBKey] = playerB;

    await writeJSON("players.json", players);
    await writeJSON("results.json", results);

    res.json({
      message: `✅ Round ${round} result recorded: ${playerA.username} vs ${playerB.username}`,
      result: results[results.length - 1],
    });
  } catch (error) {
    console.error("record-result error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/edit-result/:index", async (req, res) => {
  try {
    const idx = Number(req.params.index);
    const { white, black, result, ratings: mode = "rapid", round } = req.body;

    const players = await readJSON("players.json");
    const pairings = await readJSON("pairings.json");
    const results = (await readJSON("results.json")) || [];

    if (isNaN(idx) || idx < 0 || idx >= results.length) {
      return res.status(400).send("Invalid result index" );
    }

    const old = results[idx];
    const normalizeOldA = normalize(old.playerA);
    const normalizeOldB = normalize(old.playerB);

    // find keys for old players
    const oldAKey = findPlayerKeyByName(players, old.playerA);
    const oldBKey = findPlayerKeyByName(players, old.playerB);

    // rollback old recentGain/points/rounds (if players still exist)
    if (oldAKey && oldBKey) {
      players[oldAKey].recentGain = (players[oldAKey].recentGain || 0) - (old.changeA || 0);
      players[oldBKey].recentGain = (players[oldBKey].recentGain || 0) - (old.changeB || 0);
      players[oldAKey].points = (players[oldAKey].points || 0) - (old.scoreA || 0);
      players[oldBKey].points = (players[oldBKey].points || 0) - (old.scoreB || 0);
      players[oldAKey].totalRounds = Math.max(0, (players[oldAKey].totalRounds || 0) - 1);
      players[oldBKey].totalRounds = Math.max(0, (players[oldBKey].totalRounds || 0) - 1);
    }

    // now validate the new pairing exists in pairings.json (use category discovery)
    const playerCat = Object.values(players).find(
      (p) => normalize(p.username) === normalize(white) || normalize(p.username) === normalize(black)
    )?.category;

    if (!playerCat || !pairings[playerCat]) {
      return res.status(404).send("No valid category found for this new match." );
    }
    if (!pairingExists(pairings, playerCat, round, white, black)) {
      return res.status(400).send(`No such pairing found for Round ${round}.` );
    }

    // prevent duplicate (other than this index)
    const duplicate = results.some((r, i) => i !== idx &&
      normalize(r.playerA) === normalize(white) && normalize(r.playerB) === normalize(black) && Number(r.round) === Number(round)
    );
    const reversed = results.some((r, i) => i !== idx &&
      normalize(r.playerA) === normalize(black) && normalize(r.playerB) === normalize(white) && Number(r.round) === Number(round)
    );
    if (duplicate || reversed) return res.status(400).send("This match (or its reverse) is already recorded elsewhere.");

    // find new keys
    const playerAKey = findPlayerKeyByName(players, white);
    const playerBKey = findPlayerKeyByName(players, black);
    if (!playerAKey || !playerBKey) return res.status(404).send("One or both players not found for new result." );

    const playerA = players[playerAKey];
    const playerB = players[playerBKey];

    // parse new result
    const [scoreA, scoreB] = result.split(":").map(Number);
    if (isNaN(scoreA) || isNaN(scoreB)) return res.status(400).json({ message: "Invalid score format." });

    const validModes = ["rapid", "blitz", "bullet"];
    const selectedMode = validModes.includes(mode) ? mode : "rapid";

    // recalc based on current ratings (ratings unchanged by results in this design)
    const ratingA = playerA.ratings?.[selectedMode] ?? 0;
    const ratingB = playerB.ratings?.[selectedMode] ?? 0;
    const { changeA, changeB } = calculateRatingChange(ratingA, ratingB, scoreA, scoreB);

    // apply new recentGain/points/rounds
    playerA.recentGain = (playerA.recentGain || 0) + changeA;
    playerB.recentGain = (playerB.recentGain || 0) + changeB;
    playerA.points = (playerA.points || 0) + scoreA;
    playerB.points = (playerB.points || 0) + scoreB;
    playerA.totalRounds = (playerA.totalRounds || 0) + 1;
    playerB.totalRounds = (playerB.totalRounds || 0) + 1;

    const now = new Date().toISOString();
    playerA.lastGainDate = playerB.lastGainDate = now;

    // update results entry
    results[idx] = {
      ...results[idx],
      round,
      mode: selectedMode,
      playerA: playerA.username.trim(),
      playerB: playerB.username.trim(),
      scoreA,
      scoreB,
      changeA,
      changeB,
      date: now,
      category: playerCat,
    };

    // save
    players[playerAKey] = playerA;
    players[playerBKey] = playerB;

    await writeJSON("players.json", players);
    await writeJSON("results.json", results);

    res.json({ message: "Result updated.", updated: results[idx] });
  } catch (err) {
    console.error("edit-result error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * DELETE /admin/delete-result/:index
 * Rollback the result at index and remove it.
 */
router.delete("/delete-result/:index", async (req, res) => {
  try {
    const idx = Number(req.params.index);
    const results = (await readJSON("results.json")) || [];
    const players = await readJSON("players.json");

    if (isNaN(idx) || idx < 0 || idx >= results.length) {
      return res.status(400).json({ message: "Invalid result index" });
    }

    const old = results[idx];
    const aKey = findPlayerKeyByName(players, old.playerA);
    const bKey = findPlayerKeyByName(players, old.playerB);

    // rollback effects if players exist
    if (aKey && bKey) {
      players[aKey].recentGain = (players[aKey].recentGain || 0) - (old.changeA || 0);
      players[bKey].recentGain = (players[bKey].recentGain || 0) - (old.changeB || 0);

      players[aKey].points = Math.max(0, (players[aKey].points || 0) - (old.scoreA || 0));
      players[bKey].points = Math.max(0, (players[bKey].points || 0) - (old.scoreB || 0));

      players[aKey].totalRounds = Math.max(0, (players[aKey].totalRounds || 0) - 1);
      players[bKey].totalRounds = Math.max(0, (players[bKey].totalRounds || 0) - 1);
    }

    // remove result
    results.splice(idx, 1);

    await writeJSON("players.json", players);
    await writeJSON("results.json", results);

    res.json({ message: "Result deleted and changes rolled back." });
  } catch (err) {
    console.error("delete-result error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//Delete All Results
router.post("/delete-all-results", async (req, res) => {
  try {
    const category = req.body.category; // optional

    // Read current results
    const results = await readJSON("results.json");

    let newResults;
    if (category) {
      const cat = category.trim().toLowerCase();
      // Filter out only that category
      newResults = results.filter(
        (r) => r.category && r.category.toLowerCase() !== cat
      );
    } else {
      // No category: wipe all
      newResults = [];
    }

    // Save updated results
    await writeJSON("results.json", newResults);

    res.json({
      message: category
        ? `✅ Results for category "${category}" deleted successfully.`
        : "✅ All results deleted successfully.",
    });
  } catch (err) {
    console.error("delete-all-results error:", err);
    res.status(500).json({
      message: err.message || "Failed to delete results.",
    });
  }
});

/**
 * GET /admin/results
 */
router.get("/results", async (req, res) => {
  const results = (await readJSON("results.json")) || [];
  res.json(results);
});

/**
 * POST /admin/apply-rating-gains
 * Body: { category?: string, force?: boolean }
 * Applies recentGain to actual ratings if all pairings for category are recorded OR force=true
 */
router.post("/apply-rating-gains", async (req, res) => {
  try {
    const { category, force = false, mode = "rapid" } = req.body || {};
    const players = await readJSON("players.json");
    const pairings = await readJSON("pairings.json");
    const results = (await readJSON("results.json")) || [];

    // If category provided, limit to that category; else apply to all
    const categories = category ? [category] : Object.keys(pairings);

    // verify that for each category either force OR all pairings recorded
    for (const cat of categories) {
      if (!pairings[cat]) continue;
      if (force) continue;

      // Build set of expected matches (white:black:round)
      const expected = new Set();
      pairings[cat].rounds.forEach((r) => {
        r.pairings.forEach((p) => expected.add(`${normalize(p.white)}::${normalize(p.black)}::${r.round}`));
      });

      // Build set of recorded matches for this category
      const recorded = new Set();
      results.forEach((r) => {
        if (r.category === cat) {
          recorded.add(`${normalize(r.playerA)}::${normalize(r.playerB)}::${r.round}`);
        }
      });

      // If recorded doesn't cover expected -> cannot apply unless force
      for (const exp of expected) {
        if (!recorded.has(exp)) {
          return res.status(400).json({
            message: `Not all pairings recorded for category ${cat}. Use { force: true } to override.`,
          });
        }
      }
    }

    // Apply gains per player (in all ratings? we'll apply to rapid by default — you can adjust)
    let applied = 0;
    const now = new Date().toISOString();

    Object.keys(players).forEach((k) => {
      const p = players[k];
      if (!p || !p.recentGain) return;
      // here we apply to rapid — if you want mode-specific, store a pending per-mode instead
      p.ratings = p.ratings || {};
      p.ratings[mode] = (p.ratings[mode] || 0) + p.recentGain;
      p.recentGain = 0;
      p.lastGainDate = now;
      applied++;
    });

    await writeJSON("players.json", players);
    res.json({ message: `✅ Applied gains for ${applied} players in ${mode} mode` });
  } catch (err) {
    console.error("apply-rating-gains error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /admin/clear-points-rounds
 * Body: { category?: string }
 * Clears points & totalRounds for players in given category (or all if not provided).
 */
router.post("/clear-points-rounds", async (req, res) => {
  try {
    const { category } = req.body || {};
    const players = await readJSON("players.json");
    Object.keys(players).forEach((k) => {
      const p = players[k];
      if (!category || (p.category && normalize(p.category) === normalize(category))) {
        p.points = 0;
        p.totalRounds = 0;
      }
    });
    await writeJSON("players.json", players);
    res.json({ message: `✅ Points and rounds cleared${category ? ` for ${category}` : ""}.` });
  } catch (err) {
    console.error("clear-points-rounds error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
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
router.get("/players/all", async (req, res) => {
  const players = await readJSON("players.json");

  // Group by category
  const grouped = {};

  Object.values(players).forEach((p) => {
    const category = (p.category || "Unavailable").toLowerCase();
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(p);
  });

  // Sort players inside each category
  Object.keys(grouped).forEach((cat) => {
    grouped[cat].sort((a, b) => {
      // ✅ Compare Rapid
      if ((b.ratings?.rapid || 0) !== (a.ratings?.rapid || 0))
        return (b.ratings?.rapid || 0) - (a.ratings?.rapid || 0);
      // ✅ Compare Blitz
      if ((b.ratings?.blitz || 0) !== (a.ratings?.blitz || 0))
        return (b.ratings?.blitz || 0) - (a.ratings?.blitz || 0);
      // ✅ Compare Bullet
      if ((b.ratings?.bullet || 0) !== (a.ratings?.bullet || 0))
        return (b.ratings?.bullet || 0) - (a.ratings?.bullet || 0);
      // ✅ Alphabetical Name
      return (a.name || "").localeCompare(b.name || "");
    });
  });

  const orderedGrouped = {};

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a.toLowerCase() === "unavailable") return 1;
    if (b.toLowerCase() === "unavailable") return -1;

    return a.localeCompare(b);
  });
  sortedCategories.forEach((cat) => {
    orderedGrouped[cat] = grouped[cat];
  });
  res.json(orderedGrouped);
});



// ✅ 9. Leaderboard Table
router.post("/generateTable", async (req, res) => {
  const { category, mode, month, year } = req.body;
  if (!category || !mode) {
    return res.status(400).json({ error: "Category and mode are required" });
  }

  const players = await readJSON("players.json");

  // Filter players by category
  const filteredPlayers = Object.values(players).filter(
    (p) => p.category.toLowerCase() === category.toLowerCase()
  );

  if (filteredPlayers.length === 0) {
    return res.status(404).json({ error: `No players found in ${category}` });
  }

  // Generate leaderboard table
  const table = filteredPlayers.map((p) => {
    const totalPoints = p.points || 0;
    const totalRounds = p.totalRounds || 0;
    const accuracyValue = calculateAccuracy(totalPoints, totalRounds, p.ratings[mode] || 0);
    const numericAccuracy = parseFloat(accuracyValue.replace("%", ""));

    return {
      username: p.username,
      totalRounds,
      totalPoints,
      accuracy: accuracyValue,
      numericAccuracy, // for sorting
    };
  });

  // ✅ Sort by totalPoints DESC, then accuracy DESC
  table.sort((a, b) => {
    if (b.totalPoints === a.totalPoints) {
      return b.numericAccuracy - a.numericAccuracy;
    }
    return b.totalPoints - a.totalPoints;
  });

  // Save clean table
  await writeJSON("table.json", {
    category,
    mode,
    generatedAt: new Date(),
    month: month || null,
    year: year || null,
    table: table.map(({ numericAccuracy, ...rest }) => rest),
  });

  res.json({ message: "Table generated successfully", table });
});

router.get("/table", async (req, res) => {
  try {
    const data = await readJSON("table.json");
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: "No table found. Generate one first." });
  }
});

router.delete("/deleteTable", async (req, res) => {
  try {
    const fs = require("fs");
    const filePath = path.join(__dirname, "../data/table.json");

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ message: "Table deleted successfully" });
    } else {
      return res.status(404).json({ error: "No table file found" });
    }
  } catch (err) {
    console.error("deleteTable error:", err);
    res.status(500).json({ error: "Failed to delete table" });
  }
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

//11.Get  Announcement
router.get("/announcement", async (req, res) =>{
 const news = await readJSON("news.json");

 res.json({
  message: news.message || "",
 });
});

//Update announcement
router.post("/update-announcement", async (req, res) => {
  const message =(req.body.message || "").trim();

  const news = {
    message: message,
  };

  await writeJSON("news.json", news);

  res.json({
    message: "Announcement Updated Successfully",
    data: news,
  });
});


// ✅ Export router
module.exports = router;

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const {readJSON, writeJSON} = require("./utils/fileHandler");
const {createPairings} =require("./utils/pairingGenerator");
const adminRoutes = require("./routes/admin");


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;



app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// ✅ Route 1: Root test
app.get("/", (req, res) => {
  res.send("Chess Rating Backend is running 🏁");
});

// ✅ Route 2: Leaderboard
app.get("/leaderboard", async (req, res) => {
  const players = await readJSON("players.json");
  const sorted = Object.values(players).sort((a, b) => b.rapid - a.rapid);
  res.json(sorted);
});

// ✅ Enhanced Public Leaderboard (User-Facing)
app.get("/leaderboard/public", async (req, res) => {
  const players = await readJSON("players.json");

  // Divide into categories
  const categories = {};

Object.values(players).forEach((p) => {
  if (!p.category) return;

  if (!categories[p.category]) {
    categories[p.category] = [];
  }

  // same logic for visible rating gain
  const now = new Date();
  const lastGainDate = new Date(p.lastGainDate || 0);
  const diffDays = (now - lastGainDate) / (1000 * 60 * 60 * 24);
  let displayGain = "";

  if (p.recentGain && diffDays < 7) {
    displayGain = `+${p.recentGain}`;
  } else if (p.recentGain && diffDays >= 7) {
    p.recentGain = 0;
    writeJSON("players.json", players);
  }

  categories[p.category].push({
    name: p.name,
    username: p.username,
    rapid: `${p.rapid}${displayGain}`,
    blitz: p.blitz || "-",
    bullet: p.bullet || "-"
  });
});

// Sort within categories
Object.keys(categories).forEach(cat => {
  categories[cat].sort((a, b) => parseFloat(b.rapid) - parseFloat(a.rapid));
});

res.json(categories);
});

// ✅ Route 3: Add player (admin)
app.post("/players/add", async (req, res) => {
  const newPlayer = req.body;
  const players = await readJSON("players.json");

  if (players[newPlayer.username]) {
    return res.status(400).json({ message: "Username already exists" });
  }

  players[newPlayer.username] = newPlayer;
  await writeJSON("players.json", players);
  res.json({ message: "Player added successfully", newPlayer });
});

// ✅ Create new pairings (Admin only)
app.post("/pairings/create", async (req, res) => {
  try {
    const { category, rounds = 5, intervalHours = 24 } = req.body;
    const result = await createPairings(category, rounds, intervalHours);
    res.json({ message: "Pairings created successfully", result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ✅ Get current pairings (visible round)
app.get("/pairings/current/:category", async (req, res) => {
  const { category } = req.params;
  const data = await readJSON("pairings.json");
  const now = new Date();

  if (!data[category]) {
    return res.status(404).json({ message: "No pairings yet for this category." });
  }

  const visibleRounds = data[category].rounds.filter(
    (r) => new Date(r.availableAt) <= now
  );

  res.json({
    countdown: data[category].countdown,
    visibleRounds,
  });
});

// ✅ Get Player Info by Username (clickable profile)
app.get("/player/:username", async (req, res) => {
  const { username } = req.params;
  const players = await readJSON("players.json");

  const player = players[username];
  if (!player) return res.status(404).json({ message: "Player not found" });

  res.json({
    name: player.name,
    username: player.username,
    category: player.category,
    rapid: player.rapid,
    blitz: player.blitz,
    bullet: player.bullet,
    recentGain: player.recentGain || 0,
    bio: player.bio || "This player’s profile will be updated soon.",
  });
});


app.use("/admin", adminRoutes)


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));



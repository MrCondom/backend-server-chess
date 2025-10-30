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

// ✅ Route 3: Add player (admin)
app.post("/players/add", async (req, res) => {
  const newPlayer = req.body;
  const players = await readJSON("players.json");

  if (players.find(p => p.username === newPlayer.username)) {
    return res.status(400).json({ message: "Username already exists" });
  }

  players.push(newPlayer);
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


app.use("/admin", adminRoutes)



app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


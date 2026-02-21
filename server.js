const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const {readJSON, writeJSON} = require("./utils/fileHandler");
const {createPairings} =require("./utils/pairingGenerator");
const adminRoutes = require("./routes/admin");
const pairingsRoutes = require("./routes/pairings")


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

// 2. ✅ Enhanced Public Leaderboard (User-Facing)
app.get("/players/all", async (req, res) => {
  const players = await readJSON("players.json");

  const grouped = {};
  const now = new Date();

  Object.values(players).forEach((p) => {
    const category = (p.category || "Unavailable").toLowerCase();
    if (!grouped[category]) grouped[category] = [];

    // ✅ Determine gain visibility and status
    let gainStatus = "none";
    let gainValue = 0;

    if (p.recentGain !== undefined && p.lastGainDate) {
      const lastGainDate = new Date(p.lastGainDate);
      const diffDays = (now - lastGainDate) / (1000 * 60 * 60 * 24);

      if (diffDays <= 3) {
        gainValue = p.recentGain;
        if (p.recentGain > 0) gainStatus = "up";
        else if (p.recentGain < 0) gainStatus = "down";
      }
    }

    grouped[category].push({
      ...p,
      gainStatus,
      gainValue,
    });
  });

  // ✅ Sort inside each category
  Object.keys(grouped).forEach((cat) => {
    grouped[cat].sort((a, b) => {
      if ((b.ratings?.rapid || 0) !== (a.ratings?.rapid || 0))
        return (b.ratings?.rapid || 0) - (a.ratings?.rapid || 0);
      if ((b.ratings?.blitz || 0) !== (a.ratings?.blitz || 0))
        return (b.ratings?.blitz || 0) - (a.ratings?.blitz || 0);
      if ((b.ratings?.bullet || 0) !== (a.ratings?.bullet || 0))
        return (b.ratings?.bullet || 0) - (a.ratings?.bullet || 0);
      return (a.fullName || "").localeCompare(b.fullName || "");
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

app.use("/admin", adminRoutes);
app.use("/pairings", pairingsRoutes);


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));



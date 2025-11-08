const express = require("express");
const router = express.Router();
const { readJSON } = require("../utils/fileHandler");

// 🔹 Utility function to compute visible rounds based on release schedule
function getVisibleRounds(allRounds) {
  if (!Array.isArray(allRounds) || !allRounds.length)
    return { visibleRounds: [], nextRoundAt: null };

  const now = Date.now();
  const visibleRounds = [];
  let nextRoundAt = null;

  allRounds.forEach((round, i) => {
    const available = new Date(round.availableAt).getTime();
    if (available <= now ) {
      visibleRounds.push(round);
    } else if (visibleRounds.length === 0) {
        visibleRounds.push(round);
        nextRoundAt = round.availableAt;
    } else if (!nextRoundAt) {
      nextRoundAt = round.availableAt; // first future round
    }
  });

  return { visibleRounds, nextRoundAt };
}

// 🔹 Public endpoint: Get pairings by category (single)
router.get("/current/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const allData = await readJSON("pairings.json");
    const categoryData = allData[category]?.rounds || [];

    const { visibleRounds, nextRoundAt } = getVisibleRounds(categoryData);

    res.json({
      visibleRounds,
      nextRoundAt,
    });
  } catch (err) {
    console.error("Error fetching pairings:", err);
    res.status(500).json({ error: "Failed to load pairings" });
  }
});

// 🔹 Public endpoint: Get all pairings for all divisions
router.get("/current", async (req, res) => {
  try {
    const allData = await readJSON("pairings.json");
    const result = {};

    Object.entries(allData).forEach(([category, catData]) => {
      const rounds = catData.rounds || [];
      const { visibleRounds, nextRoundAt } = getVisibleRounds(rounds);
      result[category] = {
        visibleRounds,
        nextRoundAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching all pairings:", err);
    res.status(500).json({ error: "Failed to load pairings" });
  }
});

module.exports = router;

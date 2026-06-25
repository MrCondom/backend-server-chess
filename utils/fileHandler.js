const fs = require("fs-extra");
const path = require("path");
const DATA_DIR = path.join(__dirname, "../data");

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function readJSON(file) {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) {
      // return sensible default depending on filename
      if (file.endsWith(".json")) {
        // heuristics: results -> [], pairings -> {}, players -> {}
        if (file.includes("results")) return [];
        if (file.includes("pairings")) return {};
        if (file.includes("admin_logs")) return [];
        return {};
      }
      return {};
    }
    return await fs.readJSON(full);
  } catch (err) {
    console.error("readJSON error:", full, err);
    // fallback safe defaults
    if (file.includes("results")) return [];
    if (file.includes("pairings")) return {};
    if (file.includes("admin_logs")) return [];
    return {};
  }
}

async function writeJSON(file, data) {
  const full = path.join(DATA_DIR, file);
  try {
    await fs.ensureDir(path.dirname(full));
    await fs.writeJSON(full, data, { spaces: 2 });
  } catch (err) {
    console.error("writeJSON error:", full, err);
    throw err;
  }
}

module.exports = { readJSON, writeJSON };


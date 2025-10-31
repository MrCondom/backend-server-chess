import fs from "fs-extra";
const DATA_DIR = "./data";

export async function readJSON(file) {
  try {
    return await fs.readJSON(`${DATA_DIR}/${file}`);
  } catch {
    return {};
  }
}

export async function writeJSON(file, data) {
  try {
    await fs.writeJSON(`${DATA_DIR}/${file}`, data, { spaces: 2 });
  } catch (err) {
    console.error("Error writing file:", file, err);
  }
}

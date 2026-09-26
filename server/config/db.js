const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fuzzy_crop_yield";
  try {
    await mongoose.connect(uri);
    console.log(`[db] connected: ${uri}`);
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    console.error("[db] is MongoDB running? Start it locally, or set MONGODB_URI to an Atlas connection string in .env");
    process.exit(1);
  }
}

module.exports = connectDB;

const express = require("express");

// getStatus (optional) returns the Discord connection state for GET /status.
function startKeepAlive(getStatus) {
  const app = express();
  app.get("/", (req, res) => res.send("Cosa is alive 🤵"));
  app.get("/status", (req, res) => {
    try { res.json(typeof getStatus === "function" ? getStatus() : { ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));
}

module.exports = { startKeepAlive };

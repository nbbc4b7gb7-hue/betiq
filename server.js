const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve React build
app.use(express.static(path.join(__dirname, "dist")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proxy: Odds API
app.get("/api/odds", async (req, res) => {
  try {
    const { default: fetch } = await import("node-fetch");
    const apiKey = process.env.ODDS_API_KEY;
    const { sport = "basketball_nba", regions = "us", markets = "h2h,spreads,totals", oddsFormat = "american", commenceTimeFrom, commenceTimeTo } = req.query;

    let url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
    if (commenceTimeFrom) url += `&commenceTimeFrom=${commenceTimeFrom}`;
    if (commenceTimeTo) url += `&commenceTimeTo=${commenceTimeTo}`;

    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Odds API error:", err);
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

// Proxy: Claude API
app.post("/api/analyze", async (req, res) => {
  try {
    const { default: fetch } = await import("node-fetch");
    const apiKey = process.env.CLAUDE_API_KEY;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Claude API error:", err);
    res.status(500).json({ error: "Failed to analyze pick" });
  }
});

// Catch-all: serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`BetIQ server running on port ${PORT}`);
});

import { useState, useEffect, useCallback } from "react";

const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const TABS = ["Dashboard", "Pick Analyzer", "Bet Tracker", "P&L Calendar", "Best Bets"];

const formatOdds = (decimal) => {
  if (!decimal) return "N/A";
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return `${Math.round(-100 / (decimal - 1))}`;
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const GRADE_COLORS = {
  "A+": "#00ff87", A: "#00e676", B: "#69f0ae", C: "#ffeb3b", D: "#ff9800", F: "#f44336",
};

export default function BetIQ() {
  const [tab, setTab] = useState("Dashboard");
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [pickInput, setPickInput] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [bets, setBets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("betiq_bets") || "[]"); } catch { return []; }
  });
  const [betForm, setBetForm] = useState({ game: "", pick: "", odds: "", amount: "", notes: "" });
  const [bestBets, setBestBets] = useState([]);
  const [loadingBestBets, setLoadingBestBets] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [notification, setNotification] = useState(null);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Save bets to localStorage
  useEffect(() => {
    localStorage.setItem("betiq_bets", JSON.stringify(bets));
  }, [bets]);

  // Fetch NBA games
const fetchGames = useCallback(async () => {
  setLoadingGames(true);
  try {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setGames(data);
      else setGames([]);
    } catch (e) {
      setGames([]);
    }
    setLoadingGames(false);
  }, []);

  useEffect(() => {
    if (tab === "Dashboard" || tab === "Pick Analyzer") fetchGames();
  }, [tab]);

  // Analyze pick with Claude
  const analyzePick = async () => {
    if (!pickInput.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const gamesContext = games.slice(0, 8).map(g => {
        const bk = g.bookmakers?.[0];
        const h2h = bk?.markets?.find(m => m.key === "h2h");
        const spread = bk?.markets?.find(m => m.key === "spreads");
        const total = bk?.markets?.find(m => m.key === "totals");
        return `${g.away_team} @ ${g.home_team} — ${formatDate(g.commence_time)} | ML: ${h2h?.outcomes?.map(o => `${o.name} ${o.price > 0 ? "+" : ""}${o.price}`).join(" / ") || "N/A"} | Spread: ${spread?.outcomes?.map(o => `${o.name} ${o.point > 0 ? "+" : ""}${o.point} (${o.price > 0 ? "+" : ""}${o.price})`).join(" / ") || "N/A"} | Total: ${total?.outcomes?.map(o => `${o.name} ${o.point} (${o.price > 0 ? "+" : ""}${o.price})`).join(" / ") || "N/A"}`;
      }).join("\n");

      const prompt = `You are an elite sports betting analyst with 15+ years of experience. You specialize in NBA betting, line movement, sharp money, and value identification.

Current NBA odds data:
${gamesContext}

User's pick: "${pickInput}"

Analyze this pick thoroughly. Return a JSON object only, no markdown, no extra text:
{
  "grade": "A+|A|B|C|D|F",
  "confidence": 0-100,
  "verdict": "SHARP PLAY|SOLID VALUE|FAIR PLAY|LEAN FADE|FADE IT",
  "summary": "2-3 sentence sharp analysis",
  "pros": ["pro1", "pro2", "pro3"],
  "cons": ["con1", "con2"],
  "sharp_money": "where sharp money is leaning",
  "line_movement": "any notable line movement context",
  "suggested_bet_size": "1-5 units recommendation with reasoning",
  "improved_pick": "if there's a better version of this bet or a related value play, describe it here",
  "key_factors": ["factor1", "factor2", "factor3"]
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": CLAUDE_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAnalysisResult(parsed);
    } catch (e) {
      setAnalysisResult({ grade: "?", verdict: "Error", summary: "Could not analyze. Check your API key or try again.", pros: [], cons: [], confidence: 0 });
    }
    setAnalyzing(false);
  };

  // Generate best bets
  const generateBestBets = async () => {
    setLoadingBestBets(true);
    setBestBets([]);
    try {
      const gamesContext = games.slice(0, 10).map(g => {
        const bk = g.bookmakers?.[0];
        const h2h = bk?.markets?.find(m => m.key === "h2h");
        const spread = bk?.markets?.find(m => m.key === "spreads");
        const total = bk?.markets?.find(m => m.key === "totals");
        return `${g.away_team} @ ${g.home_team} | ${formatDate(g.commence_time)} | ML: ${h2h?.outcomes?.map(o => `${o.name} ${o.price > 0 ? "+" : ""}${o.price}`).join(" / ") || "N/A"} | Spread: ${spread?.outcomes?.map(o => `${o.name} ${o.point > 0 ? "+" : ""}${o.point} (${o.price > 0 ? "+" : ""}${o.price})`).join(" / ") || "N/A"} | Total: ${total?.outcomes?.map(o => `${o.name} ${o.point} (${o.price > 0 ? "+" : ""}${o.price})`).join(" / ") || "N/A"}`;
      }).join("\n");

      const prompt = `You are an elite NBA sharp bettor. Analyze these games and find the 3 best value bets today.

Games:
${gamesContext}

Return JSON only, no markdown:
{
  "picks": [
    {
      "game": "Away @ Home",
      "bet": "exact bet (e.g. Lakers -4.5)",
      "odds": "+110 or -115 etc",
      "grade": "A+|A|B",
      "confidence": 0-100,
      "reasoning": "2-3 sentences why this is sharp",
      "units": "1-3"
    }
  ]
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": CLAUDE_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setBestBets(parsed.picks || []);
    } catch (e) {
      setBestBets([]);
    }
    setLoadingBestBets(false);
  };

  useEffect(() => {
    if (tab === "Best Bets" && games.length > 0) generateBestBets();
  }, [tab, games.length]);

  // Bet tracker helpers
  const addBet = () => {
    if (!betForm.pick || !betForm.odds || !betForm.amount) { notify("Fill in pick, odds, and amount", "error"); return; }
    const newBet = { ...betForm, id: Date.now(), date: todayKey(), result: "pending", profit: 0 };
    setBets(prev => [newBet, ...prev]);
    setBetForm({ game: "", pick: "", odds: "", amount: "", notes: "" });
    notify("Bet added!");
  };

  const settleBet = (id, result) => {
    setBets(prev => prev.map(b => {
      if (b.id !== id) return b;
      const odds = parseFloat(b.odds);
      let profit = 0;
      if (result === "win") {
        profit = odds > 0 ? (parseFloat(b.amount) * odds / 100) : (parseFloat(b.amount) * 100 / Math.abs(odds));
      } else if (result === "loss") {
        profit = -parseFloat(b.amount);
      } else if (result === "push") {
        profit = 0;
      }
      return { ...b, result, profit: parseFloat(profit.toFixed(2)) };
    }));
    notify(`Bet marked as ${result}`);
  };

  const deleteBet = (id) => {
    setBets(prev => prev.filter(b => b.id !== id));
    notify("Bet deleted");
  };

  // P&L calendar data
  const getPnLByDate = () => {
    const map = {};
    bets.filter(b => b.result !== "pending").forEach(b => {
      map[b.date] = (map[b.date] || 0) + b.profit;
    });
    return map;
  };

  const renderCalendar = () => {
    const pnl = getPnLByDate();
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const val = pnl[key];
      const isToday = key === todayKey();
      cells.push(
        <div key={key} style={{
          background: val !== undefined ? (val >= 0 ? "rgba(0,255,135,0.15)" : "rgba(244,67,54,0.15)") : "rgba(255,255,255,0.03)",
          border: isToday ? "1px solid #00ff87" : "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8, padding: "6px 8px", minHeight: 56, position: "relative"
        }}>
          <div style={{ fontSize: 11, color: isToday ? "#00ff87" : "#666", fontWeight: isToday ? 700 : 400 }}>{d}</div>
          {val !== undefined && (
            <div style={{ fontSize: 12, fontWeight: 700, color: val >= 0 ? "#00ff87" : "#f44336", marginTop: 4 }}>
              {val >= 0 ? "+" : ""}${val.toFixed(0)}
            </div>
          )}
        </div>
      );
    }
    return cells;
  };

  // Stats
  const settled = bets.filter(b => b.result !== "pending");
  const wins = settled.filter(b => b.result === "win").length;
  const totalPnL = settled.reduce((s, b) => s + b.profit, 0);
  const winRate = settled.length ? ((wins / settled.length) * 100).toFixed(1) : 0;
  const roi = settled.length ? ((totalPnL / settled.reduce((s, b) => s + parseFloat(b.amount || 0), 0)) * 100).toFixed(1) : 0;

  const styles = {
    app: { minHeight: "100vh", background: "#0a0a0f", color: "#e8e8e8", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", position: "relative", overflow: "hidden" },
    bg: { position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 50%, rgba(0,255,135,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.04) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 },
    container: { maxWidth: 900, margin: "0 auto", padding: "0 16px", position: "relative", zIndex: 1 },
    header: { padding: "20px 0 0", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    logo: { fontSize: 26, fontWeight: 800, letterSpacing: -1, color: "#fff" },
    logoAccent: { color: "#00ff87" },
    tagline: { fontSize: 12, color: "#555", marginTop: 2, letterSpacing: 1, textTransform: "uppercase" },
    nav: { display: "flex", gap: 4, marginTop: 16, overflowX: "auto", paddingBottom: 0 },
    navBtn: (active) => ({
      padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
      color: active ? "#00ff87" : "#555", fontWeight: active ? 700 : 500, fontSize: 13,
      borderBottom: active ? "2px solid #00ff87" : "2px solid transparent",
      transition: "all 0.2s", whiteSpace: "nowrap", fontFamily: "inherit"
    }),
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, marginBottom: 16 },
    statCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16, flex: 1, minWidth: 120 },
    label: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    bigNum: (color) => ({ fontSize: 28, fontWeight: 800, color: color || "#fff", letterSpacing: -1 }),
    input: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#e8e8e8", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    textarea: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#e8e8e8", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 80 },
    btn: (color) => ({ background: color || "#00ff87", color: color ? "#fff" : "#000", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.2s" }),
    btnSm: (color) => ({ background: color || "rgba(255,255,255,0.08)", color: "#e8e8e8", border: "none", borderRadius: 6, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }),
    badge: (color) => ({ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }),
    gameCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14, marginBottom: 10 },
    section: { padding: "20px 0" },
    sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#fff" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid4: { display: "flex", gap: 12, flexWrap: "wrap" },
    row: { display: "flex", alignItems: "center", gap: 10 },
    calendarGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },
    notification: (type) => ({
      position: "fixed", top: 20, right: 20, background: type === "error" ? "#f44336" : "#00ff87",
      color: type === "error" ? "#fff" : "#000", padding: "12px 20px", borderRadius: 10,
      fontWeight: 700, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
    })
  };

  return (
    <div style={styles.app}>
      <div style={styles.bg} />
      {notification && <div style={styles.notification(notification.type)}>{notification.msg}</div>}

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={styles.logo}>Bet<span style={styles.logoAccent}>IQ</span></div>
              <div style={styles.tagline}>AI-Powered NBA Betting Intelligence</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#555" }}>BANKROLL P&L</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: totalPnL >= 0 ? "#00ff87" : "#f44336" }}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
          <nav style={styles.nav}>
            {TABS.map(t => <button key={t} style={styles.navBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>)}
          </nav>
        </div>

        {/* Dashboard */}
        {tab === "Dashboard" && (
          <div style={styles.section}>
            <div style={styles.grid4}>
              {[
                { label: "Total Bets", val: bets.length, color: "#fff" },
                { label: "Win Rate", val: `${winRate}%`, color: parseFloat(winRate) >= 55 ? "#00ff87" : parseFloat(winRate) >= 45 ? "#ffeb3b" : "#f44336" },
                { label: "Record", val: `${wins}-${settled.length - wins}`, color: "#fff" },
                { label: "ROI", val: `${roi}%`, color: parseFloat(roi) >= 0 ? "#00ff87" : "#f44336" },
              ].map(s => (
                <div key={s.label} style={styles.statCard}>
                  <div style={styles.label}>{s.label}</div>
                  <div style={styles.bigNum(s.color)}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={styles.sectionTitle}>Today's NBA Games</div>
                <button style={styles.btnSm()} onClick={fetchGames}>↻ Refresh</button>
              </div>
              {loadingGames ? (
                <div style={{ color: "#555", textAlign: "center", padding: 30 }}>Loading odds...</div>
              ) : games.length === 0 ? (
                <div style={{ color: "#555", textAlign: "center", padding: 30 }}>No upcoming games found</div>
              ) : games.slice(0, 6).map(g => {
                const bk = g.bookmakers?.[0];
                const h2h = bk?.markets?.find(m => m.key === "h2h");
                const spread = bk?.markets?.find(m => m.key === "spreads");
                const total = bk?.markets?.find(m => m.key === "totals");
                return (
                  <div key={g.id} style={styles.gameCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{g.away_team} <span style={{ color: "#555" }}>@</span> {g.home_team}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{formatDate(g.commence_time)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {h2h && <div><div style={styles.label}>Moneyline</div><div style={{ fontSize: 12 }}>{h2h.outcomes?.map(o => `${o.name.split(" ").pop()} ${o.price > 0 ? "+" : ""}${o.price}`).join(" / ")}</div></div>}
                      {spread && <div><div style={styles.label}>Spread</div><div style={{ fontSize: 12 }}>{spread.outcomes?.map(o => `${o.name.split(" ").pop()} ${o.point > 0 ? "+" : ""}${o.point}`).join(" / ")}</div></div>}
                      {total && <div><div style={styles.label}>Total</div><div style={{ fontSize: 12 }}>{total.outcomes?.map(o => `${o.name} ${o.point}`).join(" / ")}</div></div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent bets */}
            {bets.length > 0 && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>Recent Bets</div>
                {bets.slice(0, 5).map(b => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{b.pick}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{b.date} · {b.odds} · ${b.amount}</div>
                    </div>
                    <div style={styles.badge(b.result === "win" ? "#00ff87" : b.result === "loss" ? "#f44336" : b.result === "push" ? "#ffeb3b" : "#555")}>
                      {b.result === "pending" ? "PENDING" : b.result === "win" ? `+$${b.profit}` : b.result === "push" ? "PUSH" : `-$${Math.abs(b.profit)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pick Analyzer */}
        {tab === "Pick Analyzer" && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Pick Analyzer</div>
            <div style={styles.card}>
              <div style={{ marginBottom: 12 }}>
                <div style={styles.label}>Enter Your Pick</div>
                <textarea
                  style={styles.textarea}
                  placeholder="e.g. Lakers -4.5 tonight, or Celtics ML, or Over 224.5 Nuggets vs Warriors"
                  value={pickInput}
                  onChange={e => setPickInput(e.target.value)}
                />
              </div>
              <button style={styles.btn()} onClick={analyzePick} disabled={analyzing}>
                {analyzing ? "Analyzing..." : "⚡ Analyze Pick"}
              </button>
            </div>

            {analyzing && (
              <div style={{ ...styles.card, textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 14, color: "#555" }}>Running sharp analysis...</div>
              </div>
            )}

            {analysisResult && !analyzing && (
              <div style={styles.card}>
                {/* Grade header */}
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: `${GRADE_COLORS[analysisResult.grade] || "#555"}22`, border: `2px solid ${GRADE_COLORS[analysisResult.grade] || "#555"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: GRADE_COLORS[analysisResult.grade] || "#555" }}>{analysisResult.grade}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{analysisResult.verdict}</div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Confidence: <span style={{ color: "#00ff87", fontWeight: 700 }}>{analysisResult.confidence}%</span> · {analysisResult.suggested_bet_size}</div>
                  </div>
                </div>

                <div style={{ fontSize: 14, color: "#aaa", lineHeight: 1.6, marginBottom: 16 }}>{analysisResult.summary}</div>

                <div style={styles.grid2}>
                  <div>
                    <div style={{ ...styles.label, color: "#00ff87", marginBottom: 8 }}>✓ Pros</div>
                    {analysisResult.pros?.map((p, i) => <div key={i} style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>• {p}</div>)}
                  </div>
                  <div>
                    <div style={{ ...styles.label, color: "#f44336", marginBottom: 8 }}>✗ Cons</div>
                    {analysisResult.cons?.map((c, i) => <div key={i} style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>• {c}</div>)}
                  </div>
                </div>

                {analysisResult.sharp_money && (
                  <div style={{ marginTop: 16, padding: 12, background: "rgba(0,255,135,0.05)", borderRadius: 8, border: "1px solid rgba(0,255,135,0.1)" }}>
                    <div style={styles.label}>Sharp Money</div>
                    <div style={{ fontSize: 13, color: "#aaa" }}>{analysisResult.sharp_money}</div>
                  </div>
                )}

                {analysisResult.improved_pick && (
                  <div style={{ marginTop: 12, padding: 12, background: "rgba(99,102,241,0.05)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)" }}>
                    <div style={{ ...styles.label, color: "#818cf8" }}>💡 Improved Pick</div>
                    <div style={{ fontSize: 13, color: "#aaa" }}>{analysisResult.improved_pick}</div>
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <button style={styles.btn()} onClick={() => {
                    setBetForm(prev => ({ ...prev, pick: pickInput, odds: "" }));
                    setTab("Bet Tracker");
                    notify("Pick loaded into tracker!");
                  }}>
                    + Add to Bet Tracker
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bet Tracker */}
        {tab === "Bet Tracker" && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Bet Tracker</div>
            <div style={styles.card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={styles.label}>Pick / Bet</div>
                  <input style={styles.input} placeholder="e.g. Lakers -4.5" value={betForm.pick} onChange={e => setBetForm(p => ({ ...p, pick: e.target.value }))} />
                </div>
                <div>
                  <div style={styles.label}>Game</div>
                  <input style={styles.input} placeholder="e.g. LAL vs GSW" value={betForm.game} onChange={e => setBetForm(p => ({ ...p, game: e.target.value }))} />
                </div>
                <div>
                  <div style={styles.label}>Odds</div>
                  <input style={styles.input} placeholder="e.g. -110 or +150" value={betForm.odds} onChange={e => setBetForm(p => ({ ...p, odds: e.target.value }))} />
                </div>
                <div>
                  <div style={styles.label}>Amount ($)</div>
                  <input style={styles.input} placeholder="e.g. 50" type="number" value={betForm.amount} onChange={e => setBetForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={styles.label}>Notes (optional)</div>
                <input style={styles.input} placeholder="Reasoning, source, etc." value={betForm.notes} onChange={e => setBetForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <button style={styles.btn()} onClick={addBet}>+ Log Bet</button>
            </div>

            {/* Bet list */}
            {bets.length === 0 ? (
              <div style={{ ...styles.card, textAlign: "center", color: "#555", padding: 40 }}>No bets logged yet</div>
            ) : bets.map(b => (
              <div key={b.id} style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{b.pick}</div>
                    {b.game && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{b.game}</div>}
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{b.date} · {b.odds} · ${b.amount}</div>
                    {b.notes && <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontStyle: "italic" }}>{b.notes}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={styles.badge(b.result === "win" ? "#00ff87" : b.result === "loss" ? "#f44336" : b.result === "push" ? "#ffeb3b" : "#555")}>
                      {b.result === "pending" ? "PENDING" : b.result === "win" ? `+$${b.profit}` : b.result === "push" ? "PUSH" : `-$${Math.abs(b.profit)}`}
                    </div>
                    {b.result === "pending" && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={styles.btnSm("#00ff8744")} onClick={() => settleBet(b.id, "win")}>W</button>
                        <button style={styles.btnSm("#f4433644")} onClick={() => settleBet(b.id, "loss")}>L</button>
                        <button style={styles.btnSm("#ffeb3b44")} onClick={() => settleBet(b.id, "push")}>P</button>
                      </div>
                    )}
                    <button style={styles.btnSm()} onClick={() => deleteBet(b.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* P&L Calendar */}
        {tab === "P&L Calendar" && (
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={styles.sectionTitle}>P&L Calendar</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={styles.btnSm()} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>‹</button>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                <button style={styles.btnSm()} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>›</button>
              </div>
            </div>

            <div style={styles.grid4}>
              {[
                { label: "Total P&L", val: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "#00ff87" : "#f44336" },
                { label: "Win Rate", val: `${winRate}%`, color: "#fff" },
                { label: "ROI", val: `${roi}%`, color: parseFloat(roi) >= 0 ? "#00ff87" : "#f44336" },
                { label: "Settled", val: `${settled.length} bets`, color: "#fff" },
              ].map(s => (
                <div key={s.label} style={styles.statCard}>
                  <div style={styles.label}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} style={{ fontSize: 10, color: "#555", textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {renderCalendar()}
              </div>
            </div>
          </div>
        )}

        {/* Best Bets */}
        {tab === "Best Bets" && (
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={styles.sectionTitle}>AI Best Bets</div>
              <button style={styles.btn()} onClick={() => { fetchGames().then(generateBestBets); }}>↻ Regenerate</button>
            </div>

            {loadingGames || loadingBestBets ? (
              <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 14, color: "#555" }}>Analyzing today's slate...</div>
              </div>
            ) : bestBets.length === 0 ? (
              <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#555" }}>
                No best bets available. Check back when games are scheduled.
              </div>
            ) : bestBets.map((bet, i) => (
              <div key={i} style={{ ...styles.card, border: "1px solid rgba(0,255,135,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{bet.game}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{bet.bet}</div>
                    <div style={{ fontSize: 13, color: "#00ff87", marginTop: 2 }}>{bet.odds} · {bet.units} {parseInt(bet.units) === 1 ? "unit" : "units"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: GRADE_COLORS[bet.grade] || "#555" }}>{bet.grade}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{bet.confidence}% conf.</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6, marginBottom: 12 }}>{bet.reasoning}</div>
                <button style={styles.btnSm()} onClick={() => {
                  setBetForm({ game: bet.game, pick: bet.bet, odds: bet.odds, amount: "", notes: `AI Best Bet - ${bet.grade} grade` });
                  setTab("Bet Tracker");
                  notify("Best bet loaded into tracker!");
                }}>
                  + Add to Tracker
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

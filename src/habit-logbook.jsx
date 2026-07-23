import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ---------- helpers ----------
const HABITS = [
  { key: "gym", label: "Gym", unit: "session", type: "bool", color: "#2F6D4F" },
  { key: "water", label: "Water", unit: "glasses", type: "count", target: 8, color: "#3E7CB1" },
  { key: "sleep", label: "Sleep", unit: "hrs", type: "count", target: 8, step: 0.5, color: "#7C5CBF" },
  { key: "reading", label: "Reading", unit: "min", type: "count", target: 30, step: 5, color: "#C98A2B" },
  { key: "coding", label: "Coding", unit: "min", type: "count", target: 60, step: 5, color: "#B24C33" },
];

function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function emptyEntry(date) {
  return { date, gym: false, water: 0, sleep: 0, reading: 0, coding: 0 };
}

export default function HabitLogbook() {
  const [log, setLog] = useState({}); // date -> entry
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [loaded, setLoaded] = useState(false);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved

  // Load from persistent storage
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("habit-log-entries");
        if (result && result.value) {
          setLog(JSON.parse(result.value));
        }
      } catch (e) {
        // no data yet
      }
      try {
        const cached = await window.storage.get("habit-log-insights");
        if (cached && cached.value) setInsights(JSON.parse(cached.value));
      } catch (e) {
        // no cached insights
      }
      setLoaded(true);
    })();
  }, []);

  const entry = log[selectedDate] || emptyEntry(selectedDate);

  const persist = useCallback(async (nextLog) => {
    setSaveState("saving");
    try {
      await window.storage.set("habit-log-entries", JSON.stringify(nextLog));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("idle");
    }
  }, []);

  const updateEntry = (patch) => {
    const next = { ...log, [selectedDate]: { ...entry, ...patch, date: selectedDate } };
    setLog(next);
    persist(next);
  };

  // last 14 days, oldest first
  const last14 = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(todayKey(-i));
    return days.map((d) => log[d] || emptyEntry(d));
  }, [log]);

  const chartData = useMemo(
    () =>
      last14.map((e) => ({
        date: fmtDay(e.date).slice(0, 6),
        Water: e.water,
        Sleep: e.sleep,
        Reading: e.reading,
        Coding: e.coding,
        Gym: e.gym ? 1 : 0,
      })),
    [last14]
  );

  const streaks = useMemo(() => {
    const out = {};
    for (const h of HABITS) {
      let count = 0;
      for (let i = 0; i < 60; i++) {
        const d = todayKey(-i);
        const e = log[d];
        if (!e) break;
        const hit = h.type === "bool" ? e.gym : (e[h.key] || 0) >= h.target;
        if (hit) count++;
        else break;
      }
      out[h.key] = count;
    }
    return out;
  }, [log]);

  const requestInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const payload = last14.map((e) => ({
        date: e.date,
        gym: e.gym,
        water_glasses: e.water,
        sleep_hours: e.sleep,
        reading_min: e.reading,
        coding_min: e.coding,
      }));

      const system = `You are a calm, precise personal-habits analyst reviewing a 14-day log. 
Targets: water 8 glasses/day, sleep 8 hrs/night, reading 30 min/day, coding 60 min/day, gym is a yes/no session.
Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "summary": "one or two sentence overall read on the fortnight",
  "patterns": ["short observed pattern 1", "short observed pattern 2", "short observed pattern 3"],
  "suggestions": ["short concrete suggestion 1", "short concrete suggestion 2", "short concrete suggestion 3"]
}
Keep every string under 140 characters. Be specific to the numbers given, not generic advice. If data is sparse, say so plainly in the summary.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system,
          messages: [
            {
              role: "user",
              content: `Here is my 14-day habit log as JSON:\n${JSON.stringify(payload)}\n\nAnalyze it.`,
            },
          ],
        }),
      });

      const data = await response.json();
      const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
      const raw = textBlocks.join("\n").trim();
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setInsights(parsed);
      window.storage.set("habit-log-insights", JSON.stringify(parsed)).catch(() => {});
    } catch (e) {
      setInsightsError("Couldn't generate insights just now. Try again in a moment.");
    } finally {
      setInsightsLoading(false);
    }
  };

  const isToday = selectedDate === todayKey();

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .hl-root { font-family: 'Inter', sans-serif; }
        .hl-mono { font-family: 'JetBrains Mono', monospace; }
        .hl-checkbox { appearance: none; width: 22px; height: 22px; border: 2px solid var(--ink); border-radius: 3px; cursor: pointer; position: relative; background: transparent; flex-shrink: 0; }
        .hl-checkbox:checked { background: var(--moss); border-color: var(--moss); }
        .hl-checkbox:checked::after { content: '✓'; position: absolute; top: -3px; left: 3px; color: var(--paper); font-size: 15px; font-weight: 700; }
        .hl-stepper-btn { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--slate); background: var(--paper); color: var(--ink); font-family: 'JetBrains Mono', monospace; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s ease; }
        .hl-stepper-btn:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .hl-day-pill { cursor: pointer; border: none; background: transparent; font-family: 'JetBrains Mono', monospace; padding: 6px 10px; border-radius: 20px; font-size: 12px; color: var(--slate); transition: all .15s ease; white-space: nowrap; }
        .hl-day-pill.active { background: var(--ink); color: var(--paper); }
        .hl-ai-btn { background: var(--amber); color: var(--ink); border: none; padding: 12px 22px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; letter-spacing: 0.03em; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; box-shadow: 3px 3px 0 var(--ink); }
        .hl-ai-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--ink); }
        .hl-ai-btn:active:not(:disabled) { transform: translate(1px,1px); box-shadow: 1px 1px 0 var(--ink); }
        .hl-ai-btn:disabled { opacity: 0.6; cursor: default; }
        .hl-scrollx::-webkit-scrollbar { height: 6px; }
        .hl-scrollx::-webkit-scrollbar-thumb { background: var(--slate); border-radius: 3px; }
      `}</style>

      <div className="hl-root" style={{ "--ink": "#1F2A24", "--paper": "#EEF0E6", "--moss": "#2F6D4F", "--amber": "#C98A2B", "--rust": "#B24C33", "--slate": "#8B9184" }}>
        {/* Header / masthead */}
        <div style={styles.masthead}>
          <div>
            <div className="hl-mono" style={styles.eyebrow}>FIELD LOG — PERSONAL HABITS</div>
            <h1 className="hl-mono" style={styles.title}>Habit Logbook</h1>
          </div>
          <div style={styles.streakGrid}>
            {HABITS.map((h) => (
              <div key={h.key} style={styles.streakCell}>
                <div className="hl-mono" style={{ ...styles.streakNum, color: h.color }}>{streaks[h.key]}</div>
                <div className="hl-mono" style={styles.streakLabel}>{h.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Day selector */}
        <div className="hl-scrollx" style={styles.dayRow}>
          {last14.map((e) => (
            <button
              key={e.date}
              className={`hl-day-pill ${e.date === selectedDate ? "active" : ""}`}
              onClick={() => setSelectedDate(e.date)}
            >
              {e.date === todayKey() ? "TODAY" : fmtDay(e.date)}
            </button>
          ))}
        </div>

        {/* Entry ledger */}
        <div style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div className="hl-mono" style={styles.cardHeader}>
              Entry — {fmtDay(selectedDate)} {isToday ? "(today)" : ""}
            </div>
            <div className="hl-mono" style={styles.saveIndicator}>
              {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved ✓" : ""}
            </div>
          </div>

          {HABITS.map((h) => (
            <div key={h.key} style={styles.habitRow}>
              <div style={{ ...styles.habitDot, background: h.color }} />
              <div className="hl-mono" style={styles.habitLabel}>{h.label}</div>

              {h.type === "bool" ? (
                <div style={styles.controlArea}>
                  <input
                    type="checkbox"
                    className="hl-checkbox"
                    checked={!!entry.gym}
                    onChange={(ev) => updateEntry({ gym: ev.target.checked })}
                  />
                  <span className="hl-mono" style={styles.controlText}>{entry.gym ? "done" : "not yet"}</span>
                </div>
              ) : (
                <div style={styles.controlArea}>
                  <button
                    className="hl-stepper-btn"
                    onClick={() => updateEntry({ [h.key]: Math.max(0, (entry[h.key] || 0) - (h.step || 1)) })}
                  >
                    −
                  </button>
                  <span className="hl-mono" style={styles.controlValue}>
                    {entry[h.key] || 0}
                    <span style={styles.controlUnit}> {h.unit}</span>
                  </span>
                  <button
                    className="hl-stepper-btn"
                    onClick={() => updateEntry({ [h.key]: (entry[h.key] || 0) + (h.step || 1) })}
                  >
                    +
                  </button>
                  <div style={styles.targetTag} className="hl-mono">/ {h.target}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div style={styles.card}>
          <div className="hl-mono" style={styles.cardHeader}>14-Day Trend</div>
          <div style={{ width: "100%", height: 220, marginTop: 8 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#D8DBCF" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                <Tooltip
                  contentStyle={{ fontFamily: "JetBrains Mono", fontSize: 12, border: "1px solid #1F2A24", borderRadius: 4 }}
                />
                <Line type="monotone" dataKey="Water" stroke="#3E7CB1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Sleep" stroke="#7C5CBF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Reading" stroke="#C98A2B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Coding" stroke="#B24C33" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights */}
        <div style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div className="hl-mono" style={styles.cardHeader}>Field Report — AI Insights</div>
            <button className="hl-ai-btn" onClick={requestInsights} disabled={insightsLoading}>
              {insightsLoading ? "ANALYZING…" : "ANALYZE PATTERNS"}
            </button>
          </div>

          {insightsError && <div style={styles.errorText} className="hl-mono">{insightsError}</div>}

          {!insights && !insightsLoading && !insightsError && (
            <div style={styles.emptyState} className="hl-mono">
              Log a few days, then run the analysis for patterns and suggestions.
            </div>
          )}

          {insights && (
            <div style={{ marginTop: 10 }}>
              <p style={styles.summaryText}>{insights.summary}</p>
              <div style={styles.insightCols}>
                <div>
                  <div className="hl-mono" style={styles.insightColHeader}>PATTERNS</div>
                  <ul style={styles.insightList}>
                    {(insights.patterns || []).map((p, i) => (
                      <li key={i} style={styles.insightItem}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="hl-mono" style={{ ...styles.insightColHeader, color: "#C98A2B" }}>SUGGESTIONS</div>
                  <ul style={styles.insightList}>
                    {(insights.suggestions || []).map((s, i) => (
                      <li key={i} style={styles.insightItem}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="hl-mono" style={styles.footer}>
          data stored privately on this device — {loaded ? `${Object.keys(log).length} days logged` : "loading…"}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    background: "#EEF0E6",
    backgroundImage:
      "linear-gradient(#D8DBCF 1px, transparent 1px), linear-gradient(90deg, #D8DBCF 1px, transparent 1px)",
    backgroundSize: "24px 24px",
    padding: "20px 16px 40px",
  },
  masthead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16,
    borderBottom: "3px solid #1F2A24",
    paddingBottom: 14,
    marginBottom: 16,
    maxWidth: 900,
    marginLeft: "auto",
    marginRight: "auto",
  },
  eyebrow: { fontSize: 11, letterSpacing: "0.12em", color: "#8B9184", marginBottom: 4 },
  title: { fontSize: 28, margin: 0, color: "#1F2A24", fontWeight: 700 },
  streakGrid: { display: "flex", gap: 14 },
  streakCell: { textAlign: "center", minWidth: 44 },
  streakNum: { fontSize: 20, fontWeight: 700, lineHeight: 1 },
  streakLabel: { fontSize: 9, color: "#8B9184", marginTop: 2, letterSpacing: "0.04em" },
  dayRow: {
    display: "flex",
    gap: 4,
    overflowX: "auto",
    maxWidth: 900,
    margin: "0 auto 16px",
    paddingBottom: 4,
  },
  card: {
    background: "#FBFAF5",
    border: "1.5px solid #1F2A24",
    borderRadius: 6,
    padding: "16px 18px",
    maxWidth: 900,
    margin: "0 auto 16px",
    boxShadow: "4px 4px 0 rgba(31,42,36,0.08)",
  },
  cardHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  cardHeader: { fontSize: 12, letterSpacing: "0.08em", color: "#1F2A24", fontWeight: 700, textTransform: "uppercase" },
  saveIndicator: { fontSize: 10, color: "#2F6D4F" },
  habitRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: "1px dashed #D8DBCF",
  },
  habitDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  habitLabel: { fontSize: 13, width: 70, color: "#1F2A24", fontWeight: 500 },
  controlArea: { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  controlText: { fontSize: 12, color: "#8B9184" },
  controlValue: { fontSize: 14, fontWeight: 700, color: "#1F2A24", minWidth: 70 },
  controlUnit: { fontSize: 10, color: "#8B9184", fontWeight: 400 },
  targetTag: { fontSize: 10, color: "#8B9184", marginLeft: "auto" },
  errorText: { color: "#B24C33", fontSize: 12, marginTop: 10 },
  emptyState: { color: "#8B9184", fontSize: 12, marginTop: 10 },
  summaryText: { fontSize: 14, color: "#1F2A24", lineHeight: 1.5, marginBottom: 12 },
  insightCols: { display: "flex", gap: 24, flexWrap: "wrap" },
  insightColHeader: { fontSize: 10, letterSpacing: "0.08em", color: "#2F6D4F", marginBottom: 6 },
  insightList: { margin: 0, paddingLeft: 16, listStyleType: "'— '" },
  insightItem: { fontSize: 12.5, color: "#1F2A24", marginBottom: 6, lineHeight: 1.4 },
  footer: { textAlign: "center", fontSize: 10, color: "#8B9184", marginTop: 8 },
};

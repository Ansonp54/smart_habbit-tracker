import { useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./HabitLogbook.css";

// ---------- helpers ----------
const HABITS = [
  { key: "gym", label: "Gym", unit: "session", type: "bool", color: "#2F6D4F" },
  { key: "water", label: "Water", unit: "bottles", type: "count", target: 1, step: 0.25, color: "#3E7CB1" },
  { key: "sleep", label: "Sleep", unit: "hrs", type: "count", target: 8, step: 0.5, color: "#7C5CBF" },
  { key: "reading", label: "Reading", unit: "min", type: "count", target: 30, step: 5, color: "#C98A2B" },
  { key: "coding", label: "Coding", unit: "min", type: "count", target: 60, step: 5, color: "#B24C33" },
  { key: "deliveries", label: "Deliveries", unit: "$", type: "count", target: 50, step: 1, color: "#5C7A99", goal: "max" },
  { key: "jobApps", label: "Job Apps", unit: "applications", type: "count", target: 5, step: 1, color: "#2E8B8B" },
  { key: "creatine", label: "Creatine", unit: "dose", type: "bool", color: "#9C6B30" },
  { key: "proteinShake", label: "Protein Shake", unit: "shake", type: "bool", color: "#C2577D" },
];

const STORAGE_KEY = "habit-log-entries";
const INSIGHTS_STORAGE_KEY = "habit-log-insights";
const WORKOUT_TYPES = ["Push", "Pull", "Legs", "Rest Day"];

const TREND_SERIES = [
  { key: "Water", color: "#3E7CB1" },
  { key: "Sleep", color: "#7C5CBF" },
  { key: "Reading", color: "#C98A2B" },
  { key: "Coding", color: "#B24C33" },
  { key: "Deliveries", color: "#5C7A99" },
  { key: "Job Apps", color: "#2E8B8B" },
];

const HIT_COLOR = "#2F6D4F";
const MISS_COLOR = "#8B9184";

function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtShort(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Monday-start week, offsetWeeks 0 = this week, 1 = last week, etc.
function startOfWeek(offsetWeeks) {
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset - offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDateKeys(offsetWeeks) {
  const start = startOfWeek(offsetWeeks);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => {
  const start = startOfWeek(i);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const label = i === 0 ? "This week" : i === 1 ? "Last week" : `${fmtShort(start)} – ${fmtShort(end)}`;
  return { value: i, label };
});

function emptyEntry(date) {
  return {
    date,
    gym: false,
    gymType: "",
    water: 0,
    sleep: 0,
    reading: 0,
    coding: 0,
    deliveries: 0,
    jobApps: 0,
    creatine: false,
    proteinShake: false,
  };
}

function isHit(h, e) {
  if (h.type === "bool") return !!e[h.key];
  return h.goal === "max" ? (e[h.key] || 0) <= h.target : (e[h.key] || 0) >= h.target;
}

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted or inaccessible — start fresh
  }
  return {};
}

function loadInsights() {
  try {
    const raw = localStorage.getItem(INSIGHTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted or inaccessible — ignore
  }
  return null;
}

export default function HabitLogbook() {
  const [log, setLog] = useState(loadLog); // date -> entry
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, up to 51 weeks back
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [insights, setInsights] = useState(loadInsights);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const importInputRef = useRef(null);
  const [chartType, setChartType] = useState("line"); // line | bar
  const [hitRateHabitKey, setHitRateHabitKey] = useState(HABITS[0].key);

  const entry = log[selectedDate] || emptyEntry(selectedDate);

  const resetData = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INSIGHTS_STORAGE_KEY);
    setLog({});
    setInsights(null);
    setInsightsError(null);
    setSelectedDate(todayKey());
    setWeekOffset(0);
    setResetArmed(false);
  };

  const persist = useCallback((nextLog) => {
    setSaveState("saving");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLog));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("idle");
    }
  }, []);

  const updateEntry = (patch) => {
    const next = { ...log, [selectedDate]: { ...entry, ...patch, date: selectedDate } };
    setLog(next);
    persist(next);
  };

  const saveNow = () => persist(log);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `habit-log-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => importInputRef.current?.click();

  const importData = (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not a valid habit log file");
        }
        const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
        const cleaned = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (!dateKeyPattern.test(key) || typeof value !== "object" || value === null) continue;
          cleaned[key] = { ...emptyEntry(key), ...value, date: key };
        }
        const count = Object.keys(cleaned).length;
        if (count === 0) throw new Error("no valid entries found in file");

        const merged = { ...log, ...cleaned };
        setLog(merged);
        persist(merged);
        setImportMessage(`imported ${count} day${count === 1 ? "" : "s"}`);
      } catch (e) {
        setImportMessage(`import failed: ${e.message}`);
      }
      setTimeout(() => setImportMessage(null), 4000);
    };
    reader.readAsText(file);
  };

  // last 14 days, oldest first
  const last14 = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(todayKey(-i));
    return days.map((d) => log[d] || emptyEntry(d));
  }, [log]);

  // the 7 days (Mon–Sun) of the selected week, oldest first
  const weekEntries = useMemo(
    () => weekDateKeys(weekOffset).map((d) => log[d] || emptyEntry(d)),
    [log, weekOffset]
  );

  const selectWeek = (offset) => {
    setWeekOffset(offset);
    setSelectedDate(offset === 0 ? todayKey() : weekDateKeys(offset)[0]);
  };

  const chartData = useMemo(
    () =>
      last14.map((e) => ({
        date: fmtDay(e.date).slice(0, 6),
        Water: e.water,
        Sleep: e.sleep,
        Reading: e.reading,
        Coding: e.coding,
        Deliveries: e.deliveries,
        "Job Apps": e.jobApps,
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
        if (isHit(h, e)) count++;
        else break;
      }
      out[h.key] = count;
    }
    return out;
  }, [log]);

  const hitRateHabit = HABITS.find((h) => h.key === hitRateHabitKey) || HABITS[0];

  const hitRateData = useMemo(() => {
    let hit = 0;
    let miss = 0;
    for (const e of last14) {
      if (isHit(hitRateHabit, e)) hit++;
      else miss++;
    }
    return [
      { name: "Hit", value: hit },
      { name: "Miss", value: miss },
    ];
  }, [last14, hitRateHabit]);

  const requestInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const payload = last14.map((e) => ({
        date: e.date,
        gym: e.gym,
        gym_muscle_group: e.gymType || null,
        water_bottles: e.water,
        sleep_hours: e.sleep,
        reading_min: e.reading,
        coding_min: e.coding,
        delivery_spend_usd: e.deliveries,
        job_applications: e.jobApps,
        creatine: e.creatine,
        protein_shake: e.proteinShake,
      }));

      const system = `You are a calm, precise personal-habits analyst reviewing a 14-day log.
Targets: water 1 bottle (2.5L)/day, sleep 8 hrs/night, reading 30 min/day, coding 60 min/day, gym is a yes/no session (with a workout type: push/pull/legs/rest day), deliveries should stay under $50/day, job applications target is 5/day, creatine and protein shake are yes/no daily supplements.
Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "summary": "one or two sentence overall read on the fortnight",
  "patterns": ["short observed pattern 1", "short observed pattern 2", "short observed pattern 3"],
  "suggestions": ["short concrete suggestion 1", "short concrete suggestion 2", "short concrete suggestion 3"]
}
Keep every string under 140 characters. Be specific to the numbers given, not generic advice. If data is sparse, say so plainly in the summary.`;

      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
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
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message);
      const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
      const raw = textBlocks.join("\n").trim();
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setInsights(parsed);
      localStorage.setItem(INSIGHTS_STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) {
      setInsightsError(e.message || "Couldn't generate insights just now. Try again in a moment.");
    } finally {
      setInsightsLoading(false);
    }
  };

  const isToday = selectedDate === todayKey();

  return (
    <div style={styles.page}>
      <div className="hl-root">
        {/* Header / masthead */}
        <div style={styles.masthead}>
          <div className="hl-mono" style={styles.eyebrow}>FIELD LOG — PERSONAL HABITS</div>
          <h1 className="hl-mono" style={styles.title}>Smart Habit Tracker</h1>
        </div>

        {/* Week selector */}
        <div style={styles.weekRow}>
          <select
            className="hl-mono"
            style={styles.weekSelect}
            value={weekOffset}
            onChange={(ev) => selectWeek(Number(ev.target.value))}
          >
            {WEEK_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* Day selector */}
        <div className="hl-scrollx" style={styles.dayRow}>
          {weekEntries.map((e) => (
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
        <div className="hl-card" style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div className="hl-mono" style={styles.cardHeader}>
              Entry — {fmtDay(selectedDate)} {isToday ? "(today)" : ""}
            </div>
            <div style={styles.saveGroup}>
              <div className="hl-mono" style={styles.saveIndicator}>
                {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved ✓" : ""}
              </div>
              <button className="hl-mono hl-save-btn" style={styles.saveBtn} onClick={saveNow}>
                SAVE
              </button>
            </div>
          </div>

          {HABITS.map((h) => (
            <div key={h.key} className="hl-habit-row" style={styles.habitRow}>
              <div className="hl-mono" style={{ ...styles.habitDot, color: h.color }} title={`${streaks[h.key]}-day streak`}>
                {streaks[h.key]}
              </div>
              <div className="hl-mono" style={styles.habitLabel}>{h.label}</div>

              {h.type === "bool" ? (
                <div style={styles.controlArea}>
                  <input
                    type="checkbox"
                    className="hl-checkbox"
                    checked={!!entry[h.key]}
                    onChange={(ev) => updateEntry({ [h.key]: ev.target.checked })}
                  />
                  <span className="hl-mono" style={styles.controlText}>{entry[h.key] ? "done" : "not yet"}</span>
                  {h.key === "gym" && (
                    <div style={styles.workoutTypeGroup}>
                      {WORKOUT_TYPES.map((g) => (
                        <label key={g} className="hl-mono" style={styles.workoutTypeOption}>
                          <input
                            type="checkbox"
                            className="hl-checkbox-sm"
                            checked={entry.gymType === g}
                            onChange={() => {
                              const next = entry.gymType === g ? "" : g;
                              const patch = { gymType: next };
                              if (next === "Rest Day") patch.gym = false;
                              else if (next) patch.gym = true;
                              updateEntry(patch);
                            }}
                          />
                          {g}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ ...styles.controlArea, "--hcolor": h.color }}>
                  <button
                    className="hl-stepper-btn"
                    onClick={() => updateEntry({ [h.key]: Math.max(0, (entry[h.key] || 0) - (h.step || 1)) })}
                  >
                    −
                  </button>
                  <span className="hl-mono" style={styles.controlValue}>
                    {h.unit === "$" && <span style={styles.controlUnit}>$</span>}
                    <input
                      type="number"
                      inputMode="decimal"
                      step={h.step || 1}
                      min={0}
                      className="hl-mono hl-num-input"
                      style={{ ...styles.controlValueInput, "--hcolor": h.color }}
                      value={entry[h.key] || 0}
                      onChange={(ev) => {
                        const raw = ev.target.value;
                        if (raw === "") {
                          updateEntry({ [h.key]: 0 });
                          return;
                        }
                        const num = parseFloat(raw);
                        if (!Number.isNaN(num)) updateEntry({ [h.key]: Math.max(0, num) });
                      }}
                    />
                    {h.unit !== "$" && <span style={styles.controlUnit}> {h.unit}</span>}
                  </span>
                  <button
                    className="hl-stepper-btn"
                    onClick={() => updateEntry({ [h.key]: (entry[h.key] || 0) + (h.step || 1) })}
                  >
                    +
                  </button>
                  <div style={styles.targetTag} className="hl-mono">
                    {h.goal === "max" ? "under " : "/ "}
                    {h.unit === "$" ? `$${h.target}` : h.target}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Trend chart */}
        <div className="hl-card" style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div className="hl-mono" style={styles.cardHeader}>14-Day Trend</div>
            <div style={styles.chartTypeGroup}>
              {["line", "bar"].map((t) => (
                <button
                  key={t}
                  className="hl-mono"
                  style={{ ...styles.chartTypeBtn, ...(chartType === t ? styles.chartTypeBtnActive : {}) }}
                  onClick={() => setChartType(t)}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: "100%", height: 220, marginTop: 8 }}>
            <ResponsiveContainer>
              {chartType === "line" ? (
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#D8DBCF" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                  <Tooltip
                    contentStyle={{ fontFamily: "JetBrains Mono", fontSize: 12, border: "1px solid #1F2A24", borderRadius: 4 }}
                  />
                  {TREND_SERIES.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#D8DBCF" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#8B9184" }} />
                  <Tooltip
                    contentStyle={{ fontFamily: "JetBrains Mono", fontSize: 12, border: "1px solid #1F2A24", borderRadius: 4 }}
                  />
                  {TREND_SERIES.map((s) => (
                    <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Target hit rate */}
        <div className="hl-card" style={styles.card}>
          <div style={styles.cardHeaderRow}>
            <div className="hl-mono" style={styles.cardHeader}>Target Hit Rate — Last 14 Days</div>
            <select
              className="hl-mono"
              style={styles.weekSelect}
              value={hitRateHabitKey}
              onChange={(ev) => setHitRateHabitKey(ev.target.value)}
            >
              {HABITS.map((h) => (
                <option key={h.key} value={h.key}>{h.label}</option>
              ))}
            </select>
          </div>
          <div style={{ width: "100%", height: 220, marginTop: 8 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={hitRateData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  stroke="#FBFAF5"
                  strokeWidth={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  <Cell fill={HIT_COLOR} />
                  <Cell fill={MISS_COLOR} />
                </Pie>
                <Tooltip
                  contentStyle={{ fontFamily: "JetBrains Mono", fontSize: 12, border: "1px solid #1F2A24", borderRadius: 4 }}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value) => <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "#1F2A24" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights */}
        <div className="hl-card" style={styles.card}>
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
          data stored privately on this device — {Object.keys(log).length} days logged
          {" · "}
          <button className="hl-mono hl-link-btn" style={styles.exportBtn} onClick={exportData}>
            export data
          </button>
          {" · "}
          <button className="hl-mono hl-link-btn" style={styles.exportBtn} onClick={triggerImport}>
            import data
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={importData}
            style={{ display: "none" }}
          />
          {" · "}
          <button className="hl-mono hl-link-btn" style={styles.resetBtn} onClick={resetData}>
            {resetArmed ? "click again to confirm" : "reset data"}
          </button>
          {importMessage && (
            <div className="hl-mono" style={styles.importMessage}>{importMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    background: "#E9E9E6",
    padding: "20px 16px 40px",
  },
  masthead: {
    borderBottom: "3px solid #1F2A24",
    paddingBottom: 14,
    marginBottom: 16,
    maxWidth: 900,
    marginLeft: "auto",
    marginRight: "auto",
  },
  eyebrow: { fontSize: 11, letterSpacing: "0.12em", color: "#8B9184", marginBottom: 4 },
  title: { fontSize: 28, margin: 0, color: "#1F2A24", fontWeight: 700 },
  weekRow: {
    maxWidth: 900,
    margin: "0 auto 8px",
    display: "flex",
    justifyContent: "flex-end",
  },
  weekSelect: {
    fontSize: 12,
    color: "#1F2A24",
    background: "#FBFAF5",
    border: "1.5px solid #8B9184",
    borderRadius: 4,
    padding: "5px 8px",
    cursor: "pointer",
  },
  chartTypeGroup: { display: "flex", gap: 4 },
  chartTypeBtn: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "#8B9184",
    background: "transparent",
    border: "1.5px solid #D8DBCF",
    borderRadius: 4,
    padding: "4px 10px",
    cursor: "pointer",
  },
  chartTypeBtnActive: {
    color: "#EEF0E6",
    background: "#1F2A24",
    borderColor: "#1F2A24",
  },
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
  saveGroup: { display: "flex", alignItems: "center", gap: 8 },
  saveIndicator: { fontSize: 10, color: "#2F6D4F" },
  saveBtn: {
    background: "#2F6D4F",
    color: "#EEF0E6",
    border: "none",
    padding: "5px 12px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    cursor: "pointer",
  },
  habitRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: "1px dashed #D8DBCF",
  },
  habitDot: { minWidth: 20, fontSize: 15, fontWeight: 700, textAlign: "center", flexShrink: 0 },
  habitLabel: { fontSize: 13, width: 70, color: "#1F2A24", fontWeight: 500 },
  controlArea: { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  controlText: { fontSize: 12, color: "#8B9184" },
  workoutTypeGroup: {
    display: "flex",
    gap: 10,
    marginLeft: "auto",
    flexWrap: "wrap",
  },
  workoutTypeOption: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "#1F2A24",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  controlValue: { fontSize: 14, fontWeight: 700, color: "#1F2A24", minWidth: 70, display: "flex", alignItems: "center" },
  controlValueInput: {
    width: 44,
    fontSize: 14,
    fontWeight: 700,
    color: "#1F2A24",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 3,
    padding: "2px 3px",
  },
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
  resetBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 10,
    color: "#B24C33",
    textDecoration: "underline",
    cursor: "pointer",
  },
  exportBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 10,
    color: "#3E7CB1",
    textDecoration: "underline",
    cursor: "pointer",
  },
  importMessage: { marginTop: 6, fontSize: 10, color: "#2F6D4F" },
};
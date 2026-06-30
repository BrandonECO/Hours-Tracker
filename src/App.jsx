import React, { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Clock3,
  DollarSign,
  Wrench,
  Target,
  Trophy,
  Sun,
  Moon,
  Eye,
  EyeOff,
  ArrowUpDown,
  Pencil,
  Check,
  X,
  Settings,
  Search,
  History,
} from "lucide-react";

const DEFAULT_PAY = { regular: "", flat: "", training: "" };
const initialEntries = [];

const SEED_BACKUP = {
  app: "Hours Tracker",
  version: 2,
  exportedAt: "",
  profile: { technician: "", dealership: "", role: "" },
  period: { start: "", end: "" },
  rates: { regular: "", flat: "", training: "" },
  physicalClocked: "",
  extraHours: { sick: "", pto: "", training: "", other: "" },
  entries: [],
  goal: "",
  daysLeft: "",
  theme: "dark",
  hideDollarAmounts: false,
};

function toNum(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, hide) {
  if (hide) return "•••••";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours) {
  const flagged = entries.reduce((sum, e) => sum + toNum(e.flagged), 0);
  const actual = entries.reduce((sum, e) => sum + toNum(e.actual), 0);
  const clocked = toNum(physicalClocked);
  const sickHours = toNum(extraHours.sick);
  const ptoHours = toNum(extraHours.pto);
  const trainingHours = toNum(extraHours.training);
  const otherHours = toNum(extraHours.other);
  const extraPaidHours = sickHours + ptoHours + trainingHours + otherHours;

  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const breakEvenRatio = flatRate > 0 ? regularRate / flatRate : 0;

  const productionFlatPay = flagged * flatRate;
  const extraPaidPay = extraPaidHours * flatRate;
  const flatPay = productionFlatPay + extraPaidPay;
  const basePay = clocked * regularRate;
  const breakEvenFlagged = clocked * breakEvenRatio;
  const cushion = flagged - breakEvenFlagged;
  const efficiencyClock = clocked > 0 ? (flagged / clocked) * 100 : NaN;
  const efficiencyActual = actual > 0 ? (flagged / actual) * 100 : NaN;
  const productiveDays = Math.max(1, entries.length);
  const avgFlaggedDay = flagged / productiveDays;
  const target = toNum(goal);
  const remainingToGoal = Math.max(0, target - flagged);
  const neededPerDay = toNum(daysLeft) > 0 ? remainingToGoal / toNum(daysLeft) : 0;

  return {
    flagged, actual, clocked, flatPay, productionFlatPay, extraPaidPay, extraPaidHours,
    sickHours, ptoHours, trainingHours, otherHours, basePay, breakEvenRatio,
    breakEvenFlagged, cushion, efficiencyClock, efficiencyActual, avgFlaggedDay,
    remainingToGoal, neededPerDay,
  };
}

function statusForEfficiency(efficiency, theme) {
  if (!Number.isFinite(efficiency)) return { label: "No data", cls: theme === "dark" ? "bg-zinc-700 text-zinc-100" : "bg-gray-300 text-gray-800" };
  if (efficiency < 75) return { label: "Below break-even", cls: theme === "dark" ? "bg-red-900 text-red-100" : "bg-red-200 text-red-900" };
  if (efficiency < 95) return { label: "Safe", cls: theme === "dark" ? "bg-yellow-800 text-yellow-100" : "bg-yellow-200 text-yellow-900" };
  if (efficiency < 115) return { label: "Strong", cls: theme === "dark" ? "bg-green-800 text-green-100" : "bg-green-200 text-green-900" };
  return { label: "Elite", cls: theme === "dark" ? "bg-purple-800 text-purple-100" : "bg-purple-200 text-purple-900" };
}

function typeClass(type, theme) {
  if (theme === "dark") {
    if (type === "CP") return "bg-green-900 text-green-100";
    if (type === "CUSW") return "bg-blue-900 text-blue-100";
    if (type === "WP") return "bg-purple-900 text-purple-100";
    if (type === "OTHER") return "bg-zinc-700 text-zinc-100";
    return "bg-blue-900 text-blue-100";
  }
  if (type === "CP") return "bg-green-200 text-green-900";
  if (type === "CUSW") return "bg-blue-200 text-blue-900";
  if (type === "WP") return "bg-purple-200 text-purple-900";
  if (type === "OTHER") return "bg-gray-200 text-gray-800";
  return "bg-blue-200 text-blue-900";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Computes the current semi-monthly pay period: 1st–15th, or 16th–end of month.
function computeCurrentPayPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  if (day <= 15) {
    return {
      start: `${year}-${pad2(month + 1)}-01`,
      end: `${year}-${pad2(month + 1)}-15`,
    };
  }
  return {
    start: `${year}-${pad2(month + 1)}-16`,
    end: `${year}-${pad2(month + 1)}-${pad2(lastDayOfMonth)}`,
  };
}

// Converts a stored ISO date (YYYY-MM-DD) into MM/DD/YYYY for display.
// Date <input> fields still use ISO internally since that's required
// by the HTML date input spec — this is purely for what's shown to the user.
function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

// Wipes any previously stored session data so the app always starts fresh
// with exactly the seed backup data the user provided — no leftover
// manually-typed test entries from prior sessions.
function resetToSeedOnce() {
  try {
    const alreadyReset = sessionStorage.getItem("hoursTracker.resetDone.v2");
    if (!alreadyReset) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("hoursTracker."))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.setItem("hoursTracker.resetDone.v2", "1");
    }
  } catch {}
}

function loadInitial(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored);
  } catch {}
  return fallback;
}

export default function HoursTracker() {
  resetToSeedOnce();

  const [entries, setEntries] = useState(() => loadInitial("hoursTracker.entries", SEED_BACKUP.entries));
  const [rates, setRates] = useState(() => loadInitial("hoursTracker.rates", SEED_BACKUP.rates));
  const [profile, setProfile] = useState(() => loadInitial("hoursTracker.profile", SEED_BACKUP.profile));
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [period, setPeriodRaw] = useState(() => {
    const stored = loadInitial("hoursTracker.period", null);
    return stored || computeCurrentPayPeriod();
  });
  const [periodAutoMode, setPeriodAutoMode] = useState(() => {
    const v = localStorage.getItem("hoursTracker.periodAutoMode");
    return v !== null ? JSON.parse(v) : true;
  });

  // setPeriod wrapper: any manual edit from the settings modal turns off
  // auto-mode so the user's chosen dates aren't overwritten later.
  function setPeriod(updater) {
    setPeriodAutoMode(false);
    setPeriodRaw(updater);
  }
  const [periodHistory, setPeriodHistory] = useState(() => loadInitial("hoursTracker.periodHistory", []));
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [form, setForm] = useState({ date: todayIsoDate(), type: "CP", actual: "", flagged: "", description: "" });
  const lastAutoDateRef = React.useRef(todayIsoDate());

  // Keeps the "Add entry" date field pinned to today automatically.
  // If the artifact stays open across midnight, the date rolls forward
  // on its own — but only while the field still matches the date it
  // was auto-set to, so a manually picked date is never overwritten.
  useEffect(() => {
    const checkDate = () => {
      const current = todayIsoDate();
      if (current !== lastAutoDateRef.current) {
        setForm((f) => (f.date === lastAutoDateRef.current ? { ...f, date: current } : f));
        lastAutoDateRef.current = current;
      }
    };
    const interval = setInterval(checkDate, 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const [physicalClocked, setPhysicalClocked] = useState(() => {
    const v = localStorage.getItem("hoursTracker.physicalClocked");
    return v !== null ? v : SEED_BACKUP.physicalClocked;
  });
  const [extraHours, setExtraHours] = useState(() => loadInitial("hoursTracker.extraHours", SEED_BACKUP.extraHours));
  const [goal, setGoal] = useState(() => {
    const v = localStorage.getItem("hoursTracker.goal");
    return v !== null ? v : SEED_BACKUP.goal;
  });
  const [daysLeft, setDaysLeft] = useState(() => {
    const v = localStorage.getItem("hoursTracker.daysLeft");
    return v !== null ? v : SEED_BACKUP.daysLeft;
  });
  const [theme, setTheme] = useState(() => {
    const v = localStorage.getItem("hoursTracker.theme");
    return v !== null ? v : SEED_BACKUP.theme;
  });
  const [hideDollarAmounts, setHideDollarAmounts] = useState(() => {
    const v = localStorage.getItem("hoursTracker.hideDollarAmounts");
    return v !== null ? JSON.parse(v) : SEED_BACKUP.hideDollarAmounts;
  });
  const [clockFormat, setClockFormat] = useState(() => {
    const v = localStorage.getItem("hoursTracker.clockFormat");
    return v !== null ? v : "12";
  });

  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const totals = useMemo(
    () => calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours),
    [entries, rates, goal, daysLeft, physicalClocked, extraHours]
  );

  const status = statusForEfficiency(totals.efficiencyClock, theme);

  useEffect(() => { localStorage.setItem("hoursTracker.entries", JSON.stringify(entries)); }, [entries]);
  useEffect(() => { localStorage.setItem("hoursTracker.rates", JSON.stringify(rates)); }, [rates]);
  useEffect(() => { localStorage.setItem("hoursTracker.profile", JSON.stringify(profile)); }, [profile]);
  useEffect(() => { localStorage.setItem("hoursTracker.period", JSON.stringify(period)); }, [period]);
  useEffect(() => { localStorage.setItem("hoursTracker.periodHistory", JSON.stringify(periodHistory)); }, [periodHistory]);
  useEffect(() => { localStorage.setItem("hoursTracker.periodAutoMode", JSON.stringify(periodAutoMode)); }, [periodAutoMode]);

  // Keeps current state available to the period-sync effect without
  // making it re-run on every keystroke (it only needs to fire on an
  // interval / period boundary, not on every entries/rates change).
  const stateRef = React.useRef();
  stateRef.current = { entries, physicalClocked, extraHours, goal, daysLeft, rates, totals };

  function archiveCurrentPeriod(closingPeriod) {
    const s = stateRef.current;
    if (!s.entries.length && !toNum(s.physicalClocked)) return; // nothing to archive
    const snapshot = {
      id: `${closingPeriod.start}_${closingPeriod.end}_${Date.now()}`,
      period: closingPeriod,
      entries: s.entries,
      physicalClocked: s.physicalClocked,
      extraHours: s.extraHours,
      goal: s.goal,
      rates: s.rates,
      totals: {
        flagged: s.totals.flagged,
        clocked: s.totals.clocked,
        flatPay: s.totals.flatPay,
        basePay: s.totals.basePay,
        efficiencyClock: s.totals.efficiencyClock,
      },
      archivedAt: new Date().toISOString(),
    };
    setPeriodHistory((prev) => [snapshot, ...prev].slice(0, 50));
  }

  // While auto-mode is on, keeps the pay period locked to the current
  // semi-monthly cycle (1st–15th / 16th–end of month) and rolls forward
  // automatically when a new period begins — archiving the closing
  // period's data first so nothing is lost.
  useEffect(() => {
    if (!periodAutoMode) return;
    const sync = () => {
      const current = computeCurrentPayPeriod();
      setPeriodRaw((prev) => {
        if (prev.start === current.start && prev.end === current.end) return prev;
        archiveCurrentPeriod(prev);
        setEntries([]);
        setPhysicalClocked("");
        setExtraHours({ sick: "", pto: "", training: "", other: "" });
        setGoal("");
        setDaysLeft("");
        return current;
      });
    };
    sync();
    const interval = setInterval(sync, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [periodAutoMode]);
  useEffect(() => { localStorage.setItem("hoursTracker.physicalClocked", physicalClocked); }, [physicalClocked]);
  useEffect(() => { localStorage.setItem("hoursTracker.extraHours", JSON.stringify(extraHours)); }, [extraHours]);
  useEffect(() => { localStorage.setItem("hoursTracker.goal", goal); }, [goal]);
  useEffect(() => { localStorage.setItem("hoursTracker.daysLeft", daysLeft); }, [daysLeft]);
  useEffect(() => { localStorage.setItem("hoursTracker.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("hoursTracker.hideDollarAmounts", JSON.stringify(hideDollarAmounts)); }, [hideDollarAmounts]);
  useEffect(() => { localStorage.setItem("hoursTracker.clockFormat", clockFormat); }, [clockFormat]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const haystack = [
        formatDateDisplay(e.date),
        e.date,
        e.type,
        e.description,
        String(e.actual),
        String(e.flagged),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, searchQuery]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => {
      let aVal, bVal;
      switch (sortConfig.key) {
        case "date": aVal = a.date; bVal = b.date; break;
        case "type": aVal = a.type; bVal = b.type; break;
        case "actual": aVal = toNum(a.actual); bVal = toNum(b.actual); break;
        case "flagged": aVal = toNum(a.flagged); bVal = toNum(b.flagged); break;
        default: aVal = a.date; bVal = b.date;
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredEntries, sortConfig]);

  function toggleSort(key) {
    setSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      return { key, direction: "desc" };
    });
  }

  function addEntry() {
    setEntries((prev) => [{
      id: Date.now(),
      date: form.date,
      type: form.type,
      flagged: toNum(form.flagged),
      actual: toNum(form.actual),
      description: form.description.trim() || "Manual entry",
    }, ...prev]);
    setForm((old) => ({ ...old, flagged: "", actual: "", description: "" }));
  }

  function deleteEntry(id) { setEntries((prev) => prev.filter((e) => e.id !== id)); }
  function clearAllEntries() { setEntries([]); }
  function exportPdf() { window.print(); }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditDraft({ ...entry, flagged: String(entry.flagged), actual: String(entry.actual) });
  }

  function saveEdit() {
    setEntries((prev) => prev.map((e) => e.id === editingId
      ? { ...e, date: editDraft.date, type: editDraft.type, flagged: toNum(editDraft.flagged), actual: toNum(editDraft.actual), description: editDraft.description }
      : e
    ));
    setEditingId(null);
    setEditDraft(null);
  }

  function cancelEdit() { setEditingId(null); setEditDraft(null); }

  function exportBackupJson() {
    const backup = { app: "Hours Tracker", version: 2, exportedAt: new Date().toISOString(), profile, period, rates, physicalClocked, extraHours, entries, goal, daysLeft, theme, hideDollarAmounts };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hours-tracker-backup-${todayIsoDate()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function importBackupJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result || "{}"));
        if (backup.profile) setProfile(backup.profile);
        if (backup.period) setPeriod(backup.period);
        if (backup.rates) setRates(backup.rates);
        if (typeof backup.physicalClocked !== "undefined") setPhysicalClocked(String(backup.physicalClocked ?? ""));
        if (backup.extraHours) setExtraHours(backup.extraHours);
        if (Array.isArray(backup.entries)) setEntries(backup.entries);
        if (typeof backup.goal !== "undefined") setGoal(String(backup.goal ?? ""));
        if (typeof backup.daysLeft !== "undefined") setDaysLeft(String(backup.daysLeft ?? ""));
        if (backup.theme) setTheme(backup.theme);
        if (typeof backup.hideDollarAmounts !== "undefined") setHideDollarAmounts(!!backup.hideDollarAmounts);
      } catch {
        alert("Could not import backup. Please make sure this is a valid Hours Tracker JSON file.");
      } finally { event.target.value = ""; }
    };
    reader.readAsText(file);
  }

  function manualArchiveAndReset() {
    archiveCurrentPeriod(period);
    setEntries([]);
    setPhysicalClocked("");
    setExtraHours({ sick: "", pto: "", training: "", other: "" });
    setGoal("");
    setDaysLeft("");
  }

  function deleteHistoryEntry(id) {
    setPeriodHistory((prev) => prev.filter((h) => h.id !== id));
  }

  function exportCsv() {
    const rows = [
      ["Date", "Pay Type", "Actual", "Flagged", "Description"],
      ...entries.map((e) => [e.date, e.type, e.actual, e.flagged, `"${String(e.description || "").replace(/"/g, '""')}"`]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hours-tracker.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const isDark = theme === "dark";
  const bgMain = isDark ? "bg-zinc-950" : "bg-gray-50";
  const textMain = isDark ? "text-zinc-100" : "text-gray-900";
  const cardBg = isDark ? "bg-zinc-900/70" : "bg-white";
  const cardBorder = isDark ? "border-zinc-800" : "border-gray-200";
  const subText = isDark ? "text-zinc-400" : "text-gray-500";
  const mutedText = isDark ? "text-zinc-500" : "text-gray-400";

  return (
    <div className={`min-h-screen ${bgMain} p-4 ${textMain} md:p-8 transition-colors duration-300`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <Header profile={profile} period={period} status={status} theme={theme} setTheme={setTheme}
          hideDollarAmounts={hideDollarAmounts} setHideDollarAmounts={setHideDollarAmounts}
          cardBorder={cardBorder} subText={subText} mutedText={mutedText}
          onOpenSettings={() => setShowProfileModal(true)}
          onOpenHistory={() => setShowHistoryModal(true)}
          historyCount={periodHistory.length}
          clockFormat={clockFormat} />

        <KpiGrid totals={totals} rates={rates} hideDollarAmounts={hideDollarAmounts} theme={theme} cardBorder={cardBorder} subText={subText} />

        <PerformanceOverview totals={totals} goal={goal} theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText} />

        <TechnicianInsights totals={totals} rates={rates} goal={goal} daysLeft={daysLeft} hideDollarAmounts={hideDollarAmounts} theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText} />

        <PhysicalClockSection
          physicalClocked={physicalClocked} setPhysicalClocked={setPhysicalClocked}
          extraHours={extraHours} setExtraHours={setExtraHours}
          totals={totals} rates={rates} hideDollarAmounts={hideDollarAmounts}
          theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText} mutedText={mutedText}
        />

        <ProfileSettingsModal
          open={showProfileModal} onClose={() => setShowProfileModal(false)}
          profile={profile} setProfile={setProfile}
          period={period} setPeriod={setPeriod}
          periodAutoMode={periodAutoMode} setPeriodAutoMode={setPeriodAutoMode}
          rates={rates} setRates={setRates}
          clockFormat={clockFormat} setClockFormat={setClockFormat}
          onArchiveAndReset={manualArchiveAndReset}
          theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText}
        />

        <PeriodHistoryModal
          open={showHistoryModal} onClose={() => setShowHistoryModal(false)}
          history={periodHistory} deleteHistoryEntry={deleteHistoryEntry}
          hideDollarAmounts={hideDollarAmounts}
          theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText}
        />

        <AddEntry
          form={form} setForm={setForm} addEntry={addEntry}
          exportCsv={exportCsv} exportPdf={exportPdf}
          exportBackupJson={exportBackupJson} importBackupJson={importBackupJson}
          clearAllEntries={clearAllEntries}
          theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText}
        />

        <section className="grid gap-4 lg:[grid-template-columns:5fr_2fr]">
          <EntriesPanel
            entries={sortedEntries} totalCount={entries.length} deleteEntry={deleteEntry}
            sortConfig={sortConfig} toggleSort={toggleSort}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            editingId={editingId} editDraft={editDraft} setEditDraft={setEditDraft}
            startEdit={startEdit} saveEdit={saveEdit} cancelEdit={cancelEdit}
            theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText}
          />
          <GoalPlanner goal={goal} setGoal={setGoal} daysLeft={daysLeft} setDaysLeft={setDaysLeft} totals={totals} rates={rates}
            hideDollarAmounts={hideDollarAmounts} theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText} />
        </section>

        <TestPanel showTests={showTests} setShowTests={setShowTests} rates={rates} totals={totals} goal={goal} daysLeft={daysLeft}
          hideDollarAmounts={hideDollarAmounts}
          theme={theme} cardBg={cardBg} cardBorder={cardBorder} subText={subText} />
      </div>
    </div>
  );
}

function Header({ profile, period, status, theme, setTheme, hideDollarAmounts, setHideDollarAmounts, cardBorder, subText, mutedText, onOpenSettings, onOpenHistory, historyCount, clockFormat }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hours Tracker</h1>
        <p className={subText}>
          Flagged vs actual vs physically clocked
          {profile.technician ? ` — ${profile.technician}` : ""}
          {profile.role ? `, ${profile.role}` : ""}
        </p>
        {profile.dealership && <p className={`mt-1 text-sm ${mutedText}`}>{profile.dealership}</p>}
        <p className={`mt-1 text-sm ${mutedText}`}>Period: {period.start ? formatDateDisplay(period.start) : "Not set"} to {period.end ? formatDateDisplay(period.end) : "Not set"}</p>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <LiveClock clockFormat={clockFormat} subText={subText} />
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenHistory}
            className={`relative flex items-center gap-2 rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80`}
            title="Pay period history"
          >
            <History className="h-4 w-4" />
            {historyCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                {historyCount}
              </span>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-2 rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80`}
            title="Profile & Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setHideDollarAmounts((p) => !p)}
            className={`flex items-center gap-2 rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80`}
            title={hideDollarAmounts ? "Show dollar amounts" : "Hide dollar amounts"}
          >
            {hideDollarAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className={`flex items-center gap-2 rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80`}
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${status.cls}`}>{status.label}</span>
        </div>
      </div>
    </header>
  );
}

function LiveClock({ clockFormat, subText }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const is24h = clockFormat === "24";
  let hours = now.getHours();
  const minutes = pad2(now.getMinutes());
  const seconds = pad2(now.getSeconds());
  let meridiem = "";

  if (is24h) {
    hours = pad2(hours);
  } else {
    meridiem = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    hours = String(hours);
  }

  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div>
      <div className="flex items-baseline gap-2 font-mono text-4xl font-black tabular-nums tracking-tight md:text-5xl">
        <span>{hours}:{minutes}:{seconds}</span>
        {!is24h && <span className="text-lg font-bold md:text-xl">{meridiem}</span>}
      </div>
      <div className={`mt-1 text-sm ${subText}`}>{dateLabel}</div>
    </div>
  );
}

function KpiGrid({ totals, rates, hideDollarAmounts, theme, cardBorder, subText }) {
  const accentMap = theme === "dark"
    ? { blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/20", green: "from-green-500/20 to-emerald-500/5 border-green-500/20", yellow: "from-yellow-500/20 to-orange-500/5 border-yellow-500/20", purple: "from-purple-500/20 to-fuchsia-500/5 border-purple-500/20" }
    : { blue: "from-blue-100 to-cyan-50 border-blue-200", green: "from-green-100 to-emerald-50 border-green-200", yellow: "from-yellow-100 to-orange-50 border-yellow-200", purple: "from-purple-100 to-fuchsia-50 border-purple-200" };

  const Metric = ({ icon: Icon, title, value, sub, accent = "blue" }) => (
    <div className={`rounded-2xl border bg-gradient-to-br ${accentMap[accent]} p-4 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm ${subText}`}>{title}</div>
          <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
        </div>
        {Icon && <div className={`rounded-xl border ${cardBorder} bg-white/5 p-2`}><Icon className="h-5 w-5 opacity-80" /></div>}
      </div>
      <div className={`mt-3 text-xs ${subText}`}>{sub}</div>
    </div>
  );

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Wrench} accent="green" title="Flagged / sold" value={`${totals.flagged.toFixed(2)} hrs`} sub="Production credited" />
      <Metric icon={Clock3} accent="blue" title="Physically clocked" value={`${totals.clocked.toFixed(2)} hrs`} sub="Entered separately from RO lines" />
      <Metric title="Efficiency vs clock" value={`${Number.isFinite(totals.efficiencyClock) ? totals.efficiencyClock.toFixed(1) : "0.0"}%`} sub="Sold ÷ physically clocked" />
      <Metric title="Efficiency vs RO actual" value={`${Number.isFinite(totals.efficiencyActual) ? totals.efficiencyActual.toFixed(1) : "0.0"}%`} sub="Sold ÷ actual" />
      <Metric icon={DollarSign} accent="green" title="Flat pay" value={money(totals.flatPay, hideDollarAmounts)} sub={hideDollarAmounts ? "Production + other paid hrs" : `Production + other paid hrs @ $${toNum(rates.flat)}/hr`} />
      <Metric icon={DollarSign} accent="yellow" title="Base pay" value={money(totals.basePay, hideDollarAmounts)} sub={hideDollarAmounts ? "Rate × clocked" : `$${toNum(rates.regular)}/hr × clocked`} />
      <Metric title="Break-even cushion" value={`${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`} sub={`Need ${totals.breakEvenFlagged.toFixed(2)} flagged`} />
      <Metric icon={Trophy} accent="purple" title="Avg flagged/day" value={`${totals.avgFlaggedDay.toFixed(2)} hrs`} sub="Excluding paid-only count" />
    </section>
  );
}

function PhysicalClockSection({ physicalClocked, setPhysicalClocked, extraHours, setExtraHours, totals, rates, hideDollarAmounts, theme, cardBg, cardBorder, subText, mutedText }) {
  const innerBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  return (
    <section className={`rounded-2xl border ${cardBorder} ${cardBg} p-4 shadow-xl md:p-6`}>
      <h2 className="mb-4 text-lg font-semibold">Physical Clock Time & Other Paid Hours</h2>
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="Physically clocked hours" value={physicalClocked} onChange={setPhysicalClocked} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Sick time off" value={extraHours.sick} onChange={(v) => setExtraHours({ ...extraHours, sick: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Paid time off" value={extraHours.pto} onChange={(v) => setExtraHours({ ...extraHours, pto: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Training hours" value={extraHours.training} onChange={(v) => setExtraHours({ ...extraHours, training: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Other paid hours" value={extraHours.other} onChange={(v) => setExtraHours({ ...extraHours, other: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl border ${cardBorder} ${innerBg} p-3`}>
          <div className={`text-xs ${mutedText}`}>Other paid hours total</div>
          <div className="mt-1 text-xl font-bold">{totals.extraPaidHours.toFixed(2)} hrs</div>
        </div>
        <div className={`rounded-xl border ${cardBorder} ${innerBg} p-3`}>
          <div className={`text-xs ${mutedText}`}>Rate used</div>
          <div className="mt-1 text-xl font-bold">{hideDollarAmounts ? "•••••" : `$${toNum(rates.flat).toFixed(2)}/hr`}</div>
        </div>
        <div className={`rounded-xl border ${cardBorder} ${innerBg} p-3`}>
          <div className={`text-xs ${mutedText}`}>Other paid amount</div>
          <div className="mt-1 text-xl font-bold">{money(totals.extraPaidPay, hideDollarAmounts)}</div>
        </div>
      </div>
      <p className={`mt-3 text-sm ${subText}`}>Enter your physical worked hours separately from RO entries. Sick time, PTO, training, and other paid hours are calculated using the flat rate entered in settings.</p>
    </section>
  );
}

function ProfileSettingsModal({ open, onClose, profile, setProfile, period, setPeriod, periodAutoMode, setPeriodAutoMode, rates, setRates, clockFormat, setClockFormat, onArchiveAndReset, theme, cardBg, cardBorder, subText }) {
  if (!open) return null;
  const overlayBg = theme === "dark" ? "bg-black/70" : "bg-black/40";
  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${overlayBg} p-4`}
      style={{ WebkitOverflowScrolling: "touch" }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center py-8 sm:items-center sm:py-4">
        <div
          className={`w-full max-w-2xl rounded-2xl border ${cardBorder} ${cardBg} p-5 shadow-2xl md:p-6`}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Profile & Settings</h2>
          <button onClick={onClose} className={`rounded-xl border ${cardBorder} p-2 hover:opacity-80`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Technician name" value={profile.technician} onChange={(v) => setProfile({ ...profile, technician: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Dealership / shop" value={profile.dealership} onChange={(v) => setProfile({ ...profile, dealership: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Role / title" value={profile.role} onChange={(v) => setProfile({ ...profile, role: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Field label="Period start" type="date" value={period.start} onChange={(v) => setPeriod({ ...period, start: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Period end" type="date" value={period.end} onChange={(v) => setPeriod({ ...period, end: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Base rate" value={rates.regular} onChange={(v) => setRates({ ...rates, regular: toNum(v) })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Flat rate" value={rates.flat} onChange={(v) => setRates({ ...rates, flat: toNum(v) })} theme={theme} cardBorder={cardBorder} subText={subText} />
            <Field label="Training rate" value={rates.training} onChange={(v) => setRates({ ...rates, training: toNum(v) })} theme={theme} cardBorder={cardBorder} subText={subText} />
          </div>

          <div className={`flex items-center justify-between rounded-xl border ${cardBorder} p-3`}>
            <div>
              <div className="text-sm font-semibold">Auto-update pay period</div>
              <div className={`text-xs ${subText}`}>
                {periodAutoMode
                  ? "On — period switches automatically between the 1st–15th and 16th–end of month."
                  : "Off — period dates above were set manually and won't change on their own."}
              </div>
            </div>
            <button
              onClick={() => setPeriodAutoMode((p) => !p)}
              className={`rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80 whitespace-nowrap`}
            >
              {periodAutoMode ? "Turn off" : "Turn on"}
            </button>
          </div>

          <div className={`flex items-center justify-between rounded-xl border ${cardBorder} p-3`}>
            <div>
              <div className="text-sm font-semibold">Clock format</div>
              <div className={`text-xs ${subText}`}>Choose how the time displays at the top of the page.</div>
            </div>
            <div className={`flex items-center rounded-xl border ${cardBorder} p-1`}>
              <button
                onClick={() => setClockFormat("12")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  clockFormat === "12"
                    ? (theme === "dark" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-white")
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                12h
              </button>
              <button
                onClick={() => setClockFormat("24")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  clockFormat === "24"
                    ? (theme === "dark" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-white")
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                24h
              </button>
            </div>
          </div>

          <div className={`flex items-center justify-between rounded-xl border ${cardBorder} p-3`}>
            <div>
              <div className="text-sm font-semibold">Save period & start fresh</div>
              <div className={`text-xs ${subText}`}>Archives the current entries to history, then clears this period so you can start a new one early.</div>
            </div>
            <button
              onClick={() => {
                if (window.confirm("Save the current period to history and clear entries for a new period?")) {
                  onArchiveAndReset();
                }
              }}
              className={`rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80 whitespace-nowrap`}
            >
              Archive & Reset
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className={`rounded-xl px-4 py-2 font-semibold hover:opacity-90 ${theme === "dark" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-white"}`}>
            Done
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

function PeriodHistoryModal({ open, onClose, history, deleteHistoryEntry, hideDollarAmounts, theme, cardBg, cardBorder, subText }) {
  if (!open) return null;
  const overlayBg = theme === "dark" ? "bg-black/70" : "bg-black/40";
  const innerBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${overlayBg} p-4`}
      style={{ WebkitOverflowScrolling: "touch" }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center py-8 sm:items-center sm:py-4">
        <div
          className={`w-full max-w-2xl rounded-2xl border ${cardBorder} ${cardBg} p-5 shadow-2xl md:p-6`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pay Period History</h2>
            <button onClick={onClose} className={`rounded-xl border ${cardBorder} p-2 hover:opacity-80`}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {history.length === 0 ? (
            <div className={`rounded-xl border ${cardBorder} ${innerBg} p-8 text-center text-sm ${subText}`}>
              No archived periods yet. When the pay period rolls over (or you archive manually in Settings), past periods show up here.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {history.map((h) => (
                <div key={h.id} className={`rounded-xl border ${cardBorder} ${innerBg} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {formatDateDisplay(h.period.start)} – {formatDateDisplay(h.period.end)}
                      </div>
                      <div className={`text-xs ${subText}`}>{h.entries.length} entries · archived {formatDateDisplay(h.archivedAt.slice(0, 10))}</div>
                    </div>
                    <button
                      onClick={() => { if (window.confirm("Delete this archived period? This can't be undone.")) deleteHistoryEntry(h.id); }}
                      className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <HistoryStat label="Flagged" value={`${h.totals.flagged.toFixed(2)} hrs`} subText={subText} />
                    <HistoryStat label="Clocked" value={`${h.totals.clocked.toFixed(2)} hrs`} subText={subText} />
                    <HistoryStat label="Efficiency" value={Number.isFinite(h.totals.efficiencyClock) ? `${h.totals.efficiencyClock.toFixed(1)}%` : "—"} subText={subText} />
                    <HistoryStat label="Total pay" value={money(h.totals.flatPay + h.totals.basePay, hideDollarAmounts)} subText={subText} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button onClick={onClose} className={`rounded-xl px-4 py-2 font-semibold hover:opacity-90 ${theme === "dark" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-white"}`}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryStat({ label, value, subText }) {
  return (
    <div>
      <div className={`text-[11px] ${subText}`}>{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function AddEntry({ form, setForm, addEntry, exportCsv, exportPdf, exportBackupJson, importBackupJson, clearAllEntries, theme, cardBg, cardBorder, subText }) {
  const inputBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  return (
    <section className={`rounded-2xl border ${cardBorder} ${cardBg} p-4 shadow-xl md:p-6`}>
      <h2 className="mb-4 text-lg font-semibold">Add entry</h2>
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <label className="space-y-1">
          <span className={`block text-sm ${subText}`}>Type</span>
          <select className={`h-10 w-full rounded-lg border ${cardBorder} ${inputBg} px-3 outline-none focus:border-zinc-400 [color-scheme:${theme}]`}
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="CP">Customer Pay (CP)</option>
            <option value="CUSW">Customer Warranty (CUSW)</option>
            <option value="WP">Warranty Pay (WP)</option>
            <option value="OTHER">Other / Misc</option>
          </select>
        </label>
        {/* Actual now appears before Flagged, per request */}
        <Field label="Actual" value={form.actual} onChange={(v) => setForm({ ...form, actual: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Flagged" value={form.flagged} onChange={(v) => setForm({ ...form, flagged: v })} theme={theme} cardBorder={cardBorder} subText={subText} />
        <label className="space-y-1 md:col-span-6">
          <span className={`block text-sm ${subText}`}>Description / RO</span>
          <input className={`h-10 w-full rounded-lg border ${cardBorder} ${inputBg} px-3 outline-none focus:border-zinc-400`}
            placeholder="RO 251497 — diag, MPI, LOF ROT, notes..."
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={addEntry} className={`rounded-xl px-4 py-2 font-semibold hover:opacity-90 ${theme === "dark" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-white"}`}>+ Add entry</button>
        <button onClick={exportCsv} className={`rounded-xl border ${cardBorder} px-4 py-2 font-semibold hover:opacity-80`}>Export CSV</button>
        <button onClick={exportPdf} className={`rounded-xl border ${cardBorder} px-4 py-2 font-semibold hover:opacity-80`}>Save / Print PDF</button>
        <button onClick={exportBackupJson} className={`rounded-xl border ${cardBorder} px-4 py-2 font-semibold hover:opacity-80`}>Export Backup</button>
        <label className={`cursor-pointer rounded-xl border ${cardBorder} px-4 py-2 font-semibold hover:opacity-80`}>
          Import Backup
          <input type="file" accept="application/json,.json" className="hidden" onChange={importBackupJson} />
        </label>
        <button onClick={clearAllEntries} className={`rounded-xl border ${cardBorder} px-4 py-2 font-semibold hover:opacity-80`}>Clear all</button>
      </div>
    </section>
  );
}

function SortHeader({ label, sortKey, sortConfig, toggleSort, align = "left" }) {
  const active = sortConfig.key === sortKey;
  return (
    <th className={`p-3 text-${align} cursor-pointer select-none`} onClick={() => toggleSort(sortKey)}>
      <span className={`inline-flex items-center gap-1 ${active ? "opacity-100" : "opacity-60"}`}>
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {active && <span className="text-[10px]">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function EntriesPanel({ entries, totalCount, deleteEntry, sortConfig, toggleSort, searchQuery, setSearchQuery, editingId, editDraft, setEditDraft, startEdit, saveEdit, cancelEdit, theme, cardBg, cardBorder, subText }) {
  const headerBg = theme === "dark" ? "bg-zinc-900" : "bg-gray-50";
  const hoverBg = theme === "dark" ? "hover:bg-zinc-800/50" : "hover:bg-gray-50";
  const inputBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  const innerCardBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  const isFiltered = searchQuery.trim().length > 0;

  return (
    <div className={`overflow-hidden rounded-2xl border ${cardBorder} ${cardBg} flex flex-col min-h-[520px] min-w-0`}>
      <div className={`flex flex-col gap-3 border-b ${cardBorder} p-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <h2 className="text-lg font-semibold">Entries</h2>
          <span className={`text-sm ${subText}`}>
            {isFiltered ? `${entries.length} of ${totalCount}` : `${totalCount} items`}
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${subText}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search date, type, RO, notes..."
            className={`h-10 w-full rounded-lg border ${cardBorder} ${inputBg} pl-9 pr-8 text-sm outline-none focus:border-zinc-400`}
          />
          {isFiltered && (
            <button
              onClick={() => setSearchQuery("")}
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-60 hover:opacity-100`}
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className={`${headerBg} ${subText}`}>
            <tr>
              <SortHeader label="Date" sortKey="date" sortConfig={sortConfig} toggleSort={toggleSort} />
              <SortHeader label="Pay Type" sortKey="type" sortConfig={sortConfig} toggleSort={toggleSort} />
              <SortHeader label="Actual" sortKey="actual" sortConfig={sortConfig} toggleSort={toggleSort} align="right" />
              <SortHeader label="Flagged" sortKey="flagged" sortConfig={sortConfig} toggleSort={toggleSort} align="right" />
              <th className="p-3 text-left">Description</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className={`p-16 text-center ${subText}`}>{isFiltered ? "No entries match your search." : "No entries yet — start fresh above."}</td></tr>
            ) : entries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <tr key={entry.id} className={`border-t ${cardBorder} ${hoverBg}`}>
                  {isEditing ? (
                    <>
                      <td className="p-2">
                        <input type="date" className={`h-9 w-full rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                          value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <select className={`h-9 w-full rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                          value={editDraft.type} onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value })}>
                          <option value="CP">CP</option>
                          <option value="CUSW">CUSW</option>
                          <option value="WP">WP</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input inputMode="decimal" className={`h-9 w-20 rounded-lg border ${cardBorder} ${inputBg} px-2 text-right outline-none`}
                          value={editDraft.actual} onChange={(e) => setEditDraft({ ...editDraft, actual: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <input inputMode="decimal" className={`h-9 w-20 rounded-lg border ${cardBorder} ${inputBg} px-2 text-right outline-none`}
                          value={editDraft.flagged} onChange={(e) => setEditDraft({ ...editDraft, flagged: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <input className={`h-9 w-full rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                          value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={saveEdit} className="rounded-lg p-1.5 text-green-500 hover:bg-green-500/10"><Check className="h-4 w-4" /></button>
                          <button onClick={cancelEdit} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"><X className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap p-3">{formatDateDisplay(entry.date)}</td>
                      <td className="p-3"><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${typeClass(entry.type, theme)}`}>{entry.type}</span></td>
                      <td className="p-3 text-right">{toNum(entry.actual).toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold">{toNum(entry.flagged).toFixed(2)}</td>
                      <td className={`min-w-64 p-3 ${subText}`}>{entry.description}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEdit(entry)} className="rounded-lg p-1.5 opacity-70 hover:opacity-100"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deleteEntry(entry.id)} className="rounded-lg px-2 py-1 text-sm opacity-70 hover:opacity-100">Delete</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 p-4 md:hidden">
        {entries.length === 0 ? (
          <div className={`rounded-2xl border ${cardBorder} ${innerCardBg} p-6 text-center ${subText}`}>{isFiltered ? "No entries match your search." : "No entries yet — start fresh above."}</div>
        ) : entries.map((entry) => {
          const isEditing = editingId === entry.id;
          return (
            <div key={entry.id} className={`rounded-2xl border ${cardBorder} ${innerCardBg} p-4 shadow-sm`}>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={`h-9 rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                      value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                    <select className={`h-9 rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                      value={editDraft.type} onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value })}>
                      <option value="CP">CP</option>
                      <option value="CUSW">CUSW</option>
                      <option value="WP">WP</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input inputMode="decimal" placeholder="Actual" className={`h-9 rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                      value={editDraft.actual} onChange={(e) => setEditDraft({ ...editDraft, actual: e.target.value })} />
                    <input inputMode="decimal" placeholder="Flagged" className={`h-9 rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                      value={editDraft.flagged} onChange={(e) => setEditDraft({ ...editDraft, flagged: e.target.value })} />
                  </div>
                  <input className={`h-9 w-full rounded-lg border ${cardBorder} ${inputBg} px-2 outline-none`}
                    value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white">Save</button>
                    <button onClick={cancelEdit} className={`flex-1 rounded-lg border ${cardBorder} py-2 text-sm font-semibold`}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{formatDateDisplay(entry.date)}</div>
                      <div className="mt-1"><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${typeClass(entry.type, theme)}`}>{entry.type}</span></div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(entry)} className="rounded-lg p-1.5 opacity-70 hover:opacity-100"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteEntry(entry.id)} className="rounded-lg px-2 py-1 text-sm opacity-70 hover:opacity-100">Delete</button>
                    </div>
                  </div>
                  <div className={`grid grid-cols-2 gap-2 rounded-xl ${theme === "dark" ? "bg-zinc-900" : "bg-white"} p-3 text-center`}>
                    <div><div className={`text-xs ${subText}`}>Actual</div><div className="text-base font-bold">{toNum(entry.actual).toFixed(2)}</div></div>
                    <div><div className={`text-xs ${subText}`}>Flagged</div><div className="text-base font-bold">{toNum(entry.flagged).toFixed(2)}</div></div>
                  </div>
                  <div className={`mt-3 text-sm ${subText}`}>{entry.description}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalPlanner({ goal, setGoal, daysLeft, setDaysLeft, totals, rates, hideDollarAmounts, theme, cardBg, cardBorder, subText }) {
  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const ratio = flatRate > 0 ? regularRate / flatRate : 0;
  const innerBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  return (
    <div className={`rounded-2xl border ${cardBorder} ${cardBg} p-4 md:p-6`}>
      <h2 className="mb-4 text-lg font-semibold">Goal planner</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal flagged" value={goal} onChange={setGoal} theme={theme} cardBorder={cardBorder} subText={subText} />
        <Field label="Days left" value={daysLeft} onChange={setDaysLeft} theme={theme} cardBorder={cardBorder} subText={subText} />
      </div>
      <div className={`mt-4 space-y-3 rounded-2xl border ${cardBorder} ${innerBg} p-4`}>
        {[
          { label: "Remaining to goal", value: goal ? `${totals.remainingToGoal.toFixed(2)} hrs` : "Enter goal" },
          { label: "Needed per day", value: goal && daysLeft ? `${totals.neededPerDay.toFixed(2)} hrs/day` : "Enter goal + days" },
          { label: "Break-even minimum", value: totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} flagged` : "Enter clocked hrs" },
        ].map(({ label, value }) => (
          <div key={label} className={`flex items-center justify-between gap-4 border-b ${cardBorder} pb-2 last:border-b-0 last:pb-0`}>
            <span className={subText}>{label}</span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>
      <div className={`mt-4 space-y-2 text-sm ${subText}`}>
        <p><strong>Rule:</strong> Break-even is {(ratio * 100).toFixed(1)}%{hideDollarAmounts ? "." : ` because $${regularRate} ÷ $${flatRate} = ${ratio.toFixed(2)}.`}</p>
        <p><strong>Best metric:</strong> Sold ÷ physically clocked.</p>
      </div>
    </div>
  );
}

function TestPanel({ showTests, setShowTests, rates, totals, goal, daysLeft, hideDollarAmounts, theme, cardBg, cardBorder, subText }) {
  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const trainingRate = toNum(rates.training);
  const ratio = flatRate > 0 ? regularRate / flatRate : 0;
  const innerBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  const checks = [
    { name: "Break-even ratio from your rates", expected: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter rates", actual: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter base and flat rate", passed: flatRate > 0 && regularRate >= 0 },
    { name: "Current efficiency vs physically clocked", expected: "Calculated from entries", actual: Number.isFinite(totals.efficiencyClock) ? `${totals.efficiencyClock.toFixed(1)}%` : "Enter physical clock time", passed: Number.isFinite(totals.efficiencyClock) },
    { name: "Needed per day to goal", expected: goal && daysLeft ? `Goal ${toNum(goal).toFixed(2)} hrs over ${toNum(daysLeft)} days` : "Enter goal + days", actual: goal && daysLeft ? `${totals.neededPerDay.toFixed(2)} hrs/day` : "Waiting for input", passed: toNum(daysLeft) > 0 && toNum(goal) > 0 },
    { name: "Training rate check", expected: "Optional rate", actual: trainingRate > 0 ? (hideDollarAmounts ? "•••••" : `$${trainingRate.toFixed(2)}/hr`) : "Not set", passed: true },
  ];
  return (
    <section className={`rounded-2xl border ${cardBorder} ${cardBg} p-4 md:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Calculation checks</h2>
        <button onClick={() => setShowTests((p) => !p)} className={`rounded-xl border ${cardBorder} px-3 py-2 text-sm font-semibold hover:opacity-80`}>
          {showTests ? "Hide" : "Show"}
        </button>
      </div>
      {showTests && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {checks.map((test) => (
            <div key={test.name} className={`rounded-xl border ${cardBorder} ${innerBg} p-4`}>
              <div className="text-sm font-semibold">{test.name}</div>
              <div className={`mt-2 text-xs ${subText}`}>Expected: {test.expected}</div>
              <div className={`text-xs ${subText}`}>Actual: {test.actual}</div>
              <div className={`mt-2 text-sm font-semibold ${test.passed ? "text-green-500" : "text-yellow-500"}`}>{test.passed ? "Ready" : "Needs input"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TechnicianInsights({ totals, rates, goal, daysLeft, hideDollarAmounts, theme, cardBg, cardBorder, subText }) {
  const flatRate = toNum(rates.flat);
  const regularRate = toNum(rates.regular);
  const payDifference = totals.flatPay - totals.basePay;
  const target = toNum(goal);
  const remainingDays = toNum(daysLeft);
  const projectedFinish = remainingDays > 0 ? totals.flagged + totals.avgFlaggedDay * remainingDays : totals.flagged;
  const neededForGoal = target > 0 && remainingDays > 0 ? totals.neededPerDay : 0;
  const efficiencyLabel = !Number.isFinite(totals.efficiencyClock) ? "No clock data yet"
    : totals.efficiencyClock >= 130 ? "Elite"
    : totals.efficiencyClock >= 115 ? "Very strong"
    : totals.efficiencyClock >= 100 ? "Strong"
    : totals.efficiencyClock >= 75 ? "Safe"
    : "Below break-even";

  const toneMap = theme === "dark"
    ? { green: "border-green-500/20 bg-green-500/10", red: "border-red-500/20 bg-red-500/10", yellow: "border-yellow-500/20 bg-yellow-500/10", purple: "border-purple-500/20 bg-purple-500/10", blue: "border-blue-500/20 bg-blue-500/10" }
    : { green: "border-green-200 bg-green-50", red: "border-red-200 bg-red-50", yellow: "border-yellow-200 bg-yellow-50", purple: "border-purple-200 bg-purple-50", blue: "border-blue-200 bg-blue-50" };

  const insightCards = [
    { title: "Pay position", value: hideDollarAmounts ? "•••••" : (payDifference >= 0 ? `+${money(payDifference, false)}` : `-${money(Math.abs(payDifference), false)}`), detail: payDifference >= 0 ? "Flat/bonus pay is currently ahead of base pay." : "Base pay is currently ahead of flat/bonus pay.", tone: payDifference >= 0 ? "green" : "red" },
    { title: "Break-even cushion", value: `${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`, detail: totals.cushion >= 0 ? "You have room before falling back to base-pay pace." : "You need more flagged hours to beat base-pay pace.", tone: totals.cushion >= 0 ? "green" : "yellow" },
    { title: "Efficiency status", value: efficiencyLabel, detail: Number.isFinite(totals.efficiencyClock) ? `${totals.efficiencyClock.toFixed(1)}% vs physically clocked time.` : "Enter physically clocked hours to calculate this.", tone: totals.efficiencyClock >= 115 ? "purple" : totals.efficiencyClock >= 75 ? "green" : "yellow" },
    { title: "Projected finish", value: `${projectedFinish.toFixed(2)} hrs`, detail: remainingDays > 0 ? "Projection based on your current average flagged per entry/day." : "Enter days left to improve this projection.", tone: "blue" },
  ];

  return (
    <section className={`rounded-2xl border ${cardBorder} ${cardBg} p-4 shadow-xl md:p-6`}>
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Technician Insights</h2>
        <p className={`text-sm ${subText}`}>Automatic interpretation of your pay-period numbers.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {insightCards.map((card) => (
          <div key={card.title} className={`rounded-2xl border p-4 ${toneMap[card.tone] || toneMap.blue}`}>
            <div className={`text-sm ${subText}`}>{card.title}</div>
            <div className="mt-1 text-2xl font-black">{card.value}</div>
            <div className={`mt-2 text-xs ${subText}`}>{card.detail}</div>
          </div>
        ))}
      </div>
      <div className={`mt-4 rounded-2xl border ${cardBorder} ${theme === "dark" ? "bg-zinc-950" : "bg-gray-50"} p-4`}>
        <h3 className="mb-3 font-semibold">Quick read</h3>
        <div className={`space-y-2 text-sm ${subText}`}>
          <p>{flatRate > 0 && regularRate > 0 ? `Your break-even point is ${(totals.breakEvenRatio * 100).toFixed(1)}%, meaning you need ${totals.breakEvenFlagged.toFixed(2)} flagged hours for your current physically clocked time.` : "Enter base and flat rates to calculate your true break-even point."}</p>
          <p>{target > 0 && remainingDays > 0 ? `To reach ${target.toFixed(2)} flagged hours, you need ${neededForGoal.toFixed(2)} flagged hours per remaining day.` : "Enter a goal and days left to unlock target pacing guidance."}</p>
          <p>{totals.efficiencyActual > 0 ? `Your RO efficiency is ${totals.efficiencyActual.toFixed(1)}%, which shows how your sold time compares to actual RO time.` : "Enter actual RO hours to compare sold time against actual job time."}</p>
        </div>
      </div>
    </section>
  );
}

function PerformanceOverview({ totals, goal, theme, cardBg, cardBorder, subText }) {
  const goalValue = toNum(goal);
  const goalPercent = goalValue > 0 ? Math.min((totals.flagged / goalValue) * 100, 100) : 0;
  const breakEvenPercent = totals.clocked > 0 ? Math.min((totals.flagged / Math.max(totals.breakEvenFlagged, 1)) * 100, 100) : 0;
  const barBg = theme === "dark" ? "bg-zinc-800" : "bg-gray-200";
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {[
        { title: "Goal progress", icon: Target, value: `${goalPercent.toFixed(1)}%`, sub: goalValue > 0 ? `${totals.flagged.toFixed(2)} / ${goalValue.toFixed(2)} hrs` : "Set a goal to track progress", progress: goalPercent, accent: "green" },
        { title: "Break-even status", icon: Gauge, value: `${breakEvenPercent.toFixed(1)}%`, sub: totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} hrs needed to break even` : "Enter physically clocked hours", progress: breakEvenPercent, accent: breakEvenPercent >= 100 ? "purple" : "yellow" },
      ].map(({ title, icon: Icon, value, sub, progress, accent }) => {
        const barClass = { green: "bg-green-500", yellow: "bg-yellow-500", purple: "bg-purple-500" };
        return (
          <div key={title} className={`rounded-2xl border ${cardBorder} ${cardBg} p-5 shadow-xl`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-sm ${subText}`}>{title}</div>
                <div className="mt-1 text-3xl font-black">{value}</div>
              </div>
              <div className={`rounded-xl border ${cardBorder} p-2`}><Icon className="h-5 w-5 opacity-80" /></div>
            </div>
            <div className={`mt-4 h-3 overflow-hidden rounded-full ${barBg}`}>
              <div className={`h-full rounded-full transition-all duration-500 ${barClass[accent]}`} style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
            </div>
            <div className={`mt-3 text-sm ${subText}`}>{sub}</div>
          </div>
        );
      })}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", theme, cardBorder, subText }) {
  const isNumericField = ["rate", "flagged", "actual", "clocked", "goal", "days", "sick", "pto", "training", "other"].some((k) => label.toLowerCase().includes(k));
  const inputBg = theme === "dark" ? "bg-zinc-950" : "bg-gray-50";
  return (
    <label className="space-y-1">
      <span className={`block text-sm ${subText}`}>{label}</span>
      <input
        type={type}
        inputMode={type === "date" ? undefined : isNumericField ? "decimal" : "text"}
        className={`h-10 w-full rounded-lg border ${cardBorder} ${inputBg} px-3 outline-none focus:border-zinc-400 [color-scheme:${theme}]`}
        placeholder={type === "date" ? undefined : isNumericField ? "0.00" : "Enter text..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

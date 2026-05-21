import React, { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, DollarSign, Gauge, Settings2, Target, TrendingUp, Trophy, Wrench } from "lucide-react";

const DEFAULT_PAY = { regular: "", flat: "", training: "" };
const EMPTY_PROFILE = { technician: "", dealership: "", role: "" };
const EMPTY_EXTRA_HOURS = { sick: "", pto: "", training: "", other: "" };

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function loadJson(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadString(key, fallback = "") {
  if (!isBrowser()) return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function saveJson(key, value) {
  if (isBrowser()) window.localStorage.setItem(key, JSON.stringify(value));
}

function saveString(key, value) {
  if (isBrowser()) window.localStorage.setItem(key, String(value ?? ""));
}

function toNum(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return toNum(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(dateString) {
  if (!dateString) return "";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const flagged = safeEntries.reduce((sum, entry) => sum + toNum(entry.flagged), 0);
  const actual = safeEntries.reduce((sum, entry) => sum + toNum(entry.actual), 0);
  const clocked = toNum(physicalClocked);
  const extraPaidHours = toNum(extraHours?.sick) + toNum(extraHours?.pto) + toNum(extraHours?.training) + toNum(extraHours?.other);
  const regularRate = toNum(rates?.regular);
  const flatRate = toNum(rates?.flat);
  const breakEvenRatio = flatRate > 0 ? regularRate / flatRate : 0;
  const productionFlatPay = flagged * flatRate;
  const extraPaidPay = extraPaidHours * flatRate;
  const flatPay = productionFlatPay + extraPaidPay;
  const basePay = clocked * regularRate;
  const breakEvenFlagged = clocked * breakEvenRatio;
  const cushion = flagged - breakEvenFlagged;
  const efficiencyClock = clocked > 0 ? (flagged / clocked) * 100 : NaN;
  const efficiencyActual = actual > 0 ? (flagged / actual) * 100 : NaN;
  const avgFlaggedDay = flagged / Math.max(1, safeEntries.length);
  const remainingToGoal = Math.max(0, toNum(goal) - flagged);
  const neededPerDay = toNum(daysLeft) > 0 ? remainingToGoal / toNum(daysLeft) : 0;
  return { flagged, actual, clocked, extraPaidHours, productionFlatPay, extraPaidPay, flatPay, basePay, breakEvenRatio, breakEvenFlagged, cushion, efficiencyClock, efficiencyActual, avgFlaggedDay, remainingToGoal, neededPerDay };
}

function statusForEfficiency(efficiency) {
  if (!Number.isFinite(efficiency)) return { label: "No data", cls: "bg-zinc-700 text-zinc-100" };
  if (efficiency < 75) return { label: "Below break-even", cls: "bg-red-900 text-red-100" };
  if (efficiency < 95) return { label: "Safe", cls: "bg-yellow-800 text-yellow-100" };
  if (efficiency < 115) return { label: "Strong", cls: "bg-green-800 text-green-100" };
  return { label: "Elite", cls: "bg-purple-800 text-purple-100" };
}

function typeClass(type) {
  if (type === "CP") return "bg-green-900 text-green-100";
  if (type === "CUSW") return "bg-blue-900 text-blue-100";
  if (type === "WP") return "bg-purple-900 text-purple-100";
  return "bg-zinc-700 text-zinc-100";
}

function calculationChecks(rates, totals, goal, daysLeft) {
  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const trainingRate = toNum(rates.training);
  const ratio = flatRate > 0 ? regularRate / flatRate : 0;
  return [
    { name: "Break-even ratio from your rates", expected: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter rates", actual: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter base and flat rate", passed: flatRate > 0 && regularRate >= 0 },
    { name: "Current efficiency vs physically clocked", expected: "Calculated from current totals", actual: Number.isFinite(totals.efficiencyClock) ? `${totals.efficiencyClock.toFixed(1)}%` : "Enter physical clock time", passed: Number.isFinite(totals.efficiencyClock) },
    { name: "Needed per day to goal", expected: goal && daysLeft ? `Goal ${toNum(goal).toFixed(2)} hrs over ${toNum(daysLeft)} days` : "Enter goal + days", actual: goal && daysLeft ? `${totals.neededPerDay.toFixed(2)} hrs/day` : "Waiting for input", passed: toNum(daysLeft) > 0 && toNum(goal) > 0 },
    { name: "Training rate check", expected: "Optional rate", actual: trainingRate > 0 ? `$${trainingRate.toFixed(2)}/hr` : "Not set", passed: true },
  ];
}

export default function HoursTracker() {
  const [entries, setEntries] = useState(() => loadJson("hoursTracker.entries", []));
  const [rates, setRates] = useState(() => loadJson("hoursTracker.rates", DEFAULT_PAY));
  const [profile, setProfile] = useState(() => loadJson("hoursTracker.profile", EMPTY_PROFILE));
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(() => loadString("hoursTracker.theme", "dark"));
  const [showTests, setShowTests] = useState(false);
  const [period, setPeriod] = useState(() => loadJson("hoursTracker.period", { start: todayIsoDate(), end: todayIsoDate() }));
  const [physicalClocked, setPhysicalClocked] = useState(() => loadString("hoursTracker.physicalClocked", ""));
  const [extraHours, setExtraHours] = useState(() => loadJson("hoursTracker.extraHours", EMPTY_EXTRA_HOURS));
  const [goal, setGoal] = useState(() => loadString("hoursTracker.goal", ""));
  const [daysLeft, setDaysLeft] = useState(() => loadString("hoursTracker.daysLeft", ""));
  const [form, setForm] = useState({ date: todayIsoDate(), type: "CP", flagged: "", actual: "", description: "" });

  const totals = useMemo(() => calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours), [entries, rates, goal, daysLeft, physicalClocked, extraHours]);
  const status = statusForEfficiency(totals.efficiencyClock);

  useEffect(() => saveJson("hoursTracker.entries", entries), [entries]);
  useEffect(() => saveJson("hoursTracker.rates", rates), [rates]);
  useEffect(() => saveJson("hoursTracker.profile", profile), [profile]);
  useEffect(() => saveJson("hoursTracker.period", period), [period]);
  useEffect(() => saveString("hoursTracker.physicalClocked", physicalClocked), [physicalClocked]);
  useEffect(() => saveJson("hoursTracker.extraHours", extraHours), [extraHours]);
  useEffect(() => saveString("hoursTracker.theme", theme), [theme]);
  useEffect(() => saveString("hoursTracker.goal", goal), [goal]);
  useEffect(() => saveString("hoursTracker.daysLeft", daysLeft), [daysLeft]);

  function addEntry() {
    setEntries((prev) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: form.date || todayIsoDate(), type: form.type || "OTHER", flagged: toNum(form.flagged), actual: toNum(form.actual), description: form.description.trim() || "Manual entry" }, ...prev]);
    setForm((old) => ({ ...old, flagged: "", actual: "", description: "" }));
  }

  function exportBackupJson() {
    const backup = { app: "Hours Tracker", version: 2, exportedAt: new Date().toISOString(), profile, period, rates, physicalClocked, extraHours, entries, goal, daysLeft, theme };
    downloadFile(`hours-tracker-backup-${todayIsoDate()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
  }

  function importBackupJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result || "{}"));
        if (backup.profile && typeof backup.profile === "object") setProfile({ ...EMPTY_PROFILE, ...backup.profile });
        if (backup.period && typeof backup.period === "object") setPeriod({ start: todayIsoDate(), end: todayIsoDate(), ...backup.period });
        if (backup.rates && typeof backup.rates === "object") setRates({ ...DEFAULT_PAY, ...backup.rates });
        if (typeof backup.physicalClocked !== "undefined") setPhysicalClocked(String(backup.physicalClocked ?? ""));
        if (backup.extraHours && typeof backup.extraHours === "object") setExtraHours({ ...EMPTY_EXTRA_HOURS, ...backup.extraHours });
        if (Array.isArray(backup.entries)) setEntries(backup.entries.map((entry, index) => ({ ...entry, id: entry.id ?? `${Date.now()}-${index}` })));
        if (typeof backup.goal !== "undefined") setGoal(String(backup.goal ?? ""));
        if (typeof backup.daysLeft !== "undefined") setDaysLeft(String(backup.daysLeft ?? ""));
        if (backup.theme === "light" || backup.theme === "dark") setTheme(backup.theme);
      } catch {
        alert("Could not import backup. Please make sure this is a valid Hours Tracker JSON file.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const rows = [["Date", "Pay Type", "Flagged", "Actual", "Description"], ...entries.map((entry) => [entry.date, entry.type, entry.flagged, entry.actual, `"${String(entry.description || "").replace(/"/g, '""')}"`])];
    downloadFile("hours-tracker.csv", rows.map((row) => row.join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`${theme === "dark" ? "bg-zinc-950 text-zinc-100" : "light-mode bg-slate-100 text-slate-950"} min-h-screen p-4 md:p-8`}>
      <ThemeStyles />
      <div className="mx-auto max-w-7xl space-y-6">
        <Header profile={profile} period={period} status={status} onOpenSettings={() => setShowSettings(true)} />
        <KpiGrid totals={totals} rates={rates} />
        <PerformanceOverview totals={totals} goal={goal} />
        <TechnicianInsights totals={totals} rates={rates} goal={goal} daysLeft={daysLeft} />
        <PhysicalClockSection physicalClocked={physicalClocked} setPhysicalClocked={setPhysicalClocked} extraHours={extraHours} setExtraHours={setExtraHours} totals={totals} rates={rates} />
        <SettingsModal profile={profile} setProfile={setProfile} period={period} setPeriod={setPeriod} rates={rates} setRates={setRates} theme={theme} setTheme={setTheme} open={showSettings} onClose={() => setShowSettings(false)} />
        <AddEntry form={form} setForm={setForm} addEntry={addEntry} exportCsv={exportCsv} exportPdf={() => window.print()} exportBackupJson={exportBackupJson} importBackupJson={importBackupJson} clearAllEntries={() => setEntries([])} />
        <section className="grid gap-4 lg:grid-cols-3">
          <EntriesPanel entries={entries} deleteEntry={(id) => setEntries((prev) => prev.filter((entry) => entry.id !== id))} />
          <GoalPlanner goal={goal} setGoal={setGoal} daysLeft={daysLeft} setDaysLeft={setDaysLeft} totals={totals} rates={rates} />
        </section>
        <TestPanel showTests={showTests} setShowTests={setShowTests} rates={rates} totals={totals} goal={goal} daysLeft={daysLeft} />
      </div>
    </div>
  );
}

function ThemeStyles() {
  return <style>{`.light-mode{background:linear-gradient(180deg,#f8fafc 0%,#eef2ff 45%,#f8fafc 100%)!important;color:#0f172a!important}.light-mode section,.light-mode [class*="bg-zinc-900"],.light-mode [class*="bg-zinc-950"]{background-color:rgba(255,255,255,.94)!important;color:#0f172a!important;border-color:#d7dce5!important}.light-mode [class*="bg-zinc-800"]{background-color:#e8edf5!important;color:#0f172a!important}.light-mode [class*="border-zinc-800"],.light-mode [class*="border-zinc-700"]{border-color:#cbd5e1!important}.light-mode [class*="text-zinc-100"],.light-mode [class*="text-zinc-200"],.light-mode [class*="text-zinc-300"]{color:#111827!important}.light-mode [class*="text-zinc-400"]{color:#475569!important}.light-mode [class*="text-zinc-500"]{color:#64748b!important}.light-mode input,.light-mode select{background-color:#fff!important;color:#0f172a!important;border-color:#cbd5e1!important;color-scheme:light!important;box-shadow:0 1px 2px rgba(15,23,42,.06)!important}.light-mode input::placeholder{color:#94a3b8!important}.light-mode button.bg-zinc-800,.light-mode label.bg-zinc-800,.light-mode label.cursor-pointer{background-color:#f1f5f9!important;color:#0f172a!important}.light-mode button.bg-zinc-100{background-color:#0f172a!important;color:#fff!important}.light-mode .bg-white\\/5{background-color:rgba(255,255,255,.65)!important}.light-mode .border-white\\/10{border-color:rgba(15,23,42,.1)!important}@media print{body{background:white!important}}`}</style>;
}

function Header({ profile, period, status, onOpenSettings }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><h1 className="text-3xl font-bold tracking-tight">Hours Tracker</h1><p className="text-zinc-400">Flagged vs actual vs physically clocked{profile.technician ? ` — ${profile.technician}` : ""}{profile.role ? `, ${profile.role}` : ""}</p>{profile.dealership && <p className="mt-1 text-sm text-zinc-500">{profile.dealership}</p>}<p className="mt-1 text-sm text-zinc-500">Period: {period.start ? formatDisplayDate(period.start) : "Not set"} to {period.end ? formatDisplayDate(period.end) : "Not set"}</p></div>
      <div className="flex flex-wrap items-center gap-3"><span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${status.cls}`}>{status.label}</span><button onClick={onOpenSettings} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800 text-zinc-100 shadow-lg transition hover:bg-zinc-700" aria-label="Open settings"><Settings2 className="h-5 w-5" /></button></div>
    </header>
  );
}

function KpiGrid({ totals, rates }) {
  const efficiencyAccent = totals.efficiencyClock >= 130 ? "purple" : totals.efficiencyClock >= 100 ? "green" : totals.efficiencyClock >= 75 ? "yellow" : "red";
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric icon={Wrench} accent="green" title="Flagged / sold" value={`${totals.flagged.toFixed(2)} hrs`} sub="Production credited" /><Metric icon={Clock3} accent="blue" title="Physically clocked" value={`${totals.clocked.toFixed(2)} hrs`} sub="Entered separately from RO lines" /><Metric icon={Gauge} accent={efficiencyAccent} title="Efficiency vs clock" value={`${Number.isFinite(totals.efficiencyClock) ? totals.efficiencyClock.toFixed(1) : "0.0"}%`} sub="Sold ÷ physically clocked" /><Metric icon={Activity} accent="blue" title="Efficiency vs RO actual" value={`${Number.isFinite(totals.efficiencyActual) ? totals.efficiencyActual.toFixed(1) : "0.0"}%`} sub="Sold ÷ actual" /><Metric icon={DollarSign} accent="green" title="Flat pay" value={money(totals.flatPay)} sub={`Production + other paid hrs @ $${toNum(rates.flat)}/hr`} /><Metric icon={DollarSign} accent="yellow" title="Base pay" value={money(totals.basePay)} sub={`$${toNum(rates.regular)}/hr × clocked`} /><Metric icon={TrendingUp} accent={totals.cushion >= 0 ? "green" : "red"} title="Break-even cushion" value={`${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`} sub={`Need ${totals.breakEvenFlagged.toFixed(2)} flagged`} /><Metric icon={Trophy} accent="purple" title="Avg flagged/day" value={`${totals.avgFlaggedDay.toFixed(2)} hrs`} sub="Based on entry count" /></section>;
}

function PerformanceOverview({ totals, goal }) {
  const goalValue = toNum(goal);
  const goalPercent = goalValue > 0 ? Math.min((totals.flagged / goalValue) * 100, 100) : 0;
  const breakEvenPercent = totals.clocked > 0 && totals.breakEvenFlagged > 0 ? Math.min((totals.flagged / totals.breakEvenFlagged) * 100, 100) : 0;
  return <section className="grid gap-4 lg:grid-cols-2"><ProgressCard title="Goal progress" icon={Target} value={`${goalPercent.toFixed(1)}%`} sub={goalValue > 0 ? `${totals.flagged.toFixed(2)} / ${goalValue.toFixed(2)} hrs` : "Set a goal to track progress"} progress={goalPercent} accent="green" /><ProgressCard title="Break-even status" icon={Gauge} value={`${breakEvenPercent.toFixed(1)}%`} sub={totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} hrs needed to break even` : "Enter physically clocked hours"} progress={breakEvenPercent} accent={breakEvenPercent >= 100 ? "purple" : "yellow"} /></section>;
}

function TechnicianInsights({ totals, rates, goal, daysLeft }) {
  const flatRate = toNum(rates.flat), regularRate = toNum(rates.regular), payDifference = totals.flatPay - totals.basePay, target = toNum(goal), remainingDays = toNum(daysLeft);
  const projectedFinish = remainingDays > 0 ? totals.flagged + totals.avgFlaggedDay * remainingDays : totals.flagged;
  const efficiencyLabel = !Number.isFinite(totals.efficiencyClock) ? "No clock data yet" : totals.efficiencyClock >= 130 ? "Elite" : totals.efficiencyClock >= 115 ? "Very strong" : totals.efficiencyClock >= 100 ? "Strong" : totals.efficiencyClock >= 75 ? "Safe" : "Below break-even";
  const cards = [{ title: "Pay position", value: payDifference >= 0 ? `+${money(payDifference)}` : `-${money(Math.abs(payDifference))}`, detail: payDifference >= 0 ? "Flat/bonus pay is currently ahead of base pay." : "Base pay is currently ahead of flat/bonus pay.", tone: payDifference >= 0 ? "green" : "red" }, { title: "Break-even cushion", value: `${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`, detail: totals.cushion >= 0 ? "You have room before falling back to base-pay pace." : "You need more flagged hours to beat base-pay pace.", tone: totals.cushion >= 0 ? "green" : "yellow" }, { title: "Efficiency status", value: efficiencyLabel, detail: Number.isFinite(totals.efficiencyClock) ? `${totals.efficiencyClock.toFixed(1)}% vs physically clocked time.` : "Enter physically clocked hours to calculate this.", tone: totals.efficiencyClock >= 115 ? "purple" : totals.efficiencyClock >= 75 ? "green" : "yellow" }, { title: "Projected finish", value: `${projectedFinish.toFixed(2)} hrs`, detail: remainingDays > 0 ? "Projection based on your current average flagged per entry/day." : "Enter days left to improve this projection.", tone: "blue" }];
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6"><div className="mb-4"><h2 className="text-lg font-semibold">Technician Insights</h2><p className="text-sm text-zinc-400">Automatic interpretation of your pay-period numbers.</p></div><div className="grid gap-3 md:grid-cols-4">{cards.map((card) => <InsightCard key={card.title} {...card} />)}</div><div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h3 className="mb-3 font-semibold text-zinc-100">Quick read</h3><div className="space-y-2 text-sm text-zinc-300"><p>{flatRate > 0 && regularRate > 0 ? `Your break-even point is ${(totals.breakEvenRatio * 100).toFixed(1)}%, meaning you need ${totals.breakEvenFlagged.toFixed(2)} flagged hours for your current physically clocked time.` : "Enter base and flat rates to calculate your true break-even point."}</p><p>{target > 0 && remainingDays > 0 ? `To reach ${target.toFixed(2)} flagged hours, you need ${totals.neededPerDay.toFixed(2)} flagged hours per remaining day.` : "Enter a goal and days left to unlock target pacing guidance."}</p><p>{totals.efficiencyActual > 0 ? `Your RO efficiency is ${totals.efficiencyActual.toFixed(1)}%, which shows how your sold time compares to actual RO time.` : "Enter actual RO hours to compare sold time against actual job time."}</p></div></div></section>;
}

function PhysicalClockSection({ physicalClocked, setPhysicalClocked, extraHours, setExtraHours, totals, rates }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6"><h2 className="mb-4 text-lg font-semibold">Physical Clock Time & Other Paid Hours</h2><div className="grid gap-3 md:grid-cols-5"><Field label="Physically clocked hours" value={physicalClocked} onChange={setPhysicalClocked} /><Field label="Sick time off" value={extraHours.sick} onChange={(value) => setExtraHours({ ...extraHours, sick: value })} /><Field label="Paid time off" value={extraHours.pto} onChange={(value) => setExtraHours({ ...extraHours, pto: value })} /><Field label="Training hours" value={extraHours.training} onChange={(value) => setExtraHours({ ...extraHours, training: value })} /><Field label="Other paid hours" value={extraHours.other} onChange={(value) => setExtraHours({ ...extraHours, other: value })} /></div><div className="mt-4 grid gap-3 md:grid-cols-3"><InfoBox label="Other paid hours total" value={`${totals.extraPaidHours.toFixed(2)} hrs`} /><InfoBox label="Rate used" value={`$${toNum(rates.flat).toFixed(2)}/hr`} /><InfoBox label="Other paid amount" value={money(totals.extraPaidPay)} /></div><p className="mt-3 text-sm text-zinc-400">Enter your physical worked hours separately from RO entries. Sick time, PTO, training, and other paid hours are calculated using the flat rate entered in settings.</p></section>;
}

function SettingsModal({ profile, setProfile, period, setPeriod, rates, setRates, theme, setTheme, open, onClose }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-6"><section className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl md:max-w-4xl md:rounded-3xl md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-2xl font-bold">Settings</h2><p className="mt-1 text-sm text-zinc-400">Profile, appearance, pay rates, and pay-period setup.</p></div><button onClick={onClose} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700">Close</button></div><div className="space-y-6"><SettingsGroup title="Profile"><div className="grid gap-3 md:grid-cols-3"><Field label="Technician name" value={profile.technician} onChange={(value) => setProfile({ ...profile, technician: value })} /><Field label="Dealership / shop" value={profile.dealership} onChange={(value) => setProfile({ ...profile, dealership: value })} /><Field label="Role / title" value={profile.role} onChange={(value) => setProfile({ ...profile, role: value })} /></div></SettingsGroup><SettingsGroup title="App"><div className="grid gap-3 md:grid-cols-3"><label className="space-y-1"><span className="block text-sm text-zinc-400">Appearance</span><select className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="dark">Night Mode</option><option value="light">Day Mode</option></select></label></div></SettingsGroup><SettingsGroup title="Pay Period"><div className="grid gap-3 md:grid-cols-2"><Field label="Period start" type="date" value={period.start} onChange={(value) => setPeriod({ ...period, start: value })} /><Field label="Period end" type="date" value={period.end} onChange={(value) => setPeriod({ ...period, end: value })} /></div></SettingsGroup><SettingsGroup title="Pay Rates"><div className="grid gap-3 md:grid-cols-3"><Field label="Base rate" value={rates.regular} onChange={(value) => setRates({ ...rates, regular: value })} /><Field label="Flat rate" value={rates.flat} onChange={(value) => setRates({ ...rates, flat: value })} /><Field label="Training rate" value={rates.training} onChange={(value) => setRates({ ...rates, training: value })} /></div></SettingsGroup></div></section></div>;
}

function AddEntry({ form, setForm, addEntry, exportCsv, exportPdf, exportBackupJson, importBackupJson, clearAllEntries }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6"><h2 className="mb-4 text-lg font-semibold">Add entry</h2><div className="grid gap-3 md:grid-cols-6"><Field label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /><label className="space-y-1"><span className="block text-sm text-zinc-400">Pay Type</span><select className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="CP">Customer Pay (CP)</option><option value="CUSW">Customer Warranty (CUSW)</option><option value="WP">Warranty Pay (WP)</option><option value="OTHER">Other / Misc</option></select></label><Field label="Flagged" value={form.flagged} onChange={(value) => setForm({ ...form, flagged: value })} /><Field label="Actual" value={form.actual} onChange={(value) => setForm({ ...form, actual: value })} /><label className="space-y-1 md:col-span-6"><span className="block text-sm text-zinc-400">Description / RO</span><input className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]" placeholder="RO 251497 — diag, MPI, LOF ROT, notes..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-3"><ActionButton onClick={addEntry} primary>+ Add entry</ActionButton><ActionButton onClick={exportCsv}>Export CSV</ActionButton><ActionButton onClick={exportPdf}>Save / Print PDF</ActionButton><ActionButton onClick={exportBackupJson}>Export Backup</ActionButton><label className="cursor-pointer rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700">Import Backup<input type="file" accept="application/json,.json" className="hidden" onChange={importBackupJson} /></label><ActionButton onClick={clearAllEntries}>Clear all</ActionButton></div></section>;
}

function EntriesPanel({ entries, deleteEntry }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 lg:col-span-2"><div className="flex items-center justify-between border-b border-zinc-800 p-4"><h2 className="text-lg font-semibold">Entries</h2><span className="text-sm text-zinc-400">{entries.length} items</span></div><DesktopEntriesTable entries={entries} deleteEntry={deleteEntry} /><MobileEntriesCards entries={entries} deleteEntry={deleteEntry} /></div>;
}

function DesktopEntriesTable({ entries, deleteEntry }) {
  return <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="bg-zinc-900 text-zinc-400"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Pay Type</th><th className="p-3 text-right">Flagged</th><th className="p-3 text-right">Actual</th><th className="p-3 text-left">Description</th><th className="p-3" /></tr></thead><tbody>{entries.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-zinc-400">No entries yet — start fresh above.</td></tr> : entries.map((entry) => <tr key={entry.id} className="border-t border-zinc-800 hover:bg-zinc-800/50"><td className="whitespace-nowrap p-3">{formatDisplayDate(entry.date)}</td><td className="p-3"><TypeBadge type={entry.type} /></td><td className="p-3 text-right font-semibold">{toNum(entry.flagged).toFixed(2)}</td><td className="p-3 text-right">{toNum(entry.actual).toFixed(2)}</td><td className="min-w-64 p-3 text-zinc-300">{entry.description}</td><td className="p-3 text-right"><DeleteButton onClick={() => deleteEntry(entry.id)} /></td></tr>)}</tbody></table></div>;
}

function MobileEntriesCards({ entries, deleteEntry }) {
  return <div className="space-y-3 p-4 md:hidden">{entries.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-400">No entries yet — start fresh above.</div> : entries.map((entry) => <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="font-semibold">{formatDisplayDate(entry.date)}</div><div className="mt-1"><TypeBadge type={entry.type} /></div></div><DeleteButton onClick={() => deleteEntry(entry.id)} /></div><div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-900 p-3 text-center"><MiniMetric label="Flagged" value={toNum(entry.flagged).toFixed(2)} /><MiniMetric label="Actual" value={toNum(entry.actual).toFixed(2)} /></div><div className="mt-3 text-sm text-zinc-300">{entry.description}</div></div>)}</div>;
}

function GoalPlanner({ goal, setGoal, daysLeft, setDaysLeft, totals, rates }) {
  const regularRate = toNum(rates.regular), flatRate = toNum(rates.flat), ratio = flatRate > 0 ? regularRate / flatRate : 0;
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-6"><h2 className="mb-4 text-lg font-semibold">Goal planner</h2><div className="grid grid-cols-2 gap-3"><Field label="Goal flagged" value={goal} onChange={setGoal} /><Field label="Days left" value={daysLeft} onChange={setDaysLeft} /></div><div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><Line label="Remaining to goal" value={goal ? `${totals.remainingToGoal.toFixed(2)} hrs` : "Enter goal"} /><Line label="Needed per day" value={goal && daysLeft ? `${totals.neededPerDay.toFixed(2)} hrs/day` : "Enter goal + days"} /><Line label="Break-even minimum" value={totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} flagged` : "Enter clocked hrs"} /></div><div className="mt-4 space-y-2 text-sm text-zinc-300"><p><strong className="text-zinc-100">Rule:</strong> Break-even is {(ratio * 100).toFixed(1)}% because ${regularRate} ÷ ${flatRate} = {ratio.toFixed(2)}.</p><p><strong className="text-zinc-100">Best metric:</strong> Sold ÷ physically clocked.</p></div></div>;
}

function TestPanel({ showTests, setShowTests, rates, totals, goal, daysLeft }) {
  const checks = calculationChecks(rates, totals, goal, daysLeft);
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Calculation checks</h2><button onClick={() => setShowTests((prev) => !prev)} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700">{showTests ? "Hide" : "Show"}</button></div>{showTests && <div className="mt-4 grid gap-3 md:grid-cols-4">{checks.map((test) => <div key={test.name} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="text-sm font-semibold text-zinc-100">{test.name}</div><div className="mt-2 text-xs text-zinc-400">Expected: {test.expected}</div><div className="text-xs text-zinc-400">Actual: {test.actual}</div><div className={`mt-2 text-sm font-semibold ${test.passed ? "text-green-400" : "text-yellow-400"}`}>{test.passed ? "Ready" : "Needs input"}</div></div>)}</div>}</section>;
}

function Metric({ icon: Icon, title, value, sub, accent = "blue" }) {
  const accentMap = { blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/20", green: "from-green-500/20 to-emerald-500/5 border-green-500/20", yellow: "from-yellow-500/20 to-orange-500/5 border-yellow-500/20", red: "from-red-500/20 to-rose-500/5 border-red-500/20", purple: "from-purple-500/20 to-fuchsia-500/5 border-purple-500/20" };
  return <div className={`rounded-2xl border bg-gradient-to-br ${accentMap[accent] || accentMap.blue} p-4 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-zinc-400">{title}</div><div className="mt-1 text-3xl font-black tracking-tight">{value}</div></div>{Icon && <div className="rounded-xl border border-white/10 bg-white/5 p-2"><Icon className="h-5 w-5 text-zinc-200" /></div>}</div><div className="mt-3 text-xs text-zinc-400">{sub}</div></div>;
}

function ProgressCard({ title, icon: Icon, value, sub, progress, accent = "green" }) {
  const barClass = { green: "bg-green-500", yellow: "bg-yellow-500", purple: "bg-purple-500" };
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-zinc-400">{title}</div><div className="mt-1 text-3xl font-black">{value}</div></div><div className="rounded-xl border border-white/10 bg-white/5 p-2"><Icon className="h-5 w-5 text-zinc-100" /></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full transition-all duration-500 ${barClass[accent] || barClass.green}`} style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} /></div><div className="mt-3 text-sm text-zinc-400">{sub}</div></div>;
}

function InsightCard({ title, value, detail, tone }) {
  const toneMap = { green: "border-green-500/20 bg-green-500/10", red: "border-red-500/20 bg-red-500/10", yellow: "border-yellow-500/20 bg-yellow-500/10", purple: "border-purple-500/20 bg-purple-500/10", blue: "border-blue-500/20 bg-blue-500/10" };
  return <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.blue}`}><div className="text-sm text-zinc-400">{title}</div><div className="mt-1 text-2xl font-black">{value}</div><div className="mt-2 text-xs text-zinc-400">{detail}</div></div>;
}

function InfoBox({ label, value }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>;
}

function SettingsGroup({ title, children }) {
  return <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>{children}</div>;
}

function Field({ label, value, onChange, type = "text" }) {
  const lower = label.toLowerCase();
  const isNumeric = lower.includes("rate") || lower.includes("flagged") || lower.includes("actual") || lower.includes("clocked") || lower.includes("goal") || lower.includes("days") || lower.includes("hours") || lower.includes("time off");
  return <label className="space-y-1"><span className="block text-sm text-zinc-400">{label}</span><input type={type} inputMode={type === "date" ? undefined : isNumeric ? "decimal" : "text"} className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]" placeholder={type === "date" ? undefined : isNumeric ? "0.00" : "Enter text..."} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Line({ label, value }) {
  return <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 last:border-b-0 last:pb-0"><span className="text-zinc-400">{label}</span><span className="font-semibold text-zinc-100">{value}</span></div>;
}

function TypeBadge({ type }) {
  return <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${typeClass(type)}`}>{type}</span>;
}

function DeleteButton({ onClick }) {
  return <button onClick={onClick} className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">Delete</button>;
}

function ActionButton({ children, onClick, primary = false }) {
  return <button onClick={onClick} className={`${primary ? "bg-zinc-100 text-zinc-950 hover:bg-white" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"} rounded-xl px-4 py-2 font-semibold`}>{children}</button>;
}

function MiniMetric({ label, value }) {
  return <div><div className="text-xs text-zinc-500">{label}</div><div className="text-base font-bold text-zinc-100">{value}</div></div>;
}

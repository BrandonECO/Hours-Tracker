import React, { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Clock3,
  DollarSign,
  Wrench,
  TrendingUp,
  Target,
  Trophy,
  Activity,
} from "lucide-react";

const DEFAULT_PAY = {
  regular: "",
  flat: "",
  training: "",
};

const initialEntries = [];

function toNum(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours) {
  const flagged = entries.reduce((sum, entry) => sum + toNum(entry.flagged), 0);
  const actual = entries.reduce((sum, entry) => sum + toNum(entry.actual), 0);
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
    flagged,
    actual,
    clocked,
    flatPay,
    productionFlatPay,
    extraPaidPay,
    extraPaidHours,
    sickHours,
    ptoHours,
    trainingHours,
    otherHours,
    basePay,
    breakEvenRatio,
    breakEvenFlagged,
    cushion,
    efficiencyClock,
    efficiencyActual,
    avgFlaggedDay,
    remainingToGoal,
    neededPerDay,
  };
}

const CALCULATION_TESTS = [
  {
    name: "Break-even ratio for $33/$44 rates",
    expected: "75.0%",
    run: () => `${((33 / 44) * 100).toFixed(1)}%`,
  },
  {
    name: "Efficiency with 49.10 flagged and 40.74 clocked",
    expected: "120.5%",
    run: () => `${((49.1 / 40.74) * 100).toFixed(1)}%`,
  },
  {
    name: "Needed per day from 60.30 to 90 over 3 days",
    expected: "9.90 hrs/day",
    run: () => `${((90 - 60.3) / 3).toFixed(2)} hrs/day`,
  },
];

function statusForEfficiency(efficiency) {
  if (!Number.isFinite(efficiency)) {
    return { label: "No data", cls: "bg-zinc-700 text-zinc-100" };
  }

  if (efficiency < 75) {
    return { label: "Below break-even", cls: "bg-red-900 text-red-100" };
  }

  if (efficiency < 95) {
    return { label: "Safe", cls: "bg-yellow-800 text-yellow-100" };
  }

  if (efficiency < 115) {
    return { label: "Strong", cls: "bg-green-800 text-green-100" };
  }

  return { label: "Elite", cls: "bg-purple-800 text-purple-100" };
}

function typeClass(type) {
  if (type === "CP") return "bg-green-900 text-green-100";
  if (type === "CUSW") return "bg-blue-900 text-blue-100";
  if (type === "WP") return "bg-purple-900 text-purple-100";
  if (type === "OTHER") return "bg-zinc-700 text-zinc-100";
  return "bg-blue-900 text-blue-100";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function HoursTracker() {
  const [entries, setEntries] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hoursTracker.entries")) || initialEntries;
    } catch {
      return initialEntries;
    }
  });
  const [rates, setRates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hoursTracker.rates")) || DEFAULT_PAY;
    } catch {
      return DEFAULT_PAY;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hoursTracker.profile")) || {
        technician: "",
        dealership: "",
        role: "",
      };
    } catch {
      return {
        technician: "",
        dealership: "",
        role: "",
      };
    }
  });
  const [showProfileSettings, setShowProfileSettings] = useState(true);
  const [showTests, setShowTests] = useState(false);
  const [period, setPeriod] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hoursTracker.period")) || {
        start: todayIsoDate(),
        end: todayIsoDate(),
      };
    } catch {
      return {
        start: todayIsoDate(),
        end: todayIsoDate(),
      };
    }
  });
  const [form, setForm] = useState({
    date: todayIsoDate(),
    type: "CP",
    flagged: "",
    actual: "",
    description: "",
  });

  const [physicalClocked, setPhysicalClocked] = useState(() => localStorage.getItem("hoursTracker.physicalClocked") || "");
  const [extraHours, setExtraHours] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hoursTracker.extraHours")) || {
        sick: "",
        pto: "",
        training: "",
        other: "",
      };
    } catch {
      return {
        sick: "",
        pto: "",
        training: "",
        other: "",
      };
    }
  });
  const [goal, setGoal] = useState("");
  const [daysLeft, setDaysLeft] = useState("");

  const totals = useMemo(
    () => calculateTotals(entries, rates, goal, daysLeft, physicalClocked, extraHours),
    [entries, rates, goal, daysLeft, physicalClocked, extraHours]
  );

  const status = statusForEfficiency(totals.efficiencyClock);

  useEffect(() => {
    localStorage.setItem("hoursTracker.entries", JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem("hoursTracker.rates", JSON.stringify(rates));
  }, [rates]);

  useEffect(() => {
    localStorage.setItem("hoursTracker.profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("hoursTracker.period", JSON.stringify(period));
  }, [period]);

  useEffect(() => {
    localStorage.setItem("hoursTracker.physicalClocked", physicalClocked);
  }, [physicalClocked]);

  useEffect(() => {
    localStorage.setItem("hoursTracker.extraHours", JSON.stringify(extraHours));
  }, [extraHours]);

  function addEntry() {
    setEntries((prev) => [
      {
        id: Date.now(),
        date: form.date,
        type: form.type,
        flagged: toNum(form.flagged),
        actual: toNum(form.actual),
        
        description: form.description.trim() || "Manual entry",
      },
      ...prev,
    ]);

    setForm((old) => ({
      ...old,
      flagged: "",
      actual: "",
      
      description: "",
    }));
  }

  function deleteEntry(id) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  function clearAllEntries() {
    setEntries([]);
  }

  function exportPdf() {
    window.print();
  }

  function exportBackupJson() {
    const backup = {
      app: "Hours Tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      period,
      rates,
      physicalClocked,
      extraHours,
      entries,
      goal,
      daysLeft,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hours-tracker-backup-${todayIsoDate()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
      } catch {
        alert("Could not import backup. Please make sure this is a valid Hours Tracker JSON file.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const rows = [
      ["Date", "Pay Type", "Flagged", "Actual", "Description"],
      ...entries.map((entry) => [
        entry.date,
        entry.type,
        entry.flagged,
        entry.actual,
        
        `"${String(entry.description || "").replace(/"/g, '""')}"`,
      ]),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hours-tracker.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Header
          profile={profile}
          period={period}
          status={status}
        />

        <KpiGrid
          totals={totals}
          rates={rates}
        />

        <PerformanceOverview totals={totals} goal={goal} />

        <TechnicianInsights
          totals={totals}
          rates={rates}
          goal={goal}
          daysLeft={daysLeft}
        />

        <PhysicalClockSection
          physicalClocked={physicalClocked}
          setPhysicalClocked={setPhysicalClocked}
          extraHours={extraHours}
          setExtraHours={setExtraHours}
          totals={totals}
          rates={rates}
        />

        <ProfileSettings
          profile={profile}
          setProfile={setProfile}
          period={period}
          setPeriod={setPeriod}
          rates={rates}
          setRates={setRates}
          showProfileSettings={showProfileSettings}
          setShowProfileSettings={setShowProfileSettings}
        />

        <AddEntry
          form={form}
          setForm={setForm}
          addEntry={addEntry}
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          exportBackupJson={exportBackupJson}
          importBackupJson={importBackupJson}
          clearAllEntries={clearAllEntries}
        />

        <section className="grid gap-4 lg:grid-cols-3">
          <EntriesPanel
            entries={entries}
            deleteEntry={deleteEntry}
          />

          <GoalPlanner
            goal={goal}
            setGoal={setGoal}
            daysLeft={daysLeft}
            setDaysLeft={setDaysLeft}
            totals={totals}
            rates={rates}
          />
        </section>

        <TestPanel
          showTests={showTests}
          setShowTests={setShowTests}
          rates={rates}
          totals={totals}
          goal={goal}
          daysLeft={daysLeft}
        />
      </div>
    </div>
  );
}

function Header({ profile, period, status }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hours Tracker</h1>
        <p className="text-zinc-400">
          Flagged vs actual vs physically clocked
          {profile.technician ? ` — ${profile.technician}` : ""}
          {profile.role ? `, ${profile.role}` : ""}
        </p>
        {profile.dealership && (
          <p className="mt-1 text-sm text-zinc-500">{profile.dealership}</p>
        )}
        <p className="mt-1 text-sm text-zinc-500">
          Period: {period.start || "Not set"} to {period.end || "Not set"}
        </p>
      </div>
      <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${status.cls}`}>
        {status.label}
      </span>
    </header>
  );
}

function KpiGrid({ totals, rates }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Wrench} accent="green" title="Flagged / sold" value={`${totals.flagged.toFixed(2)} hrs`} sub="Production credited" />
      <Metric icon={Clock3} accent="blue" title="Physically clocked" value={`${totals.clocked.toFixed(2)} hrs`} sub="Entered separately from RO lines" />
      <Metric
        title="Efficiency vs clock"
        value={`${Number.isFinite(totals.efficiencyClock) ? totals.efficiencyClock.toFixed(1) : "0.0"}%`}
        sub="Sold ÷ physically clocked"
      />
      <Metric
        title="Efficiency vs RO actual"
        value={`${Number.isFinite(totals.efficiencyActual) ? totals.efficiencyActual.toFixed(1) : "0.0"}%`}
        sub="Sold ÷ actual"
      />
      <Metric icon={DollarSign} accent="green" title="Flat pay" value={money(totals.flatPay)} sub={`Production + other paid hrs @ $${toNum(rates.flat)}/hr`} />
      <Metric icon={DollarSign} accent="yellow" title="Base pay" value={money(totals.basePay)} sub={`$${toNum(rates.regular)}/hr × clocked`} />
      <Metric
        title="Break-even cushion"
        value={`${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`}
        sub={`Need ${totals.breakEvenFlagged.toFixed(2)} flagged`}
      />
      <Metric icon={Trophy} accent="purple" title="Avg flagged/day" value={`${totals.avgFlaggedDay.toFixed(2)} hrs`} sub="Excluding paid-only count" />
    </section>
  );
}

function PhysicalClockSection({ physicalClocked, setPhysicalClocked, extraHours, setExtraHours, totals, rates }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6">
      <h2 className="mb-4 text-lg font-semibold">Physical Clock Time & Other Paid Hours</h2>

      <div className="grid gap-3 md:grid-cols-5">
        <Field
          label="Physically clocked hours"
          value={physicalClocked}
          onChange={setPhysicalClocked}
        />
        <Field
          label="Sick time off"
          value={extraHours.sick}
          onChange={(value) => setExtraHours({ ...extraHours, sick: value })}
        />
        <Field
          label="Paid time off"
          value={extraHours.pto}
          onChange={(value) => setExtraHours({ ...extraHours, pto: value })}
        />
        <Field
          label="Training hours"
          value={extraHours.training}
          onChange={(value) => setExtraHours({ ...extraHours, training: value })}
        />
        <Field
          label="Other paid hours"
          value={extraHours.other}
          onChange={(value) => setExtraHours({ ...extraHours, other: value })}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-xs text-zinc-500">Other paid hours total</div>
          <div className="mt-1 text-xl font-bold">{totals.extraPaidHours.toFixed(2)} hrs</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-xs text-zinc-500">Rate used</div>
          <div className="mt-1 text-xl font-bold">${toNum(rates.flat).toFixed(2)}/hr</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-xs text-zinc-500">Other paid amount</div>
          <div className="mt-1 text-xl font-bold">{money(totals.extraPaidPay)}</div>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-400">
        Enter your physical worked hours separately from RO entries. Sick time, PTO, training, and other paid hours are calculated using the flat rate entered in settings.
      </p>
    </section>
  );
}

function ProfileSettings({
  profile,
  setProfile,
  period,
  setPeriod,
  rates,
  setRates,
  showProfileSettings,
  setShowProfileSettings,
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Profile & Settings</h2>
        <button
          onClick={() => setShowProfileSettings((prev) => !prev)}
          className="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          {showProfileSettings ? "Hide" : "Show"}
        </button>
      </div>

      {showProfileSettings && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Technician name"
              value={profile.technician}
              onChange={(value) => setProfile({ ...profile, technician: value })}
            />
            <Field
              label="Dealership / shop"
              value={profile.dealership}
              onChange={(value) => setProfile({ ...profile, dealership: value })}
            />
            <Field
              label="Role / title"
              value={profile.role}
              onChange={(value) => setProfile({ ...profile, role: value })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <Field
              label="Period start"
              type="date"
              value={period.start}
              onChange={(value) => setPeriod({ ...period, start: value })}
            />
            <Field
              label="Period end"
              type="date"
              value={period.end}
              onChange={(value) => setPeriod({ ...period, end: value })}
            />
            <Field
              label="Base rate"
              value={rates.regular}
              onChange={(value) => setRates({ ...rates, regular: toNum(value) })}
            />
            <Field
              label="Flat rate"
              value={rates.flat}
              onChange={(value) => setRates({ ...rates, flat: toNum(value) })}
            />
            <Field
              label="Training rate"
              value={rates.training}
              onChange={(value) => setRates({ ...rates, training: toNum(value) })}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function AddEntry({ form, setForm, addEntry, exportCsv, exportPdf, exportBackupJson, importBackupJson, clearAllEntries }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6">
      <h2 className="mb-4 text-lg font-semibold">Add entry</h2>
      <div className="grid gap-3 md:grid-cols-6">
        <Field
          label="Date"
          type="date"
          value={form.date}
          onChange={(value) => setForm({ ...form, date: value })}
        />

        <label className="space-y-1">
          <span className="block text-sm text-zinc-400">Type</span>
          <select
            className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            <option value="CP">Customer Pay (CP)</option>
            <option value="CUSW">Customer Warranty (CUSW)</option>
            <option value="WP">Warranty Pay (WP)</option>
            <option value="OTHER">Other / Misc</option>
          </select>
        </label>

        <Field
          label="Flagged"
          value={form.flagged}
          onChange={(value) => setForm({ ...form, flagged: value })}
        />
        <Field
          label="Actual"
          value={form.actual}
          onChange={(value) => setForm({ ...form, actual: value })}
        />
        

        <label className="space-y-1 md:col-span-6">
          <span className="block text-sm text-zinc-400">Description / RO</span>
          <input
            className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]"
            placeholder="RO 251497 — diag, MPI, LOF ROT, notes..."
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={addEntry}
          className="rounded-xl bg-zinc-100 px-4 py-2 font-semibold text-zinc-950 hover:bg-white"
        >
          + Add entry
        </button>
        <button
          onClick={exportCsv}
          className="rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Export CSV
        </button>
        <button
          onClick={exportPdf}
          className="rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Save / Print PDF
        </button>
        <button
          onClick={exportBackupJson}
          className="rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Export Backup
        </button>
        <label className="cursor-pointer rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700">
          Import Backup
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={importBackupJson}
          />
        </label>
        <button
          onClick={clearAllEntries}
          className="rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          Clear all
        </button>
      </div>
    </section>
  );
}

function EntriesPanel({ entries, deleteEntry }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 lg:col-span-2">
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Entries</h2>
        <span className="text-sm text-zinc-400">{entries.length} items</span>
      </div>

      <DesktopEntriesTable entries={entries} deleteEntry={deleteEntry} />
      <MobileEntriesCards entries={entries} deleteEntry={deleteEntry} />
    </div>
  );
}

function DesktopEntriesTable({ entries, deleteEntry }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-400">
          <tr>
            <th className="p-3 text-left">Date</th>
            <th className="p-3 text-left">Pay Type</th>
            <th className="p-3 text-right">Flagged</th>
            <th className="p-3 text-right">Actual</th>
            
            <th className="p-3 text-left">Description</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-zinc-400">
                No entries yet — start fresh above.
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry.id} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                <td className="whitespace-nowrap p-3">{entry.date}</td>
                <td className="p-3">
                  <TypeBadge type={entry.type} />
                </td>
                <td className="p-3 text-right font-semibold">{toNum(entry.flagged).toFixed(2)}</td>
                <td className="p-3 text-right">{toNum(entry.actual).toFixed(2)}</td>
                
                <td className="min-w-64 p-3 text-zinc-300">{entry.description}</td>
                <td className="p-3 text-right">
                  <DeleteButton onClick={() => deleteEntry(entry.id)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MobileEntriesCards({ entries, deleteEntry }) {
  return (
    <div className="space-y-3 p-4 md:hidden">
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-400">
          No entries yet — start fresh above.
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{entry.date}</div>
                <div className="mt-1">
                  <TypeBadge type={entry.type} />
                </div>
              </div>
              <DeleteButton onClick={() => deleteEntry(entry.id)} />
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-900 p-3 text-center">
              <MiniMetric label="Flagged" value={toNum(entry.flagged).toFixed(2)} />
              <MiniMetric label="Actual" value={toNum(entry.actual).toFixed(2)} />
              
            </div>

            <div className="mt-3 text-sm text-zinc-300">{entry.description}</div>
          </div>
        ))
      )}
    </div>
  );
}

function GoalPlanner({ goal, setGoal, daysLeft, setDaysLeft, totals, rates }) {
  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const ratio = flatRate > 0 ? regularRate / flatRate : 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-6">
      <h2 className="mb-4 text-lg font-semibold">Goal planner</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal flagged" value={goal} onChange={setGoal} />
        <Field label="Days left" value={daysLeft} onChange={setDaysLeft} />
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <Line
          label="Remaining to goal"
          value={goal ? `${totals.remainingToGoal.toFixed(2)} hrs` : "Enter goal"}
        />
        <Line
          label="Needed per day"
          value={goal && daysLeft ? `${totals.neededPerDay.toFixed(2)} hrs/day` : "Enter goal + days"}
        />
        <Line
          label="Break-even minimum"
          value={totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} flagged` : "Enter clocked hrs"}
        />
      </div>

      <div className="mt-4 space-y-2 text-sm text-zinc-300">
        <p>
          <strong className="text-zinc-100">Rule:</strong> Break-even is {(ratio * 100).toFixed(1)}% because ${regularRate} ÷ ${flatRate} = {ratio.toFixed(2)}.
        </p>
        <p>
          <strong className="text-zinc-100">Best metric:</strong> Sold ÷ physically clocked.
        </p>
      </div>
    </div>
  );
}

function TestPanel({ showTests, setShowTests, rates, totals, goal, daysLeft }) {
  const regularRate = toNum(rates.regular);
  const flatRate = toNum(rates.flat);
  const trainingRate = toNum(rates.training);
  const ratio = flatRate > 0 ? regularRate / flatRate : 0;

  const checks = [
    {
      name: "Break-even ratio from your rates",
      expected: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter rates",
      actual: flatRate > 0 ? `${(ratio * 100).toFixed(1)}%` : "Enter base and flat rate",
      passed: flatRate > 0 && regularRate >= 0,
    },
    {
      name: "Current efficiency vs physically clocked",
      expected: "Calculated from entries",
      actual: Number.isFinite(totals.efficiencyClock)
        ? `${totals.efficiencyClock.toFixed(1)}%`
        : "Enter physical clock time",
      passed: Number.isFinite(totals.efficiencyClock),
    },
    {
      name: "Needed per day to goal",
      expected: goal && daysLeft
        ? `Goal ${toNum(goal).toFixed(2)} hrs over ${toNum(daysLeft)} days`
        : "Enter goal + days",
      actual: goal && daysLeft
        ? `${totals.neededPerDay.toFixed(2)} hrs/day`
        : "Waiting for input",
      passed: toNum(daysLeft) > 0 && toNum(goal) > 0,
    },
    {
      name: "Training rate check",
      expected: "Optional rate",
      actual: trainingRate > 0 ? `$${trainingRate.toFixed(2)}/hr` : "Not set",
      passed: true,
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Calculation checks</h2>
        <button
          onClick={() => setShowTests((prev) => !prev)}
          className="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
        >
          {showTests ? "Hide" : "Show"}
        </button>
      </div>

      {showTests && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {checks.map((test) => (
            <div key={test.name} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm font-semibold text-zinc-100">{test.name}</div>
              <div className="mt-2 text-xs text-zinc-400">Expected: {test.expected}</div>
              <div className="text-xs text-zinc-400">Actual: {test.actual}</div>
              <div className={`mt-2 text-sm font-semibold ${test.passed ? "text-green-400" : "text-yellow-400"}`}>
                {test.passed ? "Ready" : "Needs input"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TechnicianInsights({ totals, rates, goal, daysLeft }) {
  const flatRate = toNum(rates.flat);
  const regularRate = toNum(rates.regular);
  const payDifference = totals.flatPay - totals.basePay;
  const target = toNum(goal);
  const remainingDays = toNum(daysLeft);
  const projectedFinish = remainingDays > 0 ? totals.flagged + totals.avgFlaggedDay * remainingDays : totals.flagged;
  const neededForGoal = target > 0 && remainingDays > 0 ? totals.neededPerDay : 0;

  const efficiencyLabel = !Number.isFinite(totals.efficiencyClock)
    ? "No clock data yet"
    : totals.efficiencyClock >= 130
      ? "Elite"
      : totals.efficiencyClock >= 115
        ? "Very strong"
        : totals.efficiencyClock >= 100
          ? "Strong"
          : totals.efficiencyClock >= 75
            ? "Safe"
            : "Below break-even";

  const insightCards = [
    {
      title: "Pay position",
      value: payDifference >= 0 ? `+${money(payDifference)}` : `-${money(Math.abs(payDifference))}`,
      detail: payDifference >= 0
        ? "Flat/bonus pay is currently ahead of base pay."
        : "Base pay is currently ahead of flat/bonus pay.",
      tone: payDifference >= 0 ? "green" : "red",
    },
    {
      title: "Break-even cushion",
      value: `${totals.cushion >= 0 ? "+" : ""}${totals.cushion.toFixed(2)} hrs`,
      detail: totals.cushion >= 0
        ? "You have room before falling back to base-pay pace."
        : "You need more flagged hours to beat base-pay pace.",
      tone: totals.cushion >= 0 ? "green" : "yellow",
    },
    {
      title: "Efficiency status",
      value: efficiencyLabel,
      detail: Number.isFinite(totals.efficiencyClock)
        ? `${totals.efficiencyClock.toFixed(1)}% vs physically clocked time.`
        : "Enter physically clocked hours to calculate this.",
      tone: totals.efficiencyClock >= 115 ? "purple" : totals.efficiencyClock >= 75 ? "green" : "yellow",
    },
    {
      title: "Projected finish",
      value: `${projectedFinish.toFixed(2)} hrs`,
      detail: remainingDays > 0
        ? "Projection based on your current average flagged per entry/day."
        : "Enter days left to improve this projection.",
      tone: "blue",
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl md:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Technician Insights</h2>
        <p className="text-sm text-zinc-400">Automatic interpretation of your pay-period numbers.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {insightCards.map((card) => (
          <InsightCard key={card.title} {...card} />
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="mb-3 font-semibold text-zinc-100">Quick read</h3>
        <div className="space-y-2 text-sm text-zinc-300">
          <p>
            {flatRate > 0 && regularRate > 0
              ? `Your break-even point is ${(totals.breakEvenRatio * 100).toFixed(1)}%, meaning you need ${totals.breakEvenFlagged.toFixed(2)} flagged hours for your current physically clocked time.`
              : "Enter base and flat rates to calculate your true break-even point."}
          </p>
          <p>
            {target > 0 && remainingDays > 0
              ? `To reach ${target.toFixed(2)} flagged hours, you need ${neededForGoal.toFixed(2)} flagged hours per remaining day.`
              : "Enter a goal and days left to unlock target pacing guidance."}
          </p>
          <p>
            {totals.efficiencyActual > 0
              ? `Your RO efficiency is ${totals.efficiencyActual.toFixed(1)}%, which shows how your sold time compares to actual RO time.`
              : "Enter actual RO hours to compare sold time against actual job time."}
          </p>
        </div>
      </div>
    </section>
  );
}

function InsightCard({ title, value, detail, tone }) {
  const toneMap = {
    green: "border-green-500/20 bg-green-500/10",
    red: "border-red-500/20 bg-red-500/10",
    yellow: "border-yellow-500/20 bg-yellow-500/10",
    purple: "border-purple-500/20 bg-purple-500/10",
    blue: "border-blue-500/20 bg-blue-500/10",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.blue}`}>
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className="mt-2 text-xs text-zinc-400">{detail}</div>
    </div>
  );
}

function PerformanceOverview({ totals, goal }) {
  const goalValue = toNum(goal);
  const goalPercent = goalValue > 0 ? Math.min((totals.flagged / goalValue) * 100, 100) : 0;
  const breakEvenPercent = totals.clocked > 0
    ? Math.min((totals.flagged / Math.max(totals.breakEvenFlagged, 1)) * 100, 100)
    : 0;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ProgressCard
        title="Goal progress"
        icon={Target}
        value={`${goalPercent.toFixed(1)}%`}
        sub={goalValue > 0 ? `${totals.flagged.toFixed(2)} / ${goalValue.toFixed(2)} hrs` : "Set a goal to track progress"}
        progress={goalPercent}
        accent="green"
      />

      <ProgressCard
        title="Break-even status"
        icon={Gauge}
        value={`${breakEvenPercent.toFixed(1)}%`}
        sub={totals.clocked > 0 ? `${totals.breakEvenFlagged.toFixed(2)} hrs needed to break even` : "Enter physically clocked hours"}
        progress={breakEvenPercent}
        accent={breakEvenPercent >= 100 ? "purple" : "yellow"}
      />
    </section>
  );
}

function Metric({ icon: Icon, title, value, sub, accent = "blue" }) {
  const accentMap = {
    blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/20",
    green: "from-green-500/20 to-emerald-500/5 border-green-500/20",
    yellow: "from-yellow-500/20 to-orange-500/5 border-yellow-500/20",
    purple: "from-purple-500/20 to-fuchsia-500/5 border-purple-500/20",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${accentMap[accent]} p-4 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-400">{title}</div>
          <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
        </div>

        {Icon && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <Icon className="h-5 w-5 text-zinc-200" />
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function ProgressCard({ title, icon: Icon, value, sub, progress, accent = "green" }) {
  const barClass = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    purple: "bg-purple-500",
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-400">{title}</div>
          <div className="mt-1 text-3xl font-black">{value}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <Icon className="h-5 w-5 text-zinc-100" />
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass[accent]}`}
          style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
        />
      </div>

      <div className="mt-3 text-sm text-zinc-400">{sub}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  const isNumericField =
    label.toLowerCase().includes("rate") ||
    label.toLowerCase().includes("flagged") ||
    label.toLowerCase().includes("actual") ||
    label.toLowerCase().includes("clocked") ||
    label.toLowerCase().includes("goal") ||
    label.toLowerCase().includes("days");

  return (
    <label className="space-y-1">
      <span className="block text-sm text-zinc-400">{label}</span>
      <input
        type={type}
        inputMode={type === "date" ? undefined : isNumericField ? "decimal" : "text"}
        className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-400 [color-scheme:dark]"
        placeholder={
          type === "date"
            ? undefined
            : isNumericField
              ? "0.00"
              : "Enter text..."
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 last:border-b-0 last:pb-0">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </div>
  );
}

function TypeBadge({ type }) {
  return (
    <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${typeClass(type)}`}>
      {type}
    </span>
  );
}

function DeleteButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
    >
      Delete
    </button>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-base font-bold text-zinc-100">{value}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: number;
  username: string;
  role: string;
  active: number;
};

type Shift = {
  staff_id: number;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  is_off: boolean;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function defaultShift(staffId: number, weekday: number): Shift {
  return {
    staff_id: staffId,
    weekday,
    start_time: "09:00",
    end_time: "17:00",
    is_off: false,
  };
}

export default function StaffShiftScheduler() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [feedbackDay, setFeedbackDay] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [usersResponse, shiftsResponse] = await Promise.all([
        fetch("/api/management/staff-pin/users", {
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/management/staff-shifts", {
          credentials: "same-origin",
          cache: "no-store",
        }),
      ]);

      const usersData = await usersResponse.json().catch(() => ({}));
      const shiftsData = await shiftsResponse.json().catch(() => ({}));

      if (!usersResponse.ok) {
        throw new Error(usersData.error || "Unable to load employees.");
      }
      if (!shiftsResponse.ok) {
        throw new Error(shiftsData.error || "Unable to load shifts.");
      }

      const list: Employee[] = Array.isArray(usersData.users)
        ? usersData.users
        : [];

      setEmployees(list);
      setShifts(Array.isArray(shiftsData.shifts) ? shiftsData.shifts : []);
      setSelectedId(current =>
        current !== null && list.some(user => user.id === current)
          ? current
          : list.find(user => user.active === 1)?.id ?? list[0]?.id ?? null
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    window.addEventListener("staff-account-created", load);
    return () => { window.clearTimeout(initial); window.removeEventListener("staff-account-created", load); };
  }, [load]);

  function getShift(day: number): Shift {
    return shifts.find(shift =>
      shift.staff_id === selectedId && shift.weekday === day
    ) ?? defaultShift(selectedId!, day);
  }

  function updateDay(day: number, changes: Partial<Shift>) {
    if (selectedId === null) return;

    setShifts(previous => {
      const existing = previous.find(shift =>
        shift.staff_id === selectedId && shift.weekday === day
      ) ?? defaultShift(selectedId, day);

      const updated = { ...existing, ...changes };

      return [
        ...previous.filter(shift =>
          !(shift.staff_id === selectedId && shift.weekday === day)
        ),
        updated,
      ];
    });

    setNotice("");
  }

  async function saveDay(day: number) {
    if (selectedId === null || savingDay !== null) return;

    const shift = getShift(day);
    setFeedbackDay(day);
    setSavingDay(day);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/management/staff-shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(shift),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Unable to save shift.");
      }

      setNotice(`${DAYS[day]} shift saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save shift.");
    } finally {
      setSavingDay(null);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#17202A] p-5 text-white sm:p-6">
      <h2 className="text-xl font-semibold">Employee shifts</h2>
      <p className="mt-2 text-sm text-slate-400">
        Set weekly working hours and days off. Overnight shifts are supported.
      </p>

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">Loading schedule...</p>
      ) : (
        <>
          <label className="mt-5 block text-sm">
            Employee
            <select
              value={selectedId ?? ""}
              disabled={savingDay !== null}
              onChange={event => { setSelectedId(Number(event.target.value)); setFeedbackDay(null); setError(""); setNotice(""); }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
            >
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.username} ({employee.role})
                  {employee.active !== 1 ? " — Disabled" : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedId !== null && (
            <div className="mt-5 space-y-3">
              {DAYS.map((day, index) => {
                const shift = getShift(index);

                return (
                  <div
                    key={day}
                    className="rounded-xl border border-white/10 bg-[#0D1218] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">{day}</h3>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          disabled={savingDay !== null}
                          type="checkbox"
                          checked={shift.is_off}
                          onChange={event => updateDay(index, {
                            is_off: event.target.checked,
                            start_time: event.target.checked ? null : "09:00",
                            end_time: event.target.checked ? null : "17:00",
                          })}
                        />
                        Day off
                      </label>
                    </div>

                    {!shift.is_off && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="text-xs text-slate-300">
                          Start
                          <input
                            disabled={savingDay !== null}
                            type="time"
                            value={shift.start_time ?? "09:00"}
                            onChange={event => updateDay(index, {
                              start_time: event.target.value,
                            })}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#17202A] p-3 text-white"
                          />
                        </label>
                        <label className="text-xs text-slate-300">
                          End
                          <input
                            disabled={savingDay !== null}
                            type="time"
                            value={shift.end_time ?? "17:00"}
                            onChange={event => updateDay(index, {
                              end_time: event.target.value,
                            })}
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#17202A] p-3 text-white"
                          />
                        </label>
                      </div>
                    )}

                    {feedbackDay === index && error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
                    {feedbackDay === index && notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
                    <button
                      type="button"
                      disabled={savingDay !== null}
                      onClick={() => void saveDay(index)}
                      className="mt-3 rounded-lg bg-[#C5A77B] px-4 py-2 text-sm font-semibold text-[#101820] disabled:opacity-50"
                    >
                      {savingDay === index ? "Saving..." : "Save shift"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {feedbackDay === null && error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {feedbackDay === null && notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    </section>
  );
}

import React from "react";
import { format, startOfWeek, addDays } from "date-fns";

interface GridProps {
  selectedDate: Date;
  startHour: number; // inclusive
  endHour: number;   // exclusive
  onSlotClick: (dt: Date) => void;
  events?: { id: string; title: string; start_at: string; end_at: string }[];
}

export const WeekGrid: React.FC<GridProps> = ({ selectedDate, startHour, endHour, onSlotClick, events = [] }) => {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const overlaps = (start: Date, end: Date, ev: { start_at: string; end_at: string }) => {
    const es = new Date(ev.start_at);
    const ee = new Date(ev.end_at);
    return es < end && ee > start;
  };

  return (
    <div className="overflow-auto">
      <div className="min-w-[900px]">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}>
          <div />
          {days.map((d, idx) => (
            <div key={idx} className="px-2 py-2 text-sm font-medium text-muted-foreground border-b">
              {format(d, "EEE dd MMM")}
            </div>
          ))}
          {hours.map((h) => (
            <React.Fragment key={h}>
              <div className="border-b px-2 py-3 text-sm text-muted-foreground">{`${h.toString().padStart(2, "0")}:00`}</div>
              {days.map((d, idx) => {
                const slotStart = new Date(d);
                slotStart.setHours(h, 0, 0, 0);
                const slotEnd = new Date(d);
                slotEnd.setHours(h + 1, 0, 0, 0);
                const slotEvents = events.filter((e) => overlaps(slotStart, slotEnd, e));
                return (
                  <button
                    key={`${h}-${idx}`}
                    className="h-16 border-b border-l hover:bg-accent transition-colors text-left p-1"
                    onClick={() => {
                      const dt = new Date(d);
                      dt.setHours(h, 0, 0, 0);
                      onSlotClick(dt);
                    }}
                    aria-label={`Create at ${format(d, "PPP")} ${h}:00`}
                  >
                    <div
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${Math.min(slotEvents.length, 3) || 1}, minmax(0, 1fr))` }}
                    >
                      {slotEvents.slice(0, 3).map((e) => (
                        <div key={e.id} className="rounded bg-primary/10 text-primary text-[10px] px-1 truncate" title={e.title}>
                          {e.title}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export const DayGrid: React.FC<GridProps> = ({ selectedDate, startHour, endHour, onSlotClick, events = [] }) => {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const ROW_PX = 64; // matches h-16

  const dayEvents = events.filter((e) => {
    const s = new Date(e.start_at);
    const sameDay = s.toDateString() === selectedDate.toDateString();
    return sameDay;
  });

  // Compute non-overlapping columns per conflict group (side-by-side layout)
  type Meta = { col: number; colCount: number };
  const eventMeta: Record<string, Meta> = {};
  (() => {
    if (dayEvents.length === 0) return;
    const sorted = [...dayEvents].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    let colEndTimes: number[] = []; // per column, the current end timestamp
    let clusterIds: string[] = [];
    let maxCols = 0;

    const flushCluster = () => {
      if (clusterIds.length === 0) return;
      for (const id of clusterIds) {
        if (eventMeta[id]) eventMeta[id].colCount = maxCols;
      }
      // reset
      colEndTimes = [];
      clusterIds = [];
      maxCols = 0;
    };

    for (const ev of sorted) {
      const startTs = new Date(ev.start_at).getTime();
      const endTs = new Date(ev.end_at).getTime();

      // if all columns are free (no active events), start a new cluster
      const anyActive = colEndTimes.some((t) => t > startTs);
      if (!anyActive && colEndTimes.length > 0) {
        flushCluster();
      }

      // find first free column
      let col = colEndTimes.findIndex((t) => t <= startTs);
      if (col === -1) {
        col = colEndTimes.length;
        colEndTimes.push(endTs);
      } else {
        colEndTimes[col] = endTs;
      }

      eventMeta[ev.id] = { col, colCount: 1 };
      clusterIds.push(ev.id);
      if (colEndTimes.length > maxCols) maxCols = colEndTimes.length;
    }

    // flush remaining cluster
    flushCluster();
  })();

  return (
    <div className="overflow-auto">
      <div className="min-w-[480px]">
        <div className="grid" style={{ gridTemplateColumns: `80px 1fr` }}>
          <div />
          <div className="px-2 py-2 text-sm font-medium text-muted-foreground border-b">
            {format(selectedDate, "EEEE dd MMM")}
          </div>
          {hours.map((h) => {
            const slotStart = new Date(selectedDate);
            slotStart.setHours(h, 0, 0, 0);
            const slotEnd = new Date(selectedDate);
            slotEnd.setHours(h + 1, 0, 0, 0);
            const slotEvents = dayEvents.filter((e) => new Date(e.start_at) < slotEnd && new Date(e.end_at) > slotStart);
            return (
              <React.Fragment key={h}>
                <div className="border-b px-2 py-3 text-sm text-muted-foreground">{`${h.toString().padStart(2, "0")}:00`}</div>
                <button
                  className="h-16 border-b border-l hover:bg-accent transition-colors text-left p-1 relative"
                  onClick={() => {
                    const dt = new Date(selectedDate);
                    dt.setHours(h, 0, 0, 0);
                    onSlotClick(dt);
                  }}
                  aria-label={`Create at ${format(selectedDate, "PPP")} ${h}:00`}
                >
                  {(() => {
                    const startsHere = dayEvents.filter((e) => {
                      const es = new Date(e.start_at);
                      const ee = new Date(e.end_at);
                      return (es >= slotStart && es < slotEnd) || (h === startHour && es < slotStart && ee > slotStart);
                    });
                    return startsHere.map((e) => {
                      const es = new Date(e.start_at);
                      const ee = new Date(e.end_at);
                      const effectiveStart = es < slotStart ? slotStart : es;
                      const top = ((effectiveStart.getTime() - slotStart.getTime()) / 3600000) * ROW_PX;
                      const heightPx = Math.max(20, ((ee.getTime() - effectiveStart.getTime()) / 3600000) * ROW_PX);
                      const meta = eventMeta[e.id] || { col: 0, colCount: 1 };
                      const leftPct = (meta.col / meta.colCount) * 100;
                      const widthPct = 100 / meta.colCount;
                      return (
                        <div
                          key={e.id}
                          className="absolute rounded bg-primary/20 text-foreground text-[10px] px-1 py-0.5"
                          style={{
                            top: top,
                            height: heightPx,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                          title={e.title}
                        >
                          {e.title}
                        </div>
                      );
                    });
                  })()}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

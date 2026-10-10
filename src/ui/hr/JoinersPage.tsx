"use client";

import type { HrVM } from "@/services/view-model/types";
import { TONE } from "@/ui/tones";
import s from "./hr.module.css";

/** Everyone joining in the next 30 days, with what is still open and how Day 1 looks. */
export function JoinersPage({ hr }: { hr: HrVM }) {
  return (
    <>
      <div className={s.greeting}>
        <h1 className={s.title}>All joiners</h1>
      </div>
      <div className={s.block}>
        <span className={s.label}>Upcoming joiners</span>
        <div className={s.table} role="table" aria-label="Upcoming joiners">
          <div className={`${s.tableRow} ${s.tableHead}`} role="row">
            <span role="columnheader">Joiner</span>
            <span role="columnheader">Starts</span>
            <span role="columnheader">Open items</span>
            <span role="columnheader">Day 1</span>
          </div>
          {hr.joiners.map((j) => (
            <div key={j.name} className={s.tableRow} role="row">
              <span role="cell" className={s.stack}>
                <span className={s.joinerName}>{j.name}</span>
                <span className={s.joinerRole}>{j.role}</span>
              </span>
              <span role="cell">{j.start}</span>
              <span role="cell" className={s.joinerOpen}>
                {j.open}
              </span>
              <span role="cell" className={s.joinerStatus} style={{ color: TONE[j.tone].ink }}>
                {j.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

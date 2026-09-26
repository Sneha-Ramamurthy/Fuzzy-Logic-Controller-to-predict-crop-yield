import React from "react";

export default function RuleActivation({ firedRules }) {
  if (!firedRules || firedRules.length === 0) {
    return <span style={{ color: "var(--sub)" }}>No rules fired at this input.</span>;
  }
  return (
    <div>
      {firedRules.map((r) => (
        <div className="rule" key={r.rule}>
          <span>{r.rule}</span>
          <span className="bar"><div style={{ width: `${r.strength * 100}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

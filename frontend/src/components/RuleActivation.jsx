import React from "react";

export default function RuleActivation({ firedRules }) {
  if (!firedRules || firedRules.length === 0) {
    return <span style={{ color: "var(--sub)" }}>No rules fired at this input.</span>;
  }
  return (
    <div>
      {firedRules.map((r) => (
        <div className="rule" key={r.rule}>
          <div className="rule-top"><span>{r.rule}</span><b>{(r.strength * 100).toFixed(0)}%</b></div>
          <div className="bar"><div style={{ width: `${r.strength * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

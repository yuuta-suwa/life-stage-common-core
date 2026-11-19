"use client";
import { useState } from "react";

export function CopyButton({ text, label, className = "btn small ghost" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "コピーしました" : label}
    </button>
  );
}

export function PrintButton({ label, className = "btn small ghost" }: { label: string; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}

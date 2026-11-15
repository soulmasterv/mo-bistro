"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Issue = { field: Field; form: HTMLFormElement; message: string };

function messageFor(field: Field) {
  const { validity } = field;
  const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute("aria-label") || "this field";
  if (validity.valueMissing) return `Please complete ${label.toLowerCase()}.`;
  if (field instanceof HTMLInputElement && field.type === "tel" && validity.patternMismatch) {
    return "Enter a valid Egyptian mobile number, for example 010 1234 5678.";
  }
  if (validity.rangeUnderflow || validity.rangeOverflow) return "Enter a number within the allowed range.";
  if (validity.patternMismatch || validity.typeMismatch) return `Check the format for ${label.toLowerCase()}.`;
  return `Check the value for ${label.toLowerCase()}.`;
}

export default function FormValidation() {
  const [issue, setIssue] = useState<Issue | null>(null);

  useEffect(() => {
    let first: Field | null = null;
    function invalid(event: Event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.form) return;
      event.preventDefault();
      if (first) return;
      first = field;
      setIssue({ field, form: field.form, message: messageFor(field) });
      queueMicrotask(() => {
        first = null;
        if (field.isConnected) field.focus();
      });
    }
    function clear(event: Event) {
      setIssue(current => current && (event.target === current.field || event.target === current.form) ? null : current);
    }
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("submit", clear, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("submit", clear, true);
    };
  }, []);

  if (!issue?.form.isConnected) return null;
  return createPortal(
    <p role="alert" style={{ gridColumn: "1 / -1", padding: "8px 12px", border: "1px solid #b35b55", borderRadius: 8 }}>
      {issue.message}
    </p>,
    issue.form,
  );
}

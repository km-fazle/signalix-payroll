"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PaymentEditor, valuesFromReview, type EditorValues } from "@/components/payment-editor";
import { api } from "@/lib/browser";
import type { EmployeeOption, UploadReview } from "@/lib/types";

const SAMPLES = [
  ["rosa-clear.png", "Clear week"],
  ["rosa-duplicate.png", "Duplicate"],
  ["felix-unclear.png", "Unclear note"],
  ["nina-span.png", "Two weeks"],
  ["owen-missing.png", "Missing fields"],
  ["derek-injection.png", "Note with instructions"],
  ["hanna-close.png", "Close name"],
  ["caleb-september.png", "Earlier week"],
];

type Draft = { review: UploadReview; values: EditorValues; savedId?: string; error?: string };

export default function UploadPage() {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cloudAllowed, setCloudAllowed] = useState(false);
  const [sendCloud, setSendCloud] = useState(false);

  useEffect(() => {
    api<{ cloud_extraction: boolean }>("/api/payments/upload")
      .then((body) => setCloudAllowed(body.cloud_extraction))
      .catch(() => setCloudAllowed(false));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    if (sendCloud) form.append("destination", "cloud");
    try {
      const body = await api<{ uploads: UploadReview[]; failures: Array<{ file_name: string; error: string }>; employees: EmployeeOption[] }>("/api/payments/upload", {
        method: "POST",
        body: form,
      });
      setEmployees(body.employees);
      const next = body.uploads.map((review) => ({ review, values: valuesFromReview(review) }));
      setDrafts((current) => [...current, ...next]);
      setActive(drafts.length);
      if (body.failures.length) setError(body.failures.map((failure) => `${failure.file_name}: ${failure.error}`).join(" "));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSamples() {
    setBusy(true);
    setError("");
    try {
      const files = await Promise.all(SAMPLES.map(async ([file]) => {
        const response = await fetch(`/samples/${file}`);
        if (!response.ok) throw new Error("Sample screenshots are not generated yet. Run make setup.");
        const blob = await response.blob();
        return new File([blob], file, { type: "image/png" });
      }));
      await upload(files);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  async function save(index: number) {
    const draft = drafts[index];
    if (!draft || draft.savedId) return;
    setSaving(true);
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, error: undefined } : item));
    try {
      const body = await api<{ id: string }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          screenshot_id: draft.review.screenshot_id,
          employee_id: draft.values.employee_id,
          amount: draft.values.amount,
          transaction_date: draft.values.transaction_date,
          period_start: draft.values.period_start,
          period_end: draft.values.period_end,
          hours: draft.values.hours || null,
          confirmation_number: draft.values.confirmation_number || null,
          description: draft.values.description,
          payee_name_raw: draft.review.payee_name,
          period_ambiguous: draft.review.pay_period.status !== "confident",
          acknowledge_duplicate: draft.values.acknowledge_duplicate,
        }),
      });
      setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, savedId: body.id } : item));
    } catch (reason) {
      const failure = reason as Error;
      setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, error: failure.message } : item));
    } finally {
      setSaving(false);
    }
  }

  const draft = drafts[active];

  return (
    <div className="page">
      <div className="container stack">
        <div className="page-head">
          <div>
            <h1>Upload</h1>
            <p className="lede">Take a photo or choose from the library.</p>
          </div>
        </div>
        <div
          className={over ? "drop over" : "drop"}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void upload([...event.dataTransfer.files]);
          }}
        >
          <strong>{busy ? "Reading…" : "Screenshot"}</strong>
          <p>Up to eight images.</p>
          <div className="btn-row capture-actions">
            <label className="btn btn-primary">
              Take photo
              <input
                className="file-input"
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const picked = [...(event.target.files ?? [])];
                  event.target.value = "";
                  void upload(picked);
                }}
              />
            </label>
            <label className="btn btn-secondary">
              Photo library
              <input
                className="file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                multiple
                disabled={busy}
                onChange={(event) => {
                  const picked = [...(event.target.files ?? [])];
                  event.target.value = "";
                  void upload(picked);
                }}
              />
            </label>
            <button className="btn btn-outline sample-button" type="button" disabled={busy} onClick={() => void loadSamples()}>Review samples</button>
          </div>
        </div>
        <p className="field-hint">Read on this server. The image is not sent out.</p>
        {cloudAllowed ? (
          <label className="choice">
            <input type="checkbox" checked={sendCloud} onChange={(event) => setSendCloud(event.target.checked)} />
            <span>Send this upload to the vision provider. Leave this off to keep the screenshot on the server.</span>
          </label>
        ) : null}
        {error ? <p className="banner">{error}</p> : null}
        {drafts.length > 1 ? (
          <div className="btn-row">
            {drafts.map((item, index) => (
              <button key={item.review.screenshot_id} className={index === active ? "btn btn-primary" : "btn btn-outline"} type="button" onClick={() => setActive(index)}>
                {item.savedId ? "Saved" : `Screenshot ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}
        {draft?.savedId ? (
          <div className="panel">
            <h2>Payment saved</h2>
            <p className="lede">Saved for the week you confirmed.</p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" type="button" onClick={() => router.push(`/payments/${draft.savedId}`)}>Open payment</button>
              <button className="btn btn-outline" type="button" onClick={() => router.push("/payroll")}>See payroll</button>
            </div>
          </div>
        ) : null}
        {draft && !draft.savedId ? (
          <>
            {draft.error ? <p className="banner">{draft.error}</p> : null}
            <PaymentEditor
              review={draft.review}
              employees={employees}
              values={draft.values}
              onChange={(values) => setDrafts((current) => current.map((item, index) => index === active ? { ...item, values } : item))}
              onSubmit={() => void save(active)}
              submitLabel="Confirm payment"
              busy={saving}
            />
          </>
        ) : null}
        {!drafts.length && !busy ? <div className="empty">No screenshots waiting.</div> : null}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/browser";
import type { EmployeeRecord } from "@/lib/types";

const EMPTY = { employee_code: "", full_name: "", role_title: "", phone: "", email: "", notes: "" };

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      const params = query ? `?q=${encodeURIComponent(query)}` : "";
      api<{ employees: EmployeeRecord[] }>(`/api/employees${params}`)
        .then((body) => {
          setEmployees(body.employees);
          setError("");
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  async function createEmployee(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = await api<{ id: string }>("/api/employees", { method: "POST", body: JSON.stringify(form) });
      setForm(EMPTY);
      setOpen(false);
      router.push(`/employees/${body.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="container stack">
        <div className="page-head">
          <div>
            <h1>Employees</h1>
            <p className="lede">Directory</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Add employee"}
          </button>
        </div>
        {open ? (
          <form className="panel stack" onSubmit={(event) => void createEmployee(event)}>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="control" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">Code</span>
                <input className="control" value={form.employee_code} onChange={(event) => setForm({ ...form, employee_code: event.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">Role</span>
                <input className="control" value={form.role_title} onChange={(event) => setForm({ ...form, role_title: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <input className="control" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input className="control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="field wide">
                <span className="field-label">Note</span>
                <input className="control" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save employee"}</button>
          </form>
        ) : null}
        <label className="field">
          <span className="field-label">Search</span>
          <input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code" />
        </label>
        {error ? <p className="banner">{error}</p> : null}
        {loading ? <p className="empty">Loading employees…</p> : null}
        {!loading && employees.length === 0 ? <div className="empty">No employees match.</div> : null}
        {!loading && employees.length > 0 ? (
          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr><th>Employee</th><th>Role</th><th>Phone</th><th></th></tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td data-label="Employee">
                      <Link className="person-link" href={`/employees/${employee.id}`}>{employee.full_name}</Link>
                      <span className="sub">{employee.employee_code}{employee.active ? "" : " · Inactive"}</span>
                    </td>
                    <td data-label="Role">{employee.role_title ?? "—"}</td>
                    <td data-label="Phone">{employee.phone ?? "—"}</td>
                    <td><Link className="row-link" href={`/employees/${employee.id}`}>Hours</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

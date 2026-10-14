"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const CompanyContext = createContext({ company: "", person: "" });

export function useCompany() {
  return useContext(CompanyContext);
}

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/employees", label: "Employees" },
  { href: "/payments", label: "Payments" },
  { href: "/upload", label: "Upload" },
  { href: "/payroll", label: "Payroll" },
];

export function Shell({
  company,
  person,
  children,
}: {
  company: string;
  person: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function current(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <CompanyContext.Provider value={{ company, person }}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        {open ? <button className="scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
        <aside className={open ? "sidebar open" : "sidebar"}>
          <Link href="/" className="wordmark" onClick={() => setOpen(false)}>
            <span className="mark" aria-hidden />
            <span>Signalix<small>Payroll</small></span>
          </Link>
          <nav className="side-nav" aria-label="Payroll">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current(link.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <span className="side-company">{company}</span>
            <span className="side-person">{person}</span>
            <button className="btn btn-outline" type="button" onClick={signOut}>Sign out</button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <button className="btn btn-outline menu-button" type="button" onClick={() => setOpen(true)}>Menu</button>
            <span className="topbar-company">{company}</span>
          </header>
          <main id="main">{children}</main>
        </div>
      </div>
    </CompanyContext.Provider>
  );
}

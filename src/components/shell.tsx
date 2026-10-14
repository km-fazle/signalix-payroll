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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <CompanyContext.Provider value={{ company, person }}>
      <a className="skip" href="#main">Skip to content</a>
      <header className={open ? "nav open" : "nav"}>
        <div className="nav-inner">
          <Link href="/" className="wordmark" onClick={() => setOpen(false)}>
            <span className="mark" aria-hidden />
            <span>Signalix<small>Payroll</small></span>
          </Link>
          <nav className="nav-links" aria-label="Payroll">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href)) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="nav-meta">
            <span className="nav-company">{company}</span>
            <button className="btn btn-outline menu-button" type="button" onClick={() => setOpen((value) => !value)}>
              Menu
            </button>
            <button className="btn btn-outline" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <div className="container">Totals are calculated in PostgreSQL. Screenshots stay in private company storage.</div>
      </footer>
    </CompanyContext.Provider>
  );
}

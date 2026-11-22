"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LABS, labHref } from "@/lib/labs";

const ITEMS = [
  { href: "/", label: "Kit", detail: "Free bench" },
  ...LABS.map((lab) => ({ href: labHref(lab.id), label: `Lab ${lab.id}`, detail: lab.title })),
];

/** Compact navigation in the top-left corner. */
export function LabMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = ITEMS.find((item) => item.href === pathname) ?? ITEMS[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        root.current?.querySelector("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="menu">
      <button
        type="button"
        className="menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open navigation"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
        </svg>
        <span className="menu-current">{current.label}</span>
      </button>
      {open && (
        <nav className="menu-list" role="menu" aria-label="Laboratories">
          {ITEMS.map((item) => {
            const selected = item.href === current.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={selected ? "page" : undefined}
                className={`menu-item ${selected ? "is-selected" : ""}`}
                onClick={() => setOpen(false)}
              >
                <span className="menu-dot" aria-hidden />
                <span className="menu-label">{item.label}</span>
                <span className="menu-detail">{item.detail}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

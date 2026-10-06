"use client";

import { useEffect } from "react";

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function useModalAccessibility() {
  useEffect(() => {
    const openers = new WeakMap<HTMLElement, HTMLElement>();
    let current: HTMLElement | null = null;

    const focusDialog = (dialog: HTMLElement) => {
      const preferred = dialog.querySelector<HTMLElement>("[data-dialog-initial]");
      const fallback = dialog.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? fallback ?? dialog).focus();
    };

    const sync = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']"));
      const next = dialogs.at(-1) ?? null;
      if (next === current) return;
      if (current && !next) openers.get(current)?.focus();
      current = next;
      if (!current) return;
      if (!openers.has(current) && document.activeElement instanceof HTMLElement) openers.set(current, document.activeElement);
      window.requestAnimationFrame(() => current && focusDialog(current));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        current.querySelector<HTMLElement>("[data-dialog-close], button[aria-label^='Fechar']")?.click();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(current.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => !item.hasAttribute("hidden"));
      if (!items.length) { event.preventDefault(); current.focus(); return; }
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKeyDown);
    sync();
    return () => { observer.disconnect(); document.removeEventListener("keydown", onKeyDown); };
  }, []);
}

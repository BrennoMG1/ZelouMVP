"use client";
import { useEffect } from "react";

// Keep drafts in memory only: no health data or messages in localStorage.
export function hasUnsavedChanges(root: ParentNode = document) {
  return !!root.querySelector('[data-unsaved="true"]');
}
export function confirmNavigation() {
  return !hasUnsavedChanges() || window.confirm("Há alterações ou mensagens não salvas. Deseja sair desta seção e descartá-las?");
}
export function useUnsavedNavigation() {
  useEffect(() => {
    const changed = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (target.type === "search" || target.closest('.chat-search, .search-row')) return;
      const form = target.closest('form, [role="dialog"], dialog');
      if (!form) return;
      form.setAttribute("data-unsaved", "true");
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ""; }
    };
    // Clear only after a real success, never on submit (which may fail).
    const saved = (event: Event) => {
      if (event.target instanceof Element) {
        event.target.removeAttribute("data-unsaved");
        event.target.querySelectorAll('[data-unsaved]').forEach(node => node.removeAttribute("data-unsaved"));
      }
    };
    document.addEventListener("input", changed);
    document.addEventListener("change", changed);
    document.addEventListener("zelou:saved", saved);
    document.addEventListener("reset", saved);
    window.addEventListener("beforeunload", leaving);
    return () => { document.removeEventListener("input", changed); document.removeEventListener("change", changed); document.removeEventListener("zelou:saved", saved); document.removeEventListener("reset", saved); window.removeEventListener("beforeunload", leaving); };
  }, []);
}

"use client";
import { useRef, type ReactNode } from "react";

export function MobileSwipe({ children, onSwipe }: { children: ReactNode; onSwipe: (direction: number) => void }) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  return <div className="content" onTouchStart={event => {
    start.current = null;
    if (!window.matchMedia("(max-width: 680px)").matches || event.touches.length !== 1 || document.querySelector('dialog[open], [role="dialog"]')) return;
    const target = event.target as HTMLElement;
    if (target.closest("input,textarea,select,button,a,form,[contenteditable=true]")) return;
    for (let node: HTMLElement | null = target; node && node !== event.currentTarget; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 2 && ["auto", "scroll"].includes(getComputedStyle(node).overflowX)) return;
    }
    const touch = event.touches[0];
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    start.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }} onTouchMove={event => {
    if (!start.current) return;
    if (event.touches.length !== 1 || Math.abs(event.touches[0].clientY - start.current.y) > 35) start.current = null;
  }} onTouchCancel={() => { start.current = null; }} onTouchEnd={event => {
    const initial = start.current; start.current = null;
    if (!initial || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - initial.x;
    const dy = event.changedTouches[0].clientY - initial.y;
    if (Date.now() - initial.time < 800 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) onSwipe(dx < 0 ? 1 : -1);
  }}>{children}</div>;
}

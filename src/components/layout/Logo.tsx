/** K8sFocus mark: focus brackets around a K (same artwork as assets/icon.svg, without the tile). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="230 230 564 564" className={className} aria-label="K8sFocus">
      <g fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round">
        <path d="M250 370 V290 Q250 250 290 250 H370" />
        <path d="M654 250 H734 Q774 250 774 290 V370" />
        <path d="M774 654 V734 Q774 774 734 774 H654" />
        <path d="M370 774 H290 Q250 774 250 734 V654" />
      </g>
      <g fill="currentColor">
        <rect x="388" y="352" width="70" height="320" rx="16" />
        <path d="M458 512 L590 352 H676 L536 520 L686 672 H596 L458 530 Z" />
      </g>
    </svg>
  );
}

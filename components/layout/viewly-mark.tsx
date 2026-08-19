/**
 * The Viewly mark: three ascending bars.
 *
 * Inline SVG rather than an image file. It is three rectangles, so a network
 * request and a decode would cost more than the markup, and it inherits
 * currentColor, which an <img> could not, so it stays correct in both themes.
 *
 * Matches public/icon-192.png, which is what appears in a push notification. Both
 * are drawn from the same shape on purpose, so the mark stays recognisable in a
 * notification tray at 16px.
 */
export function ViewlyMark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className} style={style}>
      <rect x="3" y="14" width="4.5" height="7" rx="1.25" />
      <rect x="9.75" y="9" width="4.5" height="12" rx="1.25" />
      <rect x="16.5" y="3" width="4.5" height="18" rx="1.25" />
    </svg>
  );
}

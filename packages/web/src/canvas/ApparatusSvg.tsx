import type { Apparatus } from '@labguide/shared';

export const LINE_ATTRS = {
  fill: 'none',
  stroke: '#1b2a4a',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Static, first-party drawing markup from the apparatus library endpoint. */
export function ApparatusDrawing({ a }: { a: Apparatus }) {
  return <g {...LINE_ATTRS} dangerouslySetInnerHTML={{ __html: a.svg }} />;
}

export function ApparatusThumb({ a, size = 70 }: { a: Apparatus; size?: number }) {
  const pad = 4;
  return (
    <svg viewBox={`${-pad} ${-pad} ${a.width + pad * 2} ${a.height + pad * 2}`} width={size} height={size}
      preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <ApparatusDrawing a={a} />
    </svg>
  );
}

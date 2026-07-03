"use client";

import * as React from "react";

interface ResizableImageProps {
  src: string;
  alt?: string;
  initialWidth: number;
  onResizeEnd: (width: number) => void;
}

const MIN_WIDTH = 60;
const MAX_WIDTH = 900;

// Editor-only image widget — drag the bottom-right handle to resize. Visual
// width updates live via local state; the underlying Markdown/HTML source
// is only rewritten once on release (onResizeEnd), not on every pixel.
export function ResizableImage({ src, alt, initialWidth, onResizeEnd }: ResizableImageProps) {
  const [width, setWidth] = React.useState(initialWidth);
  const [dragging, setDragging] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(initialWidth);

  React.useEffect(() => {
    if (!dragging) setWidth(initialWidth);
  }, [initialWidth, dragging]);

  function handlePointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    if (!dragging) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + (e.clientX - startXRef.current)));
    setWidth(next);
  }

  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    onResizeEnd(width);
  }

  return (
    <span className="relative inline-block align-top" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? ""} className="block w-full rounded-lg border" draggable={false} />
      <span
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute bottom-1 right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white/50 bg-accent"
        title="Drag to resize"
      />
    </span>
  );
}

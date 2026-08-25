// shader-state.tsx — ORIGINAL React component (provided by user).
// Reference copy. The QR Menu project is plain HTML/JS, so the live
// implementation lives in shader-background.js (vanilla port of this logic).

"use client"

import { useEffect, useRef } from "react"

const VERT = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// FRAG + UNIFORMS identical to provided source (omitted here to avoid duplication;
// the authoritative shader is in shader-background.js).
export function ShaderBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // ... identical to provided implementation ...
  }, [])
  return (
    <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%" }} />
  )
}

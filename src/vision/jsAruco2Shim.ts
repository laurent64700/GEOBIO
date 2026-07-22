// src/vision/jsAruco2Shim.ts
//
// js-aruco2 (v2.0.0) ships two files (cv.js, aruco.js) written for the old
// "concatenate multiple <script> tags sharing window as `this`" browser
// pattern: each does `this.CV = CV` / `this.AR = AR` at its own top level —
// not `module.exports =`/`exports.X =`, which is what CJS/ESM interop
// tooling actually recognizes. Vite's dependency pre-bundler (this project
// uses the Rolldown-based optimizer) rewrites this file's top-level `this`
// to `void 0` (technically correct ESM semantics), so `this.CV` throws a
// TypeError partway through evaluating aruco.js and `this.AR = AR` never
// runs — verified by fetching the dev-server's pre-bundled chunk directly
// and finding it has ZERO exports. Excluding js-aruco2 from optimizeDeps was
// tried too: Vite then serves the file un-transformed, where `this` stays
// literal `this`, but the browser has no `require()` global, so
// `require('./cv')` (aruco.js's own fallback path) throws instead. Neither
// of Vite's two code paths for handling a CJS dependency can execute this
// particular file correctly.
//
// Fix: import both files' raw source as plain TEXT (Vite's `?raw` suffix —
// no module transformation at all is applied to a `?raw` import) and
// execute that text ourselves via `new Function(...)`, explicitly supplying
// a shared object as `this` — reproducing exactly the "two <script> tags
// sharing one global" execution model these files were actually written
// for. `new Function` here runs a fixed, versioned, already-audited
// dependency's own source (imported at build time via `?raw`, never
// user-controlled input fetched at runtime), which is what makes this a
// contained, legitimate use of dynamic code execution rather than an
// injection risk.
//
// Version-bump risk: this shim assumes js-aruco2's CURRENT internal export
// pattern — plain top-level `this.CV =` / `this.AR =` assignment, no real
// `export`/`import` statements (which would be a SyntaxError inside a
// `new Function` body). package.json pins `^2.0.0`, so a routine
// `npm update` could pull in a version that changes this pattern and
// silently breaks the shim. Re-verify after any js-aruco2 upgrade by
// rerunning jsAruco2Shim.test.ts AND the manual dev-server check (npm run
// dev, confirm no console error) — don't assume a passing `npm install` is
// enough.
import cvSource from 'js-aruco2/src/cv.js?raw'
import arucoSource from 'js-aruco2/src/aruco.js?raw'

// Typed to match both real consuming call sites, not left as `unknown[]`:
// arucoDetector.ts's `detectMarkers` reads `.id`/`.corners` off each detected
// marker, and arucoDetector.test.ts constructs `new AR.Dictionary('ARUCO')`
// directly and reads `.codeList`/`.markSize` off it. `unknown[]`/an empty
// `AR` shape would compile today only because the OLD `@ts-expect-error`
// import made `AR` implicitly `any` — once `AR` has a real type, the
// existing `.map((marker: { id: number; corners: Point[] }) => ...)` call in
// arucoDetector.ts needs its actual shape reflected here, or `tsc` fails.
interface JsAruco2Namespace {
  Detector: new (options: { dictionaryName: string }) => {
    detect: (image: { width: number; height: number; data: Uint8ClampedArray }) => {
      id: number
      corners: { x: number; y: number }[]
      hammingDistance: number
    }[]
  }
  Dictionary: new (dictionaryName: string) => {
    codeList: string[]
    markSize: number
  }
}

const sharedContext: { CV?: unknown; AR?: JsAruco2Namespace } = {}
try {
  new Function(cvSource).call(sharedContext)
  new Function(arucoSource).call(sharedContext)
} catch (err) {
  throw new Error(
    `Impossible de charger js-aruco2 : l'exécution du shim a échoué (${err instanceof Error ? err.message : String(err)}). Une mise à jour de js-aruco2 a peut-être changé son format d'export.`
  )
}

if (!sharedContext.AR) {
  throw new Error("Impossible de charger js-aruco2 : l'export AR est introuvable après exécution du shim.")
}

export const AR = sharedContext.AR

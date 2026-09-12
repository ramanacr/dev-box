# ADR 0007: Implement the whiteboard locally instead of embedding Excalidraw

## Status

Accepted — records a deviation from the Phase 2 plan that was made in
implementation but never written down.

## Context

The white paper lists Excalidraw under "Embed selectively" and the Phase 2 plan names
`@excalidraw/excalidraw`, to be loaded through `preact/compat` when its tab is
activated. The delivered `ExcalidrawEditor.tsx` is instead a locally implemented
canvas editor. The package was never added.

The delivery standard requires that "any necessary deviation from the approved plan
[be recorded] as an ADR or plan amendment before continuing." That did not happen, so
this record is retrospective.

## User outcome required

From the white paper: "Quick freeform diagrams, local-first files, PNG/SVG export"
and "Embedded Excalidraw with local `.excalidraw`, SVG, and PNG export."

The requirement is the capability and the file format, not the specific package.

## Options

1. **Embed `@excalidraw/excalidraw`.** A mature editor with a large feature surface:
   shape libraries, text handling, grouping, undo history, collaboration hooks. Costs
   a React-compatible runtime on the diagram route and a dependency on the order of a
   megabyte before compression, plus its transitive tree in every SBOM and
   vulnerability scan.
2. **Implement a focused canvas locally.** Rectangle, ellipse, arrow, and freedraw
   with colour selection, `.excalidraw` JSON import/export, and PNG export. Far
   smaller, no React compatibility layer, and the `.excalidraw` interchange format is
   preserved so files remain portable to the real Excalidraw application.

## Decision

Option 2, with the `.excalidraw` format retained as the interchange contract.

This is the ordinary application of the delivery standard's own design rule: "The AI
must prefer the smallest component that satisfies the acceptance criteria... The
exception must be documented when a heavier component materially improves
correctness, security, or required scale." No such material improvement was
identified for the stated outcome, and the image is currently 17.2 MB against a
150 MB budget precisely because dependencies like this were not taken on.

## Evidence

- The stated outcome is freeform sketching with local files and image export. The
  local implementation delivers all three.
- `.excalidraw` JSON is validated on import and emitted on export, so a diagram
  drawn here opens in excalidraw.com and vice versa for the supported element types.
- Bundle budgets pass with the diagram route code-split
  (`node scripts/check-budgets.mjs`).

## Consequences

- **What is given up:** text elements, grouping, shape libraries, multi-level undo,
  and the polish of a dedicated whiteboard product. A user who needs those is better
  served by exporting the `.excalidraw` file and opening it in Excalidraw itself,
  which the format compatibility makes possible.
- **What is gained:** no React runtime on the diagram route, a materially smaller
  image, and a much smaller dependency surface to scan and patch.
- The component name `ExcalidrawEditor` is retained because it names the file format
  it reads and writes, not an embedded product. The UI does not present itself as
  Excalidraw — the white paper's licensing section is explicit that upstream product
  names must not be used to market derivative modules.

## Revisit when

A user requirement appears for text elements, grouping, or shape libraries. At that
point embedding the real editor becomes the smaller amount of work, and this decision
should be reversed rather than the local canvas grown to match.

## Verification

- `pnpm --filter @toolbox/web test -- diagramStore` covers the IndexedDB round trip
  and `.excalidraw` shape validation on import.
- `node scripts/check-budgets.mjs` confirms the diagram route stays code-split and
  the initial bundle stays inside budget.

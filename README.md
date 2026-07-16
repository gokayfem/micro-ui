# Micro UI

An unofficial, fully procedural Three.js reconstruction of the OpenAI × Work Louder Codex Micro interface.

[Open the live demo](https://codex-micro-3d.surge.sh/)

## Features

- Five camera presets: Hero, Top, Low, Underside, and Exploded
- Smooth assembly and disassembly controls
- Interactive keys, rotary controls, touch input, and RGB lighting
- Transparent polycarbonate, anodized aluminium, PBT, and PCB materials
- Eco, Balanced, and Studio rendering profiles
- Demand-driven rendering to reduce idle GPU usage
- Procedural geometry and textures with no external 3D model downloads

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

The optimized static site is written to `dist/`. Relative production asset paths make the build portable to a root domain or a repository subpath.

## Structure

```text
index.html
src/
  main.js          Scene, lighting, post-processing, UI, and interactions
  codex-micro.js   Product assembly
  geometry.js      Reusable procedural geometry helpers
  materials.js     Physical material definitions
  textures.js      Canvas-generated labels, icons, and surface detail
  style.css        Responsive interface styling
```

Product names and marks belong to their respective owners. This project is an independent visualization study and is not an official OpenAI or Work Louder release.

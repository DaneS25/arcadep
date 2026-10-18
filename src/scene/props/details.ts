import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import type { TextureSet } from "@/logic/assetFallback";
import { FONTS, fontStack, type TextureSlot } from "@/logic/assetManifest";
import type { Box } from "@/logic/buildingLayout";
import {
  DETAIL_TEXTURE,
  WINDOW_CELLS,
  centreUv,
  glowUvs,
  VERTICES_PER_BOX,
  cornerUvs,
  detailGeometryData,
  detailLayout,
  glassVertexStarts,
  signPlateVertices,
  withSignPlates,
  type SignId,
  type WindowCellId,
} from "@/logic/detailLayout";
import { withDucts } from "@/logic/ductLayout";
import { withGenerator } from "@/logic/generatorLayout";
import { withWires } from "@/logic/wireLayout";
import { blinkingLedStarts, darkLed, withTaps } from "@/logic/tapLayout";
import {
  cutOutLight,
  flickeringLightVertices,
  withLights,
} from "@/logic/lightLayout";
import { EXIT_SIGN } from "@/ui/copy";
import { withSidewalk } from "@/logic/sidewalkLayout";
import { withStreetLamps } from "@/logic/streetLampLayout";
import type { PixelRect } from "@/logic/graffitiLayout";
import {
  DETAILS_LOOK,
  GENERATOR_LOOK,
  WIRE_LOOK,
  LED_LOOK,
  LIGHTS_LOOK,
  STREET_LAMP_LOOK,
  LAMP_LOOK,
  SIGNS_LOOK,
  surfaceMaterialParams,
  type SurfaceMaterialParams,
} from "@/logic/lookConfig";
import { FLICKER_CYCLE_MS } from "@/logic/neonFlicker";
import { PALETTE } from "@/logic/palette";
import {
  dimmedWindow,
  flickeringPanes,
  withWindows,
} from "@/logic/windowLayout";
import { PROP_GRIME } from "@/logic/grimeLayout";
import { detailWearAttributes } from "@/logic/wearLayout";
import { STICKER_TILE } from "@/logic/wearLayout";
import { addGrime, createPropGrime, createStickerTile } from "../grime";
import { fitFont, glowText } from "../sides/canvasText";
import { drawWindowCell } from "./windowCells";

/** What the signs say: the rooftop shows the profile's name, the shop signs `content/signage`. */
export type SignTexts = Readonly<Record<SignId, string>>;

export type Details = {
  readonly object: Mesh;
  /** Puts the metal maps on the props, or keeps the plain colour if they're missing. */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  /** Gives the skill signs' plates their faint red hover glow, or takes it off. */
  setSignPlatesLit(on: boolean): void;
  /**
   * Runs the flickering windows (task 20): now and then one cuts out for a moment, never
   * more than 3 times a second; all steady under reduced motion.
   */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Draws the signs again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

/** A colour scaled by `DETAILS_LOOK.signDim` in linear light (task 41). */
function dimmed(hex: string): string {
  return new Color(hex).multiplyScalar(DETAILS_LOOK.signDim).getStyle();
}

/**
 * One sign's text: a coloured neon glow with a pale hot core, fitted to its rectangle. Both
 * are drawn a little dimmed (`DETAILS_LOOK.signDim`), so the signs keep their lead.
 */
function drawSign(
  ctx: CanvasRenderingContext2D,
  rect: PixelRect,
  text: string,
  signColor: string,
  family: string,
): void {
  const color = dimmed(signColor);
  const pad = Math.round(rect.height * 0.12);
  // A thin neon frame round the sign.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, Math.round(rect.height * 0.035));
  ctx.shadowColor = color;
  ctx.shadowBlur = pad;
  ctx.strokeRect(
    rect.x + pad / 2,
    rect.y + pad / 2,
    rect.width - pad,
    rect.height - pad,
  );
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  fitFont(
    ctx,
    text,
    family,
    Math.round(rect.height * 0.55),
    rect.width - 4 * pad,
  );
  glowText(ctx, text, cx, cy, color, pad * 1.5);
  ctx.strokeStyle = dimmed(DETAILS_LOOK.signCore);
  ctx.lineWidth = Math.max(1.5, rect.height * 0.012);
  ctx.strokeText(text, cx, cy);
}

/** The puddles' patch: a soft red and cyan smear of reflected neon on black. */
function drawPuddle(ctx: CanvasRenderingContext2D, rect: PixelRect): void {
  const [red, cyan] = DETAILS_LOOK.puddleGlow;
  ctx.fillStyle = "#000000";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const blob = (fx: number, color: string): void => {
    const x = rect.x + rect.width * fx;
    const y = rect.y + rect.height / 2;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, rect.height / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  };
  ctx.globalCompositeOperation = "lighter";
  blob(0.35, red);
  blob(0.65, cyan);
  ctx.globalCompositeOperation = "source-over";
}

/**
 * The generator's warning stencil (task 28): faded red hazard stripes round a pale warning
 * triangle with a lightning bolt, on a near-black plate. No words, so no content strings.
 */
function drawStencil(ctx: CanvasRenderingContext2D, rect: PixelRect): void {
  const L = GENERATOR_LOOK;
  const { x, y, width: w, height: h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = L.stencilBase;
  ctx.fillRect(x, y, w, h);
  // Diagonal stripes, then the plate's middle cut back to black, leaving a striped border.
  ctx.fillStyle = L.stencilRed;
  const step = w / 6;
  for (let i = -h; i < w + h; i += 2 * step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + step, y + h);
    ctx.lineTo(x + i + step + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  const border = w * 0.12;
  ctx.fillStyle = L.stencilBase;
  ctx.fillRect(x + border, y + border, w - 2 * border, h - 2 * border);
  // The warning triangle.
  const cx = x + w / 2;
  ctx.strokeStyle = L.stencilPale;
  ctx.lineWidth = w * 0.06;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.22);
  ctx.lineTo(x + w * 0.78, y + h * 0.76);
  ctx.lineTo(x + w * 0.22, y + h * 0.76);
  ctx.closePath();
  ctx.stroke();
  // The bolt inside it.
  ctx.fillStyle = L.stencilRed;
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.04, y + h * 0.36);
  ctx.lineTo(cx - w * 0.07, y + h * 0.54);
  ctx.lineTo(cx, y + h * 0.54);
  ctx.lineTo(cx - w * 0.04, y + h * 0.7);
  ctx.lineTo(cx + w * 0.08, y + h * 0.5);
  ctx.lineTo(cx + w * 0.01, y + h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAtlas(ctx: CanvasRenderingContext2D, texts: SignTexts): void {
  const { rects } = DETAIL_TEXTURE;
  // Black everywhere, so nothing but the signs and the puddles glows.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, DETAIL_TEXTURE.widthPx, DETAIL_TEXTURE.heightPx);
  const neon = fontStack(FONTS.neon, true);
  for (const sign of ["rooftop", "cafe", "arcade"] as const)
    drawSign(
      ctx,
      rects[sign],
      texts[sign],
      PALETTE[DETAILS_LOOK.signColors[sign]],
      neon,
    );
  drawPuddle(ctx, rects.puddle);
  // The back door lamp's bulb (task 23): one even, cold violet-white.
  ctx.fillStyle = LAMP_LOOK.bulb;
  ctx.fillRect(rects.lamp.x, rects.lamp.y, rects.lamp.width, rects.lamp.height);
  // The generator (task 28): its slits' even cold glow, and its warning stencil.
  ctx.fillStyle = GENERATOR_LOOK.glow;
  ctx.fillRect(rects.glow.x, rects.glow.y, rects.glow.width, rects.glow.height);
  drawStencil(ctx, rects.stencil);
  // The overhead wires (task 29): a faint, even sheen far under the bloom, so the strands
  // read against the dark walls without glowing.
  ctx.fillStyle = WIRE_LOOK.sheen;
  ctx.fillRect(
    rects.wireSheen.x,
    rects.wireSheen.y,
    rects.wireSheen.width,
    rects.wireSheen.height,
  );
  // The wire taps' LEDs (task 33), one patch per palette colour.
  for (const [rect, color] of [
    [rects.ledRed, LED_LOOK.red],
    [rects.ledCyan, LED_LOOK.cyan],
    [rects.ledPurple, LED_LOOK.purple],
  ] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  // The small lights (task 34): a cold bulb, a cold tube, and the exit sign's lettering.
  ctx.fillStyle = LIGHTS_LOOK.bulb;
  ctx.fillRect(
    rects.lightBulb.x,
    rects.lightBulb.y,
    rects.lightBulb.width,
    rects.lightBulb.height,
  );
  ctx.fillStyle = LIGHTS_LOOK.tube;
  ctx.fillRect(
    rects.lightTube.x,
    rects.lightTube.y,
    rects.lightTube.width,
    rects.lightTube.height,
  );
  // The street lamps' warm bulbs (task 40).
  ctx.fillStyle = STREET_LAMP_LOOK.bulb;
  ctx.fillRect(
    rects.lightStreet.x,
    rects.lightStreet.y,
    rects.lightStreet.width,
    rects.lightStreet.height,
  );
  drawSign(ctx, rects.exit, EXIT_SIGN, LIGHTS_LOOK.exit, neon);
  for (const [id, rect] of Object.entries(WINDOW_CELLS))
    drawWindowCell(ctx, id as WindowCellId, rect);
  // The sign plates' hover glow: red at the plates' old highlight strength once the
  // material's emissive intensity is applied (worked out in linear light).
  ctx.fillStyle = new Color(PALETTE.accent)
    .multiplyScalar(
      SIGNS_LOOK.highlightEmissive / DETAILS_LOOK.emissiveIntensity,
    )
    .getStyle();
  ctx.fillRect(
    rects.plateLit.x,
    rects.plateLit.y,
    rects.plateLit.width,
    rects.plateLit.height,
  );
}

/**
 * Every detail prop (AC units, pipes, cables, vents, puddles, the shop signs and the
 * rooftop name sign) merged into one mesh: one draw call. The metal texture comes through
 * the first UV set; the sign text and the puddles' glow through the second, from one
 * 1024 x 512 canvas used as the emissive map. Not pickable. The skill signs' backing
 * plates (`signPlates`) join it too (task 15); their hover glow swaps their atlas UVs to
 * a red patch, so it needs no second material. The windows and doors join it too (task 20):
 * frames, planks and doors as shaded boxes, and each pane a quad on its window cell of the
 * atlas (now 1024 x 1024); a flickering pane cuts out by pointing at the dark cell.
 */
export function createDetails(
  texts: SignTexts,
  signPlates: readonly Box[] = [],
  doc: Document = document,
): Details {
  const look = DETAILS_LOOK.surface;
  // Ducts (task 23), the generator (task 28), the wires (task 29) and their taps (task 33),
  // the pavement's drains, bags and litter (task 24), windows and doors join before the sign
  // plates, which must stay last among the boxes.
  const layout = withSignPlates(
    withWindows(
      withSidewalk(
        withStreetLamps(
          withLights(
            withTaps(withWires(withGenerator(withDucts(detailLayout())))),
          ),
        ),
      ),
    ),
    signPlates,
  );
  const ledStarts = blinkingLedStarts(layout);
  const lights = flickeringLightVertices(layout);
  const paneStarts = glassVertexStarts(layout);
  const flickering = flickeringPanes(layout.glass);
  const plates = signPlateVertices(layout);
  const data = detailGeometryData(layout, look.tileM, DETAILS_LOOK.shades);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  const atlasUvs = new Float32BufferAttribute(data.atlasUvs, 2);
  let platesLit = false;
  let flickerMs = 0;
  let cutOut: number | undefined;
  let darkened: number | undefined;
  let litOut: number | undefined;
  const glows = glowUvs();
  const dark = centreUv(DETAIL_TEXTURE.rects.dark);
  /** Points every corner of the glowing box from vertex `start` at its glow, or at the dark patch. */
  const setGlowBox = (start: number, lit: boolean): void => {
    const part = layout.boxes[start / VERTICES_PER_BOX];
    if (part === undefined) return;
    const [u, v] = lit ? glows[part.glow ?? "red"] : dark;
    for (let i = start; i < start + VERTICES_PER_BOX; i += 1)
      atlasUvs.setXY(i, u, v);
    atlasUvs.addUpdateRange(start * 2, VERTICES_PER_BOX * 2);
    atlasUvs.needsUpdate = true;
  };
  /** Turns blinking LED `index` on or off. */
  const setLed = (index: number, lit: boolean): void => {
    const start = ledStarts[index];
    if (start !== undefined) setGlowBox(start, lit);
  };
  /** Turns flickering light `index` on or off: its glowing boxes, or its face (the exit sign). */
  const setLight = (index: number, lit: boolean): void => {
    const light = lights[index];
    if (light === undefined) return;
    for (const start of light.boxStarts) setGlowBox(start, lit);
    const faceStart = light.faceStart;
    if (faceStart === undefined) return;
    const corners = cornerUvs(DETAIL_TEXTURE.rects.exit);
    corners.forEach(([u, v], corner) => {
      const [du, dv] = dark;
      atlasUvs.setXY(faceStart + corner, lit ? u : du, lit ? v : dv);
    });
    atlasUvs.addUpdateRange(faceStart * 2, 8);
    atlasUvs.needsUpdate = true;
  };
  /** Points pane `index` (into `layout.glass`) at a window cell of the atlas. */
  const setPaneCell = (index: number, id: WindowCellId): void => {
    const start = paneStarts[index];
    if (start === undefined) return;
    cornerUvs(WINDOW_CELLS[id]).forEach(([u, v], corner) => {
      atlasUvs.setXY(start + corner, u, v);
    });
    // Upload just this pane's corners, not the whole mesh's UVs (the wires make it large).
    atlasUvs.addUpdateRange(start * 2, 8);
    atlasUvs.needsUpdate = true;
  };
  geometry.setAttribute("uv1", atlasUvs);
  geometry.setAttribute("color", new Float32BufferAttribute(data.colors, 3));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();

  const canvas = doc.createElement("canvas");
  canvas.width = DETAIL_TEXTURE.widthPx;
  canvas.height = DETAIL_TEXTURE.heightPx;
  const ctx = canvas.getContext("2d");
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  // The atlas is read through the second UV set, so the metal keeps the first.
  atlas.channel = 1;

  const material = new MeshStandardMaterial({
    vertexColors: true,
    emissive: new Color(1, 1, 1),
    emissiveMap: atlas,
    emissiveIntensity: DETAILS_LOOK.emissiveIntensity,
  });
  // Rust and wear (task 22): a repeating tile read through the metal's UVs, which are in
  // tiles of `look.tileM` metres, scaled to the grime tile's size.
  // Stickers and worn edges on the sign boxes, AC units and doors (task 22 review).
  const grime = createPropGrime(doc);
  const stickerTile = createStickerTile(doc);
  const wear = detailWearAttributes(layout, data.positions.length / 3);
  geometry.setAttribute("faceUv", new Float32BufferAttribute(wear.faceUvs, 2));
  geometry.setAttribute(
    "faceSize",
    new Float32BufferAttribute(wear.faceSizes, 2),
  );
  geometry.setAttribute(
    "sticker",
    new Float32BufferAttribute(wear.stickers, 1),
  );
  addGrime(material, {
    grime,
    source: { kind: "uv", scale: look.tileM / PROP_GRIME.tileM },
    wear: {
      stickers: stickerTile.texture,
      scale: look.tileM / STICKER_TILE.tileM,
    },
  });
  const apply = (params: SurfaceMaterialParams<Texture>): void => {
    material.color.set(params.color);
    material.map = params.map;
    material.normalMap = params.normalMap;
    material.roughnessMap = params.roughnessMap;
    material.roughness = params.roughness;
    material.metalness = params.metalness;
    material.envMapIntensity = params.envMapIntensity;
    material.needsUpdate = true;
  };
  apply(
    surfaceMaterialParams<Texture>(look, {
      color: null,
      normal: null,
      roughness: null,
    }),
  );

  const mesh = new Mesh(geometry, material);
  mesh.name = "details";

  const redraw = (): void => {
    if (ctx === null) return;
    drawAtlas(ctx, texts);
    atlas.needsUpdate = true;
  };
  redraw();

  return {
    object: mesh,
    applyTextures(textures) {
      apply(surfaceMaterialParams(look, textures[look.slot].maps));
    },
    setSignPlatesLit(on) {
      const [u, v] = centreUv(
        on ? DETAIL_TEXTURE.rects.plateLit : DETAIL_TEXTURE.rects.dark,
      );
      if (plates.count === 0 || on === platesLit) return;
      platesLit = on;
      for (let i = plates.start; i < plates.start + plates.count; i += 1)
        atlasUvs.setXY(i, u, v);
      atlasUvs.addUpdateRange(plates.start * 2, plates.count * 2);
      atlasUvs.needsUpdate = true;
    },
    update(dtMs, reducedMotion) {
      // Kept within one flicker cycle, so it never grows without bound.
      flickerMs = (flickerMs + Math.max(0, dtMs)) % FLICKER_CYCLE_MS;
      // The taps' blinking LEDs (task 33), never in a window's slot.
      const led = darkLed(flickerMs, ledStarts.length, reducedMotion);
      if (led !== darkened) {
        if (darkened !== undefined) setLed(darkened, true);
        darkened = led;
        if (led !== undefined) setLed(led, false);
      }
      // The small lights (task 34), in their own slots of the same budget.
      const light = cutOutLight(flickerMs, lights.length, reducedMotion);
      if (light !== litOut) {
        if (litOut !== undefined) setLight(litOut, true);
        litOut = light;
        if (light !== undefined) setLight(light, false);
      }
      const next = dimmedWindow(flickerMs, flickering.length, reducedMotion);
      if (next === cutOut) return;
      const restore = cutOut === undefined ? undefined : flickering[cutOut];
      const pane = restore === undefined ? undefined : layout.glass[restore];
      if (restore !== undefined && pane !== undefined)
        setPaneCell(restore, pane.cell);
      cutOut = next;
      const dim = next === undefined ? undefined : flickering[next];
      if (dim !== undefined) setPaneCell(dim, "dark");
    },
    redraw,
    dispose() {
      // The metal maps belong to the asset loader, which disposes them.
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      grime.dispose();
      stickerTile.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

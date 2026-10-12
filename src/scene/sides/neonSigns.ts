import {
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import type { Skill } from "@/content/types";
import { FONTS, fontStack } from "@/logic/assetManifest";
import { boxesGeometryData } from "@/logic/boxGeometry";
import { glowGeometryData } from "@/logic/cabinetLayout";
import { SIGNS_LOOK } from "@/logic/lookConfig";
import {
  FLICKER_CYCLE_MS,
  dimmedSign,
  flickerLevels,
  seedFromText,
} from "@/logic/neonFlicker";
import { PALETTE } from "@/logic/palette";
import {
  SIGN_TEXTURE,
  signColors,
  skillSignsLayout,
} from "@/logic/skillSignsLayout";
import { fitFont, glowText, toGeometry } from "./canvasText";

/** What a sign shows about a skill (from `src/content/skills.ts`). */
export type SignSkill = Pick<Skill, "id" | "name" | "group" | "level">;

export type NeonSigns = {
  readonly object: Group;
  setHighlighted(on: boolean): void;
  /** Runs the flicker; steady under reduced motion. */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Draws the atlas again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

const LEVEL_MAX = 5;

/** One sign per atlas cell: a neon tube frame, the skill's name and its level as pips. */
function drawAtlas(
  ctx: CanvasRenderingContext2D,
  skills: readonly SignSkill[],
  colors: readonly string[],
): void {
  const w = SIGN_TEXTURE.cellWidthPx;
  const h = SIGN_TEXTURE.cellHeightPx;
  const neon = fontStack(FONTS.neon, true);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = PALETTE.base;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";

  skills.forEach((skill, i) => {
    const top = i * h;
    const color = colors[i] ?? PALETTE.accent;

    // The tube frame: a soft glow, then a pale hot core.
    ctx.beginPath();
    ctx.roundRect(14, top + 14, w - 28, h - 28, 22);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgb(255 255 255 / 55%)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const name = skill.name.toUpperCase();
    fitFont(ctx, name, neon, 54, w - 96);
    glowText(ctx, name, w / 2, top + h * 0.42, color, 14);
    ctx.fillStyle = "rgb(255 255 255 / 70%)";
    ctx.fillText(name, w / 2, top + h * 0.42);

    // Level pips: lit up to the skill's level.
    const pipGap = 26;
    const startX = w / 2 - ((LEVEL_MAX - 1) * pipGap) / 2;
    for (let p = 0; p < LEVEL_MAX; p += 1) {
      ctx.beginPath();
      ctx.arc(startX + p * pipGap, top + h * 0.76, 6, 0, Math.PI * 2);
      if (p < skill.level) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = "rgb(255 255 255 / 22%)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  });
}

/**
 * The left side's cluster of neon skill signs: one atlas canvas texture with a cell per
 * skill, every sign face merged into one mesh (one draw call) and every backing plate into
 * another. The flicker dims one sign at a time through vertex colours, so no texture
 * redraws. The whole cluster is picked as `spot-left` and lights up together on hover.
 */
export function createNeonSigns(
  skills: readonly SignSkill[],
  doc: Document = document,
): NeonSigns {
  const layout = skillSignsLayout(skills.length);
  const shown = skills.slice(0, layout.signs.length);
  const colors = signColors(shown.map((s) => s.group)).map((t) => PALETTE[t]);

  const plateGeometry = toGeometry(
    boxesGeometryData(
      layout.signs.map((sign) => sign.plate),
      1,
    ),
  );
  const plate = new MeshStandardMaterial({
    color: PALETTE.signPlate,
    roughness: SIGNS_LOOK.plateRoughness,
    metalness: SIGNS_LOOK.plateMetalness,
  });
  const plateLit = plate.clone();
  plateLit.emissive.set(PALETTE.accent);
  plateLit.emissiveIntensity = SIGNS_LOOK.highlightEmissive;
  const plateMesh = new Mesh(plateGeometry, plate);
  plateMesh.name = "sign-plates";

  const canvas = doc.createElement("canvas");
  canvas.width = layout.atlas.widthPx;
  canvas.height = layout.atlas.heightPx;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const faceGeometry = toGeometry(
    glowGeometryData(layout.signs.map((sign) => sign.quad)),
  );
  // Four vertices per sign; their colour is the sign's flicker level.
  const levels = new Float32Array(layout.signs.length * 4 * 3).fill(1);
  const levelAttribute = new Float32BufferAttribute(levels, 3);
  faceGeometry.setAttribute("color", levelAttribute);
  const faceMaterial = new MeshBasicMaterial({
    map: texture,
    vertexColors: true,
  });
  faceMaterial.color.setScalar(SIGNS_LOOK.faceIntensity);
  const faceMesh = new Mesh(faceGeometry, faceMaterial);
  faceMesh.name = "sign-faces";

  const group = new Group();
  group.name = layout.id;
  group.userData = { spotId: layout.id, side: layout.side };
  group.add(plateMesh, faceMesh);

  const seed = seedFromText(shown.map((s) => s.id).join("|"));
  let elapsedMs = 0;
  let dimmed: number | undefined;

  const applyLevels = (reducedMotion: boolean): void => {
    const next = flickerLevels(elapsedMs, seed, shown.length, reducedMotion);
    next.forEach((level, sign) => {
      for (let v = 0; v < 4; v += 1)
        levelAttribute.setXYZ(sign * 4 + v, level, level, level);
    });
    levelAttribute.needsUpdate = true;
  };

  const redraw = (): void => {
    if (ctx === null) return;
    drawAtlas(ctx, shown, colors);
    texture.needsUpdate = true;
  };
  redraw();

  return {
    object: group,
    setHighlighted(on) {
      plateMesh.material = on ? plateLit : plate;
      faceMaterial.color.setScalar(
        on ? SIGNS_LOOK.litFaceIntensity : SIGNS_LOOK.faceIntensity,
      );
    },
    update(dtMs, reducedMotion) {
      // Kept within one flicker cycle, so it never grows without bound.
      elapsedMs = (elapsedMs + Math.max(0, dtMs)) % FLICKER_CYCLE_MS;
      const next = dimmedSign(elapsedMs, seed, shown.length, reducedMotion);
      if (next === dimmed) return;
      dimmed = next;
      applyLevels(reducedMotion);
    },
    redraw,
    dispose() {
      group.clear();
      plateGeometry.dispose();
      plate.dispose();
      plateLit.dispose();
      faceGeometry.dispose();
      faceMaterial.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

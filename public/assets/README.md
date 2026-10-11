# Assets

Put downloaded assets here. Everything must be CC0 or SIL Open Font License; no account-locked or paid assets. The site works without any of them (plain fallbacks) and looks better once they are added.

## textures/

From [ambientCG](https://ambientcg.com), 1K JPG. One folder per material. From each ambientCG zip keep three maps and rename them, dropping the material and size prefix (for example `Bricks076C_1K-JPG_Color.jpg` becomes `Color.jpg`):

```
textures/<folder>/Color.jpg       (from <Name>_1K-JPG_Color.jpg)
textures/<folder>/NormalGL.jpg    (from <Name>_1K-JPG_NormalGL.jpg)
textures/<folder>/Roughness.jpg   (from <Name>_1K-JPG_Roughness.jpg)
```

| Folder               | Material                          |
| -------------------- | --------------------------------- |
| `textures/concrete/` | a concrete wall                   |
| `textures/brick/`    | a brick wall (graffiti alley)     |
| `textures/asphalt/`  | wet asphalt or road               |
| `textures/metal/`    | rusty corrugated or painted metal |
| `textures/grate/`    | a metal grate or floor plate      |

Without `Color.jpg` a material uses a plain colour (its other two maps are then ignored). A missing `NormalGL.jpg` or `Roughness.jpg` only drops that map.

## fonts/

From [Google Fonts](https://fonts.google.com). Put one file per font straight in `fonts/`, named after the family with the spaces removed, as `.woff2` or `.ttf` (`.woff2` is tried first). For Orbitron, rename the regular weight (for example `static/Orbitron-Regular.ttf`):

| File                                                         | Font             | Used for                   |
| ------------------------------------------------------------ | ---------------- | -------------------------- |
| `fonts/Orbitron.woff2` or `fonts/Orbitron.ttf`               | Orbitron         | neon signs, loading screen |
| `fonts/ShareTechMono.woff2` or `fonts/ShareTechMono.ttf`     | Share Tech Mono  | terminal and CRT           |
| `fonts/PermanentMarker.woff2` or `fonts/PermanentMarker.ttf` | Permanent Marker | graffiti                   |

A missing font falls back to a system font.

## thumbnails/

A screenshot of each project for the graffiti wall, about 512 px wide. Dummy placeholders are generated until then.

## Optional, later

A night-sky or city backdrop image for the moving background.

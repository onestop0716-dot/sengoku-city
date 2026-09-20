// 木（森のマス）と建設中の足場。
import { createBuilder } from './builder.js';
import { C } from './palette.js';

export function tree({ variant = 0 }) {
  const B = createBuilder();
  if (variant === 0) {          // 針葉樹風（重ねた円錐）
    B.cylinder(0, 0, 0, 0.06, 0.3, C.trunk, 5);
    B.cone(0, 0.25, 0, 0.32, 0.5, C.leafDark, 6);
    B.cone(0, 0.6, 0, 0.24, 0.45, C.leaf, 6);
  } else if (variant === 1) {   // 広葉樹風（八面体）
    B.cylinder(0, 0, 0, 0.07, 0.4, C.trunk, 5);
    B.cone(0, 0.35, 0, 0.36, 0.4, C.leaf, 6, 0);
    B.cone(0, 0.75, 0, 0.36, -0.4, C.leafLight, 6, 0);
  } else {                      // 細長い木
    B.cylinder(0, 0, 0, 0.05, 0.6, C.trunk, 5);
    B.cone(0, 0.45, 0, 0.22, 0.7, C.leafDark, 5);
  }
  return B.build();
}

export function scaffold() {
  const B = createBuilder();
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) B.box(x, 0, z, 0.05, 0.6, 0.05, C.wood);
  B.box(0, 0.55, -0.35, 0.75, 0.04, 0.04, C.woodDark); B.box(0, 0.55, 0.35, 0.75, 0.04, 0.04, C.woodDark);
  B.box(-0.35, 0.55, 0, 0.04, 0.04, 0.75, C.woodDark); B.box(0.35, 0.55, 0, 0.04, 0.04, 0.75, C.woodDark);
  B.box(0, 0, 0, 0.5, 0.12, 0.5, C.earthDark);
  return B.build();
}

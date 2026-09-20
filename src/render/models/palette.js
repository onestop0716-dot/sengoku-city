// 戦国時代の建材の色。版築（黄土）、木、茅、瓦（灰色）。
export const C = {
  earth: 0xc9a978, earthDark: 0xb08f5f, wood: 0x8b5a2b, woodDark: 0x6b4423,
  thatch: 0xb89b5e, thatchDark: 0x9c8148, tile: 0x6b6b70, tileDark: 0x55555a,
  soil: 0x8b6b3f, soilWet: 0x6f5535, water: 0x5f9fbf, straw: 0xd9c27a,
  leaf: 0x4f8f3e, leafDark: 0x3f7332, leafLight: 0x6faa4a, trunk: 0x6b4a2a,
  lacquer: 0x8b1a1a, plaster: 0xe8dcc0,
};
export const shadeHex = (hex, f) => {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

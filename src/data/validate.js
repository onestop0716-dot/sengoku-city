// data/*.json の整合性チェック。起動時と `npm run validate` の両方で使う。

const FORBIDDEN_WORDS = ['紙', '椅子', '茶', '綿', '仏', '寺院', '火薬', '鐙', '磁器', 'トウモロコシ', '唐辛子', 'サツマイモ', '一輪車'];

/**
 * @param {object} raw { nations, cities, terrain, zones, buildings, crops, assets, balance, terms }
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateData(raw) {
  const errors = [], warnings = [];
  const req = (name) => { if (!raw[name]) errors.push(`${name}.json がありません`); };
  ['nations', 'cities', 'terrain', 'zones', 'buildings', 'crops', 'assets', 'balance', 'terms', 'structures', 'difficulties', 'advice', 'persons', 'offices', 'ranks', 'techs'].forEach(req);
  if (errors.length) return { errors, warnings };

  const ids = (arr, name) => {
    const set = new Set();
    for (const e of arr) {
      if (!e.id) errors.push(`${name}: id のない項目があります`);
      else if (set.has(e.id)) errors.push(`${name}: id "${e.id}" が重複しています`);
      else if (!/^[a-z0-9_]+$/.test(e.id)) errors.push(`${name}: id "${e.id}" は snake_case の ASCII にしてください`);
      set.add(e.id);
    }
    return set;
  };
  const nationIds = ids(raw.nations, 'nations');
  const cityIds = ids(raw.cities, 'cities');
  const zoneIds = ids(raw.zones, 'zones');
  const buildingIds = ids(raw.buildings, 'buildings');
  const cropIds = ids(raw.crops, 'crops');
  const assetIds = ids(raw.assets, 'assets');
  const termIds = ids(raw.terms, 'terms');
  const tileIds = ids(raw.terrain.tiles, 'terrain.tiles');
  ids(raw.terrain.resources, 'terrain.resources');

  for (const n of raw.nations) {
    if (!cityIds.has(n.capital)) errors.push(`nations/${n.id}: capital "${n.capital}" が cities にありません`);
    for (const c of n.startCities || []) if (!cityIds.has(c)) errors.push(`nations/${n.id}: startCities "${c}" が cities にありません`);
    if (!n.startCities?.includes(n.capital)) warnings.push(`nations/${n.id}: 首都 ${n.capital} が startCities に含まれていません`);
  }
  for (const c of raw.cities) {
    if (!nationIds.has(c.nation)) errors.push(`cities/${c.id}: nation "${c.nation}" がありません`);
    if (!c.terrainProfile) errors.push(`cities/${c.id}: terrainProfile がありません`);
    for (const k of Object.keys(c.cropAffinity || {})) if (!cropIds.has(k)) errors.push(`cities/${c.id}: cropAffinity "${k}" が crops にありません`);
  }
  for (const z of raw.zones) {
    if (!z.buildings?.length) errors.push(`zones/${z.id}: buildings が空です`);
    for (const b of z.buildings || []) if (!buildingIds.has(b.id)) errors.push(`zones/${z.id}: building "${b.id}" がありません`);
    if (z.crop && !cropIds.has(z.crop)) errors.push(`zones/${z.id}: crop "${z.crop}" がありません`);
    if (z.term && !termIds.has(z.term)) warnings.push(`zones/${z.id}: term "${z.term}" が terms にありません`);
  }
  for (const b of raw.buildings) {
    if (b.zone && !zoneIds.has(b.zone)) errors.push(`buildings/${b.id}: zone "${b.zone}" がありません`);
    if (b.crop && !cropIds.has(b.crop)) errors.push(`buildings/${b.id}: crop "${b.crop}" がありません`);
    if (!Array.isArray(b.size) || b.size.length !== 2) errors.push(`buildings/${b.id}: size は [w,h] にしてください`);
    if (!b.levels?.length) errors.push(`buildings/${b.id}: levels が空です`);
    for (const lv of b.levels || []) {
      if (!lv.models || lv.models.length < 3) errors.push(`buildings/${b.id} L${lv.level}: 外観は3種以上必要です`);
      for (const m of lv.models || []) if (!assetIds.has(m)) errors.push(`buildings/${b.id} L${lv.level}: model "${m}" が assets にありません`);
    }
  }
  ids(raw.structures, 'structures');
  ids(raw.difficulties, 'difficulties');
  if (!raw.difficulties.some((d) => d.id === 'normal')) errors.push('difficulties: id "normal" が必要です');
  for (const s of raw.structures) {
    if (!s.linear && (!Array.isArray(s.size) || s.size.length !== 2)) errors.push(`structures/${s.id}: size は [w,h] にしてください`);
    if (!s.models?.length) errors.push(`structures/${s.id}: models がありません`);
    for (const m of s.models || []) if (!assetIds.has(m)) errors.push(`structures/${s.id}: model "${m}" が assets にありません`);
    if (!s.effects) errors.push(`structures/${s.id}: effects がありません`);
    if (s.term && !termIds.has(s.term)) warnings.push(`structures/${s.id}: term "${s.term}" が terms にありません`);
  }
  for (const a of raw.assets) {
    if (a.kind === 'procedural' && !a.generator) errors.push(`assets/${a.id}: generator がありません`);
    if (a.kind === 'gltf' && !a.src) errors.push(`assets/${a.id}: src がありません`);
    if (a.kind === 'gltf' && !a.credit) warnings.push(`assets/${a.id}: 外部素材は credit（CREDITS.md への参照）を書いてください`);
  }
  for (const t of raw.terrain.tiles) if (!t.color) errors.push(`terrain/${t.id}: color がありません`);
  // 人材・官職・官位・技術
  if (raw.persons && raw.offices && raw.ranks && raw.techs) {
    const nationIds = new Set(raw.nations.map((n) => n.id));
    ids(raw.persons, 'persons'); ids(raw.offices, 'offices'); ids(raw.ranks, 'ranks');
    const techIds = ids(raw.techs, 'techs');
    for (const p of raw.persons) {
      if (!nationIds.has(p.nation)) errors.push(`persons/${p.id}: nation "${p.nation}" が nations にありません`);
      for (const k of ['lead', 'valor', 'wit', 'politics', 'charm']) { const v = p.stats?.[k]; if (typeof v !== 'number' || v < 1 || v > 100) errors.push(`persons/${p.id}: stats.${k} は 1〜100 の数にしてください`); }
      if (typeof p.appears !== 'number') errors.push(`persons/${p.id}: appears（登場年）がありません`);
      if (p.died !== null && typeof p.died !== 'number') errors.push(`persons/${p.id}: died は数か null にしてください`);
      if (p.born !== null && p.died !== null && p.born >= p.died) errors.push(`persons/${p.id}: born が died 以降です`);
      if (!p.source) errors.push(`persons/${p.id}: source（出典）がありません`);
      if (!p.note) warnings.push(`persons/${p.id}: note（要確認事項）がありません`);
    }
    const rankIds = new Set(raw.ranks.map((r) => r.id));
    for (const o of raw.offices) {
      if (!Array.isArray(o.mainStats) || !o.mainStats.length) errors.push(`offices/${o.id}: mainStats がありません`);
      if (o.minRank && !rankIds.has(o.minRank)) errors.push(`offices/${o.id}: minRank "${o.minRank}" が ranks にありません`);
      if (typeof o.salary !== 'number') errors.push(`offices/${o.id}: salary がありません`);
      if (o.term && !termIds.has(o.term)) warnings.push(`offices/${o.id}: term "${o.term}" が terms にありません`);
    }
    for (const t of raw.techs) {
      for (const r of t.requires || []) if (!techIds.has(r)) errors.push(`techs/${t.id}: requires "${r}" が techs にありません`);
      if (typeof t.cost !== 'number' || typeof t.days !== 'number') errors.push(`techs/${t.id}: cost と days が必要です`);
      for (const u of t.unlocks || []) if (!raw.structures.some((s) => s.id === u)) errors.push(`techs/${t.id}: unlocks "${u}" が structures にありません`);
    }
    for (const n of raw.nations) for (const s of n.startTechs || []) if (!techIds.has(s)) errors.push(`nations/${n.id}: startTechs "${s}" が techs にありません`);
    for (const s of raw.structures) if (s.unlock?.tech && !techIds.has(s.unlock.tech)) errors.push(`structures/${s.id}: unlock.tech "${s.unlock.tech}" が techs にありません`);
  }

  // 案内役の助言
  if (raw.advice) {
    const A = raw.advice, ex = new Set(A.expressions || []);
    if (!A.advices || !Array.isArray(A.advices)) errors.push('advice: advices がありません');
    if (!A.frequency?.normal) errors.push('advice: frequency.normal が必要です');
    ids(A.advices || [], 'advice/advices'); ids(A.tutorial || [], 'advice/tutorial');
    const checkCond = (c, where) => {
      if (!c || typeof c !== 'object') { errors.push(`${where}: 条件が不正です`); return; }
      if (c.all) c.all.forEach((x) => checkCond(x, where)); else if (c.any) c.any.forEach((x) => checkCond(x, where)); else if (c.not) checkCond(c.not, where);
      else if (!c.metric) errors.push(`${where}: metric がありません`);
    };
    for (const e of A.advices || []) {
      if (!ex.has(e.expression)) errors.push(`advice/${e.id}: expression "${e.expression}" は expressions にありません`);
      if (typeof e.priority !== 'number') errors.push(`advice/${e.id}: priority がありません`);
      if (!e.text) errors.push(`advice/${e.id}: text がありません`);
      checkCond(e.when, `advice/${e.id}`);
    }
    for (const t of A.tutorial || []) { if (!t.text) errors.push(`advice/tutorial/${t.id}: text がありません`); if (t.done) checkCond(t.done, `advice/tutorial/${t.id}`); if (t.expression && !ex.has(t.expression)) errors.push(`advice/tutorial/${t.id}: expression が不正です`); }
  }
  if (!tileIds.has('plain') || !tileIds.has('river')) errors.push('terrain: plain と river は必須です');

  // 時代考証の禁止語（表示文字列のみ）
  const check = (file, e) => {
    const allow = String(e.note || '').match(/allow:([^\s]+)/g)?.map((s) => s.slice(6)) || [];
    for (const key of ['name', 'desc', 'bio', 'term', 'title', 'text', 'todo']) {
      const text = e[key];
      if (typeof text !== 'string') continue;
      for (const w of FORBIDDEN_WORDS) if (text.includes(w) && !allow.includes(w)) warnings.push(`${file}/${e.id}: ${key} に禁止語「${w}」が含まれています`);
    }
  };
  for (const [file, arr] of [['nations', raw.nations], ['cities', raw.cities], ['zones', raw.zones], ['buildings', raw.buildings], ['crops', raw.crops], ['terms', raw.terms], ['structures', raw.structures], ['advice', raw.advice?.advices || []], ['advice/tutorial', raw.advice?.tutorial || []], ['persons', raw.persons || []], ['offices', raw.offices || []], ['techs', raw.techs || []]]) arr.forEach((e) => check(file, e));

  return { errors, warnings };
}

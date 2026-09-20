// 特殊建築の効果を日本語で説明する。
export function effectText(e) {
  const r = e.radius ? `（半径${e.radius}）` : '';
  switch (e.type) {
    case 'water': return `水を供給${r}`;
    case 'market_admin': return `市の管理範囲${r}`;
    case 'security': return `治安 +${e.value}${r}`;
    case 'granary_capacity': return `穀倉の容量 +${e.value.toLocaleString('ja-JP')}石`;
    case 'loyalty': return `民忠 ${e.value > 0 ? '+' : ''}${e.value}`;
    case 'defense': return `守備力 +${e.value}`;
    case 'irrigation': return `隣の畑の収量 +${Math.round(e.value * 100)}%`;
    case 'road': return '道路として通れる';
    case 'flood_protection': return `洪水の被害 −${Math.round(e.value * 100)}%（フェーズ7）`;
    case 'hygiene': return `衛生 +`;
    case 'famine_mitigation': return `飢饉の被害 −${Math.round(e.value * 100)}%（フェーズ7）`;
    case 'equipment_capacity': return `装備の保管 ${e.value}（フェーズ6）`;
    case 'training': return '兵の練度が上がる（フェーズ6）';
    case 'research': return `研究 +${Math.round(e.value * 100)}%（フェーズ4）`;
    case 'visitor': return '諸子百家の来訪（フェーズ4）';
    case 'prestige': return `威信 +${e.value}（フェーズ5）`;
    case 'customs': return '関税を徴収（フェーズ5）';
    case 'warning': return '敵の接近を早く知る（フェーズ6）';
    case 'post': return '使者・商隊が速くなる（フェーズ5）';
    case 'dock': return '舟が発着する';
    case 'farm_demand': return `農の需要 +${e.value}`;
    case 'disaster_mitigation': return `災害の被害 −${Math.round(e.value * 100)}%（フェーズ7）`;
    default: return e.type;
  }
}

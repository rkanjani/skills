// Every on-screen string lives here so the script, the ledger check, and the picture agree.
// The defaults read from brand.json so a fresh scaffold renders; replace them with the script.
// Keep lines short: each scene gets 1.5 s plus 0.3 s per word (hook 2 to 6 words, feature titles
// 1 to 4 words with a proof line under 8 words, payoff 3 to 5 words, tagline under 6 words).

export function makeCopy(brand) {
  const features = (brand.features ?? []).slice(0, 3);
  return {
    eyebrow: brand.category ?? brand.name,
    hook: ['Stop', 'guessing.'],
    features: features.map((f, i) => ({
      index: String(i + 1).padStart(2, '0'),
      title: f.name,
      proof: f.proof ?? f.description ?? '',
      icon: f.icon ?? 'sparkles',
    })),
    payoff: (brand.payoff ?? (brand.one_liner ?? `${brand.name}.`).split(' ')).slice(0, 5),
    tagline: brand.one_liner ?? '',
    cta: brand.cta?.url ?? brand.url ?? brand.name,
    fineprint: brand.cta?.fineprint ?? '',
  };
}

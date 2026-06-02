const ALLERGEN_RULES: Array<{ allergen: string; keywords: string[] }> = [
  { allergen: 'Gluten', keywords: ['flour', 'wheat', 'bread', 'pasta', 'rye', 'barley', 'oat', 'semolina', 'spelt', 'durum', 'croissant', 'bagel', 'soy sauce', 'miso', 'beer', 'malt'] },
  { allergen: 'Dairy', keywords: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'ricotta', 'whey', 'lactose', 'ghee', 'sour cream', 'ice cream'] },
  { allergen: 'Eggs', keywords: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue', 'albumen'] },
  { allergen: 'Nuts', keywords: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'macadamia', 'hazelnut', 'brazil nut', 'pine nut', 'chestnut', 'mixed nuts'] },
  { allergen: 'Peanuts', keywords: ['peanut', 'peanut butter', 'groundnut'] },
  { allergen: 'Sesame', keywords: ['sesame', 'tahini', 'sesame oil', 'sesame seed'] },
  { allergen: 'Soy', keywords: ['soy', 'soya', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce', 'tamari'] },
  { allergen: 'Fish', keywords: ['fish', 'salmon', 'tuna', 'cod', 'sardine', 'anchovy', 'anchovies', 'herring', 'bass', 'trout', 'snapper', 'fish sauce', 'worcestershire'] },
  { allergen: 'Shellfish', keywords: ['prawn', 'shrimp', 'crab', 'lobster', 'crayfish', 'oyster', 'mussel', 'scallop', 'clam', 'squid', 'calamari', 'octopus'] },
  { allergen: 'Lupin', keywords: ['lupin', 'lupine'] },
  { allergen: 'Sulphites', keywords: ['sulphite', 'sulfite', 'dried fruit', 'wine vinegar', 'white wine', 'red wine'] },
]

export function detectAllergensRuleBased(ingredientNames: string[]): string[] {
  const detected = new Set<string>()
  const combined = ingredientNames.join(' ').toLowerCase()
  for (const rule of ALLERGEN_RULES) {
    for (const kw of rule.keywords) {
      if (combined.includes(kw)) { detected.add(rule.allergen); break }
    }
  }
  return [...detected]
}

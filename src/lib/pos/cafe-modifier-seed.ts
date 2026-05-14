/**
 * Standard cafe modifier library — 12 groups, ~70 modifiers.
 * Data only. Inserted via seedCafeModifierLibrary(business_id).
 * Covers Square + Toast + Starbucks customisation coverage.
 */

interface SeedModifier {
  name: string
  price_adjustment: number
  price_per_size?: Record<string, number>
  is_default?: boolean
  allow_quantity?: boolean
  max_quantity?: number
  display_order: number
}

interface SeedGroup {
  name: string
  display_name?: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  allow_quantity: boolean
  show_conversational_buttons: boolean
  display_order: number
  color: string
  modifiers: SeedModifier[]
}

export const STANDARD_CAFE_MODIFIER_GROUPS: SeedGroup[] = [
  {
    name: 'Size', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 0, color: '#7FB897',
    modifiers: [
      { name: 'Small',       price_adjustment: 0,    is_default: true,  display_order: 0 },
      { name: 'Medium',      price_adjustment: 0.50,                    display_order: 1 },
      { name: 'Large',       price_adjustment: 1.00,                    display_order: 2 },
      { name: 'Extra Large', price_adjustment: 1.50,                    display_order: 3 },
    ],
  },
  {
    name: 'Temperature', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 1, color: '#F59E0B',
    modifiers: [
      { name: 'Hot',        price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Iced',       price_adjustment: 0,                   display_order: 1 },
      { name: 'Extra Hot',  price_adjustment: 0,                   display_order: 2 },
      { name: 'Warm',       price_adjustment: 0,                   display_order: 3 },
    ],
  },
  {
    name: 'Milk Type', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: true, display_order: 2, color: '#7FB897',
    modifiers: [
      { name: 'Whole Milk',          price_adjustment: 0,    is_default: true,  display_order: 0 },
      { name: 'Skim Milk',           price_adjustment: 0,                       display_order: 1 },
      { name: 'Lactose-Free',        price_adjustment: 0,                       display_order: 2 },
      { name: 'Soy Milk',            price_adjustment: 0.70,                    display_order: 3 },
      { name: 'Almond Milk',         price_adjustment: 0.70,                    display_order: 4 },
      { name: 'Oat Milk',            price_adjustment: 0.90,                    display_order: 5 },
      { name: 'Coconut Milk',        price_adjustment: 0.70,                    display_order: 6 },
      { name: 'Macadamia Milk',      price_adjustment: 1.00,                    display_order: 7 },
      { name: 'Protein-Boosted Milk',price_adjustment: 1.50,                    display_order: 8 },
    ],
  },
  {
    name: 'Espresso Shots', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: null, allow_quantity: true,
    show_conversational_buttons: true, display_order: 3, color: '#92400E',
    modifiers: [
      { name: 'Single Shot',  price_adjustment: 0,    is_default: false,               display_order: 0 },
      { name: 'Double Shot',  price_adjustment: 0.80,                                  display_order: 1 },
      { name: 'Triple Shot',  price_adjustment: 1.60,                                  display_order: 2 },
      { name: 'Extra Shot',   price_adjustment: 0.80, allow_quantity: true, max_quantity: 4, display_order: 3 },
      { name: 'Decaf',        price_adjustment: 0,                                     display_order: 4 },
      { name: 'Half-Caf',     price_adjustment: 0,                                     display_order: 5 },
      { name: 'Blonde Roast', price_adjustment: 0,                                     display_order: 6 },
      { name: 'Ristretto',    price_adjustment: 0,                                     display_order: 7 },
    ],
  },
  {
    name: 'Syrups & Sauces', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: null, allow_quantity: true,
    show_conversational_buttons: false, display_order: 4, color: '#C084FC',
    modifiers: [
      { name: 'Vanilla',             price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 0 },
      { name: 'Caramel',             price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 1 },
      { name: 'Hazelnut',            price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 2 },
      { name: 'Mocha',               price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 3 },
      { name: 'White Mocha',         price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 4 },
      { name: 'Cinnamon Dolce',      price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 5 },
      { name: 'Brown Sugar',         price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 6 },
      { name: 'Lavender',            price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 7 },
      { name: 'Maple',               price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 8 },
      { name: 'Pumpkin Spice',       price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 9 },
      { name: 'Chai Concentrate',    price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 10 },
      { name: 'SF Vanilla',          price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 11 },
      { name: 'SF Caramel',          price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 12 },
      { name: 'SF Cinnamon Dolce',   price_adjustment: 0.50, allow_quantity: true, max_quantity: 4, display_order: 13 },
    ],
  },
  {
    name: 'Cold Foam', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 5, color: '#E0F2FE',
    modifiers: [
      { name: 'No Cold Foam',        price_adjustment: 0,    is_default: true,  display_order: 0 },
      { name: 'Vanilla Sweet Cream', price_adjustment: 0.80,                    display_order: 1 },
      { name: 'Salted Caramel',      price_adjustment: 0.80,                    display_order: 2 },
      { name: 'Pumpkin',             price_adjustment: 0.80,                    display_order: 3 },
      { name: 'Chocolate',           price_adjustment: 0.80,                    display_order: 4 },
      { name: 'Matcha',              price_adjustment: 1.00,                    display_order: 5 },
      { name: 'Non-Dairy Cold Foam', price_adjustment: 1.00,                    display_order: 6 },
      { name: 'Protein Cold Foam',   price_adjustment: 1.50,                    display_order: 7 },
    ],
  },
  {
    name: 'Foam Level', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 6, color: '#7FB897',
    modifiers: [
      { name: 'Regular Foam', price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Light Foam',   price_adjustment: 0,                   display_order: 1 },
      { name: 'Extra Foam',   price_adjustment: 0,                   display_order: 2 },
      { name: 'No Foam',      price_adjustment: 0,                   display_order: 3 },
      { name: 'Wet',          price_adjustment: 0,                   display_order: 4 },
      { name: 'Dry',          price_adjustment: 0,                   display_order: 5 },
      { name: 'Bone Dry',     price_adjustment: 0,                   display_order: 6 },
    ],
  },
  {
    name: 'Ice Level', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 7, color: '#38BDF8',
    modifiers: [
      { name: 'Regular Ice', price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Light Ice',   price_adjustment: 0,                   display_order: 1 },
      { name: 'Extra Ice',   price_adjustment: 0,                   display_order: 2 },
      { name: 'No Ice',      price_adjustment: 0,                   display_order: 3 },
    ],
  },
  {
    name: 'Whipped Cream', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: true, display_order: 8, color: '#FEF3C7',
    modifiers: [
      { name: 'No Whip',     price_adjustment: 0,    is_default: true,  display_order: 0 },
      { name: 'Regular Whip',price_adjustment: 0.50,                    display_order: 1 },
      { name: 'Light Whip',  price_adjustment: 0.50,                    display_order: 2 },
      { name: 'Extra Whip',  price_adjustment: 0.80,                    display_order: 3 },
    ],
  },
  {
    name: 'Drizzle & Topping', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: null, allow_quantity: false,
    show_conversational_buttons: false, display_order: 9, color: '#A16207',
    modifiers: [
      { name: 'Caramel Drizzle',       price_adjustment: 0.50, display_order: 0 },
      { name: 'Chocolate Drizzle',     price_adjustment: 0.50, display_order: 1 },
      { name: 'Cinnamon Dust',         price_adjustment: 0,    display_order: 2 },
      { name: 'Cocoa Powder',          price_adjustment: 0,    display_order: 3 },
      { name: 'Mocha Cookie Crumble',  price_adjustment: 0.70, display_order: 4 },
      { name: 'Honey Drizzle',         price_adjustment: 0.50, display_order: 5 },
    ],
  },
  {
    name: 'Sweetener', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: null, allow_quantity: false,
    show_conversational_buttons: false, display_order: 10, color: '#86EFAC',
    modifiers: [
      { name: 'Raw Sugar',    price_adjustment: 0, display_order: 0 },
      { name: 'White Sugar',  price_adjustment: 0, display_order: 1 },
      { name: 'Brown Sugar',  price_adjustment: 0, display_order: 2 },
      { name: 'Honey',        price_adjustment: 0, display_order: 3 },
      { name: 'Stevia',       price_adjustment: 0, display_order: 4 },
      { name: 'Splenda',      price_adjustment: 0, display_order: 5 },
      { name: 'Liquid Sugar', price_adjustment: 0, display_order: 6 },
    ],
  },
  {
    name: 'Cup Type', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 11, color: '#94A3B8',
    modifiers: [
      { name: 'Takeaway Cup',         price_adjustment: 0,     is_default: true, display_order: 0 },
      { name: 'Dine-in Mug',          price_adjustment: 0,                       display_order: 1 },
      { name: "Customer's Own Cup",   price_adjustment: -0.50,                   display_order: 2 },
      { name: 'Glass',                price_adjustment: 0,                       display_order: 3 },
      { name: 'Cold Cup with Dome',   price_adjustment: 0,                       display_order: 4 },
    ],
  },
]

/** 12-step sandwich builder modifier library */
export const STANDARD_SANDWICH_MODIFIER_GROUPS: SeedGroup[] = [
  {
    name: 'Bread', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 0, color: '#A16207',
    modifiers: [
      { name: 'Sourdough',     price_adjustment: 0,    is_default: true,  display_order: 0 },
      { name: 'Multigrain',    price_adjustment: 0,                       display_order: 1 },
      { name: 'Rye',           price_adjustment: 0,                       display_order: 2 },
      { name: 'White',         price_adjustment: 0,                       display_order: 3 },
      { name: 'Gluten-Free',   price_adjustment: 1.50,                    display_order: 4 },
      { name: 'Bagel',         price_adjustment: 0,                       display_order: 5 },
      { name: 'Croissant',     price_adjustment: 0,                       display_order: 6 },
      { name: 'English Muffin',price_adjustment: 0,                       display_order: 7 },
      { name: 'Wrap',          price_adjustment: 0,                       display_order: 8 },
      { name: 'Turkish Roll',  price_adjustment: 0,                       display_order: 9 },
      { name: 'Focaccia',      price_adjustment: 0,                       display_order: 10 },
      { name: 'Pita',          price_adjustment: 0,                       display_order: 11 },
    ],
  },
  {
    name: 'Toasted', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 1, color: '#F59E0B',
    modifiers: [
      { name: 'No',     price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Light',  price_adjustment: 0,                   display_order: 1 },
      { name: 'Medium', price_adjustment: 0,                   display_order: 2 },
      { name: 'Heavy',  price_adjustment: 0,                   display_order: 3 },
    ],
  },
  {
    name: 'Protein Quantity', selection_type: 'single', is_required: true,
    min_selections: 1, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 2, color: '#DC2626',
    modifiers: [
      { name: 'Single', price_adjustment: 0,    is_default: true, display_order: 0 },
      { name: 'Double', price_adjustment: 3.00,                   display_order: 1 },
      { name: 'Triple', price_adjustment: 6.00,                   display_order: 2 },
    ],
  },
  {
    name: 'Egg Preparation', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 3, color: '#D97706',
    modifiers: [
      { name: 'Scrambled',    price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Fried',        price_adjustment: 0,                   display_order: 1 },
      { name: 'Poached',      price_adjustment: 0,                   display_order: 2 },
      { name: 'Sunny-Side Up',price_adjustment: 0,                   display_order: 3 },
      { name: 'Hard Yolk',    price_adjustment: 0,                   display_order: 4 },
      { name: 'Soft Yolk',    price_adjustment: 0,                   display_order: 5 },
      { name: 'Boiled',       price_adjustment: 0,                   display_order: 6 },
    ],
  },
  {
    name: 'Cooking Temperature', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 4, color: '#EF4444',
    modifiers: [
      { name: 'Rare',        price_adjustment: 0,                   display_order: 0 },
      { name: 'Medium-Rare', price_adjustment: 0,                   display_order: 1 },
      { name: 'Medium',      price_adjustment: 0, is_default: true, display_order: 2 },
      { name: 'Medium-Well', price_adjustment: 0,                   display_order: 3 },
      { name: 'Well Done',   price_adjustment: 0,                   display_order: 4 },
    ],
  },
  {
    name: 'Cheese', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: 2, allow_quantity: false,
    show_conversational_buttons: false, display_order: 5, color: '#FCD34D',
    modifiers: [
      { name: 'Cheddar',      price_adjustment: 0.80,                display_order: 0 },
      { name: 'Swiss',        price_adjustment: 0.80,                display_order: 1 },
      { name: 'Mozzarella',   price_adjustment: 0.80,                display_order: 2 },
      { name: 'Brie',         price_adjustment: 1.00,                display_order: 3 },
      { name: 'Feta',         price_adjustment: 0.80,                display_order: 4 },
      { name: 'Halloumi',     price_adjustment: 1.50,                display_order: 5 },
      { name: 'Provolone',    price_adjustment: 0.80,                display_order: 6 },
      { name: 'American',     price_adjustment: 0.80,                display_order: 7 },
      { name: 'Pepper Jack',  price_adjustment: 0.80,                display_order: 8 },
      { name: 'Cream Cheese', price_adjustment: 0.80,                display_order: 9 },
      { name: 'Goat',         price_adjustment: 1.00,                display_order: 10 },
    ],
  },
  {
    name: 'Vegetables', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: 10, allow_quantity: false,
    show_conversational_buttons: false, display_order: 6, color: '#22C55E',
    modifiers: [
      { name: 'Lettuce',           price_adjustment: 0,    display_order: 0 },
      { name: 'Tomato',            price_adjustment: 0,    display_order: 1 },
      { name: 'Cucumber',          price_adjustment: 0,    display_order: 2 },
      { name: 'Red Onion',         price_adjustment: 0,    display_order: 3 },
      { name: 'Pickles',           price_adjustment: 0,    display_order: 4 },
      { name: 'Jalapeños',         price_adjustment: 0,    display_order: 5 },
      { name: 'Avocado',           price_adjustment: 2.00, display_order: 6 },
      { name: 'Sprouts',           price_adjustment: 0,    display_order: 7 },
      { name: 'Spinach',           price_adjustment: 0,    display_order: 8 },
      { name: 'Rocket',            price_adjustment: 0,    display_order: 9 },
      { name: 'Capsicum',          price_adjustment: 0,    display_order: 10 },
      { name: 'Mushrooms',         price_adjustment: 0,    display_order: 11 },
      { name: 'Olives',            price_adjustment: 0,    display_order: 12 },
      { name: 'Capers',            price_adjustment: 0,    display_order: 13 },
      { name: 'Sundried Tomatoes', price_adjustment: 0,    display_order: 14 },
    ],
  },
  {
    name: 'Sauces', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: 4, allow_quantity: false,
    show_conversational_buttons: false, display_order: 7, color: '#F97316',
    modifiers: [
      { name: 'Mayo',        price_adjustment: 0, display_order: 0 },
      { name: 'Mustard',     price_adjustment: 0, display_order: 1 },
      { name: 'Aioli',       price_adjustment: 0, display_order: 2 },
      { name: 'Ketchup',     price_adjustment: 0, display_order: 3 },
      { name: 'BBQ',         price_adjustment: 0, display_order: 4 },
      { name: 'Pesto',       price_adjustment: 0, display_order: 5 },
      { name: 'Hummus',      price_adjustment: 0, display_order: 6 },
      { name: 'Tzatziki',    price_adjustment: 0, display_order: 7 },
      { name: 'Sriracha',    price_adjustment: 0, display_order: 8 },
      { name: 'Sweet Chili', price_adjustment: 0, display_order: 9 },
      { name: 'Hollandaise', price_adjustment: 0, display_order: 10 },
      { name: 'Balsamic',    price_adjustment: 0, display_order: 11 },
      { name: 'Hot Sauce',   price_adjustment: 0, display_order: 12 },
      { name: 'Ranch',       price_adjustment: 0, display_order: 13 },
    ],
  },
  {
    name: 'Sides', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 8, color: '#A78BFA',
    modifiers: [
      { name: 'None',       price_adjustment: 0,    is_default: true, display_order: 0 },
      { name: 'Chips',      price_adjustment: 3.00,                   display_order: 1 },
      { name: 'Fries',      price_adjustment: 4.00,                   display_order: 2 },
      { name: 'Side Salad', price_adjustment: 4.00,                   display_order: 3 },
      { name: 'Soup',       price_adjustment: 5.00,                   display_order: 4 },
      { name: 'Fruit',      price_adjustment: 3.00,                   display_order: 5 },
      { name: 'Hash Brown', price_adjustment: 3.00,                   display_order: 6 },
    ],
  },
  {
    name: 'Cut', selection_type: 'single', is_required: false,
    min_selections: 0, max_selections: 1, allow_quantity: false,
    show_conversational_buttons: false, display_order: 9, color: '#94A3B8',
    modifiers: [
      { name: 'Whole',    price_adjustment: 0, is_default: true, display_order: 0 },
      { name: 'Halves',   price_adjustment: 0,                   display_order: 1 },
      { name: 'Quarters', price_adjustment: 0,                   display_order: 2 },
    ],
  },
  {
    name: 'Allergy Flags', selection_type: 'multi', is_required: false,
    min_selections: 0, max_selections: null, allow_quantity: false,
    show_conversational_buttons: false, display_order: 10, color: '#EF4444',
    modifiers: [
      { name: 'Gluten-Free',  price_adjustment: 0, display_order: 0 },
      { name: 'Dairy-Free',   price_adjustment: 0, display_order: 1 },
      { name: 'Nut Allergy',  price_adjustment: 0, display_order: 2 },
      { name: 'Egg Allergy',  price_adjustment: 0, display_order: 3 },
      { name: 'Vegan',        price_adjustment: 0, display_order: 4 },
      { name: 'Vegetarian',   price_adjustment: 0, display_order: 5 },
      { name: 'Halal',        price_adjustment: 0, display_order: 6 },
      { name: 'Kosher',       price_adjustment: 0, display_order: 7 },
    ],
  },
]

export async function seedCafeModifierLibrary(
  supabase: { from: (t: string) => any },
  businessId: string
): Promise<{ groups: number; modifiers: number }> {
  let totalGroups = 0
  let totalModifiers = 0

  for (const g of STANDARD_CAFE_MODIFIER_GROUPS) {
    const { modifiers: mods, ...groupData } = g

    const { data: group, error: gErr } = await supabase
      .from('pos_modifier_groups')
      .insert({ ...groupData, business_id: businessId })
      .select('id')
      .single()

    if (gErr || !group) continue
    totalGroups++

    if (mods.length > 0) {
      const modRows = mods.map(m => ({
        ...m,
        group_id: group.id,
        business_id: businessId,
        is_active: true,
      }))
      const { error: mErr } = await supabase.from('pos_modifiers').insert(modRows)
      if (!mErr) totalModifiers += mods.length
    }
  }

  return { groups: totalGroups, modifiers: totalModifiers }
}
export interface SeedProduct {
  name: string
  category: string
  subcategory: string
  price: number
  cost?: number
  description?: string
  container_type?: 'can' | 'bottle' | 'case' | 'cask' | 'glass' | 'unknown'
  has_modifiers?: boolean
}

export interface SeedModifier {
  group: string
  name: string
  price_delta: number
  is_default?: boolean
}

export const CAFE_SEED_MENU: SeedProduct[] = [
  // Coffee · Hot
  { name: 'Espresso', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot', has_modifiers: true },
  { name: 'Short Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot, no milk', has_modifiers: true },
  { name: 'Long Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Double shot, hot water', has_modifiers: true },
  { name: 'Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Espresso with dash of milk', has_modifiers: true },
  { name: 'Long Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Double shot with milk', has_modifiers: true },
  { name: 'Flat White', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Smooth microfoam', has_modifiers: true },
  { name: 'Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Steamed milk, light foam', has_modifiers: true },
  { name: 'Cappuccino', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Foam + cocoa dusting', has_modifiers: true },
  { name: 'Mocha', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Chocolate + espresso + milk', has_modifiers: true },
  { name: 'Piccolo', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Mini latte, ristretto base', has_modifiers: true },
  { name: 'Cortado', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Equal espresso and milk', has_modifiers: true },
  { name: 'Hot Chocolate', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Rich cocoa with milk', has_modifiers: true },
  { name: 'Chai Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Spiced chai with milk', has_modifiers: true },
  { name: 'Matcha Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Premium matcha with milk', has_modifiers: true },
  { name: 'Turmeric Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Golden milk', has_modifiers: true },
  { name: 'Dirty Chai', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Chai plus espresso shot', has_modifiers: true },
  // Coffee · Cold
  { name: 'Iced Latte', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true },
  { name: 'Iced Long Black', category: 'coffee', subcategory: 'coffee-cold', price: 5.00, has_modifiers: true },
  { name: 'Iced Mocha', category: 'coffee', subcategory: 'coffee-cold', price: 6.00, has_modifiers: true },
  { name: 'Iced Chocolate', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true },
  { name: 'Affogato', category: 'coffee', subcategory: 'coffee-cold', price: 7.00, description: 'Vanilla ice cream + espresso' },
  { name: 'Cold Brew', category: 'coffee', subcategory: 'coffee-cold', price: 5.50 },
  { name: 'Frappé', category: 'coffee', subcategory: 'coffee-cold', price: 6.50, has_modifiers: true },
  // Tea
  { name: 'English Breakfast', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Earl Grey', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Green Sencha', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Peppermint', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Chamomile', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Chai Tea', category: 'tea', subcategory: 'tea', price: 4.50 },
  { name: 'Lemongrass and Ginger', category: 'tea', subcategory: 'tea', price: 5.00 },
  // Breakfast
  { name: 'Avocado Toast', category: 'food', subcategory: 'breakfast', price: 16.00, description: 'Sourdough, smashed avo, lemon' },
  { name: 'Eggs Benedict', category: 'food', subcategory: 'breakfast', price: 19.00, description: 'Hollandaise, ciabatta, bacon' },
  { name: 'Scrambled Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough' },
  { name: 'Poached Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough' },
  { name: 'Big Breakfast', category: 'food', subcategory: 'breakfast', price: 24.00, description: 'Eggs, bacon, mushroom, tomato, hash' },
  { name: 'Bacon and Egg Roll', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'Brioche bun, BBQ sauce' },
  { name: 'Granola Bowl', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'Yoghurt, berries, honey' },
  { name: 'Acai Bowl', category: 'food', subcategory: 'breakfast', price: 15.00, description: 'Banana, granola, berries' },
  { name: 'Banana Bread', category: 'food', subcategory: 'breakfast', price: 7.00, description: 'House-made, toasted with butter' },
  { name: 'Bircher Muesli', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'With fresh fruit' },
  // Lunch
  { name: 'Toasted Sandwich', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Choose 3 fillings' },
  { name: 'Beef Burger', category: 'food', subcategory: 'lunch', price: 19.00, description: 'Beef, cheese, salad, chips' },
  { name: 'Chicken Wrap', category: 'food', subcategory: 'lunch', price: 14.00 },
  { name: 'Falafel Wrap', category: 'food', subcategory: 'lunch', price: 14.00 },
  { name: 'Caesar Salad', category: 'food', subcategory: 'lunch', price: 17.00, description: 'Cos, parmesan, anchovy' },
  { name: 'Greek Salad', category: 'food', subcategory: 'lunch', price: 16.00, description: 'Feta, olive, tomato, cucumber' },
  { name: 'Soup of the Day', category: 'food', subcategory: 'lunch', price: 12.00, description: 'With sourdough' },
  { name: 'Quiche', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Daily selection plus side salad' },
  { name: 'Sausage Roll', category: 'food', subcategory: 'lunch', price: 8.00, description: 'House-made puff pastry' },
  { name: 'Meat Pie', category: 'food', subcategory: 'lunch', price: 8.00, description: 'Beef, sourdough crust' },
  // Pastries
  { name: 'Croissant', category: 'food', subcategory: 'pastries', price: 6.00 },
  { name: 'Pain au Chocolat', category: 'food', subcategory: 'pastries', price: 7.00 },
  { name: 'Banana Bread Slice', category: 'food', subcategory: 'pastries', price: 7.00 },
  { name: 'Muffin', category: 'food', subcategory: 'pastries', price: 6.00, description: 'Daily selection' },
  { name: 'Cookie', category: 'food', subcategory: 'pastries', price: 5.00, description: 'Daily selection' },
  { name: 'Slice', category: 'food', subcategory: 'pastries', price: 7.00, description: 'Daily selection' },
  { name: 'Cake Slice', category: 'food', subcategory: 'pastries', price: 9.00, description: 'Daily selection' },
  { name: 'Brownie', category: 'food', subcategory: 'pastries', price: 6.00 },
  { name: 'Scone', category: 'food', subcategory: 'pastries', price: 6.00, description: 'With jam and cream' },
  // Cold drinks
  { name: 'Still Water 600ml', category: 'mixer', subcategory: 'cold-drinks', price: 4.00, container_type: 'bottle' },
  { name: 'Sparkling Water 500ml', category: 'mixer', subcategory: 'cold-drinks', price: 5.00, container_type: 'bottle' },
  { name: 'Orange Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00, description: 'Fresh squeezed' },
  { name: 'Apple Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00 },
  { name: 'Banana Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00 },
  { name: 'Berry Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00 },
  { name: 'Mango Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00 },
  { name: 'Acai Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00 },
  { name: 'Green Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00 },
  { name: 'Chocolate Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00 },
  { name: 'Vanilla Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00 },
  { name: 'Caramel Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00 },
  { name: 'Soft Drink', category: 'mixer', subcategory: 'cold-drinks', price: 4.50, description: 'Coke, Sprite, etc.' },
]

export const CAFE_MODIFIERS: SeedModifier[] = [
  // Milk options
  { group: 'milk', name: 'Full cream', price_delta: 0, is_default: true },
  { group: 'milk', name: 'Skim', price_delta: 0 },
  { group: 'milk', name: 'Soy', price_delta: 0.50 },
  { group: 'milk', name: 'Almond', price_delta: 0.80 },
  { group: 'milk', name: 'Oat', price_delta: 0.80 },
  { group: 'milk', name: 'Lactose-free', price_delta: 0.50 },
  { group: 'milk', name: 'Macadamia', price_delta: 1.00 },
  { group: 'milk', name: 'Coconut', price_delta: 0.80 },
  // Size
  { group: 'size', name: 'Regular', price_delta: 0, is_default: true },
  { group: 'size', name: 'Large', price_delta: 1.00 },
  { group: 'size', name: 'Takeaway', price_delta: 0 },
  // Extras
  { group: 'extras', name: 'Extra shot', price_delta: 1.00 },
  { group: 'extras', name: 'Decaf', price_delta: 0.50 },
  { group: 'extras', name: 'Half-strength', price_delta: 0 },
  { group: 'extras', name: 'Strong', price_delta: 0 },
  { group: 'extras', name: 'Sugar', price_delta: 0 },
  { group: 'extras', name: 'Vanilla syrup', price_delta: 0.80 },
  { group: 'extras', name: 'Caramel syrup', price_delta: 0.80 },
  { group: 'extras', name: 'Hazelnut syrup', price_delta: 0.80 },
]

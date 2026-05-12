export interface SeedProduct {
  name: string
  category: string
  subcategory: string
  price: number
  cost?: number
  description?: string
  container_type?: 'can' | 'bottle' | 'case' | 'cask' | 'glass' | 'unknown'
  has_modifiers?: boolean
  image_url?: string
}

export interface SeedModifier {
  group: string
  name: string
  price_delta: number
  is_default?: boolean
}

// picsum.photos/seed/{name} — deterministic, no API key, always resolves
const img = (name: string) =>
  `https://picsum.photos/seed/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}/400/300`

export const CAFE_SEED_MENU: SeedProduct[] = [
  // Coffee · Hot
  { name: 'Espresso', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot', has_modifiers: true, image_url: img('Espresso') },
  { name: 'Short Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot, no milk', has_modifiers: true, image_url: img('Short Black') },
  { name: 'Long Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Double shot, hot water', has_modifiers: true, image_url: img('Long Black') },
  { name: 'Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Espresso with dash of milk', has_modifiers: true, image_url: img('Macchiato') },
  { name: 'Long Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Double shot with milk', has_modifiers: true, image_url: img('Long Macchiato') },
  { name: 'Flat White', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Smooth microfoam', has_modifiers: true, image_url: img('Flat White') },
  { name: 'Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Steamed milk, light foam', has_modifiers: true, image_url: img('Latte') },
  { name: 'Cappuccino', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Foam + cocoa dusting', has_modifiers: true, image_url: img('Cappuccino') },
  { name: 'Mocha', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Chocolate + espresso + milk', has_modifiers: true, image_url: img('Mocha') },
  { name: 'Piccolo', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Mini latte, ristretto base', has_modifiers: true, image_url: img('Piccolo') },
  { name: 'Cortado', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Equal espresso and milk', has_modifiers: true, image_url: img('Cortado') },
  { name: 'Hot Chocolate', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Rich cocoa with milk', has_modifiers: true, image_url: img('Hot Chocolate') },
  { name: 'Chai Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Spiced chai with milk', has_modifiers: true, image_url: img('Chai Latte') },
  { name: 'Matcha Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Premium matcha with milk', has_modifiers: true, image_url: img('Matcha Latte') },
  { name: 'Turmeric Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Golden milk', has_modifiers: true, image_url: img('Turmeric Latte') },
  { name: 'Dirty Chai', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Chai plus espresso shot', has_modifiers: true, image_url: img('Dirty Chai') },
  // Coffee · Cold
  { name: 'Iced Latte', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true, image_url: img('Iced Latte') },
  { name: 'Iced Long Black', category: 'coffee', subcategory: 'coffee-cold', price: 5.00, has_modifiers: true, image_url: img('Iced Long Black') },
  { name: 'Iced Mocha', category: 'coffee', subcategory: 'coffee-cold', price: 6.00, has_modifiers: true, image_url: img('Iced Mocha') },
  { name: 'Iced Chocolate', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true, image_url: img('Iced Chocolate') },
  { name: 'Affogato', category: 'coffee', subcategory: 'coffee-cold', price: 7.00, description: 'Vanilla ice cream + espresso', image_url: img('Affogato') },
  { name: 'Cold Brew', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, image_url: img('Cold Brew') },
  { name: 'Frappé', category: 'coffee', subcategory: 'coffee-cold', price: 6.50, has_modifiers: true, image_url: img('Frappé') },
  // Tea
  { name: 'English Breakfast', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('English Breakfast') },
  { name: 'Earl Grey', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('Earl Grey') },
  { name: 'Green Sencha', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('Green Sencha') },
  { name: 'Peppermint', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('Peppermint') },
  { name: 'Chamomile', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('Chamomile') },
  { name: 'Chai Tea', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('Chai Tea') },
  { name: 'Lemongrass and Ginger', category: 'tea', subcategory: 'tea', price: 5.00, image_url: img('Lemongrass and Ginger') },
  // Breakfast
  { name: 'Avocado Toast', category: 'food', subcategory: 'breakfast', price: 16.00, description: 'Sourdough, smashed avo, lemon', image_url: img('Avocado Toast') },
  { name: 'Eggs Benedict', category: 'food', subcategory: 'breakfast', price: 19.00, description: 'Hollandaise, ciabatta, bacon', image_url: img('Eggs Benedict') },
  { name: 'Scrambled Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough', image_url: img('Scrambled Eggs') },
  { name: 'Poached Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough', image_url: img('Poached Eggs') },
  { name: 'Big Breakfast', category: 'food', subcategory: 'breakfast', price: 24.00, description: 'Eggs, bacon, mushroom, tomato, hash', image_url: img('Big Breakfast') },
  { name: 'Bacon and Egg Roll', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'Brioche bun, BBQ sauce', image_url: img('Bacon and Egg Roll') },
  { name: 'Granola Bowl', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'Yoghurt, berries, honey', image_url: img('Granola Bowl') },
  { name: 'Acai Bowl', category: 'food', subcategory: 'breakfast', price: 15.00, description: 'Banana, granola, berries', image_url: img('Acai Bowl') },
  { name: 'Banana Bread', category: 'food', subcategory: 'breakfast', price: 7.00, description: 'House-made, toasted with butter', image_url: img('Banana Bread') },
  { name: 'Bircher Muesli', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'With fresh fruit', image_url: img('Bircher Muesli') },
  // Lunch
  { name: 'Toasted Sandwich', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Choose 3 fillings', image_url: img('Toasted Sandwich') },
  { name: 'Beef Burger', category: 'food', subcategory: 'lunch', price: 19.00, description: 'Beef, cheese, salad, chips', image_url: img('Beef Burger') },
  { name: 'Chicken Wrap', category: 'food', subcategory: 'lunch', price: 14.00, image_url: img('Chicken Wrap') },
  { name: 'Falafel Wrap', category: 'food', subcategory: 'lunch', price: 14.00, image_url: img('Falafel Wrap') },
  { name: 'Caesar Salad', category: 'food', subcategory: 'lunch', price: 17.00, description: 'Cos, parmesan, anchovy', image_url: img('Caesar Salad') },
  { name: 'Greek Salad', category: 'food', subcategory: 'lunch', price: 16.00, description: 'Feta, olive, tomato, cucumber', image_url: img('Greek Salad') },
  { name: 'Soup of the Day', category: 'food', subcategory: 'lunch', price: 12.00, description: 'With sourdough', image_url: img('Soup of the Day') },
  { name: 'Quiche', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Daily selection plus side salad', image_url: img('Quiche') },
  { name: 'Sausage Roll', category: 'food', subcategory: 'lunch', price: 8.00, description: 'House-made puff pastry', image_url: img('Sausage Roll') },
  { name: 'Meat Pie', category: 'food', subcategory: 'lunch', price: 8.00, description: 'Beef, sourdough crust', image_url: img('Meat Pie') },
  // Pastries
  { name: 'Croissant', category: 'food', subcategory: 'pastries', price: 6.00, image_url: img('Croissant') },
  { name: 'Pain au Chocolat', category: 'food', subcategory: 'pastries', price: 7.00, image_url: img('Pain au Chocolat') },
  { name: 'Banana Bread Slice', category: 'food', subcategory: 'pastries', price: 7.00, image_url: img('Banana Bread Slice') },
  { name: 'Muffin', category: 'food', subcategory: 'pastries', price: 6.00, description: 'Daily selection', image_url: img('Muffin') },
  { name: 'Cookie', category: 'food', subcategory: 'pastries', price: 5.00, description: 'Daily selection', image_url: img('Cookie') },
  { name: 'Slice', category: 'food', subcategory: 'pastries', price: 7.00, description: 'Daily selection', image_url: img('Slice') },
  { name: 'Cake Slice', category: 'food', subcategory: 'pastries', price: 9.00, description: 'Daily selection', image_url: img('Cake Slice') },
  { name: 'Brownie', category: 'food', subcategory: 'pastries', price: 6.00, image_url: img('Brownie') },
  { name: 'Scone', category: 'food', subcategory: 'pastries', price: 6.00, description: 'With jam and cream', image_url: img('Scone') },
  // Cold drinks
  { name: 'Still Water 600ml', category: 'mixer', subcategory: 'cold-drinks', price: 4.00, container_type: 'bottle', image_url: img('Still Water 600ml') },
  { name: 'Sparkling Water 500ml', category: 'mixer', subcategory: 'cold-drinks', price: 5.00, container_type: 'bottle', image_url: img('Sparkling Water 500ml') },
  { name: 'Orange Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00, description: 'Fresh squeezed', image_url: img('Orange Juice') },
  { name: 'Apple Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00, image_url: img('Apple Juice') },
  { name: 'Banana Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('Banana Smoothie') },
  { name: 'Berry Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('Berry Smoothie') },
  { name: 'Mango Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('Mango Smoothie') },
  { name: 'Acai Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('Acai Smoothie') },
  { name: 'Green Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('Green Smoothie') },
  { name: 'Chocolate Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('Chocolate Milkshake') },
  { name: 'Vanilla Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('Vanilla Milkshake') },
  { name: 'Caramel Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('Caramel Milkshake') },
  { name: 'Soft Drink', category: 'mixer', subcategory: 'cold-drinks', price: 4.50, description: 'Coke, Sprite, etc.', image_url: img('Soft Drink') },
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
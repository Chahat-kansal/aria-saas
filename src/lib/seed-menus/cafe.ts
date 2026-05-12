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

const img = (query: string) =>
  `https://source.unsplash.com/featured/400x400/?${encodeURIComponent(query)},food`

export const CAFE_SEED_MENU: SeedProduct[] = [
  // Coffee · Hot
  { name: 'Espresso', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot', has_modifiers: true, image_url: img('espresso coffee cup') },
  { name: 'Short Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.00, description: 'Single shot, no milk', has_modifiers: true, image_url: img('espresso shot coffee') },
  { name: 'Long Black', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Double shot, hot water', has_modifiers: true, image_url: img('long black coffee cup') },
  { name: 'Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Espresso with dash of milk', has_modifiers: true, image_url: img('macchiato coffee espresso') },
  { name: 'Long Macchiato', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Double shot with milk', has_modifiers: true, image_url: img('macchiato coffee milk') },
  { name: 'Flat White', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Smooth microfoam', has_modifiers: true, image_url: img('flat white coffee latte art') },
  { name: 'Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Steamed milk, light foam', has_modifiers: true, image_url: img('latte coffee steamed milk') },
  { name: 'Cappuccino', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Foam + cocoa dusting', has_modifiers: true, image_url: img('cappuccino coffee foam cocoa') },
  { name: 'Mocha', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Chocolate + espresso + milk', has_modifiers: true, image_url: img('mocha chocolate coffee') },
  { name: 'Piccolo', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Mini latte, ristretto base', has_modifiers: true, image_url: img('piccolo latte coffee') },
  { name: 'Cortado', category: 'coffee', subcategory: 'coffee-hot', price: 4.50, description: 'Equal espresso and milk', has_modifiers: true, image_url: img('cortado espresso milk glass') },
  { name: 'Hot Chocolate', category: 'coffee', subcategory: 'coffee-hot', price: 5.00, description: 'Rich cocoa with milk', has_modifiers: true, image_url: img('hot chocolate mug cocoa') },
  { name: 'Chai Latte', category: 'coffee', subcategory: 'coffee-hot', price: 5.50, description: 'Spiced chai with milk', has_modifiers: true, image_url: img('chai latte spice milk') },
  { name: 'Matcha Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Premium matcha with milk', has_modifiers: true, image_url: img('matcha latte green tea') },
  { name: 'Turmeric Latte', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Golden milk', has_modifiers: true, image_url: img('turmeric golden milk latte') },
  { name: 'Dirty Chai', category: 'coffee', subcategory: 'coffee-hot', price: 6.00, description: 'Chai plus espresso shot', has_modifiers: true, image_url: img('chai latte espresso coffee') },
  // Coffee · Cold
  { name: 'Iced Latte', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true, image_url: img('iced latte coffee glass') },
  { name: 'Iced Long Black', category: 'coffee', subcategory: 'coffee-cold', price: 5.00, has_modifiers: true, image_url: img('iced black coffee glass') },
  { name: 'Iced Mocha', category: 'coffee', subcategory: 'coffee-cold', price: 6.00, has_modifiers: true, image_url: img('iced mocha chocolate coffee') },
  { name: 'Iced Chocolate', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, has_modifiers: true, image_url: img('iced chocolate drink') },
  { name: 'Affogato', category: 'coffee', subcategory: 'coffee-cold', price: 7.00, description: 'Vanilla ice cream + espresso', image_url: img('affogato ice cream espresso') },
  { name: 'Cold Brew', category: 'coffee', subcategory: 'coffee-cold', price: 5.50, image_url: img('cold brew coffee bottle') },
  { name: 'Frappé', category: 'coffee', subcategory: 'coffee-cold', price: 6.50, has_modifiers: true, image_url: img('frappe blended iced coffee') },
  // Tea
  { name: 'English Breakfast', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('english breakfast tea cup') },
  { name: 'Earl Grey', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('earl grey tea') },
  { name: 'Green Sencha', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('green tea sencha japan') },
  { name: 'Peppermint', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('peppermint herbal tea') },
  { name: 'Chamomile', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('chamomile tea flower') },
  { name: 'Chai Tea', category: 'tea', subcategory: 'tea', price: 4.50, image_url: img('chai spice tea cup') },
  { name: 'Lemongrass and Ginger', category: 'tea', subcategory: 'tea', price: 5.00, image_url: img('lemongrass ginger herbal tea') },
  // Breakfast
  { name: 'Avocado Toast', category: 'food', subcategory: 'breakfast', price: 16.00, description: 'Sourdough, smashed avo, lemon', image_url: img('avocado toast sourdough') },
  { name: 'Eggs Benedict', category: 'food', subcategory: 'breakfast', price: 19.00, description: 'Hollandaise, ciabatta, bacon', image_url: img('eggs benedict hollandaise') },
  { name: 'Scrambled Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough', image_url: img('scrambled eggs toast sourdough') },
  { name: 'Poached Eggs', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'On sourdough', image_url: img('poached eggs sourdough toast') },
  { name: 'Big Breakfast', category: 'food', subcategory: 'breakfast', price: 24.00, description: 'Eggs, bacon, mushroom, tomato, hash', image_url: img('full breakfast plate eggs bacon') },
  { name: 'Bacon and Egg Roll', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'Brioche bun, BBQ sauce', image_url: img('bacon egg roll brioche bun') },
  { name: 'Granola Bowl', category: 'food', subcategory: 'breakfast', price: 14.00, description: 'Yoghurt, berries, honey', image_url: img('granola bowl yogurt berries') },
  { name: 'Acai Bowl', category: 'food', subcategory: 'breakfast', price: 15.00, description: 'Banana, granola, berries', image_url: img('acai bowl granola berries') },
  { name: 'Banana Bread', category: 'food', subcategory: 'breakfast', price: 7.00, description: 'House-made, toasted with butter', image_url: img('banana bread slice toasted') },
  { name: 'Bircher Muesli', category: 'food', subcategory: 'breakfast', price: 12.00, description: 'With fresh fruit', image_url: img('bircher muesli oats fruit') },
  // Lunch
  { name: 'Toasted Sandwich', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Choose 3 fillings', image_url: img('toasted sandwich cafe lunch') },
  { name: 'Beef Burger', category: 'food', subcategory: 'lunch', price: 19.00, description: 'Beef, cheese, salad, chips', image_url: img('beef burger chips cafe') },
  { name: 'Chicken Wrap', category: 'food', subcategory: 'lunch', price: 14.00, image_url: img('chicken wrap salad lunch') },
  { name: 'Falafel Wrap', category: 'food', subcategory: 'lunch', price: 14.00, image_url: img('falafel wrap vegetarian') },
  { name: 'Caesar Salad', category: 'food', subcategory: 'lunch', price: 17.00, description: 'Cos, parmesan, anchovy', image_url: img('caesar salad parmesan') },
  { name: 'Greek Salad', category: 'food', subcategory: 'lunch', price: 16.00, description: 'Feta, olive, tomato, cucumber', image_url: img('greek salad feta olives') },
  { name: 'Soup of the Day', category: 'food', subcategory: 'lunch', price: 12.00, description: 'With sourdough', image_url: img('soup bowl bread lunch') },
  { name: 'Quiche', category: 'food', subcategory: 'lunch', price: 13.00, description: 'Daily selection plus side salad', image_url: img('quiche slice pastry') },
  { name: 'Sausage Roll', category: 'food', subcategory: 'lunch', price: 8.00, description: 'House-made puff pastry', image_url: img('sausage roll puff pastry') },
  { name: 'Meat Pie', category: 'food', subcategory: 'lunch', price: 8.00, description: 'Beef, sourdough crust', image_url: img('meat pie beef pastry') },
  // Pastries
  { name: 'Croissant', category: 'food', subcategory: 'pastries', price: 6.00, image_url: img('croissant buttery pastry') },
  { name: 'Pain au Chocolat', category: 'food', subcategory: 'pastries', price: 7.00, image_url: img('pain au chocolat chocolate pastry') },
  { name: 'Banana Bread Slice', category: 'food', subcategory: 'pastries', price: 7.00, image_url: img('banana bread slice bakery') },
  { name: 'Muffin', category: 'food', subcategory: 'pastries', price: 6.00, description: 'Daily selection', image_url: img('blueberry muffin bakery') },
  { name: 'Cookie', category: 'food', subcategory: 'pastries', price: 5.00, description: 'Daily selection', image_url: img('chocolate chip cookie bakery') },
  { name: 'Slice', category: 'food', subcategory: 'pastries', price: 7.00, description: 'Daily selection', image_url: img('caramel slice bakery') },
  { name: 'Cake Slice', category: 'food', subcategory: 'pastries', price: 9.00, description: 'Daily selection', image_url: img('cake slice coffee shop') },
  { name: 'Brownie', category: 'food', subcategory: 'pastries', price: 6.00, image_url: img('chocolate brownie fudge') },
  { name: 'Scone', category: 'food', subcategory: 'pastries', price: 6.00, description: 'With jam and cream', image_url: img('scone jam cream') },
  // Cold drinks
  { name: 'Still Water 600ml', category: 'mixer', subcategory: 'cold-drinks', price: 4.00, container_type: 'bottle', image_url: img('water bottle clear') },
  { name: 'Sparkling Water 500ml', category: 'mixer', subcategory: 'cold-drinks', price: 5.00, container_type: 'bottle', image_url: img('sparkling water bottle') },
  { name: 'Orange Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00, description: 'Fresh squeezed', image_url: img('fresh orange juice glass') },
  { name: 'Apple Juice', category: 'mixer', subcategory: 'cold-drinks', price: 6.00, image_url: img('apple juice glass fresh') },
  { name: 'Banana Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('banana smoothie yellow') },
  { name: 'Berry Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('berry smoothie purple pink') },
  { name: 'Mango Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('mango smoothie orange') },
  { name: 'Acai Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('acai smoothie purple') },
  { name: 'Green Smoothie', category: 'mixer', subcategory: 'cold-drinks', price: 9.00, image_url: img('green smoothie spinach') },
  { name: 'Chocolate Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('chocolate milkshake glass') },
  { name: 'Vanilla Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('vanilla milkshake cream') },
  { name: 'Caramel Milkshake', category: 'mixer', subcategory: 'cold-drinks', price: 8.00, image_url: img('caramel milkshake sweet') },
  { name: 'Soft Drink', category: 'mixer', subcategory: 'cold-drinks', price: 4.50, description: 'Coke, Sprite, etc.', image_url: img('soft drink cola glass ice') },
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
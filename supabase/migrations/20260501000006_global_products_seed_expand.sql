-- Expanded Australian product seed (40+ additional products)

INSERT INTO global_products (barcode,name,brand,category,size,unit,suggested_price_cents,is_age_restricted) VALUES
-- Beer & Cider
('9300673002289','XXXX Gold Cans 375ml 30pk','Carlton & United','Beer & Cider','30pk','case',5799,true),
('9300673003286','Tooheys New Cans 375ml 30pk','Tooheys','Beer & Cider','30pk','case',5499,true),
('9314000000143','Great Northern Super Crisp 30pk','Carlton & United','Beer & Cider','30pk','case',5799,true),
('9300635001241','Peroni Nastro Azzurro 330ml 24pk','Asahi','Beer & Cider','24pk','case',5999,true),
('9338570001458','Corona Extra 355ml 24pk','Constellation','Beer & Cider','24pk','case',5999,true),
('5000213014014','Heineken 0.0 330ml 24pk','Heineken','Beer & Cider','24pk','case',4999,false),
('9310088001030','Furphy Refreshing Ale 375ml 24pk','Lion','Beer & Cider','24pk','case',5499,true),
('9310088001047','James Squire 150 Lashes Pale Ale 345ml 24pk','Lion','Beer & Cider','24pk','case',5999,true),
-- Wine
('9338570002547','Penfolds Bin 2 Shiraz Mataro 750ml','Penfolds','Wine','750ml','bottle',2200,true),
('9315026000026','Jacob''s Creek Classic Chardonnay 750ml','Jacob''s Creek','Wine','750ml','bottle',1200,true),
('9315026000033','Jacob''s Creek Classic Sauvignon Blanc 750ml','Jacob''s Creek','Wine','750ml','bottle',1200,true),
('9316042000048','Yellowtail Shiraz 750ml','Casella','Wine','750ml','bottle',1000,true),
('9316042000055','Yellowtail Chardonnay 750ml','Casella','Wine','750ml','bottle',1000,true),
('9338570003506','Wolf Blass Yellow Label Cabernet Sauvignon 750ml','Wolf Blass','Wine','750ml','bottle',1500,true),
-- Spirits
('5099873006107','Bundaberg Export Strength Rum 700ml','Bundaberg Rum','Spirits','700ml','bottle',5500,true),
('9300635001258','Jim Beam Black Bourbon 700ml','Jim Beam','Spirits','700ml','bottle',4800,true),
('5000281002546','Johnnie Walker Red Label 700ml','Diageo','Spirits','700ml','bottle',5500,true),
('5000281003505','Johnnie Walker Black Label 700ml','Diageo','Spirits','700ml','bottle',7500,true),
('9310088060006','Four Pillars Rare Dry Gin 700ml','Four Pillars','Spirits','700ml','bottle',7000,true),
('0087116007021','Jack Daniel''s Old No. 7 700ml','Jack Daniel''s','Spirits','700ml','bottle',5500,true),
-- RTD
('9300728000021','Gordon''s Pink Gin & Soda 4pk 250ml','Diageo','RTD','4pk','case',2200,true),
('9300635001265','Jim Beam & Cola 375ml 24pk','Jim Beam','RTD','24pk','case',5999,true),
('9310088001054','Woodstock Bourbon & Cola 375ml 24pk','Woodstock','RTD','24pk','case',5799,true),
('9338570001465','Wild Turkey & Cola 375ml 24pk','Wild Turkey','RTD','24pk','case',5999,true),
-- Soft Drinks
('9300675000051','Coca-Cola Zero Sugar 24pk 375ml','Coca-Cola','Soft Drinks','24pk','case',2400,false),
('9300675000068','Sprite 24pk 375ml Cans','Coca-Cola','Soft Drinks','24pk','case',2200,false),
('9300675000075','Fanta Orange 24pk 375ml Cans','Coca-Cola','Soft Drinks','24pk','case',2200,false),
('9300675000082','Mount Franklin Still Water 600ml 24pk','Coca-Cola','Water','24pk','case',1800,false),
('9300675000099','Powerade Mountain Blast 600ml 12pk','Coca-Cola','Sports Drinks','12pk','case',2400,false),
('9300228000028','Red Bull Energy 250ml 24pk','Red Bull','Energy Drinks','24pk','case',5999,false),
('9300228000035','Monster Energy Green 500ml 12pk','Monster','Energy Drinks','12pk','case',3600,false),
-- Snacks & Confectionery
('9310088052031','Arnott''s Shapes Chicken Crimpy 175g','Arnott''s','Snacks','175g','each',349,false),
('9310055180085','Cadbury Old Gold Dark 180g','Cadbury','Confectionery','180g','each',499,false),
('9300617000024','Allen''s Snakes Alive 190g','Nestle','Confectionery','190g','each',349,false),
('9300617000031','Allen''s Party Mix 190g','Nestle','Confectionery','190g','each',349,false),
('9310088052048','Arnott''s Scotch Finger 250g','Arnott''s','Snacks','250g','each',349,false),
('0028400064057','Doritos Cheese Supreme 170g','Frito-Lay','Snacks','170g','each',449,false),
-- Tobacco
('9310088060013','Marlboro Gold 25s','Philip Morris','Tobacco','25s','pack',2750,true),
('9310088060020','Winfield Blue 25s','British American Tobacco','Tobacco','25s','pack',2650,true),
('9310088060037','Port Royal Fine Cut 30g Pouch','Imperial','Tobacco','30g','pouch',3250,true),
-- Dairy & Chilled
('9300675000106','Oak Chocolate Flavoured Milk 600ml','Dairy Farmers','Dairy','600ml','each',399,false),
('9300675000113','Up&Go Chocolate Ice 250ml 6pk','Sanitarium','Dairy','6pk','case',899,false),
('9310088060044','Farmers Union Greek Style Yogurt 160g','Farmers Union','Dairy','160g','each',199,false),
-- Ice Cream
('9300675000120','Peters Original Drumstick 4pk','Peters','Ice Cream','4pk','each',899,false),
('9300675000137','Paddle Pop Rainbow 6pk','Streets','Ice Cream','6pk','each',799,false)
ON CONFLICT (barcode) DO NOTHING;

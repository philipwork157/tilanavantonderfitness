CREATE TABLE "recipes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"meal" text DEFAULT 'Dinner' NOT NULL,
	"prep_minutes" integer DEFAULT 0 NOT NULL,
	"cook_minutes" integer DEFAULT 0 NOT NULL,
	"servings" integer DEFAULT 2 NOT NULL,
	"kcal" integer DEFAULT 0 NOT NULL,
	"protein_g" integer DEFAULT 0 NOT NULL,
	"carbs_g" integer DEFAULT 0 NOT NULL,
	"fat_g" integer DEFAULT 0 NOT NULL,
	"protein_note" text DEFAULT '' NOT NULL,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes_markdown" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'sand' NOT NULL,
	"icon" text DEFAULT 'plate' NOT NULL,
	"image_path" text,
	"image_alt" text,
	"image_width" integer,
	"image_height" integer,
	"blog_post_id" bigint,
	"sample" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "recipes_status_valid" CHECK ("recipes"."status" in ('draft', 'published')),
	CONSTRAINT "recipes_slug_format" CHECK ("recipes"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "recipes_published_has_date" CHECK ("recipes"."status" <> 'published' or "recipes"."published_at" is not null),
	CONSTRAINT "recipes_meal_valid" CHECK ("recipes"."meal" in ('Breakfast', 'Lunch', 'Dinner', 'Snack', 'Training fuel')),
	CONSTRAINT "recipes_tone_valid" CHECK ("recipes"."tone" in ('terracotta', 'sage', 'sand', 'white', 'caramel')),
	CONSTRAINT "recipes_icon_valid" CHECK ("recipes"."icon" in ('plate', 'bowl', 'toast', 'egg', 'pot', 'steak')),
	CONSTRAINT "recipes_servings_positive" CHECK ("recipes"."servings" > 0),
	CONSTRAINT "recipes_numbers_not_negative" CHECK (least("recipes"."prep_minutes", "recipes"."cook_minutes", "recipes"."kcal", "recipes"."protein_g", "recipes"."carbs_g", "recipes"."fat_g") >= 0)
);
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_blog_post_id_blog_posts_id_fk" FOREIGN KEY ("blog_post_id") REFERENCES "public"."blog_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_status_published_idx" ON "recipes" USING btree ("status","published_at" DESC NULLS LAST);
--> statement-breakpoint
-- The six recipes that were Markdown files in the website (apps/web/src/site/content/kitchen), now editable in the admin.
INSERT INTO "recipes" ("slug", "title", "description", "meal", "prep_minutes", "cook_minutes", "servings", "kcal", "protein_g", "carbs_g", "fat_g", "protein_note", "ingredients", "steps", "tags", "notes_markdown", "tone", "icon", "blog_post_id", "sample", "status", "published_at") VALUES
('chicken-rice-veg-bowl', 'Chicken, rice & veg bowl', 'The classic, done properly: garlicky chicken, fluffy rice and lots of colour.', 'Lunch', 15, 20, 2, 550, 42, 69, 9, 'About 150 g of chicken a serving gives you over 30 g of protein, and the rice and veg add the rest. A full protein meal on its own.', '[{"qty":300,"unit":"g","item":"chicken breast","note":"cut into strips"},{"qty":150,"unit":"g","item":"rice","note":"uncooked"},{"qty":300,"unit":"g","item":"mixed vegetables","note":"broccoli, peppers, carrots"},{"qty":1,"unit":"tbsp","item":"olive oil"},{"qty":2,"unit":"tbsp","item":"soy sauce"},{"qty":2,"unit":"cloves","item":"garlic","note":"crushed"},{"qty":1,"unit":"tsp","item":"fresh ginger","note":"grated"},{"qty":0.5,"item":"lemon","note":"juice"}]'::jsonb, '["Cook the rice according to the packet.","Heat the oil in a pan. Fry the chicken for 6–8 minutes until cooked through.","Add the garlic, ginger and vegetables. Stir-fry for 4–5 minutes so the veg keeps a little crunch.","Stir in the soy sauce and lemon juice.","Spoon the rice into bowls and top with the chicken and vegetables."]'::jsonb, '["Meal prep","High protein"]'::jsonb, '> Rice with chicken and vegetables.


Yes, it is the meal everyone jokes about. It is also easy, cheap and keeps well in the fridge for a couple of days. Change the sauce and it never gets boring.', 'terracotta', 'plate', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'why-are-we-so-afraid-to-eat-carbs'), true, 'published', '2026-10-04T12:00:00+02:00'),
('mince-veg-pasta', 'Mince & veg pasta', 'A family favourite: lean mince, a pile of hidden vegetables and tomato sauce.', 'Dinner', 15, 30, 4, 570, 42, 72, 11, 'Lean mince does the heavy lifting, and the pasta and parmesan add a little more. Around 40 g a plate, and the whole family eats the same meal.', '[{"qty":500,"unit":"g","item":"lean beef mince"},{"qty":320,"unit":"g","item":"pasta","note":"uncooked"},{"qty":1,"item":"onion","note":"chopped"},{"qty":300,"unit":"g","item":"vegetables","note":"carrot, baby marrow, mushrooms, finely chopped"},{"qty":400,"unit":"g","item":"tin of chopped tomatoes"},{"qty":2,"unit":"tbsp","item":"tomato paste"},{"qty":1,"unit":"tbsp","item":"olive oil"},{"qty":1,"unit":"tsp","item":"dried mixed herbs"},{"qty":20,"unit":"g","item":"parmesan","note":"to serve"}]'::jsonb, '["Heat the oil in a large pan and soften the onion for 3–4 minutes.","Add the mince and brown it, breaking it up as it cooks.","Stir in the chopped vegetables and cook for 5 minutes.","Add the tomatoes, tomato paste and herbs. Simmer for 15–20 minutes.","Meanwhile, cook the pasta. Keep a splash of the pasta water.","Toss the pasta through the sauce (loosen with pasta water if needed) and finish with parmesan."]'::jsonb, '["Family meal","Freezer friendly"]'::jsonb, '> Pasta with lean mince, vegetables and tomato sauce.


Pasta is not the enemy. *"Your body isn''t being shaped by one bowl of pasta. It''s being shaped by what you repeatedly do over time."*

Grate the vegetables finely and the little ones will never know.', 'caramel', 'pot', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'why-are-we-so-afraid-to-eat-carbs'), true, 'published', '2026-10-03T12:00:00+02:00'),
('overnight-oats-yoghurt-berries', 'Overnight oats with yoghurt & berries', 'Mix it the night before, grab it in the morning. Oats for energy, yoghurt for protein.', 'Breakfast', 5, 0, 1, 390, 26, 55, 8, 'Most of the protein comes from the yoghurt. A thick Greek or high-protein yoghurt takes breakfast into the 20–40 g range without any powder.', '[{"qty":40,"unit":"g","item":"rolled oats"},{"qty":150,"unit":"g","item":"plain Greek or high-protein yoghurt"},{"qty":80,"unit":"ml","item":"milk","note":"any kind"},{"qty":1,"unit":"tbsp","item":"chia seeds","note":"optional"},{"qty":75,"unit":"g","item":"berries","note":"fresh or frozen"},{"qty":1,"unit":"tsp","item":"honey"}]'::jsonb, '["Stir the oats, yoghurt, milk and chia seeds together in a jar or bowl.","Cover and leave it in the fridge overnight (or for at least 4 hours).","In the morning, give it a stir. Add a splash of milk if it is too thick.","Top with the berries and honey."]'::jsonb, '["Make ahead","No cooking","Vegetarian"]'::jsonb, '> Oats with yoghurt and berries.

One of the examples from my carbs post: look at the whole meal, not just the carb.

Make two or three jars at once and breakfast is sorted for the week.', 'white', 'bowl', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'why-are-we-so-afraid-to-eat-carbs'), true, 'published', '2026-10-05T12:00:00+02:00'),
('pre-training-toast', 'Pre-training toast', 'Sourdough with peanut butter, honey and banana. Simple, quick fuel before a session.', 'Training fuel', 5, 2, 1, 300, 10, 49, 9, 'This one is about carbs, not protein. It is there to fuel the session. Bring the protein in with your next meal, or have a yoghurt on the side.', '[{"qty":1,"unit":"slice","item":"sourdough","note":"about 50 g, or use an English muffin"},{"qty":15,"unit":"g","item":"peanut butter"},{"qty":1,"unit":"tsp","item":"honey"},{"qty":0.5,"item":"banana","note":"sliced"}]'::jsonb, '["Toast the sourdough (or English muffin) until golden.","Spread the peanut butter on while it is still warm.","Top with the banana slices and a drizzle of honey.","Eat it before you train. How long before depends on you, your session and what your stomach is happy with."]'::jsonb, '["Quick","Before training","Vegetarian"]'::jsonb, '> Before training, I personally enjoy something simple like sourdough or an English muffin with about 15 g peanut butter, honey and half a banana. Nothing fancy.


I used to train on an empty stomach and then wonder why I was so tired. Food is not something to earn. It helps you train.

Your ideal pre-training snack might look completely different. That is fine.', 'sage', 'toast', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'why-are-we-so-afraid-to-eat-carbs'), true, 'published', '2026-10-06T12:00:00+02:00'),
('sourdough-eggs-avocado', 'Sourdough, eggs & avocado', 'Weekend breakfast that keeps you full: toast, eggs your way and creamy avocado.', 'Breakfast', 5, 5, 1, 440, 23, 49, 17, 'Two eggs give you about 13 g of protein, and the sourdough adds more. Want more? Add a third egg or a spoon of cottage cheese.', '[{"qty":2,"unit":"slices","item":"sourdough"},{"qty":2,"item":"eggs"},{"qty":0.25,"item":"avocado"},{"qty":1,"item":"tomato","note":"sliced"},{"item":"salt, pepper and chilli flakes"}]'::jsonb, '["Toast the sourdough.","Cook the eggs your way: poached, fried or scrambled.","Mash the avocado onto the toast with a pinch of salt.","Top with the eggs and tomato. Finish with pepper and chilli flakes."]'::jsonb, '["Quick","Vegetarian"]'::jsonb, '> Sourdough with eggs and avocado.


Stop looking at the carb, look at the meal. Bread, eggs and avocado together give you carbs, protein, fat and fibre on one plate.', 'sage', 'egg', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'why-are-we-so-afraid-to-eat-carbs'), true, 'published', '2026-10-01T12:00:00+02:00'),
('steak-potatoes-veg', 'Steak, potatoes & veg', 'A good steak with crispy potatoes, greens and a sauce you actually enjoy.', 'Dinner', 10, 35, 2, 585, 48, 52, 21, 'A 180 g steak gives you about 40 g of protein. Beef also brings iron and zinc, and a little natural creatine.', '[{"qty":2,"item":"rump or sirloin steaks","note":"about 180 g each"},{"qty":500,"unit":"g","item":"baby potatoes","note":"halved"},{"qty":300,"unit":"g","item":"green beans or broccoli"},{"qty":1,"unit":"tbsp","item":"olive oil"},{"qty":10,"unit":"g","item":"butter"},{"qty":2,"unit":"cloves","item":"garlic","note":"lightly crushed"},{"qty":1,"unit":"sprig","item":"rosemary"},{"item":"salt and black pepper"}]'::jsonb, '["Heat the oven to 220 °C. Toss the potatoes with the oil, salt and rosemary and roast for 30–35 minutes.","Take the steaks out of the fridge 20 minutes before cooking. Pat dry and season well.","Sear in a very hot pan for 2–4 minutes a side, depending on thickness and how you like it.","Add the butter and garlic for the last minute and spoon it over the steaks. Rest for 5 minutes.","Steam the greens for 3–4 minutes and serve everything together, with your favourite sauce."]'::jsonb, '["High protein","Weekend"]'::jsonb, '> Give me a good steak and I''m happy.

But a steak is even better with potatoes, vegetables and a sauce you actually enjoy. Protein is part of the team, not the whole meal.

The sauce is not counted in the numbers. Have it anyway.', 'sand', 'steak', (SELECT "id" FROM "blog_posts" WHERE "slug" = 'protein-my-favourite-macronutrient'), true, 'published', '2026-10-02T12:00:00+02:00')
ON CONFLICT ("slug") DO NOTHING;

-- The five programs that were hard-coded on the website, as drafts.
-- Tilana uploads each PDF in the admin, then marks the volume for sale and
-- publishes the program. Slugs are the existing public catalogue slugs.
INSERT INTO "programs" ("slug", "name", "title", "summary", "description", "audience", "tags", "tone", "illustration", "series", "step", "marker", "sort_order") VALUES
  ('move', 'Beginner', 'Build a confident foundation.',
   'A welcoming introduction to strength for anyone new to training or returning after time away.',
   'A welcoming introduction to strength for women and men who are new to training or returning after time away. Learn healthy movement patterns, practise good form, and build the confidence to use bodyweight or dumbbells safely at home or in the gym.',
   'New or returning', ARRAY['Strength', 'Home or gym', 'Bodyweight & dumbbells'], 'terracotta', 'barbell', 'strength', 1, 'Start here', 10),
  ('intermediate', 'Intermediate', 'Turn your foundation into progress.',
   'A structured next step: more volume, thoughtful progressions and new challenges.',
   'Designed for people who feel comfortable with the basics and want a structured next step. The program introduces more training volume, thoughtful exercise progressions, and new challenges while keeping technique and sustainable progress at the centre.',
   'Comfortable with the basics', ARRAY['More volume', 'Progressions', 'Technique first'], 'sand', 'barbell', 'strength', 2, 'Next step', 20),
  ('strong', 'Advanced', 'Train with greater purpose.',
   'Purposeful sessions, progressive overload and clear performance goals.',
   'A focused strength program for experienced women and men who already have an established training base. Advanced uses purposeful sessions, progressive overload, and clear performance goals to help you continue building strength with confidence.',
   'Established training base', ARRAY['Progressive overload', 'Performance', 'Experienced'], 'caramel', 'barbell', 'strength', 3, 'Level up', 30),
  ('reconnect', 'Reconnect', 'Reconnect with your pelvic floor.',
   'Pelvic-floor awareness, breathing and gradual strengthening, before, during and after pregnancy.',
   'Gentle education and movement for building pelvic-floor awareness before, during, and after pregnancy. Learn how breathing, coordination, and gradual strengthening can support daily movement, while understanding when help from a pelvic-health professional is needed.',
   'Before, during & after pregnancy', ARRAY['Pelvic floor', 'Breathing', 'Pregnancy & postpartum'], 'sage', 'breath', 'focus', NULL, 'Pelvic floor', 40),
  ('nourish', 'Nourish', 'Understand how to fuel your body.',
   'Macro- and micronutrients made practical: balanced, satisfying meals without guilt.',
   'A practical guide to macro- and micronutrients and the roles they play in energy, recovery, and everyday wellbeing. Learn to build balanced, satisfying meals around your needs without rigid restriction, guilt, or treating food as a reward.',
   'Everyone', ARRAY['Nutrition', 'Macros & micros', 'No rigid rules'], 'white', 'plate', 'focus', NULL, 'Nutrition', 50)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "program_volumes" ("program_id", "slug", "volume_number", "name", "price_cents")
SELECT p."id", v."slug", 1, v."name", v."price_cents"
FROM (VALUES
  ('move', 'move-volume-1', 'Beginner · Volume 1', 39900),
  ('intermediate', 'intermediate-volume-1', 'Intermediate · Volume 1', 79900),
  ('strong', 'strong-volume-1', 'Advanced · Volume 1', 79900),
  ('reconnect', 'reconnect-volume-1', 'Reconnect · Volume 1', 39900),
  ('nourish', 'nourish-volume-1', 'Nourish · Volume 1', 39900)
) AS v("program_slug", "slug", "name", "price_cents")
JOIN "programs" p ON p."slug" = v."program_slug"
ON CONFLICT ("slug") DO NOTHING;

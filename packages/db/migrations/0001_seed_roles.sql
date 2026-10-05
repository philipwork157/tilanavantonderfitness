-- Fixed roles. Application code refers to them by key.
INSERT INTO "roles" ("key", "name") VALUES
  ('admin', 'Admin'),
  ('staff', 'Staff'),
  ('customer', 'Customer')
ON CONFLICT ("key") DO NOTHING;

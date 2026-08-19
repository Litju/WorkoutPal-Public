ALTER TABLE auth."user"
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE auth.session
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE auth.account
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE auth.verification
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

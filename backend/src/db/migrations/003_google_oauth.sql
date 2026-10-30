ALTER TABLE users
    ADD COLUMN google_sub TEXT;

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);

ALTER TABLE users
    ADD CONSTRAINT users_auth_method_check
    CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);

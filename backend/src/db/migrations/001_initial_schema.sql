CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE favorite_locations (
    favorite_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

CREATE TABLE data_sources (
    source_id SERIAL PRIMARY KEY,
    updated_by INTEGER,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    last_status VARCHAR(50),
    last_checked_at TIMESTAMP,

    FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);
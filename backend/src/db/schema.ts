export interface User {
    user_id: number;
    username: string;
    email: string;
    password_hash: string | null;
    google_sub: string | null;
    role: "user" | "admin";
    created_at: Date;
  }
  
  export interface FavoriteLocation {
    favorite_id: number;
    user_id: number;
    label: string;
    latitude: number;
    longitude: number;
    country: string | null;
    city: string | null;
    saved_at: Date;
  }
  
  export interface DataSource {
    source_id: number;
    updated_by: number | null;
    name: string;
    category: string;
    is_enabled: boolean;
    last_status: string | null;
    last_checked_at: Date | null;
  }

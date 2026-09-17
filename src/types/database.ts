/**
 * Hallyu Database Types
 * Matches the Supabase schema exactly
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      dramas: {
        Row: {
          id: string;
          title: string;
          original_title: string | null;
          poster_url: string | null;
          year: number | null;
          genres: string[] | null;
          synopsis: string | null;
          cast_text: string | null;
          episode_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          original_title?: string | null;
          poster_url?: string | null;
          year?: number | null;
          genres?: string[] | null;
          synopsis?: string | null;
          cast_text?: string | null;
          episode_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          original_title?: string | null;
          poster_url?: string | null;
          year?: number | null;
          genres?: string[] | null;
          synopsis?: string | null;
          cast_text?: string | null;
          episode_count?: number | null;
          created_at?: string;
        };
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          body: string | null;
          media_urls: string[] | null;
          media_type: 'image' | 'video' | 'none' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          body?: string | null;
          media_urls?: string[] | null;
          media_type?: 'image' | 'video' | 'none' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          body?: string | null;
          media_urls?: string[] | null;
          media_type?: 'image' | 'video' | 'none' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      post_dramas: {
        Row: {
          post_id: string;
          drama_id: string;
        };
        Insert: {
          post_id: string;
          drama_id: string;
        };
        Update: {
          post_id?: string;
          drama_id?: string;
        };
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          user_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          user_id?: string;
          body?: string;
          created_at?: string;
        };
      };
      likes: {
        Row: {
          user_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          post_id?: string;
          created_at?: string;
        };
      };
      saves: {
        Row: {
          user_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          post_id?: string;
          created_at?: string;
        };
      };
      follows_users: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
      };
      follows_dramas: {
        Row: {
          user_id: string;
          drama_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          drama_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          drama_id?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: string;
          post_id: string | null;
          drama_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          type: string;
          post_id?: string | null;
          drama_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string | null;
          type?: string;
          post_id?: string | null;
          drama_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: 'post' | 'user';
          target_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: 'post' | 'user';
          target_id: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: 'post' | 'user';
          target_id?: string;
          reason?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

// Convenient app-level types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Drama = Database['public']['Tables']['dramas']['Row'];
export type Post = Database['public']['Tables']['posts']['Row'];
export type Comment = Database['public']['Tables']['comments']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];

export type PostWithRelations = Post & {
  profile: Profile | null;
  dramas: Drama[];
  likes_count: number;
  comments_count: number;
  saves_count: number;
  is_liked: boolean;
  is_saved: boolean;
};

export type DramaWithStats = Drama & {
  followers_count: number;
  posts_count: number;
  is_following: boolean;
};

/**
 * Hallyu backend — database type contract.
 *
 * This file is the typed mirror of what supabase/migrations actually creates. It is hand-maintained
 * (there is no connected project to introspect yet) and `npm run test:dbtypes` proves it still matches
 * the SQL: the checker parses every migration and fails if a table or column is missing on either
 * side. When the backend is attached in the next phase, regenerate it with
 * `npx supabase gen types typescript --linked --project-id <id> > supabase/types/database.ts`.
 *
 * Nothing here is imported by the app yet — the frontend connects in the next phase — but the shape
 * is the contract the client will code against.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      analytics_events: {
        Row: {
          anonymous_id: string | null;
          app_version: string | null;
          id: number;
          name: string;
          occurred_at: string;
          platform: string | null;
          properties: Json;
          received_at: string;
          session_id: string | null;
          user_id: string | null;
        };
        Insert: {
          anonymous_id?: string | null;
          app_version?: string | null;
          id?: never;
          name: string;
          occurred_at?: string;
          platform?: string | null;
          properties?: Json;
          received_at?: string;
          session_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          anonymous_id?: string | null;
          app_version?: string | null;
          id?: never;
          name?: string;
          occurred_at?: string;
          platform?: string | null;
          properties?: Json;
          received_at?: string;
          session_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'analytics_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: { blocked_id: string; blocker_id: string; created_at: string };
        Insert: { blocked_id: string; blocker_id: string; created_at?: string };
        Update: { blocked_id?: string; blocker_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collection_follows: {
        Row: { collection_id: string; created_at: string; user_id: string };
        Insert: { collection_id: string; created_at?: string; user_id: string };
        Update: { collection_id?: string; created_at?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'collection_follows_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collection_follows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collection_items: {
        Row: {
          added_at: string;
          collection_id: string;
          note: string | null;
          position: number;
          title_id: string;
        };
        Insert: {
          added_at?: string;
          collection_id: string;
          note?: string | null;
          position?: number;
          title_id: string;
        };
        Update: {
          added_at?: string;
          collection_id?: string;
          note?: string | null;
          position?: number;
          title_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collection_items_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collection_items_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
        ];
      };
      collections: {
        Row: {
          created_at: string;
          description: string | null;
          follower_count: number;
          id: string;
          item_count: number;
          owner_id: string;
          title: string;
          updated_at: string;
          visibility: Database['public']['Enums']['visibility'];
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          follower_count?: number;
          id?: string;
          item_count?: number;
          owner_id: string;
          title: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
        };
        Update: {
          created_at?: string;
          description?: string | null;
          follower_count?: number;
          id?: string;
          item_count?: number;
          owner_id?: string;
          title?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility'];
        };
        Relationships: [
          {
            foreignKeyName: 'collections_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          cried_count: number;
          deleted_at: string | null;
          edited_at: string | null;
          furious_count: number;
          hidden_at: string | null;
          id: string;
          laughed_count: number;
          loved_count: number;
          parent_id: string | null;
          post_id: string;
          reply_to_user_id: string | null;
          screamed_count: number;
          spoiler: Database['public']['Enums']['spoiler_level'];
          state: Database['public']['Enums']['content_state'];
          swooned_count: number;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          cried_count?: number;
          deleted_at?: string | null;
          edited_at?: string | null;
          furious_count?: number;
          hidden_at?: string | null;
          id?: string;
          laughed_count?: number;
          loved_count?: number;
          parent_id?: string | null;
          post_id: string;
          reply_to_user_id?: string | null;
          screamed_count?: number;
          spoiler?: Database['public']['Enums']['spoiler_level'];
          state?: Database['public']['Enums']['content_state'];
          swooned_count?: number;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          cried_count?: number;
          deleted_at?: string | null;
          edited_at?: string | null;
          furious_count?: number;
          hidden_at?: string | null;
          id?: string;
          laughed_count?: number;
          loved_count?: number;
          parent_id?: string | null;
          post_id?: string;
          reply_to_user_id?: string | null;
          screamed_count?: number;
          spoiler?: Database['public']['Enums']['spoiler_level'];
          state?: Database['public']['Enums']['content_state'];
          swooned_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_reply_to_user_id_fkey';
            columns: ['reply_to_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      communities: {
        Row: {
          cover_tone: string;
          cover_url: string | null;
          created_at: string;
          description: string;
          drama_id: string | null;
          fandom: string;
          id: string;
          is_official: boolean;
          member_count: number;
          name: string;
          post_count: number;
          updated_at: string;
        };
        Insert: {
          cover_tone?: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          drama_id?: string | null;
          fandom: string;
          id?: string;
          is_official?: boolean;
          member_count?: number;
          name: string;
          post_count?: number;
          updated_at?: string;
        };
        Update: {
          cover_tone?: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          drama_id?: string | null;
          fandom?: string;
          id?: string;
          is_official?: boolean;
          member_count?: number;
          name?: string;
          post_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'communities_drama_id_fkey';
            columns: ['drama_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'communities_fandom_fkey';
            columns: ['fandom'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      community_members: {
        Row: { community_id: string; created_at: string; role: string; user_id: string };
        Insert: { community_id: string; created_at?: string; role?: string; user_id: string };
        Update: { community_id?: string; created_at?: string; role?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'community_members_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: { created_at: string; follower_id: string; target_id: string };
        Insert: { created_at?: string; follower_id: string; target_id: string };
        Update: { created_at?: string; follower_id?: string; target_id?: string };
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      mutes: {
        Row: {
          created_at: string;
          muted_title_id: string | null;
          muted_user_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          muted_title_id?: string | null;
          muted_user_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          muted_title_id?: string | null;
          muted_user_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mutes_muted_title_id_fkey';
            columns: ['muted_title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mutes_muted_user_id_fkey';
            columns: ['muted_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mutes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          actor_ids: string[];
          body: string | null;
          collection_id: string | null;
          comment_id: string | null;
          community_id: string | null;
          created_at: string;
          episode: number | null;
          id: string;
          kind: Database['public']['Enums']['notification_kind'];
          post_id: string | null;
          read_at: string | null;
          recipient_id: string;
          title: string | null;
          title_id: string | null;
          group: Database['public']['Enums']['notification_group'];
        };
        Insert: {
          actor_ids?: string[];
          body?: string | null;
          collection_id?: string | null;
          comment_id?: string | null;
          community_id?: string | null;
          created_at?: string;
          episode?: number | null;
          id?: string;
          kind: Database['public']['Enums']['notification_kind'];
          post_id?: string | null;
          read_at?: string | null;
          recipient_id: string;
          title?: string | null;
          title_id?: string | null;
          group?: Database['public']['Enums']['notification_group'];
        };
        Update: {
          actor_ids?: string[];
          body?: string | null;
          collection_id?: string | null;
          comment_id?: string | null;
          community_id?: string | null;
          created_at?: string;
          episode?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['notification_kind'];
          post_id?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          title?: string | null;
          title_id?: string | null;
          group?: Database['public']['Enums']['notification_group'];
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
        ];
      };
      people: {
        Row: {
          bio: string | null;
          birth_date: string | null;
          created_at: string;
          external_id: string;
          follower_count: number;
          id: string;
          korean_name: string | null;
          name: string;
          photo_url: string | null;
          provider_id: string;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          birth_date?: string | null;
          created_at?: string;
          external_id: string;
          follower_count?: number;
          id?: string;
          korean_name?: string | null;
          name: string;
          photo_url?: string | null;
          provider_id: string;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          birth_date?: string | null;
          created_at?: string;
          external_id?: string;
          follower_count?: number;
          id?: string;
          korean_name?: string | null;
          name?: string;
          photo_url?: string | null;
          provider_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'people_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'providers';
            referencedColumns: ['id'];
          },
        ];
      };
      person_follows: {
        Row: { created_at: string; person_id: string; user_id: string };
        Insert: { created_at?: string; person_id: string; user_id: string };
        Update: { created_at?: string; person_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'person_follows_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'person_follows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_media: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          height: number | null;
          id: string;
          kind: string;
          post_id: string;
          poster_path: string | null;
          position: number;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          height?: number | null;
          id?: string;
          kind: string;
          post_id: string;
          poster_path?: string | null;
          position?: number;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          height?: number | null;
          id?: string;
          kind?: string;
          post_id?: string;
          poster_path?: string | null;
          position?: number;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'post_media_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string;
          body: string;
          comment_count: number;
          community_id: string | null;
          created_at: string;
          cried_count: number;
          deleted_at: string | null;
          edited_at: string | null;
          episode: number | null;
          furious_count: number;
          hashtags: string[];
          hidden_at: string | null;
          id: string;
          kind: Database['public']['Enums']['discussion_kind'] | null;
          laughed_count: number;
          loved_count: number;
          mentions: string[];
          rating: number | null;
          save_count: number;
          screamed_count: number;
          search_document: unknown;
          season: number | null;
          secondary_title_id: string | null;
          share_count: number;
          spoiler: Database['public']['Enums']['spoiler_level'];
          state: Database['public']['Enums']['content_state'];
          swooned_count: number;
          title: string | null;
          title_id: string | null;
          type: Database['public']['Enums']['post_type'];
          updated_at: string;
          verdict: string | null;
          visibility: Database['public']['Enums']['visibility'];
          world: string | null;
        };
        Insert: {
          author_id: string;
          body: string;
          comment_count?: number;
          community_id?: string | null;
          created_at?: string;
          cried_count?: number;
          deleted_at?: string | null;
          edited_at?: string | null;
          episode?: number | null;
          furious_count?: number;
          hashtags?: string[];
          hidden_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['discussion_kind'] | null;
          laughed_count?: number;
          loved_count?: number;
          mentions?: string[];
          rating?: number | null;
          save_count?: number;
          screamed_count?: number;
          search_document?: never;
          season?: number | null;
          secondary_title_id?: string | null;
          share_count?: number;
          spoiler?: Database['public']['Enums']['spoiler_level'];
          state?: Database['public']['Enums']['content_state'];
          swooned_count?: number;
          title?: string | null;
          title_id?: string | null;
          type?: Database['public']['Enums']['post_type'];
          updated_at?: string;
          verdict?: string | null;
          visibility?: Database['public']['Enums']['visibility'];
          world?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          comment_count?: number;
          community_id?: string | null;
          created_at?: string;
          cried_count?: number;
          deleted_at?: string | null;
          edited_at?: string | null;
          episode?: number | null;
          furious_count?: number;
          hashtags?: string[];
          hidden_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['discussion_kind'] | null;
          laughed_count?: number;
          loved_count?: number;
          mentions?: string[];
          rating?: number | null;
          save_count?: number;
          screamed_count?: number;
          search_document?: never;
          season?: number | null;
          secondary_title_id?: string | null;
          share_count?: number;
          spoiler?: Database['public']['Enums']['spoiler_level'];
          state?: Database['public']['Enums']['content_state'];
          swooned_count?: number;
          title?: string | null;
          title_id?: string | null;
          type?: Database['public']['Enums']['post_type'];
          updated_at?: string;
          verdict?: string | null;
          visibility?: Database['public']['Enums']['visibility'];
          world?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_secondary_title_id_fkey';
            columns: ['secondary_title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_world_fkey';
            columns: ['world'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: Database['public']['Enums']['account_status'];
          avatar_path: string | null;
          bio: string | null;
          comment_count: number;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          favorite_genres: string[];
          follower_count: number;
          following_count: number;
          handle: string;
          id: string;
          is_private: boolean;
          onboarding_completed: boolean;
          onboarding_genres: string[];
          onboarding_intent: string | null;
          onboarding_step: number;
          post_count: number;
          role: Database['public']['Enums']['profile_role'];
          updated_at: string;
          verified: boolean;
          worlds: string[];
        };
        Insert: {
          account_status?: Database['public']['Enums']['account_status'];
          avatar_path?: string | null;
          bio?: string | null;
          comment_count?: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          favorite_genres?: string[];
          follower_count?: number;
          following_count?: number;
          handle: string;
          id: string;
          is_private?: boolean;
          onboarding_completed?: boolean;
          onboarding_genres?: string[];
          onboarding_intent?: string | null;
          onboarding_step?: number;
          post_count?: number;
          role?: Database['public']['Enums']['profile_role'];
          updated_at?: string;
          verified?: boolean;
          worlds?: string[];
        };
        Update: {
          account_status?: Database['public']['Enums']['account_status'];
          avatar_path?: string | null;
          bio?: string | null;
          comment_count?: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          favorite_genres?: string[];
          follower_count?: number;
          following_count?: number;
          handle?: string;
          id?: string;
          is_private?: boolean;
          onboarding_completed?: boolean;
          onboarding_genres?: string[];
          onboarding_intent?: string | null;
          onboarding_step?: number;
          post_count?: number;
          role?: Database['public']['Enums']['profile_role'];
          updated_at?: string;
          verified?: boolean;
          worlds?: string[];
        };
        Relationships: [];
      };
      providers: {
        Row: {
          base_url: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          label: string;
        };
        Insert: {
          base_url?: string | null;
          created_at?: string;
          id: string;
          is_active?: boolean;
          label: string;
        };
        Update: {
          base_url?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          app_version: string | null;
          created_at: string;
          device_name: string | null;
          disabled_at: string | null;
          id: string;
          last_seen_at: string;
          locale: string | null;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          disabled_at?: string | null;
          id?: string;
          last_seen_at?: string;
          locale?: string | null;
          platform: Database['public']['Enums']['push_platform'];
          token: string;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          disabled_at?: string | null;
          id?: string;
          last_seen_at?: string;
          locale?: string | null;
          platform?: Database['public']['Enums']['push_platform'];
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reactions: {
        Row: {
          comment_id: string | null;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['reaction_kind'];
          post_id: string | null;
          user_id: string;
        };
        Insert: {
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['reaction_kind'];
          post_id?: string | null;
          user_id: string;
        };
        Update: {
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['reaction_kind'];
          post_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reactions_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reactions_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          detail: string | null;
          id: string;
          reason: string;
          reporter_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['report_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          reason: string;
          reporter_id: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['report_status'];
          target_id: string;
          target_type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          reason?: string;
          reporter_id?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['report_status'];
          target_id?: string;
          target_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      saves: {
        Row: { created_at: string; post_id: string; user_id: string };
        Insert: { created_at?: string; post_id: string; user_id: string };
        Update: { created_at?: string; post_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'saves_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'saves_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      title_alerts: {
        Row: { created_at: string; title_id: string; user_id: string };
        Insert: { created_at?: string; title_id: string; user_id: string };
        Update: { created_at?: string; title_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'title_alerts_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'title_alerts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      title_episodes: {
        Row: {
          air_date: string | null;
          created_at: string;
          number: number;
          runtime_minutes: number | null;
          season: number;
          still_url: string | null;
          synopsis: string | null;
          title: string | null;
          title_id: string;
          updated_at: string;
        };
        Insert: {
          air_date?: string | null;
          created_at?: string;
          number: number;
          runtime_minutes?: number | null;
          season: number;
          still_url?: string | null;
          synopsis?: string | null;
          title?: string | null;
          title_id: string;
          updated_at?: string;
        };
        Update: {
          air_date?: string | null;
          created_at?: string;
          number?: number;
          runtime_minutes?: number | null;
          season?: number;
          still_url?: string | null;
          synopsis?: string | null;
          title?: string | null;
          title_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'title_episodes_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
        ];
      };
      title_follows: {
        Row: { created_at: string; title_id: string; user_id: string };
        Insert: { created_at?: string; title_id: string; user_id: string };
        Update: { created_at?: string; title_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'title_follows_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'title_follows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      title_people: {
        Row: {
          character: string | null;
          job: string;
          order_index: number;
          person_id: string;
          title_id: string;
        };
        Insert: {
          character?: string | null;
          job?: string;
          order_index?: number;
          person_id: string;
          title_id: string;
        };
        Update: {
          character?: string | null;
          job?: string;
          order_index?: number;
          person_id?: string;
          title_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'title_people_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'title_people_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
        ];
      };
      titles: {
        Row: {
          airs_on: string | null;
          backdrop_url: string | null;
          community_rating: number | null;
          created_at: string;
          end_year: number | null;
          episode_count: number;
          external_id: string;
          genres: string[];
          id: string;
          media_type: Database['public']['Enums']['media_type'];
          network: string | null;
          next_episode_at: string | null;
          original_language: string | null;
          original_title: string | null;
          poster_url: string | null;
          provider_data: Json;
          provider_id: string;
          runtime_minutes: number | null;
          search_document: unknown;
          season_count: number;
          status: Database['public']['Enums']['title_status'];
          streaming_on: string[];
          synopsis: string | null;
          tags: string[];
          title: string;
          tone: string | null;
          trailer_url: string | null;
          follower_count: number;
          updated_at: string;
          world: string;
          year: number;
        };
        Insert: {
          airs_on?: string | null;
          backdrop_url?: string | null;
          community_rating?: number | null;
          created_at?: string;
          end_year?: number | null;
          episode_count?: number;
          external_id: string;
          follower_count?: number;
          genres?: string[];
          id?: string;
          media_type: Database['public']['Enums']['media_type'];
          network?: string | null;
          next_episode_at?: string | null;
          original_language?: string | null;
          original_title?: string | null;
          poster_url?: string | null;
          provider_data?: Json;
          provider_id: string;
          runtime_minutes?: number | null;
          search_document?: never;
          season_count?: number;
          status?: Database['public']['Enums']['title_status'];
          streaming_on?: string[];
          synopsis?: string | null;
          tags?: string[];
          title: string;
          tone?: string | null;
          trailer_url?: string | null;
          updated_at?: string;
          world: string;
          year: number;
        };
        Update: {
          airs_on?: string | null;
          backdrop_url?: string | null;
          community_rating?: number | null;
          created_at?: string;
          end_year?: number | null;
          episode_count?: number;
          external_id?: string;
          follower_count?: number;
          genres?: string[];
          id?: string;
          media_type?: Database['public']['Enums']['media_type'];
          network?: string | null;
          next_episode_at?: string | null;
          original_language?: string | null;
          original_title?: string | null;
          poster_url?: string | null;
          provider_data?: Json;
          provider_id?: string;
          runtime_minutes?: number | null;
          search_document?: never;
          season_count?: number;
          status?: Database['public']['Enums']['title_status'];
          streaming_on?: string[];
          synopsis?: string | null;
          tags?: string[];
          title?: string;
          tone?: string | null;
          trailer_url?: string | null;
          updated_at?: string;
          world?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'titles_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'providers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'titles_world_fkey';
            columns: ['world'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          autoplay: Database['public']['Enums']['autoplay_mode'];
          created_at: string;
          data_saver: boolean;
          guidelines_accepted: boolean;
          guidelines_accepted_at: string | null;
          language: string;
          muted_words: string[];
          notify_episodes: boolean;
          notify_highlights: boolean;
          notify_social: boolean;
          notify_system: boolean;
          one_tap_reactions: boolean;
          personalization: boolean;
          protection: Database['public']['Enums']['protection_level'];
          quiet_hours: boolean;
          reduce_motion: boolean;
          terms_version: number;
          true_black: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          autoplay?: Database['public']['Enums']['autoplay_mode'];
          created_at?: string;
          data_saver?: boolean;
          guidelines_accepted?: boolean;
          guidelines_accepted_at?: string | null;
          language?: string;
          muted_words?: string[];
          notify_episodes?: boolean;
          notify_highlights?: boolean;
          notify_social?: boolean;
          notify_system?: boolean;
          one_tap_reactions?: boolean;
          personalization?: boolean;
          protection?: Database['public']['Enums']['protection_level'];
          quiet_hours?: boolean;
          reduce_motion?: boolean;
          terms_version?: number;
          true_black?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          autoplay?: Database['public']['Enums']['autoplay_mode'];
          created_at?: string;
          data_saver?: boolean;
          guidelines_accepted?: boolean;
          guidelines_accepted_at?: string | null;
          language?: string;
          muted_words?: string[];
          notify_episodes?: boolean;
          notify_highlights?: boolean;
          notify_social?: boolean;
          notify_system?: boolean;
          one_tap_reactions?: boolean;
          personalization?: boolean;
          protection?: Database['public']['Enums']['protection_level'];
          quiet_hours?: boolean;
          reduce_motion?: boolean;
          terms_version?: number;
          true_black?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      watchlist_items: {
        Row: {
          added_at: string;
          completed_at: string | null;
          current_episode: number;
          note: string | null;
          season: number;
          status: Database['public']['Enums']['watch_status'];
          title_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          completed_at?: string | null;
          current_episode?: number;
          note?: string | null;
          season?: number;
          status?: Database['public']['Enums']['watch_status'];
          title_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          completed_at?: string | null;
          current_episode?: number;
          note?: string | null;
          season?: number;
          status?: Database['public']['Enums']['watch_status'];
          title_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'watchlist_items_title_id_fkey';
            columns: ['title_id'];
            isOneToOne: false;
            referencedRelation: 'titles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'watchlist_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      worlds: {
        Row: {
          created_at: string;
          flag: string;
          id: string;
          label: string;
          short_label: string;
          sort_order: number;
          tint: string;
        };
        Insert: {
          created_at?: string;
          flag: string;
          id: string;
          label: string;
          short_label: string;
          sort_order?: number;
          tint: string;
        };
        Update: {
          created_at?: string;
          flag?: string;
          id?: string;
          label?: string;
          short_label?: string;
          sort_order?: number;
          tint?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      complete_onboarding: {
        Args: { p_genres?: string[]; p_step?: number; p_worlds?: string[] };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      delete_account: {
        Args: Record<never, never>;
        Returns: Json;
      };
      feed_posts: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_scope?: string;
          p_title_id?: string;
          p_world?: string;
        };
        Returns: Database['public']['Tables']['posts']['Row'][];
      };
      get_bootstrap: {
        Args: Record<never, never>;
        Returns: Json;
      };
      handle_is_available: {
        Args: { p_handle: string };
        Returns: boolean;
      };
      is_moderator: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      mark_notifications_read: {
        Args: { p_group?: Database['public']['Enums']['notification_group']; p_ids?: string[] };
        Returns: number;
      };
      merge_preferences: {
        Args: { p_patch: Json };
        Returns: Database['public']['Tables']['user_preferences']['Row'];
      };
      purge_deleted_accounts: {
        Args: { retention?: string };
        Returns: { profiles_purged: number; storage_objects_removed: number }[];
      };
      record_event: {
        Args: {
          p_anonymous_id?: string;
          p_app_version?: string;
          p_name: string;
          p_platform?: string;
          p_properties?: Json;
          p_session_id?: string;
        };
        Returns: number;
      };
      register_push_token: {
        Args: {
          p_app_version?: string;
          p_device_name?: string;
          p_locale?: string;
          p_platform: Database['public']['Enums']['push_platform'];
          p_token: string;
        };
        Returns: string;
      };
      report_content: {
        Args: { p_detail?: string; p_reason: string; p_target_id: string; p_target_type: string };
        Returns: string;
      };
      search_titles: {
        Args: { p_limit?: number; p_offset?: number; p_query: string; p_world?: string };
        Returns: Database['public']['Tables']['titles']['Row'][];
      };
      set_block: {
        Args: { p_on: boolean; p_user_id: string };
        Returns: boolean;
      };
      set_follow: {
        Args: { p_kind: string; p_on: boolean; p_target_id: string };
        Returns: boolean;
      };
      set_mute: {
        Args: { p_kind: string; p_on: boolean; p_target_id: string };
        Returns: boolean;
      };
      storage_owner: {
        Args: { name: string };
        Returns: string | null;
      };
      toggle_reaction: {
        Args: { p_kind: Database['public']['Enums']['reaction_kind']; p_target_id: string; p_target_type: string };
        Returns: Json;
      };
      toggle_save: {
        Args: { p_post_id: string };
        Returns: boolean;
      };
      upsert_watchlist_item: {
        Args: {
          p_episode?: number;
          p_note?: string;
          p_season?: number;
          p_status?: Database['public']['Enums']['watch_status'];
          p_title_id: string;
          p_total?: number;
        };
        Returns: Database['public']['Tables']['watchlist_items']['Row'];
      };
    };
    Enums: {
      account_status: 'active' | 'suspended' | 'deleted';
      autoplay_mode: 'always' | 'wifi' | 'never';
      content_state: 'active' | 'deleted' | 'hidden';
      discussion_kind: 'general' | 'theory' | 'ending' | 'character' | 'scene' | 'question';
      media_type: 'tv' | 'movie';
      notification_group: 'social' | 'drama' | 'mentions' | 'system';
      notification_kind:
        | 'reaction'
        | 'comment'
        | 'reply'
        | 'follow'
        | 'mention'
        | 'episode_aired'
        | 'episode_live'
        | 'drama_trending'
        | 'collection_saved'
        | 'system';
      post_type: 'post' | 'reaction' | 'discussion' | 'review' | 'recommendation' | 'short';
      profile_role: 'member' | 'moderator' | 'admin';
      protection_level: 'strict' | 'balanced' | 'off';
      push_platform: 'ios' | 'android' | 'web';
      reaction_kind: 'loved' | 'cried' | 'screamed' | 'swooned' | 'laughed' | 'furious';
      report_status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
      spoiler_level: 'none' | 'episode' | 'season' | 'ending';
      title_status: 'upcoming' | 'airing' | 'completed' | 'canceled';
      visibility: 'public' | 'private';
      watch_status: 'want' | 'watching' | 'completed' | 'dropped';
    };
    CompositeTypes: Record<never, never>;
  };
};

/** Convenience aliases, matching what supabase gen types emits. */
export type Tables = Database['public']['Tables'];

export type TablesInsert<T extends keyof Tables> = Tables[T]['Insert'];
export type TablesUpdate<T extends keyof Tables> = Tables[T]['Update'];
export type TablesRow<T extends keyof Tables> = Tables[T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type ProfileRow = TablesRow<'profiles'>;
export type PostRow = TablesRow<'posts'>;
export type CommentRow = TablesRow<'comments'>;
export type ReactionRow = TablesRow<'reactions'>;
export type TitleRow = TablesRow<'titles'>;
export type NotificationRow = TablesRow<'notifications'>;
export type WatchlistRow = TablesRow<'watchlist_items'>;
export type CollectionRow = TablesRow<'collections'>;
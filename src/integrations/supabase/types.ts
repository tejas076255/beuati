export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      availability_settings: {
        Row: {
          accepting_bookings: boolean
          advance_booking_days: number | null
          beautician_profile_id: string
          created_at: string
          id: string
          minimum_notice_hours: number | null
          timezone: string
          updated_at: string
          working_hours_note: string | null
        }
        Insert: {
          accepting_bookings?: boolean
          advance_booking_days?: number | null
          beautician_profile_id: string
          created_at?: string
          id?: string
          minimum_notice_hours?: number | null
          timezone?: string
          updated_at?: string
          working_hours_note?: string | null
        }
        Update: {
          accepting_bookings?: boolean
          advance_booking_days?: number | null
          beautician_profile_id?: string
          created_at?: string
          id?: string
          minimum_notice_hours?: number | null
          timezone?: string
          updated_at?: string
          working_hours_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_settings_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: true
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      beautician_profiles: {
        Row: {
          address: string | null
          bio: string | null
          bio_secondary: string | null
          business_name: string | null
          client_count: number
          country: string
          cover_image_url: string | null
          created_at: string
          display_name: string
          email: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_demo: boolean
          is_published: boolean | null
          latitude: number | null
          locality: string | null
          longitude: number | null
          map_query: string | null
          metrics_verified: boolean
          phone: string | null
          primary_city: string | null
          professional_title: string | null
          profile_id: string
          profile_image_url: string | null
          published_at: string | null
          rating: number | null
          review_count: number
          short_tagline: string | null
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["portfolio_status"]
          travel_note: string | null
          updated_at: string
          website_url: string | null
          whatsapp_number: string | null
          working_hours: string | null
          years_experience: number | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          bio_secondary?: string | null
          business_name?: string | null
          client_count?: number
          country?: string
          cover_image_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_demo?: boolean
          is_published?: boolean | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          map_query?: string | null
          metrics_verified?: boolean
          phone?: string | null
          primary_city?: string | null
          professional_title?: string | null
          profile_id: string
          profile_image_url?: string | null
          published_at?: string | null
          rating?: number | null
          review_count?: number
          short_tagline?: string | null
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["portfolio_status"]
          travel_note?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_number?: string | null
          working_hours?: string | null
          years_experience?: number | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          bio_secondary?: string | null
          business_name?: string | null
          client_count?: number
          country?: string
          cover_image_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_demo?: boolean
          is_published?: boolean | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          map_query?: string | null
          metrics_verified?: boolean
          phone?: string | null
          primary_city?: string | null
          professional_title?: string | null
          profile_id?: string
          profile_image_url?: string | null
          published_at?: string | null
          rating?: number | null
          review_count?: number
          short_tagline?: string | null
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["portfolio_status"]
          travel_note?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_number?: string | null
          working_hours?: string | null
          years_experience?: number | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beautician_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      beautician_specializations: {
        Row: {
          beautician_profile_id: string
          created_at: string
          id: string
          sort_order: number
          specialization_id: string
        }
        Insert: {
          beautician_profile_id: string
          created_at?: string
          id?: string
          sort_order?: number
          specialization_id: string
        }
        Update: {
          beautician_profile_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          specialization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beautician_specializations_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beautician_specializations_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "specializations"
            referencedColumns: ["id"]
          },
        ]
      }
      before_after_images: {
        Row: {
          alt_text: string | null
          before_after_id: string
          created_at: string
          height: number | null
          id: string
          image_type: Database["public"]["Enums"]["before_after_image_type"]
          public_url: string | null
          sort_order: number
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          before_after_id: string
          created_at?: string
          height?: number | null
          id?: string
          image_type: Database["public"]["Enums"]["before_after_image_type"]
          public_url?: string | null
          sort_order?: number
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          before_after_id?: string
          created_at?: string
          height?: number | null
          id?: string
          image_type?: Database["public"]["Enums"]["before_after_image_type"]
          public_url?: string | null
          sort_order?: number
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "before_after_images_before_after_id_fkey"
            columns: ["before_after_id"]
            isOneToOne: false
            referencedRelation: "before_after_items"
            referencedColumns: ["id"]
          },
        ]
      }
      before_after_items: {
        Row: {
          beautician_profile_id: string
          created_at: string
          description: string | null
          event_type: string | null
          id: string
          is_published: boolean
          location: string | null
          service_id: string | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          service_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          service_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "before_after_items_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "before_after_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          beautician_profile_id: string
          created_at: string
          id: string
          is_published: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          beautician_profile_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          beautician_profile_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          beautician_profile_id: string
          created_at: string
          email: string | null
          event_date: string | null
          id: string
          location: string | null
          message: string | null
          name: string | null
          package_id: string | null
          phone: string | null
          service_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          created_at?: string
          email?: string | null
          event_date?: string | null
          id?: string
          location?: string | null
          message?: string | null
          name?: string | null
          package_id?: string | null
          phone?: string | null
          service_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          created_at?: string
          email?: string | null
          event_date?: string | null
          id?: string
          location?: string | null
          message?: string | null
          name?: string | null
          package_id?: string | null
          phone?: string | null
          service_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      package_services: {
        Row: {
          created_at: string
          id: string
          package_id: string
          quantity: number
          service_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          quantity?: number
          service_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          quantity?: number
          service_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          beautician_profile_id: string
          best_for: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          inclusions: string[]
          is_active: boolean
          is_featured: boolean
          is_popular: boolean
          name: string
          note: string | null
          price: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          best_for?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          inclusions?: string[]
          is_active?: boolean
          is_featured?: boolean
          is_popular?: boolean
          name: string
          note?: string | null
          price?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          best_for?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          inclusions?: string[]
          is_active?: boolean
          is_featured?: boolean
          is_popular?: boolean
          name?: string
          note?: string | null
          price?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_events: {
        Row: {
          beautician_profile_id: string
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          referrer: string | null
          session_id: string | null
        }
        Insert: {
          beautician_profile_id: string
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          referrer?: string | null
          session_id?: string | null
        }
        Update: {
          beautician_profile_id?: string
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          referrer?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_events_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_images: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          file_size_bytes: number | null
          height: number | null
          id: string
          is_cover: boolean
          mime_type: string | null
          portfolio_item_id: string
          public_url: string | null
          sort_order: number
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          mime_type?: string | null
          portfolio_item_id: string
          public_url?: string | null
          sort_order?: number
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          mime_type?: string | null
          portfolio_item_id?: string
          public_url?: string | null
          sort_order?: number
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_images_portfolio_item_id_fkey"
            columns: ["portfolio_item_id"]
            isOneToOne: false
            referencedRelation: "portfolio_items"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          beautician_profile_id: string
          category: string | null
          created_at: string
          description: string | null
          event_type: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          location: string | null
          service_id: string | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          location?: string | null
          service_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          location?: string | null
          service_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_seo: {
        Row: {
          beautician_profile_id: string
          canonical_url: string | null
          created_at: string
          id: string
          meta_description: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          primary_keyword: string | null
          robots_follow: boolean
          robots_index: boolean
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          canonical_url?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          primary_keyword?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          canonical_url?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          primary_keyword?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_seo_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: true
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_videos: {
        Row: {
          beautician_profile_id: string
          category: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_featured: boolean
          is_published: boolean
          platform: Database["public"]["Enums"]["video_platform"]
          sort_order: number
          storage_path: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          beautician_profile_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          platform?: Database["public"]["Enums"]["video_platform"]
          sort_order?: number
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          beautician_profile_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          platform?: Database["public"]["Enums"]["video_platform"]
          sort_order?: number
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_videos_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          beautician_profile_id: string
          client_name: string
          created_at: string
          event_type: string | null
          id: string
          is_published: boolean
          is_verified: boolean
          rating: number
          review_date: string | null
          review_text: string
          service_name: string | null
          source: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          client_name: string
          created_at?: string
          event_type?: string | null
          id?: string
          is_published?: boolean
          is_verified?: boolean
          rating: number
          review_date?: string | null
          review_text: string
          service_name?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          client_name?: string
          created_at?: string
          event_type?: string | null
          id?: string
          is_published?: boolean
          is_verified?: boolean
          rating?: number
          review_date?: string | null
          review_text?: string
          service_name?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_areas: {
        Row: {
          area_name: string | null
          beautician_profile_id: string
          city: string
          country: string
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          latitude: number | null
          longitude: number | null
          sort_order: number
          state: string | null
          updated_at: string
        }
        Insert: {
          area_name?: string | null
          beautician_profile_id: string
          city: string
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          area_name?: string | null
          beautician_profile_id?: string
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_areas_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          beautician_profile_id: string
          category: string | null
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          price: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          short_description: string | null
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          beautician_profile_id: string
          category?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          price?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          short_description?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          beautician_profile_id?: string
          category?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          short_description?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_beautician_profile_id_fkey"
            columns: ["beautician_profile_id"]
            isOneToOne: false
            referencedRelation: "beautician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      specializations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_published_profile: { Args: { _bp_id: string }; Returns: boolean }
      owns_beautician_profile: { Args: { _bp_id: string }; Returns: boolean }
      record_portfolio_event: {
        Args: {
          _device_type?: string
          _event_type: string
          _metadata?: Json
          _referrer?: string
          _session_id?: string
          _slug: string
        }
        Returns: undefined
      }
      submit_lead: {
        Args: {
          _email?: string
          _event_date?: string
          _location?: string
          _message?: string
          _name: string
          _package_id?: string
          _phone: string
          _service_id?: string
          _slug: string
          _source?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "beautician" | "admin"
      before_after_image_type: "before" | "after"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "booked"
        | "lost"
        | "archived"
      portfolio_status: "draft" | "published" | "unpublished" | "suspended"
      price_type: "fixed" | "starting_from" | "custom_quote"
      video_platform: "youtube" | "instagram" | "uploaded" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["beautician", "admin"],
      before_after_image_type: ["before", "after"],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "booked",
        "lost",
        "archived",
      ],
      portfolio_status: ["draft", "published", "unpublished", "suspended"],
      price_type: ["fixed", "starting_from", "custom_quote"],
      video_platform: ["youtube", "instagram", "uploaded", "other"],
    },
  },
} as const

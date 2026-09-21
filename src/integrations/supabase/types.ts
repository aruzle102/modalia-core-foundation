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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      anonymous_wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          session_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          session_token: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          resource: string
          resource_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource: string
          resource_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource?: string
          resource_id?: string | null
        }
        Relationships: []
      }
      back_in_stock_subscriptions: {
        Row: {
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          notified_at: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          notified_at?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          notified_at?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "back_in_stock_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "back_in_stock_subscriptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          availability_checked_at: string | null
          cart_id: string
          compare_at_price_snapshot: number | null
          created_at: string
          id: string
          product_snapshot: Json
          quantity: number
          unit_price_snapshot: number | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          availability_checked_at?: string | null
          cart_id: string
          compare_at_price_snapshot?: number | null
          created_at?: string
          id?: string
          product_snapshot?: Json
          quantity: number
          unit_price_snapshot?: number | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          availability_checked_at?: string | null
          cart_id?: string
          compare_at_price_snapshot?: number | null
          created_at?: string
          id?: string
          product_snapshot?: Json
          quantity?: number
          unit_price_snapshot?: number | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          id: string
          session_token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          session_token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          session_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: Json
          parent_id: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: Json
          parent_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: Json
          parent_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      colors: {
        Row: {
          active: boolean
          created_at: string
          hex_value: string | null
          id: string
          name: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hex_value?: string | null
          id?: string
          name: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hex_value?: string | null
          id?: string
          name?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      communes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: Json
          updated_at: string
          wilaya_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: Json
          updated_at?: string
          wilaya_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: Json
          updated_at?: string
          wilaya_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communes_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: false
            referencedRelation: "wilayas"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          seller_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          seller_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          seller_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_campaigns: {
        Row: {
          category_ids: Json
          created_at: string
          cta: Json
          description: Json | null
          ends_at: string | null
          id: string
          media: Json
          name: Json
          product_ids: Json
          slug: string
          starts_at: string | null
          status: string
          store_ids: Json
          updated_at: string
        }
        Insert: {
          category_ids?: Json
          created_at?: string
          cta?: Json
          description?: Json | null
          ends_at?: string | null
          id?: string
          media?: Json
          name: Json
          product_ids?: Json
          slug: string
          starts_at?: string | null
          status?: string
          store_ids?: Json
          updated_at?: string
        }
        Update: {
          category_ids?: Json
          created_at?: string
          cta?: Json
          description?: Json | null
          ends_at?: string | null
          id?: string
          media?: Json
          name?: Json
          product_ids?: Json
          slug?: string
          starts_at?: string | null
          status?: string
          store_ids?: Json
          updated_at?: string
        }
        Relationships: []
      }
      discovery_events: {
        Row: {
          category_id: string | null
          event_kind: Database["public"]["Enums"]["discovery_event_kind"]
          id: string
          metadata: Json
          occurred_at: string
          product_id: string | null
          profile_id: string | null
          query: string | null
          session_id: string | null
        }
        Insert: {
          category_id?: string | null
          event_kind: Database["public"]["Enums"]["discovery_event_kind"]
          id?: string
          metadata?: Json
          occurred_at?: string
          product_id?: string | null
          profile_id?: string | null
          query?: string | null
          session_id?: string | null
        }
        Update: {
          category_id?: string | null
          event_kind?: Database["public"]["Enums"]["discovery_event_kind"]
          id?: string
          metadata?: Json
          occurred_at?: string
          product_id?: string | null
          profile_id?: string | null
          query?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          animation: Json
          content: Json
          created_at: string
          enabled: boolean
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["homepage_section_kind"]
          section_key: string
          sort_order: number
          starts_at: string | null
          subtitle: Json | null
          title: Json | null
          updated_at: string
        }
        Insert: {
          animation?: Json
          content?: Json
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["homepage_section_kind"]
          section_key: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: Json | null
          title?: Json | null
          updated_at?: string
        }
        Update: {
          animation?: Json
          content?: Json
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["homepage_section_kind"]
          section_key?: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: Json | null
          title?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          low_stock_threshold: number
          max_purchase_quantity: number | null
          quantity: number
          reserved_quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          id?: string
          low_stock_threshold?: number
          max_purchase_quantity?: number | null
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          id?: string
          low_stock_threshold?: number
          max_purchase_quantity?: number | null
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: Json | null
          created_at: string
          id: string
          read_at: string | null
          title: Json
          type: string
          user_id: string
        }
        Insert: {
          body?: Json | null
          created_at?: string
          id?: string
          read_at?: string | null
          title: Json
          type: string
          user_id: string
        }
        Update: {
          body?: Json | null
          created_at?: string
          id?: string
          read_at?: string | null
          title?: Json
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          compare_at_price: number | null
          created_at: string
          discount_total: number
          id: string
          image_path: string | null
          option_snapshot: Json
          product_id: string | null
          product_snapshot: Json
          quantity: number
          seller_order_id: string
          sku: string | null
          title: Json
          total: number
          unit_price: number
          variant_id: string | null
          weight_grams: number | null
        }
        Insert: {
          compare_at_price?: number | null
          created_at?: string
          discount_total?: number
          id?: string
          image_path?: string | null
          option_snapshot?: Json
          product_id?: string | null
          product_snapshot?: Json
          quantity: number
          seller_order_id: string
          sku?: string | null
          title: Json
          total: number
          unit_price: number
          variant_id?: string | null
          weight_grams?: number | null
        }
        Update: {
          compare_at_price?: number | null
          created_at?: string
          discount_total?: number
          id?: string
          image_path?: string | null
          option_snapshot?: Json
          product_id?: string | null
          product_snapshot?: Json
          quantity?: number
          seller_order_id?: string
          sku?: string | null
          title?: Json
          total?: number
          unit_price?: number
          variant_id?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "seller_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          seller_order_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          seller_order_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          seller_order_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "seller_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_returns: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          requested_at: string
          requested_by: string | null
          seller_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          requested_at?: string
          requested_by?: string | null
          seller_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string | null
          seller_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "seller_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          new_status: string
          note: string | null
          order_id: string | null
          previous_status: string | null
          seller_order_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          id?: string
          new_status: string
          note?: string | null
          order_id?: string | null
          previous_status?: string | null
          seller_order_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          new_status?: string
          note?: string | null
          order_id?: string | null
          previous_status?: string | null
          seller_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "seller_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_snapshot: Json
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_idempotency_key: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_note: string | null
          delivery_method: string | null
          discount_total: number
          failed_delivery_at: string | null
          failed_delivery_by: string | null
          failed_delivery_note: string | null
          failed_delivery_reason: string | null
          first_name: string | null
          grand_total: number
          guest_email: string | null
          guest_phone: string | null
          id: string
          last_name: string | null
          order_number: string
          payment_amount_due: number
          payment_method: string
          payment_paid_at: string | null
          payment_status: string
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          updated_at: string
        }
        Insert: {
          address_snapshot?: Json
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_idempotency_key?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_note?: string | null
          delivery_method?: string | null
          discount_total?: number
          failed_delivery_at?: string | null
          failed_delivery_by?: string | null
          failed_delivery_note?: string | null
          failed_delivery_reason?: string | null
          first_name?: string | null
          grand_total?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          last_name?: string | null
          order_number: string
          payment_amount_due?: number
          payment_method?: string
          payment_paid_at?: string | null
          payment_status?: string
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_idempotency_key?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_note?: string | null
          delivery_method?: string | null
          discount_total?: number
          failed_delivery_at?: string | null
          failed_delivery_by?: string | null
          failed_delivery_note?: string | null
          failed_delivery_reason?: string | null
          first_name?: string | null
          grand_total?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          last_name?: string | null
          order_number?: string
          payment_amount_due?: number
          payment_method?: string
          payment_paid_at?: string | null
          payment_status?: string
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          order_id: string
          paid_at: string | null
          payment_method: string
          provider_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id: string
          paid_at?: string | null
          payment_method: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id?: string
          paid_at?: string | null
          payment_method?: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      product_discovery_overrides: {
        Row: {
          badge: string | null
          created_at: string
          enabled: boolean
          ends_at: string | null
          id: string
          placement: string
          priority: number
          product_id: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          placement: string
          priority?: number
          product_id: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          placement?: string
          priority?: number
          product_id?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_discovery_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: Json | null
          color_id: string | null
          created_at: string
          id: string
          is_primary: boolean
          media_type: string
          metadata: Json
          product_id: string
          sort_order: number
          storage_path: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: Json | null
          color_id?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          metadata?: Json
          product_id: string
          sort_order?: number
          storage_path: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: Json | null
          color_id?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          metadata?: Json
          product_id?: string
          sort_order?: number
          storage_path?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          color_id: string | null
          created_at: string
          id: string
          label: Json
          product_option_id: string
          size_id: string | null
          sort_order: number
          value: string
        }
        Insert: {
          color_id?: string | null
          created_at?: string
          id?: string
          label: Json
          product_option_id: string
          size_id?: string | null
          sort_order?: number
          value: string
        }
        Update: {
          color_id?: string | null
          created_at?: string
          id?: string
          label?: Json
          product_option_id?: string
          size_id?: string | null
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_values_product_option_id_fkey"
            columns: ["product_option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_values_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          code: string
          created_at: string
          id: string
          name: Json
          product_id: string
          required: boolean
          size_group_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: Json
          product_id: string
          required?: boolean
          size_group_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: Json
          product_id?: string
          required?: boolean
          size_group_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_size_group_id_fkey"
            columns: ["size_group_id"]
            isOneToOne: false
            referencedRelation: "size_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_promotions: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string
          id: string
          product_id: string
          sale_price: number
          starts_at: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at: string
          id?: string
          product_id: string
          sale_price: number
          starts_at: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          product_id?: string
          sale_price?: number
          starts_at?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_promotions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tag_assignments: {
        Row: {
          created_at: string
          product_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tag_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: Json
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: Json
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json
          available: boolean
          barcode: string | null
          compare_at_price: number | null
          created_at: string
          id: string
          image_id: string | null
          price: number | null
          product_id: string
          sku: string
          sort_order: number
          status: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          available?: boolean
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          id?: string
          image_id?: string | null
          price?: number | null
          product_id: string
          sku: string
          sort_order?: number
          status?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          available?: boolean
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          id?: string
          image_id?: string | null
          price?: number | null
          product_id?: string
          sku?: string
          sort_order?: number
          status?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_price: number
          brand_id: string | null
          category_id: string | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string
          currency: string
          description: Json | null
          featured: boolean
          id: string
          metadata: Json
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          name: Json
          publication_status: string
          published_at: string | null
          seller_id: string
          short_description: Json | null
          sku: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          store_id: string | null
          updated_at: string
          visibility: string
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          base_price: number
          brand_id?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: Json | null
          featured?: boolean
          id?: string
          metadata?: Json
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          name: Json
          publication_status?: string
          published_at?: string | null
          seller_id: string
          short_description?: Json | null
          sku?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string | null
          updated_at?: string
          visibility?: string
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          base_price?: number
          brand_id?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: Json | null
          featured?: boolean
          id?: string
          metadata?: Json
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          name?: Json
          publication_status?: string
          published_at?: string | null
          seller_id?: string
          short_description?: Json | null
          sku?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string | null
          updated_at?: string
          visibility?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          preferred_locale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          first_name: string | null
          flagged_at: string | null
          id: string
          image_path: string | null
          last_name: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          order_item_id: string | null
          product_id: string
          rating: number
          status: string
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          first_name?: string | null
          flagged_at?: string | null
          id?: string
          image_path?: string | null
          last_name?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          order_item_id?: string | null
          product_id: string
          rating: number
          status?: string
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          first_name?: string | null
          flagged_at?: string | null
          id?: string
          image_path?: string | null
          last_name?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          order_item_id?: string | null
          product_id?: string
          rating?: number
          status?: string
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          key: Database["public"]["Enums"]["app_role"]
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: Database["public"]["Enums"]["app_role"]
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: Database["public"]["Enums"]["app_role"]
          label?: string
        }
        Relationships: []
      }
      seller_orders: {
        Row: {
          commission_total: number
          created_at: string
          delivery_method: string | null
          id: string
          order_id: string
          seller_id: string
          shipping_snapshot: Json
          shipping_total: number
          shipping_weight_grams: number
          status: Database["public"]["Enums"]["seller_order_status"]
          store_id: string | null
          subtotal: number
          updated_at: string
        }
        Insert: {
          commission_total?: number
          created_at?: string
          delivery_method?: string | null
          id?: string
          order_id: string
          seller_id: string
          shipping_snapshot?: Json
          shipping_total?: number
          shipping_weight_grams?: number
          status?: Database["public"]["Enums"]["seller_order_status"]
          store_id?: string | null
          subtotal?: number
          updated_at?: string
        }
        Update: {
          commission_total?: number
          created_at?: string
          delivery_method?: string | null
          id?: string
          order_id?: string
          seller_id?: string
          shipping_snapshot?: Json
          shipping_total?: number
          shipping_weight_grams?: number
          status?: Database["public"]["Enums"]["seller_order_status"]
          store_id?: string | null
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_staff: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          seller_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          seller_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          seller_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_staff_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          created_at: string
          id: string
          legal_name: string
          owner_id: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_name: string
          owner_id: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Relationships: []
      }
      shipping_rules: {
        Row: {
          commune_id: string | null
          created_at: string
          delivery_method: string
          enabled: boolean
          id: string
          max_weight_grams: number | null
          min_weight_grams: number
          price: number
          seller_id: string | null
          status: string
          updated_at: string
          wilaya_id: string | null
        }
        Insert: {
          commune_id?: string | null
          created_at?: string
          delivery_method: string
          enabled?: boolean
          id?: string
          max_weight_grams?: number | null
          min_weight_grams?: number
          price: number
          seller_id?: string | null
          status?: string
          updated_at?: string
          wilaya_id?: string | null
        }
        Update: {
          commune_id?: string | null
          created_at?: string
          delivery_method?: string
          enabled?: boolean
          id?: string
          max_weight_grams?: number | null
          min_weight_grams?: number
          price?: number
          seller_id?: string | null
          status?: string
          updated_at?: string
          wilaya_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rules_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rules_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rules_wilaya_id_fkey"
            columns: ["wilaya_id"]
            isOneToOne: false
            referencedRelation: "wilayas"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      size_groups: {
        Row: {
          active: boolean
          applies_to: string | null
          created_at: string
          id: string
          name: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string | null
          created_at?: string
          id?: string
          name: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string | null
          created_at?: string
          id?: string
          name?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      sizes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: Json
          size_group_id: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: Json
          size_group_id: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: Json
          size_group_id?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "sizes_size_group_id_fkey"
            columns: ["size_group_id"]
            isOneToOne: false
            referencedRelation: "size_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          banner_path: string | null
          created_at: string
          description: string | null
          id: string
          logo_path: string | null
          name: string
          seller_id: string
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          banner_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          seller_id: string
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          banner_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          seller_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
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
      variant_option_values: {
        Row: {
          created_at: string
          product_option_value_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          product_option_value_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          product_option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_option_values_product_option_value_id_fkey"
            columns: ["product_option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      wilayas: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: Json
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      checkout_cart:
        | {
            Args: {
              p_address_line: string
              p_cart_id: string
              p_commune_id: string
              p_customer_note?: string
              p_delivery_method: string
              p_first_name: string
              p_last_name: string
              p_phone: string
              p_session_token: string
              p_wilaya_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address_line: string
              p_cart_id: string
              p_commune_id: string
              p_customer_id?: string
              p_customer_note?: string
              p_delivery_method: string
              p_first_name: string
              p_idempotency_key?: string
              p_last_name: string
              p_phone: string
              p_session_token: string
              p_wilaya_id: string
            }
            Returns: Json
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      media_seller_id: { Args: { object_name: string }; Returns: string }
      transition_seller_order_status: {
        Args: {
          p_new_status: string
          p_note?: string
          p_seller_order_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "customer" | "seller_owner" | "seller_staff" | "super_admin"
      discovery_event_kind:
        | "product_view"
        | "category_view"
        | "search"
        | "wishlist"
        | "cart"
      homepage_section_kind:
        | "hero"
        | "categories"
        | "trending"
        | "best_sellers"
        | "new_arrivals"
        | "flash_sale"
        | "stores"
        | "recommendations"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "received"
        | "preparing"
        | "ready_for_shipping"
        | "handed_to_courier"
        | "in_transit"
        | "returned"
        | "failed_delivery"
      product_status: "draft" | "active" | "archived"
      seller_order_status:
        | "pending"
        | "accepted"
        | "processing"
        | "fulfilled"
        | "cancelled"
        | "refunded"
        | "confirmed"
        | "ready_for_shipping"
        | "handed_to_courier"
        | "in_transit"
        | "delivered"
        | "returned"
        | "failed_delivery"
      store_status: "draft" | "active" | "suspended" | "closed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "seller_owner", "seller_staff", "super_admin"],
      discovery_event_kind: [
        "product_view",
        "category_view",
        "search",
        "wishlist",
        "cart",
      ],
      homepage_section_kind: [
        "hero",
        "categories",
        "trending",
        "best_sellers",
        "new_arrivals",
        "flash_sale",
        "stores",
        "recommendations",
      ],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "received",
        "preparing",
        "ready_for_shipping",
        "handed_to_courier",
        "in_transit",
        "returned",
        "failed_delivery",
      ],
      product_status: ["draft", "active", "archived"],
      seller_order_status: [
        "pending",
        "accepted",
        "processing",
        "fulfilled",
        "cancelled",
        "refunded",
        "confirmed",
        "ready_for_shipping",
        "handed_to_courier",
        "in_transit",
        "delivered",
        "returned",
        "failed_delivery",
      ],
      store_status: ["draft", "active", "suspended", "closed"],
    },
  },
} as const

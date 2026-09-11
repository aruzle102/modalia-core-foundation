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
          cart_id: string
          created_at: string
          id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          quantity: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          quantity?: number
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
          quantity: number
          reserved_quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          id?: string
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
          created_at: string
          id: string
          product_id: string | null
          quantity: number
          seller_order_id: string
          sku: string | null
          title: Json
          total: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          quantity: number
          seller_order_id: string
          sku?: string | null
          title: Json
          total: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          seller_order_id?: string
          sku?: string | null
          title?: Json
          total?: number
          unit_price?: number
          variant_id?: string | null
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
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          discount_total: number
          grand_total: number
          guest_email: string | null
          guest_phone: string | null
          id: string
          order_number: string
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_total?: number
          grand_total?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          order_number: string
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_total?: number
          grand_total?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          order_number?: string
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
          created_at: string
          id: string
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_text?: Json | null
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_text?: Json | null
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          price: number | null
          product_id: string
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          price?: number | null
          product_id: string
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          price?: number | null
          product_id?: string
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
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
          base_price: number
          brand_id: string | null
          category_id: string | null
          created_at: string
          currency: string
          description: Json | null
          id: string
          name: Json
          seller_id: string
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          base_price: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: Json | null
          id?: string
          name: Json
          seller_id: string
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          base_price?: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: Json | null
          id?: string
          name?: Json
          seller_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
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
          id: string
          product_id: string
          rating: number
          status: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id: string
          rating: number
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id?: string
          rating?: number
          status?: string
          updated_at?: string
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
          id: string
          order_id: string
          seller_id: string
          shipping_total: number
          status: Database["public"]["Enums"]["seller_order_status"]
          subtotal: number
          updated_at: string
        }
        Insert: {
          commission_total?: number
          created_at?: string
          id?: string
          order_id: string
          seller_id: string
          shipping_total?: number
          status?: Database["public"]["Enums"]["seller_order_status"]
          subtotal?: number
          updated_at?: string
        }
        Update: {
          commission_total?: number
          created_at?: string
          id?: string
          order_id?: string
          seller_id?: string
          shipping_total?: number
          status?: Database["public"]["Enums"]["seller_order_status"]
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
          id: string
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
          id?: string
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
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      media_seller_id: { Args: { object_name: string }; Returns: string }
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
      product_status: "draft" | "active" | "archived"
      seller_order_status:
        | "pending"
        | "accepted"
        | "processing"
        | "fulfilled"
        | "cancelled"
        | "refunded"
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
      ],
      product_status: ["draft", "active", "archived"],
      seller_order_status: [
        "pending",
        "accepted",
        "processing",
        "fulfilled",
        "cancelled",
        "refunded",
      ],
      store_status: ["draft", "active", "suspended", "closed"],
    },
  },
} as const

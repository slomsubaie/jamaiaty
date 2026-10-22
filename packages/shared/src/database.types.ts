// Generated from the live database: npm run db:types (do not edit by hand).
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      archive_analyses: {
        Row: {
          association_id: string
          created_at: string
          document_count: number | null
          error: string | null
          finished_at: string | null
          id: string
          include_forecast: boolean
          kind: string
          parts_pending: string[]
          pending_document_count: number | null
          requested_by: string | null
          source_watermark: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          association_id: string
          created_at?: string
          document_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          include_forecast?: boolean
          kind: string
          parts_pending?: string[]
          pending_document_count?: number | null
          requested_by?: string | null
          source_watermark?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          association_id?: string
          created_at?: string
          document_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          include_forecast?: boolean
          kind?: string
          parts_pending?: string[]
          pending_document_count?: number | null
          requested_by?: string | null
          source_watermark?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_analyses_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_analyses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_analysis_results: {
        Row: {
          analysis_id: string
          association_id: string
          audience: string
          created_at: string
          model: string | null
          result: Json
          usage: Json | null
        }
        Insert: {
          analysis_id: string
          association_id: string
          audience: string
          created_at?: string
          model?: string | null
          result: Json
          usage?: Json | null
        }
        Update: {
          analysis_id?: string
          association_id?: string
          audience?: string
          created_at?: string
          model?: string | null
          result?: Json
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_analysis_results_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "archive_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_analysis_results_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_forecasts: {
        Row: {
          analysis_id: string
          association_id: string
          created_at: string
          model: string | null
          result: Json
          usage: Json | null
        }
        Insert: {
          analysis_id: string
          association_id: string
          created_at?: string
          model?: string | null
          result: Json
          usage?: Json | null
        }
        Update: {
          analysis_id?: string
          association_id?: string
          created_at?: string
          model?: string | null
          result?: Json
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_forecasts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "archive_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_forecasts_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          analysis_interval_days: number
          benchmark_opt_in: boolean
          city: string
          created_at: string
          id: string
          mullak_number: string | null
          name: string
          plan: string
          status: string
        }
        Insert: {
          analysis_interval_days?: number
          benchmark_opt_in?: boolean
          city: string
          created_at?: string
          id?: string
          mullak_number?: string | null
          name: string
          plan?: string
          status?: string
        }
        Update: {
          analysis_interval_days?: number
          benchmark_opt_in?: boolean
          city?: string
          created_at?: string
          id?: string
          mullak_number?: string | null
          name?: string
          plan?: string
          status?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          association_id: string | null
          created_at: string
          details: Json
          id: number
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          association_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          association_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          actual_amount: number
          association_id: string
          budget_id: string
          category: string
          created_at: string
          description: string | null
          id: string
          kind: string
          notes: string | null
          planned_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          actual_amount?: number
          association_id: string
          budget_id: string
          category: string
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          notes?: string | null
          planned_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          actual_amount?: number
          association_id?: string
          budget_id?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          notes?: string | null
          planned_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          association_id: string
          created_at: string
          created_by: string | null
          fiscal_year: number
          id: string
          notes: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          association_id: string
          created_at?: string
          created_by?: string | null
          fiscal_year: number
          id?: string
          notes?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          association_id?: string
          created_at?: string
          created_by?: string | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          association_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          association_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          association_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_digests: {
        Row: {
          association_id: string
          attempts: number
          digest: Json | null
          document_id: string
          error: string | null
          file_path: string
          model: string | null
          status: string
          updated_at: string
          usage: Json | null
        }
        Insert: {
          association_id: string
          attempts?: number
          digest?: Json | null
          document_id: string
          error?: string | null
          file_path: string
          model?: string | null
          status?: string
          updated_at?: string
          usage?: Json | null
        }
        Update: {
          association_id?: string
          attempts?: number
          digest?: Json | null
          document_id?: string
          error?: string | null
          file_path?: string
          model?: string | null
          status?: string
          updated_at?: string
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_digests_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_digests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          association_id: string
          category: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_date: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          title: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          visibility: string
        }
        Insert: {
          association_id: string
          category: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_date?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          visibility?: string
        }
        Update: {
          association_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_date?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          association_name: string | null
          created_at: string
          email: string
          full_name: string
          id: number
          ip_hash: string | null
          kind: string
          message: string
          phone: string | null
          reference: string | null
          status: string
          topic: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          association_name?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: never
          ip_hash?: string | null
          kind: string
          message: string
          phone?: string | null
          reference?: string | null
          status?: string
          topic?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          association_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: never
          ip_hash?: string | null
          kind?: string
          message?: string
          phone?: string | null
          reference?: string | null
          status?: string
          topic?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_items: {
        Row: {
          association_id: string
          body: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          folder_id: string
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          association_id: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          folder_id: string
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          association_id?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          folder_id?: string
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_items_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          association_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          visibility: string
        }
        Insert: {
          association_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          association_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          active: boolean
          association_id: string
          created_at: string
          id: string
          permissions: Database["public"]["Enums"]["board_permission"][]
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          association_id: string
          created_at?: string
          id?: string
          permissions?: Database["public"]["Enums"]["board_permission"][]
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          association_id?: string
          created_at?: string
          id?: string
          permissions?: Database["public"]["Enums"]["board_permission"][]
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_superadmin: boolean
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_superadmin?: boolean
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_superadmin?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      support_grant_events: {
        Row: {
          actor_id: string | null
          association_id: string
          created_at: string
          event: string
          grant_id: string
          id: number
          note: string | null
        }
        Insert: {
          actor_id?: string | null
          association_id: string
          created_at?: string
          event: string
          grant_id: string
          id?: never
          note?: string | null
        }
        Update: {
          actor_id?: string | null
          association_id?: string
          created_at?: string
          event?: string
          grant_id?: string
          id?: never
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_grant_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_grant_events_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "support_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_grants: {
        Row: {
          association_id: string
          can_edit: boolean
          created_at: string
          decided_at: string | null
          decided_by: string | null
          direction: string
          duration_hours: number
          expires_at: string | null
          id: string
          reason: string
          requested_by: string | null
          sections: Database["public"]["Enums"]["support_section"][]
          status: Database["public"]["Enums"]["support_grant_status"]
        }
        Insert: {
          association_id: string
          can_edit?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          direction?: string
          duration_hours?: number
          expires_at?: string | null
          id?: string
          reason: string
          requested_by?: string | null
          sections?: Database["public"]["Enums"]["support_section"][]
          status?: Database["public"]["Enums"]["support_grant_status"]
        }
        Update: {
          association_id?: string
          can_edit?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          direction?: string
          duration_hours?: number
          expires_at?: string | null
          id?: string
          reason?: string
          requested_by?: string | null
          sections?: Database["public"]["Enums"]["support_section"][]
          status?: Database["public"]["Enums"]["support_grant_status"]
        }
        Relationships: [
          {
            foreignKeyName: "support_grants_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_grants_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_grants_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_ownerships: {
        Row: {
          association_id: string
          created_at: string
          end_date: string | null
          id: string
          share_pct: number
          start_date: string
          unit_id: string
          user_id: string
        }
        Insert: {
          association_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          share_pct?: number
          start_date?: string
          unit_id: string
          user_id: string
        }
        Update: {
          association_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          share_pct?: number
          start_date?: string
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_ownerships_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_ownerships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_ownerships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          area_m2: number | null
          association_id: string
          building_id: string | null
          created_at: string
          floor: string | null
          id: string
          mullak_unit_ref: string | null
          unit_number: string
        }
        Insert: {
          area_m2?: number | null
          association_id: string
          building_id?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          mullak_unit_ref?: string | null
          unit_number: string
        }
        Update: {
          area_m2?: number | null
          association_id?: string
          building_id?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          mullak_unit_ref?: string | null
          unit_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_offers: {
        Row: {
          association_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          notes: string | null
          price_amount: number
          price_basis: string
          services: string[]
          start_date: string | null
          status: string
          title: string
          updated_at: string
          vat_included: boolean
          vendor_id: string
        }
        Insert: {
          association_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          price_amount: number
          price_basis: string
          services?: string[]
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          vat_included?: boolean
          vendor_id: string
        }
        Update: {
          association_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          price_amount?: number
          price_basis?: string
          services?: string[]
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          vat_included?: boolean
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_offers_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_offers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          association_id: string
          category: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          show_in_directory: boolean
          support_phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          association_id: string
          category: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          show_in_directory?: boolean
          support_phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          association_id?: string
          category?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          show_in_directory?: boolean
          support_phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      act_on_support_request: {
        Args: { p_action: string; p_grant: string; p_note?: string }
        Returns: undefined
      }
      acting_association: { Args: never; Returns: string }
      acting_kind: { Args: never; Returns: string }
      acting_role: { Args: never; Returns: string }
      analysis_configured: { Args: never; Returns: boolean }
      archive_file_access: {
        Args: { for_write: boolean; object_name: string }
        Returns: boolean
      }
      archive_source_watermark: { Args: { a: string }; Returns: string }
      call_internal_function: {
        Args: { body: Json; fn: string }
        Returns: undefined
      }
      can_manage_sections: { Args: { a: string }; Returns: boolean }
      can_view_document: {
        Args: { a: string; deleted_at: string; visibility: string }
        Returns: boolean
      }
      can_view_folder: { Args: { f: string }; Returns: boolean }
      can_view_section: {
        Args: { a: string; visibility: string }
        Returns: boolean
      }
      finance_summary: {
        Args: { a: string }
        Returns: {
          actual_expense: number
          actual_income: number
          budget_id: string
          fiscal_year: number
          planned_expense: number
          planned_income: number
          status: string
        }[]
      }
      finish_analysis_part: {
        Args: { failure?: string; part: string; run: string }
        Returns: string
      }
      has_permission: {
        Args: {
          a: string
          perm: Database["public"]["Enums"]["board_permission"]
        }
        Returns: boolean
      }
      has_support_grant: {
        Args: {
          a: string
          for_edit?: boolean
          section: Database["public"]["Enums"]["support_section"]
        }
        Returns: boolean
      }
      is_board: { Args: { a: string }; Returns: boolean }
      is_member: { Args: { a: string }; Returns: boolean }
      is_premium: { Args: { a: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      log_support_view: {
        Args: {
          a: string
          page: string
          section: Database["public"]["Enums"]["support_section"]
        }
        Returns: undefined
      }
      member_role: {
        Args: { a: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      owns_unit: { Args: { u: string }; Returns: boolean }
      queue_archive_analysis: {
        Args: { a: string; requester: string; run_kind: string }
        Returns: string
      }
      request_archive_analysis: { Args: { a: string }; Returns: string }
      role_counts: {
        Args: { a: string; r: Database["public"]["Enums"]["member_role"] }
        Returns: boolean
      }
      run_analysis_schedule: { Args: never; Returns: undefined }
      section_file_access: {
        Args: { for_write: boolean; object_name: string }
        Returns: boolean
      }
      set_superadmin: {
        Args: { grant_it: boolean; target: string }
        Returns: undefined
      }
      support_note: { Args: never; Returns: string }
      vendor_directory: {
        Args: { a: string }
        Returns: {
          category: string
          id: string
          name: string
          support_phone: string
          website: string
        }[]
      }
    }
    Enums: {
      board_permission:
        | "documents"
        | "vendors_contracts"
        | "finance"
        | "owners_units"
        | "announcements"
        | "approve_support_access"
        | "custom_sections"
      member_role: "president" | "board_member" | "owner"
      support_grant_status:
        | "pending"
        | "approved"
        | "rejected"
        | "revoked"
        | "completed"
      support_section:
        | "all"
        | "units"
        | "members"
        | "documents"
        | "vendors"
        | "finance"
        | "sections"
        | "analysis"
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
      board_permission: [
        "documents",
        "vendors_contracts",
        "finance",
        "owners_units",
        "announcements",
        "approve_support_access",
        "custom_sections",
      ],
      member_role: ["president", "board_member", "owner"],
      support_grant_status: [
        "pending",
        "approved",
        "rejected",
        "revoked",
        "completed",
      ],
      support_section: [
        "all",
        "units",
        "members",
        "documents",
        "vendors",
        "finance",
        "sections",
        "analysis",
      ],
    },
  },
} as const

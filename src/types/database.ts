/**
 * @fileoverview Generated Supabase Database Types
 *
 * These types represent the database schema and are used
 * for typed Supabase client queries.
 *
 * Generated from the database schema in docs/supabase-schema.sql.
 * When the schema changes, update this file accordingly.
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
          email: string | null;
          full_name: string | null;
          role: string;
          is_admin: boolean;
          seller_status: string;
          store_name: string | null;
          store_description: string | null;
          store_logo_url: string | null;
          stripe_account_id: string | null;
          stripe_connected: boolean;
          referral_code: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: string;
          is_admin?: boolean;
          seller_status?: string;
          store_name?: string | null;
          store_description?: string | null;
          store_logo_url?: string | null;
          stripe_account_id?: string | null;
          stripe_connected?: boolean;
          referral_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          role?: string;
          is_admin?: boolean;
          seller_status?: string;
          store_name?: string | null;
          store_description?: string | null;
          store_logo_url?: string | null;
          stripe_account_id?: string | null;
          stripe_connected?: boolean;
          referral_code?: string | null;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          seller_id: string | null;
          title: string;
          category: string | null;
          description: string | null;
          price_cents: number;
          stock: number;
          image_url: string | null;
          status: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          seller_id?: string | null;
          title: string;
          category?: string | null;
          description?: string | null;
          price_cents: number;
          stock?: number;
          image_url?: string | null;
          status?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          seller_id?: string | null;
          title?: string;
          category?: string | null;
          description?: string | null;
          price_cents?: number;
          stock?: number;
          image_url?: string | null;
          status?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
      };
      payment_sessions: {
        Row: {
          id: string;
          user_id: string | null;
          items: Json;
          amount_total_cents: number;
          status: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          items: Json;
          amount_total_cents: number;
          status?: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          items?: Json;
          amount_total_cents?: number;
          status?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          buyer_id: string | null;
          seller_id: string | null;
          product_id: string | null;
          product_name: string | null;
          quantity: number | null;
          amount_total_cents: number | null;
          commission_cents: number | null;
          status: string;
          refund_status: string;
          refund_reason: string | null;
          payment_intent_id: string | null;
          trace_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          buyer_id?: string | null;
          seller_id?: string | null;
          product_id?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          amount_total_cents?: number | null;
          commission_cents?: number | null;
          status?: string;
          refund_status?: string;
          refund_reason?: string | null;
          payment_intent_id?: string | null;
          trace_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          buyer_id?: string | null;
          seller_id?: string | null;
          product_id?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          amount_total_cents?: number | null;
          commission_cents?: number | null;
          status?: string;
          refund_status?: string;
          refund_reason?: string | null;
          payment_intent_id?: string | null;
          trace_id?: string | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          trace_id: string | null;
          event_type: string;
          severity: string | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trace_id?: string | null;
          event_type: string;
          severity?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trace_id?: string | null;
          event_type?: string;
          severity?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
      };
      processed_events: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
      };
      financial_ledger: {
        Row: {
          id: string;
          event_type: string;
          order_id: string;
          payment_intent_id: string | null;
          stripe_refund_id: string | null;
          amount_cents: number;
          currency: string;
          trace_id: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          order_id: string;
          payment_intent_id?: string | null;
          stripe_refund_id?: string | null;
          amount_cents: number;
          currency?: string;
          trace_id: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          order_id?: string;
          payment_intent_id?: string | null;
          stripe_refund_id?: string | null;
          amount_cents$?: number;
          currency?: string;
          trace_id?: string;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      payment_job_queue: {
        Row: {
          id: string;
          job_type: string;
          payload: Json | null;
          status: string;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          trace_id: string;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          job_type: string;
          payload?: Json | null;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          trace_id: string;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          job_type?: string;
          payload?: Json | null;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          trace_id?: string;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      background_jobs: {
        Row: {
          id: string;
          job_type: string;
          priority: string;
          payload: Json;
          status: string;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          scheduled_at: string | null;
          trace_id: string;
          dedup_key: string | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          job_type: string;
          priority?: string;
          payload: Json;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          scheduled_at?: string | null;
          trace_id: string;
          dedup_key?: string | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          job_type?: string;
          priority?: string;
          payload?: Json;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          scheduled_at?: string | null;
          trace_id?: string;
          dedup_key?: string | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      reconciliation_reports: {
        Row: {
          id: string;
          started_at: string;
          completed_at: string | null;
          status: string;
          stripe_payment_count: number;
          db_order_count: number;
          discrepancy_count: number;
          summary: Json | null;
          discrepancies: Json | null;
          healthy: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          started_at: string;
          completed_at?: string | null;
          status?: string;
          stripe_payment_count?: number;
          db_order_count?: number;
          discrepancy_count?: number;
          summary?: Json | null;
          discrepancies?: Json | null;
          healthy?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          started_at?: string;
          completed_at?: string | null;
          status?: string;
          stripe_payment_count?: number;
          db_order_count?: number;
          discrepancy_count?: number;
          summary?: Json | null;
          discrepancies?: Json | null;
          healthy?: boolean;
          created_at?: string;
        };
      };
      cart_items: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          quantity?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          quantity?: number;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          order_id: string;
          buyer_id: string;
          seller_id: string;
          involved_users: string[];
          last_message: string;
          updated_at: string;
          last_read_at: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          buyer_id: string;
          seller_id: string;
          involved_users: string[];
          last_message?: string;
          updated_at?: string;
          last_read_at?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          buyer_id?: string;
          seller_id?: string;
          involved_users?: string[];
          last_message?: string;
          updated_at?: string;
          last_read_at?: Json | null;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          text?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_: string]: never;
    };
    Functions: {
      fulfill_order: {
        Args: {
          p_session_id: string;
          p_payment_intent_id: string;
          p_trace_id: string;
        };
        Returns: undefined;
      };
      process_refund_atomic: {
        Args: {
          p_order_id: string;
          p_stripe_refund_id: string;
          p_refund_amount_cents: number;
          p_trace_id: string;
          p_initiated_by: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_: string]: never;
    };
  };
}

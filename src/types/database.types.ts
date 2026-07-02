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
      activity_log: {
        Row: {
          action_type: string
          business_id: string | null
          created_at: string | null
          description: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action_type: string
          business_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action_type?: string
          business_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          ad_body: string | null
          ad_image_url: string | null
          ad_title: string | null
          advertiser_contact: string | null
          advertiser_name: string | null
          business_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          impressions: number | null
          start_date: string | null
          status: string | null
          weekly_rate: number | null
        }
        Insert: {
          ad_body?: string | null
          ad_image_url?: string | null
          ad_title?: string | null
          advertiser_contact?: string | null
          advertiser_name?: string | null
          business_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          start_date?: string | null
          status?: string | null
          weekly_rate?: number | null
        }
        Update: {
          ad_body?: string | null
          ad_image_url?: string | null
          ad_title?: string | null
          advertiser_contact?: string | null
          advertiser_name?: string | null
          business_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          start_date?: string | null
          status?: string | null
          weekly_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          business_id: string | null
          campaign_id: string | null
          id: string
          shown_at: string | null
        }
        Insert: {
          business_id?: string | null
          campaign_id?: string | null
          id?: string
          shown_at?: string | null
        }
        Update: {
          business_id?: string | null
          campaign_id?: string | null
          id?: string
          shown_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string
          admin_role: string | null
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_name: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_email: string
          admin_role?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          admin_role?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          name: string
          permissions: Json | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          name: string
          permissions?: Json | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          name?: string
          permissions?: Json | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      aeo_content_pieces: {
        Row: {
          business_id: string
          content: string | null
          content_type: string
          created_at: string | null
          created_by: string | null
          id: string
          published: boolean | null
          target_queries: Json | null
          title: string | null
        }
        Insert: {
          business_id: string
          content?: string | null
          content_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          published?: boolean | null
          target_queries?: Json | null
          title?: string | null
        }
        Update: {
          business_id?: string
          content?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          published?: boolean | null
          target_queries?: Json | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aeo_content_pieces_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aeo_snapshots: {
        Row: {
          appeared: boolean | null
          business_id: string
          checked_at: string | null
          competitor_names: Json | null
          engine: string
          id: string
          position: number | null
          query_used: string | null
          recommendations: Json | null
          snippet: string | null
        }
        Insert: {
          appeared?: boolean | null
          business_id: string
          checked_at?: string | null
          competitor_names?: Json | null
          engine: string
          id?: string
          position?: number | null
          query_used?: string | null
          recommendations?: Json | null
          snippet?: string | null
        }
        Update: {
          appeared?: boolean | null
          business_id?: string
          checked_at?: string | null
          competitor_names?: Json | null
          engine?: string
          id?: string
          position?: number | null
          query_used?: string | null
          recommendations?: Json | null
          snippet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aeo_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_council_proposals: {
        Row: {
          agent_type: string
          business_id: string
          confidence: number | null
          conflicts_with: string[] | null
          council_decision: string | null
          council_reasoning: string | null
          created_at: string | null
          executed_at: string | null
          id: string
          modified_proposal_data: Json | null
          outcome_data: Json | null
          projected_impact_dollars: number | null
          proposal_data: Json
          proposal_type: string
          session_id: string
          synergises_with: string[] | null
          urgency: string | null
        }
        Insert: {
          agent_type: string
          business_id: string
          confidence?: number | null
          conflicts_with?: string[] | null
          council_decision?: string | null
          council_reasoning?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          modified_proposal_data?: Json | null
          outcome_data?: Json | null
          projected_impact_dollars?: number | null
          proposal_data: Json
          proposal_type: string
          session_id: string
          synergises_with?: string[] | null
          urgency?: string | null
        }
        Update: {
          agent_type?: string
          business_id?: string
          confidence?: number | null
          conflicts_with?: string[] | null
          council_decision?: string | null
          council_reasoning?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          modified_proposal_data?: Json | null
          outcome_data?: Json | null
          projected_impact_dollars?: number | null
          proposal_data?: Json
          proposal_type?: string
          session_id?: string
          synergises_with?: string[] | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_council_proposals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_council_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_council_sessions: {
        Row: {
          actual_revenue_impact: number | null
          business_id: string
          completed_at: string | null
          conflicts_detected: number | null
          created_at: string | null
          executed_actions: number | null
          id: string
          owner_priority: string | null
          plan: Json | null
          plan_narrative: string | null
          projected_cost_saving: number | null
          projected_revenue_impact: number | null
          proposals_count: number | null
          session_date: string
          status: string | null
        }
        Insert: {
          actual_revenue_impact?: number | null
          business_id: string
          completed_at?: string | null
          conflicts_detected?: number | null
          created_at?: string | null
          executed_actions?: number | null
          id?: string
          owner_priority?: string | null
          plan?: Json | null
          plan_narrative?: string | null
          projected_cost_saving?: number | null
          projected_revenue_impact?: number | null
          proposals_count?: number | null
          session_date?: string
          status?: string | null
        }
        Update: {
          actual_revenue_impact?: number | null
          business_id?: string
          completed_at?: string | null
          conflicts_detected?: number | null
          created_at?: string | null
          executed_actions?: number | null
          id?: string
          owner_priority?: string | null
          plan?: Json | null
          plan_narrative?: string | null
          projected_cost_saving?: number | null
          projected_revenue_impact?: number | null
          proposals_count?: number | null
          session_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_council_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_decisions: {
        Row: {
          agent_type: string
          business_id: string
          confidence_score: number | null
          created_at: string | null
          decision_data: Json
          executed_at: string | null
          expires_at: string | null
          id: string
          outcome: Json | null
          projected_impact_cents: number | null
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          agent_type: string
          business_id: string
          confidence_score?: number | null
          created_at?: string | null
          decision_data: Json
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          outcome?: Json | null
          projected_impact_cents?: number | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          agent_type?: string
          business_id?: string
          confidence_score?: number | null
          created_at?: string | null
          decision_data?: Json
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          outcome?: Json | null
          projected_impact_cents?: number | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_type: string
          business_id: string
          completed_at: string | null
          decisions_count: number | null
          duration_ms: number | null
          errors: Json | null
          id: string
          started_at: string
          triggered_by: string | null
        }
        Insert: {
          agent_type: string
          business_id: string
          completed_at?: string | null
          decisions_count?: number | null
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          started_at?: string
          triggered_by?: string | null
        }
        Update: {
          agent_type?: string
          business_id?: string
          completed_at?: string | null
          decisions_count?: number | null
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          started_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      agent_settings: {
        Row: {
          agent_type: string
          auto_approve_below_cents: number | null
          business_id: string
          config: Json | null
          council_priority: string | null
          enabled: boolean | null
          halo: Json | null
          mode: string | null
          updated_at: string | null
        }
        Insert: {
          agent_type: string
          auto_approve_below_cents?: number | null
          business_id: string
          config?: Json | null
          council_priority?: string | null
          enabled?: boolean | null
          halo?: Json | null
          mode?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_type?: string
          auto_approve_below_cents?: number | null
          business_id?: string
          config?: Json | null
          council_priority?: string | null
          enabled?: boolean | null
          halo?: Json | null
          mode?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          created_at: string | null
          created_by: string | null
          cta_href: string | null
          cta_label: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          message: string
          show_to_industries: string[] | null
          show_to_plans: string[] | null
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          show_to_industries?: string[] | null
          show_to_plans?: string[] | null
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          show_to_industries?: string[] | null
          show_to_plans?: string[] | null
          title?: string
          type?: string | null
        }
        Relationships: []
      }
      aria_action_log: {
        Row: {
          action_type: string
          after_state: Json
          before_state: Json
          business_id: string
          conversation_id: string | null
          entity_ids: string[]
          entity_type: string
          executed_at: string
          id: string
          message_excerpt: string | null
          rollback_by: string | null
          rolled_back_at: string | null
          triggered_by: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          after_state?: Json
          before_state?: Json
          business_id: string
          conversation_id?: string | null
          entity_ids?: string[]
          entity_type: string
          executed_at?: string
          id?: string
          message_excerpt?: string | null
          rollback_by?: string | null
          rolled_back_at?: string | null
          triggered_by?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          after_state?: Json
          before_state?: Json
          business_id?: string
          conversation_id?: string | null
          entity_ids?: string[]
          entity_type?: string
          executed_at?: string
          id?: string
          message_excerpt?: string | null
          rollback_by?: string | null
          rolled_back_at?: string | null
          triggered_by?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_action_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_action_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "aria_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_actions: {
        Row: {
          business_id: string | null
          category: string | null
          confidence: string | null
          created_at: string | null
          executed_by_user_id: string | null
          expected_impact: string | null
          id: string
          payload: Json | null
          priority: string | null
          reason: string | null
          recommendation: string | null
          rollback_data: Json | null
          rolled_back_at: string | null
          source: string | null
          status: string | null
          title: string
          triggered_by: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          confidence?: string | null
          created_at?: string | null
          executed_by_user_id?: string | null
          expected_impact?: string | null
          id?: string
          payload?: Json | null
          priority?: string | null
          reason?: string | null
          recommendation?: string | null
          rollback_data?: Json | null
          rolled_back_at?: string | null
          source?: string | null
          status?: string | null
          title: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          confidence?: string | null
          created_at?: string | null
          executed_by_user_id?: string | null
          expected_impact?: string | null
          id?: string
          payload?: Json | null
          priority?: string | null
          reason?: string | null
          recommendation?: string | null
          rollback_data?: Json | null
          rolled_back_at?: string | null
          source?: string | null
          status?: string | null
          title?: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_advice_weights: {
        Row: {
          business_id: string
          category: string
          id: string
          last_updated_at: string
          negative_outcomes: number
          neutral_outcomes: number
          positive_outcomes: number
          weight: number
        }
        Insert: {
          business_id: string
          category: string
          id?: string
          last_updated_at?: string
          negative_outcomes?: number
          neutral_outcomes?: number
          positive_outcomes?: number
          weight?: number
        }
        Update: {
          business_id?: string
          category?: string
          id?: string
          last_updated_at?: string
          negative_outcomes?: number
          neutral_outcomes?: number
          positive_outcomes?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "aria_advice_weights_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_agent_actions: {
        Row: {
          action_input: Json | null
          action_output: Json | null
          action_type: string
          agent_name: string
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          business_id: string
          council_run_id: string | null
          created_at: string
          error_detail: string | null
          executed: boolean | null
          executed_at: string | null
          id: string
          risk_level: string | null
        }
        Insert: {
          action_input?: Json | null
          action_output?: Json | null
          action_type: string
          agent_name: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          council_run_id?: string | null
          created_at?: string
          error_detail?: string | null
          executed?: boolean | null
          executed_at?: string | null
          id?: string
          risk_level?: string | null
        }
        Update: {
          action_input?: Json | null
          action_output?: Json | null
          action_type?: string
          agent_name?: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          council_run_id?: string | null
          created_at?: string
          error_detail?: string | null
          executed?: boolean | null
          executed_at?: string | null
          id?: string
          risk_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_agent_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_agent_memory: {
        Row: {
          business_id: string
          confidence: number | null
          created_at: string
          id: string
          last_confirmed_at: string | null
          memory_key: string
          memory_type: string
          memory_value: Json
          times_confirmed: number | null
        }
        Insert: {
          business_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          memory_key: string
          memory_type: string
          memory_value: Json
          times_confirmed?: number | null
        }
        Update: {
          business_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          memory_key?: string
          memory_type?: string
          memory_value?: Json
          times_confirmed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_agent_memory_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_ai_calls: {
        Row: {
          agent_key: string
          business_id: string | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          cost_usd_cents: number | null
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_id: string | null
          model_provider: string | null
          output_tokens: number | null
          provider: string
          request_summary: string | null
          response_summary: string | null
          role: string
          search_units: number | null
          success: boolean
        }
        Insert: {
          agent_key: string
          business_id?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_usd_cents?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string | null
          model_provider?: string | null
          output_tokens?: number | null
          provider: string
          request_summary?: string | null
          response_summary?: string | null
          role: string
          search_units?: number | null
          success?: boolean
        }
        Update: {
          agent_key?: string
          business_id?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_usd_cents?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string | null
          model_provider?: string | null
          output_tokens?: number | null
          provider?: string
          request_summary?: string | null
          response_summary?: string | null
          role?: string
          search_units?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "aria_ai_calls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_autopilot_actions: {
        Row: {
          action_data: Json | null
          action_type: string | null
          agent_type: string | null
          approved_at: string | null
          business_id: string
          category: string | null
          channel: string | null
          confidence: number | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          estimated_impact: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          message_sent: string | null
          offer_type: string | null
          outcome_data: Json | null
          outcome_note: string | null
          outcome_revenue_cents: number | null
          priority: string | null
          proposal_id: string | null
          reasoning: string | null
          status: string | null
          summary: string | null
          target_count: number | null
          target_date: string | null
          tier: string | null
          title: string | null
          triggered_by: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type?: string | null
          agent_type?: string | null
          approved_at?: string | null
          business_id: string
          category?: string | null
          channel?: string | null
          confidence?: number | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          estimated_impact?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          message_sent?: string | null
          offer_type?: string | null
          outcome_data?: Json | null
          outcome_note?: string | null
          outcome_revenue_cents?: number | null
          priority?: string | null
          proposal_id?: string | null
          reasoning?: string | null
          status?: string | null
          summary?: string | null
          target_count?: number | null
          target_date?: string | null
          tier?: string | null
          title?: string | null
          triggered_by?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string | null
          agent_type?: string | null
          approved_at?: string | null
          business_id?: string
          category?: string | null
          channel?: string | null
          confidence?: number | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          estimated_impact?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          message_sent?: string | null
          offer_type?: string | null
          outcome_data?: Json | null
          outcome_note?: string | null
          outcome_revenue_cents?: number | null
          priority?: string | null
          proposal_id?: string | null
          reasoning?: string | null
          status?: string | null
          summary?: string | null
          target_count?: number | null
          target_date?: string | null
          tier?: string | null
          title?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_autopilot_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_batch_jobs: {
        Row: {
          batch_id: string
          business_count: number
          completed_at: string | null
          error_message: string | null
          id: string
          job_type: string
          results_processed: number | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          batch_id: string
          business_count: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          results_processed?: number | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          batch_id?: string
          business_count?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          results_processed?: number | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: []
      }
      aria_briefings_cache: {
        Row: {
          briefing_date: string
          bullets: Json
          business_id: string
          created_at: string
          id: string
        }
        Insert: {
          briefing_date: string
          bullets?: Json
          business_id: string
          created_at?: string
          id?: string
        }
        Update: {
          briefing_date?: string
          bullets?: Json
          business_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_briefings_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_business_memory: {
        Row: {
          business_id: string
          confidence: number
          content: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          id: string
          importance: number
          is_active: boolean
          kind: string
          last_referenced_at: string | null
          reference_count: number
          source_id: string | null
          source_type: string
          superseded_by: string | null
          topic: string | null
        }
        Insert: {
          business_id: string
          confidence?: number
          content: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: string
          importance?: number
          is_active?: boolean
          kind: string
          last_referenced_at?: string | null
          reference_count?: number
          source_id?: string | null
          source_type: string
          superseded_by?: string | null
          topic?: string | null
        }
        Update: {
          business_id?: string
          confidence?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: string
          importance?: number
          is_active?: boolean
          kind?: string
          last_referenced_at?: string | null
          reference_count?: number
          source_id?: string | null
          source_type?: string
          superseded_by?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_business_memory_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_business_memory_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "aria_business_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_campaigns: {
        Row: {
          agent_type: string | null
          business_id: string
          created_at: string | null
          customer_ids: Json | null
          id: string
          message_template: string | null
          sent_count: number | null
          status: string | null
        }
        Insert: {
          agent_type?: string | null
          business_id: string
          created_at?: string | null
          customer_ids?: Json | null
          id?: string
          message_template?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Update: {
          agent_type?: string | null
          business_id?: string
          created_at?: string | null
          customer_ids?: Json | null
          id?: string
          message_template?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_competitor_alerts: {
        Row: {
          alert_type: string
          business_id: string
          competitor_name: string
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          read: boolean | null
        }
        Insert: {
          alert_type?: string
          business_id: string
          competitor_name: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          read?: boolean | null
        }
        Update: {
          alert_type?: string
          business_id?: string
          competitor_name?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          read?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_competitor_alerts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_competitor_watches: {
        Row: {
          business_id: string
          competitor_name: string
          competitor_url: string | null
          created_at: string
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_result: Json | null
          products_to_watch: string[] | null
          updated_at: string
        }
        Insert: {
          business_id: string
          competitor_name: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_result?: Json | null
          products_to_watch?: string[] | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          competitor_name?: string
          competitor_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_result?: Json | null
          products_to_watch?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_competitor_watches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_condition_alerts: {
        Row: {
          alert_channels: string[]
          business_id: string
          condition_config: Json
          condition_type: string
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          recipients: string[]
          trigger_count: number
        }
        Insert: {
          alert_channels?: string[]
          business_id: string
          condition_config?: Json
          condition_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          recipients?: string[]
          trigger_count?: number
        }
        Update: {
          alert_channels?: string[]
          business_id?: string
          condition_config?: Json
          condition_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          recipients?: string[]
          trigger_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "aria_condition_alerts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_conversation_summaries: {
        Row: {
          business_id: string
          conversation_date: string
          created_at: string
          followup_promised: Json
          id: string
          key_concerns: Json
          key_decisions: Json
          mode: string
          summary: string | null
        }
        Insert: {
          business_id: string
          conversation_date: string
          created_at?: string
          followup_promised?: Json
          id?: string
          key_concerns?: Json
          key_decisions?: Json
          mode?: string
          summary?: string | null
        }
        Update: {
          business_id?: string
          conversation_date?: string
          created_at?: string
          followup_promised?: Json
          id?: string
          key_concerns?: Json
          key_decisions?: Json
          mode?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_conversation_summaries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_conversations: {
        Row: {
          business_id: string | null
          content: string | null
          created_at: string | null
          has_escalated: boolean
          id: string
          last_intent: string | null
          last_message_at: string | null
          message_count: number
          messages: Json | null
          pending_action: string | null
          pending_action_expires_at: string | null
          role: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          has_escalated?: boolean
          id?: string
          last_intent?: string | null
          last_message_at?: string | null
          message_count?: number
          messages?: Json | null
          pending_action?: string | null
          pending_action_expires_at?: string | null
          role?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          has_escalated?: boolean
          id?: string
          last_intent?: string | null
          last_message_at?: string | null
          message_count?: number
          messages?: Json | null
          pending_action?: string | null
          pending_action_expires_at?: string | null
          role?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_custom_features: {
        Row: {
          built_by: string | null
          business_id: string | null
          created_at: string | null
          deployed_at: string | null
          feature_name: string
          feature_plan: Json | null
          feature_request: string
          id: string
          status: string | null
        }
        Insert: {
          built_by?: string | null
          business_id?: string | null
          created_at?: string | null
          deployed_at?: string | null
          feature_name: string
          feature_plan?: Json | null
          feature_request: string
          id?: string
          status?: string | null
        }
        Update: {
          built_by?: string | null
          business_id?: string | null
          created_at?: string | null
          deployed_at?: string | null
          feature_name?: string
          feature_plan?: Json | null
          feature_request?: string
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_custom_features_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_daily_briefings: {
        Row: {
          briefing_date: string
          business_id: string
          content: string
          generated_at: string
          id: string
          source: string | null
        }
        Insert: {
          briefing_date: string
          business_id: string
          content: string
          generated_at?: string
          id?: string
          source?: string | null
        }
        Update: {
          briefing_date?: string
          business_id?: string
          content?: string
          generated_at?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_daily_briefings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_daily_spend: {
        Row: {
          business_id: string
          chat_count: number | null
          day: string
          image_count: number | null
          total_cost_cents: number | null
          web_search_count: number | null
        }
        Insert: {
          business_id: string
          chat_count?: number | null
          day: string
          image_count?: number | null
          total_cost_cents?: number | null
          web_search_count?: number | null
        }
        Update: {
          business_id?: string
          chat_count?: number | null
          day?: string
          image_count?: number | null
          total_cost_cents?: number | null
          web_search_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_daily_spend_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_data_quality: {
        Row: {
          assessed_date: string
          business_id: string
          created_at: string
          customer_data_score: number | null
          id: string
          inventory_data_score: number | null
          missing_critical: Json
          missing_helpful: Json
          overall_score: number | null
          pos_data_score: number | null
          staff_data_score: number | null
          supplier_data_score: number | null
        }
        Insert: {
          assessed_date: string
          business_id: string
          created_at?: string
          customer_data_score?: number | null
          id?: string
          inventory_data_score?: number | null
          missing_critical?: Json
          missing_helpful?: Json
          overall_score?: number | null
          pos_data_score?: number | null
          staff_data_score?: number | null
          supplier_data_score?: number | null
        }
        Update: {
          assessed_date?: string
          business_id?: string
          created_at?: string
          customer_data_score?: number | null
          id?: string
          inventory_data_score?: number | null
          missing_critical?: Json
          missing_helpful?: Json
          overall_score?: number | null
          pos_data_score?: number | null
          staff_data_score?: number | null
          supplier_data_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_data_quality_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_external_costs: {
        Row: {
          business_id: string | null
          cost_cents: number
          cost_type: string
          created_at: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          business_id?: string | null
          cost_cents: number
          cost_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          business_id?: string | null
          cost_cents?: number
          cost_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_external_costs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_hypotheses: {
        Row: {
          accepted_at: string | null
          action_id: string | null
          baseline_metric_cents: number | null
          business_id: string
          category: string
          confidence: number
          description: string
          evidence_payload: Json | null
          evidence_summary: string | null
          expires_at: string
          generated_at: string
          id: string
          outcome_30d_cents: number | null
          outcome_7d_cents: number | null
          outcome_checked_at: string | null
          outcome_verdict: string | null
          predicted_impact_cents: number | null
          predicted_impact_label: string | null
          rejected_at: string | null
          rejection_reason: string | null
          risk_level: string
          status: string
          title: string
        }
        Insert: {
          accepted_at?: string | null
          action_id?: string | null
          baseline_metric_cents?: number | null
          business_id: string
          category: string
          confidence?: number
          description: string
          evidence_payload?: Json | null
          evidence_summary?: string | null
          expires_at?: string
          generated_at?: string
          id?: string
          outcome_30d_cents?: number | null
          outcome_7d_cents?: number | null
          outcome_checked_at?: string | null
          outcome_verdict?: string | null
          predicted_impact_cents?: number | null
          predicted_impact_label?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          risk_level?: string
          status?: string
          title: string
        }
        Update: {
          accepted_at?: string | null
          action_id?: string | null
          baseline_metric_cents?: number | null
          business_id?: string
          category?: string
          confidence?: number
          description?: string
          evidence_payload?: Json | null
          evidence_summary?: string | null
          expires_at?: string
          generated_at?: string
          id?: string
          outcome_30d_cents?: number | null
          outcome_7d_cents?: number | null
          outcome_checked_at?: string | null
          outcome_verdict?: string | null
          predicted_impact_cents?: number | null
          predicted_impact_label?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          risk_level?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_hypotheses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "aria_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_hypotheses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_influencer_config: {
        Row: {
          ariaos_instagram_account_id: string | null
          ariaos_page_access_token: string | null
          business_id: string | null
          created_at: string | null
          default_influencer_id: string | null
          id: string
          is_active: boolean | null
          master_image_url: string | null
          reels_enabled: boolean | null
          reels_enabled_at: string | null
          stripe_subscription_item_id: string | null
          updated_at: string | null
        }
        Insert: {
          ariaos_instagram_account_id?: string | null
          ariaos_page_access_token?: string | null
          business_id?: string | null
          created_at?: string | null
          default_influencer_id?: string | null
          id?: string
          is_active?: boolean | null
          master_image_url?: string | null
          reels_enabled?: boolean | null
          reels_enabled_at?: string | null
          stripe_subscription_item_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ariaos_instagram_account_id?: string | null
          ariaos_page_access_token?: string | null
          business_id?: string | null
          created_at?: string | null
          default_influencer_id?: string | null
          id?: string
          is_active?: boolean | null
          master_image_url?: string | null
          reels_enabled?: boolean | null
          reels_enabled_at?: string | null
          stripe_subscription_item_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_influencer_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_influencer_config_default_influencer_id_fkey"
            columns: ["default_influencer_id"]
            isOneToOne: false
            referencedRelation: "aria_influencer_library"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_influencer_library: {
        Row: {
          created_at: string | null
          description: string | null
          higgsfield_job_id: string | null
          higgsfield_model: string | null
          id: string
          image_url: string
          industry_tags: string[] | null
          is_active: boolean | null
          is_featured: boolean | null
          name: string
          soul_id: string | null
          soul_status: string | null
          soul_trained_at: string | null
          style_tags: string[] | null
          training_image_urls: string[] | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          higgsfield_job_id?: string | null
          higgsfield_model?: string | null
          id?: string
          image_url: string
          industry_tags?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          name: string
          soul_id?: string | null
          soul_status?: string | null
          soul_trained_at?: string | null
          style_tags?: string[] | null
          training_image_urls?: string[] | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          higgsfield_job_id?: string | null
          higgsfield_model?: string | null
          id?: string
          image_url?: string
          industry_tags?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          name?: string
          soul_id?: string | null
          soul_status?: string | null
          soul_trained_at?: string | null
          style_tags?: string[] | null
          training_image_urls?: string[] | null
          usage_count?: number | null
        }
        Relationships: []
      }
      aria_influencer_posts: {
        Row: {
          caption: string | null
          created_at: string
          featured_business_id: string | null
          hashtags: Json | null
          id: string
          industry: string | null
          instagram_post_id: string | null
          post_type: string | null
          published_at: string | null
          scene_prompt: string | null
          status: string
          story_expires_at: string | null
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          featured_business_id?: string | null
          hashtags?: Json | null
          id?: string
          industry?: string | null
          instagram_post_id?: string | null
          post_type?: string | null
          published_at?: string | null
          scene_prompt?: string | null
          status?: string
          story_expires_at?: string | null
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          featured_business_id?: string | null
          hashtags?: Json | null
          id?: string
          industry?: string | null
          instagram_post_id?: string | null
          post_type?: string | null
          published_at?: string | null
          scene_prompt?: string | null
          status?: string
          story_expires_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_influencer_posts_featured_business_id_fkey"
            columns: ["featured_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_insights_cache: {
        Row: {
          bullets: Json
          business_id: string
          context_hash: string
          created_at: string
          expires_at: string | null
          id: string
        }
        Insert: {
          bullets?: Json
          business_id: string
          context_hash: string
          created_at?: string
          expires_at?: string | null
          id?: string
        }
        Update: {
          bullets?: Json
          business_id?: string
          context_hash?: string
          created_at?: string
          expires_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_insights_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_marketing_autopost_rules: {
        Row: {
          allowed_post_types: Json | null
          business_id: string | null
          channels: Json | null
          created_at: string | null
          earliest_hour: number | null
          enabled: boolean | null
          id: string
          latest_hour: number | null
          max_per_week: number | null
          updated_at: string | null
        }
        Insert: {
          allowed_post_types?: Json | null
          business_id?: string | null
          channels?: Json | null
          created_at?: string | null
          earliest_hour?: number | null
          enabled?: boolean | null
          id?: string
          latest_hour?: number | null
          max_per_week?: number | null
          updated_at?: string | null
        }
        Update: {
          allowed_post_types?: Json | null
          business_id?: string | null
          channels?: Json | null
          created_at?: string | null
          earliest_hour?: number | null
          enabled?: boolean | null
          id?: string
          latest_hour?: number | null
          max_per_week?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_marketing_autopost_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_marketing_drafts: {
        Row: {
          aria_reasoning: string | null
          business_id: string | null
          channels: Json | null
          community_post_id: string | null
          created_at: string | null
          draft_body: string
          draft_hashtags: Json | null
          draft_title: string | null
          id: string
          plan_run_id: string
          post_type: string
          posted_at: string | null
          social_post_ids: Json | null
          status: string
          suggested_for_at: string | null
          updated_at: string | null
        }
        Insert: {
          aria_reasoning?: string | null
          business_id?: string | null
          channels?: Json | null
          community_post_id?: string | null
          created_at?: string | null
          draft_body: string
          draft_hashtags?: Json | null
          draft_title?: string | null
          id?: string
          plan_run_id: string
          post_type?: string
          posted_at?: string | null
          social_post_ids?: Json | null
          status?: string
          suggested_for_at?: string | null
          updated_at?: string | null
        }
        Update: {
          aria_reasoning?: string | null
          business_id?: string | null
          channels?: Json | null
          community_post_id?: string | null
          created_at?: string | null
          draft_body?: string
          draft_hashtags?: Json | null
          draft_title?: string | null
          id?: string
          plan_run_id?: string
          post_type?: string
          posted_at?: string | null
          social_post_ids?: Json | null
          status?: string
          suggested_for_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_marketing_drafts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_marketing_drafts_community_post_id_fkey"
            columns: ["community_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_monthly_spend: {
        Row: {
          business_id: string | null
          haiku_cents: number | null
          id: string
          opus_cents: number | null
          other_cents: number | null
          sonnet_cents: number | null
          total_cents: number | null
          updated_at: string | null
          year_month: string
        }
        Insert: {
          business_id?: string | null
          haiku_cents?: number | null
          id?: string
          opus_cents?: number | null
          other_cents?: number | null
          sonnet_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
          year_month: string
        }
        Update: {
          business_id?: string | null
          haiku_cents?: number | null
          id?: string
          opus_cents?: number | null
          other_cents?: number | null
          sonnet_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_monthly_spend_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          business_id: string | null
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_outcomes: {
        Row: {
          acted_on: boolean | null
          acted_on_at: string | null
          action_id: string | null
          advice_weight_delta: number | null
          baseline_metric_cents: number | null
          business_id: string | null
          category: string | null
          id: string
          notes: string | null
          outcome_30d_cents: number | null
          outcome_7d_cents: number | null
          outcome_checked_at: string | null
          outcome_value_cents: number | null
          outcome_verdict: string | null
          recommendation_detail: string | null
          recommendation_type: string
          recommended_at: string | null
        }
        Insert: {
          acted_on?: boolean | null
          acted_on_at?: string | null
          action_id?: string | null
          advice_weight_delta?: number | null
          baseline_metric_cents?: number | null
          business_id?: string | null
          category?: string | null
          id?: string
          notes?: string | null
          outcome_30d_cents?: number | null
          outcome_7d_cents?: number | null
          outcome_checked_at?: string | null
          outcome_value_cents?: number | null
          outcome_verdict?: string | null
          recommendation_detail?: string | null
          recommendation_type: string
          recommended_at?: string | null
        }
        Update: {
          acted_on?: boolean | null
          acted_on_at?: string | null
          action_id?: string | null
          advice_weight_delta?: number | null
          baseline_metric_cents?: number | null
          business_id?: string | null
          category?: string | null
          id?: string
          notes?: string | null
          outcome_30d_cents?: number | null
          outcome_7d_cents?: number | null
          outcome_checked_at?: string | null
          outcome_value_cents?: number | null
          outcome_verdict?: string | null
          recommendation_detail?: string | null
          recommendation_type?: string
          recommended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_outcomes_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "aria_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_outcomes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_promotions: {
        Row: {
          actual_lift_cents: number | null
          business_id: string | null
          created_at: string | null
          estimated_lift_cents: number | null
          id: string
          offer_text: string | null
          promotion_name: string | null
          sms_message: string | null
          status: string | null
          target_day: string | null
          was_successful: boolean | null
        }
        Insert: {
          actual_lift_cents?: number | null
          business_id?: string | null
          created_at?: string | null
          estimated_lift_cents?: number | null
          id?: string
          offer_text?: string | null
          promotion_name?: string | null
          sms_message?: string | null
          status?: string | null
          target_day?: string | null
          was_successful?: boolean | null
        }
        Update: {
          actual_lift_cents?: number | null
          business_id?: string | null
          created_at?: string | null
          estimated_lift_cents?: number | null
          id?: string
          offer_text?: string | null
          promotion_name?: string | null
          sms_message?: string | null
          status?: string | null
          target_day?: string | null
          was_successful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_scheduled_reports: {
        Row: {
          business_id: string
          created_at: string
          deliverable_spec: Json | null
          format: string
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          recipients: string[]
          report_type: string
          send_at_hour: number
          send_on_days: number[] | null
        }
        Insert: {
          business_id: string
          created_at?: string
          deliverable_spec?: Json | null
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          recipients?: string[]
          report_type?: string
          send_at_hour?: number
          send_on_days?: number[] | null
        }
        Update: {
          business_id?: string
          created_at?: string
          deliverable_spec?: Json | null
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          recipients?: string[]
          report_type?: string
          send_at_hour?: number
          send_on_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_scheduled_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_seo_context: {
        Row: {
          business_id: string
          critical_issues: Json
          health_score: number
          top_keyword: string | null
          top_keyword_rank: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          critical_issues?: Json
          health_score?: number
          top_keyword?: string | null
          top_keyword_rank?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          critical_issues?: Json
          health_score?: number
          top_keyword?: string | null
          top_keyword_rank?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_seo_context_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_signal_cache: {
        Row: {
          business_id: string | null
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          signal_type: string
        }
        Insert: {
          business_id?: string | null
          cache_key: string
          created_at?: string
          expires_at: string
          id?: string
          payload: Json
          signal_type: string
        }
        Update: {
          business_id?: string | null
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_signal_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_skills: {
        Row: {
          built_in: boolean | null
          business_id: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          icon: string | null
          id: string
          name: string
          system_prompt_addition: string
        }
        Insert: {
          built_in?: boolean | null
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          icon?: string | null
          id?: string
          name: string
          system_prompt_addition: string
        }
        Update: {
          built_in?: boolean | null
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          icon?: string | null
          id?: string
          name?: string
          system_prompt_addition?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_skills_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_studio_assets: {
        Row: {
          asset_type: string
          business_id: string
          created_at: string | null
          enhanced_prompt: string | null
          favourite: boolean | null
          folder: string
          format: string
          id: string
          image_url: string
          name: string | null
          prompt: string | null
          provider: string | null
          status: string
          style: string
          tags: string[] | null
          video_url: string | null
        }
        Insert: {
          asset_type?: string
          business_id: string
          created_at?: string | null
          enhanced_prompt?: string | null
          favourite?: boolean | null
          folder?: string
          format?: string
          id?: string
          image_url: string
          name?: string | null
          prompt?: string | null
          provider?: string | null
          status?: string
          style?: string
          tags?: string[] | null
          video_url?: string | null
        }
        Update: {
          asset_type?: string
          business_id?: string
          created_at?: string | null
          enhanced_prompt?: string | null
          favourite?: boolean | null
          folder?: string
          format?: string
          id?: string
          image_url?: string
          name?: string | null
          prompt?: string | null
          provider?: string | null
          status?: string
          style?: string
          tags?: string[] | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_studio_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_suggestions: {
        Row: {
          business_id: string
          expires_at: string
          generated_at: string
          id: string
          suggestions: string[]
        }
        Insert: {
          business_id: string
          expires_at?: string
          generated_at?: string
          id?: string
          suggestions?: string[]
        }
        Update: {
          business_id?: string
          expires_at?: string
          generated_at?: string
          id?: string
          suggestions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "aria_suggestions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_task_outputs: {
        Row: {
          business_id: string
          conversation_id: string | null
          created_at: string
          data_snapshot: Json | null
          error_message: string | null
          id: string
          is_public: boolean
          output_kind: string
          pdf_url: string | null
          render_html: string | null
          share_token: string | null
          shared_at: string | null
          status: string
          task_prompt: string
          title: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          conversation_id?: string | null
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          is_public?: boolean
          output_kind?: string
          pdf_url?: string | null
          render_html?: string | null
          share_token?: string | null
          shared_at?: string | null
          status?: string
          task_prompt: string
          title: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          conversation_id?: string | null
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          is_public?: boolean
          output_kind?: string
          pdf_url?: string | null
          render_html?: string | null
          share_token?: string | null
          shared_at?: string | null
          status?: string
          task_prompt?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_task_outputs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_tracking_preferences: {
        Row: {
          business_id: string
          category: string
          created_at: string | null
          id: string
          is_tracking: boolean | null
          paused_at: string | null
          paused_reason: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          category: string
          created_at?: string | null
          id?: string
          is_tracking?: boolean | null
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string | null
          id?: string
          is_tracking?: boolean | null
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_tracking_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_user_tasks: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          notify_email: boolean
          output_id: string | null
          started_at: string | null
          status: string
          task_prompt: string
          title: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notify_email?: boolean
          output_id?: string | null
          started_at?: string | null
          status?: string
          task_prompt: string
          title: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notify_email?: boolean
          output_id?: string | null
          started_at?: string | null
          status?: string
          task_prompt?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "aria_user_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aria_user_tasks_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: false
            referencedRelation: "aria_task_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_wiring_health_checks: {
        Row: {
          business_id: string | null
          check_name: string
          checked_at: string | null
          details: Json | null
          id: string
          status: string
          threshold: string | null
          value: number | null
        }
        Insert: {
          business_id?: string | null
          check_name: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          status: string
          threshold?: string | null
          value?: number | null
        }
        Update: {
          business_id?: string | null
          check_name?: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          status?: string
          threshold?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_wiring_health_checks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_item_photos: {
        Row: {
          audit_id: string | null
          id: string
          item_id: string | null
          photo_url: string | null
          uploaded_at: string | null
        }
        Insert: {
          audit_id?: string | null
          id?: string
          item_id?: string | null
          photo_url?: string | null
          uploaded_at?: string | null
        }
        Update: {
          audit_id?: string | null
          id?: string
          item_id?: string | null
          photo_url?: string | null
          uploaded_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          available_balance: number | null
          balance: number | null
          basiq_account_id: string | null
          business_id: string | null
          currency: string | null
          id: string
          institution_name: string | null
          is_active: boolean | null
          last_synced_at: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          available_balance?: number | null
          balance?: number | null
          basiq_account_id?: string | null
          business_id?: string | null
          currency?: string | null
          id?: string
          institution_name?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          available_balance?: number | null
          balance?: number | null
          basiq_account_id?: string | null
          business_id?: string | null
          currency?: string | null
          id?: string
          institution_name?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string | null
          amount: number | null
          balance: number | null
          basiq_transaction_id: string | null
          business_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          direction: string | null
          id: string
          posted_date: string | null
          transaction_date: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          balance?: number | null
          basiq_transaction_id?: string | null
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          direction?: string | null
          id?: string
          posted_date?: string | null
          transaction_date?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          balance?: number | null
          basiq_transaction_id?: string | null
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          direction?: string | null
          id?: string
          posted_date?: string | null
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bas_drafts: {
        Row: {
          business_id: string
          created_at: string | null
          due_date: string | null
          field_1a_gst_on_sales: number | null
          field_1b_gst_credits: number | null
          g1_total_sales: number | null
          g11_noncapital_purchases: number | null
          g3_gst_free_sales: number | null
          g4_input_taxed_sales: number | null
          handover_generated_at: string | null
          handover_summary: string | null
          id: string
          net_gst: number | null
          notes: string | null
          period_end: string
          period_start: string
          quarter: string | null
          reconciliation_gaps: Json | null
          status: string | null
          submitted_at: string | null
          total_gst_collected: number | null
          total_gst_paid: number | null
          total_payable: number | null
          total_sales: number | null
          total_super: number | null
          total_wages: number | null
          unclassified_sales_count: number | null
          updated_at: string | null
          w1_total_salary_wages: number | null
          w2_amounts_withheld: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          due_date?: string | null
          field_1a_gst_on_sales?: number | null
          field_1b_gst_credits?: number | null
          g1_total_sales?: number | null
          g11_noncapital_purchases?: number | null
          g3_gst_free_sales?: number | null
          g4_input_taxed_sales?: number | null
          handover_generated_at?: string | null
          handover_summary?: string | null
          id?: string
          net_gst?: number | null
          notes?: string | null
          period_end: string
          period_start: string
          quarter?: string | null
          reconciliation_gaps?: Json | null
          status?: string | null
          submitted_at?: string | null
          total_gst_collected?: number | null
          total_gst_paid?: number | null
          total_payable?: number | null
          total_sales?: number | null
          total_super?: number | null
          total_wages?: number | null
          unclassified_sales_count?: number | null
          updated_at?: string | null
          w1_total_salary_wages?: number | null
          w2_amounts_withheld?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          due_date?: string | null
          field_1a_gst_on_sales?: number | null
          field_1b_gst_credits?: number | null
          g1_total_sales?: number | null
          g11_noncapital_purchases?: number | null
          g3_gst_free_sales?: number | null
          g4_input_taxed_sales?: number | null
          handover_generated_at?: string | null
          handover_summary?: string | null
          id?: string
          net_gst?: number | null
          notes?: string | null
          period_end?: string
          period_start?: string
          quarter?: string | null
          reconciliation_gaps?: Json | null
          status?: string | null
          submitted_at?: string | null
          total_gst_collected?: number | null
          total_gst_paid?: number | null
          total_payable?: number | null
          total_sales?: number | null
          total_super?: number | null
          total_wages?: number | null
          unclassified_sales_count?: number | null
          updated_at?: string | null
          w1_total_salary_wages?: number | null
          w2_amounts_withheld?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bas_drafts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      basiq_connections: {
        Row: {
          basiq_user_id: string | null
          business_id: string
          connection_id: string | null
          created_at: string
          id: string
          institution: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          basiq_user_id?: string | null
          business_id: string
          connection_id?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          basiq_user_id?: string | null
          business_id?: string
          connection_id?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "basiq_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_services: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          description: string | null
          gst_applicable: boolean
          id: string
          name: string
          recurring: boolean
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          gst_applicable?: boolean
          id?: string
          name: string
          recurring?: boolean
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          gst_applicable?: boolean
          id?: string
          name?: string
          recurring?: boolean
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billable_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_availability: {
        Row: {
          buffer_minutes: number | null
          business_id: string | null
          created_at: string | null
          day_of_week: number | null
          end_time: string | null
          id: string
          is_available: boolean | null
          max_bookings_per_day: number | null
          start_time: string | null
        }
        Insert: {
          buffer_minutes?: number | null
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          max_bookings_per_day?: number | null
          start_time?: string | null
        }
        Update: {
          buffer_minutes?: number | null
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          max_bookings_per_day?: number | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_availability_rules: {
        Row: {
          business_id: string | null
          created_at: string | null
          day_of_week: number | null
          end_time: string | null
          id: string
          is_available: boolean | null
          start_time: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          start_time?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminder_log: {
        Row: {
          booking_id: string | null
          channel: string | null
          id: string
          reminder_type: string | null
          sent_at: string | null
        }
        Insert: {
          booking_id?: string | null
          channel?: string | null
          id?: string
          reminder_type?: string | null
          sent_at?: string | null
        }
        Update: {
          booking_id?: string | null
          channel?: string | null
          id?: string
          reminder_type?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminder_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_services: {
        Row: {
          business_id: string | null
          color: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          max_party_size: number | null
          name: string
          price: number | null
        }
        Insert: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          max_party_size?: number | null
          name: string
          price?: number | null
        }
        Update: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          max_party_size?: number | null
          name?: string
          price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_slots: {
        Row: {
          business_id: string | null
          created_at: string | null
          current_bookings: number | null
          id: string
          is_blocked: boolean | null
          max_bookings: number | null
          service_id: string | null
          slot_date: string
          slot_time: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          current_bookings?: number | null
          id?: string
          is_blocked?: boolean | null
          max_bookings?: number | null
          service_id?: string | null
          slot_date: string
          slot_time: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          current_bookings?: number | null
          id?: string
          is_blocked?: boolean | null
          max_bookings?: number | null
          service_id?: string | null
          slot_date?: string
          slot_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_slots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_slots_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount: number | null
          aria_notes: string | null
          booking_date: string | null
          booking_time: string | null
          booking_token: string | null
          business_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          duration_minutes: number | null
          id: string
          no_show_score: number | null
          notes: string | null
          paid_at: string | null
          party_size: number | null
          payment_amount: number | null
          reminder_sent_at: string | null
          rescheduled_from: string | null
          service: string | null
          service_id: string | null
          source: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
          visitor_email: string | null
          visitor_name: string | null
          visitor_phone: string | null
          widget_conv_id: string | null
        }
        Insert: {
          amount?: number | null
          aria_notes?: string | null
          booking_date?: string | null
          booking_time?: string | null
          booking_token?: string | null
          business_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          duration_minutes?: number | null
          id?: string
          no_show_score?: number | null
          notes?: string | null
          paid_at?: string | null
          party_size?: number | null
          payment_amount?: number | null
          reminder_sent_at?: string | null
          rescheduled_from?: string | null
          service?: string | null
          service_id?: string | null
          source?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          widget_conv_id?: string | null
        }
        Update: {
          amount?: number | null
          aria_notes?: string | null
          booking_date?: string | null
          booking_time?: string | null
          booking_token?: string | null
          business_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          duration_minutes?: number | null
          id?: string
          no_show_score?: number | null
          notes?: string | null
          paid_at?: string | null
          party_size?: number | null
          payment_amount?: number | null
          reminder_sent_at?: string | null
          rescheduled_from?: string | null
          service?: string | null
          service_id?: string | null
          source?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          widget_conv_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_widget_conv_id_fkey"
            columns: ["widget_conv_id"]
            isOneToOne: false
            referencedRelation: "widget_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_aeo_profiles: {
        Row: {
          business_id: string
          content_freshness_score: number | null
          google_business_score: number | null
          improvement_recommendations: Json | null
          known_address: string | null
          known_hours: string | null
          known_name: string | null
          known_phone: string | null
          known_price_range: string | null
          known_website: string | null
          last_updated: string | null
          missing_fields: Json | null
          review_velocity_score: number | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          content_freshness_score?: number | null
          google_business_score?: number | null
          improvement_recommendations?: Json | null
          known_address?: string | null
          known_hours?: string | null
          known_name?: string | null
          known_phone?: string | null
          known_price_range?: string | null
          known_website?: string | null
          last_updated?: string | null
          missing_fields?: Json | null
          review_velocity_score?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          content_freshness_score?: number | null
          google_business_score?: number | null
          improvement_recommendations?: Json | null
          known_address?: string | null
          known_hours?: string | null
          known_name?: string | null
          known_phone?: string | null
          known_price_range?: string | null
          known_website?: string | null
          last_updated?: string | null
          missing_fields?: Json | null
          review_velocity_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_aeo_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_expenses: {
        Row: {
          amount: number | null
          business_id: string | null
          category: string | null
          created_at: string | null
          date: string | null
          expense_date: string | null
          id: string
          label: string
          notes: string | null
          sort_order: number | null
          supplier_invoice_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          expense_date?: string | null
          id?: string
          label: string
          notes?: string | null
          sort_order?: number | null
          supplier_invoice_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          expense_date?: string | null
          id?: string
          label?: string
          notes?: string | null
          sort_order?: number | null
          supplier_invoice_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_features: {
        Row: {
          business_id: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          feature_type: string
          id: string
          is_active: boolean | null
          location: string
          name: string
          status: string | null
          updated_at: string | null
          upvotes: number | null
        }
        Insert: {
          business_id?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          feature_type: string
          id?: string
          is_active?: boolean | null
          location?: string
          name: string
          status?: string | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Update: {
          business_id?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          feature_type?: string
          id?: string
          is_active?: boolean | null
          location?: string
          name?: string
          status?: string | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_features_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          business_id: string | null
          close_time: string | null
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string | null
        }
        Insert: {
          business_id?: string | null
          close_time?: string | null
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time?: string | null
        }
        Update: {
          business_id?: string | null
          close_time?: string | null
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_media: {
        Row: {
          aria_description: string | null
          business_id: string | null
          created_at: string | null
          file_size_bytes: number | null
          filename: string | null
          height: number | null
          id: string
          media_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          uploaded_at: string | null
          url: string
          used_in_posts: number | null
          width: number | null
        }
        Insert: {
          aria_description?: string | null
          business_id?: string | null
          created_at?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          height?: number | null
          id?: string
          media_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          uploaded_at?: string | null
          url: string
          used_in_posts?: number | null
          width?: number | null
        }
        Update: {
          aria_description?: string | null
          business_id?: string | null
          created_at?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          height?: number | null
          id?: string
          media_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          uploaded_at?: string | null
          url?: string
          used_in_posts?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_media_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_onboarding: {
        Row: {
          business_id: string
          completed_steps: Json
          created_at: string
          current_step: string
          id: string
          provisioning_error: string | null
          provisioning_finished_at: string | null
          provisioning_started_at: string | null
          provisioning_status: string
          provisioning_steps: Json
          step_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          completed_steps?: Json
          created_at?: string
          current_step?: string
          id?: string
          provisioning_error?: string | null
          provisioning_finished_at?: string | null
          provisioning_started_at?: string | null
          provisioning_status?: string
          provisioning_steps?: Json
          step_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          completed_steps?: Json
          created_at?: string
          current_step?: string
          id?: string
          provisioning_error?: string | null
          provisioning_finished_at?: string | null
          provisioning_started_at?: string | null
          provisioning_status?: string
          provisioning_steps?: Json
          step_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_onboarding_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_review_requests: {
        Row: {
          business_id: string
          created_at: string
          id: string
          owner_explanation: string | null
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_abn: string | null
          submitted_acn: string | null
          supporting_detail: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          owner_explanation?: string | null
          reason: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_abn?: string | null
          submitted_acn?: string | null
          supporting_detail?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          owner_explanation?: string | null
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_abn?: string | null
          submitted_acn?: string | null
          supporting_detail?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_review_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_reviews: {
        Row: {
          business_id: string
          created_at: string | null
          external_review_id: string | null
          id: string
          is_crisis: boolean | null
          key_themes: Json | null
          platform: string
          rating: number | null
          responded_at: string | null
          response_drafted_by: string | null
          response_status: string | null
          response_text: string | null
          review_date: string | null
          review_text: string | null
          reviewer_name: string | null
          reviewer_photo_url: string | null
          sentiment: string | null
          sentiment_score: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          external_review_id?: string | null
          id?: string
          is_crisis?: boolean | null
          key_themes?: Json | null
          platform: string
          rating?: number | null
          responded_at?: string | null
          response_drafted_by?: string | null
          response_status?: string | null
          response_text?: string | null
          review_date?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          external_review_id?: string | null
          id?: string
          is_crisis?: boolean | null
          key_themes?: Json | null
          platform?: string
          rating?: number | null
          responded_at?: string | null
          response_drafted_by?: string | null
          response_status?: string | null
          response_text?: string | null
          review_date?: string | null
          review_text?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_setup_progress: {
        Row: {
          business_id: string
          completed_tasks: Json
          created_at: string
          dismissed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          completed_tasks?: Json
          created_at?: string
          dismissed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          completed_tasks?: Json
          created_at?: string
          dismissed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_setup_progress_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          sonnet_monthly_budget_cents: number | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          sonnet_monthly_budget_cents?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          sonnet_monthly_budget_cents?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      businesses: {
        Row: {
          abn: string | null
          abn_lookup_raw: Json | null
          abn_status: string | null
          abn_verification_method: string | null
          abn_verified: boolean | null
          abn_verified_at: string | null
          access_blocked_reason: string | null
          access_status: string | null
          acn: string | null
          address: string | null
          alert_sms_enabled: boolean | null
          auto_review_requests: boolean | null
          basiq_connected: boolean | null
          basiq_connected_at: string | null
          basiq_user_id: string | null
          biggest_challenge: string | null
          booking_buffer_minutes: number | null
          booking_link_slug: string | null
          business_model: string | null
          business_state: string | null
          business_subtype: string | null
          city: string | null
          closing_hour_local: number | null
          community_bio: string | null
          community_cover_url: string | null
          community_verified: boolean | null
          created_at: string | null
          data_source: string | null
          default_quote_terms: string | null
          display_suggestion_max_pct: number | null
          email: string | null
          enterprise_policies: Json | null
          entity_type: string | null
          evening_briefing_enabled: boolean | null
          evening_briefing_lead_hours: number | null
          facebook_page_id: string | null
          google_average_rating: number | null
          google_business_url: string | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          google_review_link: string | null
          google_reviews_last_synced: string | null
          google_total_reviews: number | null
          gst_registered: boolean | null
          gst_registered_from: string | null
          hub_visible_features: Json | null
          id: string
          industry: string | null
          industry_subtype: string | null
          internal_notes: string | null
          is_active: boolean | null
          is_internal: boolean
          lat: number | null
          legal_name: string | null
          lng: number | null
          logo_url: string | null
          loyalty_enabled: boolean | null
          loyalty_minimum_redeem: number | null
          loyalty_points_expiry_months: number | null
          loyalty_points_name: string | null
          loyalty_points_per_dollar: number | null
          loyalty_program_name: string | null
          loyalty_redeem_rate: number | null
          monthly_revenue: string | null
          morning_briefing_enabled: boolean | null
          name: string
          onboarding_complete: boolean | null
          order_min_sales_30d: number | null
          order_stock_threshold: number | null
          owner_name: string | null
          owner_phone: string | null
          parent_account_id: string | null
          phone: string | null
          plan: string | null
          plan_override_at: string | null
          plan_override_by: string | null
          pos_enabled: boolean | null
          postcode: string | null
          requires_briefing_refresh: boolean
          review_auto_request_enabled: boolean | null
          review_auto_send: boolean | null
          review_request_cooldown_days: number | null
          review_request_min_spend_cents: number | null
          review_send_delay_hours: number | null
          slack_access_token: string | null
          slack_briefing_enabled: boolean | null
          slack_channel_id: string | null
          slack_channel_name: string | null
          slack_connected: boolean | null
          slack_team_id: string | null
          slack_team_name: string | null
          slug: string | null
          square_connected: boolean | null
          staff_count: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          suburb: string | null
          terminal_layout: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          timezone: string | null
          trading_name: string | null
          trial_ends_at: string | null
          user_id: string
          website: string | null
          weekly_report_email: string | null
          weekly_report_enabled: boolean | null
          weekly_report_kpis: Json | null
          weekly_revenue_target: number | null
          xero_access_token: string | null
          xero_auto_sync: boolean | null
          xero_connected_at: string | null
          xero_refresh_token: string | null
          xero_tenant_id: string | null
          xero_token_expires_at: string | null
          year_established: number | null
          yelp_url: string | null
        }
        Insert: {
          abn?: string | null
          abn_lookup_raw?: Json | null
          abn_status?: string | null
          abn_verification_method?: string | null
          abn_verified?: boolean | null
          abn_verified_at?: string | null
          access_blocked_reason?: string | null
          access_status?: string | null
          acn?: string | null
          address?: string | null
          alert_sms_enabled?: boolean | null
          auto_review_requests?: boolean | null
          basiq_connected?: boolean | null
          basiq_connected_at?: string | null
          basiq_user_id?: string | null
          biggest_challenge?: string | null
          booking_buffer_minutes?: number | null
          booking_link_slug?: string | null
          business_model?: string | null
          business_state?: string | null
          business_subtype?: string | null
          city?: string | null
          closing_hour_local?: number | null
          community_bio?: string | null
          community_cover_url?: string | null
          community_verified?: boolean | null
          created_at?: string | null
          data_source?: string | null
          default_quote_terms?: string | null
          display_suggestion_max_pct?: number | null
          email?: string | null
          enterprise_policies?: Json | null
          entity_type?: string | null
          evening_briefing_enabled?: boolean | null
          evening_briefing_lead_hours?: number | null
          facebook_page_id?: string | null
          google_average_rating?: number | null
          google_business_url?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          google_review_link?: string | null
          google_reviews_last_synced?: string | null
          google_total_reviews?: number | null
          gst_registered?: boolean | null
          gst_registered_from?: string | null
          hub_visible_features?: Json | null
          id?: string
          industry?: string | null
          industry_subtype?: string | null
          internal_notes?: string | null
          is_internal?: boolean
          is_active?: boolean | null
          lat?: number | null
          legal_name?: string | null
          lng?: number | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          loyalty_minimum_redeem?: number | null
          loyalty_points_expiry_months?: number | null
          loyalty_points_name?: string | null
          loyalty_points_per_dollar?: number | null
          loyalty_program_name?: string | null
          loyalty_redeem_rate?: number | null
          monthly_revenue?: string | null
          morning_briefing_enabled?: boolean | null
          name: string
          onboarding_complete?: boolean | null
          order_min_sales_30d?: number | null
          order_stock_threshold?: number | null
          owner_name?: string | null
          owner_phone?: string | null
          parent_account_id?: string | null
          phone?: string | null
          plan?: string | null
          plan_override_at?: string | null
          plan_override_by?: string | null
          pos_enabled?: boolean | null
          postcode?: string | null
          requires_briefing_refresh?: boolean
          review_auto_request_enabled?: boolean | null
          review_auto_send?: boolean | null
          review_request_cooldown_days?: number | null
          review_request_min_spend_cents?: number | null
          review_send_delay_hours?: number | null
          slack_access_token?: string | null
          slack_briefing_enabled?: boolean | null
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_connected?: boolean | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          slug?: string | null
          square_connected?: boolean | null
          staff_count?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suburb?: string | null
          terminal_layout?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          timezone?: string | null
          trading_name?: string | null
          trial_ends_at?: string | null
          user_id: string
          website?: string | null
          weekly_report_email?: string | null
          weekly_report_enabled?: boolean | null
          weekly_report_kpis?: Json | null
          weekly_revenue_target?: number | null
          xero_access_token?: string | null
          xero_auto_sync?: boolean | null
          xero_connected_at?: string | null
          xero_refresh_token?: string | null
          xero_tenant_id?: string | null
          xero_token_expires_at?: string | null
          year_established?: number | null
          yelp_url?: string | null
        }
        Update: {
          abn?: string | null
          abn_lookup_raw?: Json | null
          abn_status?: string | null
          abn_verification_method?: string | null
          abn_verified?: boolean | null
          abn_verified_at?: string | null
          access_blocked_reason?: string | null
          access_status?: string | null
          acn?: string | null
          address?: string | null
          alert_sms_enabled?: boolean | null
          auto_review_requests?: boolean | null
          basiq_connected?: boolean | null
          basiq_connected_at?: string | null
          basiq_user_id?: string | null
          biggest_challenge?: string | null
          booking_buffer_minutes?: number | null
          booking_link_slug?: string | null
          business_model?: string | null
          business_state?: string | null
          business_subtype?: string | null
          city?: string | null
          closing_hour_local?: number | null
          community_bio?: string | null
          community_cover_url?: string | null
          community_verified?: boolean | null
          created_at?: string | null
          data_source?: string | null
          default_quote_terms?: string | null
          display_suggestion_max_pct?: number | null
          email?: string | null
          enterprise_policies?: Json | null
          entity_type?: string | null
          evening_briefing_enabled?: boolean | null
          evening_briefing_lead_hours?: number | null
          facebook_page_id?: string | null
          google_average_rating?: number | null
          google_business_url?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          google_review_link?: string | null
          google_reviews_last_synced?: string | null
          google_total_reviews?: number | null
          gst_registered?: boolean | null
          gst_registered_from?: string | null
          hub_visible_features?: Json | null
          id?: string
          industry?: string | null
          industry_subtype?: string | null
          is_internal?: boolean
          internal_notes?: string | null
          is_active?: boolean | null
          lat?: number | null
          legal_name?: string | null
          lng?: number | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          loyalty_minimum_redeem?: number | null
          loyalty_points_expiry_months?: number | null
          loyalty_points_name?: string | null
          loyalty_points_per_dollar?: number | null
          loyalty_program_name?: string | null
          loyalty_redeem_rate?: number | null
          monthly_revenue?: string | null
          morning_briefing_enabled?: boolean | null
          name?: string
          onboarding_complete?: boolean | null
          order_min_sales_30d?: number | null
          order_stock_threshold?: number | null
          owner_name?: string | null
          owner_phone?: string | null
          parent_account_id?: string | null
          phone?: string | null
          plan?: string | null
          plan_override_at?: string | null
          plan_override_by?: string | null
          pos_enabled?: boolean | null
          postcode?: string | null
          requires_briefing_refresh?: boolean
          review_auto_request_enabled?: boolean | null
          review_auto_send?: boolean | null
          review_request_cooldown_days?: number | null
          review_request_min_spend_cents?: number | null
          review_send_delay_hours?: number | null
          slack_access_token?: string | null
          slack_briefing_enabled?: boolean | null
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_connected?: boolean | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          slug?: string | null
          square_connected?: boolean | null
          staff_count?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suburb?: string | null
          terminal_layout?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          timezone?: string | null
          trading_name?: string | null
          trial_ends_at?: string | null
          user_id?: string
          website?: string | null
          weekly_report_email?: string | null
          weekly_report_enabled?: boolean | null
          weekly_report_kpis?: Json | null
          weekly_revenue_target?: number | null
          xero_access_token?: string | null
          xero_auto_sync?: boolean | null
          xero_connected_at?: string | null
          xero_refresh_token?: string | null
          xero_tenant_id?: string | null
          xero_token_expires_at?: string | null
          year_established?: number | null
          yelp_url?: string | null
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          business_id: string
          campaign_id: string
          channel: string
          clicked_at: string | null
          created_at: string | null
          customer_id: string
          delivered_at: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          resend_id: string | null
          revenue_cents: number | null
          sent_at: string | null
          status: string
          twilio_sid: string | null
          visited_after: boolean | null
        }
        Insert: {
          business_id: string
          campaign_id: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          resend_id?: string | null
          revenue_cents?: number | null
          sent_at?: string | null
          status?: string
          twilio_sid?: string | null
          visited_after?: boolean | null
        }
        Update: {
          business_id?: string
          campaign_id?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          resend_id?: string | null
          revenue_cents?: number | null
          sent_at?: string | null
          status?: string
          twilio_sid?: string | null
          visited_after?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          campaign_id: string | null
          channel: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          scheduled_send_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          scheduled_send_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          scheduled_send_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          business_id: string | null
          channel: string
          created_at: string | null
          email_body: string | null
          email_subject: string | null
          id: string
          is_global: boolean | null
          name: string
          sms_body: string | null
          type: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          business_id?: string | null
          channel?: string
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          sms_body?: string | null
          type: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          business_id?: string | null
          channel?: string
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          sms_body?: string | null
          type?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ab_parent_id: string | null
          ab_variant: string | null
          aria_generated: boolean | null
          aria_rationale: string | null
          attributed_revenue: number | null
          business_id: string | null
          channel: string
          click_count: number | null
          clicked_count: number | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          email_body: string | null
          email_subject: string | null
          error: string | null
          failed_at: string | null
          failed_count: number | null
          id: string
          message: string | null
          name: string | null
          open_count: number | null
          opened_count: number | null
          opt_out_message: string | null
          recipients_count: number | null
          reply_count: number | null
          response_count: number | null
          returned_customers: number | null
          revenue_attributed_cents: number | null
          roi_percent: number | null
          scheduled_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          sent_at_final: string | null
          sent_count: number | null
          sms_sent: boolean | null
          status: string | null
          subject: string | null
          target_segment: string | null
          target_tag: string | null
          target_type: string
          template_id: string | null
          twilio_sid: string | null
          type: string | null
          unsubscribe_count: number | null
          unsubscribed_count: number | null
        }
        Insert: {
          ab_parent_id?: string | null
          ab_variant?: string | null
          aria_generated?: boolean | null
          aria_rationale?: string | null
          attributed_revenue?: number | null
          business_id?: string | null
          channel?: string
          click_count?: number | null
          clicked_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          email_body?: string | null
          email_subject?: string | null
          error?: string | null
          failed_at?: string | null
          failed_count?: number | null
          id?: string
          message?: string | null
          name?: string | null
          open_count?: number | null
          opened_count?: number | null
          opt_out_message?: string | null
          recipients_count?: number | null
          reply_count?: number | null
          response_count?: number | null
          returned_customers?: number | null
          revenue_attributed_cents?: number | null
          roi_percent?: number | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_at_final?: string | null
          sent_count?: number | null
          sms_sent?: boolean | null
          status?: string | null
          subject?: string | null
          target_segment?: string | null
          target_tag?: string | null
          target_type?: string
          template_id?: string | null
          twilio_sid?: string | null
          type?: string | null
          unsubscribe_count?: number | null
          unsubscribed_count?: number | null
        }
        Update: {
          ab_parent_id?: string | null
          ab_variant?: string | null
          aria_generated?: boolean | null
          aria_rationale?: string | null
          attributed_revenue?: number | null
          business_id?: string | null
          channel?: string
          click_count?: number | null
          clicked_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          email_body?: string | null
          email_subject?: string | null
          error?: string | null
          failed_at?: string | null
          failed_count?: number | null
          id?: string
          message?: string | null
          name?: string | null
          open_count?: number | null
          opened_count?: number | null
          opt_out_message?: string | null
          recipients_count?: number | null
          reply_count?: number | null
          response_count?: number | null
          returned_customers?: number | null
          revenue_attributed_cents?: number | null
          roi_percent?: number | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_at_final?: string | null
          sent_count?: number | null
          sms_sent?: boolean | null
          status?: string | null
          subject?: string | null
          target_segment?: string | null
          target_tag?: string | null
          target_type?: string
          template_id?: string | null
          twilio_sid?: string | null
          type?: string | null
          unsubscribe_count?: number | null
          unsubscribed_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ab_parent_id_fkey"
            columns: ["ab_parent_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_forecasts: {
        Row: {
          actions: Json | null
          business_id: string
          closing_cash_position: number | null
          created_at: string
          forecast_week: string
          id: string
          opening_cash_position: number | null
          predicted_bas_gst: number | null
          predicted_other_fixed: number | null
          predicted_payroll: number | null
          predicted_pos_revenue: number | null
          predicted_rent_utilities: number | null
          predicted_supplier_payments: number | null
          reorder_events: Json | null
          reorder_total_cost: number | null
          risk_level: string | null
          risk_reason: string | null
          week_number: number
        }
        Insert: {
          actions?: Json | null
          business_id: string
          closing_cash_position?: number | null
          created_at?: string
          forecast_week: string
          id?: string
          opening_cash_position?: number | null
          predicted_bas_gst?: number | null
          predicted_other_fixed?: number | null
          predicted_payroll?: number | null
          predicted_pos_revenue?: number | null
          predicted_rent_utilities?: number | null
          predicted_supplier_payments?: number | null
          reorder_events?: Json | null
          reorder_total_cost?: number | null
          risk_level?: string | null
          risk_reason?: string | null
          week_number: number
        }
        Update: {
          actions?: Json | null
          business_id?: string
          closing_cash_position?: number | null
          created_at?: string
          forecast_week?: string
          id?: string
          opening_cash_position?: number | null
          predicted_bas_gst?: number | null
          predicted_other_fixed?: number | null
          predicted_payroll?: number | null
          predicted_pos_revenue?: number | null
          predicted_rent_utilities?: number | null
          predicted_supplier_payments?: number | null
          reorder_events?: Json | null
          reorder_total_cost?: number | null
          risk_level?: string | null
          risk_reason?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_forecasts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      clv_portfolio_summary: {
        Row: {
          at_risk_annual_revenue: number | null
          at_risk_count: number | null
          avg_clv_champion: number | null
          avg_clv_loyal: number | null
          avg_clv_potential: number | null
          business_id: string
          champion_count: number | null
          dormant_count: number | null
          if_rising_stars_add_1_visit: number | null
          interventions_responded: number | null
          interventions_sent: number | null
          lost_count: number | null
          loyal_count: number | null
          potential_count: number | null
          response_rate_pct: number | null
          revenue_attributed_to_interventions: number | null
          scored_at: string | null
          top_20_pct_revenue_share: number | null
          total_customer_count: number | null
          total_predicted_annual_revenue: number | null
        }
        Insert: {
          at_risk_annual_revenue?: number | null
          at_risk_count?: number | null
          avg_clv_champion?: number | null
          avg_clv_loyal?: number | null
          avg_clv_potential?: number | null
          business_id: string
          champion_count?: number | null
          dormant_count?: number | null
          if_rising_stars_add_1_visit?: number | null
          interventions_responded?: number | null
          interventions_sent?: number | null
          lost_count?: number | null
          loyal_count?: number | null
          potential_count?: number | null
          response_rate_pct?: number | null
          revenue_attributed_to_interventions?: number | null
          scored_at?: string | null
          top_20_pct_revenue_share?: number | null
          total_customer_count?: number | null
          total_predicted_annual_revenue?: number | null
        }
        Update: {
          at_risk_annual_revenue?: number | null
          at_risk_count?: number | null
          avg_clv_champion?: number | null
          avg_clv_loyal?: number | null
          avg_clv_potential?: number | null
          business_id?: string
          champion_count?: number | null
          dormant_count?: number | null
          if_rising_stars_add_1_visit?: number | null
          interventions_responded?: number | null
          interventions_sent?: number | null
          lost_count?: number | null
          loyal_count?: number | null
          potential_count?: number | null
          response_rate_pct?: number | null
          revenue_attributed_to_interventions?: number | null
          scored_at?: string | null
          top_20_pct_revenue_share?: number | null
          total_customer_count?: number | null
          total_predicted_annual_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clv_portfolio_summary_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocked_visitors: {
        Row: {
          blocked_at: string | null
          business_id: string | null
          id: string
          reason: string | null
          session_token: string
        }
        Insert: {
          blocked_at?: string | null
          business_id?: string | null
          id?: string
          reason?: string | null
          session_token: string
        }
        Update: {
          blocked_at?: string | null
          business_id?: string | null
          id?: string
          reason?: string | null
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocked_visitors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_business_follows: {
        Row: {
          followed_at: string | null
          follower_business_id: string | null
          following_business_id: string | null
          id: string
        }
        Insert: {
          followed_at?: string | null
          follower_business_id?: string | null
          following_business_id?: string | null
          id?: string
        }
        Update: {
          followed_at?: string | null
          follower_business_id?: string | null
          following_business_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_business_follows_follower_business_id_fkey"
            columns: ["follower_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_business_follows_following_business_id_fkey"
            columns: ["following_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_consent_log: {
        Row: {
          action: string
          business_id: string | null
          consent_marketing: boolean | null
          created_at: string | null
          id: string
          ip_hash: string | null
          member_id: string | null
          notifications_on: boolean | null
          user_agent: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          consent_marketing?: boolean | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          member_id?: string | null
          notifications_on?: boolean | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          consent_marketing?: boolean | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          member_id?: string | null
          notifications_on?: boolean | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_consent_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_consent_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_follows: {
        Row: {
          business_id: string | null
          consent_marketing: boolean | null
          followed_at: string | null
          id: string
          is_hidden: boolean | null
          member_id: string | null
          notifications_on: boolean | null
          unfollowed_at: string | null
        }
        Insert: {
          business_id?: string | null
          consent_marketing?: boolean | null
          followed_at?: string | null
          id?: string
          is_hidden?: boolean | null
          member_id?: string | null
          notifications_on?: boolean | null
          unfollowed_at?: string | null
        }
        Update: {
          business_id?: string | null
          consent_marketing?: boolean | null
          followed_at?: string | null
          id?: string
          is_hidden?: boolean | null
          member_id?: string | null
          notifications_on?: boolean | null
          unfollowed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_follows_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_follows_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_live_chat: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          message: string
          sender_avatar: string | null
          sender_name: string
          stream_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          sender_avatar?: string | null
          sender_name: string
          stream_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          sender_avatar?: string | null
          sender_name?: string
          stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_live_chat_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_live_chat_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "community_live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      community_live_streams: {
        Row: {
          business_id: string | null
          cf_playback_hls: string
          cf_stream_uid: string
          cf_whip_url: string
          community_post_id: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          peak_viewers: number | null
          started_at: string | null
          status: string | null
          title: string | null
          viewer_count: number | null
        }
        Insert: {
          business_id?: string | null
          cf_playback_hls: string
          cf_stream_uid: string
          cf_whip_url: string
          community_post_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          peak_viewers?: number | null
          started_at?: string | null
          status?: string | null
          title?: string | null
          viewer_count?: number | null
        }
        Update: {
          business_id?: string | null
          cf_playback_hls?: string
          cf_stream_uid?: string
          cf_whip_url?: string
          community_post_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          peak_viewers?: number | null
          started_at?: string | null
          status?: string | null
          title?: string | null
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_live_streams_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_live_streams_community_post_id_fkey"
            columns: ["community_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          id: string
          joined_at: string | null
          nickname: string | null
          push_enabled: boolean | null
          push_token: string | null
          session_token: string
          user_id: string | null
        }
        Insert: {
          id?: string
          joined_at?: string | null
          nickname?: string | null
          push_enabled?: boolean | null
          push_token?: string | null
          session_token: string
          user_id?: string | null
        }
        Update: {
          id?: string
          joined_at?: string | null
          nickname?: string | null
          push_enabled?: boolean | null
          push_token?: string | null
          session_token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      community_message_log: {
        Row: {
          business_id: string | null
          created_at: string | null
          flagged: boolean | null
          id: string
          session_token: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          flagged?: boolean | null
          id?: string
          session_token: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          flagged?: boolean | null
          id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_message_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_message_reports: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          message_id: string
          reason: string | null
          reported_by_session_token: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          message_id: string
          reason?: string | null
          reported_by_session_token?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          message_id?: string
          reason?: string | null
          reported_by_session_token?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_message_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_engagement: {
        Row: {
          comment_text: string | null
          created_at: string | null
          engagement_type: string
          id: string
          member_id: string | null
          post_id: string | null
        }
        Insert: {
          comment_text?: string | null
          created_at?: string | null
          engagement_type: string
          id?: string
          member_id?: string | null
          post_id?: string | null
        }
        Update: {
          comment_text?: string | null
          created_at?: string | null
          engagement_type?: string
          id?: string
          member_id?: string | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_post_engagement_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_engagement_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          ai_generated: boolean | null
          body: string | null
          business_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_story: boolean | null
          media_type: string | null
          media_urls: Json | null
          post_type: string
          published_at: string | null
          scheduled_for: string | null
          status: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          body?: string | null
          business_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_story?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          post_type?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          body?: string | null
          business_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_story?: boolean | null
          media_type?: string | null
          media_urls?: Json | null
          post_type?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      community_push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          last_seen_at: string | null
          member_id: string | null
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          last_seen_at?: string | null
          member_id?: string | null
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          last_seen_at?: string | null
          member_id?: string | null
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_text: string | null
          alert_type: string | null
          business_id: string | null
          competitor_name: string | null
          created_at: string | null
          detected_at: string | null
          id: string
          read: boolean | null
          severity: string | null
          source_url: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          alert_text?: string | null
          alert_type?: string | null
          business_id?: string | null
          competitor_name?: string | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          read?: boolean | null
          severity?: string | null
          source_url?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          alert_text?: string | null
          alert_type?: string | null
          business_id?: string | null
          competitor_name?: string | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          read?: boolean | null
          severity?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_alerts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_businesses: {
        Row: {
          business_id: string | null
          category: string | null
          competitor_address: string | null
          competitor_name: string
          competitor_place_id: string | null
          distance_m: number | null
          google_rating: number | null
          id: string
          last_checked: string | null
          name: string | null
          phone: string | null
          website: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          competitor_address?: string | null
          competitor_name: string
          competitor_place_id?: string | null
          distance_m?: number | null
          google_rating?: number | null
          id?: string
          last_checked?: string | null
          name?: string | null
          phone?: string | null
          website?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          competitor_address?: string | null
          competitor_name?: string
          competitor_place_id?: string | null
          distance_m?: number | null
          google_rating?: number | null
          id?: string
          last_checked?: string | null
          name?: string | null
          phone?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_businesses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_price_cache: {
        Row: {
          business_id: string | null
          competitor_address: string | null
          competitor_distance_m: number | null
          competitor_name: string
          competitor_price_cents: number | null
          confidence: string | null
          expires_at: string | null
          found_url: string | null
          id: string
          product_name: string
          searched_at: string | null
          source: string | null
        }
        Insert: {
          business_id?: string | null
          competitor_address?: string | null
          competitor_distance_m?: number | null
          competitor_name: string
          competitor_price_cents?: number | null
          confidence?: string | null
          expires_at?: string | null
          found_url?: string | null
          id?: string
          product_name: string
          searched_at?: string | null
          source?: string | null
        }
        Update: {
          business_id?: string | null
          competitor_address?: string | null
          competitor_distance_m?: number | null
          competitor_name?: string
          competitor_price_cents?: number | null
          confidence?: string | null
          expires_at?: string | null
          found_url?: string | null
          id?: string
          product_name?: string
          searched_at?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_price_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_snapshots: {
        Row: {
          business_id: string | null
          competitor_name: string | null
          competitor_watch_id: string | null
          created_at: string | null
          id: string
          price_index: number | null
          rating: number | null
          raw_data: Json | null
          review_count: number | null
          snapshot_date: string | null
        }
        Insert: {
          business_id?: string | null
          competitor_name?: string | null
          competitor_watch_id?: string | null
          created_at?: string | null
          id?: string
          price_index?: number | null
          rating?: number | null
          raw_data?: Json | null
          review_count?: number | null
          snapshot_date?: string | null
        }
        Update: {
          business_id?: string | null
          competitor_name?: string | null
          competitor_watch_id?: string | null
          created_at?: string | null
          id?: string
          price_index?: number | null
          rating?: number | null
          raw_data?: Json | null
          review_count?: number | null
          snapshot_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_snapshots_competitor_watch_id_fkey"
            columns: ["competitor_watch_id"]
            isOneToOne: false
            referencedRelation: "aria_competitor_watches"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_acceptances: {
        Row: {
          acceptance_type: string
          accepted_at: string | null
          business_id: string | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          acceptance_type: string
          accepted_at?: string | null
          business_id?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          acceptance_type?: string
          accepted_at?: string | null
          business_id?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_acceptances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          business_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          document_url: string | null
          due_date: string | null
          evidence_note: string | null
          evidence_url: string | null
          expiry_date: string | null
          id: string
          industry: string
          is_completed: boolean | null
          priority: string | null
          reminder_enabled: boolean | null
          status: string | null
          title: string
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          document_url?: string | null
          due_date?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          industry: string
          is_completed?: boolean | null
          priority?: string | null
          reminder_enabled?: boolean | null
          status?: string | null
          title: string
        }
        Update: {
          business_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          document_url?: string | null
          due_date?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          industry?: string
          is_completed?: boolean | null
          priority?: string | null
          reminder_enabled?: boolean | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          aimodel: string | null
          branch_point: number | null
          created_at: string | null
          id: string
          messages: Json | null
          parent_conversation_id: string | null
          share_token: string | null
          title: string | null
          tone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aimodel?: string | null
          branch_point?: number | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          parent_conversation_id?: string | null
          share_token?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aimodel?: string | null
          branch_point?: number | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          parent_conversation_id?: string | null
          share_token?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      council_cache: {
        Row: {
          business_id: string
          created_at: string
          expires_at: string
          id: string
          intent_hash: string
          result: Json
        }
        Insert: {
          business_id: string
          created_at?: string
          expires_at: string
          id?: string
          intent_hash: string
          result: Json
        }
        Update: {
          business_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          intent_hash?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "council_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      council_runs: {
        Row: {
          brains_failed: number | null
          brains_succeeded: number | null
          business_id: string
          confidence_map: Json | null
          consensus: Json | null
          contested: Json | null
          context_brain_output: Json | null
          created_at: string
          duration_ms: number | null
          fell_back_to_single_model: boolean | null
          final_briefing: string | null
          id: string
          mode: string
          raw_brain_outputs: Json | null
          synthesis_succeeded: boolean | null
          total_input_tokens: number | null
          total_output_tokens: number | null
        }
        Insert: {
          brains_failed?: number | null
          brains_succeeded?: number | null
          business_id: string
          confidence_map?: Json | null
          consensus?: Json | null
          contested?: Json | null
          context_brain_output?: Json | null
          created_at?: string
          duration_ms?: number | null
          fell_back_to_single_model?: boolean | null
          final_briefing?: string | null
          id?: string
          mode: string
          raw_brain_outputs?: Json | null
          synthesis_succeeded?: boolean | null
          total_input_tokens?: number | null
          total_output_tokens?: number | null
        }
        Update: {
          brains_failed?: number | null
          brains_succeeded?: number | null
          business_id?: string
          confidence_map?: Json | null
          consensus?: Json | null
          contested?: Json | null
          context_brain_output?: Json | null
          created_at?: string
          duration_ms?: number | null
          fell_back_to_single_model?: boolean | null
          final_briefing?: string | null
          id?: string
          mode?: string
          raw_brain_outputs?: Json | null
          synthesis_succeeded?: boolean | null
          total_input_tokens?: number | null
          total_output_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "council_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_logs: {
        Row: {
          businesses_processed: number | null
          errors: Json | null
          finished_at: string | null
          id: string
          job_name: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          businesses_processed?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          job_name: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          businesses_processed?: number | null
          errors?: Json | null
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          completed_at: string | null
          cron_name: string
          duration_ms: number | null
          error: string | null
          id: string
          metadata: Json | null
          rows_affected: number | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          cron_name: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          rows_affected?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          cron_name?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          rows_affected?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      customer_activity: {
        Row: {
          amount_cents: number | null
          business_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          type: string
        }
        Insert: {
          amount_cents?: number | null
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          type: string
        }
        Update: {
          amount_cents?: number | null
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activity_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_clv_scores: {
        Row: {
          avg_basket_size: number | null
          business_id: string
          clv_tier: string | null
          customer_id: string
          days_since_last_visit: number | null
          id: string
          intervention_priority: string | null
          intervention_rationale: string | null
          intervention_responded: boolean | null
          intervention_sent_at: string | null
          months_as_customer: number | null
          predicted_3yr_clv: number | null
          predicted_annual_revenue: number | null
          predicted_monthly_revenue: number | null
          price_sensitivity_score: number | null
          product_diversity_score: number | null
          recommended_message: string | null
          recommended_offer_type: string | null
          recommended_offer_value: number | null
          revenue_in_30d_after: number | null
          scored_at: string | null
          seasonal_consistency_score: number | null
          spend_trend: string | null
          visit_count_in_30d_after: number | null
          visit_frequency_per_month: number | null
          visit_trend: string | null
        }
        Insert: {
          avg_basket_size?: number | null
          business_id: string
          clv_tier?: string | null
          customer_id: string
          days_since_last_visit?: number | null
          id?: string
          intervention_priority?: string | null
          intervention_rationale?: string | null
          intervention_responded?: boolean | null
          intervention_sent_at?: string | null
          months_as_customer?: number | null
          predicted_3yr_clv?: number | null
          predicted_annual_revenue?: number | null
          predicted_monthly_revenue?: number | null
          price_sensitivity_score?: number | null
          product_diversity_score?: number | null
          recommended_message?: string | null
          recommended_offer_type?: string | null
          recommended_offer_value?: number | null
          revenue_in_30d_after?: number | null
          scored_at?: string | null
          seasonal_consistency_score?: number | null
          spend_trend?: string | null
          visit_count_in_30d_after?: number | null
          visit_frequency_per_month?: number | null
          visit_trend?: string | null
        }
        Update: {
          avg_basket_size?: number | null
          business_id?: string
          clv_tier?: string | null
          customer_id?: string
          days_since_last_visit?: number | null
          id?: string
          intervention_priority?: string | null
          intervention_rationale?: string | null
          intervention_responded?: boolean | null
          intervention_sent_at?: string | null
          months_as_customer?: number | null
          predicted_3yr_clv?: number | null
          predicted_annual_revenue?: number | null
          predicted_monthly_revenue?: number | null
          price_sensitivity_score?: number | null
          product_diversity_score?: number | null
          recommended_message?: string | null
          recommended_offer_type?: string | null
          recommended_offer_value?: number | null
          revenue_in_30d_after?: number | null
          scored_at?: string | null
          seasonal_consistency_score?: number | null
          spend_trend?: string | null
          visit_count_in_30d_after?: number | null
          visit_frequency_per_month?: number | null
          visit_trend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_clv_scores_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_clv_scores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_hub_clicks: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          referrer: string | null
          target: string | null
          user_agent: string | null
          visitor_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          referrer?: string | null
          target?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          referrer?: string | null
          target?: string | null
          user_agent?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_hub_clicks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_import_jobs: {
        Row: {
          business_id: string
          column_mapping: Json | null
          created_at: string
          error_detail: string | null
          file_name: string | null
          id: string
          raw_headers: Json | null
          rows_imported: number | null
          rows_skipped: number | null
          rows_total: number | null
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          column_mapping?: Json | null
          created_at?: string
          error_detail?: string | null
          file_name?: string | null
          id?: string
          raw_headers?: Json | null
          rows_imported?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          column_mapping?: Json | null
          created_at?: string
          error_detail?: string | null
          file_name?: string | null
          id?: string
          raw_headers?: Json | null
          rows_imported?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_import_jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_winback_campaigns: {
        Row: {
          business_id: string
          channel: string
          completed_at: string | null
          created_at: string | null
          id: string
          message_template: string
          name: string
          offer_type: string | null
          offer_value_cents: number | null
          redeemed_count: number | null
          revenue_recovered_cents: number | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string
          target_segment: string
        }
        Insert: {
          business_id: string
          channel?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          message_template: string
          name: string
          offer_type?: string | null
          offer_value_cents?: number | null
          redeemed_count?: number | null
          revenue_recovered_cents?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          target_segment: string
        }
        Update: {
          business_id?: string
          channel?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          message_template?: string
          name?: string
          offer_type?: string | null
          offer_value_cents?: number | null
          redeemed_count?: number | null
          revenue_recovered_cents?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          target_segment?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_winback_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_winback_recipients: {
        Row: {
          campaign_id: string
          contacted_at: string | null
          customer_id: string
          id: string
          revenue_cents: number | null
          visit_id: string | null
          visited_after: boolean | null
        }
        Insert: {
          campaign_id: string
          contacted_at?: string | null
          customer_id: string
          id?: string
          revenue_cents?: number | null
          visit_id?: string | null
          visited_after?: boolean | null
        }
        Update: {
          campaign_id?: string
          contacted_at?: string | null
          customer_id?: string
          id?: string
          revenue_cents?: number | null
          visit_id?: string | null
          visited_after?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_winback_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "customer_winback_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_winback_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          abn: string | null
          address: string | null
          ai_summary: string | null
          ai_summary_at: string | null
          archived: boolean | null
          billing_address: string | null
          business_id: string | null
          business_name: string | null
          churn_risk: string | null
          city: string | null
          company: string | null
          created_at: string | null
          customer_segment: string | null
          customer_type: string | null
          email: string | null
          id: string
          last_visit: string | null
          name: string
          notes: string | null
          payment_terms_default: string | null
          phone: string | null
          postcode: string | null
          predicted_next_visit: string | null
          rfm_score: string | null
          rfm_score_numeric: number | null
          shipping_address: string | null
          source: string | null
          tags: string[] | null
          total_spend: number | null
          total_spent: number | null
          updated_at: string | null
          visit_count: number | null
          wholesale_discount_pct: number | null
          wholesale_tier: number | null
        }
        Insert: {
          abn?: string | null
          address?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          archived?: boolean | null
          billing_address?: string | null
          business_id?: string | null
          business_name?: string | null
          churn_risk?: string | null
          city?: string | null
          company?: string | null
          created_at?: string | null
          customer_segment?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          last_visit?: string | null
          name: string
          notes?: string | null
          payment_terms_default?: string | null
          phone?: string | null
          postcode?: string | null
          predicted_next_visit?: string | null
          rfm_score?: string | null
          rfm_score_numeric?: number | null
          shipping_address?: string | null
          source?: string | null
          tags?: string[] | null
          total_spend?: number | null
          total_spent?: number | null
          updated_at?: string | null
          visit_count?: number | null
          wholesale_discount_pct?: number | null
          wholesale_tier?: number | null
        }
        Update: {
          abn?: string | null
          address?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          archived?: boolean | null
          billing_address?: string | null
          business_id?: string | null
          business_name?: string | null
          churn_risk?: string | null
          city?: string | null
          company?: string | null
          created_at?: string | null
          customer_segment?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          notes?: string | null
          payment_terms_default?: string | null
          phone?: string | null
          postcode?: string | null
          predicted_next_visit?: string | null
          rfm_score?: string | null
          rfm_score_numeric?: number | null
          shipping_address?: string | null
          source?: string | null
          tags?: string[] | null
          total_spend?: number | null
          total_spent?: number | null
          updated_at?: string | null
          visit_count?: number | null
          wholesale_discount_pct?: number | null
          wholesale_tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefings: {
        Row: {
          business_id: string | null
          content: string | null
          data_snapshot: Json | null
          date: string
          dismissed_at: string | null
          generated_at: string | null
          id: string
          mode: string | null
          recommendations: Json
          remind_at: string | null
        }
        Insert: {
          business_id?: string | null
          content?: string | null
          data_snapshot?: Json | null
          date?: string
          dismissed_at?: string | null
          generated_at?: string | null
          id?: string
          mode?: string | null
          recommendations?: Json
          remind_at?: string | null
        }
        Update: {
          business_id?: string | null
          content?: string | null
          data_snapshot?: Json | null
          date?: string
          dismissed_at?: string | null
          generated_at?: string | null
          id?: string
          mode?: string | null
          recommendations?: Json
          remind_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reconciliations: {
        Row: {
          bank_data_source: string | null
          bank_deposits_total: number | null
          business_id: string
          created_at: string | null
          expected_settlement_date: string | null
          id: string
          notes: string | null
          pos_card_total: number | null
          pos_cash_total: number | null
          pos_other_total: number | null
          pos_sales_total: number | null
          recon_date: string
          status: string | null
          variance_amount: number | null
          variance_pct: number | null
        }
        Insert: {
          bank_data_source?: string | null
          bank_deposits_total?: number | null
          business_id: string
          created_at?: string | null
          expected_settlement_date?: string | null
          id?: string
          notes?: string | null
          pos_card_total?: number | null
          pos_cash_total?: number | null
          pos_other_total?: number | null
          pos_sales_total?: number | null
          recon_date: string
          status?: string | null
          variance_amount?: number | null
          variance_pct?: number | null
        }
        Update: {
          bank_data_source?: string | null
          bank_deposits_total?: number | null
          business_id?: string
          created_at?: string | null
          expected_settlement_date?: string | null
          id?: string
          notes?: string | null
          pos_card_total?: number | null
          pos_cash_total?: number | null
          pos_other_total?: number | null
          pos_sales_total?: number | null
          recon_date?: string
          status?: string | null
          variance_amount?: number | null
          variance_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reconciliations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_share_links: {
        Row: {
          access_count: number | null
          business_id: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          label: string
          last_accessed_at: string | null
          pages_allowed: Json
          recipient_email: string | null
          recipient_name: string | null
          token: string
        }
        Insert: {
          access_count?: number | null
          business_id: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          last_accessed_at?: string | null
          pages_allowed?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          token?: string
        }
        Update: {
          access_count?: number | null
          business_id?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          last_accessed_at?: string | null
          pages_allowed?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_share_links_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_audit_log: {
        Row: {
          action: string
          business_id: string | null
          id: string
          old_data: Json | null
          performed_at: string
          performed_by: string | null
          reason: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          business_id?: string | null
          id?: string
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          business_id?: string | null
          id?: string
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          business_id: string
          carrier: string
          carrier_status: string | null
          carrier_status_detail: string | null
          created_at: string | null
          delivered_at: string | null
          estimated_delivery: string | null
          id: string
          last_synced_at: string | null
          notes: string | null
          order_reference: string | null
          recipient_address: string | null
          recipient_name: string
          recipient_phone: string | null
          service_name: string | null
          status: string
          tracking_events: Json | null
          tracking_number: string
          trackingmore_id: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          carrier: string
          carrier_status?: string | null
          carrier_status_detail?: string | null
          created_at?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          last_synced_at?: string | null
          notes?: string | null
          order_reference?: string | null
          recipient_address?: string | null
          recipient_name: string
          recipient_phone?: string | null
          service_name?: string | null
          status?: string
          tracking_events?: Json | null
          tracking_number: string
          trackingmore_id?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          carrier?: string
          carrier_status?: string | null
          carrier_status_detail?: string | null
          created_at?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          last_synced_at?: string | null
          notes?: string | null
          order_reference?: string | null
          recipient_address?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          service_name?: string | null
          status?: string
          tracking_events?: Json | null
          tracking_number?: string
          trackingmore_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          brand_color: string | null
          business_id: string | null
          created_at: string | null
          created_by: string | null
          html_template: string
          id: string
          is_default: boolean | null
          is_global: boolean | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          brand_color?: string | null
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          html_template: string
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          brand_color?: string | null
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          html_template?: string
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          business_id: string
          email_type: string | null
          id: string
          recipient: string
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          business_id: string
          email_type?: string | null
          id?: string
          recipient: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          business_id?: string
          email_type?: string | null
          id?: string
          recipient?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_key_versions: {
        Row: {
          activated_at: string | null
          id: string
          notes: string | null
          version: number
        }
        Insert: {
          activated_at?: string | null
          id?: string
          notes?: string | null
          version: number
        }
        Update: {
          activated_at?: string | null
          id?: string
          notes?: string | null
          version?: number
        }
        Relationships: []
      }
      expense_anomalies: {
        Row: {
          amount: number | null
          business_id: string
          created_at: string | null
          deviation_pct: number | null
          expected_range_high: number | null
          expected_range_low: number | null
          expense_category: string | null
          expense_description: string | null
          id: string
          possible_causes: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          business_id: string
          created_at?: string | null
          deviation_pct?: number | null
          expected_range_high?: number | null
          expected_range_low?: number | null
          expense_category?: string | null
          expense_description?: string | null
          id?: string
          possible_causes?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          business_id?: string
          created_at?: string | null
          deviation_pct?: number | null
          expected_range_high?: number | null
          expected_range_low?: number | null
          expense_category?: string | null
          expense_description?: string | null
          id?: string
          possible_causes?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_anomalies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      external_data_cache: {
        Row: {
          cache_key: string
          cached_at: string | null
          data: Json
          expires_at: string
          id: string
          source: string
        }
        Insert: {
          cache_key: string
          cached_at?: string | null
          data: Json
          expires_at: string
          id?: string
          source: string
        }
        Update: {
          cache_key?: string
          cached_at?: string | null
          data?: Json
          expires_at?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          disabled_for_business_ids: string[] | null
          enabled_for_business_ids: string[] | null
          enabled_for_plans: string[] | null
          flag_key: string
          id: string
          is_globally_enabled: boolean | null
          label: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          disabled_for_business_ids?: string[] | null
          enabled_for_business_ids?: string[] | null
          enabled_for_plans?: string[] | null
          flag_key: string
          id?: string
          is_globally_enabled?: boolean | null
          label: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          disabled_for_business_ids?: string[] | null
          enabled_for_business_ids?: string[] | null
          enabled_for_plans?: string[] | null
          flag_key?: string
          id?: string
          is_globally_enabled?: boolean | null
          label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_roadmap: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          status: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      financing_opportunities: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          effort_level: string | null
          expires_at: string | null
          id: string
          opportunity_type: string | null
          potential_benefit: number | null
          status: string
          trigger_week: string | null
          urgency: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          effort_level?: string | null
          expires_at?: string | null
          id?: string
          opportunity_type?: string | null
          potential_benefit?: number | null
          status?: string
          trigger_week?: string | null
          urgency?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          effort_level?: string | null
          expires_at?: string | null
          id?: string
          opportunity_type?: string | null
          potential_benefit?: number | null
          status?: string
          trigger_week?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financing_opportunities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_interventions: {
        Row: {
          agent_decision_id: string | null
          business_id: string
          cancelled_at: string | null
          channel: string
          discount_pct: number | null
          executed_at: string | null
          expired_at: string | null
          expires_at: string | null
          id: string
          intervention_data: Json
          intervention_type: string
          message_text: string | null
          product_ids: string[] | null
          revenue_in_2h_after: number | null
          revenue_in_2h_before: number | null
          revenue_lift_pct: number | null
          target_count: number | null
          target_segment: string | null
          transactions_in_2h_after: number | null
          trigger_data: Json
          triggered_by: string
        }
        Insert: {
          agent_decision_id?: string | null
          business_id: string
          cancelled_at?: string | null
          channel: string
          discount_pct?: number | null
          executed_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          intervention_data?: Json
          intervention_type: string
          message_text?: string | null
          product_ids?: string[] | null
          revenue_in_2h_after?: number | null
          revenue_in_2h_before?: number | null
          revenue_lift_pct?: number | null
          target_count?: number | null
          target_segment?: string | null
          transactions_in_2h_after?: number | null
          trigger_data?: Json
          triggered_by: string
        }
        Update: {
          agent_decision_id?: string | null
          business_id?: string
          cancelled_at?: string | null
          channel?: string
          discount_pct?: number | null
          executed_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          intervention_data?: Json
          intervention_type?: string
          message_text?: string | null
          product_ids?: string[] | null
          revenue_in_2h_after?: number | null
          revenue_in_2h_before?: number | null
          revenue_lift_pct?: number | null
          target_count?: number | null
          target_segment?: string | null
          transactions_in_2h_after?: number | null
          trigger_data?: Json
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_interventions_agent_decision_id_fkey"
            columns: ["agent_decision_id"]
            isOneToOne: false
            referencedRelation: "agent_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flash_interventions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_settings: {
        Row: {
          allow_partial_redeem: boolean | null
          allow_topup: boolean | null
          brand_color: string | null
          business_id: string
          enabled: boolean | null
          expiry_months: number | null
          max_balance: number | null
          max_load: number | null
          min_load: number | null
          prefix: string | null
          terms_text: string | null
          updated_at: string | null
        }
        Insert: {
          allow_partial_redeem?: boolean | null
          allow_topup?: boolean | null
          brand_color?: string | null
          business_id: string
          enabled?: boolean | null
          expiry_months?: number | null
          max_balance?: number | null
          max_load?: number | null
          min_load?: number | null
          prefix?: string | null
          terms_text?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_partial_redeem?: boolean | null
          allow_topup?: boolean | null
          brand_color?: string | null
          business_id?: string
          enabled?: boolean | null
          expiry_months?: number | null
          max_balance?: number | null
          max_load?: number | null
          min_load?: number | null
          prefix?: string | null
          terms_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          amount: number
          balance_after: number
          business_id: string
          created_at: string | null
          gift_card_id: string
          id: string
          note: string | null
          sale_id: string | null
          staff_name: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          business_id: string
          created_at?: string | null
          gift_card_id: string
          id?: string
          note?: string | null
          sale_id?: string | null
          staff_name?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          business_id?: string
          created_at?: string | null
          gift_card_id?: string
          id?: string
          note?: string | null
          sale_id?: string | null
          staff_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "pos_gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      global_products: {
        Row: {
          barcode: string
          brand: string | null
          category: string | null
          country_of_sale: string | null
          created_at: string | null
          id: string
          image_url: string | null
          ingredients_text: string | null
          is_age_restricted: boolean | null
          last_verified_at: string | null
          name: string
          size: string | null
          source: string | null
          suggested_price_cents: number | null
          unit: string | null
        }
        Insert: {
          barcode: string
          brand?: string | null
          category?: string | null
          country_of_sale?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          is_age_restricted?: boolean | null
          last_verified_at?: string | null
          name: string
          size?: string | null
          source?: string | null
          suggested_price_cents?: number | null
          unit?: string | null
        }
        Update: {
          barcode?: string
          brand?: string | null
          category?: string | null
          country_of_sale?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          is_age_restricted?: boolean | null
          last_verified_at?: string | null
          name?: string
          size?: string | null
          source?: string | null
          suggested_price_cents?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          ai_draft_at: string | null
          ai_drafted_reply: string | null
          ai_summary: string | null
          aria_confidence: number | null
          business_id: string
          comment: string | null
          connection_id: string | null
          created_at: string | null
          flagged_for_response: boolean | null
          flagged_reason: string | null
          has_reply: boolean | null
          id: string
          keyword_tags: string[] | null
          language: string | null
          platform: string | null
          rating: number
          reply_date: string | null
          reply_published_at: string | null
          reply_source: string | null
          reply_text: string | null
          response_priority: string | null
          review_date: string
          review_id: string
          review_url: string | null
          reviewer_avatar: string | null
          reviewer_name: string | null
          sentiment: string | null
          sentiment_score: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          ai_draft_at?: string | null
          ai_drafted_reply?: string | null
          ai_summary?: string | null
          aria_confidence?: number | null
          business_id: string
          comment?: string | null
          connection_id?: string | null
          created_at?: string | null
          flagged_for_response?: boolean | null
          flagged_reason?: string | null
          has_reply?: boolean | null
          id?: string
          keyword_tags?: string[] | null
          language?: string | null
          platform?: string | null
          rating: number
          reply_date?: string | null
          reply_published_at?: string | null
          reply_source?: string | null
          reply_text?: string | null
          response_priority?: string | null
          review_date: string
          review_id: string
          review_url?: string | null
          reviewer_avatar?: string | null
          reviewer_name?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_draft_at?: string | null
          ai_drafted_reply?: string | null
          ai_summary?: string | null
          aria_confidence?: number | null
          business_id?: string
          comment?: string | null
          connection_id?: string | null
          created_at?: string | null
          flagged_for_response?: boolean | null
          flagged_reason?: string | null
          has_reply?: boolean | null
          id?: string
          keyword_tags?: string[] | null
          language?: string | null
          platform?: string | null
          rating?: number
          reply_date?: string | null
          reply_published_at?: string | null
          reply_source?: string | null
          reply_text?: string | null
          response_priority?: string | null
          review_date?: string
          review_id?: string
          review_url?: string | null
          reviewer_avatar?: string | null
          reviewer_name?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_reviews_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      immigration_alerts: {
        Row: {
          affected_client_ids: string[] | null
          agent_id: string
          description: string | null
          detected_at: string | null
          id: string
          is_read: boolean | null
          severity: string | null
          source_url: string | null
          title: string
          visa_classes_affected: string[] | null
        }
        Insert: {
          affected_client_ids?: string[] | null
          agent_id: string
          description?: string | null
          detected_at?: string | null
          id?: string
          is_read?: boolean | null
          severity?: string | null
          source_url?: string | null
          title: string
          visa_classes_affected?: string[] | null
        }
        Update: {
          affected_client_ids?: string[] | null
          agent_id?: string
          description?: string | null
          detected_at?: string | null
          id?: string
          is_read?: boolean | null
          severity?: string | null
          source_url?: string | null
          title?: string
          visa_classes_affected?: string[] | null
        }
        Relationships: []
      }
      immigration_news: {
        Row: {
          created_at: string | null
          id: string
          published_at: string | null
          relevance_score: number | null
          source: string | null
          source_url: string | null
          summary: string | null
          title: string
          visa_classes_mentioned: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          published_at?: string | null
          relevance_score?: number | null
          source?: string | null
          source_url?: string | null
          summary?: string | null
          title: string
          visa_classes_mentioned?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          published_at?: string | null
          relevance_score?: number | null
          source?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string
          visa_classes_mentioned?: string[] | null
        }
        Relationships: []
      }
      imported_files: {
        Row: {
          business_id: string | null
          columns: Json | null
          created_at: string | null
          file_name: string | null
          id: string
          mapping: Json | null
          row_count: number | null
          rows: Json | null
          status: string | null
          upload_type: string
        }
        Insert: {
          business_id?: string | null
          columns?: Json | null
          created_at?: string | null
          file_name?: string | null
          id?: string
          mapping?: Json | null
          row_count?: number | null
          rows?: Json | null
          status?: string | null
          upload_type: string
        }
        Update: {
          business_id?: string | null
          columns?: Json | null
          created_at?: string | null
          file_name?: string | null
          id?: string
          mapping?: Json | null
          row_count?: number | null
          rows?: Json | null
          status?: string | null
          upload_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_files_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      instore_conversations: {
        Row: {
          business_id: string | null
          customer_id: string | null
          email_captured: string | null
          ended_at: string | null
          id: string
          messages: Json | null
          started_at: string | null
        }
        Insert: {
          business_id?: string | null
          customer_id?: string | null
          email_captured?: string | null
          ended_at?: string | null
          id?: string
          messages?: Json | null
          started_at?: string | null
        }
        Update: {
          business_id?: string | null
          customer_id?: string | null
          email_captured?: string | null
          ended_at?: string | null
          id?: string
          messages?: Json | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instore_conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instore_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      instore_demand_signals: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          in_stock: boolean | null
          matched_product_id: string | null
          product_asked: string | null
          query_text: string | null
          signal_type: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          in_stock?: boolean | null
          matched_product_id?: string | null
          product_asked?: string | null
          query_text?: string | null
          signal_type?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          in_stock?: boolean | null
          matched_product_id?: string | null
          product_asked?: string | null
          query_text?: string | null
          signal_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instore_demand_signals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      instore_kiosk_configs: {
        Row: {
          business_id: string | null
          created_at: string | null
          enabled: boolean | null
          greeting: string | null
          id: string
          kiosk_name: string | null
          loyalty_enabled: boolean | null
          personality: string | null
          recipe_suggestions: boolean | null
          scan_and_go_enabled: boolean | null
          tablet_api_key: string | null
          voice_enabled: boolean | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          greeting?: string | null
          id?: string
          kiosk_name?: string | null
          loyalty_enabled?: boolean | null
          personality?: string | null
          recipe_suggestions?: boolean | null
          scan_and_go_enabled?: boolean | null
          tablet_api_key?: string | null
          voice_enabled?: boolean | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          greeting?: string | null
          id?: string
          kiosk_name?: string | null
          loyalty_enabled?: boolean | null
          personality?: string | null
          recipe_suggestions?: boolean | null
          scan_and_go_enabled?: boolean | null
          tablet_api_key?: string | null
          voice_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "instore_kiosk_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      instore_kiosk_tokens: {
        Row: {
          active: boolean | null
          business_id: string
          expires_at: string
          generated_at: string | null
          id: string
          token: string
        }
        Insert: {
          active?: boolean | null
          business_id: string
          expires_at: string
          generated_at?: string | null
          id?: string
          token: string
        }
        Update: {
          active?: boolean | null
          business_id?: string
          expires_at?: string
          generated_at?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "instore_kiosk_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_events: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          action_href: string | null
          action_label: string | null
          body: string
          business_id: string | null
          data: Json | null
          event_type: string
          id: string
          severity: string | null
          title: string
          triggered_at: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          action_href?: string | null
          action_label?: string | null
          body: string
          business_id?: string | null
          data?: Json | null
          event_type: string
          id?: string
          severity?: string | null
          title: string
          triggered_at?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          action_href?: string | null
          action_label?: string | null
          body?: string
          business_id?: string | null
          data?: Json | null
          event_type?: string
          id?: string
          severity?: string | null
          title?: string
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          business_id: string
          created_at: string
          description: string
          gst_applicable: boolean
          id: string
          invoice_id: string
          line_gst: number
          line_subtotal: number
          line_total: number
          position: number | null
          quantity: number
          service_id: string | null
          unit_price: number
        }
        Insert: {
          business_id: string
          created_at?: string
          description: string
          gst_applicable?: boolean
          id?: string
          invoice_id: string
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          position?: number | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string
          gst_applicable?: boolean
          id?: string
          invoice_id?: string
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          position?: number | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "billable_services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          invoice_id: string | null
          remind_at: string
          sent_at: string | null
          trigger_type: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          remind_at: string
          sent_at?: string | null
          trigger_type?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          remind_at?: string
          sent_at?: string | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          business_id: string
          default_due_days: number
          default_notes: string | null
          invoice_prefix: string
          next_invoice_seq: number
          payment_details: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          default_due_days?: number
          default_notes?: string | null
          invoice_prefix?: string
          next_invoice_seq?: number
          payment_details?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          default_due_days?: number
          default_notes?: string | null
          invoice_prefix?: string
          next_invoice_seq?: number
          payment_details?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          ai_generated: boolean | null
          auto_reminders: boolean | null
          bill_to_address: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          business_id: string
          created_at: string
          currency: string
          customer_id: string | null
          due_date: string | null
          gst_total: number
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          send_method: string | null
          sent_at: string | null
          signature_token: string | null
          signed_at: string | null
          signed_by_name: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          auto_reminders?: boolean | null
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          business_id: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          gst_total?: number
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          send_method?: string | null
          sent_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          auto_reminders?: boolean | null
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          business_id?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          gst_total?: number
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          send_method?: string | null
          sent_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_demand_forecast: {
        Row: {
          adjusted_predicted_revenue: number | null
          business_id: string
          created_at: string
          day_of_week: number | null
          event_adjustment_pct: number | null
          forecast_date: string
          hour_of_day: number
          id: string
          optimal_labour_cost: number | null
          predicted_revenue: number | null
          required_staff_count: number | null
          school_holiday_adjustment_pct: number | null
          weather_adjustment_pct: number | null
        }
        Insert: {
          adjusted_predicted_revenue?: number | null
          business_id: string
          created_at?: string
          day_of_week?: number | null
          event_adjustment_pct?: number | null
          forecast_date: string
          hour_of_day: number
          id?: string
          optimal_labour_cost?: number | null
          predicted_revenue?: number | null
          required_staff_count?: number | null
          school_holiday_adjustment_pct?: number | null
          weather_adjustment_pct?: number | null
        }
        Update: {
          adjusted_predicted_revenue?: number | null
          business_id?: string
          created_at?: string
          day_of_week?: number | null
          event_adjustment_pct?: number | null
          forecast_date?: string
          hour_of_day?: number
          id?: string
          optimal_labour_cost?: number | null
          predicted_revenue?: number | null
          required_staff_count?: number | null
          school_holiday_adjustment_pct?: number | null
          weather_adjustment_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_demand_forecast_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_optimisation_actions: {
        Row: {
          action_type: string
          business_id: string
          created_at: string | null
          id: string
          labour_cost_saving: number | null
          message_sent: string | null
          reasoning: string | null
          recipient_phone: string | null
          staff_member_id: string | null
          staff_response: string | null
          status: string | null
          target_date: string | null
          target_hour_end: number | null
          target_hour_start: number | null
        }
        Insert: {
          action_type: string
          business_id: string
          created_at?: string | null
          id?: string
          labour_cost_saving?: number | null
          message_sent?: string | null
          reasoning?: string | null
          recipient_phone?: string | null
          staff_member_id?: string | null
          staff_response?: string | null
          status?: string | null
          target_date?: string | null
          target_hour_end?: number | null
          target_hour_start?: number | null
        }
        Update: {
          action_type?: string
          business_id?: string
          created_at?: string | null
          id?: string
          labour_cost_saving?: number | null
          message_sent?: string | null
          reasoning?: string | null
          recipient_phone?: string | null
          staff_member_id?: string | null
          staff_response?: string | null
          status?: string | null
          target_date?: string | null
          target_hour_end?: number | null
          target_hour_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_optimisation_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      lightspeed_connections: {
        Row: {
          access_token: string
          account_id: string
          business_id: string | null
          connected_at: string | null
          domain_prefix: string | null
          id: string
          integration_type: string
          kounta_company_id: string | null
          last_synced_at: string | null
          refresh_token: string | null
          scope: string | null
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          account_id: string
          business_id?: string | null
          connected_at?: string | null
          domain_prefix?: string | null
          id?: string
          integration_type?: string
          kounta_company_id?: string | null
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          account_id?: string
          business_id?: string | null
          connected_at?: string | null
          domain_prefix?: string | null
          id?: string
          integration_type?: string
          kounta_company_id?: string | null
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lightspeed_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_fraud_flags: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_id: string | null
          details: Json | null
          flag_type: string | null
          id: string
          resolved: boolean | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          details?: Json | null
          flag_type?: string | null
          id?: string
          resolved?: boolean | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          details?: Json | null
          flag_type?: string | null
          id?: string
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_fraud_flags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_fraud_flags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_referrals: {
        Row: {
          business_id: string | null
          id: string
          referral_code: string | null
          referral_date: string | null
          referred_customer_id: string | null
          referred_points_awarded: number | null
          referrer_customer_id: string | null
          referrer_points_awarded: number | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          referral_code?: string | null
          referral_date?: string | null
          referred_customer_id?: string | null
          referred_points_awarded?: number | null
          referrer_customer_id?: string | null
          referrer_points_awarded?: number | null
        }
        Update: {
          business_id?: string | null
          id?: string
          referral_code?: string | null
          referral_date?: string | null
          referred_customer_id?: string | null
          referred_points_awarded?: number | null
          referrer_customer_id?: string | null
          referrer_points_awarded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_referrals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_referrals_referred_customer_id_fkey"
            columns: ["referred_customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_referrals_referrer_customer_id_fkey"
            columns: ["referrer_customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_reward_rules: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          points_value: number | null
          rule_type: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          points_value?: number | null
          rule_type?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          points_value?: number | null
          rule_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_reward_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          business_id: string | null
          color: string | null
          created_at: string | null
          id: string
          min_spend: number | null
          perks: string | null
          points_multiplier: number | null
          tier_name: string | null
          tier_order: number | null
        }
        Insert: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          min_spend?: number | null
          perks?: string | null
          points_multiplier?: number | null
          tier_name?: string | null
          tier_order?: number | null
        }
        Update: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          min_spend?: number | null
          perks?: string | null
          points_multiplier?: number | null
          tier_name?: string | null
          tier_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_price_scans: {
        Row: {
          business_id: string
          error_detail: string | null
          finished_at: string | null
          id: string
          overpriced_count: number | null
          potential_revenue_gain_cents: number | null
          prices_found: number | null
          products_scanned: number | null
          started_at: string | null
          status: string | null
          triggered_by: string | null
          underpriced_count: number | null
        }
        Insert: {
          business_id: string
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          overpriced_count?: number | null
          potential_revenue_gain_cents?: number | null
          prices_found?: number | null
          products_scanned?: number | null
          started_at?: string | null
          status?: string | null
          triggered_by?: string | null
          underpriced_count?: number | null
        }
        Update: {
          business_id?: string
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          overpriced_count?: number | null
          potential_revenue_gain_cents?: number | null
          prices_found?: number | null
          products_scanned?: number | null
          started_at?: string | null
          status?: string | null
          triggered_by?: string | null
          underpriced_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_price_scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_chats: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          listing_id: string | null
          member_id: string | null
          messages: Json | null
          unread_for_member: boolean | null
          unread_for_owner: boolean | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          member_id?: string | null
          messages?: Json | null
          unread_for_member?: boolean | null
          unread_for_owner?: boolean | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          member_id?: string | null
          messages?: Json | null
          unread_for_member?: boolean | null
          unread_for_owner?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chats_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_chats_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_chats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          business_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          media_urls: Json | null
          price: number | null
          product_id: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          media_urls?: Json | null
          price?: number | null
          product_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          media_urls?: Json | null
          price?: number | null
          product_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_engineering_actions: {
        Row: {
          action_type: string
          agent_run_id: string | null
          business_id: string
          executed_at: string | null
          id: string
          new_state: Json | null
          previous_state: Json | null
          product_id: string | null
          reasoning: string | null
          revenue_impact_actual: number | null
          reverted_at: string | null
        }
        Insert: {
          action_type: string
          agent_run_id?: string | null
          business_id: string
          executed_at?: string | null
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          product_id?: string | null
          reasoning?: string | null
          revenue_impact_actual?: number | null
          reverted_at?: string | null
        }
        Update: {
          action_type?: string
          agent_run_id?: string | null
          business_id?: string
          executed_at?: string | null
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          product_id?: string | null
          reasoning?: string | null
          revenue_impact_actual?: number | null
          reverted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_engineering_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_engineering_actions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      missed_demand: {
        Row: {
          approximate_price_point_cents: number | null
          aria_analysis: string | null
          aria_confidence: string | null
          business_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_note: string | null
          estimated_monthly_revenue_cents: number | null
          estimated_quantity_wanted: number | null
          first_requested_at: string | null
          global_product_id: string | null
          id: string
          last_requested_at: string | null
          logged_by: string | null
          product_barcode: string | null
          product_category: string | null
          product_name: string
          status: string | null
          times_requested: number | null
          updated_at: string | null
        }
        Insert: {
          approximate_price_point_cents?: number | null
          aria_analysis?: string | null
          aria_confidence?: string | null
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_note?: string | null
          estimated_monthly_revenue_cents?: number | null
          estimated_quantity_wanted?: number | null
          first_requested_at?: string | null
          global_product_id?: string | null
          id?: string
          last_requested_at?: string | null
          logged_by?: string | null
          product_barcode?: string | null
          product_category?: string | null
          product_name: string
          status?: string | null
          times_requested?: number | null
          updated_at?: string | null
        }
        Update: {
          approximate_price_point_cents?: number | null
          aria_analysis?: string | null
          aria_confidence?: string | null
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_note?: string | null
          estimated_monthly_revenue_cents?: number | null
          estimated_quantity_wanted?: number | null
          first_requested_at?: string | null
          global_product_id?: string | null
          id?: string
          last_requested_at?: string | null
          logged_by?: string | null
          product_barcode?: string | null
          product_category?: string | null
          product_name?: string
          status?: string | null
          times_requested?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_demand_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_demand_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_demand_global_product_id_fkey"
            columns: ["global_product_id"]
            isOneToOne: false
            referencedRelation: "global_products"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_inventory_sessions: {
        Row: {
          business_id: string | null
          completed_at: string | null
          id: string
          notes: string | null
          scanned_items: Json | null
          session_type: string | null
          started_at: string | null
          status: string | null
          submitted_by: string | null
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          scanned_items?: Json | null
          session_type?: string | null
          started_at?: string | null
          status?: string | null
          submitted_by?: string | null
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          scanned_items?: Json | null
          session_type?: string | null
          started_at?: string | null
          status?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_inventory_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_pl_reports: {
        Row: {
          business_id: string
          cogs_from_supplier_invoices: number | null
          ebitda: number | null
          generated_at: string | null
          gross_margin_pct: number | null
          gross_profit: number | null
          gross_revenue: number | null
          id: string
          labour_cost: number | null
          margin_vs_last_month_pct: number | null
          marketing_cost: number | null
          net_revenue: number | null
          other_expenses: number | null
          period_month: number
          period_year: number
          refunds_total: number | null
          rent_utilities: number | null
          revenue_vs_last_month_pct: number | null
          summary_narrative: string | null
          total_expenses: number | null
        }
        Insert: {
          business_id: string
          cogs_from_supplier_invoices?: number | null
          ebitda?: number | null
          generated_at?: string | null
          gross_margin_pct?: number | null
          gross_profit?: number | null
          gross_revenue?: number | null
          id?: string
          labour_cost?: number | null
          margin_vs_last_month_pct?: number | null
          marketing_cost?: number | null
          net_revenue?: number | null
          other_expenses?: number | null
          period_month: number
          period_year: number
          refunds_total?: number | null
          rent_utilities?: number | null
          revenue_vs_last_month_pct?: number | null
          summary_narrative?: string | null
          total_expenses?: number | null
        }
        Update: {
          business_id?: string
          cogs_from_supplier_invoices?: number | null
          ebitda?: number | null
          generated_at?: string | null
          gross_margin_pct?: number | null
          gross_profit?: number | null
          gross_revenue?: number | null
          id?: string
          labour_cost?: number | null
          margin_vs_last_month_pct?: number | null
          marketing_cost?: number | null
          net_revenue?: number | null
          other_expenses?: number | null
          period_month?: number
          period_year?: number
          refunds_total?: number | null
          rent_utilities?: number | null
          revenue_vs_last_month_pct?: number | null
          summary_narrative?: string | null
          total_expenses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_pl_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          business_id: string | null
          comment: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          responded_at: string | null
          sale_id: string | null
          score: number | null
        }
        Insert: {
          business_id?: string | null
          comment?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          responded_at?: string | null
          sale_id?: string | null
          score?: number | null
        }
        Update: {
          business_id?: string | null
          comment?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          responded_at?: string | null
          sale_id?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_line_items: {
        Row: {
          business_id: string
          created_at: string
          employment_type: string | null
          gross_pay_cents: number
          hourly_rate_cents: number
          hours_worked: number
          id: string
          net_estimate_cents: number
          notes: string | null
          pay_frequency: string | null
          payroll_run_id: string
          position: string | null
          staff_member_id: string | null
          staff_name: string
          super_cents: number
          superannuation_rate: number
          tax_withheld_cents: number
          timesheet_ids: string[]
        }
        Insert: {
          business_id: string
          created_at?: string
          employment_type?: string | null
          gross_pay_cents?: number
          hourly_rate_cents?: number
          hours_worked?: number
          id?: string
          net_estimate_cents?: number
          notes?: string | null
          pay_frequency?: string | null
          payroll_run_id: string
          position?: string | null
          staff_member_id?: string | null
          staff_name: string
          super_cents?: number
          superannuation_rate?: number
          tax_withheld_cents?: number
          timesheet_ids?: string[]
        }
        Update: {
          business_id?: string
          created_at?: string
          employment_type?: string | null
          gross_pay_cents?: number
          hourly_rate_cents?: number
          hours_worked?: number
          id?: string
          net_estimate_cents?: number
          notes?: string | null
          pay_frequency?: string | null
          payroll_run_id?: string
          position?: string | null
          staff_member_id?: string | null
          staff_name?: string
          super_cents?: number
          superannuation_rate?: number
          tax_withheld_cents?: number
          timesheet_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_line_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_line_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_line_items_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          aba_generated_at: string | null
          approved_at: string | null
          approved_by: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          line_items: Json | null
          notes: string | null
          pay_frequency: string
          period_end: string
          period_start: string
          staff_count: number
          status: string
          stp_lodged_at: string | null
          total_gross_cents: number
          total_net_estimate_cents: number
          total_super_cents: number
          total_tax_cents: number | null
          updated_at: string
        }
        Insert: {
          aba_generated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          line_items?: Json | null
          notes?: string | null
          pay_frequency?: string
          period_end: string
          period_start: string
          staff_count?: number
          status?: string
          stp_lodged_at?: string | null
          total_gross_cents?: number
          total_net_estimate_cents?: number
          total_super_cents?: number
          total_tax_cents?: number | null
          updated_at?: string
        }
        Update: {
          aba_generated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          line_items?: Json | null
          notes?: string | null
          pay_frequency?: string
          period_end?: string
          period_start?: string
          staff_count?: number
          status?: string
          stp_lodged_at?: string | null
          total_gross_cents?: number
          total_net_estimate_cents?: number
          total_super_cents?: number
          total_tax_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          business_id: string | null
          created_at: string | null
          emailed_at: string | null
          gross_pay_cents: number | null
          id: string
          net_pay_cents: number | null
          payroll_run_id: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          staff_member_id: string | null
          staff_name: string
          super_cents: number | null
          tax_withheld_cents: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          emailed_at?: string | null
          gross_pay_cents?: number | null
          id?: string
          net_pay_cents?: number | null
          payroll_run_id?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          staff_member_id?: string | null
          staff_name: string
          super_cents?: number | null
          tax_withheld_cents?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          emailed_at?: string | null
          gross_pay_cents?: number | null
          id?: string
          net_pay_cents?: number | null
          payroll_run_id?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          staff_member_id?: string | null
          staff_name?: string
          super_cents?: number | null
          tax_withheld_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_action_log: {
        Row: {
          action_type: string
          amount_cents: number | null
          business_id: string | null
          created_at: string | null
          description: string | null
          id: string
          performed_by: string | null
          sale_id: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          amount_cents?: number | null
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          performed_by?: string | null
          sale_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          amount_cents?: number | null
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          performed_by?: string | null
          sale_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_action_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_ai_nudges: {
        Row: {
          acted_on: boolean | null
          business_id: string | null
          id: string
          message: string | null
          nudge_type: string | null
          shown_at: string | null
        }
        Insert: {
          acted_on?: boolean | null
          business_id?: string | null
          id?: string
          message?: string | null
          nudge_type?: string | null
          shown_at?: string | null
        }
        Update: {
          acted_on?: boolean | null
          business_id?: string | null
          id?: string
          message?: string | null
          nudge_type?: string | null
          shown_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_ai_nudges_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_audit_log: {
        Row: {
          action: string
          amount: number | null
          business_id: string
          created_at: string
          id: string
          item_id: string | null
          manager_approved_by: string | null
          metadata: Json | null
          performed_by: string | null
          pos_user_id: string | null
          reason_code: string | null
          reason_note: string | null
          sale_id: string | null
        }
        Insert: {
          action: string
          amount?: number | null
          business_id: string
          created_at?: string
          id?: string
          item_id?: string | null
          manager_approved_by?: string | null
          metadata?: Json | null
          performed_by?: string | null
          pos_user_id?: string | null
          reason_code?: string | null
          reason_note?: string | null
          sale_id?: string | null
        }
        Update: {
          action?: string
          amount?: number | null
          business_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          manager_approved_by?: string | null
          metadata?: Json | null
          performed_by?: string | null
          pos_user_id?: string | null
          reason_code?: string | null
          reason_note?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_audit_log_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_audit_templates: {
        Row: {
          business_id: string | null
          category: string
          check_type: string
          created_at: string
          description: string | null
          id: string
          industry: string
          is_active: boolean
          name: string
          required: boolean
          sort_order: number
        }
        Insert: {
          business_id?: string | null
          category?: string
          check_type?: string
          created_at?: string
          description?: string | null
          id?: string
          industry: string
          is_active?: boolean
          name: string
          required?: boolean
          sort_order?: number
        }
        Update: {
          business_id?: string | null
          category?: string
          check_type?: string
          created_at?: string
          description?: string | null
          id?: string
          industry?: string
          is_active?: boolean
          name?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_audit_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_bas_exports: {
        Row: {
          breakdown_jsonb: Json
          business_id: string
          created_at: string
          export_format: string
          generated_by: string | null
          gst_free_sales: number
          id: string
          period_ends_at: string
          period_starts_at: string
          total_gst_collected: number
          total_lct_collected: number
          total_other_tax: number
          total_sales: number
          total_wet_collected: number
        }
        Insert: {
          breakdown_jsonb?: Json
          business_id: string
          created_at?: string
          export_format?: string
          generated_by?: string | null
          gst_free_sales?: number
          id?: string
          period_ends_at: string
          period_starts_at: string
          total_gst_collected?: number
          total_lct_collected?: number
          total_other_tax?: number
          total_sales?: number
          total_wet_collected?: number
        }
        Update: {
          breakdown_jsonb?: Json
          business_id?: string
          created_at?: string
          export_format?: string
          generated_by?: string | null
          gst_free_sales?: number
          id?: string
          period_ends_at?: string
          period_starts_at?: string
          total_gst_collected?: number
          total_lct_collected?: number
          total_other_tax?: number
          total_sales?: number
          total_wet_collected?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_bas_exports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_brands: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_campaign_sends: {
        Row: {
          business_id: string
          campaign_id: string
          channel: string
          converted: boolean | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          error_msg: string | null
          id: string
          message_sent: string | null
          send_status: string
          sent_at: string | null
        }
        Insert: {
          business_id: string
          campaign_id: string
          channel?: string
          converted?: boolean | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_msg?: string | null
          id?: string
          message_sent?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Update: {
          business_id?: string
          campaign_id?: string
          channel?: string
          converted?: boolean | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_msg?: string | null
          id?: string
          message_sent?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_campaign_sends_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "pos_marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_campaign_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_campaigns: {
        Row: {
          business_id: string
          channel: string | null
          created_at: string | null
          id: string
          name: string
          scheduled_for: string | null
          segment: string | null
          sent_count: number | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          business_id: string
          channel?: string | null
          created_at?: string | null
          id?: string
          name: string
          scheduled_for?: string | null
          segment?: string | null
          sent_count?: number | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          business_id?: string
          channel?: string | null
          created_at?: string | null
          id?: string
          name?: string
          scheduled_for?: string | null
          segment?: string | null
          sent_count?: number | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      pos_cash_movements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          note: string | null
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          note?: string | null
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          note?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cash_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_cash_sessions: {
        Row: {
          actual_cash_cents: number | null
          business_id: string | null
          closed_at: string | null
          closed_by: string | null
          closing_float: number | null
          closure_note: string | null
          expected_cash_cents: number | null
          id: string
          notes: string | null
          opened_at: string | null
          opened_by: string | null
          opened_by_user_id: string | null
          opening_float: number | null
          outlet_id: string | null
          register_id: string | null
          status: string | null
          total_card_sales: number | null
          total_cash_sales: number | null
          total_refunds: number | null
          variance_cents: number | null
        }
        Insert: {
          actual_cash_cents?: number | null
          business_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_float?: number | null
          closure_note?: string | null
          expected_cash_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          opened_by_user_id?: string | null
          opening_float?: number | null
          outlet_id?: string | null
          register_id?: string | null
          status?: string | null
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_refunds?: number | null
          variance_cents?: number | null
        }
        Update: {
          actual_cash_cents?: number | null
          business_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_float?: number | null
          closure_note?: string | null
          expected_cash_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          opened_by?: string | null
          opened_by_user_id?: string | null
          opening_float?: number | null
          outlet_id?: string | null
          register_id?: string | null
          status?: string | null
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_refunds?: number | null
          variance_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_cash_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cash_sessions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cash_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_categories: {
        Row: {
          business_id: string | null
          color: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_commission_rules: {
        Row: {
          applies_to_categories: string[] | null
          applies_to_pos_users: string[] | null
          business_id: string | null
          created_at: string | null
          effective_until: string | null
          id: string
          is_active: boolean | null
          min_sale_cents: number | null
          name: string
          rate: number | null
          rule_type: string | null
        }
        Insert: {
          applies_to_categories?: string[] | null
          applies_to_pos_users?: string[] | null
          business_id?: string | null
          created_at?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          min_sale_cents?: number | null
          name: string
          rate?: number | null
          rule_type?: string | null
        }
        Update: {
          applies_to_categories?: string[] | null
          applies_to_pos_users?: string[] | null
          business_id?: string | null
          created_at?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          min_sale_cents?: number | null
          name?: string
          rate?: number | null
          rule_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_commission_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_commissions: {
        Row: {
          business_id: string | null
          commission_cents: number
          commission_rate: number
          created_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          pos_user_name: string
          rule_id: string | null
          sale_id: string | null
          sale_total_cents: number
          status: string | null
        }
        Insert: {
          business_id?: string | null
          commission_cents: number
          commission_rate: number
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pos_user_name: string
          rule_id?: string | null
          sale_id?: string | null
          sale_total_cents: number
          status?: string | null
        }
        Update: {
          business_id?: string | null
          commission_cents?: number
          commission_rate?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pos_user_name?: string
          rule_id?: string | null
          sale_id?: string | null
          sale_total_cents?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pos_commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_company_settings: {
        Row: {
          business_id: string | null
          case_text: string | null
          cross_promotion_count: boolean | null
          id: string
          require_password: boolean | null
          sell_cases: boolean | null
          sell_screen_auto_logout: number | null
          sign_in_type: string | null
          single_text: string | null
          team_message: string | null
          updated_at: string | null
          use_quantity_rate: boolean | null
        }
        Insert: {
          business_id?: string | null
          case_text?: string | null
          cross_promotion_count?: boolean | null
          id?: string
          require_password?: boolean | null
          sell_cases?: boolean | null
          sell_screen_auto_logout?: number | null
          sign_in_type?: string | null
          single_text?: string | null
          team_message?: string | null
          updated_at?: string | null
          use_quantity_rate?: boolean | null
        }
        Update: {
          business_id?: string | null
          case_text?: string | null
          cross_promotion_count?: boolean | null
          id?: string
          require_password?: boolean | null
          sell_cases?: boolean | null
          sell_screen_auto_logout?: number | null
          sign_in_type?: string | null
          single_text?: string | null
          team_message?: string | null
          updated_at?: string | null
          use_quantity_rate?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_company_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_custom_roles: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_system: boolean
          permissions: Json
          role_key: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          permissions?: Json
          role_key: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          permissions?: Json
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_custom_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customer_communications: {
        Row: {
          business_id: string | null
          channel: string
          created_at: string
          customer_id: string
          direction: string
          id: string
          message: string
          sent_at: string | null
          status: string
        }
        Insert: {
          business_id?: string | null
          channel?: string
          created_at?: string
          customer_id: string
          direction?: string
          id?: string
          message: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          business_id?: string | null
          channel?: string
          created_at?: string
          customer_id?: string
          direction?: string
          id?: string
          message?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_customer_communications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customer_groups: {
        Row: {
          business_id: string | null
          created_at: string | null
          discount_percent: number | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_customer_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customer_transactions: {
        Row: {
          amount_cents: number
          business_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          description: string | null
          id: string
          sale_id: string | null
          transaction_type: string
        }
        Insert: {
          amount_cents: number
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          sale_id?: string | null
          transaction_type: string
        }
        Update: {
          amount_cents?: number
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          sale_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_customer_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_customer_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customers: {
        Row: {
          abn: string | null
          account_balance: number | null
          account_number: string | null
          balance: number | null
          birthday: string | null
          business_id: string | null
          churn_risk_score: number | null
          churn_risk_updated_at: string | null
          created_at: string | null
          credit_limit_cents: number | null
          current_balance_cents: number | null
          custom_fields: Json | null
          customer_group_id: string | null
          days_since_visit: number | null
          deleted_at: string | null
          email: string | null
          group_id: string | null
          group_name: string | null
          id: string
          last_visit: string | null
          last_visit_at: string | null
          lifetime_value_cents: number | null
          lightspeed_customer_id: string | null
          loyalty_balance: number | null
          loyalty_points: number | null
          loyalty_tier: string | null
          marketing_consent: boolean | null
          name: string
          notes: string | null
          phone: string | null
          points_balance: number | null
          price_list_id: string | null
          referral_code: string | null
          review_request_sent_at: string | null
          rfm_frequency_score: number | null
          rfm_monetary_score: number | null
          rfm_recency_score: number | null
          rfm_score_total: number | null
          rfm_segment: string | null
          segment: string | null
          segment_updated_at: string | null
          shopify_customer_id: string | null
          source: string | null
          square_customer_id: string | null
          stamps_count: number | null
          tags: string[] | null
          tax_exempt: boolean
          tax_exempt_certificate: string | null
          tax_exempt_expires_at: string | null
          tax_exempt_type: string | null
          total_lifetime_spend: number | null
          total_spend: number | null
          total_spent: number | null
          updated_at: string | null
          visit_count: number | null
        }
        Insert: {
          abn?: string | null
          account_balance?: number | null
          account_number?: string | null
          balance?: number | null
          birthday?: string | null
          business_id?: string | null
          churn_risk_score?: number | null
          churn_risk_updated_at?: string | null
          created_at?: string | null
          credit_limit_cents?: number | null
          current_balance_cents?: number | null
          custom_fields?: Json | null
          customer_group_id?: string | null
          days_since_visit?: number | null
          deleted_at?: string | null
          email?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          last_visit?: string | null
          last_visit_at?: string | null
          lifetime_value_cents?: number | null
          lightspeed_customer_id?: string | null
          loyalty_balance?: number | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          marketing_consent?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          points_balance?: number | null
          price_list_id?: string | null
          referral_code?: string | null
          review_request_sent_at?: string | null
          rfm_frequency_score?: number | null
          rfm_monetary_score?: number | null
          rfm_recency_score?: number | null
          rfm_score_total?: number | null
          rfm_segment?: string | null
          segment?: string | null
          segment_updated_at?: string | null
          shopify_customer_id?: string | null
          source?: string | null
          square_customer_id?: string | null
          stamps_count?: number | null
          tags?: string[] | null
          tax_exempt?: boolean
          tax_exempt_certificate?: string | null
          tax_exempt_expires_at?: string | null
          tax_exempt_type?: string | null
          total_lifetime_spend?: number | null
          total_spend?: number | null
          total_spent?: number | null
          updated_at?: string | null
          visit_count?: number | null
        }
        Update: {
          abn?: string | null
          account_balance?: number | null
          account_number?: string | null
          balance?: number | null
          birthday?: string | null
          business_id?: string | null
          churn_risk_score?: number | null
          churn_risk_updated_at?: string | null
          created_at?: string | null
          credit_limit_cents?: number | null
          current_balance_cents?: number | null
          custom_fields?: Json | null
          customer_group_id?: string | null
          days_since_visit?: number | null
          deleted_at?: string | null
          email?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          last_visit?: string | null
          last_visit_at?: string | null
          lifetime_value_cents?: number | null
          lightspeed_customer_id?: string | null
          loyalty_balance?: number | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          marketing_consent?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          points_balance?: number | null
          price_list_id?: string | null
          referral_code?: string | null
          review_request_sent_at?: string | null
          rfm_frequency_score?: number | null
          rfm_monetary_score?: number | null
          rfm_recency_score?: number | null
          rfm_score_total?: number | null
          rfm_segment?: string | null
          segment?: string | null
          segment_updated_at?: string | null
          shopify_customer_id?: string | null
          source?: string | null
          square_customer_id?: string | null
          stamps_count?: number | null
          tags?: string[] | null
          tax_exempt?: boolean
          tax_exempt_certificate?: string | null
          tax_exempt_expires_at?: string | null
          tax_exempt_type?: string | null
          total_lifetime_spend?: number | null
          total_spend?: number | null
          total_spent?: number | null
          updated_at?: string | null
          visit_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_customers_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "pos_customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_daily_briefings: {
        Row: {
          action_items: Json | null
          alerts: Json | null
          briefing_date: string
          briefing_type: string | null
          business_id: string
          eod_reconciliation_status: string | null
          generated_at: string | null
          id: string
          insights: Json | null
          pace_vs_average_pct: number | null
          summary: string | null
          top_products: Json | null
          yesterday_revenue: number | null
          yesterday_transactions: number | null
        }
        Insert: {
          action_items?: Json | null
          alerts?: Json | null
          briefing_date: string
          briefing_type?: string | null
          business_id: string
          eod_reconciliation_status?: string | null
          generated_at?: string | null
          id?: string
          insights?: Json | null
          pace_vs_average_pct?: number | null
          summary?: string | null
          top_products?: Json | null
          yesterday_revenue?: number | null
          yesterday_transactions?: number | null
        }
        Update: {
          action_items?: Json | null
          alerts?: Json | null
          briefing_date?: string
          briefing_type?: string | null
          business_id?: string
          eod_reconciliation_status?: string | null
          generated_at?: string | null
          id?: string
          insights?: Json | null
          pace_vs_average_pct?: number | null
          summary?: string | null
          top_products?: Json | null
          yesterday_revenue?: number | null
          yesterday_transactions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_daily_briefings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_discount_applications: {
        Row: {
          amount_off: number
          applied_by: string | null
          created_at: string | null
          id: string
          promotion_id: string | null
          reason_code: string | null
          sale_id: string | null
        }
        Insert: {
          amount_off: number
          applied_by?: string | null
          created_at?: string | null
          id?: string
          promotion_id?: string | null
          reason_code?: string | null
          sale_id?: string | null
        }
        Update: {
          amount_off?: number
          applied_by?: string | null
          created_at?: string | null
          id?: string
          promotion_id?: string | null
          reason_code?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_discount_applications_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "pos_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discount_applications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_discounts: {
        Row: {
          business_id: string | null
          code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string | null
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          business_id?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type?: string | null
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          business_id?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string | null
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_discounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_display_suggestions: {
        Row: {
          business_id: string
          cashier_decision: string | null
          cashier_name: string | null
          created_at: string
          customer_accepted: boolean | null
          customer_id: string | null
          customer_name: string | null
          decided_at: string | null
          discount_max_pct: number
          discount_pct: number
          id: string
          offer_text: string
          sale_id: string | null
          session_id: string | null
          shown_on_display: boolean
          suggested_products: Json
          suggestion_type: string
        }
        Insert: {
          business_id: string
          cashier_decision?: string | null
          cashier_name?: string | null
          created_at?: string
          customer_accepted?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          decided_at?: string | null
          discount_max_pct?: number
          discount_pct?: number
          id?: string
          offer_text: string
          sale_id?: string | null
          session_id?: string | null
          shown_on_display?: boolean
          suggested_products?: Json
          suggestion_type: string
        }
        Update: {
          business_id?: string
          cashier_decision?: string | null
          cashier_name?: string | null
          created_at?: string
          customer_accepted?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          decided_at?: string | null
          discount_max_pct?: number
          discount_pct?: number
          id?: string
          offer_text?: string
          sale_id?: string | null
          session_id?: string | null
          shown_on_display?: boolean
          suggested_products?: Json
          suggestion_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_display_suggestions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_display_suggestions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_display_suggestions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_display_suggestions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_eod_markdown_rules: {
        Row: {
          business_id: string
          category_id: string | null
          created_at: string | null
          days_of_week: number[] | null
          discount_pct: number
          id: string
          is_active: boolean
          name: string
          trigger_time: string
        }
        Insert: {
          business_id: string
          category_id?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          discount_pct?: number
          id?: string
          is_active?: boolean
          name?: string
          trigger_time?: string
        }
        Update: {
          business_id?: string
          category_id?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          discount_pct?: number
          id?: string
          is_active?: boolean
          name?: string
          trigger_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_eod_markdown_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_expiry_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string
          batch_id: string
          business_id: string
          created_at: string | null
          days_until_expiry: number | null
          id: string
          message: string | null
          product_id: string
          quantity_at_risk: number | null
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type: string
          batch_id: string
          business_id: string
          created_at?: string | null
          days_until_expiry?: number | null
          id?: string
          message?: string | null
          product_id: string
          quantity_at_risk?: number | null
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string
          batch_id?: string
          business_id?: string
          created_at?: string | null
          days_until_expiry?: number | null
          id?: string
          message?: string | null
          product_id?: string
          quantity_at_risk?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_expiry_alerts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "pos_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_expiry_alerts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_expiry_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_families: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_families_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_fitting_room_sessions: {
        Row: {
          business_id: string
          closed_at: string | null
          customer_name: string | null
          id: string
          items: Json
          opened_at: string
          room_number: string
          sale_id: string | null
          status: string
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          customer_name?: string | null
          id?: string
          items?: Json
          opened_at?: string
          room_number: string
          sale_id?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          customer_name?: string | null
          id?: string
          items?: Json
          opened_at?: string
          room_number?: string
          sale_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_fitting_room_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_future_prices: {
        Row: {
          applied: boolean | null
          applied_at: string | null
          business_id: string | null
          created_at: string | null
          current_price: number | null
          effective_date: string
          id: string
          new_price: number
          product_id: string | null
        }
        Insert: {
          applied?: boolean | null
          applied_at?: string | null
          business_id?: string | null
          created_at?: string | null
          current_price?: number | null
          effective_date: string
          id?: string
          new_price: number
          product_id?: string | null
        }
        Update: {
          applied?: boolean | null
          applied_at?: string | null
          business_id?: string | null
          created_at?: string | null
          current_price?: number | null
          effective_date?: string
          id?: string
          new_price?: number
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_future_prices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_future_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_gift_card_transactions: {
        Row: {
          amount: number
          balance_after: number
          business_id: string | null
          created_at: string | null
          gift_card_id: string | null
          id: string
          note: string | null
          sale_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          business_id?: string | null
          created_at?: string | null
          gift_card_id?: string | null
          id?: string
          note?: string | null
          sale_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          business_id?: string | null
          created_at?: string | null
          gift_card_id?: string | null
          id?: string
          note?: string | null
          sale_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_gift_card_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "pos_gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_gift_card_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_gift_cards: {
        Row: {
          balance: number | null
          business_id: string | null
          code: string
          created_at: string | null
          customer_id: string | null
          expires_at: string | null
          flag_reason: string | null
          id: string
          initial_balance: number
          is_active: boolean | null
          is_flagged: boolean | null
          issued_at: string | null
          last_used_at: string | null
          personal_message: string | null
          recipient_name: string | null
          redeemed_amount: number | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          balance?: number | null
          business_id?: string | null
          code: string
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          flag_reason?: string | null
          id?: string
          initial_balance: number
          is_active?: boolean | null
          is_flagged?: boolean | null
          issued_at?: string | null
          last_used_at?: string | null
          personal_message?: string | null
          recipient_name?: string | null
          redeemed_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          balance?: number | null
          business_id?: string | null
          code?: string
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          flag_reason?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean | null
          is_flagged?: boolean | null
          issued_at?: string | null
          last_used_at?: string | null
          personal_message?: string | null
          recipient_name?: string | null
          redeemed_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_gift_cards_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_hardware_devices: {
        Row: {
          business_id: string
          config: Json
          connection_type: string
          created_at: string
          device_type: string
          display_name: string
          id: string
          is_active: boolean
          last_error: string | null
          last_seen_at: string | null
          network_address: string | null
          outlet_id: string | null
          port: number | null
          register_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          config?: Json
          connection_type: string
          created_at?: string
          device_type: string
          display_name: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          network_address?: string | null
          outlet_id?: string | null
          port?: number | null
          register_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          config?: Json
          connection_type?: string
          created_at?: string
          device_type?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          network_address?: string | null
          outlet_id?: string | null
          port?: number | null
          register_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_hardware_devices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_hardware_devices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_hardware_events: {
        Row: {
          business_id: string
          created_at: string
          device_id: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          sale_id: string | null
          success: boolean
          triggered_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          sale_id?: string | null
          success?: boolean
          triggered_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          sale_id?: string | null
          success?: boolean
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_hardware_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_hardware_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_hardware_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_hardware_events_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_image_credits: {
        Row: {
          business_id: string
          created_at: string | null
          free_limit: number
          free_used: number
          id: string
          paid_credits: number
          total_images: number
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          free_limit?: number
          free_used?: number
          id?: string
          paid_credits?: number
          total_images?: number
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          free_limit?: number
          free_used?: number
          id?: string
          paid_credits?: number
          total_images?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_image_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_image_transactions: {
        Row: {
          amount_charged: number | null
          bg_removed: boolean | null
          business_id: string
          created_at: string | null
          id: string
          pack_size: number | null
          product_id: string | null
          stripe_payment_intent_id: string | null
          type: string
        }
        Insert: {
          amount_charged?: number | null
          bg_removed?: boolean | null
          business_id: string
          created_at?: string | null
          id?: string
          pack_size?: number | null
          product_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
        }
        Update: {
          amount_charged?: number | null
          bg_removed?: boolean | null
          business_id?: string
          created_at?: string | null
          id?: string
          pack_size?: number | null
          product_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_image_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_image_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_integration_sync_events: {
        Row: {
          business_id: string
          completed_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          integration_key: string
          payload: Json | null
          records_count: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_key: string
          payload?: Json | null
          records_count?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          integration_key?: string
          payload?: Json | null
          records_count?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      pos_inter_outlet_transfers: {
        Row: {
          business_id: string
          created_at: string | null
          created_by: string | null
          from_outlet_id: string | null
          id: string
          notes: string | null
          product_id: string
          qty: number
          status: string
          to_outlet_id: string
          transferred_at: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          created_by?: string | null
          from_outlet_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          qty: number
          status?: string
          to_outlet_id: string
          transferred_at?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          from_outlet_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          qty?: number
          status?: string
          to_outlet_id?: string
          transferred_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_inter_outlet_transfers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inter_outlet_transfers_from_outlet_id_fkey"
            columns: ["from_outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inter_outlet_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inter_outlet_transfers_to_outlet_id_fkey"
            columns: ["to_outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory_transfer_items: {
        Row: {
          created_at: string | null
          id: string
          line_cost: number
          product_id: string | null
          product_name: string
          quantity_approved: number
          quantity_received: number | null
          quantity_requested: number
          quantity_sent: number | null
          transfer_id: string | null
          unit_cost: number
          variance_note: string | null
          variance_reason: string | null
          variance_units: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_cost?: number
          product_id?: string | null
          product_name: string
          quantity_approved?: number
          quantity_received?: number | null
          quantity_requested?: number
          quantity_sent?: number | null
          transfer_id?: string | null
          unit_cost?: number
          variance_note?: string | null
          variance_reason?: string | null
          variance_units?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          line_cost?: number
          product_id?: string | null
          product_name?: string
          quantity_approved?: number
          quantity_received?: number | null
          quantity_requested?: number
          quantity_sent?: number | null
          transfer_id?: string | null
          unit_cost?: number
          variance_note?: string | null
          variance_reason?: string | null
          variance_units?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_inventory_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "pos_inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string | null
          cancellation_reason: string | null
          completed_at: string | null
          cost_method: string
          created_at: string | null
          created_by: string | null
          expected_arrival_at: string | null
          from_outlet_id: string | null
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          requested_at: string | null
          requested_by: string | null
          shipped_at: string | null
          shipped_by: string | null
          status: string | null
          to_outlet_id: string | null
          total_cost: number
          total_variance_cost: number
          total_variance_units: number
          transfer_number: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          cost_method?: string
          created_at?: string | null
          created_by?: string | null
          expected_arrival_at?: string | null
          from_outlet_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string | null
          to_outlet_id?: string | null
          total_cost?: number
          total_variance_cost?: number
          total_variance_units?: number
          transfer_number?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          cost_method?: string
          created_at?: string | null
          created_by?: string | null
          expected_arrival_at?: string | null
          from_outlet_id?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string | null
          to_outlet_id?: string | null
          total_cost?: number
          total_variance_cost?: number
          total_variance_units?: number
          transfer_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_inventory_transfers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_transfers_from_outlet_id_fkey"
            columns: ["from_outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_transfers_to_outlet_id_fkey"
            columns: ["to_outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_item_variations: {
        Row: {
          business_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_default: boolean | null
          name: string
          price: number
          product_id: string
          size_key: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_default?: boolean | null
          name: string
          price: number
          product_id: string
          size_key?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_default?: boolean | null
          name?: string
          price?: number
          product_id?: string
          size_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_item_variations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_item_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_kds_orders: {
        Row: {
          bumped_at: string | null
          business_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          items: Json
          notes: string | null
          priority: number | null
          sale_id: string | null
          started_at: string | null
          status: string | null
          table_number: string | null
        }
        Insert: {
          bumped_at?: string | null
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json
          notes?: string | null
          priority?: number | null
          sale_id?: string | null
          started_at?: string | null
          status?: string | null
          table_number?: string | null
        }
        Update: {
          bumped_at?: string | null
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json
          notes?: string | null
          priority?: number | null
          sale_id?: string | null
          started_at?: string | null
          status?: string | null
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_kds_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_kds_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_kds_stations: {
        Row: {
          auto_recall_threshold_seconds: number | null
          business_id: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          outlet_id: string | null
          show_allergens: boolean
          show_modifiers: boolean
          sort_order: number
          sound_enabled: boolean
          station_key: string
          updated_at: string
        }
        Insert: {
          auto_recall_threshold_seconds?: number | null
          business_id: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          outlet_id?: string | null
          show_allergens?: boolean
          show_modifiers?: boolean
          sort_order?: number
          sound_enabled?: boolean
          station_key: string
          updated_at?: string
        }
        Update: {
          auto_recall_threshold_seconds?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          outlet_id?: string | null
          show_allergens?: boolean
          show_modifiers?: boolean
          sort_order?: number
          sound_enabled?: boolean
          station_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_kds_stations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_kds_stations_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_kds_tickets: {
        Row: {
          bumped_at: string | null
          business_id: string
          course: number | null
          created_at: string
          expedited: boolean
          fired_at: string
          id: string
          modifiers_summary: string | null
          notes: string | null
          outlet_id: string | null
          prep_time_seconds: number | null
          quantity: number
          recalled_at: string | null
          recalled_by: string | null
          sale_id: string | null
          sale_item_id: string | null
          seat_number: number | null
          station: string
          status: string
          table_label: string | null
          updated_at: string
        }
        Insert: {
          bumped_at?: string | null
          business_id: string
          course?: number | null
          created_at?: string
          expedited?: boolean
          fired_at?: string
          id?: string
          modifiers_summary?: string | null
          notes?: string | null
          outlet_id?: string | null
          prep_time_seconds?: number | null
          quantity?: number
          recalled_at?: string | null
          recalled_by?: string | null
          sale_id?: string | null
          sale_item_id?: string | null
          seat_number?: number | null
          station: string
          status?: string
          table_label?: string | null
          updated_at?: string
        }
        Update: {
          bumped_at?: string | null
          business_id?: string
          course?: number | null
          created_at?: string
          expedited?: boolean
          fired_at?: string
          id?: string
          modifiers_summary?: string | null
          notes?: string | null
          outlet_id?: string | null
          prep_time_seconds?: number | null
          quantity?: number
          recalled_at?: string | null
          recalled_by?: string | null
          sale_id?: string | null
          sale_item_id?: string | null
          seat_number?: number | null
          station?: string
          status?: string
          table_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_kds_tickets_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_kds_tickets_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_laybys: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string | null
          customer_id: string
          deposit_cents: number
          due_date: string | null
          id: string
          items: Json
          notes: string | null
          paid_cents: number | null
          status: string | null
          total_cents: number
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string | null
          customer_id: string
          deposit_cents: number
          due_date?: string | null
          id?: string
          items: Json
          notes?: string | null
          paid_cents?: number | null
          status?: string | null
          total_cents: number
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string
          deposit_cents?: number
          due_date?: string | null
          id?: string
          items?: Json
          notes?: string | null
          paid_cents?: number | null
          status?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_laybys_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_layout_preferences: {
        Row: {
          business_id: string
          nav_groups: Json | null
          nav_order: Json | null
          product_grid_order: Json | null
          updated_at: string
        }
        Insert: {
          business_id: string
          nav_groups?: Json | null
          nav_order?: Json | null
          product_grid_order?: Json | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          nav_groups?: Json | null
          nav_order?: Json | null
          product_grid_order?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_layout_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_loyalty_config: {
        Row: {
          birthday_reward_text: string | null
          business_id: string
          created_at: string | null
          enrol_page_slug: string | null
          point_value_cents: number
          points_expiry_days: number | null
          points_per_dollar: number
          program_type: string
          public_enrol_enabled: boolean | null
          referee_bonus_points: number | null
          referral_bonus_points: number | null
          stamp_reward_text: string
          stamps_to_reward: number
          tier_gold_points: number | null
          tier_platinum_points: number | null
          tier_silver_points: number | null
          updated_at: string | null
          winback_after_days: number | null
          winback_reward_text: string | null
        }
        Insert: {
          birthday_reward_text?: string | null
          business_id: string
          created_at?: string | null
          enrol_page_slug?: string | null
          point_value_cents?: number
          points_expiry_days?: number | null
          points_per_dollar?: number
          program_type?: string
          public_enrol_enabled?: boolean | null
          referee_bonus_points?: number | null
          referral_bonus_points?: number | null
          stamp_reward_text?: string
          stamps_to_reward?: number
          tier_gold_points?: number | null
          tier_platinum_points?: number | null
          tier_silver_points?: number | null
          updated_at?: string | null
          winback_after_days?: number | null
          winback_reward_text?: string | null
        }
        Update: {
          birthday_reward_text?: string | null
          business_id?: string
          created_at?: string | null
          enrol_page_slug?: string | null
          point_value_cents?: number
          points_expiry_days?: number | null
          points_per_dollar?: number
          program_type?: string
          public_enrol_enabled?: boolean | null
          referee_bonus_points?: number | null
          referral_bonus_points?: number | null
          stamp_reward_text?: string
          stamps_to_reward?: number
          tier_gold_points?: number | null
          tier_platinum_points?: number | null
          tier_silver_points?: number | null
          updated_at?: string | null
          winback_after_days?: number | null
          winback_reward_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_loyalty_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_loyalty_transactions: {
        Row: {
          business_id: string
          created_at: string | null
          customer_id: string | null
          id: string
          points_delta: number | null
          reward_redeemed: string | null
          sale_id: string | null
          stamps_delta: number | null
          type: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          points_delta?: number | null
          reward_redeemed?: string | null
          sale_id?: string | null
          stamps_delta?: number | null
          type: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          points_delta?: number | null
          reward_redeemed?: string | null
          sale_id?: string | null
          stamps_delta?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_loyalty_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_loyalty_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_market_price_cache: {
        Row: {
          barcode: string | null
          business_id: string
          expires_at: string | null
          fetched_at: string | null
          id: string
          is_overpriced: boolean | null
          is_underpriced: boolean | null
          price_gap_cents: number | null
          price_gap_pct: number | null
          product_id: string
          retailer_type: string | null
          search_query: string | null
          shelf_price: number | null
          source_name: string
          source_url: string | null
        }
        Insert: {
          barcode?: string | null
          business_id: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          is_overpriced?: boolean | null
          is_underpriced?: boolean | null
          price_gap_cents?: number | null
          price_gap_pct?: number | null
          product_id: string
          retailer_type?: string | null
          search_query?: string | null
          shelf_price?: number | null
          source_name: string
          source_url?: string | null
        }
        Update: {
          barcode?: string | null
          business_id?: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          is_overpriced?: boolean | null
          is_underpriced?: boolean | null
          price_gap_cents?: number | null
          price_gap_pct?: number | null
          product_id?: string
          retailer_type?: string | null
          search_query?: string | null
          shelf_price?: number | null
          source_name?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_market_price_cache_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_marketing_campaigns: {
        Row: {
          business_id: string
          campaign_type: string
          channel: string
          converted_count: number
          created_at: string
          discount_code: string | null
          discount_pct: number | null
          id: string
          is_active: boolean
          is_automated: boolean
          last_run_at: string | null
          message_template: string
          name: string
          opened_count: number
          revenue_attributed: number
          sent_count: number
          subject_line: string | null
          trigger_rule: Json | null
        }
        Insert: {
          business_id: string
          campaign_type: string
          channel?: string
          converted_count?: number
          created_at?: string
          discount_code?: string | null
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          is_automated?: boolean
          last_run_at?: string | null
          message_template: string
          name: string
          opened_count?: number
          revenue_attributed?: number
          sent_count?: number
          subject_line?: string | null
          trigger_rule?: Json | null
        }
        Update: {
          business_id?: string
          campaign_type?: string
          channel?: string
          converted_count?: number
          created_at?: string
          discount_code?: string | null
          discount_pct?: number | null
          id?: string
          is_active?: boolean
          is_automated?: boolean
          last_run_at?: string | null
          message_template?: string
          name?: string
          opened_count?: number
          revenue_attributed?: number
          sent_count?: number
          subject_line?: string | null
          trigger_rule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_marketing_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_media: {
        Row: {
          business_id: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_media_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_migrations: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string | null
          customers_imported: number | null
          error: string | null
          id: string
          last_processed_external_id: string | null
          products_imported: number | null
          progress: number | null
          sales_imported: number | null
          source: string
          started_at: string | null
          status: string | null
          unmatched_jsonb: Json | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string | null
          customers_imported?: number | null
          error?: string | null
          id?: string
          last_processed_external_id?: string | null
          products_imported?: number | null
          progress?: number | null
          sales_imported?: number | null
          source: string
          started_at?: string | null
          status?: string | null
          unmatched_jsonb?: Json | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string | null
          customers_imported?: number | null
          error?: string | null
          id?: string
          last_processed_external_id?: string | null
          products_imported?: number | null
          progress?: number | null
          sales_imported?: number | null
          source?: string
          started_at?: string | null
          status?: string | null
          unmatched_jsonb?: Json | null
        }
        Relationships: []
      }
      pos_modifier_groups: {
        Row: {
          allow_quantity: boolean | null
          applies_to_product_ids: string[] | null
          business_id: string | null
          color: string | null
          created_at: string | null
          display_name: string | null
          display_order: number | null
          id: string
          is_required: boolean | null
          max_selections: number | null
          min_selections: number | null
          name: string
          required: boolean | null
          selection_type: string | null
          show_conversational_buttons: boolean | null
          show_when: Json | null
          step_number: number | null
          updated_at: string | null
        }
        Insert: {
          allow_quantity?: boolean | null
          applies_to_product_ids?: string[] | null
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          display_name?: string | null
          display_order?: number | null
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name: string
          required?: boolean | null
          selection_type?: string | null
          show_conversational_buttons?: boolean | null
          show_when?: Json | null
          step_number?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_quantity?: boolean | null
          applies_to_product_ids?: string[] | null
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          display_name?: string | null
          display_order?: number | null
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          required?: boolean | null
          selection_type?: string | null
          show_conversational_buttons?: boolean | null
          show_when?: Json | null
          step_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_modifiers: {
        Row: {
          allow_quantity: boolean | null
          business_id: string | null
          display_order: number | null
          group_id: string | null
          id: string
          inventory_link: string | null
          is_active: boolean | null
          is_default: boolean | null
          kds_color: string | null
          max_quantity: number | null
          name: string
          price_adjustment: number | null
          price_cents: number | null
          price_per_size: Json | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          allow_quantity?: boolean | null
          business_id?: string | null
          display_order?: number | null
          group_id?: string | null
          id?: string
          inventory_link?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          kds_color?: string | null
          max_quantity?: number | null
          name: string
          price_adjustment?: number | null
          price_cents?: number | null
          price_per_size?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_quantity?: boolean | null
          business_id?: string | null
          display_order?: number | null
          group_id?: string | null
          id?: string
          inventory_link?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          kds_color?: string | null
          max_quantity?: number | null
          name?: string
          price_adjustment?: number | null
          price_cents?: number | null
          price_per_size?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_modifiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pos_modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_oauth_integrations: {
        Row: {
          access_token_encrypted: string | null
          auth_state_token: string | null
          business_id: string
          config: Json | null
          created_at: string | null
          external_account_id: string | null
          external_account_name: string | null
          id: string
          integration_key: string
          last_error: string | null
          last_sync_at: string | null
          refresh_token_encrypted: string | null
          scopes: string[] | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          auth_state_token?: string | null
          business_id: string
          config?: Json | null
          created_at?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          integration_key: string
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          auth_state_token?: string | null
          business_id?: string
          config?: Json | null
          created_at?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          integration_key?: string
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_oauth_integrations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_online_order_items: {
        Row: {
          id: string
          line_total: number
          order_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          order_id?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          order_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_online_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_online_orders: {
        Row: {
          accepted_at: string | null
          aria_upsell: string | null
          business_id: string | null
          confirmation_email_sent: boolean | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee: number | null
          estimated_ready_at: string | null
          fulfillment_type: string | null
          id: string
          items: Json | null
          notes: string | null
          order_number: string
          outlet_id: string | null
          paid_at: string | null
          payment_intent_id: string | null
          picked_up_at: string | null
          pickup_time: string | null
          ready_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          sale_id: string | null
          source: string | null
          special_instructions: string | null
          status: string | null
          store_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          subtotal: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          aria_upsell?: string | null
          business_id?: string | null
          confirmation_email_sent?: boolean | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          estimated_ready_at?: string | null
          fulfillment_type?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          order_number: string
          outlet_id?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          picked_up_at?: string | null
          pickup_time?: string | null
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sale_id?: string | null
          source?: string | null
          special_instructions?: string | null
          status?: string | null
          store_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          subtotal?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          aria_upsell?: string | null
          business_id?: string | null
          confirmation_email_sent?: boolean | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          estimated_ready_at?: string | null
          fulfillment_type?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          order_number?: string
          outlet_id?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          picked_up_at?: string | null
          pickup_time?: string | null
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sale_id?: string | null
          source?: string | null
          special_instructions?: string | null
          status?: string | null
          store_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          subtotal?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_online_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "pos_online_store"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_online_settings: {
        Row: {
          accept_orders: boolean | null
          business_id: string
          created_at: string
          delivery_enabled: boolean | null
          delivery_fee: number | null
          delivery_radius_km: number | null
          enabled: boolean | null
          id: string
          min_order_amount: number | null
          pickup_enabled: boolean | null
          prep_time_minutes: number | null
          settings: Json
          store_name: string | null
          store_slug: string | null
          updated_at: string
        }
        Insert: {
          accept_orders?: boolean | null
          business_id: string
          created_at?: string
          delivery_enabled?: boolean | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          enabled?: boolean | null
          id?: string
          min_order_amount?: number | null
          pickup_enabled?: boolean | null
          prep_time_minutes?: number | null
          settings?: Json
          store_name?: string | null
          store_slug?: string | null
          updated_at?: string
        }
        Update: {
          accept_orders?: boolean | null
          business_id?: string
          created_at?: string
          delivery_enabled?: boolean | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          enabled?: boolean | null
          id?: string
          min_order_amount?: number | null
          pickup_enabled?: boolean | null
          prep_time_minutes?: number | null
          settings?: Json
          store_name?: string | null
          store_slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_online_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_online_store: {
        Row: {
          allow_delivery: boolean | null
          allow_pickup: boolean | null
          banner_url: string | null
          business_id: string | null
          created_at: string | null
          delivery_fee: number | null
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          minimum_order: number | null
          store_name: string
          store_slug: string
          theme_color: string | null
        }
        Insert: {
          allow_delivery?: boolean | null
          allow_pickup?: boolean | null
          banner_url?: string | null
          business_id?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          minimum_order?: number | null
          store_name: string
          store_slug: string
          theme_color?: string | null
        }
        Update: {
          allow_delivery?: boolean | null
          allow_pickup?: boolean | null
          banner_url?: string | null
          business_id?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          minimum_order?: number | null
          store_name?: string
          store_slug?: string
          theme_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_online_store_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_order_lines: {
        Row: {
          barcode: string | null
          business_id: string
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          received_qty: number | null
          sku: string | null
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          barcode?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          received_qty?: number | null
          sku?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Update: {
          barcode?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          received_qty?: number | null
          sku?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_outlet_inventory: {
        Row: {
          business_id: string
          case_cost: number | null
          cases_max_on_hand: number | null
          cases_on_hand: number | null
          cases_reorder_amount: number | null
          cases_reorder_level: number | null
          cases_reorder_limit: number | null
          id: string
          item_cost: number | null
          items_max_on_hand: number | null
          items_on_hand: number | null
          items_per_case: number | null
          items_reorder_amount: number | null
          items_reorder_level: number | null
          items_reorder_limit: number | null
          last_case_cost: number | null
          last_counted_at: string | null
          last_item_cost: number | null
          last_received_at: string | null
          outlet_id: string
          product_id: string
          reorder_rounding: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          case_cost?: number | null
          cases_max_on_hand?: number | null
          cases_on_hand?: number | null
          cases_reorder_amount?: number | null
          cases_reorder_level?: number | null
          cases_reorder_limit?: number | null
          id?: string
          item_cost?: number | null
          items_max_on_hand?: number | null
          items_on_hand?: number | null
          items_per_case?: number | null
          items_reorder_amount?: number | null
          items_reorder_level?: number | null
          items_reorder_limit?: number | null
          last_case_cost?: number | null
          last_counted_at?: string | null
          last_item_cost?: number | null
          last_received_at?: string | null
          outlet_id: string
          product_id: string
          reorder_rounding?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          case_cost?: number | null
          cases_max_on_hand?: number | null
          cases_on_hand?: number | null
          cases_reorder_amount?: number | null
          cases_reorder_level?: number | null
          cases_reorder_limit?: number | null
          id?: string
          item_cost?: number | null
          items_max_on_hand?: number | null
          items_on_hand?: number | null
          items_per_case?: number | null
          items_reorder_amount?: number | null
          items_reorder_level?: number | null
          items_reorder_limit?: number | null
          last_case_cost?: number | null
          last_counted_at?: string | null
          last_item_cost?: number | null
          last_received_at?: string | null
          outlet_id?: string
          product_id?: string
          reorder_rounding?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_outlet_inventory_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_outlet_role_permissions: {
        Row: {
          business_id: string
          created_at: string
          id: string
          outlet_id: string
          permission_overlay: Json
          pos_user_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          outlet_id: string
          permission_overlay?: Json
          pos_user_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          outlet_id?: string
          permission_overlay?: Json
          pos_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_outlet_role_permissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_role_permissions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_role_permissions_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_outlet_stock: {
        Row: {
          business_id: string | null
          id: string
          low_stock_threshold: number | null
          outlet_id: string | null
          product_id: string | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          low_stock_threshold?: number | null
          outlet_id?: string | null
          product_id?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          low_stock_threshold?: number | null
          outlet_id?: string | null
          product_id?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_outlet_stock_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_stock_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_outlet_tax_codes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          outlet_id: string
          rate_override: number | null
          tax_code_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          outlet_id: string
          rate_override?: number | null
          tax_code_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          outlet_id?: string
          rate_override?: number | null
          tax_code_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_outlet_tax_codes_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_outlet_tax_codes_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "pos_tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_outlets: {
        Row: {
          accepts_online_orders: boolean | null
          active: boolean | null
          address: string | null
          business_id: string | null
          code: string | null
          created_at: string | null
          delivery_enabled: boolean | null
          delivery_fee: number | null
          delivery_radius_km: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_global: boolean | null
          min_order_amount: number | null
          name: string
          online_order_throttle_per_15min: number | null
          online_ordering_note: string | null
          phone: string | null
          pickup_ready_estimate_minutes: number | null
          prep_time_minutes: number | null
          state_code: string | null
          stripe_account_id: string | null
          tax_inclusive_pricing: boolean
          tax_jurisdiction: string | null
          timezone: string | null
        }
        Insert: {
          accepts_online_orders?: boolean | null
          active?: boolean | null
          address?: string | null
          business_id?: string | null
          code?: string | null
          created_at?: string | null
          delivery_enabled?: boolean | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_global?: boolean | null
          min_order_amount?: number | null
          name: string
          online_order_throttle_per_15min?: number | null
          online_ordering_note?: string | null
          phone?: string | null
          pickup_ready_estimate_minutes?: number | null
          prep_time_minutes?: number | null
          state_code?: string | null
          stripe_account_id?: string | null
          tax_inclusive_pricing?: boolean
          tax_jurisdiction?: string | null
          timezone?: string | null
        }
        Update: {
          accepts_online_orders?: boolean | null
          active?: boolean | null
          address?: string | null
          business_id?: string | null
          code?: string | null
          created_at?: string | null
          delivery_enabled?: boolean | null
          delivery_fee?: number | null
          delivery_radius_km?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_global?: boolean | null
          min_order_amount?: number | null
          name?: string
          online_order_throttle_per_15min?: number | null
          online_ordering_note?: string | null
          phone?: string | null
          pickup_ready_estimate_minutes?: number | null
          prep_time_minutes?: number | null
          state_code?: string | null
          stripe_account_id?: string | null
          tax_inclusive_pricing?: boolean
          tax_jurisdiction?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_outlets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_parcel_tracking: {
        Row: {
          aria_evaluated_at: string | null
          aria_insight: string | null
          business_id: string
          carrier: string | null
          carrier_name: string | null
          created_at: string | null
          delivered_at: string | null
          destination: string | null
          direction: string
          estimated_delivery: string | null
          events: Json | null
          id: string
          label: string | null
          last_checked_at: string | null
          last_event_at: string | null
          manual_status: string | null
          notes: string | null
          order_reference: string | null
          origin: string | null
          predicted_late: boolean | null
          recipient_address: string | null
          recipient_city: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_postcode: string | null
          recipient_state: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          status_detail: string | null
          tracking_number: string
          updated_at: string | null
        }
        Insert: {
          aria_evaluated_at?: string | null
          aria_insight?: string | null
          business_id: string
          carrier?: string | null
          carrier_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          destination?: string | null
          direction?: string
          estimated_delivery?: string | null
          events?: Json | null
          id?: string
          label?: string | null
          last_checked_at?: string | null
          last_event_at?: string | null
          manual_status?: string | null
          notes?: string | null
          order_reference?: string | null
          origin?: string | null
          predicted_late?: boolean | null
          recipient_address?: string | null
          recipient_city?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_postcode?: string | null
          recipient_state?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          status_detail?: string | null
          tracking_number: string
          updated_at?: string | null
        }
        Update: {
          aria_evaluated_at?: string | null
          aria_insight?: string | null
          business_id?: string
          carrier?: string | null
          carrier_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          destination?: string | null
          direction?: string
          estimated_delivery?: string | null
          events?: Json | null
          id?: string
          label?: string | null
          last_checked_at?: string | null
          last_event_at?: string | null
          manual_status?: string | null
          notes?: string | null
          order_reference?: string | null
          origin?: string | null
          predicted_late?: boolean | null
          recipient_address?: string | null
          recipient_city?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_postcode?: string | null
          recipient_state?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          status_detail?: string | null
          tracking_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_parcel_tracking_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_parked_sales: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          items: Json
          label: string | null
          register_id: string | null
          subtotal: number | null
          total: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          items?: Json
          label?: string | null
          register_id?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          items?: Json
          label?: string | null
          register_id?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_parked_sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_parked_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_parked_sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_price_list_items: {
        Row: {
          id: string
          price: number
          price_list_id: string | null
          product_id: string | null
        }
        Insert: {
          id?: string
          price: number
          price_list_id?: string | null
          product_id?: string | null
        }
        Update: {
          id?: string
          price?: number
          price_list_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "pos_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_price_lists: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_group_ids: string[] | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          customer_group_ids?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          customer_group_ids?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_price_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_price_points: {
        Row: {
          cost: number | null
          cost_cents: number | null
          created_at: string | null
          id: string
          margin_pct: number | null
          margin_percent: number | null
          outlet_id: string | null
          price: number
          price_cents: number | null
          price_set_id: string | null
          price_set_name: string
          product_id: string | null
          quantity: number
        }
        Insert: {
          cost?: number | null
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          margin_pct?: number | null
          margin_percent?: number | null
          outlet_id?: string | null
          price: number
          price_cents?: number | null
          price_set_id?: string | null
          price_set_name?: string
          product_id?: string | null
          quantity?: number
        }
        Update: {
          cost?: number | null
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          margin_pct?: number | null
          margin_percent?: number | null
          outlet_id?: string | null
          price?: number
          price_cents?: number | null
          price_set_id?: string | null
          price_set_name?: string
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_price_points_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_price_points_price_set_id_fkey"
            columns: ["price_set_id"]
            isOneToOne: false
            referencedRelation: "pos_price_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_price_points_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_price_sets: {
        Row: {
          business_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          outlet_name: string | null
          sort_order: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          outlet_name?: string | null
          sort_order?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          outlet_name?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_price_sets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_barcodes: {
        Row: {
          barcode: string
          barcode_type: string | null
          business_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          notes: string | null
          product_id: string
        }
        Insert: {
          barcode: string
          barcode_type?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          product_id: string
        }
        Update: {
          barcode?: string
          barcode_type?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_batches: {
        Row: {
          batch_ref: string | null
          business_id: string
          created_at: string | null
          expiry_date: string | null
          expiry_tracked: boolean | null
          id: string
          outlet_id: string
          product_id: string
          purchase_order_id: string | null
          purchase_order_item_id: string | null
          quantity_received: number
          quantity_remaining: number
          source: string | null
          updated_at: string | null
        }
        Insert: {
          batch_ref?: string | null
          business_id: string
          created_at?: string | null
          expiry_date?: string | null
          expiry_tracked?: boolean | null
          id?: string
          outlet_id: string
          product_id: string
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity_received?: number
          quantity_remaining?: number
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_ref?: string | null
          business_id?: string
          created_at?: string | null
          expiry_date?: string | null
          expiry_tracked?: boolean | null
          id?: string
          outlet_id?: string
          product_id?: string
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity_received?: number
          quantity_remaining?: number
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_batches_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_batches_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_batches_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_costs: {
        Row: {
          case_cost: number | null
          case_quantity: number | null
          id: string
          item_cost: number | null
          last_case_cost: number | null
          last_item_cost: number | null
          outlet_id: string | null
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          case_cost?: number | null
          case_quantity?: number | null
          id?: string
          item_cost?: number | null
          last_case_cost?: number | null
          last_item_cost?: number | null
          outlet_id?: string | null
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          case_cost?: number | null
          case_quantity?: number | null
          id?: string
          item_cost?: number | null
          last_case_cost?: number | null
          last_item_cost?: number | null
          outlet_id?: string | null
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_costs_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_default_modifiers: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          modifier_id: string
          product_id: string
          quantity: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          modifier_id: string
          product_id: string
          quantity?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          modifier_id?: string
          product_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_default_modifiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_default_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "pos_modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_default_modifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_images: {
        Row: {
          alt_text: string | null
          business_id: string
          created_at: string | null
          id: string
          image_url: string
          is_primary: boolean | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          alt_text?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          image_url: string
          is_primary?: boolean | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          alt_text?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean | null
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_loyalty: {
        Row: {
          business_id: string
          earns_points: boolean | null
          eligible_for_rewards: boolean | null
          excluded_from_promotions: boolean | null
          id: string
          notes: string | null
          points_multiplier: number | null
          product_id: string
          updated_at: string | null
        }
        Insert: {
          business_id: string
          earns_points?: boolean | null
          eligible_for_rewards?: boolean | null
          excluded_from_promotions?: boolean | null
          id?: string
          notes?: string | null
          points_multiplier?: number | null
          product_id: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          earns_points?: boolean | null
          eligible_for_rewards?: boolean | null
          excluded_from_promotions?: boolean | null
          id?: string
          notes?: string | null
          points_multiplier?: number | null
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_loyalty_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_modifier_groups: {
        Row: {
          business_id: string
          created_at: string | null
          display_order: number | null
          group_id: string
          id: string
          override_max: number | null
          override_min: number | null
          override_required: boolean | null
          product_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          display_order?: number | null
          group_id: string
          id?: string
          override_max?: number | null
          override_min?: number | null
          override_required?: boolean | null
          product_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          display_order?: number | null
          group_id?: string
          id?: string
          override_max?: number | null
          override_min?: number | null
          override_required?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pos_modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_outlet_costs: {
        Row: {
          business_id: string | null
          case_cost_cents: number | null
          id: string
          item_cost_cents: number | null
          last_case_cost_cents: number | null
          last_item_cost_cents: number | null
          outlet_name: string
          product_id: string
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          case_cost_cents?: number | null
          id?: string
          item_cost_cents?: number | null
          last_case_cost_cents?: number | null
          last_item_cost_cents?: number | null
          outlet_name: string
          product_id: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          case_cost_cents?: number | null
          id?: string
          item_cost_cents?: number | null
          last_case_cost_cents?: number | null
          last_item_cost_cents?: number | null
          outlet_name?: string
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_outlet_costs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_prices: {
        Row: {
          business_id: string
          cost: number | null
          created_at: string | null
          id: string
          margin_pct: number | null
          outlet_id: string | null
          price: number
          price_set_id: string
          product_id: string
          quantity: number
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          business_id: string
          cost?: number | null
          created_at?: string | null
          id?: string
          margin_pct?: number | null
          outlet_id?: string | null
          price: number
          price_set_id: string
          product_id: string
          quantity?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          business_id?: string
          cost?: number | null
          created_at?: string | null
          id?: string
          margin_pct?: number | null
          outlet_id?: string | null
          price?: number
          price_set_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_prices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_prices_price_set_id_fkey"
            columns: ["price_set_id"]
            isOneToOne: false
            referencedRelation: "pos_price_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_revisions: {
        Row: {
          business_id: string | null
          changed_at: string | null
          changed_by: string | null
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          product_id: string
        }
        Insert: {
          business_id?: string | null
          changed_at?: string | null
          changed_by?: string | null
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id: string
        }
        Update: {
          business_id?: string | null
          changed_at?: string | null
          changed_by?: string | null
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_revisions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_suppliers: {
        Row: {
          active: boolean | null
          business_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          last_cost: number | null
          last_ordered_at: string | null
          product_id: string
          supplier_barcode: string | null
          supplier_id: string
          supplier_sku: string | null
        }
        Insert: {
          active?: boolean | null
          business_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_cost?: number | null
          last_ordered_at?: string | null
          product_id: string
          supplier_barcode?: string | null
          supplier_id: string
          supplier_sku?: string | null
        }
        Update: {
          active?: boolean | null
          business_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_cost?: number | null
          last_ordered_at?: string | null
          product_id?: string
          supplier_barcode?: string | null
          supplier_id?: string
          supplier_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_variant_groups: {
        Row: {
          affects_price: boolean
          business_id: string
          created_at: string | null
          id: string
          name: string
          price_map: Json
          product_id: string
          sort_order: number | null
          values: string[]
        }
        Insert: {
          affects_price?: boolean
          business_id: string
          created_at?: string | null
          id?: string
          name: string
          price_map?: Json
          product_id: string
          sort_order?: number | null
          values?: string[]
        }
        Update: {
          affects_price?: boolean
          business_id?: string
          created_at?: string | null
          id?: string
          name?: string
          price_map?: Json
          product_id?: string
          sort_order?: number | null
          values?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_variant_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_variant_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_variants: {
        Row: {
          barcode: string | null
          business_id: string | null
          colour: string | null
          cost_cents: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          price_cents: number | null
          product_id: string | null
          size: string | null
          sku: string | null
          sort_order: number | null
          stock_quantity: number | null
          track_inventory: boolean | null
          updated_at: string | null
          variant_group_id: string | null
        }
        Insert: {
          barcode?: string | null
          business_id?: string | null
          colour?: string | null
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          price_cents?: number | null
          product_id?: string | null
          size?: string | null
          sku?: string | null
          sort_order?: number | null
          stock_quantity?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          variant_group_id?: string | null
        }
        Update: {
          barcode?: string | null
          business_id?: string | null
          colour?: string | null
          cost_cents?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          price_cents?: number | null
          product_id?: string | null
          size?: string | null
          sku?: string | null
          sort_order?: number | null
          stock_quantity?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          variant_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_variants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_variants_variant_group_id_fkey"
            columns: ["variant_group_id"]
            isOneToOne: false
            referencedRelation: "pos_product_variant_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_production_plans: {
        Row: {
          actual_qty: number | null
          business_id: string
          created_at: string | null
          id: string
          notes: string | null
          plan_date: string
          planned_qty: number
          product_id: string
          product_name: string
          updated_at: string | null
        }
        Insert: {
          actual_qty?: number | null
          business_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_date: string
          planned_qty?: number
          product_id: string
          product_name: string
          updated_at?: string | null
        }
        Update: {
          actual_qty?: number | null
          business_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_date?: string
          planned_qty?: number
          product_id?: string
          product_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_production_plans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_products: {
        Row: {
          additional_tax_code_ids: string[] | null
          age_restricted: boolean | null
          agent_bundle_price: number | null
          agent_bundle_product_id: string | null
          agent_hidden: boolean | null
          agent_upsell_product_id: string | null
          alcohol_percentage: number | null
          allergens: string[]
          alm_product_id: string | null
          barcode: string | null
          bin_location: string | null
          brand: string | null
          brand_id: string | null
          builder_type: string | null
          business_id: string | null
          case_quantity: number | null
          cases_in_stock: number | null
          category: string | null
          category_id: string | null
          cbd_percentage: number | null
          colour: string | null
          container_type: string | null
          cost: number | null
          cost_price: number | null
          cost_price_cents: number | null
          costing_method: string | null
          country_of_origin: string | null
          course_type: string | null
          created_at: string | null
          current_stock: number | null
          deleted_at: string | null
          department: string | null
          description: string | null
          display_order: number | null
          expiry_date: string | null
          expiry_days: number | null
          external_updated_at: string | null
          family: string | null
          family_id: string | null
          featured: boolean | null
          fit_type: string | null
          gender: string | null
          grid_position: number | null
          gst_exempt: boolean | null
          id: string
          ilg_product_id: string | null
          image_source: string | null
          image_url: string | null
          ingredients: string | null
          is_active: boolean | null
          is_age_restricted: boolean | null
          is_gluten_free: boolean | null
          is_schedule_drug: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          is_weight_based: boolean
          items_per_case: number | null
          kds_station: string | null
          last_scored_at: string | null
          lightspeed_product_id: string | null
          low_stock_threshold: number | null
          loyalty_earn_rate: number | null
          loyalty_points_override: number | null
          margin_pct: number | null
          material: string | null
          max_discount_pct: number | null
          max_stock: number | null
          min_price: number | null
          name: string
          notes: string | null
          nutrition_info: Json | null
          online_description: string | null
          online_images: string[] | null
          performance_tier: string | null
          prep_time_seconds: number | null
          price: number
          price_cents: number | null
          price_per_kg: number | null
          purchase_uom: string | null
          purchase_uom_qty: number | null
          qty_backroom: number | null
          quality_hold: boolean | null
          reorder_notes: string | null
          reorder_point: number | null
          reorder_qty: number | null
          requires_script: boolean | null
          rrp: number | null
          schedule_level: string | null
          sell_uom: string | null
          serial_tracked: boolean | null
          shelf_capacity: number | null
          shelf_life_days: number | null
          shopify_product_id: string | null
          shopify_variant_id: string | null
          show_online: boolean | null
          size: string | null
          sku: string | null
          sort_order: number | null
          source: string | null
          square_item_id: string | null
          square_variation_id: string | null
          standard_drinks: number | null
          status: string | null
          stock_quantity: number | null
          stocktake_frozen: boolean | null
          storage_temp: string | null
          strain_type: string | null
          subdepartment: string | null
          supplier_barcode: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_sku: string | null
          tags: string[] | null
          target_stock: number | null
          tax_code_id: string | null
          tax_rate: number | null
          terminal_layout: string | null
          thc_percentage: number | null
          track_inventory: boolean | null
          track_stock: boolean | null
          unit: string | null
          updated_at: string | null
          vintage: number | null
          volume: number | null
          volume_unit: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          additional_tax_code_ids?: string[] | null
          age_restricted?: boolean | null
          agent_bundle_price?: number | null
          agent_bundle_product_id?: string | null
          agent_hidden?: boolean | null
          agent_upsell_product_id?: string | null
          alcohol_percentage?: number | null
          allergens?: string[]
          alm_product_id?: string | null
          barcode?: string | null
          bin_location?: string | null
          brand?: string | null
          brand_id?: string | null
          builder_type?: string | null
          business_id?: string | null
          case_quantity?: number | null
          cases_in_stock?: number | null
          category?: string | null
          category_id?: string | null
          cbd_percentage?: number | null
          colour?: string | null
          container_type?: string | null
          cost?: number | null
          cost_price?: number | null
          cost_price_cents?: number | null
          costing_method?: string | null
          country_of_origin?: string | null
          course_type?: string | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number | null
          expiry_date?: string | null
          expiry_days?: number | null
          external_updated_at?: string | null
          family?: string | null
          family_id?: string | null
          featured?: boolean | null
          fit_type?: string | null
          gender?: string | null
          grid_position?: number | null
          gst_exempt?: boolean | null
          id?: string
          ilg_product_id?: string | null
          image_source?: string | null
          image_url?: string | null
          ingredients?: string | null
          is_active?: boolean | null
          is_age_restricted?: boolean | null
          is_gluten_free?: boolean | null
          is_schedule_drug?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          is_weight_based?: boolean
          items_per_case?: number | null
          kds_station?: string | null
          last_scored_at?: string | null
          lightspeed_product_id?: string | null
          low_stock_threshold?: number | null
          loyalty_earn_rate?: number | null
          loyalty_points_override?: number | null
          margin_pct?: number | null
          material?: string | null
          max_discount_pct?: number | null
          max_stock?: number | null
          min_price?: number | null
          name: string
          notes?: string | null
          nutrition_info?: Json | null
          online_description?: string | null
          online_images?: string[] | null
          performance_tier?: string | null
          prep_time_seconds?: number | null
          price?: number
          price_cents?: number | null
          price_per_kg?: number | null
          purchase_uom?: string | null
          purchase_uom_qty?: number | null
          qty_backroom?: number | null
          quality_hold?: boolean | null
          reorder_notes?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          requires_script?: boolean | null
          rrp?: number | null
          schedule_level?: string | null
          sell_uom?: string | null
          serial_tracked?: boolean | null
          shelf_capacity?: number | null
          shelf_life_days?: number | null
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          show_online?: boolean | null
          size?: string | null
          sku?: string | null
          sort_order?: number | null
          source?: string | null
          square_item_id?: string | null
          square_variation_id?: string | null
          standard_drinks?: number | null
          status?: string | null
          stock_quantity?: number | null
          stocktake_frozen?: boolean | null
          storage_temp?: string | null
          strain_type?: string | null
          subdepartment?: string | null
          supplier_barcode?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_sku?: string | null
          tags?: string[] | null
          target_stock?: number | null
          tax_code_id?: string | null
          tax_rate?: number | null
          terminal_layout?: string | null
          thc_percentage?: number | null
          track_inventory?: boolean | null
          track_stock?: boolean | null
          unit?: string | null
          updated_at?: string | null
          vintage?: number | null
          volume?: number | null
          volume_unit?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          additional_tax_code_ids?: string[] | null
          age_restricted?: boolean | null
          agent_bundle_price?: number | null
          agent_bundle_product_id?: string | null
          agent_hidden?: boolean | null
          agent_upsell_product_id?: string | null
          alcohol_percentage?: number | null
          allergens?: string[]
          alm_product_id?: string | null
          barcode?: string | null
          bin_location?: string | null
          brand?: string | null
          brand_id?: string | null
          builder_type?: string | null
          business_id?: string | null
          case_quantity?: number | null
          cases_in_stock?: number | null
          category?: string | null
          category_id?: string | null
          cbd_percentage?: number | null
          colour?: string | null
          container_type?: string | null
          cost?: number | null
          cost_price?: number | null
          cost_price_cents?: number | null
          costing_method?: string | null
          country_of_origin?: string | null
          course_type?: string | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number | null
          expiry_date?: string | null
          expiry_days?: number | null
          external_updated_at?: string | null
          family?: string | null
          family_id?: string | null
          featured?: boolean | null
          fit_type?: string | null
          gender?: string | null
          grid_position?: number | null
          gst_exempt?: boolean | null
          id?: string
          ilg_product_id?: string | null
          image_source?: string | null
          image_url?: string | null
          ingredients?: string | null
          is_active?: boolean | null
          is_age_restricted?: boolean | null
          is_gluten_free?: boolean | null
          is_schedule_drug?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          is_weight_based?: boolean
          items_per_case?: number | null
          kds_station?: string | null
          last_scored_at?: string | null
          lightspeed_product_id?: string | null
          low_stock_threshold?: number | null
          loyalty_earn_rate?: number | null
          loyalty_points_override?: number | null
          margin_pct?: number | null
          material?: string | null
          max_discount_pct?: number | null
          max_stock?: number | null
          min_price?: number | null
          name?: string
          notes?: string | null
          nutrition_info?: Json | null
          online_description?: string | null
          online_images?: string[] | null
          performance_tier?: string | null
          prep_time_seconds?: number | null
          price?: number
          price_cents?: number | null
          price_per_kg?: number | null
          purchase_uom?: string | null
          purchase_uom_qty?: number | null
          qty_backroom?: number | null
          quality_hold?: boolean | null
          reorder_notes?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          requires_script?: boolean | null
          rrp?: number | null
          schedule_level?: string | null
          sell_uom?: string | null
          serial_tracked?: boolean | null
          shelf_capacity?: number | null
          shelf_life_days?: number | null
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          show_online?: boolean | null
          size?: string | null
          sku?: string | null
          sort_order?: number | null
          source?: string | null
          square_item_id?: string | null
          square_variation_id?: string | null
          standard_drinks?: number | null
          status?: string | null
          stock_quantity?: number | null
          stocktake_frozen?: boolean | null
          storage_temp?: string | null
          strain_type?: string | null
          subdepartment?: string | null
          supplier_barcode?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_sku?: string | null
          tags?: string[] | null
          target_stock?: number | null
          tax_code_id?: string | null
          tax_rate?: number | null
          terminal_layout?: string | null
          thc_percentage?: number | null
          track_inventory?: boolean | null
          track_stock?: boolean | null
          unit?: string | null
          updated_at?: string | null
          vintage?: number | null
          volume?: number | null
          volume_unit?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_products_agent_bundle_product_id_fkey"
            columns: ["agent_bundle_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_products_agent_upsell_product_id_fkey"
            columns: ["agent_upsell_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_products_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "pos_tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_promotion_redemptions: {
        Row: {
          amount_off: number
          business_id: string
          code_used: string | null
          created_at: string
          customer_id: string | null
          id: string
          pos_user_id: string | null
          promotion_id: string
          promotion_name: string
          promotion_type: string
          sale_id: string | null
          was_auto: boolean
        }
        Insert: {
          amount_off: number
          business_id: string
          code_used?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          pos_user_id?: string | null
          promotion_id: string
          promotion_name: string
          promotion_type: string
          sale_id?: string | null
          was_auto?: boolean
        }
        Update: {
          amount_off?: number
          business_id?: string
          code_used?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          pos_user_id?: string | null
          promotion_id?: string
          promotion_name?: string
          promotion_type?: string
          sale_id?: string | null
          was_auto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pos_promotion_redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotion_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotion_redemptions_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotion_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "pos_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotion_redemptions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_promotions: {
        Row: {
          active: boolean
          active_days: number[] | null
          active_hour_end: number | null
          active_hour_start: number | null
          applies_to: string | null
          bundle_price: number | null
          business_id: string | null
          buy_quantity: number | null
          category_id: string | null
          category_ids: Json
          created_at: string | null
          current_uses: number
          customer_group_id: string | null
          discount_amount: number | null
          discount_percent: number | null
          discount_type: string | null
          ends_at: string | null
          exclude_discounted: boolean
          get_quantity: number | null
          id: string
          is_active: boolean | null
          max_total_uses: number | null
          max_uses_per_customer: number | null
          max_uses_per_day: number | null
          min_customer_lifetime_spend: number | null
          min_customer_visits: number | null
          min_quantity: number | null
          min_spend: number | null
          name: string
          notes: string | null
          product_id: string | null
          product_ids: Json
          promotion_type: string | null
          requires_code: string | null
          stack_priority: number
          stacks_with_others: boolean | null
          starts_at: string | null
          type: string | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
          value: number | null
        }
        Insert: {
          active?: boolean
          active_days?: number[] | null
          active_hour_end?: number | null
          active_hour_start?: number | null
          applies_to?: string | null
          bundle_price?: number | null
          business_id?: string | null
          buy_quantity?: number | null
          category_id?: string | null
          category_ids?: Json
          created_at?: string | null
          current_uses?: number
          customer_group_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: string | null
          ends_at?: string | null
          exclude_discounted?: boolean
          get_quantity?: number | null
          id?: string
          is_active?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          max_uses_per_day?: number | null
          min_customer_lifetime_spend?: number | null
          min_customer_visits?: number | null
          min_quantity?: number | null
          min_spend?: number | null
          name: string
          notes?: string | null
          product_id?: string | null
          product_ids?: Json
          promotion_type?: string | null
          requires_code?: string | null
          stack_priority?: number
          stacks_with_others?: boolean | null
          starts_at?: string | null
          type?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          value?: number | null
        }
        Update: {
          active?: boolean
          active_days?: number[] | null
          active_hour_end?: number | null
          active_hour_start?: number | null
          applies_to?: string | null
          bundle_price?: number | null
          business_id?: string | null
          buy_quantity?: number | null
          category_id?: string | null
          category_ids?: Json
          created_at?: string | null
          current_uses?: number
          customer_group_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          discount_type?: string | null
          ends_at?: string | null
          exclude_discounted?: boolean
          get_quantity?: number | null
          id?: string
          is_active?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          max_uses_per_day?: number | null
          min_customer_lifetime_spend?: number | null
          min_customer_visits?: number | null
          min_quantity?: number | null
          min_spend?: number | null
          name?: string
          notes?: string | null
          product_id?: string | null
          product_ids?: Json
          promotion_type?: string | null
          requires_code?: string | null
          stack_priority?: number
          stacks_with_others?: boolean | null
          starts_at?: string | null
          type?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotions_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "pos_customer_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchase_order_items: {
        Row: {
          expiry_date: string | null
          expiry_tracked: boolean | null
          id: string
          line_total: number | null
          order_id: string | null
          product_id: string | null
          product_name: string
          quantity_ordered: number | null
          quantity_partial: number | null
          quantity_received: number | null
          receive_status: string | null
          received_at: string | null
          received_by: string | null
          unit_cost: number | null
        }
        Insert: {
          expiry_date?: string | null
          expiry_tracked?: boolean | null
          id?: string
          line_total?: number | null
          order_id?: string | null
          product_id?: string | null
          product_name: string
          quantity_ordered?: number | null
          quantity_partial?: number | null
          quantity_received?: number | null
          receive_status?: string | null
          received_at?: string | null
          received_by?: string | null
          unit_cost?: number | null
        }
        Update: {
          expiry_date?: string | null
          expiry_tracked?: boolean | null
          id?: string
          line_total?: number | null
          order_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity_ordered?: number | null
          quantity_partial?: number | null
          quantity_received?: number | null
          receive_status?: string | null
          received_at?: string | null
          received_by?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchase_order_lines: {
        Row: {
          barcode: string | null
          business_id: string
          confirmed_price: number | null
          created_at: string | null
          id: string
          last_purchase_price: number | null
          line_total: number | null
          notes: string | null
          open_market_high: number | null
          open_market_low: number | null
          open_market_source: string | null
          order_id: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          quantity: number | null
          quantity_cases: number | null
          quantity_items: number | null
          sku: string | null
          sort_order: number | null
          suggested_price: number | null
          supplier_id: string | null
          supplier_name: string | null
          total_cost: number | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          business_id: string
          confirmed_price?: number | null
          created_at?: string | null
          id?: string
          last_purchase_price?: number | null
          line_total?: number | null
          notes?: string | null
          open_market_high?: number | null
          open_market_low?: number | null
          open_market_source?: string | null
          order_id: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number | null
          quantity_cases?: number | null
          quantity_items?: number | null
          sku?: string | null
          sort_order?: number | null
          suggested_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          business_id?: string
          confirmed_price?: number | null
          created_at?: string | null
          id?: string
          last_purchase_price?: number | null
          line_total?: number | null
          notes?: string | null
          open_market_high?: number | null
          open_market_low?: number | null
          open_market_source?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number | null
          quantity_cases?: number | null
          quantity_items?: number | null
          sku?: string | null
          sort_order?: number | null
          suggested_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchase_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchase_orders: {
        Row: {
          business_id: string | null
          created_at: string | null
          created_by: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_number: string | null
          receive_notes: string | null
          received_at: string | null
          received_by: string | null
          source: string | null
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          tax_amount: number | null
          total: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          receive_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          source?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          tax_amount?: number | null
          total?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          receive_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          source?: string | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          tax_amount?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_receipt_scans: {
        Row: {
          business_id: string
          created_at: string | null
          grand_total: number | null
          gst_amount: number | null
          id: string
          image_path: string | null
          invoice_date: string | null
          invoice_number: string | null
          line_items: Json | null
          scan_source: string | null
          supplier_name: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          grand_total?: number | null
          gst_amount?: number | null
          id?: string
          image_path?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          scan_source?: string | null
          supplier_name?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          grand_total?: number | null
          gst_amount?: number | null
          id?: string
          image_path?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          line_items?: Json | null
          scan_source?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_receipt_scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_receipt_templates: {
        Row: {
          background_color: string | null
          business_id: string | null
          canvas_height: number | null
          canvas_width: number | null
          components: Json | null
          created_at: string | null
          elements: Json | null
          footer_text: string | null
          for_type: string | null
          header_text: string | null
          id: string
          is_default: boolean | null
          logo_url: string | null
          name: string
          outlet_id: string | null
          paper_cut_mode: string | null
          show_loyalty_balance: boolean | null
          show_qr_code: boolean | null
          show_tax_breakdown: boolean | null
          template_name: string | null
          type: string | null
          updated_at: string | null
          width_mm: number | null
        }
        Insert: {
          background_color?: string | null
          business_id?: string | null
          canvas_height?: number | null
          canvas_width?: number | null
          components?: Json | null
          created_at?: string | null
          elements?: Json | null
          footer_text?: string | null
          for_type?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          name: string
          outlet_id?: string | null
          paper_cut_mode?: string | null
          show_loyalty_balance?: boolean | null
          show_qr_code?: boolean | null
          show_tax_breakdown?: boolean | null
          template_name?: string | null
          type?: string | null
          updated_at?: string | null
          width_mm?: number | null
        }
        Update: {
          background_color?: string | null
          business_id?: string | null
          canvas_height?: number | null
          canvas_width?: number | null
          components?: Json | null
          created_at?: string | null
          elements?: Json | null
          footer_text?: string | null
          for_type?: string | null
          header_text?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          name?: string
          outlet_id?: string | null
          paper_cut_mode?: string | null
          show_loyalty_balance?: boolean | null
          show_qr_code?: boolean | null
          show_tax_breakdown?: boolean | null
          template_name?: string | null
          type?: string | null
          updated_at?: string | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_receipt_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_registers: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          outlet_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          outlet_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          outlet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_registers_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_reorder_schedules: {
        Row: {
          business_id: string
          created_at: string | null
          day_of_week: number
          enabled: boolean | null
          hour_utc: number
          id: string
          last_order_id: string | null
          last_run_at: string | null
          lookback_days: number | null
          min_stock_threshold_days: number | null
          notify_email: boolean | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          day_of_week?: number
          enabled?: boolean | null
          hour_utc?: number
          id?: string
          last_order_id?: string | null
          last_run_at?: string | null
          lookback_days?: number | null
          min_stock_threshold_days?: number | null
          notify_email?: boolean | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          day_of_week?: number
          enabled?: boolean | null
          hour_utc?: number
          id?: string
          last_order_id?: string | null
          last_run_at?: string | null
          lookback_days?: number | null
          min_stock_threshold_days?: number | null
          notify_email?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_reorder_schedules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_reorder_schedules_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "pos_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_reorder_settings: {
        Row: {
          business_id: string
          created_at: string | null
          exclude_product_ids: string[] | null
          id: string
          min_daily_sales: number | null
          min_stock_threshold: number | null
          order_weeks_cover: number | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          exclude_product_ids?: string[] | null
          id?: string
          min_daily_sales?: number | null
          min_stock_threshold?: number | null
          order_weeks_cover?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          exclude_product_ids?: string[] | null
          id?: string
          min_daily_sales?: number | null
          min_stock_threshold?: number | null
          order_weeks_cover?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_reorder_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_return_lines: {
        Row: {
          condition: string
          created_at: string
          id: string
          line_refund: number
          original_item_id: string
          product_id: string | null
          product_name: string
          quantity: number
          restock: boolean
          return_id: string
          unit_price: number
        }
        Insert: {
          condition?: string
          created_at?: string
          id?: string
          line_refund: number
          original_item_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          restock?: boolean
          return_id: string
          unit_price: number
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          line_refund?: number
          original_item_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          restock?: boolean
          return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_return_lines_original_item_id_fkey"
            columns: ["original_item_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_return_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "pos_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_return_policies: {
        Row: {
          allowed_conditions: string[]
          allowed_refund_methods: string[]
          business_id: string
          category_id: string | null
          created_at: string
          id: string
          requires_photo: boolean
          return_window_days: number
          updated_at: string
        }
        Insert: {
          allowed_conditions?: string[]
          allowed_refund_methods?: string[]
          business_id: string
          category_id?: string | null
          created_at?: string
          id?: string
          requires_photo?: boolean
          return_window_days?: number
          updated_at?: string
        }
        Update: {
          allowed_conditions?: string[]
          allowed_refund_methods?: string[]
          business_id?: string
          category_id?: string | null
          created_at?: string
          id?: string
          requires_photo?: boolean
          return_window_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_return_policies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_return_policies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_returns: {
        Row: {
          business_id: string
          created_at: string
          exchange_sale_id: string | null
          id: string
          manager_approved_by: string | null
          original_sale_id: string
          processed_by: string | null
          reason_code: string
          reason_note: string | null
          refund_method: string
          return_number: string
          return_sale_id: string | null
          status: string
          store_credit_id: string | null
          total_refund: number
        }
        Insert: {
          business_id: string
          created_at?: string
          exchange_sale_id?: string | null
          id?: string
          manager_approved_by?: string | null
          original_sale_id: string
          processed_by?: string | null
          reason_code: string
          reason_note?: string | null
          refund_method: string
          return_number: string
          return_sale_id?: string | null
          status?: string
          store_credit_id?: string | null
          total_refund?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          exchange_sale_id?: string | null
          id?: string
          manager_approved_by?: string | null
          original_sale_id?: string
          processed_by?: string | null
          reason_code?: string
          reason_note?: string | null
          refund_method?: string
          return_number?: string
          return_sale_id?: string | null
          status?: string
          store_credit_id?: string | null
          total_refund?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_exchange_sale_id_fkey"
            columns: ["exchange_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_manager_approved_by_fkey"
            columns: ["manager_approved_by"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_return_sale_id_fkey"
            columns: ["return_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_returns_store_credit_id_fkey"
            columns: ["store_credit_id"]
            isOneToOne: false
            referencedRelation: "pos_store_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_review_requests: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          error_msg: string | null
          id: string
          message_text: string | null
          review_rating: number | null
          review_received: boolean | null
          sale_id: string | null
          send_status: string
          sent_at: string | null
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_msg?: string | null
          id?: string
          message_text?: string | null
          review_rating?: number | null
          review_received?: boolean | null
          sale_id?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_msg?: string | null
          id?: string
          message_text?: string | null
          review_rating?: number | null
          review_received?: boolean | null
          sale_id?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_review_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_review_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_review_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_roster_templates: {
        Row: {
          approved_at: string | null
          aria_reasoning: string | null
          business_id: string
          created_at: string | null
          id: string
          name: string
          published_at: string | null
          shifts: Json | null
          status: string | null
          total_cost_cents: number | null
          total_hours: number | null
          week_starting: string
        }
        Insert: {
          approved_at?: string | null
          aria_reasoning?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          name?: string
          published_at?: string | null
          shifts?: Json | null
          status?: string | null
          total_cost_cents?: number | null
          total_hours?: number | null
          week_starting: string
        }
        Update: {
          approved_at?: string | null
          aria_reasoning?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          name?: string
          published_at?: string | null
          shifts?: Json | null
          status?: string | null
          total_cost_cents?: number | null
          total_hours?: number | null
          week_starting?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_roster_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_rosters: {
        Row: {
          approved_by: string | null
          aria_reasoning: string | null
          business_id: string
          created_at: string | null
          generated_by_agent: boolean | null
          id: string
          outlet_id: string
          published: boolean | null
          published_at: string | null
          shifts: Json
          status: string
          total_cost_cents: number | null
          total_hours: number | null
          updated_at: string
          week_start: string
        }
        Insert: {
          approved_by?: string | null
          aria_reasoning?: string | null
          business_id: string
          created_at?: string | null
          generated_by_agent?: boolean | null
          id?: string
          outlet_id: string
          published?: boolean | null
          published_at?: string | null
          shifts: Json
          status?: string
          total_cost_cents?: number | null
          total_hours?: number | null
          updated_at?: string
          week_start: string
        }
        Update: {
          approved_by?: string | null
          aria_reasoning?: string | null
          business_id?: string
          created_at?: string | null
          generated_by_agent?: boolean | null
          id?: string
          outlet_id?: string
          published?: boolean | null
          published_at?: string | null
          shifts?: Json
          status?: string
          total_cost_cents?: number | null
          total_hours?: number | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      pos_sale_edits: {
        Row: {
          action: string
          business_id: string
          client_info: Json | null
          edited_at: string | null
          edited_by: string | null
          field_changed: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          sale_id: string | null
        }
        Insert: {
          action: string
          business_id: string
          client_info?: Json | null
          edited_at?: string | null
          edited_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          sale_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          client_info?: Json | null
          edited_at?: string | null
          edited_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_edits_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          batch_id: string | null
          business_id: string | null
          cost_price: number | null
          course: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          discount_percent: number | null
          expiry_date: string | null
          expiry_was_new: boolean | null
          id: string
          item_notes: string | null
          line_total: number
          margin_percent: number | null
          modifiers: Json | null
          notes: string | null
          original_unit_price: number | null
          price_overridden: boolean
          price_override_at: string | null
          price_override_by: string | null
          price_override_reason: string | null
          price_point_id: string | null
          product_id: string | null
          product_name: string
          product_sku: string | null
          quantity: number
          returned_quantity: number
          sale_id: string | null
          seat_number: number | null
          tax_breakdown: Json | null
          tax_code_id: string | null
          tax_exempt_reason: string | null
          tax_exempted: boolean
          tax_rate: number | null
          unit_price: number
          variant_id: string | null
          variant_label: string | null
          variant_name: string | null
        }
        Insert: {
          batch_id?: string | null
          business_id?: string | null
          cost_price?: number | null
          course?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_percent?: number | null
          expiry_date?: string | null
          expiry_was_new?: boolean | null
          id?: string
          item_notes?: string | null
          line_total: number
          margin_percent?: number | null
          modifiers?: Json | null
          notes?: string | null
          original_unit_price?: number | null
          price_overridden?: boolean
          price_override_at?: string | null
          price_override_by?: string | null
          price_override_reason?: string | null
          price_point_id?: string | null
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          quantity?: number
          returned_quantity?: number
          sale_id?: string | null
          seat_number?: number | null
          tax_breakdown?: Json | null
          tax_code_id?: string | null
          tax_exempt_reason?: string | null
          tax_exempted?: boolean
          tax_rate?: number | null
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
          variant_name?: string | null
        }
        Update: {
          batch_id?: string | null
          business_id?: string | null
          cost_price?: number | null
          course?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_percent?: number | null
          expiry_date?: string | null
          expiry_was_new?: boolean | null
          id?: string
          item_notes?: string | null
          line_total?: number
          margin_percent?: number | null
          modifiers?: Json | null
          notes?: string | null
          original_unit_price?: number | null
          price_overridden?: boolean
          price_override_at?: string | null
          price_override_by?: string | null
          price_override_reason?: string | null
          price_point_id?: string | null
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number
          returned_quantity?: number
          sale_id?: string | null
          seat_number?: number | null
          tax_breakdown?: Json | null
          tax_code_id?: string | null
          tax_exempt_reason?: string | null
          tax_exempted?: boolean
          tax_rate?: number | null
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "pos_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "pos_tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_keys: {
        Row: {
          business_id: string | null
          category_id: string | null
          category_tab: string | null
          color: string | null
          color_token: string | null
          created_at: string | null
          display_order: number | null
          function_name: string | null
          icon: string | null
          id: string
          label: string
          position: number | null
          product_id: string | null
          type: string | null
        }
        Insert: {
          business_id?: string | null
          category_id?: string | null
          category_tab?: string | null
          color?: string | null
          color_token?: string | null
          created_at?: string | null
          display_order?: number | null
          function_name?: string | null
          icon?: string | null
          id?: string
          label: string
          position?: number | null
          product_id?: string | null
          type?: string | null
        }
        Update: {
          business_id?: string | null
          category_id?: string | null
          category_tab?: string | null
          color?: string | null
          color_token?: string | null
          created_at?: string | null
          display_order?: number | null
          function_name?: string | null
          icon?: string | null
          id?: string
          label?: string
          position?: number | null
          product_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_keys_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_keys_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          id: string
          method: string
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          id?: string
          method: string
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          id?: string
          method?: string
          reference?: string | null
          sale_id?: string
        }
        Relationships: []
      }
      pos_sale_returns: {
        Row: {
          business_id: string
          id: string
          items_returned: Json | null
          original_sale_id: string | null
          reason: string | null
          refund_method: string | null
          return_sale_id: string | null
          returned_at: string | null
          returned_by: string | null
          total_refunded: number
        }
        Insert: {
          business_id: string
          id?: string
          items_returned?: Json | null
          original_sale_id?: string | null
          reason?: string | null
          refund_method?: string | null
          return_sale_id?: string | null
          returned_at?: string | null
          returned_by?: string | null
          total_refunded: number
        }
        Update: {
          business_id?: string
          id?: string
          items_returned?: Json | null
          original_sale_id?: string | null
          reason?: string | null
          refund_method?: string | null
          return_sale_id?: string | null
          returned_at?: string | null
          returned_by?: string | null
          total_refunded?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_returns_return_sale_id_fkey"
            columns: ["return_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_splits: {
        Row: {
          ai_reasoning: string | null
          ai_suggested: boolean | null
          amount_paid: number
          business_id: string
          created_at: string
          customer_id: string | null
          group_id: string | null
          group_member_id: string | null
          id: string
          paid_at: string | null
          person_label: string | null
          receipt_email: string | null
          receipt_method: string | null
          receipt_phone: string | null
          receipt_sent_at: string | null
          sale_id: string
          split_method: string
          split_number: number
          status: string
          subtotal: number
          tax_amount: number
          tip_amount: number
          tip_type: string | null
          tip_value: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_suggested?: boolean | null
          amount_paid?: number
          business_id: string
          created_at?: string
          customer_id?: string | null
          group_id?: string | null
          group_member_id?: string | null
          id?: string
          paid_at?: string | null
          person_label?: string | null
          receipt_email?: string | null
          receipt_method?: string | null
          receipt_phone?: string | null
          receipt_sent_at?: string | null
          sale_id: string
          split_method: string
          split_number: number
          status?: string
          subtotal?: number
          tax_amount?: number
          tip_amount?: number
          tip_type?: string | null
          tip_value?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_suggested?: boolean | null
          amount_paid?: number
          business_id?: string
          created_at?: string
          customer_id?: string | null
          group_id?: string | null
          group_member_id?: string | null
          id?: string
          paid_at?: string | null
          person_label?: string | null
          receipt_email?: string | null
          receipt_method?: string | null
          receipt_phone?: string | null
          receipt_sent_at?: string | null
          sale_id?: string
          split_method?: string
          split_number?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          tip_amount?: number
          tip_type?: string | null
          tip_value?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_splits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_splits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_splits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "split_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_splits_group_member_id_fkey"
            columns: ["group_member_id"]
            isOneToOne: false
            referencedRelation: "split_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_splits_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          age_verified: boolean | null
          business_id: string | null
          cash_tendered: number | null
          change_given: number | null
          cover_count: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          direct_deposit_ref: string | null
          discount_amount: number | null
          discount_total: number | null
          external_notes: string | null
          gift_card_amount: number | null
          gift_card_code: string | null
          gift_card_id: string | null
          id: string
          idempotency_key: string | null
          internal_comment: string | null
          is_training: boolean | null
          kds_sent: boolean | null
          last_edited_at: string | null
          last_edited_by: string | null
          lightspeed_order_id: string | null
          loyalty_value: number | null
          modifiers_data: Json | null
          notes: string | null
          order_notes: string | null
          order_type: string | null
          original_sale_id: string | null
          outlet_id: string | null
          parent_sale_id: string | null
          payment_method: string | null
          payment_subtype: string | null
          pickup_time: string | null
          points_earned: number | null
          points_redeemed: number | null
          pos_user_id: string | null
          register_id: string | null
          sale_completed_at: string | null
          sale_number: string | null
          savings_total: number | null
          served_by: string | null
          session_id: string | null
          shopify_order_id: string | null
          source: string | null
          split_card: number | null
          split_cash: number | null
          square_order_id: string | null
          status: string | null
          subtotal: number | null
          table_id: string | null
          tax_amount: number | null
          tax_breakdown: Json | null
          tax_total: number | null
          total_amount: number
          xero_invoice_id: string | null
          xero_synced: boolean | null
        }
        Insert: {
          age_verified?: boolean | null
          business_id?: string | null
          cash_tendered?: number | null
          change_given?: number | null
          cover_count?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          direct_deposit_ref?: string | null
          discount_amount?: number | null
          discount_total?: number | null
          external_notes?: string | null
          gift_card_amount?: number | null
          gift_card_code?: string | null
          gift_card_id?: string | null
          id?: string
          idempotency_key?: string | null
          internal_comment?: string | null
          is_training?: boolean | null
          kds_sent?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          lightspeed_order_id?: string | null
          loyalty_value?: number | null
          modifiers_data?: Json | null
          notes?: string | null
          order_notes?: string | null
          order_type?: string | null
          original_sale_id?: string | null
          outlet_id?: string | null
          parent_sale_id?: string | null
          payment_method?: string | null
          payment_subtype?: string | null
          pickup_time?: string | null
          points_earned?: number | null
          points_redeemed?: number | null
          pos_user_id?: string | null
          register_id?: string | null
          sale_completed_at?: string | null
          sale_number?: string | null
          savings_total?: number | null
          served_by?: string | null
          session_id?: string | null
          shopify_order_id?: string | null
          source?: string | null
          split_card?: number | null
          split_cash?: number | null
          square_order_id?: string | null
          status?: string | null
          subtotal?: number | null
          table_id?: string | null
          tax_amount?: number | null
          tax_breakdown?: Json | null
          tax_total?: number | null
          total_amount?: number
          xero_invoice_id?: string | null
          xero_synced?: boolean | null
        }
        Update: {
          age_verified?: boolean | null
          business_id?: string | null
          cash_tendered?: number | null
          change_given?: number | null
          cover_count?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          direct_deposit_ref?: string | null
          discount_amount?: number | null
          discount_total?: number | null
          external_notes?: string | null
          gift_card_amount?: number | null
          gift_card_code?: string | null
          gift_card_id?: string | null
          id?: string
          idempotency_key?: string | null
          internal_comment?: string | null
          is_training?: boolean | null
          kds_sent?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          lightspeed_order_id?: string | null
          loyalty_value?: number | null
          modifiers_data?: Json | null
          notes?: string | null
          order_notes?: string | null
          order_type?: string | null
          original_sale_id?: string | null
          outlet_id?: string | null
          parent_sale_id?: string | null
          payment_method?: string | null
          payment_subtype?: string | null
          pickup_time?: string | null
          points_earned?: number | null
          points_redeemed?: number | null
          pos_user_id?: string | null
          register_id?: string | null
          sale_completed_at?: string | null
          sale_number?: string | null
          savings_total?: number | null
          served_by?: string | null
          session_id?: string | null
          shopify_order_id?: string | null
          source?: string | null
          split_card?: number | null
          split_cash?: number | null
          square_order_id?: string | null
          status?: string | null
          subtotal?: number | null
          table_id?: string | null
          tax_amount?: number | null
          tax_breakdown?: Json | null
          tax_total?: number | null
          total_amount?: number
          xero_invoice_id?: string | null
          xero_synced?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_scheduled_cost_changes: {
        Row: {
          applied: boolean | null
          business_id: string
          created_at: string | null
          effective_date: string
          id: string
          new_cost: number
          product_id: string
        }
        Insert: {
          applied?: boolean | null
          business_id: string
          created_at?: string | null
          effective_date: string
          id?: string
          new_cost: number
          product_id: string
        }
        Update: {
          applied?: boolean | null
          business_id?: string
          created_at?: string | null
          effective_date?: string
          id?: string
          new_cost?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_scheduled_cost_changes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_scheduled_cost_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_scheduled_price_changes: {
        Row: {
          applied: boolean | null
          applied_at: string | null
          business_id: string
          created_at: string | null
          effective_date: string
          ends_at: string | null
          id: string
          label: string | null
          new_price: number
          original_price: number | null
          print_ticket: boolean | null
          product_id: string
          reason: string | null
          status: string
        }
        Insert: {
          applied?: boolean | null
          applied_at?: string | null
          business_id: string
          created_at?: string | null
          effective_date: string
          ends_at?: string | null
          id?: string
          label?: string | null
          new_price: number
          original_price?: number | null
          print_ticket?: boolean | null
          product_id: string
          reason?: string | null
          status?: string
        }
        Update: {
          applied?: boolean | null
          applied_at?: string | null
          business_id?: string
          created_at?: string | null
          effective_date?: string
          ends_at?: string | null
          id?: string
          label?: string | null
          new_price?: number
          original_price?: number | null
          print_ticket?: boolean | null
          product_id?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_scheduled_price_changes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_scheduled_price_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_self_checkout_carts: {
        Row: {
          business_id: string
          created_at: string | null
          customer_session_token: string | null
          expires_at: string | null
          finished_at: string | null
          id: string
          items: Json
          loyalty_customer_id: string | null
          redeemed_at: string | null
          redeemed_sale_id: string | null
          status: string
          subtotal_cents: number
          token: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          customer_session_token?: string | null
          expires_at?: string | null
          finished_at?: string | null
          id?: string
          items?: Json
          loyalty_customer_id?: string | null
          redeemed_at?: string | null
          redeemed_sale_id?: string | null
          status?: string
          subtotal_cents?: number
          token: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          customer_session_token?: string | null
          expires_at?: string | null
          finished_at?: string | null
          id?: string
          items?: Json
          loyalty_customer_id?: string | null
          redeemed_at?: string | null
          redeemed_sale_id?: string | null
          status?: string
          subtotal_cents?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_self_checkout_carts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_self_checkout_carts_loyalty_customer_id_fkey"
            columns: ["loyalty_customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_self_checkout_carts_redeemed_sale_id_fkey"
            columns: ["redeemed_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_settings: {
        Row: {
          abn: string | null
          accept_card: boolean | null
          accept_cash: boolean | null
          accept_split: boolean | null
          accepted_payment_methods: Json | null
          address: string | null
          apply_gst_to_all: boolean | null
          business_abn: string | null
          business_address: string | null
          business_id: string | null
          business_phone: string | null
          business_website: string | null
          card_surcharge_percent: number | null
          cash_rounding: boolean | null
          created_at: string | null
          default_payment_method: string | null
          gst_inclusive: boolean | null
          gst_rate: number | null
          id: string
          loyalty_birthday_bonus: number | null
          loyalty_enabled: boolean | null
          loyalty_min_redemption: number | null
          loyalty_points_per_dollar: number | null
          loyalty_points_per_dollar_value: number | null
          loyalty_program_name: string | null
          loyalty_redemption_rate: number | null
          loyalty_welcome_bonus: number | null
          manager_approval_discount_pct: number | null
          phone: string | null
          receipt_abn: string | null
          receipt_business_name: string | null
          receipt_email_from: string | null
          receipt_footer: string | null
          receipt_header: string | null
          receipt_logo_url: string | null
          receipt_prefix: string | null
          receipt_print_format: string | null
          receipt_show_cashier: boolean | null
          receipt_show_change: boolean | null
          receipt_show_gst: boolean | null
          receipt_show_loyalty: boolean | null
          receipt_template: Json | null
          receipt_template_name: string | null
          require_pin_for_refunds: boolean | null
          rounding: string | null
          show_gst_breakdown: boolean | null
          surcharge_applies_to: string | null
          surcharge_enabled: boolean | null
          surcharge_minimum_amount: number | null
          surcharge_show_on_receipt: boolean | null
          surcharge_type: string | null
          surcharge_value: number | null
          tax_inclusive: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          abn?: string | null
          accept_card?: boolean | null
          accept_cash?: boolean | null
          accept_split?: boolean | null
          accepted_payment_methods?: Json | null
          address?: string | null
          apply_gst_to_all?: boolean | null
          business_abn?: string | null
          business_address?: string | null
          business_id?: string | null
          business_phone?: string | null
          business_website?: string | null
          card_surcharge_percent?: number | null
          cash_rounding?: boolean | null
          created_at?: string | null
          default_payment_method?: string | null
          gst_inclusive?: boolean | null
          gst_rate?: number | null
          id?: string
          loyalty_birthday_bonus?: number | null
          loyalty_enabled?: boolean | null
          loyalty_min_redemption?: number | null
          loyalty_points_per_dollar?: number | null
          loyalty_points_per_dollar_value?: number | null
          loyalty_program_name?: string | null
          loyalty_redemption_rate?: number | null
          loyalty_welcome_bonus?: number | null
          manager_approval_discount_pct?: number | null
          phone?: string | null
          receipt_abn?: string | null
          receipt_business_name?: string | null
          receipt_email_from?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          receipt_prefix?: string | null
          receipt_print_format?: string | null
          receipt_show_cashier?: boolean | null
          receipt_show_change?: boolean | null
          receipt_show_gst?: boolean | null
          receipt_show_loyalty?: boolean | null
          receipt_template?: Json | null
          receipt_template_name?: string | null
          require_pin_for_refunds?: boolean | null
          rounding?: string | null
          show_gst_breakdown?: boolean | null
          surcharge_applies_to?: string | null
          surcharge_enabled?: boolean | null
          surcharge_minimum_amount?: number | null
          surcharge_show_on_receipt?: boolean | null
          surcharge_type?: string | null
          surcharge_value?: number | null
          tax_inclusive?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          abn?: string | null
          accept_card?: boolean | null
          accept_cash?: boolean | null
          accept_split?: boolean | null
          accepted_payment_methods?: Json | null
          address?: string | null
          apply_gst_to_all?: boolean | null
          business_abn?: string | null
          business_address?: string | null
          business_id?: string | null
          business_phone?: string | null
          business_website?: string | null
          card_surcharge_percent?: number | null
          cash_rounding?: boolean | null
          created_at?: string | null
          default_payment_method?: string | null
          gst_inclusive?: boolean | null
          gst_rate?: number | null
          id?: string
          loyalty_birthday_bonus?: number | null
          loyalty_enabled?: boolean | null
          loyalty_min_redemption?: number | null
          loyalty_points_per_dollar?: number | null
          loyalty_points_per_dollar_value?: number | null
          loyalty_program_name?: string | null
          loyalty_redemption_rate?: number | null
          loyalty_welcome_bonus?: number | null
          manager_approval_discount_pct?: number | null
          phone?: string | null
          receipt_abn?: string | null
          receipt_business_name?: string | null
          receipt_email_from?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          receipt_prefix?: string | null
          receipt_print_format?: string | null
          receipt_show_cashier?: boolean | null
          receipt_show_change?: boolean | null
          receipt_show_gst?: boolean | null
          receipt_show_loyalty?: boolean | null
          receipt_template?: Json | null
          receipt_template_name?: string | null
          require_pin_for_refunds?: boolean | null
          rounding?: string | null
          show_gst_breakdown?: boolean | null
          surcharge_applies_to?: string | null
          surcharge_enabled?: boolean | null
          surcharge_minimum_amount?: number | null
          surcharge_show_on_receipt?: boolean | null
          surcharge_type?: string | null
          surcharge_value?: number | null
          tax_inclusive?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shelf_ticket_templates: {
        Row: {
          accent_color: string | null
          background_color: string | null
          band_color: string | null
          band_label: string | null
          band_text_color: string | null
          business_id: string | null
          canvas_elements: Json | null
          corner_radius: number | null
          created_at: string | null
          font_size_name: number | null
          font_size_price: number | null
          height_mm: number | null
          id: string
          is_default: boolean | null
          layout: string | null
          name: string
          paper_type: string | null
          price_color: string | null
          show_barcode: boolean | null
          show_description: boolean | null
          show_logo: boolean | null
          show_member_price: boolean | null
          show_multibuy: boolean | null
          show_name: boolean | null
          show_per_unit: boolean | null
          show_price: boolean | null
          show_promo_band: boolean | null
          show_save_badge: boolean | null
          show_sku: boolean | null
          show_valid_date: boolean | null
          show_was_price: boolean | null
          text_color: string | null
          ticket_type: string | null
          updated_at: string | null
          width_mm: number | null
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          band_color?: string | null
          band_label?: string | null
          band_text_color?: string | null
          business_id?: string | null
          canvas_elements?: Json | null
          corner_radius?: number | null
          created_at?: string | null
          font_size_name?: number | null
          font_size_price?: number | null
          height_mm?: number | null
          id?: string
          is_default?: boolean | null
          layout?: string | null
          name: string
          paper_type?: string | null
          price_color?: string | null
          show_barcode?: boolean | null
          show_description?: boolean | null
          show_logo?: boolean | null
          show_member_price?: boolean | null
          show_multibuy?: boolean | null
          show_name?: boolean | null
          show_per_unit?: boolean | null
          show_price?: boolean | null
          show_promo_band?: boolean | null
          show_save_badge?: boolean | null
          show_sku?: boolean | null
          show_valid_date?: boolean | null
          show_was_price?: boolean | null
          text_color?: string | null
          ticket_type?: string | null
          updated_at?: string | null
          width_mm?: number | null
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          band_color?: string | null
          band_label?: string | null
          band_text_color?: string | null
          business_id?: string | null
          canvas_elements?: Json | null
          corner_radius?: number | null
          created_at?: string | null
          font_size_name?: number | null
          font_size_price?: number | null
          height_mm?: number | null
          id?: string
          is_default?: boolean | null
          layout?: string | null
          name?: string
          paper_type?: string | null
          price_color?: string | null
          show_barcode?: boolean | null
          show_description?: boolean | null
          show_logo?: boolean | null
          show_member_price?: boolean | null
          show_multibuy?: boolean | null
          show_name?: boolean | null
          show_per_unit?: boolean | null
          show_price?: boolean | null
          show_promo_band?: boolean | null
          show_save_badge?: boolean | null
          show_sku?: boolean | null
          show_valid_date?: boolean | null
          show_was_price?: boolean | null
          text_color?: string | null
          ticket_type?: string | null
          updated_at?: string | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_shelf_ticket_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shift_audits: {
        Row: {
          aria_assessment: string | null
          business_id: string
          cashier_name: string | null
          completed_by: string | null
          created_at: string
          failed_checks: number
          flagged_items: Json | null
          id: string
          passed_checks: number
          results: Json
          session_id: string | null
          shift_date: string
          shift_report_id: string | null
          status: string
          total_checks: number
        }
        Insert: {
          aria_assessment?: string | null
          business_id: string
          cashier_name?: string | null
          completed_by?: string | null
          created_at?: string
          failed_checks?: number
          flagged_items?: Json | null
          id?: string
          passed_checks?: number
          results?: Json
          session_id?: string | null
          shift_date?: string
          shift_report_id?: string | null
          status?: string
          total_checks?: number
        }
        Update: {
          aria_assessment?: string | null
          business_id?: string
          cashier_name?: string | null
          completed_by?: string | null
          created_at?: string
          failed_checks?: number
          flagged_items?: Json | null
          id?: string
          passed_checks?: number
          results?: Json
          session_id?: string | null
          shift_date?: string
          shift_report_id?: string | null
          status?: string
          total_checks?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_shift_audits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_audits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_audits_shift_report_id_fkey"
            columns: ["shift_report_id"]
            isOneToOne: false
            referencedRelation: "pos_shift_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shift_reports: {
        Row: {
          aria_summary: string | null
          avg_basket: number
          business_id: string
          cashier_name: string | null
          cashier_user_id: string | null
          closing_float: number | null
          created_at: string
          expected_cash: number | null
          id: string
          opening_float: number
          payment_breakdown: Json | null
          pdf_url: string | null
          report_data: Json | null
          session_id: string | null
          shift_end: string
          shift_start: string
          staff_on_shift: Json | null
          status: string
          top_products: Json | null
          total_refund_value: number
          total_refunds: number
          total_revenue: number
          total_transactions: number
          total_voids: number
          variance_cents: number
        }
        Insert: {
          aria_summary?: string | null
          avg_basket?: number
          business_id: string
          cashier_name?: string | null
          cashier_user_id?: string | null
          closing_float?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          opening_float?: number
          payment_breakdown?: Json | null
          pdf_url?: string | null
          report_data?: Json | null
          session_id?: string | null
          shift_end: string
          shift_start: string
          staff_on_shift?: Json | null
          status?: string
          top_products?: Json | null
          total_refund_value?: number
          total_refunds?: number
          total_revenue?: number
          total_transactions?: number
          total_voids?: number
          variance_cents?: number
        }
        Update: {
          aria_summary?: string | null
          avg_basket?: number
          business_id?: string
          cashier_name?: string | null
          cashier_user_id?: string | null
          closing_float?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          opening_float?: number
          payment_breakdown?: Json | null
          pdf_url?: string | null
          report_data?: Json | null
          session_id?: string | null
          shift_end?: string
          shift_start?: string
          staff_on_shift?: Json | null
          status?: string
          top_products?: Json | null
          total_refund_value?: number
          total_refunds?: number
          total_revenue?: number
          total_transactions?: number
          total_voids?: number
          variance_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_shift_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_split_items: {
        Row: {
          amount_assigned: number
          business_id: string
          created_at: string
          id: string
          quantity_assigned: number
          sale_item_id: string
          split_id: string
        }
        Insert: {
          amount_assigned: number
          business_id: string
          created_at?: string
          id?: string
          quantity_assigned?: number
          sale_item_id: string
          split_id: string
        }
        Update: {
          amount_assigned?: number
          business_id?: string
          created_at?: string
          id?: string
          quantity_assigned?: number
          sale_item_id?: string
          split_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_split_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_split_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_split_items_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_split_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          is_partial: boolean
          method: string
          processor: string | null
          reference: string | null
          sale_id: string
          split_id: string
          taken_by: string | null
          tip_portion: number
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          is_partial?: boolean
          method: string
          processor?: string | null
          reference?: string | null
          sale_id: string
          split_id: string
          taken_by?: string | null
          tip_portion?: number
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          is_partial?: boolean
          method?: string
          processor?: string | null
          reference?: string | null
          sale_id?: string
          split_id?: string
          taken_by?: string | null
          tip_portion?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_split_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_split_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_split_payments_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_staff: {
        Row: {
          business_id: string | null
          color: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          permissions: Json | null
          pin: string | null
          role: string | null
        }
        Insert: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          permissions?: Json | null
          pin?: string | null
          role?: string | null
        }
        Update: {
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          permissions?: Json | null
          pin?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_staffing_rules: {
        Row: {
          business_id: string
          day_of_week: number | null
          hour_of_day: number | null
          id: string
          min_staff: number | null
          outlet_id: string
          required_role: string | null
        }
        Insert: {
          business_id: string
          day_of_week?: number | null
          hour_of_day?: number | null
          id?: string
          min_staff?: number | null
          outlet_id: string
          required_role?: string | null
        }
        Update: {
          business_id?: string
          day_of_week?: number | null
          hour_of_day?: number | null
          id?: string
          min_staff?: number | null
          outlet_id?: string
          required_role?: string | null
        }
        Relationships: []
      }
      pos_stock_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_qty: number
          business_id: string | null
          created_at: string | null
          id: string
          outlet_id: string | null
          product_id: string | null
          reason: string | null
          staff_id: string | null
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_qty: number
          business_id?: string | null
          created_at?: string | null
          id?: string
          outlet_id?: string | null
          product_id?: string | null
          reason?: string | null
          staff_id?: string | null
        }
        Update: {
          adjusted_by?: string | null
          adjustment_qty?: number
          business_id?: string | null
          created_at?: string | null
          id?: string
          outlet_id?: string | null
          product_id?: string | null
          reason?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_adjustments_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_take_items: {
        Row: {
          counted_at: string | null
          counted_qty: number | null
          id: string
          product_id: string
          recount_count: number | null
          stock_take_id: string
          system_qty: number | null
        }
        Insert: {
          counted_at?: string | null
          counted_qty?: number | null
          id?: string
          product_id: string
          recount_count?: number | null
          stock_take_id: string
          system_qty?: number | null
        }
        Update: {
          counted_at?: string | null
          counted_qty?: number | null
          id?: string
          product_id?: string
          recount_count?: number | null
          stock_take_id?: string
          system_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_take_items_stock_take_id_fkey"
            columns: ["stock_take_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_takes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_takes: {
        Row: {
          business_id: string
          completed_at: string | null
          id: string
          items_counted: number | null
          items_with_variance: number | null
          notes: string | null
          outlet_id: string
          started_at: string
          started_by: string | null
          status: string | null
          total_variance_cents: number | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          id?: string
          items_counted?: number | null
          items_with_variance?: number | null
          notes?: string | null
          outlet_id: string
          started_at?: string
          started_by?: string | null
          status?: string | null
          total_variance_cents?: number | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          id?: string
          items_counted?: number | null
          items_with_variance?: number | null
          notes?: string | null
          outlet_id?: string
          started_at?: string
          started_by?: string | null
          status?: string | null
          total_variance_cents?: number | null
        }
        Relationships: []
      }
      pos_stocktake_items: {
        Row: {
          counted_qty: number | null
          created_at: string | null
          expected_qty: number | null
          id: string
          product_id: string | null
          product_name: string
          stocktake_id: string | null
          variance: number | null
        }
        Insert: {
          counted_qty?: number | null
          created_at?: string | null
          expected_qty?: number | null
          id?: string
          product_id?: string | null
          product_name: string
          stocktake_id?: string | null
          variance?: number | null
        }
        Update: {
          counted_qty?: number | null
          created_at?: string | null
          expected_qty?: number | null
          id?: string
          product_id?: string | null
          product_name?: string
          stocktake_id?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stocktake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "pos_stocktakes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stocktakes: {
        Row: {
          business_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          name: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stocktakes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_store_credit_txns: {
        Row: {
          amount: number
          balance_after: number
          business_id: string
          created_at: string
          credit_id: string
          id: string
          note: string | null
          sale_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          business_id: string
          created_at?: string
          credit_id: string
          id?: string
          note?: string | null
          sale_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          business_id?: string
          created_at?: string
          credit_id?: string
          id?: string
          note?: string | null
          sale_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_store_credit_txns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_store_credit_txns_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "pos_store_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_store_credit_txns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_store_credits: {
        Row: {
          balance: number
          business_id: string
          code: string
          created_at: string
          customer_id: string | null
          expires_at: string | null
          id: string
          initial_amount: number
          is_active: boolean
          issued_by_sale_id: string | null
          reason: string | null
          redeemed_at: string | null
        }
        Insert: {
          balance?: number
          business_id: string
          code: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          initial_amount: number
          is_active?: boolean
          issued_by_sale_id?: string | null
          reason?: string | null
          redeemed_at?: string | null
        }
        Update: {
          balance?: number
          business_id?: string
          code?: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          initial_amount?: number
          is_active?: boolean
          issued_by_sale_id?: string | null
          reason?: string | null
          redeemed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_store_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_store_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_store_credits_issued_by_sale_id_fkey"
            columns: ["issued_by_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_suppliers: {
        Row: {
          address: string | null
          business_id: string | null
          contact_name: string | null
          created_at: string | null
          custom_columns: Json | null
          delivery_days: number[] | null
          email: string | null
          id: string
          name: string
          notes: string | null
          order_cutoff_days: number[] | null
          order_email: string | null
          phone: string | null
          region: string | null
          short_code: string | null
        }
        Insert: {
          address?: string | null
          business_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          custom_columns?: Json | null
          delivery_days?: number[] | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          order_cutoff_days?: number[] | null
          order_email?: string | null
          phone?: string | null
          region?: string | null
          short_code?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          custom_columns?: Json | null
          delivery_days?: number[] | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          order_cutoff_days?: number[] | null
          order_email?: string | null
          phone?: string | null
          region?: string | null
          short_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_surcharge_rules: {
        Row: {
          amount: number | null
          amount_type: string | null
          applies_after: string | null
          business_id: string | null
          created_at: string | null
          day_of_week: number[] | null
          id: string
          is_active: boolean | null
          name: string
          payment_method: string
          payment_type: string | null
          surcharge_type: string | null
          surcharge_value: number
        }
        Insert: {
          amount?: number | null
          amount_type?: string | null
          applies_after?: string | null
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number[] | null
          id?: string
          is_active?: boolean | null
          name: string
          payment_method: string
          payment_type?: string | null
          surcharge_type?: string | null
          surcharge_value?: number
        }
        Update: {
          amount?: number | null
          amount_type?: string | null
          applies_after?: string | null
          business_id?: string | null
          created_at?: string | null
          day_of_week?: number[] | null
          id?: string
          is_active?: boolean | null
          name?: string
          payment_method?: string
          payment_type?: string | null
          surcharge_type?: string | null
          surcharge_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_surcharge_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tables: {
        Row: {
          business_id: string | null
          capacity: number | null
          created_at: string | null
          current_sale_id: string | null
          id: string
          name: string | null
          notes: string | null
          occupied_since: string | null
          pos_x: number | null
          pos_y: number | null
          seated_at: string | null
          seats: number
          section: string | null
          shape: string | null
          status: string | null
          table_number: string | null
          updated_at: string | null
          zone: string | null
        }
        Insert: {
          business_id?: string | null
          capacity?: number | null
          created_at?: string | null
          current_sale_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          occupied_since?: string | null
          pos_x?: number | null
          pos_y?: number | null
          seated_at?: string | null
          seats?: number
          section?: string | null
          shape?: string | null
          status?: string | null
          table_number?: string | null
          updated_at?: string | null
          zone?: string | null
        }
        Update: {
          business_id?: string | null
          capacity?: number | null
          created_at?: string | null
          current_sale_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          occupied_since?: string | null
          pos_x?: number | null
          pos_y?: number | null
          seated_at?: string | null
          seats?: number
          section?: string | null
          shape?: string | null
          status?: string | null
          table_number?: string | null
          updated_at?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_tables_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tags: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tax_codes: {
        Row: {
          applies_on_top_of_tax_code_id: string | null
          business_id: string
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_inclusive: boolean
          is_system: boolean
          name: string
          rate: number
          updated_at: string
        }
        Insert: {
          applies_on_top_of_tax_code_id?: string | null
          business_id: string
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_inclusive?: boolean
          is_system?: boolean
          name: string
          rate: number
          updated_at?: string
        }
        Update: {
          applies_on_top_of_tax_code_id?: string | null
          business_id?: string
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_inclusive?: boolean
          is_system?: boolean
          name?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tax_codes_applies_on_top_of_tax_code_id_fkey"
            columns: ["applies_on_top_of_tax_code_id"]
            isOneToOne: false
            referencedRelation: "pos_tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tax_codes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tax_holidays: {
        Row: {
          affected_category_ids: string[] | null
          affected_product_ids: string[] | null
          affected_tax_code_ids: string[] | null
          business_id: string
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          name: string
          outlet_id: string | null
          starts_at: string
        }
        Insert: {
          affected_category_ids?: string[] | null
          affected_product_ids?: string[] | null
          affected_tax_code_ids?: string[] | null
          business_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          outlet_id?: string | null
          starts_at: string
        }
        Update: {
          affected_category_ids?: string[] | null
          affected_product_ids?: string[] | null
          affected_tax_code_ids?: string[] | null
          business_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          outlet_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tax_holidays_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tax_holidays_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_timesheets: {
        Row: {
          allowances: Json | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          break_minutes: number | null
          break_type: string | null
          business_id: string | null
          clock_in: string
          clock_out: string | null
          created_at: string | null
          hours_worked: number | null
          id: string
          is_overtime: boolean | null
          notes: string | null
          outlet_id: string | null
          overtime_cents: number | null
          pay_rate_cents: number | null
          shift_id: string | null
          staff_id: string | null
          staff_member_id: string | null
          staff_name: string
          status: string
          total_pay_cents: number | null
          updated_at: string
        }
        Insert: {
          allowances?: Json | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          break_type?: string | null
          business_id?: string | null
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          is_overtime?: boolean | null
          notes?: string | null
          outlet_id?: string | null
          overtime_cents?: number | null
          pay_rate_cents?: number | null
          shift_id?: string | null
          staff_id?: string | null
          staff_member_id?: string | null
          staff_name: string
          status?: string
          total_pay_cents?: number | null
          updated_at?: string
        }
        Update: {
          allowances?: Json | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          break_type?: string | null
          business_id?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          hours_worked?: number | null
          id?: string
          is_overtime?: boolean | null
          notes?: string | null
          outlet_id?: string | null
          overtime_cents?: number | null
          pay_rate_cents?: number | null
          shift_id?: string | null
          staff_id?: string | null
          staff_member_id?: string | null
          staff_name?: string
          status?: string
          total_pay_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_timesheets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_timesheets_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_timesheets_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_timesheets_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transfer_events: {
        Row: {
          actor_pos_user_id: string | null
          actor_user_id: string | null
          business_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json | null
          to_status: string | null
          transfer_id: string
        }
        Insert: {
          actor_pos_user_id?: string | null
          actor_user_id?: string | null
          business_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          to_status?: string | null
          transfer_id: string
        }
        Update: {
          actor_pos_user_id?: string | null
          actor_user_id?: string | null
          business_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          to_status?: string | null
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_transfer_events_actor_pos_user_id_fkey"
            columns: ["actor_pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transfer_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "pos_inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_users: {
        Row: {
          auth_user_id: string | null
          availability: Json | null
          business_id: string | null
          created_at: string | null
          display_name: string | null
          hourly_rate_cents: number | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          manager_pin: string | null
          max_hours_per_week: number | null
          name: string
          permissions: Json | null
          pin: string
          role: string | null
          role_title: string | null
          staff_member_id: string | null
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          availability?: Json | null
          business_id?: string | null
          created_at?: string | null
          display_name?: string | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          manager_pin?: string | null
          max_hours_per_week?: number | null
          name: string
          permissions?: Json | null
          pin: string
          role?: string | null
          role_title?: string | null
          staff_member_id?: string | null
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          availability?: Json | null
          business_id?: string | null
          created_at?: string | null
          display_name?: string | null
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          manager_pin?: string | null
          max_hours_per_week?: number | null
          name?: string
          permissions?: Json | null
          pin?: string
          role?: string | null
          role_title?: string | null
          staff_member_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_users_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_waste_log: {
        Row: {
          business_id: string
          cost_cents: number | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          reason: string | null
          recorded_at: string | null
          recorded_by: string | null
          staff_id: string | null
          unit: string | null
        }
        Insert: {
          business_id: string
          cost_cents?: number | null
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          reason?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          staff_id?: string | null
          unit?: string | null
        }
        Update: {
          business_id?: string
          cost_cents?: number | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          staff_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_waste_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_waste_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_weekly_reports: {
        Row: {
          business_id: string
          created_at: string
          email_sent_at: string | null
          email_sent_to: string | null
          id: string
          pdf_url: string | null
          report_data: Json
          send_status: string
          week_end: string
          week_start: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          pdf_url?: string | null
          report_data?: Json
          send_status?: string
          week_end: string
          week_start: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          pdf_url?: string | null
          report_data?: Json
          send_status?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_weekly_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_predictions: {
        Row: {
          actual_units_sold: number | null
          actual_waste_units: number | null
          actual_waste_value: number | null
          business_id: string
          created_at: string | null
          id: string
          predicted_units: number | null
          prediction_date: string
          prediction_error_pct: number | null
          product_id: string | null
          promotion_id: string | null
          waste_reason: string | null
        }
        Insert: {
          actual_units_sold?: number | null
          actual_waste_units?: number | null
          actual_waste_value?: number | null
          business_id: string
          created_at?: string | null
          id?: string
          predicted_units?: number | null
          prediction_date: string
          prediction_error_pct?: number | null
          product_id?: string | null
          promotion_id?: string | null
          waste_reason?: string | null
        }
        Update: {
          actual_units_sold?: number | null
          actual_waste_units?: number | null
          actual_waste_value?: number | null
          business_id?: string
          created_at?: string | null
          id?: string
          predicted_units?: number | null
          prediction_date?: string
          prediction_error_pct?: number | null
          product_id?: string | null
          promotion_id?: string | null
          waste_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prep_predictions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_suggestions: {
        Row: {
          applied_at: string | null
          business_id: string | null
          created_at: string | null
          current_price: number | null
          expected_margin_gain: number | null
          id: string
          product_id: string | null
          reason: string | null
          status: string | null
          suggested_price: number | null
        }
        Insert: {
          applied_at?: string | null
          business_id?: string | null
          created_at?: string | null
          current_price?: number | null
          expected_margin_gain?: number | null
          id?: string
          product_id?: string | null
          reason?: string | null
          status?: string | null
          suggested_price?: number | null
        }
        Update: {
          applied_at?: string | null
          business_id?: string | null
          created_at?: string | null
          current_price?: number | null
          expected_margin_gain?: number | null
          id?: string
          product_id?: string | null
          reason?: string | null
          status?: string | null
          suggested_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_suggestions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundles: {
        Row: {
          bundle_name: string | null
          bundle_pitch: string | null
          bundle_price: number | null
          business_id: string | null
          created_at: string | null
          id: string
          individual_total: number | null
          margin_at_bundle: number | null
          product_ids: Json | null
          source: string | null
          status: string | null
          times_sold: number | null
          total_cost: number | null
        }
        Insert: {
          bundle_name?: string | null
          bundle_pitch?: string | null
          bundle_price?: number | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          individual_total?: number | null
          margin_at_bundle?: number | null
          product_ids?: Json | null
          source?: string | null
          status?: string | null
          times_sold?: number | null
          total_cost?: number | null
        }
        Update: {
          bundle_name?: string | null
          bundle_pitch?: string | null
          bundle_price?: number | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          individual_total?: number | null
          margin_at_bundle?: number | null
          product_ids?: Json | null
          source?: string | null
          status?: string | null
          times_sold?: number | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_bundles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_performance_scores: {
        Row: {
          business_id: string
          composite_score: number | null
          halo_avg_copur_margin: number | null
          halo_products: string[] | null
          halo_score: number | null
          id: string
          margin_dollars_per_unit: number | null
          margin_pct: number | null
          margin_score: number | null
          performance_tier: string | null
          period_hours: number | null
          product_id: string
          recommendation_outcome: string | null
          recommended_bundle_price: number | null
          recommended_bundle_product_id: string | null
          recommended_grid_position: number | null
          recommended_upsell_product_id: string | null
          revenue_4h_after_change: number | null
          revenue_4h_before_change: number | null
          scored_at: string | null
          units_sold_baseline_same_period: number | null
          units_sold_this_period: number | null
          velocity_vs_avg: number | null
        }
        Insert: {
          business_id: string
          composite_score?: number | null
          halo_avg_copur_margin?: number | null
          halo_products?: string[] | null
          halo_score?: number | null
          id?: string
          margin_dollars_per_unit?: number | null
          margin_pct?: number | null
          margin_score?: number | null
          performance_tier?: string | null
          period_hours?: number | null
          product_id: string
          recommendation_outcome?: string | null
          recommended_bundle_price?: number | null
          recommended_bundle_product_id?: string | null
          recommended_grid_position?: number | null
          recommended_upsell_product_id?: string | null
          revenue_4h_after_change?: number | null
          revenue_4h_before_change?: number | null
          scored_at?: string | null
          units_sold_baseline_same_period?: number | null
          units_sold_this_period?: number | null
          velocity_vs_avg?: number | null
        }
        Update: {
          business_id?: string
          composite_score?: number | null
          halo_avg_copur_margin?: number | null
          halo_products?: string[] | null
          halo_score?: number | null
          id?: string
          margin_dollars_per_unit?: number | null
          margin_pct?: number | null
          margin_score?: number | null
          performance_tier?: string | null
          period_hours?: number | null
          product_id?: string
          recommendation_outcome?: string | null
          recommended_bundle_price?: number | null
          recommended_bundle_product_id?: string | null
          recommended_grid_position?: number | null
          recommended_upsell_product_id?: string | null
          revenue_4h_after_change?: number | null
          revenue_4h_before_change?: number | null
          scored_at?: string | null
          units_sold_baseline_same_period?: number | null
          units_sold_this_period?: number | null
          velocity_vs_avg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_performance_scores_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_performance_scores_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_performance_scores_recommended_bundle_product_id_fkey"
            columns: ["recommended_bundle_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_performance_scores_recommended_upsell_product_id_fkey"
            columns: ["recommended_upsell_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tax_classifications: {
        Row: {
          ai_confidence: number | null
          ato_tax_code: string | null
          business_id: string
          classification_source: string | null
          classified_at: string | null
          gst_treatment: string | null
          id: string
          notes: string | null
          product_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ato_tax_code?: string | null
          business_id: string
          classification_source?: string | null
          classified_at?: string | null
          gst_treatment?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ato_tax_code?: string | null
          business_id?: string
          classification_source?: string | null
          classified_at?: string | null
          gst_treatment?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tax_classifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tax_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_leak_history: {
        Row: {
          business_id: string | null
          fixed_count: number | null
          id: string
          leaks: Json | null
          run_at: string | null
          total_leak_cents: number | null
        }
        Insert: {
          business_id?: string | null
          fixed_count?: number | null
          id?: string
          leaks?: Json | null
          run_at?: string | null
          total_leak_cents?: number | null
        }
        Update: {
          business_id?: string | null
          fixed_count?: number | null
          id?: string
          leaks?: Json | null
          run_at?: string | null
          total_leak_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_leak_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_leaks: {
        Row: {
          business_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          detected_at: string | null
          estimated_loss: number | null
          fix_suggestion: string | null
          id: string
          monthly_loss: number | null
          recommendation: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          estimated_loss?: number | null
          fix_suggestion?: string | null
          id?: string
          monthly_loss?: number | null
          recommendation?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          estimated_loss?: number | null
          fix_suggestion?: string | null
          id?: string
          monthly_loss?: number | null
          recommendation?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_leaks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          files: Json | null
          framework: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          files?: Json | null
          framework?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          files?: Json | null
          framework?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      protected_tables: {
        Row: {
          reason: string
          tablename: string
        }
        Insert: {
          reason: string
          tablename: string
        }
        Update: {
          reason?: string
          tablename?: string
        }
        Relationships: []
      }
      purchase_order_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          aria_reasoning: string | null
          business_id: string | null
          created_at: string | null
          draft_type: string | null
          id: string
          items: Json | null
          notes: string | null
          reason: string | null
          sent_at: string | null
          status: string | null
          suggested_qty: number | null
          supplier_email: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_cost_cents: number | null
          unit_cost_cents: number | null
          week_starting: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          aria_reasoning?: string | null
          business_id?: string | null
          created_at?: string | null
          draft_type?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string | null
          suggested_qty?: number | null
          supplier_email?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost_cents?: number | null
          unit_cost_cents?: number | null
          week_starting?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          aria_reasoning?: string | null
          business_id?: string | null
          created_at?: string | null
          draft_type?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string | null
          suggested_qty?: number | null
          supplier_email?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost_cents?: number | null
          unit_cost_cents?: number | null
          week_starting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_drafts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          business_id: string
          created_at: string
          id: string
          platform: string | null
          token: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          platform?: string | null
          token: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          platform?: string | null
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_views: {
        Row: {
          id: string
          ip_address: string | null
          quote_id: string | null
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          quote_id?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          quote_id?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_views_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          acceptance_ip: string | null
          acceptance_token: string | null
          accepted_at: string | null
          accepted_by_name: string | null
          business_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          expires_at: string | null
          generated_at: string | null
          generated_by_ai: boolean | null
          id: string
          job_description: string | null
          last_viewed_at: string | null
          notes: string | null
          quote_amount: number | null
          quote_breakdown: Json | null
          quote_number: string | null
          sent_at: string | null
          status: string | null
          terms: string | null
          token: string | null
          updated_at: string | null
          view_count: number | null
          win_score: number | null
        }
        Insert: {
          acceptance_ip?: string | null
          acceptance_token?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          business_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generated_by_ai?: boolean | null
          id?: string
          job_description?: string | null
          last_viewed_at?: string | null
          notes?: string | null
          quote_amount?: number | null
          quote_breakdown?: Json | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string | null
          terms?: string | null
          token?: string | null
          updated_at?: string | null
          view_count?: number | null
          win_score?: number | null
        }
        Update: {
          acceptance_ip?: string | null
          acceptance_token?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          business_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generated_by_ai?: boolean | null
          id?: string
          job_description?: string | null
          last_viewed_at?: string | null
          notes?: string | null
          quote_amount?: number | null
          quote_breakdown?: Json | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string | null
          terms?: string | null
          token?: string | null
          updated_at?: string | null
          view_count?: number | null
          win_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_ocr_scans: {
        Row: {
          business_id: string
          completed_at: string | null
          confidence_score: number | null
          created_at: string
          detected_items: Json | null
          detected_subtotal: number | null
          detected_tax: number | null
          detected_tip: number | null
          detected_total: number | null
          id: string
          image_storage_path: string | null
          image_url: string
          ocr_error: string | null
          ocr_status: string
          raw_response: Json | null
          sale_id: string | null
          scanned_by: string | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_items?: Json | null
          detected_subtotal?: number | null
          detected_tax?: number | null
          detected_tip?: number | null
          detected_total?: number | null
          id?: string
          image_storage_path?: string | null
          image_url: string
          ocr_error?: string | null
          ocr_status?: string
          raw_response?: Json | null
          sale_id?: string | null
          scanned_by?: string | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_items?: Json | null
          detected_subtotal?: number | null
          detected_tax?: number | null
          detected_tip?: number | null
          detected_total?: number | null
          id?: string
          image_storage_path?: string | null
          image_url?: string
          ocr_error?: string | null
          ocr_status?: string
          raw_response?: Json | null
          sale_id?: string | null
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_ocr_scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_ocr_scans_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_imports: {
        Row: {
          business_id: string
          created_at: string
          extracted_ingredients: Json | null
          extracted_steps: Json | null
          extracted_title: string | null
          extraction_notes: string | null
          file_name: string | null
          id: string
          imported_at: string | null
          linked_product_id: string | null
          rows_failed: number
          rows_imported: number
          source_type: string | null
          source_url: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          extracted_ingredients?: Json | null
          extracted_steps?: Json | null
          extracted_title?: string | null
          extraction_notes?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          linked_product_id?: string | null
          rows_failed?: number
          rows_imported?: number
          source_type?: string | null
          source_url: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          extracted_ingredients?: Json | null
          extracted_steps?: Json | null
          extracted_title?: string | null
          extraction_notes?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          linked_product_id?: string | null
          rows_failed?: number
          rows_imported?: number
          source_type?: string | null
          source_url?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_imports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          allergens: string[] | null
          business_id: string
          cost_cents: number | null
          cost_per_unit: number | null
          created_at: string
          id: string
          ingredient_name: string
          notes: string | null
          product_id: string | null
          quantity: number
          recipe_id: string
          supplier_id: string | null
          unit: string
          wastage_pct: number | null
        }
        Insert: {
          allergens?: string[] | null
          business_id: string
          cost_cents?: number | null
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          ingredient_name: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          recipe_id: string
          supplier_id?: string | null
          unit?: string
          wastage_pct?: number | null
        }
        Update: {
          allergens?: string[] | null
          business_id?: string
          cost_cents?: number | null
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          ingredient_name?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          recipe_id?: string
          supplier_id?: string | null
          unit?: string
          wastage_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_training_assets: {
        Row: {
          asset_type: string
          business_id: string
          content: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          recipe_id: string
          sort_order: number
          title: string
          url: string | null
        }
        Insert: {
          asset_type: string
          business_id: string
          content?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          recipe_id: string
          sort_order?: number
          title: string
          url?: string | null
        }
        Update: {
          asset_type?: string
          business_id?: string
          content?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          recipe_id?: string
          sort_order?: number
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_training_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_training_assets_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_waste_log: {
        Row: {
          business_id: string | null
          id: string
          logged_at: string | null
          reason: string | null
          recipe_id: string | null
          unit: string | null
          waste_cost: number | null
          wasted_quantity: number | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          logged_at?: string | null
          reason?: string | null
          recipe_id?: string | null
          unit?: string | null
          waste_cost?: number | null
          wasted_quantity?: number | null
        }
        Update: {
          business_id?: string | null
          id?: string
          logged_at?: string | null
          reason?: string | null
          recipe_id?: string | null
          unit?: string | null
          waste_cost?: number | null
          wasted_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_waste_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_waste_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          allergens: string[] | null
          business_id: string
          category: string | null
          cost_cents: number | null
          cost_per_serve: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          last_cost_updated_at: string | null
          linked_product_id: string | null
          margin: number | null
          margin_percent: number | null
          menu_price: number | null
          name: string
          notes: string | null
          prep_time_minutes: number | null
          product_id: string | null
          sell_price_cents: number | null
          serves: number
          source: string | null
          suggested_price: number | null
          total_cost: number | null
          updated_at: string
          yield_qty: number | null
          yield_unit: string | null
        }
        Insert: {
          allergens?: string[] | null
          business_id: string
          category?: string | null
          cost_cents?: number | null
          cost_per_serve?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_cost_updated_at?: string | null
          linked_product_id?: string | null
          margin?: number | null
          margin_percent?: number | null
          menu_price?: number | null
          name: string
          notes?: string | null
          prep_time_minutes?: number | null
          product_id?: string | null
          sell_price_cents?: number | null
          serves?: number
          source?: string | null
          suggested_price?: number | null
          total_cost?: number | null
          updated_at?: string
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Update: {
          allergens?: string[] | null
          business_id?: string
          category?: string | null
          cost_cents?: number | null
          cost_per_serve?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_cost_updated_at?: string | null
          linked_product_id?: string | null
          margin?: number | null
          margin_percent?: number | null
          menu_price?: number | null
          name?: string
          notes?: string | null
          prep_time_minutes?: number | null
          product_id?: string | null
          sell_price_cents?: number | null
          serves?: number
          source?: string | null
          suggested_price?: number | null
          total_cost?: number | null
          updated_at?: string
          yield_qty?: number | null
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          base_invoice_id: string | null
          business_id: string | null
          created_at: string | null
          frequency: string | null
          id: string
          is_active: boolean | null
          next_due_date: string | null
        }
        Insert: {
          base_invoice_id?: string | null
          business_id?: string | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          next_due_date?: string | null
        }
        Update: {
          base_invoice_id?: string | null
          business_id?: string | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          next_due_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_base_invoice_id_fkey"
            columns: ["base_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_monthly_invoices: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          month: string
          reel_count: number | null
          status: string | null
          stripe_invoice_id: string | null
          total_cost_aud: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          month: string
          reel_count?: number | null
          status?: string | null
          stripe_invoice_id?: string | null
          total_cost_aud?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          month?: string
          reel_count?: number | null
          status?: string | null
          stripe_invoice_id?: string | null
          total_cost_aud?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_monthly_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_publish_jobs: {
        Row: {
          business_id: string
          caption: string | null
          created_at: string
          id: string
          platforms: Json | null
          result: Json | null
          scheduled_at: string | null
          status: string
          video_url: string | null
        }
        Insert: {
          business_id: string
          caption?: string | null
          created_at?: string
          id?: string
          platforms?: Json | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string
          video_url?: string | null
        }
        Update: {
          business_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          platforms?: Json | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_publish_jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_studio_sessions: {
        Row: {
          business_id: string
          completed_at: string | null
          cost_aud: number | null
          created_at: string | null
          credits_used: number | null
          duration_seconds: number | null
          fal_model: string | null
          higgsfield_job_id: string | null
          id: string
          influencer_id: string | null
          prompt: string | null
          scene_image_path: string | null
          scene_image_url: string | null
          soul_id: string | null
          status: string | null
          style: string | null
          video_url: string | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          cost_aud?: number | null
          created_at?: string | null
          credits_used?: number | null
          duration_seconds?: number | null
          fal_model?: string | null
          higgsfield_job_id?: string | null
          id?: string
          influencer_id?: string | null
          prompt?: string | null
          scene_image_path?: string | null
          scene_image_url?: string | null
          soul_id?: string | null
          status?: string | null
          style?: string | null
          video_url?: string | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          cost_aud?: number | null
          created_at?: string | null
          credits_used?: number | null
          duration_seconds?: number | null
          fal_model?: string | null
          higgsfield_job_id?: string | null
          id?: string
          influencer_id?: string | null
          prompt?: string | null
          scene_image_path?: string | null
          scene_image_url?: string | null
          soul_id?: string | null
          status?: string | null
          style?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_studio_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_studio_sessions_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "aria_influencer_library"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_usage_log: {
        Row: {
          business_id: string
          cost_aud: number | null
          created_at: string | null
          duration_seconds: number | null
          fal_request_id: string | null
          id: string
          model: string | null
          social_post_id: string | null
          status: string | null
          stripe_usage_record_id: string | null
        }
        Insert: {
          business_id: string
          cost_aud?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          fal_request_id?: string | null
          id?: string
          model?: string | null
          social_post_id?: string | null
          status?: string | null
          stripe_usage_record_id?: string | null
        }
        Update: {
          business_id?: string
          cost_aud?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          fal_request_id?: string | null
          id?: string
          model?: string | null
          social_post_id?: string | null
          status?: string | null
          stripe_usage_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_usage_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_usage_log_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_v2v_jobs: {
        Row: {
          business_id: string
          created_at: string
          estimated_cost_aud: number | null
          fal_job_id: string | null
          id: string
          op: string | null
          result_url: string | null
          session_id: string | null
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          estimated_cost_aud?: number | null
          fal_job_id?: string | null
          id?: string
          op?: string | null
          result_url?: string | null
          session_id?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          estimated_cost_aud?: number | null
          fal_job_id?: string | null
          id?: string
          op?: string | null
          result_url?: string | null
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_v2v_jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_forecasts: {
        Row: {
          business_id: string | null
          date: string
          forecast: Json
          generated_at: string | null
          id: string
        }
        Insert: {
          business_id?: string | null
          date?: string
          forecast: Json
          generated_at?: string | null
          id?: string
        }
        Update: {
          business_id?: string | null
          date?: string
          forecast?: Json
          generated_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_forecasts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_settings: {
        Row: {
          buffer_weeks: number
          business_id: string
          created_at: string | null
          default_reorder_qty: number
          id: string
          max_stock_trigger: number
          min_velocity_per_day: number
          updated_at: string | null
          velocity_period: string
        }
        Insert: {
          buffer_weeks?: number
          business_id: string
          created_at?: string | null
          default_reorder_qty?: number
          id?: string
          max_stock_trigger?: number
          min_velocity_per_day?: number
          updated_at?: string | null
          velocity_period?: string
        }
        Update: {
          buffer_weeks?: number
          business_id?: string
          created_at?: string | null
          default_reorder_qty?: number
          id?: string
          max_stock_trigger?: number
          min_velocity_per_day?: number
          updated_at?: string | null
          velocity_period?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      review_crises: {
        Row: {
          avg_rating: number | null
          business_id: string | null
          detected_at: string | null
          id: string
          is_resolved: boolean | null
          negative_count: number | null
          resolved_at: string | null
        }
        Insert: {
          avg_rating?: number | null
          business_id?: string | null
          detected_at?: string | null
          id?: string
          is_resolved?: boolean | null
          negative_count?: number | null
          resolved_at?: string | null
        }
        Update: {
          avg_rating?: number | null
          business_id?: string | null
          detected_at?: string | null
          id?: string
          is_resolved?: boolean | null
          negative_count?: number | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_crises_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      review_request_log: {
        Row: {
          business_id: string | null
          channel: string | null
          customer_id: string | null
          id: string
          sale_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          channel?: string | null
          customer_id?: string | null
          id?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          channel?: string | null
          customer_id?: string | null
          id?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_request_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          business_id: string
          channel: string
          clicked_at: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          message_preview: string | null
          resend_id: string | null
          review_id: string | null
          sale_id: string | null
          sent_at: string | null
          status: string
          twilio_sid: string | null
        }
        Insert: {
          business_id: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          message_preview?: string | null
          resend_id?: string | null
          review_id?: string | null
          sale_id?: string | null
          sent_at?: string | null
          status?: string
          twilio_sid?: string | null
        }
        Update: {
          business_id?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          message_preview?: string | null
          resend_id?: string | null
          review_id?: string | null
          sale_id?: string | null
          sent_at?: string | null
          status?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "google_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_response_templates: {
        Row: {
          body: string
          business_id: string | null
          created_at: string | null
          id: string
          is_global: boolean | null
          name: string
          rating_max: number | null
          rating_min: number | null
        }
        Insert: {
          body: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_global?: boolean | null
          name: string
          rating_max?: number | null
          rating_min?: number | null
        }
        Update: {
          body?: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_global?: boolean | null
          name?: string
          rating_max?: number | null
          rating_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_response_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          business_id: string | null
          content: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          phone: string | null
          platform: string | null
          rating: number | null
          request_sent_at: string | null
          responded_at: string | null
          response: string | null
          reviewer_name: string | null
          sentiment: string | null
          text: string | null
        }
        Insert: {
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          phone?: string | null
          platform?: string | null
          rating?: number | null
          request_sent_at?: string | null
          responded_at?: string | null
          response?: string | null
          reviewer_name?: string | null
          sentiment?: string | null
          text?: string | null
        }
        Update: {
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          phone?: string | null
          platform?: string | null
          rating?: number | null
          request_sent_at?: string | null
          responded_at?: string | null
          response?: string | null
          reviewer_name?: string | null
          sentiment?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_templates: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          name: string
          shifts: Json | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          shifts?: Json | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          shifts?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_pdf_reports: {
        Row: {
          business_id: string
          created_at: string | null
          created_by: string
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          include_share_link: boolean | null
          is_active: boolean | null
          label: string
          last_sent_at: string | null
          next_send_at: string | null
          page_path: string
          recipients: Json
          send_hour_aest: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          created_by: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: string
          id?: string
          include_share_link?: boolean | null
          is_active?: boolean | null
          label: string
          last_sent_at?: string | null
          next_send_at?: string | null
          page_path: string
          recipients?: Json
          send_hour_aest?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          include_share_link?: boolean | null
          is_active?: boolean | null
          label?: string
          last_sent_at?: string | null
          next_send_at?: string | null
          page_path?: string
          recipients?: Json
          send_hour_aest?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_pdf_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_price_changes: {
        Row: {
          business_id: string | null
          category_id: string | null
          created_at: string | null
          days_of_week: number[] | null
          discount_pct: number | null
          end_time: string | null
          id: string
          is_active: boolean | null
          label: string | null
          original_price: number | null
          product_id: string | null
          product_name: string | null
          start_time: string | null
          timed_price: number | null
        }
        Insert: {
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          discount_pct?: number | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          original_price?: number | null
          product_id?: string | null
          product_name?: string | null
          start_time?: string | null
          timed_price?: number | null
        }
        Update: {
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          days_of_week?: number[] | null
          discount_pct?: number | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          original_price?: number | null
          product_id?: string | null
          product_name?: string | null
          start_time?: string | null
          timed_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_price_changes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_price_changes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_price_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audits: {
        Row: {
          business_id: string
          created_at: string
          critical_count: number | null
          error_detail: string | null
          finished_at: string | null
          health_score: number
          id: string
          info_count: number | null
          issues_fixed: number
          issues_found: number
          pages_crawled: number
          started_at: string | null
          status: string
          warning_count: number | null
          website_url: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          critical_count?: number | null
          error_detail?: string | null
          finished_at?: string | null
          health_score?: number
          id?: string
          info_count?: number | null
          issues_fixed?: number
          issues_found?: number
          pages_crawled?: number
          started_at?: string | null
          status?: string
          warning_count?: number | null
          website_url?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          critical_count?: number | null
          error_detail?: string | null
          finished_at?: string | null
          health_score?: number
          id?: string
          info_count?: number | null
          issues_fixed?: number
          issues_found?: number
          pages_crawled?: number
          started_at?: string | null
          status?: string
          warning_count?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_audits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_competitor_analysis: {
        Row: {
          analysis: Json
          business_id: string
          competitor_url: string
          created_at: string
          id: string
        }
        Insert: {
          analysis?: Json
          business_id: string
          competitor_url: string
          created_at?: string
          id?: string
        }
        Update: {
          analysis?: Json
          business_id?: string
          competitor_url?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_competitor_analysis_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_fixes: {
        Row: {
          applied_at: string
          business_id: string
          created_at: string
          fix_applied: string | null
          id: string
          issue_id: string | null
          issue_type: string
          state: string
        }
        Insert: {
          applied_at?: string
          business_id: string
          created_at?: string
          fix_applied?: string | null
          id?: string
          issue_id?: string | null
          issue_type: string
          state?: string
        }
        Update: {
          applied_at?: string
          business_id?: string
          created_at?: string
          fix_applied?: string | null
          id?: string
          issue_id?: string | null
          issue_type?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_fixes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_fixes_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "seo_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_issues: {
        Row: {
          affected_url: string | null
          ai_fix_text: string | null
          applied_at: string | null
          audit_id: string | null
          business_id: string
          created_at: string
          detail: string | null
          fix_format: string | null
          fixed: boolean | null
          id: string
          issue_type: string
          page_url: string | null
          severity: string
          state: string
          suggested_fix: string | null
          title: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          affected_url?: string | null
          ai_fix_text?: string | null
          applied_at?: string | null
          audit_id?: string | null
          business_id: string
          created_at?: string
          detail?: string | null
          fix_format?: string | null
          fixed?: boolean | null
          id?: string
          issue_type: string
          page_url?: string | null
          severity: string
          state?: string
          suggested_fix?: string | null
          title: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          affected_url?: string | null
          ai_fix_text?: string | null
          applied_at?: string | null
          audit_id?: string | null
          business_id?: string
          created_at?: string
          detail?: string | null
          fix_format?: string | null
          fixed?: boolean | null
          id?: string
          issue_type?: string
          page_url?: string | null
          severity?: string
          state?: string
          suggested_fix?: string | null
          title?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_issues_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "seo_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_issues_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keyword_history: {
        Row: {
          business_id: string
          checked_at: string
          id: string
          keyword: string | null
          keyword_id: string
          rank: number | null
        }
        Insert: {
          business_id: string
          checked_at?: string
          id?: string
          keyword?: string | null
          keyword_id: string
          rank?: number | null
        }
        Update: {
          business_id?: string
          checked_at?: string
          id?: string
          keyword?: string | null
          keyword_id?: string
          rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_keyword_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_keyword_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "seo_keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keyword_rankings: {
        Row: {
          business_id: string | null
          created_at: string | null
          current_position: number | null
          difficulty: number | null
          id: string
          keyword: string
          last_checked_at: string | null
          position_history: Json | null
          target_url: string | null
          volume: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          current_position?: number | null
          difficulty?: number | null
          id?: string
          keyword: string
          last_checked_at?: string | null
          position_history?: Json | null
          target_url?: string | null
          volume?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          current_position?: number | null
          difficulty?: number | null
          id?: string
          keyword?: string
          last_checked_at?: string | null
          position_history?: Json | null
          target_url?: string | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_keyword_rankings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keywords: {
        Row: {
          business_id: string
          created_at: string
          current_rank: number | null
          found_on_pages: Json | null
          frequency: number | null
          id: string
          keyword: string
          last_checked_at: string | null
          previous_rank: number | null
          search_volume: number | null
          tracked: boolean | null
        }
        Insert: {
          business_id: string
          created_at?: string
          current_rank?: number | null
          found_on_pages?: Json | null
          frequency?: number | null
          id?: string
          keyword: string
          last_checked_at?: string | null
          previous_rank?: number | null
          search_volume?: number | null
          tracked?: boolean | null
        }
        Update: {
          business_id?: string
          created_at?: string
          current_rank?: number | null
          found_on_pages?: Json | null
          frequency?: number | null
          id?: string
          keyword?: string
          last_checked_at?: string | null
          previous_rank?: number | null
          search_volume?: number | null
          tracked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_keywords_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_local: {
        Row: {
          business_id: string
          checklist: Json | null
          citations_consistent: number | null
          citations_total: number | null
          gbp_completeness: number | null
          gbp_listed: boolean | null
          map_pack_rank: number | null
          review_avg: number | null
          review_count: number | null
          review_velocity_30d: number | null
          scanned_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          checklist?: Json | null
          citations_consistent?: number | null
          citations_total?: number | null
          gbp_completeness?: number | null
          gbp_listed?: boolean | null
          map_pack_rank?: number | null
          review_avg?: number | null
          review_count?: number | null
          review_velocity_30d?: number | null
          scanned_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          checklist?: Json | null
          citations_consistent?: number | null
          citations_total?: number | null
          gbp_completeness?: number | null
          gbp_listed?: boolean | null
          map_pack_rank?: number | null
          review_avg?: number | null
          review_count?: number | null
          review_velocity_30d?: number | null
          scanned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_local_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_pages: {
        Row: {
          audit_id: string | null
          business_id: string
          crawled_at: string
          depth: number | null
          h1_count: number | null
          has_schema: boolean | null
          http_status: number | null
          id: string
          images_missing_alt: number | null
          images_total: number | null
          load_ms: number | null
          meta_description: string | null
          meta_description_length: number | null
          page_size_kb: number | null
          parent_url: string | null
          title: string | null
          title_length: number | null
          url: string
          word_count: number | null
        }
        Insert: {
          audit_id?: string | null
          business_id: string
          crawled_at?: string
          depth?: number | null
          h1_count?: number | null
          has_schema?: boolean | null
          http_status?: number | null
          id?: string
          images_missing_alt?: number | null
          images_total?: number | null
          load_ms?: number | null
          meta_description?: string | null
          meta_description_length?: number | null
          page_size_kb?: number | null
          parent_url?: string | null
          title?: string | null
          title_length?: number | null
          url: string
          word_count?: number | null
        }
        Update: {
          audit_id?: string | null
          business_id?: string
          crawled_at?: string
          depth?: number | null
          h1_count?: number | null
          has_schema?: boolean | null
          http_status?: number | null
          id?: string
          images_missing_alt?: number | null
          images_total?: number | null
          load_ms?: number | null
          meta_description?: string | null
          meta_description_length?: number | null
          page_size_kb?: number | null
          parent_url?: string | null
          title?: string | null
          title_length?: number | null
          url?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_pages_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "seo_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_pages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swaps: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          requester_id: string | null
          shift_date: string
          status: string | null
          target_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          requester_id?: string | null
          shift_date: string
          status?: string | null
          target_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          requester_id?: string | null
          shift_date?: string
          status?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_swaps_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_connections: {
        Row: {
          access_token: string
          business_id: string | null
          connected_at: string | null
          id: string
          last_synced_at: string | null
          shop_name: string | null
          shopify_shop_id: string | null
          store_url: string
          sync_error: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          business_id?: string | null
          connected_at?: string | null
          id?: string
          last_synced_at?: string | null
          shop_name?: string | null
          shopify_shop_id?: string | null
          store_url: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          business_id?: string | null
          connected_at?: string | null
          id?: string
          last_synced_at?: string | null
          shop_name?: string | null
          shopify_shop_id?: string | null
          store_url?: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          business_id: string
          connected_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          page_id: string | null
          page_name: string | null
          platform: string
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          business_id: string
          connected_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          page_id?: string | null
          page_name?: string | null
          platform: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          business_id?: string
          connected_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          page_id?: string | null
          page_name?: string | null
          platform?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_asset_library: {
        Row: {
          asset_type: string | null
          business_id: string
          created_at: string | null
          id: string
          label: string | null
          tags: string[] | null
          thumbnail_url: string | null
          url: string
          used_count: number | null
        }
        Insert: {
          asset_type?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          label?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          url: string
          used_count?: number | null
        }
        Update: {
          asset_type?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          label?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          url?: string
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_asset_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token: string
          account_handle: string | null
          business_id: string | null
          connected_at: string | null
          follower_count: number | null
          id: string
          instagram_account_id: string | null
          is_active: boolean | null
          last_synced_at: string | null
          platform: string
          platform_account_id: string | null
          platform_account_name: string | null
          platform_page_id: string | null
          profile_picture: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token: string
          account_handle?: string | null
          business_id?: string | null
          connected_at?: string | null
          follower_count?: number | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          platform: string
          platform_account_id?: string | null
          platform_account_name?: string | null
          platform_page_id?: string | null
          profile_picture?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string
          account_handle?: string | null
          business_id?: string | null
          connected_at?: string | null
          follower_count?: number | null
          id?: string
          instagram_account_id?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          platform?: string
          platform_account_id?: string | null
          platform_account_name?: string | null
          platform_page_id?: string | null
          profile_picture?: string | null
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_content_calendar: {
        Row: {
          ai_suggested: boolean | null
          business_id: string
          created_at: string | null
          date: string
          id: string
          notes: string | null
          occasion: string | null
          platforms: string[] | null
          post_id: string | null
          status: string | null
          theme: string | null
        }
        Insert: {
          ai_suggested?: boolean | null
          business_id: string
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          occasion?: string | null
          platforms?: string[] | null
          post_id?: string | null
          status?: string | null
          theme?: string | null
        }
        Update: {
          ai_suggested?: boolean | null
          business_id?: string
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          platforms?: string[] | null
          post_id?: string | null
          status?: string | null
          theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_content_calendar_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_content_library: {
        Row: {
          asset_type: string | null
          business_id: string | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string | null
          tags: string[] | null
        }
        Insert: {
          asset_type?: string | null
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          tags?: string[] | null
        }
        Update: {
          asset_type?: string | null
          business_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "social_content_library_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_hashtag_stats: {
        Row: {
          avg_likes: number | null
          avg_reach: number | null
          business_id: string
          hashtag: string
          id: string
          last_used_at: string | null
          updated_at: string | null
          use_count: number | null
        }
        Insert: {
          avg_likes?: number | null
          avg_reach?: number | null
          business_id: string
          hashtag: string
          id?: string
          last_used_at?: string | null
          updated_at?: string | null
          use_count?: number | null
        }
        Update: {
          avg_likes?: number | null
          avg_reach?: number | null
          business_id?: string
          hashtag?: string
          id?: string
          last_used_at?: string | null
          updated_at?: string | null
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_hashtag_stats_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_inbox: {
        Row: {
          author_handle: string | null
          author_name: string | null
          business_id: string | null
          content: string | null
          id: string
          is_read: boolean | null
          message_type: string | null
          platform: string | null
          post_url: string | null
          received_at: string | null
          replied_at: string | null
          reply_text: string | null
        }
        Insert: {
          author_handle?: string | null
          author_name?: string | null
          business_id?: string | null
          content?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          platform?: string | null
          post_url?: string | null
          received_at?: string | null
          replied_at?: string | null
          reply_text?: string | null
        }
        Update: {
          author_handle?: string | null
          author_name?: string | null
          business_id?: string | null
          content?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: string | null
          platform?: string | null
          post_url?: string | null
          received_at?: string | null
          replied_at?: string | null
          reply_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_inbox_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_owner_requests: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          occasion: string | null
          recurrence_rule: string | null
          request_text: string
          resolved_post_ids: string[] | null
          schedule_kind: string | null
          specific_date: string | null
          status: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          occasion?: string | null
          recurrence_rule?: string | null
          request_text: string
          resolved_post_ids?: string[] | null
          schedule_kind?: string | null
          specific_date?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          occasion?: string | null
          recurrence_rule?: string | null
          request_text?: string
          resolved_post_ids?: string[] | null
          schedule_kind?: string | null
          specific_date?: string | null
          status?: string | null
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          aria_reasoning: string | null
          audio_url: string | null
          business_id: string | null
          caption: string
          comments: number | null
          content_calendar_month: string | null
          created_at: string | null
          engagement_data: Json | null
          fal_request_id: string | null
          hashtags: string[] | null
          id: string
          image_credit: string | null
          image_prompt: string | null
          image_url: string | null
          impressions: number | null
          industry_context: string | null
          influencer_id: string | null
          influencer_image_url: string | null
          likes: number | null
          media_id: string | null
          owner_request: string | null
          performance: Json | null
          platform: string
          platform_post_id: string | null
          platform_url: string | null
          post_type: string | null
          publish_error: string | null
          published_at: string | null
          reach: number | null
          recurrence_rule: string | null
          reel_concept: string | null
          reel_cost_aud: number | null
          reel_duration_seconds: number | null
          reel_script: string | null
          schedule_kind: string | null
          scheduled_for: string | null
          shares: number | null
          status: string | null
          story_expires_at: string | null
          video_url: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          aria_reasoning?: string | null
          audio_url?: string | null
          business_id?: string | null
          caption: string
          comments?: number | null
          content_calendar_month?: string | null
          created_at?: string | null
          engagement_data?: Json | null
          fal_request_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_credit?: string | null
          image_prompt?: string | null
          image_url?: string | null
          impressions?: number | null
          industry_context?: string | null
          influencer_id?: string | null
          influencer_image_url?: string | null
          likes?: number | null
          media_id?: string | null
          owner_request?: string | null
          performance?: Json | null
          platform: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_type?: string | null
          publish_error?: string | null
          published_at?: string | null
          reach?: number | null
          recurrence_rule?: string | null
          reel_concept?: string | null
          reel_cost_aud?: number | null
          reel_duration_seconds?: number | null
          reel_script?: string | null
          schedule_kind?: string | null
          scheduled_for?: string | null
          shares?: number | null
          status?: string | null
          story_expires_at?: string | null
          video_url?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          aria_reasoning?: string | null
          audio_url?: string | null
          business_id?: string | null
          caption?: string
          comments?: number | null
          content_calendar_month?: string | null
          created_at?: string | null
          engagement_data?: Json | null
          fal_request_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_credit?: string | null
          image_prompt?: string | null
          image_url?: string | null
          impressions?: number | null
          industry_context?: string | null
          influencer_id?: string | null
          influencer_image_url?: string | null
          likes?: number | null
          media_id?: string | null
          owner_request?: string | null
          performance?: Json | null
          platform?: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_type?: string | null
          publish_error?: string | null
          published_at?: string | null
          reach?: number | null
          recurrence_rule?: string | null
          reel_concept?: string | null
          reel_cost_aud?: number | null
          reel_duration_seconds?: number | null
          reel_script?: string | null
          schedule_kind?: string | null
          scheduled_for?: string | null
          shares?: number | null
          status?: string | null
          story_expires_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "aria_influencer_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "business_media"
            referencedColumns: ["id"]
          },
        ]
      }
      social_preferences: {
        Row: {
          auto_hashtags: string[] | null
          brand_voice: string | null
          business_id: string | null
          business_tagline: string | null
          created_at: string | null
          id: string
          post_frequency: string | null
          preferred_post_times: Json | null
          reels_addon_accepted_at: string | null
          reels_addon_accepted_by: string | null
          reels_enabled: boolean | null
          target_audience: string | null
          topics_to_avoid: string | null
        }
        Insert: {
          auto_hashtags?: string[] | null
          brand_voice?: string | null
          business_id?: string | null
          business_tagline?: string | null
          created_at?: string | null
          id?: string
          post_frequency?: string | null
          preferred_post_times?: Json | null
          reels_addon_accepted_at?: string | null
          reels_addon_accepted_by?: string | null
          reels_enabled?: boolean | null
          target_audience?: string | null
          topics_to_avoid?: string | null
        }
        Update: {
          auto_hashtags?: string[] | null
          brand_voice?: string | null
          business_id?: string | null
          business_tagline?: string | null
          created_at?: string | null
          id?: string
          post_frequency?: string | null
          preferred_post_times?: Json | null
          reels_addon_accepted_at?: string | null
          reels_addon_accepted_by?: string | null
          reels_enabled?: boolean | null
          target_audience?: string | null
          topics_to_avoid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_scheduling_preferences: {
        Row: {
          blackout_hours: number[] | null
          business_id: string
          created_at: string | null
          custom_times: string[] | null
          id: string
          platform: string
          updated_at: string | null
        }
        Insert: {
          blackout_hours?: number[] | null
          business_id: string
          created_at?: string | null
          custom_times?: string[] | null
          id?: string
          platform: string
          updated_at?: string | null
        }
        Update: {
          blackout_hours?: number[] | null
          business_id?: string
          created_at?: string | null
          custom_times?: string[] | null
          id?: string
          platform?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_scheduling_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      split_group_members: {
        Row: {
          avatar_color: string | null
          business_id: string
          current_balance: number
          customer_id: string | null
          email: string | null
          group_id: string
          id: string
          is_active: boolean
          joined_at: string
          last_activity_at: string | null
          name: string
          phone: string | null
          total_owed_to_date: number
          total_paid_to_date: number
        }
        Insert: {
          avatar_color?: string | null
          business_id: string
          current_balance?: number
          customer_id?: string | null
          email?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          joined_at?: string
          last_activity_at?: string | null
          name: string
          phone?: string | null
          total_owed_to_date?: number
          total_paid_to_date?: number
        }
        Update: {
          avatar_color?: string | null
          business_id?: string
          current_balance?: number
          customer_id?: string | null
          email?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          last_activity_at?: string | null
          name?: string
          phone?: string | null
          total_owed_to_date?: number
          total_paid_to_date?: number
        }
        Relationships: [
          {
            foreignKeyName: "split_group_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_group_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "split_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      split_groups: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_visit_at: string | null
          name: string
          total_spend: number
          total_visits: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_visit_at?: string | null
          name: string
          total_spend?: number
          total_visits?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_visit_at?: string | null
          name?: string
          total_spend?: number
          total_visits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      split_ious: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          dispute_reason: string | null
          disputed_at: string | null
          disputed_by: string | null
          from_member_id: string | null
          from_name: string
          group_id: string | null
          id: string
          notes: string | null
          sale_id: string | null
          settled_at: string | null
          settlement_method: string | null
          settlement_reference: string | null
          split_id: string | null
          status: string
          to_member_id: string | null
          to_name: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          from_member_id?: string | null
          from_name: string
          group_id?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          settled_at?: string | null
          settlement_method?: string | null
          settlement_reference?: string | null
          split_id?: string | null
          status?: string
          to_member_id?: string | null
          to_name: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          from_member_id?: string | null
          from_name?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          settled_at?: string | null
          settlement_method?: string | null
          settlement_reference?: string | null
          split_id?: string | null
          status?: string
          to_member_id?: string | null
          to_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_ious_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_ious_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "split_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_ious_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "split_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_ious_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_ious_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_ious_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "split_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      square_connections: {
        Row: {
          access_token: string
          business_id: string | null
          connected_at: string | null
          id: string
          last_synced_at: string | null
          refresh_token: string
          scope: string | null
          square_location_id: string | null
          square_merchant_id: string
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token: string
          business_id?: string | null
          connected_at?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token: string
          scope?: string | null
          square_location_id?: string | null
          square_merchant_id: string
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string
          business_id?: string | null
          connected_at?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token?: string
          scope?: string | null
          square_location_id?: string | null
          square_merchant_id?: string
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "square_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      square_customers: {
        Row: {
          average_basket_cents: number | null
          business_id: string | null
          churn_risk: string | null
          days_since_last_visit: number | null
          email: string | null
          first_visit_at: string | null
          id: string
          last_visit_at: string | null
          name: string | null
          phone: string | null
          square_customer_id: string
          tags: string[] | null
          total_spent_cents: number | null
          visit_count: number | null
          visit_frequency_days: number | null
        }
        Insert: {
          average_basket_cents?: number | null
          business_id?: string | null
          churn_risk?: string | null
          days_since_last_visit?: number | null
          email?: string | null
          first_visit_at?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string | null
          phone?: string | null
          square_customer_id: string
          tags?: string[] | null
          total_spent_cents?: number | null
          visit_count?: number | null
          visit_frequency_days?: number | null
        }
        Update: {
          average_basket_cents?: number | null
          business_id?: string | null
          churn_risk?: string | null
          days_since_last_visit?: number | null
          email?: string | null
          first_visit_at?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string | null
          phone?: string | null
          square_customer_id?: string
          tags?: string[] | null
          total_spent_cents?: number | null
          visit_count?: number | null
          visit_frequency_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "square_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      square_items: {
        Row: {
          barcode: string | null
          business_id: string | null
          category: string | null
          cost_cents: number | null
          current_stock: number | null
          description: string | null
          id: string
          image_url: string | null
          last_updated_at: string | null
          name: string
          price_cents: number | null
          reorder_point: number | null
          sku: string | null
          square_item_id: string
          square_variation_id: string | null
          track_inventory: boolean | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          business_id?: string | null
          category?: string | null
          cost_cents?: number | null
          current_stock?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          last_updated_at?: string | null
          name: string
          price_cents?: number | null
          reorder_point?: number | null
          sku?: string | null
          square_item_id: string
          square_variation_id?: string | null
          track_inventory?: boolean | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          business_id?: string | null
          category?: string | null
          cost_cents?: number | null
          current_stock?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          last_updated_at?: string | null
          name?: string
          price_cents?: number | null
          reorder_point?: number | null
          sku?: string | null
          square_item_id?: string
          square_variation_id?: string | null
          track_inventory?: boolean | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "square_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      square_sales: {
        Row: {
          business_id: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_cents: number | null
          id: string
          line_items: Json | null
          location_id: string | null
          payment_method: string | null
          sold_at: string
          square_order_id: string
          square_payment_id: string | null
          tax_cents: number | null
          total_cents: number
        }
        Insert: {
          business_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_cents?: number | null
          id?: string
          line_items?: Json | null
          location_id?: string | null
          payment_method?: string | null
          sold_at: string
          square_order_id: string
          square_payment_id?: string | null
          tax_cents?: number | null
          total_cents: number
        }
        Update: {
          business_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_cents?: number | null
          id?: string
          line_items?: Json | null
          location_id?: string | null
          payment_method?: string | null
          sold_at?: string
          square_order_id?: string
          square_payment_id?: string | null
          tax_cents?: number | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "square_sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_announcements: {
        Row: {
          body: string
          business_id: string
          created_at: string
          expires_at: string | null
          id: string
          posted_by: string
          priority: string
          title: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          posted_by: string
          priority?: string
          title: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          posted_by?: string
          priority?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_announcements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_areas: {
        Row: {
          business_id: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          outlet_id: string | null
          sort_order: number
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          outlet_id?: string | null
          sort_order?: number
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          outlet_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_areas_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_areas_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availability: {
        Row: {
          business_id: string
          created_at: string
          day_of_week: number | null
          id: string
          is_recurring: boolean
          reason: string | null
          specific_date: string | null
          staff_member_id: string
          unavailable_from: string | null
          unavailable_until: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_recurring?: boolean
          reason?: string | null
          specific_date?: string | null
          staff_member_id: string
          unavailable_from?: string | null
          unavailable_until?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_recurring?: boolean
          reason?: string | null
          specific_date?: string | null
          staff_member_id?: string
          unavailable_from?: string | null
          unavailable_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          business_id: string | null
          document_name: string
          document_type: string
          expiry_date: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_verified: boolean
          notes: string | null
          staff_id: string | null
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          business_id?: string | null
          document_name: string
          document_type: string
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          staff_id?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          business_id?: string | null
          document_name?: string
          document_type?: string
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          staff_id?: string | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          staff_member_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          staff_member_id: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          staff_member_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_id: string | null
          created_at: string | null
          days_taken: number | null
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          return_date: string | null
          staff_id: string | null
          staff_name: string | null
          start_date: string
          status: string | null
          swap_shift_date: string | null
          swap_type: string | null
          swap_with_staff_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          created_at?: string | null
          days_taken?: number | null
          end_date: string
          id?: string
          leave_type: string
          notes?: string | null
          return_date?: string | null
          staff_id?: string | null
          staff_name?: string | null
          start_date: string
          status?: string | null
          swap_shift_date?: string | null
          swap_type?: string | null
          swap_with_staff_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string | null
          created_at?: string | null
          days_taken?: number | null
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          return_date?: string | null
          staff_id?: string | null
          staff_name?: string | null
          start_date?: string
          status?: string | null
          swap_shift_date?: string | null
          swap_type?: string | null
          swap_with_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_swap_with_staff_id_fkey"
            columns: ["swap_with_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave_balances: {
        Row: {
          accrued_days: number
          adjusted_days: number
          business_id: string
          created_at: string
          id: string
          leave_type: string
          opening_balance_days: number
          staff_member_id: string
          taken_days: number
          updated_at: string
          year: number
        }
        Insert: {
          accrued_days?: number
          adjusted_days?: number
          business_id: string
          created_at?: string
          id?: string
          leave_type: string
          opening_balance_days?: number
          staff_member_id: string
          taken_days?: number
          updated_at?: string
          year: number
        }
        Update: {
          accrued_days?: number
          adjusted_days?: number
          business_id?: string
          created_at?: string
          id?: string
          leave_type?: string
          opening_balance_days?: number
          staff_member_id?: string
          taken_days?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_balances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_balances_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_member_skills: {
        Row: {
          certified_at: string | null
          skill_id: string
          staff_member_id: string
        }
        Insert: {
          certified_at?: string | null
          skill_id: string
          staff_member_id: string
        }
        Update: {
          certified_at?: string | null
          skill_id?: string
          staff_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_member_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "staff_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_member_skills_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          award_classification: string | null
          bank_account: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          base_rate_cents: number | null
          business_id: string | null
          color: string | null
          created_at: string | null
          custom_fields: Json | null
          date_of_birth: string | null
          department: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employment_type: string | null
          end_date: string | null
          first_name: string
          gender: string | null
          hourly_rate: number | null
          id: string
          invite_sent_at: string | null
          last_name: string
          leave_balance_days: number | null
          mobile: string | null
          name: string | null
          notes: string | null
          overtime_multiplier: number | null
          passport_country: string | null
          passport_expiry_date: string | null
          pay_frequency: string | null
          pay_per_annum_cents: number | null
          pay_rate_cents: number | null
          pay_type: string | null
          personal_email: string | null
          personal_leave_balance_days: number | null
          ph_multiplier: number | null
          portal_enabled: boolean
          pos_staff_id: string | null
          position: string
          preferred_name: string | null
          profile_photo_url: string | null
          right_to_work_verified: boolean | null
          right_to_work_verified_date: string | null
          saturday_multiplier: number | null
          start_date: string | null
          status: string | null
          sunday_multiplier: number | null
          superannuation_rate: number | null
          tax_file_number: string | null
          tax_free_threshold: boolean | null
          updated_at: string | null
          user_id: string | null
          visa_expiry_date: string | null
          visa_subclass: string | null
          visa_type: string | null
          visa_work_restrictions: string | null
          work_email: string | null
          ytd_gross_cents: number | null
          ytd_super_cents: number | null
          ytd_tax_cents: number | null
        }
        Insert: {
          award_classification?: string | null
          bank_account?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          base_rate_cents?: number | null
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          department?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string | null
          end_date?: string | null
          first_name: string
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          invite_sent_at?: string | null
          last_name: string
          leave_balance_days?: number | null
          mobile?: string | null
          name?: string | null
          notes?: string | null
          overtime_multiplier?: number | null
          passport_country?: string | null
          passport_expiry_date?: string | null
          pay_frequency?: string | null
          pay_per_annum_cents?: number | null
          pay_rate_cents?: number | null
          pay_type?: string | null
          personal_email?: string | null
          personal_leave_balance_days?: number | null
          ph_multiplier?: number | null
          portal_enabled?: boolean
          pos_staff_id?: string | null
          position: string
          preferred_name?: string | null
          profile_photo_url?: string | null
          right_to_work_verified?: boolean | null
          right_to_work_verified_date?: string | null
          saturday_multiplier?: number | null
          start_date?: string | null
          status?: string | null
          sunday_multiplier?: number | null
          superannuation_rate?: number | null
          tax_file_number?: string | null
          tax_free_threshold?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          visa_expiry_date?: string | null
          visa_subclass?: string | null
          visa_type?: string | null
          visa_work_restrictions?: string | null
          work_email?: string | null
          ytd_gross_cents?: number | null
          ytd_super_cents?: number | null
          ytd_tax_cents?: number | null
        }
        Update: {
          award_classification?: string | null
          bank_account?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          base_rate_cents?: number | null
          business_id?: string | null
          color?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          department?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string | null
          end_date?: string | null
          first_name?: string
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          invite_sent_at?: string | null
          last_name?: string
          leave_balance_days?: number | null
          mobile?: string | null
          name?: string | null
          notes?: string | null
          overtime_multiplier?: number | null
          passport_country?: string | null
          passport_expiry_date?: string | null
          pay_frequency?: string | null
          pay_per_annum_cents?: number | null
          pay_rate_cents?: number | null
          pay_type?: string | null
          personal_email?: string | null
          personal_leave_balance_days?: number | null
          ph_multiplier?: number | null
          portal_enabled?: boolean
          pos_staff_id?: string | null
          position?: string
          preferred_name?: string | null
          profile_photo_url?: string | null
          right_to_work_verified?: boolean | null
          right_to_work_verified_date?: string | null
          saturday_multiplier?: number | null
          start_date?: string | null
          status?: string | null
          sunday_multiplier?: number | null
          superannuation_rate?: number | null
          tax_file_number?: string | null
          tax_free_threshold?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          visa_expiry_date?: string | null
          visa_subclass?: string | null
          visa_type?: string | null
          visa_work_restrictions?: string | null
          work_email?: string | null
          ytd_gross_cents?: number | null
          ytd_super_cents?: number | null
          ytd_tax_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_pos_staff_id_fkey"
            columns: ["pos_staff_id"]
            isOneToOne: false
            referencedRelation: "pos_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_messages: {
        Row: {
          body: string
          business_id: string
          created_at: string
          id: string
          is_broadcast: boolean
          read_at: string | null
          recipient_id: string | null
          sender_id: string
          subject: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          read_at?: string | null
          recipient_id?: string | null
          sender_id: string
          subject?: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pay_rates: {
        Row: {
          applies_from_time: string | null
          applies_to_days: number[] | null
          applies_until_time: string | null
          business_id: string
          created_at: string
          effective_from: string
          effective_until: string | null
          hourly_rate_cents: number
          id: string
          notes: string | null
          rate_type: string
          staff_member_id: string
          updated_at: string
        }
        Insert: {
          applies_from_time?: string | null
          applies_to_days?: number[] | null
          applies_until_time?: string | null
          business_id: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          hourly_rate_cents: number
          id?: string
          notes?: string | null
          rate_type?: string
          staff_member_id: string
          updated_at?: string
        }
        Update: {
          applies_from_time?: string | null
          applies_to_days?: number[] | null
          applies_until_time?: string | null
          business_id?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          hourly_rate_cents?: number
          id?: string
          notes?: string | null
          rate_type?: string
          staff_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pay_rates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pay_rates_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_recipe_training: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          recipe_id: string
          signed_off_by: string | null
          staff_member_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          recipe_id: string
          signed_off_by?: string | null
          staff_member_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          recipe_id?: string
          signed_off_by?: string | null
          staff_member_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_recipe_training_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_recipe_training_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_recipe_training_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_recipe_training_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          ai_generated: boolean
          area_id: string | null
          break_minutes: number
          business_id: string
          confirmed_by_staff: boolean
          cost_cents: number | null
          created_at: string | null
          end_time: string | null
          id: string
          is_recurring: boolean
          notes: string | null
          outlet_id: string | null
          recurrence_rule: string | null
          role: string | null
          shift_date: string | null
          staff_id: string | null
          staff_member_id: string | null
          staff_name: string | null
          start_time: string
          status: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          area_id?: string | null
          break_minutes?: number
          business_id: string
          confirmed_by_staff?: boolean
          cost_cents?: number | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          outlet_id?: string | null
          recurrence_rule?: string | null
          role?: string | null
          shift_date?: string | null
          staff_id?: string | null
          staff_member_id?: string | null
          staff_name?: string | null
          start_time: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          area_id?: string | null
          break_minutes?: number
          business_id?: string
          confirmed_by_staff?: boolean
          cost_cents?: number | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          outlet_id?: string | null
          recurrence_rule?: string | null
          role?: string | null
          shift_date?: string | null
          staff_id?: string | null
          staff_member_id?: string | null
          staff_name?: string | null
          start_time?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "staff_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "pos_outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "pos_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_skills: {
        Row: {
          business_id: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_skills_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          item_id: string
          movement_type: string
          new_stock: number
          notes: string | null
          quantity_added: number
          scanned_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          item_id: string
          movement_type?: string
          new_stock: number
          notes?: string | null
          quantity_added: number
          scanned_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          new_stock?: number
          notes?: string | null
          quantity_added?: number
          scanned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          payload: Json | null
          processed: boolean | null
          received_at: string | null
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed?: boolean | null
          received_at?: string | null
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed?: boolean | null
          received_at?: string | null
          type?: string
        }
        Relationships: []
      }
      super_obligations: {
        Row: {
          business_id: string
          created_at: string | null
          due_date: string | null
          id: string
          ordinary_time_earnings: number | null
          paid_at: string | null
          payment_due_date: string | null
          period_end: string
          period_start: string
          quarter: string | null
          staff_member_id: string | null
          staff_name: string | null
          status: string | null
          super_amount: number | null
          super_amount_owed: number | null
          super_rate: number | null
          super_rate_pct: number | null
          total_ordinary_time_earnings: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          ordinary_time_earnings?: number | null
          paid_at?: string | null
          payment_due_date?: string | null
          period_end: string
          period_start: string
          quarter?: string | null
          staff_member_id?: string | null
          staff_name?: string | null
          status?: string | null
          super_amount?: number | null
          super_amount_owed?: number | null
          super_rate?: number | null
          super_rate_pct?: number | null
          total_ordinary_time_earnings?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          ordinary_time_earnings?: number | null
          paid_at?: string | null
          payment_due_date?: string | null
          period_end?: string
          period_start?: string
          quarter?: string | null
          staff_member_id?: string | null
          staff_name?: string | null
          status?: string | null
          super_amount?: number | null
          super_amount_owed?: number | null
          super_rate?: number | null
          super_rate_pct?: number | null
          total_ordinary_time_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "super_obligations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ai_suggestions: {
        Row: {
          accepted: boolean | null
          business_id: string | null
          created_at: string | null
          current_qty: number | null
          id: string
          po_id: string | null
          price_change_pct: number | null
          product_id: string | null
          product_name: string | null
          reason: string | null
          stock_days_remaining: number | null
          suggested_qty: number | null
          supplier_id: string | null
          trend: string | null
          velocity_per_week: number | null
        }
        Insert: {
          accepted?: boolean | null
          business_id?: string | null
          created_at?: string | null
          current_qty?: number | null
          id?: string
          po_id?: string | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name?: string | null
          reason?: string | null
          stock_days_remaining?: number | null
          suggested_qty?: number | null
          supplier_id?: string | null
          trend?: string | null
          velocity_per_week?: number | null
        }
        Update: {
          accepted?: boolean | null
          business_id?: string | null
          created_at?: string | null
          current_qty?: number | null
          id?: string
          po_id?: string | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name?: string | null
          reason?: string | null
          stock_days_remaining?: number | null
          suggested_qty?: number | null
          supplier_id?: string | null
          trend?: string | null
          velocity_per_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ai_suggestions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ai_suggestions_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "warehouse_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ai_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ai_suggestions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contracts: {
        Row: {
          business_id: string
          contract_end: string | null
          contract_start: string | null
          created_at: string
          id: string
          renewal_date: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          terms: Json | null
        }
        Insert: {
          business_id: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          id?: string
          renewal_date?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          terms?: Json | null
        }
        Update: {
          business_id?: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          id?: string
          renewal_date?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          terms?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          amount: number | null
          business_id: string
          category: string | null
          created_at: string | null
          due_date: string | null
          expense_category: string | null
          expense_description: string | null
          gst_amount: number | null
          id: string
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          possible_causes: string | null
          source: string | null
          status: string | null
          supplier_name: string
          total: number
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          business_id: string
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          expense_category?: string | null
          expense_description?: string | null
          gst_amount?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          possible_causes?: string | null
          source?: string | null
          status?: string | null
          supplier_name: string
          total?: number
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          business_id?: string
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          expense_category?: string | null
          expense_description?: string | null
          gst_amount?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          possible_causes?: string | null
          source?: string | null
          status?: string | null
          supplier_name?: string
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_negotiation_briefs: {
        Row: {
          annual_saving_if_successful: number | null
          brief_content: string | null
          business_id: string
          created_at: string | null
          draft_email_body: string | null
          draft_email_subject: string | null
          draft_talking_points: Json | null
          expected_outcome: string | null
          id: string
          leverage_arguments: Json | null
          monthly_saving_if_successful: number | null
          negotiation_goal: string | null
          profile_id: string | null
          status: string | null
          success_probability: number | null
          supplier_id: string | null
          supplier_name: string | null
          trigger_reason: string | null
        }
        Insert: {
          annual_saving_if_successful?: number | null
          brief_content?: string | null
          business_id: string
          created_at?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          draft_talking_points?: Json | null
          expected_outcome?: string | null
          id?: string
          leverage_arguments?: Json | null
          monthly_saving_if_successful?: number | null
          negotiation_goal?: string | null
          profile_id?: string | null
          status?: string | null
          success_probability?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          trigger_reason?: string | null
        }
        Update: {
          annual_saving_if_successful?: number | null
          brief_content?: string | null
          business_id?: string
          created_at?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          draft_talking_points?: Json | null
          expected_outcome?: string | null
          id?: string
          leverage_arguments?: Json | null
          monthly_saving_if_successful?: number | null
          negotiation_goal?: string | null
          profile_id?: string | null
          status?: string | null
          success_probability?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          trigger_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_negotiation_briefs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_negotiation_profiles: {
        Row: {
          avg_order_value_12m: number | null
          business_id: string
          contract_renewal_date: string | null
          created_at: string
          id: string
          invoice_accuracy_pct: number | null
          leverage_factors: Json | null
          leverage_score: number | null
          overcharge_count_12m: number | null
          payment_on_time_pct: number | null
          price_creep_pct: number | null
          price_creep_products: Json | null
          supplier_id: string | null
          supplier_name: string
          total_orders_12m: number | null
          total_overcharge_12m: number | null
          total_spend_12m: number | null
          vs_competitor_supplier_pct: number | null
        }
        Insert: {
          avg_order_value_12m?: number | null
          business_id: string
          contract_renewal_date?: string | null
          created_at?: string
          id?: string
          invoice_accuracy_pct?: number | null
          leverage_factors?: Json | null
          leverage_score?: number | null
          overcharge_count_12m?: number | null
          payment_on_time_pct?: number | null
          price_creep_pct?: number | null
          price_creep_products?: Json | null
          supplier_id?: string | null
          supplier_name: string
          total_orders_12m?: number | null
          total_overcharge_12m?: number | null
          total_spend_12m?: number | null
          vs_competitor_supplier_pct?: number | null
        }
        Update: {
          avg_order_value_12m?: number | null
          business_id?: string
          contract_renewal_date?: string | null
          created_at?: string
          id?: string
          invoice_accuracy_pct?: number | null
          leverage_factors?: Json | null
          leverage_score?: number | null
          overcharge_count_12m?: number | null
          payment_on_time_pct?: number | null
          price_creep_pct?: number | null
          price_creep_products?: Json | null
          supplier_id?: string | null
          supplier_name?: string
          total_orders_12m?: number | null
          total_overcharge_12m?: number | null
          total_spend_12m?: number | null
          vs_competitor_supplier_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_negotiation_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_items: {
        Row: {
          barcode: string | null
          brand: string | null
          business_id: string
          case_price: number | null
          case_qty: number | null
          category: string | null
          created_at: string | null
          effective_date: string | null
          id: string
          in_stock: boolean | null
          list_id: string
          matched_product_id: string | null
          product_name: string
          sku: string | null
          supplier_name: string
          unit_of_measure: string | null
          unit_price: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          business_id: string
          case_price?: number | null
          case_qty?: number | null
          category?: string | null
          created_at?: string | null
          effective_date?: string | null
          id?: string
          in_stock?: boolean | null
          list_id: string
          matched_product_id?: string | null
          product_name: string
          sku?: string | null
          supplier_name: string
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          business_id?: string
          case_price?: number | null
          case_qty?: number | null
          category?: string | null
          created_at?: string | null
          effective_date?: string | null
          id?: string
          in_stock?: boolean | null
          list_id?: string
          matched_product_id?: string | null
          product_name?: string
          sku?: string | null
          supplier_name?: string
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "supplier_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_lists: {
        Row: {
          business_id: string
          file_name: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          item_count: number | null
          notes: string | null
          parsed_at: string | null
          supplier_name: string
          supplier_type: string | null
          uploaded_at: string | null
        }
        Insert: {
          business_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          item_count?: number | null
          notes?: string | null
          parsed_at?: string | null
          supplier_name: string
          supplier_type?: string | null
          uploaded_at?: string | null
        }
        Update: {
          business_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          item_count?: number | null
          notes?: string | null
          parsed_at?: string | null
          supplier_name?: string
          supplier_type?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_price_variances: {
        Row: {
          business_id: string
          charged_price: number | null
          created_at: string
          detected_at: string | null
          expected_price: number | null
          id: string
          product_name: string | null
          supplier_id: string | null
          supplier_name: string | null
          variance_amount: number | null
          variance_pct: number | null
        }
        Insert: {
          business_id: string
          charged_price?: number | null
          created_at?: string
          detected_at?: string | null
          expected_price?: number | null
          id?: string
          product_name?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          variance_amount?: number | null
          variance_pct?: number | null
        }
        Update: {
          business_id?: string
          charged_price?: number | null
          created_at?: string
          detected_at?: string | null
          expected_price?: number | null
          id?: string
          product_name?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          variance_amount?: number | null
          variance_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_variances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_prices: {
        Row: {
          business_id: string | null
          cost_price: number
          id: string
          product_id: string | null
          product_name: string
          recorded_at: string | null
          source: string | null
          supplier_code: string | null
          supplier_id: string | null
        }
        Insert: {
          business_id?: string | null
          cost_price: number
          id?: string
          product_id?: string | null
          product_name: string
          recorded_at?: string | null
          source?: string | null
          supplier_code?: string | null
          supplier_id?: string | null
        }
        Update: {
          business_id?: string | null
          cost_price?: number
          id?: string
          product_id?: string | null
          product_name?: string
          recorded_at?: string | null
          source?: string | null
          supplier_code?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_prices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          aria_attempted: boolean
          aria_diagnosis: string | null
          assigned_to: string | null
          business_id: string | null
          category: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          message: string
          priority: string | null
          resolution: string | null
          resolved_at: string | null
          source: string
          status: string | null
          subject: string
          user_email: string
        }
        Insert: {
          admin_reply?: string | null
          aria_attempted?: boolean
          aria_diagnosis?: string | null
          assigned_to?: string | null
          business_id?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          priority?: string | null
          resolution?: string | null
          resolved_at?: string | null
          source?: string
          status?: string | null
          subject: string
          user_email: string
        }
        Update: {
          admin_reply?: string | null
          aria_attempted?: boolean
          aria_diagnosis?: string | null
          assigned_to?: string | null
          business_id?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          resolution?: string | null
          resolved_at?: string | null
          source?: string
          status?: string | null
          subject?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "aria_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      third_party_delivery_connections: {
        Row: {
          api_key_encrypted: string | null
          auto_accept: boolean | null
          auto_print: boolean | null
          business_id: string | null
          commission_rate: number | null
          connected_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          last_synced_at: string | null
          menu_sync_enabled: boolean | null
          platform: string
          status: string
          store_id: string | null
          store_name: string | null
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          auto_accept?: boolean | null
          auto_print?: boolean | null
          business_id?: string | null
          commission_rate?: number | null
          connected_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          menu_sync_enabled?: boolean | null
          platform: string
          status?: string
          store_id?: string | null
          store_name?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          auto_accept?: boolean | null
          auto_print?: boolean | null
          business_id?: string | null
          commission_rate?: number | null
          connected_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          menu_sync_enabled?: boolean | null
          platform?: string
          status?: string
          store_id?: string | null
          store_name?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "third_party_delivery_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      third_party_delivery_orders: {
        Row: {
          accepted_at: string | null
          aria_upsell: string | null
          business_id: string | null
          commission: number | null
          connection_id: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_fee: number | null
          estimated_pickup_at: string | null
          id: string
          items: Json | null
          net_payout: number | null
          notes: string | null
          picked_up_at: string | null
          platform: string
          platform_fee: number | null
          platform_order_id: string
          platform_order_number: string | null
          raw_payload: Json | null
          ready_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          subtotal: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          aria_upsell?: string | null
          business_id?: string | null
          commission?: number | null
          connection_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number | null
          estimated_pickup_at?: string | null
          id?: string
          items?: Json | null
          net_payout?: number | null
          notes?: string | null
          picked_up_at?: string | null
          platform: string
          platform_fee?: number | null
          platform_order_id: string
          platform_order_number?: string | null
          raw_payload?: Json | null
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          aria_upsell?: string | null
          business_id?: string | null
          commission?: number | null
          connection_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number | null
          estimated_pickup_at?: string | null
          id?: string
          items?: Json | null
          net_payout?: number | null
          notes?: string | null
          picked_up_at?: string | null
          platform?: string
          platform_fee?: number | null
          platform_order_id?: string
          platform_order_number?: string | null
          raw_payload?: Json | null
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "third_party_delivery_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "third_party_delivery_orders_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "third_party_delivery_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          business_id: string | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_business: {
        Row: {
          business_id: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_business_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_applications: {
        Row: {
          agent_id: string
          application_number: string | null
          client_id: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_scheduled_at: string | null
          encryption_version: number | null
          expected_decision: string | null
          id: string
          lodgement_date: string | null
          notes: string | null
          outcome: string | null
          personal_circumstances: string | null
          status: string | null
          updated_at: string | null
          visa_type: string | null
        }
        Insert: {
          agent_id: string
          application_number?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          encryption_version?: number | null
          expected_decision?: string | null
          id?: string
          lodgement_date?: string | null
          notes?: string | null
          outcome?: string | null
          personal_circumstances?: string | null
          status?: string | null
          updated_at?: string | null
          visa_type?: string | null
        }
        Update: {
          agent_id?: string
          application_number?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          encryption_version?: number | null
          expected_decision?: string | null
          id?: string
          lodgement_date?: string | null
          notes?: string | null
          outcome?: string | null
          personal_circumstances?: string | null
          status?: string | null
          updated_at?: string | null
          visa_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "visa_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_clients: {
        Row: {
          agent_id: string
          application_status: string | null
          created_at: string | null
          date_of_birth: string | null
          decision_date: string | null
          deleted_at: string | null
          deletion_scheduled_at: string | null
          email: string | null
          encryption_version: number | null
          full_name: string
          id: string
          lodgement_date: string | null
          nationality: string | null
          notes: string | null
          passport_expiry: string | null
          passport_number: string | null
          phone: string | null
          points_score: number | null
          updated_at: string | null
          visa_expiry: string | null
          visa_type: string | null
        }
        Insert: {
          agent_id: string
          application_status?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          decision_date?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          email?: string | null
          encryption_version?: number | null
          full_name: string
          id?: string
          lodgement_date?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          points_score?: number | null
          updated_at?: string | null
          visa_expiry?: string | null
          visa_type?: string | null
        }
        Update: {
          agent_id?: string
          application_status?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          decision_date?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          email?: string | null
          encryption_version?: number | null
          full_name?: string
          id?: string
          lodgement_date?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          points_score?: number | null
          updated_at?: string | null
          visa_expiry?: string | null
          visa_type?: string | null
        }
        Relationships: []
      }
      visa_documents: {
        Row: {
          agent_id: string
          client_id: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_scheduled_at: string | null
          document_name: string
          document_type: string | null
          encryption_version: number | null
          expiry_date: string | null
          file_size: number | null
          file_url: string | null
          id: string
          iv_hex: string | null
          original_type: string | null
          verified: boolean | null
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          document_name: string
          document_type?: string | null
          encryption_version?: number | null
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          iv_hex?: string | null
          original_type?: string | null
          verified?: boolean | null
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_scheduled_at?: string | null
          document_name?: string
          document_type?: string | null
          encryption_version?: number | null
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          iv_hex?: string | null
          original_type?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "visa_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_bom: {
        Row: {
          business_id: string | null
          created_at: string | null
          finished_item_id: string
          finished_item_name: string
          id: string
          is_active: boolean | null
          notes: string | null
          version: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          finished_item_id: string
          finished_item_name: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          version?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          finished_item_id?: string
          finished_item_name?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bom_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_bom_components: {
        Row: {
          bom_id: string | null
          business_id: string | null
          component_item_id: string
          component_item_name: string
          id: string
          notes: string | null
          quantity_required: number
          unit: string | null
        }
        Insert: {
          bom_id?: string | null
          business_id?: string | null
          component_item_id: string
          component_item_name: string
          id?: string
          notes?: string | null
          quantity_required?: number
          unit?: string | null
        }
        Update: {
          bom_id?: string | null
          business_id?: string | null
          component_item_id?: string
          component_item_name?: string
          id?: string
          notes?: string | null
          quantity_required?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bom_components_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_bom_components_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_cycle_counts: {
        Row: {
          business_id: string | null
          completed_at: string | null
          counts: Json | null
          created_at: string | null
          id: string
          item_ids: string[]
          scheduled_date: string
          status: string | null
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          counts?: Json | null
          created_at?: string | null
          id?: string
          item_ids?: string[]
          scheduled_date: string
          status?: string | null
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          counts?: Json | null
          created_at?: string | null
          id?: string
          item_ids?: string[]
          scheduled_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_cycle_counts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_despatches: {
        Row: {
          business_id: string | null
          carrier: string | null
          consignment_note: string | null
          created_at: string | null
          delivered_at: string | null
          despatch_number: string
          despatch_type: string | null
          despatched_at: string | null
          id: string
          items: Json | null
          notes: string | null
          packed_at: string | null
          recipient_address: string | null
          recipient_city: string | null
          recipient_name: string | null
          recipient_postcode: string | null
          recipient_state: string | null
          status: string | null
          total_cubic_m: number | null
          total_weight_kg: number | null
          tracking_number: string | null
        }
        Insert: {
          business_id?: string | null
          carrier?: string | null
          consignment_note?: string | null
          created_at?: string | null
          delivered_at?: string | null
          despatch_number: string
          despatch_type?: string | null
          despatched_at?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          packed_at?: string | null
          recipient_address?: string | null
          recipient_city?: string | null
          recipient_name?: string | null
          recipient_postcode?: string | null
          recipient_state?: string | null
          status?: string | null
          total_cubic_m?: number | null
          total_weight_kg?: number | null
          tracking_number?: string | null
        }
        Update: {
          business_id?: string | null
          carrier?: string | null
          consignment_note?: string | null
          created_at?: string | null
          delivered_at?: string | null
          despatch_number?: string
          despatch_type?: string | null
          despatched_at?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          packed_at?: string | null
          recipient_address?: string | null
          recipient_city?: string | null
          recipient_name?: string | null
          recipient_postcode?: string | null
          recipient_state?: string | null
          status?: string | null
          total_cubic_m?: number | null
          total_weight_kg?: number | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_despatches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_grns: {
        Row: {
          business_id: string | null
          created_at: string | null
          grn_number: string
          id: string
          invoice_number: string | null
          invoice_total_cents: number | null
          items: Json | null
          notes: string | null
          purchase_order_id: string | null
          received_at: string | null
          received_by: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          grn_number: string
          id?: string
          invoice_number?: string | null
          invoice_total_cents?: number | null
          items?: Json | null
          notes?: string | null
          purchase_order_id?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          grn_number?: string
          id?: string
          invoice_number?: string | null
          invoice_total_cents?: number | null
          items?: Json | null
          notes?: string | null
          purchase_order_id?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_grns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_item_locations: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          item_id: string
          location_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          item_id: string
          location_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          item_id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_item_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_item_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_landed_costs: {
        Row: {
          allocated_to_items: Json | null
          allocation_method: string | null
          amount_cents: number
          business_id: string | null
          cost_type: string
          created_at: string | null
          description: string | null
          grn_id: string | null
          id: string
        }
        Insert: {
          allocated_to_items?: Json | null
          allocation_method?: string | null
          amount_cents: number
          business_id?: string | null
          cost_type: string
          created_at?: string | null
          description?: string | null
          grn_id?: string | null
          id?: string
        }
        Update: {
          allocated_to_items?: Json | null
          allocation_method?: string | null
          amount_cents?: number
          business_id?: string | null
          cost_type?: string
          created_at?: string | null
          description?: string | null
          grn_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_landed_costs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_landed_costs_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "warehouse_grns"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_locations: {
        Row: {
          aisle: string | null
          bay: string
          bin: string | null
          business_id: string | null
          capacity: number | null
          created_at: string | null
          id: string
          label: string | null
          notes: string | null
          outlet_id: string | null
          shelf: string
          temperature_zone: string | null
          zone: string
        }
        Insert: {
          aisle?: string | null
          bay: string
          bin?: string | null
          business_id?: string | null
          capacity?: number | null
          created_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          outlet_id?: string | null
          shelf: string
          temperature_zone?: string | null
          zone?: string
        }
        Update: {
          aisle?: string | null
          bay?: string
          bin?: string | null
          business_id?: string | null
          capacity?: number | null
          created_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          outlet_id?: string | null
          shelf?: string
          temperature_zone?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_lots: {
        Row: {
          business_id: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          item_id: string
          item_name: string
          lot_number: string
          notes: string | null
          quantity_received: number
          quantity_remaining: number
          received_at: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          unit_cost_cents: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id: string
          item_name: string
          lot_number: string
          notes?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_at?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost_cents?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          item_name?: string
          lot_number?: string
          notes?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_at?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_lots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_lpn: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          items: Json | null
          location_id: string | null
          lpn_number: string
          lpn_type: string | null
          received_at: string | null
          status: string | null
          total_weight_kg: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          location_id?: string | null
          lpn_number: string
          lpn_type?: string | null
          received_at?: string | null
          status?: string | null
          total_weight_kg?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          location_id?: string | null
          lpn_number?: string
          lpn_type?: string | null
          received_at?: string | null
          status?: string | null
          total_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_lpn_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_lpn_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_pick_lists: {
        Row: {
          accuracy_pct: number | null
          assigned_to: string | null
          business_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          items: Json | null
          order_ids: string[] | null
          pick_number: string
          pick_type: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          accuracy_pct?: number | null
          assigned_to?: string | null
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          order_ids?: string[] | null
          pick_number: string
          pick_type?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          accuracy_pct?: number | null
          assigned_to?: string | null
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          order_ids?: string[] | null
          pick_number?: string
          pick_type?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_pick_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_production_orders: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          bom_id: string | null
          business_id: string | null
          created_at: string | null
          finished_item_id: string
          finished_item_name: string
          id: string
          notes: string | null
          order_number: string
          planned_end: string | null
          planned_start: string | null
          quantity_planned: number
          quantity_produced: number | null
          status: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          business_id?: string | null
          created_at?: string | null
          finished_item_id: string
          finished_item_name: string
          id?: string
          notes?: string | null
          order_number: string
          planned_end?: string | null
          planned_start?: string | null
          quantity_planned: number
          quantity_produced?: number | null
          status?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          business_id?: string | null
          created_at?: string | null
          finished_item_id?: string
          finished_item_name?: string
          id?: string
          notes?: string | null
          order_number?: string
          planned_end?: string | null
          planned_start?: string | null
          quantity_planned?: number
          quantity_produced?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_production_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_purchase_orders: {
        Row: {
          ai_accepted_pct: number | null
          ai_generated: boolean | null
          ai_reasoning: Json | null
          business_id: string | null
          created_at: string | null
          delivery_confirmed_at: string | null
          expected_delivery: string | null
          expected_delivery_date: string | null
          id: string
          line_items: Json | null
          notes: string | null
          po_number: string
          received_at: string | null
          received_items: Json | null
          sent_at: string | null
          sent_to_email: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_cost_cents: number | null
          updated_at: string | null
        }
        Insert: {
          ai_accepted_pct?: number | null
          ai_generated?: boolean | null
          ai_reasoning?: Json | null
          business_id?: string | null
          created_at?: string | null
          delivery_confirmed_at?: string | null
          expected_delivery?: string | null
          expected_delivery_date?: string | null
          id?: string
          line_items?: Json | null
          notes?: string | null
          po_number: string
          received_at?: string | null
          received_items?: Json | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_accepted_pct?: number | null
          ai_generated?: boolean | null
          ai_reasoning?: Json | null
          business_id?: string | null
          created_at?: string | null
          delivery_confirmed_at?: string | null
          expected_delivery?: string | null
          expected_delivery_date?: string | null
          id?: string
          line_items?: Json | null
          notes?: string | null
          po_number?: string
          received_at?: string | null
          received_items?: Json | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost_cents?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_quarantine: {
        Row: {
          business_id: string | null
          id: string
          item_id: string
          item_name: string
          lot_id: string | null
          notes: string | null
          quantity: number
          quarantined_at: string | null
          quarantined_by: string | null
          reason: string
          released_at: string | null
          resolution: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          item_id: string
          item_name: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          quarantined_at?: string | null
          quarantined_by?: string | null
          reason: string
          released_at?: string | null
          resolution?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          item_id?: string
          item_name?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          quarantined_at?: string | null
          quarantined_by?: string | null
          reason?: string
          released_at?: string | null
          resolution?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_quarantine_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_quarantine_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_returns: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_contact: string | null
          customer_name: string | null
          id: string
          items: Json | null
          notes: string | null
          reason: string
          received_at: string | null
          return_type: string | null
          rma_number: string
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_credit_cents: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          reason: string
          received_at?: string | null
          return_type?: string | null
          rma_number: string
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_credit_cents?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          reason?: string
          received_at?: string | null
          return_type?: string | null
          rma_number?: string
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_credit_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_serials: {
        Row: {
          business_id: string | null
          id: string
          item_id: string
          item_name: string
          lot_id: string | null
          notes: string | null
          received_at: string | null
          sale_id: string | null
          serial_number: string
          sold_at: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          item_id: string
          item_name: string
          lot_id?: string | null
          notes?: string | null
          received_at?: string | null
          sale_id?: string | null
          serial_number: string
          sold_at?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          item_id?: string
          item_name?: string
          lot_id?: string | null
          notes?: string | null
          received_at?: string | null
          sale_id?: string | null
          serial_number?: string
          sold_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_serials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_serials_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_slotting: {
        Row: {
          applied: boolean | null
          business_id: string | null
          current_location_id: string | null
          generated_at: string | null
          id: string
          item_id: string
          item_name: string
          reason: string | null
          suggested_location_id: string | null
          velocity_rank: number | null
        }
        Insert: {
          applied?: boolean | null
          business_id?: string | null
          current_location_id?: string | null
          generated_at?: string | null
          id?: string
          item_id: string
          item_name: string
          reason?: string | null
          suggested_location_id?: string | null
          velocity_rank?: number | null
        }
        Update: {
          applied?: boolean | null
          business_id?: string | null
          current_location_id?: string | null
          generated_at?: string | null
          id?: string
          item_id?: string
          item_name?: string
          reason?: string | null
          suggested_location_id?: string | null
          velocity_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_slotting_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_slotting_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_slotting_suggested_location_id_fkey"
            columns: ["suggested_location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_supplier_performance: {
        Row: {
          actual_delivery_date: string | null
          business_id: string | null
          created_at: string | null
          days_variance: number | null
          grn_id: string | null
          id: string
          invoice_total_cents: number | null
          po_total_cents: number | null
          price_variance_cents: number | null
          promised_delivery_date: string | null
          quantity_ordered: number | null
          quantity_received: number | null
          quantity_variance: number | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          business_id?: string | null
          created_at?: string | null
          days_variance?: number | null
          grn_id?: string | null
          id?: string
          invoice_total_cents?: number | null
          po_total_cents?: number | null
          price_variance_cents?: number | null
          promised_delivery_date?: string | null
          quantity_ordered?: number | null
          quantity_received?: number | null
          quantity_variance?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          business_id?: string | null
          created_at?: string | null
          days_variance?: number | null
          grn_id?: string | null
          id?: string
          invoice_total_cents?: number | null
          po_total_cents?: number | null
          price_variance_cents?: number | null
          promised_delivery_date?: string | null
          quantity_ordered?: number | null
          quantity_received?: number | null
          quantity_variance?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_supplier_performance_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_supplier_performance_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "warehouse_grns"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_uom: {
        Row: {
          base_unit: string
          business_id: string | null
          conversion_factor: number
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          base_unit: string
          business_id?: string | null
          conversion_factor?: number
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          base_unit?: string
          business_id?: string | null
          conversion_factor?: number
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_uom_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_log: {
        Row: {
          business_id: string
          cost_per_unit: number | null
          created_at: string | null
          id: string
          logged_by: string | null
          prevented_by_agent: boolean | null
          product_id: string | null
          reason: string | null
          total_waste_value: number | null
          units_wasted: number | null
          waste_date: string
        }
        Insert: {
          business_id: string
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          logged_by?: string | null
          prevented_by_agent?: boolean | null
          product_id?: string | null
          reason?: string | null
          total_waste_value?: number | null
          units_wasted?: number | null
          waste_date: string
        }
        Update: {
          business_id?: string
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          logged_by?: string | null
          prevented_by_agent?: boolean | null
          product_id?: string | null
          reason?: string | null
          total_waste_value?: number | null
          units_wasted?: number | null
          waste_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_records: {
        Row: {
          avg_ticket: number | null
          business_id: string
          created_at: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          goal_attainment_pct: number | null
          id: string
          narrative: Json | null
          new_customers: number | null
          pdf_url: string | null
          report_data: Json | null
          revenue: number | null
          transaction_count: number | null
          week_starting: string
        }
        Insert: {
          avg_ticket?: number | null
          business_id: string
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          goal_attainment_pct?: number | null
          id?: string
          narrative?: Json | null
          new_customers?: number | null
          pdf_url?: string | null
          report_data?: Json | null
          revenue?: number | null
          transaction_count?: number | null
          week_starting: string
        }
        Update: {
          avg_ticket?: number | null
          business_id?: string
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          goal_attainment_pct?: number | null
          id?: string
          narrative?: Json | null
          new_customers?: number | null
          pdf_url?: string | null
          report_data?: Json | null
          revenue?: number | null
          transaction_count?: number | null
          week_starting?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_order_items: {
        Row: {
          description: string | null
          discount_amount: number | null
          discount_pct: number | null
          gst_amount: number | null
          id: string
          line_total: number
          name: string
          order_id: string
          position: number | null
          product_id: string | null
          quantity: number
          retail_price: number | null
          sku: string | null
          unit_price: number
        }
        Insert: {
          description?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          gst_amount?: number | null
          id?: string
          line_total: number
          name: string
          order_id: string
          position?: number | null
          product_id?: string | null
          quantity: number
          retail_price?: number | null
          sku?: string | null
          unit_price: number
        }
        Update: {
          description?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          gst_amount?: number | null
          id?: string
          line_total?: number
          name?: string
          order_id?: string
          position?: number | null
          product_id?: string | null
          quantity?: number
          retail_price?: number | null
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_orders: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          confirmed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_notes: string | null
          discount_total: number | null
          freight: number | null
          gst_total: number | null
          id: string
          invoice_id: string | null
          notes: string | null
          order_number: string
          payment_terms: string | null
          po_ref: string | null
          sent_at: string | null
          source: string
          status: string
          subtotal: number | null
          total: number | null
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_notes?: string | null
          discount_total?: number | null
          freight?: number | null
          gst_total?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_number: string
          payment_terms?: string | null
          po_ref?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_notes?: string | null
          discount_total?: number | null
          freight?: number | null
          gst_total?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_number?: string
          payment_terms?: string | null
          po_ref?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          subtotal?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_configs: {
        Row: {
          age_restricted_policy: string | null
          allowed_domain: string | null
          answer_length: string | null
          api_key: string | null
          appointment_duration_mins: number | null
          appointment_lead_days: number | null
          appointment_services: string | null
          appointments_enabled: boolean | null
          assistant_role: string | null
          bot_name: string | null
          business_id: string | null
          created_at: string | null
          custom_rules: string | null
          delivery_policy: string | null
          enabled: boolean | null
          escalation_email: string | null
          escalation_message: string | null
          escalation_phone: string | null
          faqs: Json | null
          greeting: string | null
          guardrails: string | null
          id: string
          max_bookings_per_slot: number | null
          notification_email: string | null
          notification_phone: string | null
          opening_hours: Json | null
          pickup_policy: string | null
          primary_color: string | null
          recognise_members: boolean | null
          returns_policy: string | null
          services: string | null
          show_out_of_stock: boolean | null
          show_prices: boolean | null
          show_talk_to_staff: boolean | null
          stock_visibility: string | null
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          age_restricted_policy?: string | null
          allowed_domain?: string | null
          answer_length?: string | null
          api_key?: string | null
          appointment_duration_mins?: number | null
          appointment_lead_days?: number | null
          appointment_services?: string | null
          appointments_enabled?: boolean | null
          assistant_role?: string | null
          bot_name?: string | null
          business_id?: string | null
          created_at?: string | null
          custom_rules?: string | null
          delivery_policy?: string | null
          enabled?: boolean | null
          escalation_email?: string | null
          escalation_message?: string | null
          escalation_phone?: string | null
          faqs?: Json | null
          greeting?: string | null
          guardrails?: string | null
          id?: string
          max_bookings_per_slot?: number | null
          notification_email?: string | null
          notification_phone?: string | null
          opening_hours?: Json | null
          pickup_policy?: string | null
          primary_color?: string | null
          recognise_members?: boolean | null
          returns_policy?: string | null
          services?: string | null
          show_out_of_stock?: boolean | null
          show_prices?: boolean | null
          show_talk_to_staff?: boolean | null
          stock_visibility?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          age_restricted_policy?: string | null
          allowed_domain?: string | null
          answer_length?: string | null
          api_key?: string | null
          appointment_duration_mins?: number | null
          appointment_lead_days?: number | null
          appointment_services?: string | null
          appointments_enabled?: boolean | null
          assistant_role?: string | null
          bot_name?: string | null
          business_id?: string | null
          created_at?: string | null
          custom_rules?: string | null
          delivery_policy?: string | null
          enabled?: boolean | null
          escalation_email?: string | null
          escalation_message?: string | null
          escalation_phone?: string | null
          faqs?: Json | null
          greeting?: string | null
          guardrails?: string | null
          id?: string
          max_bookings_per_slot?: number | null
          notification_email?: string | null
          notification_phone?: string | null
          opening_hours?: Json | null
          pickup_policy?: string | null
          primary_color?: string | null
          recognise_members?: boolean | null
          returns_policy?: string | null
          services?: string | null
          show_out_of_stock?: boolean | null
          show_prices?: boolean | null
          show_talk_to_staff?: boolean | null
          stock_visibility?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_conversations: {
        Row: {
          booking_id: string | null
          business_id: string | null
          created_at: string | null
          id: string
          messages: Json | null
          updated_at: string | null
          visitor_email: string | null
          visitor_id: string
          visitor_name: string | null
          visitor_phone: string | null
        }
        Insert: {
          booking_id?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          updated_at?: string | null
          visitor_email?: string | null
          visitor_id: string
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Update: {
          booking_id?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          updated_at?: string | null
          visitor_email?: string | null
          visitor_id?: string
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      winback_automations: {
        Row: {
          business_id: string | null
          created_at: string | null
          email_body: string | null
          email_subject: string | null
          id: string
          is_active: boolean | null
          sms_message: string | null
          trigger_type: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_active?: boolean | null
          sms_message?: string | null
          trigger_type?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_active?: boolean | null
          sms_message?: string | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "winback_automations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_sync_history: {
        Row: {
          business_id: string | null
          id: string
          sent_at: string | null
          sent_by: string | null
          sync_date: string | null
          total_gst: number | null
          total_sales: number | null
          xero_invoice_id: string | null
        }
        Insert: {
          business_id?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sync_date?: string | null
          total_gst?: number | null
          total_sales?: number | null
          xero_invoice_id?: string | null
        }
        Update: {
          business_id?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sync_date?: string | null
          total_gst?: number | null
          total_sales?: number | null
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_sync_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_sync_previews: {
        Row: {
          business_id: string
          created_at: string
          date: string
          id: string
          payload: Json
          status: string
          synced_at: string | null
          xero_journal_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          date: string
          id?: string
          payload?: Json
          status?: string
          synced_at?: string | null
          xero_journal_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          date?: string
          id?: string
          payload?: Json
          status?: string
          synced_at?: string | null
          xero_journal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_sync_previews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_sync_queue: {
        Row: {
          business_id: string | null
          error_message: string | null
          id: string
          line_items: Json
          notes: string | null
          payment_breakdown: Json | null
          prepared_at: string | null
          reviewed_at: string | null
          sent_at: string | null
          status: string | null
          sync_date: string
          total_gst: number | null
          total_refunds: number | null
          total_sales: number | null
          xero_invoice_id: string | null
        }
        Insert: {
          business_id?: string | null
          error_message?: string | null
          id?: string
          line_items: Json
          notes?: string | null
          payment_breakdown?: Json | null
          prepared_at?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          status?: string | null
          sync_date: string
          total_gst?: number | null
          total_refunds?: number | null
          total_sales?: number | null
          xero_invoice_id?: string | null
        }
        Update: {
          business_id?: string | null
          error_message?: string | null
          id?: string
          line_items?: Json
          notes?: string | null
          payment_breakdown?: Json | null
          prepared_at?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          status?: string | null
          sync_date?: string
          total_gst?: number | null
          total_refunds?: number | null
          total_sales?: number | null
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_sync_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      aria_cache_effectiveness: {
        Row: {
          cache_hit_pct: number | null
          hour: string | null
          total_cache_reads: number | null
          total_cache_writes: number | null
          total_calls: number | null
          total_input: number | null
        }
        Relationships: []
      }
      customer_interactions_v: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_identifier: string | null
          has_unread: boolean | null
          id: string | null
          preview: string | null
          source: string | null
        }
        Relationships: []
      }
      reel_cost_dashboard: {
        Row: {
          avg_cost_per_reel: number | null
          business_id: string | null
          business_name: string | null
          completed_reels: number | null
          cost_this_month: number | null
          reels_this_month: number | null
          total_cost_aud: number | null
          total_credits: number | null
          total_reels: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_studio_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_product_draft: {
        Args: {
          p_barcode: string
          p_brand: string
          p_business_id: string
          p_description: string
          p_name: string
          p_sku: string
        }
        Returns: string
      }
      decrement_outlet_inventory: {
        Args: {
          p_business_id: string
          p_outlet_id: string
          p_product_id: string
          p_qty: number
        }
        Returns: undefined
      }
      decrement_paid_credit: { Args: { bid: string }; Returns: undefined }
      generate_po_number: { Args: { p_business_id: string }; Returns: string }
      generate_wholesale_order_number: { Args: never; Returns: string }
      get_top_products: {
        Args: {
          p_business_id: string
          p_from: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          product_name: string
          quantity: number
          revenue: number
          transaction_count: number
        }[]
      }
      increment_free_used: { Args: { bid: string }; Returns: undefined }
      increment_loyalty_points: {
        Args: { customer_id: string; points: number }
        Returns: undefined
      }
      increment_outlet_inventory: {
        Args: { p_outlet_id: string; p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      increment_returned_quantity: {
        Args: { p_item_id: string; p_qty: number }
        Returns: undefined
      }
      reverse_outlet_inventory: {
        Args: {
          p_business_id: string
          p_outlet_id: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
        }
        Returns: undefined
      }
      track_aria_spend: {
        Args: { p_business_id: string; p_cost_cents: number; p_kind?: string }
        Returns: undefined
      }
      wh_drift_count: {
        Args: { p_business_id: string; p_since: string }
        Returns: number
      }
      wh_headless_count: {
        Args: { p_business_id: string; p_since: string }
        Returns: number
      }
      wh_payments_coverage: {
        Args: { p_business_id: string; p_since: string }
        Returns: {
          paid_sales: number
          total_sales: number
        }[]
      }
      wh_rls_disabled_count: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

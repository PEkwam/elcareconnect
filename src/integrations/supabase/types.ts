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
      agent_shifts: {
        Row: {
          agent_email: string
          break_end: string | null
          break_start: string | null
          created_at: string | null
          end_time: string
          id: string
          notes: string | null
          shift_date: string
          start_time: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_email: string
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          end_time: string
          id?: string
          notes?: string | null
          shift_date: string
          start_time: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_email?: string
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          shift_date?: string
          start_time?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          agent_email: string
          created_at: string | null
          id: string
          proficiency_level: number | null
          skill_type: string
          updated_at: string | null
        }
        Insert: {
          agent_email: string
          created_at?: string | null
          id?: string
          proficiency_level?: number | null
          skill_type: string
          updated_at?: string | null
        }
        Update: {
          agent_email?: string
          created_at?: string | null
          id?: string
          proficiency_level?: number | null
          skill_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_status: {
        Row: {
          achievements: string[] | null
          agent_email: string
          avg_resolution_time_minutes: number | null
          break_type: string | null
          created_at: string
          current_call_id: string | null
          current_status_started_at: string | null
          id: string
          last_seen: string | null
          points: number | null
          session_started_at: string | null
          status: string
          streak_days: number | null
          success_rate: number | null
          total_calls_handled: number | null
          total_time_available_seconds: number | null
          total_time_on_break_seconds: number | null
          total_time_on_call_seconds: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          achievements?: string[] | null
          agent_email: string
          avg_resolution_time_minutes?: number | null
          break_type?: string | null
          created_at?: string
          current_call_id?: string | null
          current_status_started_at?: string | null
          id?: string
          last_seen?: string | null
          points?: number | null
          session_started_at?: string | null
          status?: string
          streak_days?: number | null
          success_rate?: number | null
          total_calls_handled?: number | null
          total_time_available_seconds?: number | null
          total_time_on_break_seconds?: number | null
          total_time_on_call_seconds?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          achievements?: string[] | null
          agent_email?: string
          avg_resolution_time_minutes?: number | null
          break_type?: string | null
          created_at?: string
          current_call_id?: string | null
          current_status_started_at?: string | null
          id?: string
          last_seen?: string | null
          points?: number | null
          session_started_at?: string | null
          status?: string
          streak_days?: number | null
          success_rate?: number | null
          total_calls_handled?: number | null
          total_time_available_seconds?: number | null
          total_time_on_break_seconds?: number | null
          total_time_on_call_seconds?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          id: number
          ip: unknown
          metadata: Json | null
          occurred_at: string
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          id?: number
          ip?: unknown
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          id?: number
          ip?: unknown
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      call_campaigns: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          options: Json | null
          script: string
          script_audio_urls: Json
          script_translations: Json
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          options?: Json | null
          script: string
          script_audio_urls?: Json
          script_translations?: Json
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          options?: Json | null
          script?: string
          script_audio_urls?: Json
          script_translations?: Json
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      call_queue: {
        Row: {
          call_type: string
          client_id: string | null
          created_at: string
          estimated_wait_time: number | null
          id: string
          language: string | null
          priority_level: string
          queue_position: number | null
          updated_at: string
        }
        Insert: {
          call_type: string
          client_id?: string | null
          created_at?: string
          estimated_wait_time?: number | null
          id?: string
          language?: string | null
          priority_level?: string
          queue_position?: number | null
          updated_at?: string
        }
        Update: {
          call_type?: string
          client_id?: string | null
          created_at?: string
          estimated_wait_time?: number | null
          id?: string
          language?: string | null
          priority_level?: string
          queue_position?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcriptions: {
        Row: {
          call_id: string | null
          confidence: number | null
          created_at: string | null
          id: string
          is_partial: boolean | null
          language: string | null
          speaker: string | null
          text: string
          timestamp_ms: number | null
          timestamp_seconds: number | null
          transcript: string | null
        }
        Insert: {
          call_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_partial?: boolean | null
          language?: string | null
          speaker?: string | null
          text: string
          timestamp_ms?: number | null
          timestamp_seconds?: number | null
          transcript?: string | null
        }
        Update: {
          call_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_partial?: boolean | null
          language?: string | null
          speaker?: string | null
          text?: string
          timestamp_ms?: number | null
          timestamp_seconds?: number | null
          transcript?: string | null
        }
        Relationships: []
      }
      call_transfers: {
        Row: {
          call_id: string | null
          created_at: string
          from_agent: string
          id: string
          specialist_type: string
          to_specialist: string
          transfer_notes: string | null
          transfer_reason: string | null
          transfer_status: string | null
          updated_at: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          from_agent: string
          id?: string
          specialist_type: string
          to_specialist: string
          transfer_notes?: string | null
          transfer_reason?: string | null
          transfer_status?: string | null
          updated_at?: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          from_agent?: string
          id?: string
          specialist_type?: string
          to_specialist?: string
          transfer_notes?: string | null
          transfer_reason?: string | null
          transfer_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      callback_requests: {
        Row: {
          agent_email: string | null
          assigned_agent: string | null
          call_id: string | null
          campaign_id: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string | null
          id: string
          notes: string | null
          preferred_date: string | null
          preferred_time_slot: string | null
          reason: string | null
          scheduled_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_email?: string | null
          assigned_agent?: string | null
          call_id?: string | null
          campaign_id?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          preferred_date?: string | null
          preferred_time_slot?: string | null
          reason?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_email?: string | null
          assigned_agent?: string | null
          call_id?: string | null
          campaign_id?: string | null
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          preferred_date?: string | null
          preferred_time_slot?: string | null
          reason?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campaign_clients: {
        Row: {
          campaign_id: string
          client_id: string
          created_at: string
          custom_data: Json
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          client_id: string
          created_at?: string
          custom_data?: Json
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string
          created_at?: string
          custom_data?: Json
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_clients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_jobs: {
        Row: {
          attempts: number
          call_sid: string | null
          campaign_id: string
          client_id: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          phone_e164: string
          priority: number
          run_id: string | null
          scheduled_for: string
          state: Database["public"]["Enums"]["campaign_job_state"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          call_sid?: string | null
          campaign_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          phone_e164: string
          priority?: number
          run_id?: string | null
          scheduled_for?: string
          state?: Database["public"]["Enums"]["campaign_job_state"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          call_sid?: string | null
          campaign_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          phone_e164?: string
          priority?: number
          run_id?: string | null
          scheduled_for?: string
          state?: Database["public"]["Enums"]["campaign_job_state"]
          updated_at?: string
        }
        Relationships: []
      }
      campaign_recordings: {
        Row: {
          audio_url: string | null
          campaign_id: string | null
          created_at: string
          id: string
          is_tag: boolean
          kind: string
          language_code: string
          segment_order: number
          tag_name: string | null
          text_content: string | null
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_tag?: boolean
          kind?: string
          language_code: string
          segment_order?: number
          tag_name?: string | null
          text_content?: string | null
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_tag?: boolean
          kind?: string
          language_code?: string
          segment_order?: number
          tag_name?: string | null
          text_content?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recordings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_runs: {
        Row: {
          campaign_id: string
          completed: number
          concurrency: number
          created_at: string
          created_by: string | null
          failed: number
          finished_at: string | null
          id: string
          rate_limit_per_minute: number
          started_at: string
          state: Database["public"]["Enums"]["campaign_run_state"]
          total: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          completed?: number
          concurrency?: number
          created_at?: string
          created_by?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          rate_limit_per_minute?: number
          started_at?: string
          state?: Database["public"]["Enums"]["campaign_run_state"]
          total?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          completed?: number
          concurrency?: number
          created_at?: string
          created_by?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          rate_limit_per_minute?: number
          started_at?: string
          state?: Database["public"]["Enums"]["campaign_run_state"]
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      campaign_tags: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          example: string | null
          id: string
          is_active: boolean | null
          key: string
          label: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          example?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          label: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          example?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      campaign_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          agent_email: string | null
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          agent_email?: string | null
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          agent_email?: string | null
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          last_payment_date: string | null
          name: string
          payment_status: string | null
          phone: string
          policy_number: string | null
          preferred_language: string | null
          premium_amount: number | null
          premium_due_date: string | null
          product_type: string | null
          tag_values: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_payment_date?: string | null
          name: string
          payment_status?: string | null
          phone: string
          policy_number?: string | null
          preferred_language?: string | null
          premium_amount?: number | null
          premium_due_date?: string | null
          product_type?: string | null
          tag_values?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_payment_date?: string | null
          name?: string
          payment_status?: string | null
          phone?: string
          policy_number?: string | null
          preferred_language?: string | null
          premium_amount?: number | null
          premium_due_date?: string | null
          product_type?: string | null
          tag_values?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          agent_email: string | null
          call_id: string | null
          client_id: string | null
          content: string
          created_at: string
          id: string
          is_emergency: boolean | null
          note_type: string
          updated_at: string
        }
        Insert: {
          agent_email?: string | null
          call_id?: string | null
          client_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_emergency?: boolean | null
          note_type?: string
          updated_at?: string
        }
        Update: {
          agent_email?: string | null
          call_id?: string | null
          client_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_emergency?: boolean | null
          note_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_alerts: {
        Row: {
          alert_type: string
          assigned_to: string | null
          client_id: string | null
          created_at: string
          description: string
          id: string
          resolved_at: string | null
          severity: string
          status: string | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      error_events: {
        Row: {
          context: Json | null
          id: number
          level: string
          message: string
          occurred_at: string
          source: string
        }
        Insert: {
          context?: Json | null
          id?: number
          level?: string
          message: string
          occurred_at?: string
          source: string
        }
        Update: {
          context?: Json | null
          id?: number
          level?: string
          message?: string
          occurred_at?: string
          source?: string
        }
        Relationships: []
      }
      escalation_settings: {
        Row: {
          created_at: string | null
          critical_threshold_minutes: number | null
          enabled: boolean | null
          escalate_threshold_minutes: number | null
          escalation_threshold_minutes: number | null
          id: string
          notify_emails: string[] | null
          notify_via_email: boolean | null
          notify_via_sms: boolean | null
          supervisor_emails: string[] | null
          supervisor_phones: string[] | null
          updated_at: string | null
          warning_threshold_minutes: number | null
        }
        Insert: {
          created_at?: string | null
          critical_threshold_minutes?: number | null
          enabled?: boolean | null
          escalate_threshold_minutes?: number | null
          escalation_threshold_minutes?: number | null
          id?: string
          notify_emails?: string[] | null
          notify_via_email?: boolean | null
          notify_via_sms?: boolean | null
          supervisor_emails?: string[] | null
          supervisor_phones?: string[] | null
          updated_at?: string | null
          warning_threshold_minutes?: number | null
        }
        Update: {
          created_at?: string | null
          critical_threshold_minutes?: number | null
          enabled?: boolean | null
          escalate_threshold_minutes?: number | null
          escalation_threshold_minutes?: number | null
          id?: string
          notify_emails?: string[] | null
          notify_via_email?: boolean | null
          notify_via_sms?: boolean | null
          supervisor_emails?: string[] | null
          supervisor_phones?: string[] | null
          updated_at?: string | null
          warning_threshold_minutes?: number | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          response: Json | null
          scope: string
        }
        Insert: {
          created_at?: string
          key: string
          response?: Json | null
          scope: string
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json | null
          scope?: string
        }
        Relationships: []
      }
      ivr_menu_options: {
        Row: {
          action: string
          audio_url: string | null
          created_at: string | null
          digit: string
          display_order: number | null
          id: string
          is_active: boolean | null
          label: string
          language_code: string
          prompt_text: string | null
          target: string | null
          updated_at: string | null
        }
        Insert: {
          action?: string
          audio_url?: string | null
          created_at?: string | null
          digit: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          language_code: string
          prompt_text?: string | null
          target?: string | null
          updated_at?: string | null
        }
        Update: {
          action?: string
          audio_url?: string | null
          created_at?: string | null
          digit?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          language_code?: string
          prompt_text?: string | null
          target?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_emergency_procedure: boolean | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_emergency_procedure?: boolean | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_emergency_procedure?: boolean | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_appointments: {
        Row: {
          appointment_type: string
          client_id: string | null
          created_at: string | null
          id: string
          medical_center: string | null
          notes: string | null
          scheduled_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_type: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          medical_center?: string | null
          notes?: string | null
          scheduled_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_type?: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          medical_center?: string | null
          notes?: string | null
          scheduled_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_call_events: {
        Row: {
          call_id: string | null
          call_sid: string
          call_status: string
          created_at: string
          duration: number | null
          from_number: string | null
          id: number
          parent_sid: string | null
          processed_at: string | null
          raw: Json | null
          to_number: string | null
        }
        Insert: {
          call_id?: string | null
          call_sid: string
          call_status: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Update: {
          call_id?: string | null
          call_sid?: string
          call_status?: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      outbound_call_events_2026_05: {
        Row: {
          call_id: string | null
          call_sid: string
          call_status: string
          created_at: string
          duration: number | null
          from_number: string | null
          id: number
          parent_sid: string | null
          processed_at: string | null
          raw: Json | null
          to_number: string | null
        }
        Insert: {
          call_id?: string | null
          call_sid: string
          call_status: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Update: {
          call_id?: string | null
          call_sid?: string
          call_status?: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      outbound_call_events_2026_06: {
        Row: {
          call_id: string | null
          call_sid: string
          call_status: string
          created_at: string
          duration: number | null
          from_number: string | null
          id: number
          parent_sid: string | null
          processed_at: string | null
          raw: Json | null
          to_number: string | null
        }
        Insert: {
          call_id?: string | null
          call_sid: string
          call_status: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Update: {
          call_id?: string | null
          call_sid?: string
          call_status?: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      outbound_call_events_2026_07: {
        Row: {
          call_id: string | null
          call_sid: string
          call_status: string
          created_at: string
          duration: number | null
          from_number: string | null
          id: number
          parent_sid: string | null
          processed_at: string | null
          raw: Json | null
          to_number: string | null
        }
        Insert: {
          call_id?: string | null
          call_sid: string
          call_status: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Update: {
          call_id?: string | null
          call_sid?: string
          call_status?: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      outbound_call_events_2026_08: {
        Row: {
          call_id: string | null
          call_sid: string
          call_status: string
          created_at: string
          duration: number | null
          from_number: string | null
          id: number
          parent_sid: string | null
          processed_at: string | null
          raw: Json | null
          to_number: string | null
        }
        Insert: {
          call_id?: string | null
          call_sid: string
          call_status: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Update: {
          call_id?: string | null
          call_sid?: string
          call_status?: string
          created_at?: string
          duration?: number | null
          from_number?: string | null
          id?: number
          parent_sid?: string | null
          processed_at?: string | null
          raw?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      outbound_calls: {
        Row: {
          agent_email: string | null
          ai_summary: string | null
          call_duration: number | null
          call_recording_url: string | null
          call_status: string | null
          campaign_id: string | null
          client_id: string | null
          created_at: string | null
          customer_satisfaction: number | null
          ended_at: string | null
          escalation_flagged: boolean | null
          id: string
          is_emergency: boolean | null
          notes: string | null
          outcome: string | null
          payment_link: string | null
          phone_number: string
          priority_level: string | null
          resolution_time: number | null
          scheduled_at: string | null
          sentiment: string | null
          sentiment_score: number | null
          started_at: string | null
          transfer_count: number | null
          twilio_call_sid: string | null
          updated_at: string | null
        }
        Insert: {
          agent_email?: string | null
          ai_summary?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          call_status?: string | null
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string | null
          customer_satisfaction?: number | null
          ended_at?: string | null
          escalation_flagged?: boolean | null
          id?: string
          is_emergency?: boolean | null
          notes?: string | null
          outcome?: string | null
          payment_link?: string | null
          phone_number: string
          priority_level?: string | null
          resolution_time?: number | null
          scheduled_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          started_at?: string | null
          transfer_count?: number | null
          twilio_call_sid?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_email?: string | null
          ai_summary?: string | null
          call_duration?: number | null
          call_recording_url?: string | null
          call_status?: string | null
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string | null
          customer_satisfaction?: number | null
          ended_at?: string | null
          escalation_flagged?: boolean | null
          id?: string
          is_emergency?: boolean | null
          notes?: string | null
          outcome?: string | null
          payment_link?: string | null
          phone_number?: string
          priority_level?: string | null
          resolution_time?: number | null
          scheduled_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          started_at?: string | null
          transfer_count?: number | null
          twilio_call_sid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "call_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sip_trunks: {
        Row: {
          caller_id: string | null
          codecs: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          outbound_proxy: string | null
          password: string | null
          provider: string | null
          region: string | null
          sip_domain: string
          sip_port: number
          transport: string
          updated_at: string
          username: string | null
        }
        Insert: {
          caller_id?: string | null
          codecs?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          outbound_proxy?: string | null
          password?: string | null
          provider?: string | null
          region?: string | null
          sip_domain: string
          sip_port?: number
          transport?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          caller_id?: string | null
          codecs?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          outbound_proxy?: string | null
          password?: string | null
          provider?: string | null
          region?: string | null
          sip_domain?: string
          sip_port?: number
          transport?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sms_campaigns: {
        Row: {
          channel: string | null
          completed_at: string | null
          created_at: string | null
          delivered_count: number | null
          failed_count: number | null
          id: string
          message: string | null
          message_template: string | null
          name: string
          scheduled_at: string | null
          sent_count: number | null
          status: string | null
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          channel?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message?: string | null
          message_template?: string | null
          name: string
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message?: string | null
          message_template?: string | null
          name?: string
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          campaign_id: string | null
          client_id: string | null
          created_at: string | null
          id: string
          message: string
          phone_number: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          phone_number: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          phone_number?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      supported_languages: {
        Row: {
          code: string
          created_at: string | null
          display_order: number | null
          greeting_audio_url: string | null
          greeting_text: string | null
          id: string
          is_active: boolean | null
          menu_audio_url: string | null
          menu_prompt_text: string | null
          name: string
          native_name: string
          tts_provider: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          display_order?: number | null
          greeting_audio_url?: string | null
          greeting_text?: string | null
          id?: string
          is_active?: boolean | null
          menu_audio_url?: string | null
          menu_prompt_text?: string | null
          name: string
          native_name: string
          tts_provider?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          display_order?: number | null
          greeting_audio_url?: string | null
          greeting_text?: string | null
          id?: string
          is_active?: boolean | null
          menu_audio_url?: string | null
          menu_prompt_text?: string | null
          name?: string
          native_name?: string
          tts_provider?: string | null
        }
        Relationships: []
      }
      system_health_metrics: {
        Row: {
          captured_at: string
          id: number
          metric: string
          tags: Json | null
          value: number
        }
        Insert: {
          captured_at?: string
          id?: number
          metric: string
          tags?: Json | null
          value: number
        }
        Update: {
          captured_at?: string
          id?: number
          metric?: string
          tags?: Json | null
          value?: number
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          admin_bridge_phone: string | null
          created_at: string | null
          default_caller_id: string | null
          dial_me_first_enabled: boolean | null
          dial_prefix: string | null
          id: string
          max_concurrent_calls: number | null
          recording_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          admin_bridge_phone?: string | null
          created_at?: string | null
          default_caller_id?: string | null
          dial_me_first_enabled?: boolean | null
          dial_prefix?: string | null
          id?: string
          max_concurrent_calls?: number | null
          recording_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          admin_bridge_phone?: string | null
          created_at?: string | null
          default_caller_id?: string | null
          dial_me_first_enabled?: boolean | null
          dial_prefix?: string | null
          id?: string
          max_concurrent_calls?: number | null
          recording_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webrtc_sessions: {
        Row: {
          answer: Json | null
          call_id: string | null
          callee_id: string | null
          callee_user_id: string | null
          caller_id: string | null
          caller_user_id: string | null
          created_at: string | null
          ice_candidates: Json | null
          id: string
          language: string | null
          offer: Json | null
          sdp_data: Json | null
          session_type: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          answer?: Json | null
          call_id?: string | null
          callee_id?: string | null
          callee_user_id?: string | null
          caller_id?: string | null
          caller_user_id?: string | null
          created_at?: string | null
          ice_candidates?: Json | null
          id?: string
          language?: string | null
          offer?: Json | null
          sdp_data?: Json | null
          session_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          answer?: Json | null
          call_id?: string | null
          callee_id?: string | null
          callee_user_id?: string | null
          caller_id?: string | null
          caller_user_id?: string | null
          created_at?: string | null
          ice_candidates?: Json | null
          id?: string
          language?: string | null
          offer?: Json | null
          sdp_data?: Json | null
          session_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      mv_agent_daily_performance: {
        Row: {
          agent_email: string | null
          avg_sentiment: number | null
          avg_talk_seconds: number | null
          calls_completed: number | null
          calls_handled: number | null
          day: string | null
          total_talk_seconds: number | null
        }
        Relationships: []
      }
      mv_call_hourly_volume: {
        Row: {
          avg_duration: number | null
          busy: number | null
          completed: number | null
          failed: number | null
          hour: string | null
          no_answer: number | null
          total_calls: number | null
        }
        Relationships: []
      }
      mv_campaign_daily_stats: {
        Row: {
          avg_call_seconds: number | null
          calls_completed: number | null
          campaign_id: string | null
          day: string | null
          jobs_active: number | null
          jobs_cancelled: number | null
          jobs_completed: number | null
          jobs_failed: number | null
          jobs_queued: number | null
          jobs_total: number | null
          total_call_seconds: number | null
        }
        Relationships: []
      }
      mv_sentiment_daily: {
        Row: {
          avg_sentiment: number | null
          day: string | null
          negative_count: number | null
          neutral_count: number | null
          positive_count: number | null
          scored_calls: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_campaign_jobs: {
        Args: {
          _campaign?: string
          _limit?: number
          _lock_seconds?: number
          _worker: string
        }
        Returns: {
          attempts: number
          call_sid: string | null
          campaign_id: string
          client_id: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          phone_e164: string
          priority: number
          run_id: string | null
          scheduled_for: string
          state: Database["public"]["Enums"]["campaign_job_state"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_idempotency_key: {
        Args: { _key: string; _scope: string }
        Returns: Json
      }
      consume_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      create_outbound_call_events_partition: {
        Args: { _month: string }
        Returns: undefined
      }
      get_agent_daily_performance: {
        Args: { _from?: string; _to?: string }
        Returns: {
          agent_email: string | null
          avg_sentiment: number | null
          avg_talk_seconds: number | null
          calls_completed: number | null
          calls_handled: number | null
          day: string | null
          total_talk_seconds: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_agent_daily_performance"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_call_hourly_volume: {
        Args: { _hours?: number }
        Returns: {
          avg_duration: number | null
          busy: number | null
          completed: number | null
          failed: number | null
          hour: string | null
          no_answer: number | null
          total_calls: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_call_hourly_volume"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_campaign_daily_stats: {
        Args: { _from?: string; _to?: string }
        Returns: {
          avg_call_seconds: number | null
          calls_completed: number | null
          campaign_id: string | null
          day: string | null
          jobs_active: number | null
          jobs_cancelled: number | null
          jobs_completed: number | null
          jobs_failed: number | null
          jobs_queued: number | null
          jobs_total: number | null
          total_call_seconds: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_campaign_daily_stats"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_sentiment_daily: {
        Args: { _from?: string; _to?: string }
        Returns: {
          avg_sentiment: number | null
          day: string | null
          negative_count: number | null
          neutral_count: number | null
          positive_count: number | null
          scored_calls: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_sentiment_daily"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_or_admin: { Args: { _user_id: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          _action: string
          _actor?: string
          _ip?: unknown
          _metadata?: Json
          _target_id?: string
          _target_table?: string
          _user_agent?: string
        }
        Returns: number
      }
      process_outbound_call_events: {
        Args: { _limit?: number }
        Returns: number
      }
      reap_campaign_jobs: { Args: never; Returns: number }
      refresh_analytics_views: { Args: never; Returns: undefined }
      store_idempotency_response: {
        Args: { _key: string; _response: Json }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "supervisor" | "agent" | "user"
      campaign_job_state:
        | "queued"
        | "active"
        | "completed"
        | "failed"
        | "cancelled"
      campaign_run_state: "running" | "paused" | "completed" | "cancelled"
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
      app_role: ["super_admin", "admin", "supervisor", "agent", "user"],
      campaign_job_state: [
        "queued",
        "active",
        "completed",
        "failed",
        "cancelled",
      ],
      campaign_run_state: ["running", "paused", "completed", "cancelled"],
    },
  },
} as const

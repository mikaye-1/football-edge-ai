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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_predictions: {
        Row: {
          ai_summary: string | null
          btts_prediction: string | null
          confidence_tier: string
          created_at: string
          edge_score: number
          id: string
          is_strong_pick: boolean
          is_value_bet: boolean
          key_factors: Json
          match_id: string
          model: string
          over_under_prediction: string | null
          predicted_outcome: string
          preview_text: string | null
          recommended_markets: Json
          risk_flags: Json
          updated_at: string
          value_bet: Json | null
          win_probability: Json
        }
        Insert: {
          ai_summary?: string | null
          btts_prediction?: string | null
          confidence_tier: string
          created_at?: string
          edge_score?: number
          id?: string
          is_strong_pick?: boolean
          is_value_bet?: boolean
          key_factors?: Json
          match_id: string
          model?: string
          over_under_prediction?: string | null
          predicted_outcome: string
          preview_text?: string | null
          recommended_markets?: Json
          risk_flags?: Json
          updated_at?: string
          value_bet?: Json | null
          win_probability: Json
        }
        Update: {
          ai_summary?: string | null
          btts_prediction?: string | null
          confidence_tier?: string
          created_at?: string
          edge_score?: number
          id?: string
          is_strong_pick?: boolean
          is_value_bet?: boolean
          key_factors?: Json
          match_id?: string
          model?: string
          over_under_prediction?: string | null
          predicted_outcome?: string
          preview_text?: string | null
          recommended_markets?: Json
          risk_flags?: Json
          updated_at?: string
          value_bet?: Json | null
          win_probability?: Json
        }
        Relationships: []
      }
      match_stats: {
        Row: {
          away_corners: number | null
          away_possession: number | null
          away_red_cards: number | null
          away_shots: number | null
          away_shots_on_target: number | null
          away_yellow_cards: number | null
          created_at: string
          home_corners: number | null
          home_possession: number | null
          home_red_cards: number | null
          home_shots: number | null
          home_shots_on_target: number | null
          home_yellow_cards: number | null
          id: string
          match_id: string
          source: string
          updated_at: string
        }
        Insert: {
          away_corners?: number | null
          away_possession?: number | null
          away_red_cards?: number | null
          away_shots?: number | null
          away_shots_on_target?: number | null
          away_yellow_cards?: number | null
          created_at?: string
          home_corners?: number | null
          home_possession?: number | null
          home_red_cards?: number | null
          home_shots?: number | null
          home_shots_on_target?: number | null
          home_yellow_cards?: number | null
          id?: string
          match_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          away_corners?: number | null
          away_possession?: number | null
          away_red_cards?: number | null
          away_shots?: number | null
          away_shots_on_target?: number | null
          away_yellow_cards?: number | null
          created_at?: string
          home_corners?: number | null
          home_possession?: number | null
          home_red_cards?: number | null
          home_shots?: number | null
          home_shots_on_target?: number | null
          home_yellow_cards?: number | null
          id?: string
          match_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_score: number | null
          away_team: string
          created_at: string
          external_id: string | null
          home_score: number | null
          home_team: string
          id: string
          kickoff_time: string
          league: string
          minute: number | null
          predicted_away_score: number | null
          predicted_home_score: number | null
          sport_key: string
          status: string
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          away_team: string
          created_at?: string
          external_id?: string | null
          home_score?: number | null
          home_team: string
          id?: string
          kickoff_time: string
          league: string
          minute?: number | null
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          sport_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          away_team?: string
          created_at?: string
          external_id?: string | null
          home_score?: number | null
          home_team?: string
          id?: string
          kickoff_time?: string
          league?: string
          minute?: number | null
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          sport_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_weights: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          sample_size: number
          w_consistency: number
          w_form: number
          w_model: number
          w_odds: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          sample_size?: number
          w_consistency: number
          w_form: number
          w_model: number
          w_odds: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          sample_size?: number
          w_consistency?: number
          w_form?: number
          w_model?: number
          w_odds?: number
        }
        Relationships: []
      }
      odds: {
        Row: {
          bookmaker: string
          fetched_at: string
          id: string
          implied_probability: number
          market: string
          match_id: string
          odds: number
          outcome: string
        }
        Insert: {
          bookmaker: string
          fetched_at?: string
          id?: string
          implied_probability: number
          market: string
          match_id: string
          odds: number
          outcome: string
        }
        Update: {
          bookmaker?: string
          fetched_at?: string
          id?: string
          implied_probability?: number
          market?: string
          match_id?: string
          odds?: number
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_results: {
        Row: {
          actual_outcome: string | null
          confidence: string | null
          created_at: string
          edge_percentage: number | null
          id: string
          market: string
          match_id: string
          predicted_outcome: string
          predicted_probability: number
          prediction_id: string
          settled_at: string | null
          was_correct: boolean | null
        }
        Insert: {
          actual_outcome?: string | null
          confidence?: string | null
          created_at?: string
          edge_percentage?: number | null
          id?: string
          market: string
          match_id: string
          predicted_outcome: string
          predicted_probability: number
          prediction_id: string
          settled_at?: string | null
          was_correct?: boolean | null
        }
        Update: {
          actual_outcome?: string | null
          confidence?: string | null
          created_at?: string
          edge_percentage?: number | null
          id?: string
          market?: string
          match_id?: string
          predicted_outcome?: string
          predicted_probability?: number
          prediction_id?: string
          settled_at?: string | null
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_results_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          confidence: string
          consistency: number
          created_at: string
          explanation: string | null
          final_score: number
          form_score: number
          id: string
          market: string
          match_id: string
          model_probability: number
          odds_implied_probability: number
          outcome: string
        }
        Insert: {
          confidence: string
          consistency?: number
          created_at?: string
          explanation?: string | null
          final_score: number
          form_score?: number
          id?: string
          market: string
          match_id: string
          model_probability: number
          odds_implied_probability: number
          outcome: string
        }
        Update: {
          confidence?: string
          consistency?: number
          created_at?: string
          explanation?: string | null
          final_score?: number
          form_score?: number
          id?: string
          market?: string
          match_id?: string
          model_probability?: number
          odds_implied_probability?: number
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

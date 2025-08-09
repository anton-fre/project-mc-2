export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      appointment_files: {
        Row: {
          appointment_id: string
          created_at: string
          file_name: string
          id: string
          storage_object_path: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          file_name: string
          id?: string
          storage_object_path: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          file_name?: string
          id?: string
          storage_object_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_files_appointment_fk"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          all_day: boolean
          created_at: string
          end_at: string
          id: string
          notes: string | null
          patient_id: string | null
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_fk"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          ocr_text: string | null
          patient_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          ocr_text?: string | null
          patient_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          ocr_text?: string | null
          patient_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          full_path: string
          id: string
          name: string
          parent_id: string | null
          patient_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_path: string
          id?: string
          name: string
          parent_id?: string | null
          patient_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_path?: string
          id?: string
          name?: string
          parent_id?: string | null
          patient_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_vector_stores: {
        Row: {
          created_at: string
          id: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_appointments: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: []
      }
      question_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          question_id: string
          storage_object_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          question_id: string
          storage_object_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          question_id?: string
          storage_object_path?: string
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          patient_id: string | null
          priority: number
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          patient_id?: string | null
          priority?: number
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          patient_id?: string | null
          priority?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          created_at: string
          file_name: string
          id: string
          owner_user_id: string
          path: string
          patient_id: string | null
          target_email: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          owner_user_id: string
          path: string
          patient_id?: string | null
          target_email: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          owner_user_id?: string
          path?: string
          patient_id?: string | null
          target_email?: string
        }
        Relationships: []
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

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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          id: string
          pinned: boolean
          posted_by: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          title?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          recorded_by: string | null
          remarks: string | null
          status: string
          student_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          recorded_by?: string | null
          remarks?: string | null
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          recorded_by?: string | null
          remarks?: string | null
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      book_loans: {
        Row: {
          book_id: string
          borrowed_on: string
          created_at: string
          due_on: string
          id: string
          returned_on: string | null
          staff_id: string | null
          status: string
          student_id: string | null
        }
        Insert: {
          book_id: string
          borrowed_on?: string
          created_at?: string
          due_on?: string
          id?: string
          returned_on?: string | null
          staff_id?: string | null
          status?: string
          student_id?: string | null
        }
        Update: {
          book_id?: string
          borrowed_on?: string
          created_at?: string
          due_on?: string
          id?: string
          returned_on?: string | null
          staff_id?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: []
      }
      books: {
        Row: {
          author: string | null
          category: string | null
          copies_available: number
          copies_total: number
          created_at: string
          id: string
          isbn: string | null
          shelf: string | null
          title: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          copies_available?: number
          copies_total?: number
          created_at?: string
          id?: string
          isbn?: string | null
          shelf?: string | null
          title: string
        }
        Update: {
          author?: string | null
          category?: string | null
          copies_available?: number
          copies_total?: number
          created_at?: string
          id?: string
          isbn?: string | null
          shelf?: string | null
          title?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          capacity: number
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string
          name: string
          stream: string | null
          year: number
        }
        Insert: {
          capacity?: number
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level: string
          name: string
          stream?: string | null
          year?: number
        }
        Update: {
          capacity?: number
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          level?: string
          name?: string
          stream?: string | null
          year?: number
        }
        Relationships: []
      }
      clinic_visits: {
        Row: {
          attended_by: string | null
          created_at: string
          diagnosis: string | null
          id: string
          referred_to: string | null
          student_id: string
          symptoms: string
          treatment: string | null
          visit_date: string
        }
        Insert: {
          attended_by?: string | null
          created_at?: string
          diagnosis?: string | null
          id?: string
          referred_to?: string | null
          student_id: string
          symptoms: string
          treatment?: string | null
          visit_date?: string
        }
        Update: {
          attended_by?: string | null
          created_at?: string
          diagnosis?: string | null
          id?: string
          referred_to?: string | null
          student_id?: string
          symptoms?: string
          treatment?: string | null
          visit_date?: string
        }
        Relationships: []
      }
      discipline_records: {
        Row: {
          action_taken: string | null
          category: string
          created_at: string
          description: string
          id: string
          incident_date: string
          reported_by: string | null
          severity: string
          student_id: string
        }
        Insert: {
          action_taken?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          incident_date?: string
          reported_by?: string | null
          severity?: string
          student_id: string
        }
        Update: {
          action_taken?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          incident_date?: string
          reported_by?: string | null
          severity?: string
          student_id?: string
        }
        Relationships: []
      }
      dorm_assignments: {
        Row: {
          assigned_on: string
          bed_no: string | null
          created_at: string
          dormitory_id: string
          id: string
          student_id: string
        }
        Insert: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id: string
          id?: string
          student_id: string
        }
        Update: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id?: string
          id?: string
          student_id?: string
        }
        Relationships: []
      }
      dormitories: {
        Row: {
          capacity: number
          created_at: string
          gender: string
          id: string
          matron_id: string | null
          name: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          gender: string
          id?: string
          matron_id?: string | null
          name: string
        }
        Update: {
          capacity?: number
          created_at?: string
          gender?: string
          id?: string
          matron_id?: string | null
          name?: string
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          created_at: string
          exam_id: string
          grade: string | null
          id: string
          recorded_by: string | null
          remarks: string | null
          score: number
          student_id: string
          subject_id: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          grade?: string | null
          id?: string
          recorded_by?: string | null
          remarks?: string | null
          score: number
          student_id: string
          subject_id: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          grade?: string | null
          id?: string
          recorded_by?: string | null
          remarks?: string | null
          score?: number
          student_id?: string
          subject_id?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      exams: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          term: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          term: string
          year?: number
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          term?: string
          year?: number
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          amount: number
          created_at: string
          id: string
          level: string
          name: string
          term: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          level: string
          name: string
          term: string
          year?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          level?: string
          name?: string
          term?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          fee_structure_id: string | null
          id: string
          invoice_no: string
          paid: number
          status: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          fee_structure_id?: string | null
          id?: string
          invoice_no: string
          paid?: number
          status?: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          fee_structure_id?: string | null
          id?: string
          invoice_no?: string
          paid?: number
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      parent_student_links: {
        Row: {
          created_at: string
          id: string
          parent_user_id: string
          relationship: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_user_id: string
          relationship?: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_user_id?: string
          relationship?: string
          student_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          paid_on: string
          receipt_no: string
          received_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: string
          paid_on?: string
          receipt_no: string
          received_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          paid_on?: string
          receipt_no?: string
          received_by?: string | null
          reference?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          created_at: string
          credential_delivery_mode: string
          email_domain: string
          id: string
          school_name: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_delivery_mode?: string
          email_domain?: string
          id?: string
          school_name?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_delivery_mode?: string
          email_domain?: string
          id?: string
          school_name?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          employee_no: string
          first_name: string
          hire_date: string
          id: string
          last_name: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          unique_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no: string
          first_name: string
          hire_date?: string
          id?: string
          last_name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          unique_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no?: string
          first_name?: string
          hire_date?: string
          id?: string
          last_name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          unique_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      student_user_links: {
        Row: {
          created_at: string
          id: string
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          user_id?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          address: string | null
          admission_no: string
          admitted_on: string
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          medical_notes: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          status: string
          unique_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admission_no: string
          admitted_on?: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          medical_notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          status?: string
          unique_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admission_no?: string
          admitted_on?: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          medical_notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          status?: string
          unique_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          id: string
          level: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level?: string
          name?: string
        }
        Relationships: []
      }
      timetable_slots: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: []
      }
      transport_assignments: {
        Row: {
          assigned_on: string
          created_at: string
          id: string
          pickup_point: string | null
          route_id: string
          student_id: string
        }
        Insert: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id: string
          student_id: string
        }
        Update: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id?: string
          student_id?: string
        }
        Relationships: []
      }
      transport_routes: {
        Row: {
          capacity: number
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          monthly_fee: number
          name: string
          vehicle_reg: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          monthly_fee?: number
          name: string
          vehicle_reg?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          monthly_fee?: number
          name?: string
          vehicle_reg?: string | null
        }
        Relationships: []
      }
      unique_id_counters: {
        Row: {
          category: string
          last_value: number
          year: number
        }
        Insert: {
          category: string
          last_value?: number
          year: number
        }
        Update: {
          category?: string
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          category: string
          created_at: string
          is_active: boolean
          last_reset_at: string | null
          password_reset_required: boolean
          synthetic_email: string
          unique_id: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          is_active?: boolean
          last_reset_at?: string | null
          password_reset_required?: boolean
          synthetic_email: string
          unique_id: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          is_active?: boolean
          last_reset_at?: string | null
          password_reset_required?: boolean
          synthetic_email?: string
          unique_id?: string
          user_id?: string
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
      current_student_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_parent_of: { Args: { _student_id: string }; Returns: boolean }
      is_student: { Args: { _student_id: string }; Returns: boolean }
      lookup_login_email: { Args: { _unique_id: string }; Returns: string }
      my_children_ids: { Args: never; Returns: string[] }
      next_unique_id: { Args: { _category: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "principal"
        | "deputy_principal"
        | "class_teacher"
        | "subject_teacher"
        | "hod"
        | "admission_officer"
        | "bursar"
        | "librarian"
        | "sports"
        | "boarding"
        | "parent"
        | "student"
        | "staff"
        | "nurse"
        | "matron"
        | "transport_officer"
        | "teacher"
        | "school_admin"
        | "academic_master"
        | "exams_admin"
        | "exams_user"
        | "finance_admin"
        | "finance_user"
        | "boarding_admin"
        | "boarding_user"
        | "kitchen_admin"
        | "kitchen_user"
        | "security_admin"
        | "security_user"
        | "library_admin"
        | "library_user"
        | "clinic_admin"
        | "clinic_user"
        | "sports_admin"
        | "sports_user"
        | "store_admin"
        | "store_user"
        | "transport_admin"
        | "guidance_admin"
        | "ict_admin"
        | "discipline_admin"
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
      app_role: [
        "super_admin",
        "principal",
        "deputy_principal",
        "class_teacher",
        "subject_teacher",
        "hod",
        "admission_officer",
        "bursar",
        "librarian",
        "sports",
        "boarding",
        "parent",
        "student",
        "staff",
        "nurse",
        "matron",
        "transport_officer",
        "teacher",
        "school_admin",
        "academic_master",
        "exams_admin",
        "exams_user",
        "finance_admin",
        "finance_user",
        "boarding_admin",
        "boarding_user",
        "kitchen_admin",
        "kitchen_user",
        "security_admin",
        "security_user",
        "library_admin",
        "library_user",
        "clinic_admin",
        "clinic_user",
        "sports_admin",
        "sports_user",
        "store_admin",
        "store_user",
        "transport_admin",
        "guidance_admin",
        "ict_admin",
        "discipline_admin",
      ],
    },
  },
} as const

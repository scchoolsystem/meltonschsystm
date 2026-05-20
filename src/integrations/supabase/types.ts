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
      _one_time_secrets: {
        Row: {
          created_at: string
          id: string
          label: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          school_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          school_id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          school_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          id: string
          pinned: boolean
          posted_by: string | null
          school_id: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          school_id?: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          recorded_by: string | null
          remarks: string | null
          school_id: string
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
          school_id?: string
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
          school_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      book_loans: {
        Row: {
          book_id: string
          borrowed_on: string
          created_at: string
          due_on: string
          id: string
          returned_on: string | null
          school_id: string
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
          school_id?: string
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
          school_id?: string
          staff_id?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_loans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_loans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          shelf?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_fee_components: {
        Row: {
          amount: number
          class_id: string
          component: string
          created_at: string
          id: string
          school_id: string
          term: string
          year: number
        }
        Insert: {
          amount?: number
          class_id: string
          component: string
          created_at?: string
          id?: string
          school_id?: string
          term: string
          year?: number
        }
        Update: {
          amount?: number
          class_id?: string
          component?: string
          created_at?: string
          id?: string
          school_id?: string
          term?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_fee_components_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_fee_components_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number
          class_teacher_id: string | null
          created_at: string
          id: string
          level: string
          name: string
          school_id: string
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
          school_id?: string
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
          school_id?: string
          stream?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_visits: {
        Row: {
          attended_by: string | null
          created_at: string
          diagnosis: string | null
          id: string
          referred_to: string | null
          school_id: string
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
          school_id?: string
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
          school_id?: string
          student_id?: string
          symptoms?: string
          treatment?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_visits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          severity?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      dorm_assignments: {
        Row: {
          assigned_on: string
          bed_no: string | null
          created_at: string
          dormitory_id: string
          id: string
          school_id: string
          student_id: string
        }
        Insert: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id: string
          id?: string
          school_id?: string
          student_id: string
        }
        Update: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id?: string
          id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dorm_assignments_dormitory_id_fkey"
            columns: ["dormitory_id"]
            isOneToOne: false
            referencedRelation: "dormitories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dorm_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dorm_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      dormitories: {
        Row: {
          capacity: number
          created_at: string
          gender: string
          id: string
          matron_id: string | null
          name: string
          school_id: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          gender: string
          id?: string
          matron_id?: string | null
          name: string
          school_id?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          gender?: string
          id?: string
          matron_id?: string | null
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dormitories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          score?: number
          student_id?: string
          subject_id?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          school_id: string
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
          school_id?: string
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
          school_id?: string
          start_date?: string | null
          status?: string
          term?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          created_at: string
          id: string
          level: string
          name: string
          school_id: string
          term: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          level: string
          name: string
          school_id?: string
          term: string
          year?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          level?: string
          name?: string
          school_id?: string
          term?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      field_edit_audit: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          override_used: boolean
          resource: string
          resource_id: string
          school_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          override_used?: boolean
          resource: string
          resource_id: string
          school_id?: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          override_used?: boolean
          resource?: string
          resource_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_edit_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      field_policies: {
        Row: {
          classification: string
          field: string
          id: string
          notes: string | null
          required_level: number
          resource: string
          school_id: string
        }
        Insert: {
          classification?: string
          field: string
          id?: string
          notes?: string | null
          required_level?: number
          resource: string
          school_id?: string
        }
        Update: {
          classification?: string
          field?: string
          id?: string
          notes?: string | null
          required_level?: number
          resource?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_passes: {
        Row: {
          actual_return: string | null
          authorized_by: string | null
          created_at: string
          exit_time: string
          expected_return: string | null
          id: string
          reason: string
          school_id: string
          status: string
          student_id: string
        }
        Insert: {
          actual_return?: string | null
          authorized_by?: string | null
          created_at?: string
          exit_time?: string
          expected_return?: string | null
          id?: string
          reason: string
          school_id?: string
          status?: string
          student_id: string
        }
        Update: {
          actual_return?: string | null
          authorized_by?: string | null
          created_at?: string
          exit_time?: string
          expected_return?: string | null
          id?: string
          reason?: string
          school_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_passes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_bands: {
        Row: {
          created_at: string
          grade: string
          id: string
          max_score: number
          min_score: number
          remarks: string | null
          scale_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          max_score: number
          min_score: number
          remarks?: string | null
          scale_id: string
          school_id?: string
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          max_score?: number
          min_score?: number
          remarks?: string | null
          scale_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_bands_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_bands_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          school_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          incident_date: string
          location: string
          reported_by: string | null
          school_id: string
          severity: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          incident_date?: string
          location: string
          reported_by?: string | null
          school_id?: string
          severity?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          incident_date?: string
          location?: string
          reported_by?: string | null
          school_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_stock: {
        Row: {
          created_at: string
          id: string
          item: string
          low_threshold: number
          quantity: number
          school_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item: string
          low_threshold?: number
          quantity?: number
          school_id?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item?: string
          low_threshold?: number
          quantity?: number
          school_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stock_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      leaving_certificates: {
        Row: {
          achievements: string | null
          conduct: string
          id: string
          issued_at: string
          issued_by: string | null
          leaving_date: string
          reason: string
          school_id: string
          serial_no: string
          signed_by_name: string | null
          signed_by_title: string | null
          student_id: string
        }
        Insert: {
          achievements?: string | null
          conduct?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          leaving_date?: string
          reason?: string
          school_id?: string
          serial_no: string
          signed_by_name?: string | null
          signed_by_title?: string | null
          student_id: string
        }
        Update: {
          achievements?: string | null
          conduct?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          leaving_date?: string
          reason?: string
          school_id?: string
          serial_no?: string
          signed_by_name?: string | null
          signed_by_title?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaving_certificates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaving_certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          school_id: string
          target_id: string
          target_type: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          school_id?: string
          target_id: string
          target_type: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          school_id?: string
          target_id?: string
          target_type?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          meal: string
          meal_date: string
          menu: string
          posted_by: string | null
          school_id: string
          served_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          meal: string
          meal_date?: string
          menu: string
          posted_by?: string | null
          school_id?: string
          served_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          meal?: string
          meal_date?: string
          menu?: string
          posted_by?: string | null
          school_id?: string
          served_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_payment_intents: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          error: string | null
          id: string
          initiated_by: string | null
          invoice_id: string
          phone: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          initiated_by?: string | null
          invoice_id: string
          phone: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          initiated_by?: string | null
          invoice_id?: string
          phone?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      override_log: {
        Row: {
          actor_id: string
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string
          resource: string
          resource_id: string
          school_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason: string
          resource: string
          resource_id: string
          school_id?: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string
          resource?: string
          resource_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "override_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_links: {
        Row: {
          created_at: string
          id: string
          link_method: string
          linked_by: string | null
          parent_user_id: string
          relationship: string
          school_id: string
          student_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          link_method?: string
          linked_by?: string | null
          parent_user_id: string
          relationship?: string
          school_id?: string
          student_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          link_method?: string
          linked_by?: string | null
          parent_user_id?: string
          relationship?: string
          school_id?: string
          student_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_parent_links: {
        Row: {
          attempted_code: string | null
          created_at: string
          id: string
          parent_email: string | null
          parent_phone: string | null
          parent_user_id: string
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          status: string
        }
        Insert: {
          attempted_code?: string | null
          created_at?: string
          id?: string
          parent_email?: string | null
          parent_phone?: string | null
          parent_user_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          status?: string
        }
        Update: {
          attempted_code?: string | null
          created_at?: string
          id?: string
          parent_email?: string | null
          parent_phone?: string | null
          parent_user_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_parent_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          invoice_no: string
          issued_by: string | null
          notes: string | null
          paid: number
          period_end: string
          period_start: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_no: string
          issued_by?: string | null
          notes?: string | null
          paid?: number
          period_end: string
          period_start: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_no?: string
          issued_by?: string | null
          notes?: string | null
          paid?: number
          period_end?: string
          period_start?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          notes: string | null
          paid_on: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: string
          notes?: string | null
          paid_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          paid_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_features_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_members: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_members_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          academic_year: number | null
          address: string | null
          created_at: string
          credential_delivery_mode: string
          current_term: string | null
          email: string | null
          email_domain: string
          id: string
          logo_url: string | null
          motto: string | null
          phone: string | null
          primary_color: string | null
          school_name: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          academic_year?: number | null
          address?: string | null
          created_at?: string
          credential_delivery_mode?: string
          current_term?: string | null
          email?: string | null
          email_domain?: string
          id?: string
          logo_url?: string | null
          motto?: string | null
          phone?: string | null
          primary_color?: string | null
          school_name?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          academic_year?: number | null
          address?: string | null
          created_at?: string
          credential_delivery_mode?: string
          current_term?: string | null
          email?: string | null
          email_domain?: string
          id?: string
          logo_url?: string | null
          motto?: string | null
          phone?: string | null
          primary_color?: string | null
          school_name?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      school_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          notes: string | null
          plan_id: string
          school_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          notes?: string | null
          plan_id: string
          school_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          notes?: string | null
          plan_id?: string
          school_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          academic_year: number | null
          address: string | null
          created_at: string
          credential_delivery_mode: string
          current_term: string | null
          email: string | null
          email_domain: string
          email_host: string | null
          email_pass: string | null
          email_port: number | null
          email_user: string | null
          id: string
          logo_url: string | null
          motto: string | null
          name: string
          phone: string | null
          primary_color: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year?: number | null
          address?: string | null
          created_at?: string
          credential_delivery_mode?: string
          current_term?: string | null
          email?: string | null
          email_domain?: string
          email_host?: string | null
          email_pass?: string | null
          email_port?: number | null
          email_user?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year?: number | null
          address?: string | null
          created_at?: string
          credential_delivery_mode?: string
          current_term?: string | null
          email?: string | null
          email_domain?: string
          email_host?: string | null
          email_pass?: string | null
          email_port?: number | null
          email_user?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      smart_alerts: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          severity: string
          subject_id: string | null
          subject_type: string | null
          title: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          severity?: string
          subject_id?: string | null
          subject_type?: string | null
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          severity?: string
          subject_id?: string | null
          subject_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_alerts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          lifecycle_changed_at: string | null
          lifecycle_changed_by: string | null
          lifecycle_reason: string | null
          lifecycle_status: string
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status: string
          transferred_to: string | null
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
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_status?: string
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          status?: string
          transferred_to?: string | null
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
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_status?: string
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          status?: string
          transferred_to?: string | null
          unique_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_user_links: {
        Row: {
          created_at: string
          id: string
          school_id: string
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id?: string
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_user_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_user_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          lifecycle_changed_at: string | null
          lifecycle_changed_by: string | null
          lifecycle_reason: string | null
          lifecycle_status: string
          medical_notes: string | null
          national_id: string | null
          parent_auth_code_hash: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          school_id: string
          status: string
          transferred_to: string | null
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
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_status?: string
          medical_notes?: string | null
          national_id?: string | null
          parent_auth_code_hash?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          school_id?: string
          status?: string
          transferred_to?: string | null
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
          lifecycle_changed_at?: string | null
          lifecycle_changed_by?: string | null
          lifecycle_reason?: string | null
          lifecycle_status?: string
          medical_notes?: string | null
          national_id?: string | null
          parent_auth_code_hash?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          school_id?: string
          status?: string
          transferred_to?: string | null
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
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level: string
          name: string
          school_id?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          monthly_fee: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_fee?: number
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_platform_reply: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_platform_reply?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_platform_reply?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          body: string
          created_at: string
          id: string
          opened_by: string | null
          priority: string
          school_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          body: string
          created_at?: string
          id?: string
          opened_by?: string | null
          priority?: string
          school_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          body?: string
          created_at?: string
          id?: string
          opened_by?: string | null
          priority?: string
          school_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_assignments: {
        Row: {
          assigned_on: string
          created_at: string
          id: string
          pickup_point: string | null
          route_id: string
          school_id: string
          student_id: string
        }
        Insert: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id: string
          school_id?: string
          student_id: string
        }
        Update: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          school_id: string
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
          school_id?: string
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
          school_id?: string
          vehicle_reg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      unique_id_counters: {
        Row: {
          category: string
          last_value: number
          school_id: string
          year: number
        }
        Insert: {
          category: string
          last_value?: number
          school_id: string
          year: number
        }
        Update: {
          category?: string
          last_value?: number
          school_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "unique_id_counters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credentials: {
        Row: {
          category: string
          created_at: string
          is_active: boolean
          last_reset_at: string | null
          password_reset_required: boolean
          school_id: string
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
          school_id?: string
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
          school_id?: string
          synthetic_email?: string
          unique_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credentials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_attendance_daily: {
        Row: {
          absent: number | null
          date: string | null
          late: number | null
          present: number | null
          school_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      v_finance_summary: {
        Row: {
          collection_pct: number | null
          defaulters: number | null
          invoice_count: number | null
          school_id: string | null
          total_invoiced: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      v_results_by_class: {
        Row: {
          class_id: string | null
          class_name: string | null
          mean_score: number | null
          sample_size: number | null
          school_id: string | null
          subject_code: string | null
          subject_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_subject_means: {
        Row: {
          mean_score: number | null
          sample_size: number | null
          school_id: string | null
          subject_code: string | null
          subject_id: string | null
          subject_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      v_weak_students: {
        Row: {
          admission_no: string | null
          first_name: string | null
          last_name: string | null
          mean_score: number | null
          sample_size: number | null
          school_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_class_fees: {
        Args: { _student: string; _term?: string; _year?: number }
        Returns: number
      }
      can_edit: {
        Args: { _field: string; _resource: string; _user: string }
        Returns: {
          allowed: boolean
          classification: string
          required_level: number
          requires_override: boolean
        }[]
      }
      current_school_email_domain: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_user_school: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_parent_match: {
        Args: { _email: string; _phone: string }
        Returns: {
          method: string
          student_id: string
        }[]
      }
      grade_for: {
        Args: { p_school_id: string; p_score: number }
        Returns: {
          grade: string
          remarks: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_parent_of: { Args: { _student_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean }
      is_student: { Args: { _student_id: string }; Returns: boolean }
      lookup_login_email: {
        Args: { _school_slug?: string; _unique_id: string }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_children_ids: { Args: never; Returns: string[] }
      my_school_id: { Args: never; Returns: string }
      next_unique_id: { Args: { _category: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      role_level: { Args: { _user: string }; Returns: number }
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
        | "platform_owner"
        | "platform_support"
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
        "platform_owner",
        "platform_support",
      ],
    },
  },
} as const

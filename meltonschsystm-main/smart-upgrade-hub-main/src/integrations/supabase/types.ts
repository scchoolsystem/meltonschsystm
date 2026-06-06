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
          school_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          school_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          school_id?: string | null
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
          school_id: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          school_id?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          posted_by?: string | null
          school_id?: string | null
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          status?: string
          student_id?: string
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
      book_loans: {
        Row: {
          book_id: string
          borrowed_on: string
          created_at: string
          due_on: string
          id: string
          returned_on: string | null
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          staff_id?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_loans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
          created_at: string
          id: string
          name: string
          school_id: string | null
          term: string | null
          year: number
        }
        Insert: {
          amount?: number
          class_id: string
          created_at?: string
          id?: string
          name: string
          school_id?: string | null
          term?: string | null
          year: number
        }
        Update: {
          amount?: number
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string | null
          term?: string | null
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
          join_code: string | null
          level: string
          name: string
          school_id: string | null
          stream: string | null
          year: number
        }
        Insert: {
          capacity?: number
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          join_code?: string | null
          level: string
          name: string
          school_id?: string | null
          stream?: string | null
          year?: number
        }
        Update: {
          capacity?: number
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          join_code?: string | null
          level?: string
          name?: string
          school_id?: string | null
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
      classroom_posts: {
        Row: {
          attachment_url: string | null
          author_id: string | null
          body: string | null
          class_id: string | null
          created_at: string
          due_at: string | null
          due_date: string | null
          id: string
          kind: string
          school_id: string | null
          title: string
        }
        Insert: {
          attachment_url?: string | null
          author_id?: string | null
          body?: string | null
          class_id?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          school_id?: string | null
          title: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string | null
          body?: string | null
          class_id?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          school_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_posts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_posts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_submissions: {
        Row: {
          body: string | null
          feedback: string | null
          file_path: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          post_id: string
          school_id: string | null
          score: number | null
          status: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          body?: string | null
          feedback?: string | null
          file_path?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          post_id: string
          school_id?: string | null
          score?: number | null
          status?: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          body?: string | null
          feedback?: string | null
          file_path?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          post_id?: string
          school_id?: string | null
          score?: number | null
          status?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_submissions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "classroom_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
        ]
      }
      co_curricular_activities: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "co_curricular_activities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_curricular_activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
        ]
      }
      dorm_assignments: {
        Row: {
          assigned_on: string
          bed_no: string | null
          created_at: string
          dormitory_id: string
          id: string
          school_id: string | null
          student_id: string
        }
        Insert: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id: string
          id?: string
          school_id?: string | null
          student_id: string
        }
        Update: {
          assigned_on?: string
          bed_no?: string | null
          created_at?: string
          dormitory_id?: string
          id?: string
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dorm_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          gender: string
          id?: string
          matron_id?: string | null
          name: string
          school_id?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          gender?: string
          id?: string
          matron_id?: string | null
          name?: string
          school_id?: string | null
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
          error: string | null
          id: string
          message_id: string | null
          recipient_email: string | null
          school_id: string | null
          sent_by: string | null
          status: string
          subject: string | null
          template: string | null
          template_name: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message_id?: string | null
          recipient_email?: string | null
          school_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          template?: string | null
          template_name?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message_id?: string | null
          recipient_email?: string | null
          school_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          template?: string | null
          template_name?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          created_at: string
          exam_id: string
          grade: string | null
          id: string
          recorded_by: string | null
          remarks: string | null
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          score?: number
          student_id?: string
          subject_id?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
          school_id: string | null
          term: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          level: string
          name: string
          school_id?: string | null
          term: string
          year?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          level?: string
          name?: string
          school_id?: string | null
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
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          override_used: boolean
          resource: string
          school_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          override_used?: boolean
          resource: string
          school_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          override_used?: boolean
          resource?: string
          school_id?: string | null
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
          created_at: string
          field: string
          id: string
          notes: string | null
          required_level: number | null
          resource: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          classification?: string
          created_at?: string
          field: string
          id?: string
          notes?: string | null
          required_level?: number | null
          resource: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          classification?: string
          created_at?: string
          field?: string
          id?: string
          notes?: string | null
          required_level?: number | null
          resource?: string
          school_id?: string | null
          updated_at?: string
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
          approved_by: string | null
          created_at: string
          exit_time: string | null
          id: string
          reason: string | null
          return_time: string | null
          school_id: string | null
          status: string
          student_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          exit_time?: string | null
          id?: string
          reason?: string | null
          return_time?: string | null
          school_id?: string | null
          status?: string
          student_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          exit_time?: string | null
          id?: string
          reason?: string | null
          return_time?: string | null
          school_id?: string | null
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
          points: number | null
          remark: string | null
          remarks: string | null
          scale_id: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          max_score: number
          min_score: number
          points?: number | null
          remark?: string | null
          remarks?: string | null
          scale_id: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          max_score?: number
          min_score?: number
          points?: number | null
          remark?: string | null
          remarks?: string | null
          scale_id?: string
          school_id?: string | null
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
          school_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string | null
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
          body: string | null
          created_at: string
          description: string | null
          id: string
          incident_date: string
          location: string | null
          reported_by: string | null
          school_id: string | null
          severity: string
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_date?: string
          location?: string | null
          reported_by?: string | null
          school_id?: string | null
          severity?: string
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_date?: string
          location?: string | null
          reported_by?: string | null
          school_id?: string | null
          severity?: string
          title?: string | null
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
      insurance_policies: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          notes: string | null
          premium: number | null
          provider: string | null
          school_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          premium?: number | null
          provider?: string | null
          school_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          premium?: number | null
          provider?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_school_id_fkey"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          status?: string
          student_id?: string
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
      kitchen_stock: {
        Row: {
          created_at: string
          id: string
          item: string
          low_threshold: number | null
          notes: string | null
          quantity: number
          reorder_level: number | null
          school_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item: string
          low_threshold?: number | null
          notes?: string | null
          quantity?: number
          reorder_level?: number | null
          school_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item?: string
          low_threshold?: number | null
          notes?: string | null
          quantity?: number
          reorder_level?: number | null
          school_id?: string | null
          unit?: string | null
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
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          leaving_date: string
          reason: string
          school_id: string | null
          serial_no: string
          signed_by_name: string | null
          signed_by_title: string | null
          student_id: string
        }
        Insert: {
          achievements?: string | null
          conduct: string
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          leaving_date: string
          reason: string
          school_id?: string | null
          serial_no: string
          signed_by_name?: string | null
          signed_by_title?: string | null
          student_id: string
        }
        Update: {
          achievements?: string | null
          conduct?: string
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          leaving_date?: string
          reason?: string
          school_id?: string | null
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
      live_session_attendance: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          joined_at: string | null
          left_at: string | null
          school_id: string | null
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          joined_at?: string | null
          left_at?: string | null
          school_id?: string | null
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          joined_at?: string | null
          left_at?: string | null
          school_id?: string | null
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          class_id: string | null
          created_at: string
          ended_at: string | null
          host_id: string | null
          id: string
          meeting_url: string | null
          room_name: string | null
          scheduled_start: string
          school_id: string | null
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          ended_at?: string | null
          host_id?: string | null
          id?: string
          meeting_url?: string | null
          room_name?: string | null
          scheduled_start: string
          school_id?: string | null
          started_at?: string | null
          status?: string
          title: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          ended_at?: string | null
          host_id?: string | null
          id?: string
          meeting_url?: string | null
          room_name?: string | null
          scheduled_start?: string
          school_id?: string | null
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_school_id_fkey"
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
          meal: string | null
          meal_date: string
          meal_type: string
          menu: string
          posted_by: string | null
          school_id: string | null
          served_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          meal?: string | null
          meal_date: string
          meal_type?: string
          menu: string
          posted_by?: string | null
          school_id?: string | null
          served_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          meal?: string | null
          meal_date?: string
          meal_type?: string
          menu?: string
          posted_by?: string | null
          school_id?: string | null
          served_count?: number | null
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
          mpesa_receipt: string | null
          phone: string
          result_desc: string | null
          school_id: string | null
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
          mpesa_receipt?: string | null
          phone: string
          result_desc?: string | null
          school_id?: string | null
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
          mpesa_receipt?: string | null
          phone?: string
          result_desc?: string | null
          school_id?: string | null
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
      notifications_log: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          error: string | null
          id: string
          recipient: string | null
          school_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string | null
          school_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string | null
          school_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      override_log: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string | null
          id: string
          reason: string | null
          resource: string
          school_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          reason?: string | null
          resource: string
          school_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          reason?: string | null
          resource?: string
          school_id?: string | null
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
          link_method: string | null
          linked_by: string | null
          parent_user_id: string
          relationship: string
          school_id: string | null
          student_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          link_method?: string | null
          linked_by?: string | null
          parent_user_id: string
          relationship?: string
          school_id?: string | null
          student_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          link_method?: string | null
          linked_by?: string | null
          parent_user_id?: string
          relationship?: string
          school_id?: string | null
          student_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
        }
        Relationships: [
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
          created_at: string
          id: string
          match_key: string | null
          parent_email: string | null
          parent_phone: string | null
          parent_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          school_id: string | null
          status: string
          student_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_key?: string | null
          parent_email?: string | null
          parent_phone?: string | null
          parent_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          status?: string
          student_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_key?: string | null
          parent_email?: string | null
          parent_phone?: string | null
          parent_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_parent_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_parent_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          notes: string | null
          paid: number
          period_end: string | null
          period_start: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_no: string
          notes?: string | null
          paid?: number
          period_end?: string | null
          period_start?: string | null
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
          notes?: string | null
          paid?: number
          period_end?: string | null
          period_start?: string | null
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
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          school_name?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subscriptions: {
        Row: {
          amount_override: number | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_override?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_override?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          school_id?: string
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
          current_term: string | null
          email: string | null
          email_domain: string | null
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
          current_term?: string | null
          email?: string | null
          email_domain?: string | null
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
          current_term?: string | null
          email?: string | null
          email_domain?: string | null
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
          school_id: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          school_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          school_id?: string | null
          severity?: string
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
      sms_queue: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          school_id: string | null
          sent_at: string | null
          status: string
          to_phone: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          school_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          school_id?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_queue_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          admin_unit: string | null
          assigned_area: string | null
          class_responsibility: string | null
          created_at: string
          department: string | null
          department_id: string | null
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
          oversight: string | null
          phone: string | null
          photo_url: string | null
          position_title: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          shift: string | null
          staff_category: string | null
          status: string
          sub_department_id: string | null
          support_unit: string | null
          transferred_to: string | null
          unique_id: string | null
          user_id: string | null
        }
        Insert: {
          admin_unit?: string | null
          assigned_area?: string | null
          class_responsibility?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
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
          oversight?: string | null
          phone?: string | null
          photo_url?: string | null
          position_title?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          shift?: string | null
          staff_category?: string | null
          status?: string
          sub_department_id?: string | null
          support_unit?: string | null
          transferred_to?: string | null
          unique_id?: string | null
          user_id?: string | null
        }
        Update: {
          admin_unit?: string | null
          assigned_area?: string | null
          class_responsibility?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
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
          oversight?: string | null
          phone?: string | null
          photo_url?: string | null
          position_title?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          shift?: string | null
          staff_category?: string | null
          status?: string
          sub_department_id?: string | null
          support_unit?: string | null
          transferred_to?: string | null
          unique_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_department_fk"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sub_department_id_fkey"
            columns: ["sub_department_id"]
            isOneToOne: false
            referencedRelation: "sub_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_co_curricular: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          role: string
          school_id: string | null
          staff_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          role?: string
          school_id?: string | null
          staff_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          role?: string
          school_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_co_curricular_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "co_curricular_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_co_curricular_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_co_curricular_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      student_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string | null
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          school_id: string | null
          size_bytes: number | null
          student_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          school_id?: string | null
          size_bytes?: number | null
          student_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          school_id?: string | null
          size_bytes?: number | null
          student_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_insurance: {
        Row: {
          created_at: string
          id: string
          policy_id: string
          school_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_id: string
          school_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_id?: string
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_insurance_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_insurance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_insurance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_user_links: {
        Row: {
          created_at: string
          id: string
          school_id: string | null
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id?: string | null
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string | null
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
          level: string | null
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
          school_id: string | null
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
          level?: string | null
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
          school_id?: string | null
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
          level?: string | null
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
          school_id?: string | null
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
      sub_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_departments_school_id_fkey"
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
          school_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level: string
          name: string
          school_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level?: string
          name?: string
          school_id?: string | null
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
          attachment_url: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          school_id: string | null
          ticket_id: string
        }
        Insert: {
          attachment_url?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          school_id?: string | null
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          school_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
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
          created_at: string
          id: string
          opened_by: string | null
          school_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opened_by?: string | null
          school_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          opened_by?: string | null
          school_id?: string | null
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
      teacher_subjects: {
        Row: {
          created_at: string
          id: string
          school_id: string | null
          staff_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id?: string | null
          staff_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string | null
          staff_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
          student_id: string
        }
        Insert: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id: string
          school_id?: string | null
          student_id: string
        }
        Update: {
          assigned_on?: string
          created_at?: string
          id?: string
          pickup_point?: string | null
          route_id?: string
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
          school_id: string | null
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
          school_id?: string | null
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
          school_id?: string | null
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
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
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
      [_ in never]: never
    }
    Functions: {
      assign_class_fees: { Args: { _student: string }; Returns: undefined }
      can_edit: {
        Args: { _field: string; _resource: string; _user: string }
        Returns: Json
      }
      current_school_email_domain: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_user_school: { Args: never; Returns: string }
      enqueue_email:
        | {
            Args: {
              _payload?: Json
              _subject: string
              _template: string
              _to: string
            }
            Returns: string
          }
        | {
            Args: {
              _payload: Json
              _queue_name: string
              _subject: string
              _template: string
              _to: string
            }
            Returns: string
          }
      find_parent_match: {
        Args: { _email: string; _phone: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_member_of: { Args: { _school_id: string }; Returns: boolean }
      is_parent_of: { Args: { _student_id: string }; Returns: boolean }
      is_platform: { Args: never; Returns: boolean }
      is_platform_owner:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_student: { Args: { _student_id: string }; Returns: boolean }
      lookup_login_email:
        | { Args: { _unique_id: string }; Returns: string }
        | {
            Args: { _school_slug: string; _unique_id: string }
            Returns: string
          }
      my_children_ids: { Args: never; Returns: string[] }
      my_school_id: { Args: never; Returns: string }
      next_unique_id: { Args: { _category: string }; Returns: string }
      pick_class_for_level: { Args: { _level: string }; Returns: string }
      pick_dorm_for_gender: { Args: { _gender: string }; Returns: string }
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

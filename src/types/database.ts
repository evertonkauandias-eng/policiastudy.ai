export type StudyStatus = 'not_started' | 'studying' | 'studied' | 'reviewed'

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface ExamPreference {
  id: string
  user_id: string
  exam_name: string
  institution: string
  state: string
  desired_position: string
  examining_board: string
  exam_date: string | null
  preparation_status: 'planejamento' | 'estudando' | 'revisao' | 'pronto'
  created_at: string
  updated_at: string
}

export interface Subject {
  id: string
  user_id: string
  name: string
  priority: boolean
  created_at: string
  updated_at: string
}

export interface Topic {
  id: string
  user_id: string
  subject_id: string
  name: string
  study_status: StudyStatus
  notes: string
  created_at: string
  updated_at: string
}

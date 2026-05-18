export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contractor'
export type PayType = 'hourly' | 'salary'
export type LeaveType = 'annual' | 'sick' | 'personal' | 'parental' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export type PayRateType =
  | 'default' | 'weekday' | 'weekend' | 'evening'
  | 'public_holiday' | 'overtime' | 'custom'

export interface StaffMember {
  id: string
  business_id: string
  user_id: string | null
  pos_staff_id: string | null
  portal_enabled: boolean
  color: string | null
  first_name: string
  last_name: string
  preferred_name: string | null
  position: string
  employment_type: EmploymentType
  status: 'active' | 'inactive' | 'terminated'
  personal_email: string | null
  work_email: string | null
  mobile: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  pay_type: PayType
  pay_rate_cents: number | null
  pay_frequency: string
  superannuation_rate: number
  start_date: string | null
  end_date: string | null
  invite_sent_at: string | null
  created_at: string
  updated_at: string
}

export interface StaffPayRate {
  id: string
  business_id: string
  staff_member_id: string
  rate_type: PayRateType
  hourly_rate_cents: number
  hourly_rate_dollars: string
  applies_to_days: number[] | null
  applies_from_time: string | null
  applies_until_time: string | null
  effective_from: string
  effective_until: string | null
  notes: string | null
}

export interface StaffSkill {
  id: string
  business_id: string
  name: string
  description: string | null
  color: string
  sort_order: number
}

export interface StaffArea {
  id: string
  business_id: string
  outlet_id: string | null
  name: string
  color: string
  is_active: boolean
}

export interface StaffInvite {
  id: string
  business_id: string
  staff_member_id: string
  email: string
  status: InviteStatus
  expires_at: string
  accepted_at: string | null
}

export interface LeaveBalance {
  year: number
  leave_type: LeaveType
  opening_balance_days: number
  accrued_days: number
  taken_days: number
  adjusted_days: number
  remaining_days: number
}

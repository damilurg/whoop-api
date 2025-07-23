// WHOOP API Response Models
export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number; // calculated timestamp
}

export interface WhoopUser {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

// Recovery Data
export interface RecoveryData {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
  };
}

// Sleep Data
export interface SleepData {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

// Strain/Workout Data
export interface WorkoutData {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter: number;
    altitude_gain_meter: number;
    altitude_change_meter: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  };
}

// Cycle Data (Daily Summary)
export interface CycleData {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

// Normalized Data Models for Charts
export interface DailyStats {
  date: string;
  recovery_score: number | null;
  sleep_performance: number | null;
  sleep_duration_hours: number | null;
  strain: number | null;
  resting_heart_rate: number | null;
  hrv: number | null;
  calories: number | null;
  sleep_efficiency: number | null;
  sleep_consistency: number | null;
}

export interface WeeklyPerformance {
  week_start: string;
  week_end: string;
  avg_recovery: number;
  avg_sleep_performance: number;
  avg_sleep_duration: number;
  avg_strain: number;
  avg_rhr: number;
  avg_hrv: number;
  total_calories: number;
}

export interface MonthlyPerformance {
  month: string;
  year: number;
  weeks: WeeklyPerformance[];
  daily_stats: DailyStats[];
  summary: {
    avg_recovery: number;
    avg_sleep_performance: number;
    avg_sleep_duration: number;
    avg_strain: number;
    avg_rhr: number;
    avg_hrv: number;
    total_calories: number;
    best_recovery_day: string;
    worst_recovery_day: string;
    longest_sleep: string;
    highest_strain: string;
  };
}

// BLE Data Models
export interface BLEDeviceInfo {
  id: string;
  name: string;
  rssi: number;
  connected: boolean;
  battery_level?: number;
}

export interface BLEHeartRateData {
  timestamp: number;
  heart_rate: number;
  rr_intervals?: number[];
}

export interface BLEMotionData {
  timestamp: number;
  accelerometer: {
    x: number;
    y: number;
    z: number;
  };
  gyroscope?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface BLERawData {
  device_info: BLEDeviceInfo;
  heart_rate_data: BLEHeartRateData[];
  motion_data: BLEMotionData[];
  session_start: string;
  session_end: string;
}

// API Response Wrappers
export interface WhoopAPIResponse<T> {
  data: T[];
  next_token?: string;
}

export interface WhoopError {
  error: string;
  error_description: string;
}

// Chart Configuration
export interface ChartConfig {
  width: number;
  height: number;
  type: 'line' | 'bar' | 'area' | 'scatter';
  title: string;
  x_label: string;
  y_label: string;
  colors: string[];
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
  }[];
}
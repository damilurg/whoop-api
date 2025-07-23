// ===============================
// WHOOP API v2 Response Models
// ===============================

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number; // calculated timestamp
}

export interface WhoopError {
  error: string;
  error_description?: string;
}

// ===============================
// User Data Models
// ===============================

export interface WhoopUser {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface BodyMeasurements {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

// ===============================
// Cycle Data Models (v2)
// ===============================

export type ScoreState = 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

export interface CycleScore {
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}

export interface CycleData {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end?: string; // Optional - if not present, user is currently in this cycle
  timezone_offset: string;
  score_state: ScoreState;
  score?: CycleScore; // Only present if score_state is SCORED
}

// ===============================
// Sleep Data Models (v2)
// ===============================

export interface StageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

export interface SleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

export interface SleepScore {
  stage_summary: StageSummary;
  sleep_needed: SleepNeeded;
  respiratory_rate: number;
  sleep_performance_percentage: number;
  sleep_consistency_percentage: number;
  sleep_efficiency_percentage: number;
}

export interface SleepData {
  id: string; // UUID in v2
  v1_id?: number; // Legacy ID, will not exist past 09/01/2025
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: ScoreState;
  score?: SleepScore; // Only present if score_state is SCORED
}

// ===============================
// Recovery Data Models (v2)
// ===============================

export interface RecoveryScore {
  user_calibrating: boolean;
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage: number;
  skin_temp_celsius: number;
}

export interface RecoveryData {
  cycle_id: number;
  sleep_id: string; // UUID in v2
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: ScoreState;
  score?: RecoveryScore; // Only present if score_state is SCORED
}

// ===============================
// Workout Data Models (v2)
// ===============================

export interface ZoneDurations {
  zone_zero_milli: number;
  zone_one_milli: number;
  zone_two_milli: number;
  zone_three_milli: number;
  zone_four_milli: number;
  zone_five_milli: number;
}

export interface WorkoutScore {
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
  percent_recorded: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
  zone_durations: ZoneDurations;
}

export interface WorkoutData {
  id: string; // UUID in v2
  v1_id?: number; // Legacy ID, will not exist past 09/01/2025
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  sport_id?: number; // Will not exist past 09/01/2025
  score_state: ScoreState;
  score?: WorkoutScore; // Only present if score_state is SCORED
}

// ===============================
// WHOOP Sports Reference
// ===============================

export const WHOOP_SPORTS: Record<number, string> = {
  [-1]: 'Activity',
  [0]: 'Running',
  [1]: 'Cycling',
  [16]: 'Baseball',
  [17]: 'Basketball',
  [18]: 'Rowing',
  [19]: 'Fencing',
  [20]: 'Field Hockey',
  [21]: 'Football',
  [22]: 'Golf',
  [24]: 'Ice Hockey',
  [25]: 'Lacrosse',
  [27]: 'Rugby',
  [28]: 'Sailing',
  [29]: 'Skiing',
  [30]: 'Soccer',
  [31]: 'Softball',
  [32]: 'Squash',
  [33]: 'Swimming',
  [34]: 'Tennis',
  [35]: 'Track & Field',
  [36]: 'Volleyball',
  [37]: 'Water Polo',
  [38]: 'Wrestling',
  [39]: 'Boxing',
  [42]: 'Dance',
  [43]: 'Pilates',
  [44]: 'Yoga',
  [45]: 'Weightlifting',
  [47]: 'Cross Country Skiing',
  [48]: 'Functional Fitness',
  [49]: 'Duathlon',
  [51]: 'Gymnastics',
  [52]: 'Hiking/Rucking',
  [53]: 'Horseback Riding',
  [55]: 'Kayaking',
  [56]: 'Martial Arts',
  [57]: 'Mountain Biking',
  [59]: 'Powerlifting',
  [60]: 'Rock Climbing',
  [61]: 'Paddleboarding',
  [62]: 'Triathlon',
  [63]: 'Walking',
  [64]: 'Surfing',
  [65]: 'Elliptical',
  [66]: 'Stairmaster',
  [70]: 'Meditation',
  [71]: 'Other',
  [73]: 'Diving',
  [74]: 'Operations - Tactical',
  [75]: 'Operations - Medical',
  [76]: 'Operations - Flying',
  [77]: 'Operations - Water',
  [82]: 'Ultimate',
  [83]: 'Climber',
  [84]: 'Jumping Rope',
  [85]: 'Australian Football',
  [86]: 'Skateboarding',
  [87]: 'Coaching',
  [88]: 'Ice Bath',
  [89]: 'Commuting',
  [90]: 'Gaming',
  [91]: 'Snowboarding',
  [92]: 'Motocross',
  [93]: 'Caddying',
  [94]: 'Obstacle Course Racing',
  [95]: 'Motor Racing',
  [96]: 'HIIT',
  [97]: 'Spin',
  [98]: 'Jiu Jitsu',
  [99]: 'Manual Labor',
  [100]: 'Cricket',
  [101]: 'Pickleball',
  [102]: 'Inline Skating',
  [103]: 'Box Fitness',
  [104]: 'Spikeball',
  [105]: 'Wheelchair Pushing',
  [106]: 'Paddle Tennis',
  [107]: 'Barre',
  [108]: 'Stage Performance',
  [109]: 'High Stress Work',
  [110]: 'Parkour',
  [111]: 'Gaelic Football',
  [112]: 'Hurling/Camogie',
  [113]: 'Circus Arts',
  [121]: 'Massage Therapy',
  [123]: 'Strength Trainer',
  [125]: 'Watching Sports',
  [126]: 'Assault Bike',
  [127]: 'Kickboxing',
  [128]: 'Stretching',
  [230]: 'Table Tennis',
  [231]: 'Badminton',
  [232]: 'Netball',
  [233]: 'Sauna',
  [234]: 'Disc Golf',
  [235]: 'Yard Work',
  [236]: 'Air Compression',
  [237]: 'Percussive Massage',
  [238]: 'Paintball',
  [239]: 'Ice Skating',
  [240]: 'Handball',
  [248]: 'F45 Training',
  [249]: 'Padel',
  [250]: "Barry's",
  [251]: 'Dedicated Parenting',
  [252]: 'Stroller Walking',
  [253]: 'Stroller Jogging',
  [254]: 'Toddlerwearing',
  [255]: 'Babywearing',
  [258]: 'Barre3',
  [259]: 'Hot Yoga',
  [261]: 'Stadium Steps',
  [262]: 'Polo',
  [263]: 'Musical Performance',
  [264]: 'Kite Boarding',
  [266]: 'Dog Walking',
  [267]: 'Water Skiing',
  [268]: 'Wakeboarding',
  [269]: 'Cooking',
  [270]: 'Cleaning',
  [272]: 'Public Speaking'
};

// ===============================
// API Response Wrappers
// ===============================

export interface WhoopAPIResponse<T> {
  records: T[];
  next_token?: string;
}

// ===============================
// BLE Data Models (Reverse Engineering)
// ===============================

export interface BLEDeviceInfo {
  id: string;
  name: string;
  rssi: number;
  connected: boolean;
  battery_level?: number;
  firmware_version?: string;
  hardware_version?: string;
}

export interface BLEHeartRateData {
  timestamp: number;
  heart_rate: number;
  rr_intervals?: number[];
  contact_detected?: boolean;
  energy_expended?: number;
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
  magnetometer?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface BLEEnvironmentalData {
  timestamp: number;
  skin_temperature?: number;
  ambient_temperature?: number;
  humidity?: number;
  pressure?: number;
}

export interface BLEBiometricData {
  timestamp: number;
  spo2?: number;
  respiratory_rate?: number;
  stress_level?: number;
  body_battery?: number;
}

export interface BLERawDataPacket {
  characteristic_uuid: string;
  timestamp: number;
  raw_data: Uint8Array;
  parsed_data?: any;
  data_type?: 'heart_rate' | 'motion' | 'environmental' | 'biometric' | 'unknown';
}

export interface BLESession {
  session_id: string;
  device_info: BLEDeviceInfo;
  start_time: string;
  end_time?: string;
  heart_rate_data: BLEHeartRateData[];
  motion_data: BLEMotionData[];
  environmental_data: BLEEnvironmentalData[];
  biometric_data: BLEBiometricData[];
  raw_packets: BLERawDataPacket[];
  total_packets: number;
  data_quality_score: number;
}

// ===============================
// Normalized Data Models for Analytics
// ===============================

export interface DailyStats {
  date: string;
  // Recovery metrics
  recovery_score: number | null;
  resting_heart_rate: number | null;
  hrv_rmssd_milli: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  user_calibrating: boolean | null;
  
  // Sleep metrics
  sleep_id: string | null;
  sleep_performance_percentage: number | null;
  sleep_consistency_percentage: number | null;
  sleep_efficiency_percentage: number | null;
  sleep_duration_hours: number | null;
  time_in_bed_hours: number | null;
  awake_time_hours: number | null;
  light_sleep_hours: number | null;
  deep_sleep_hours: number | null;
  rem_sleep_hours: number | null;
  sleep_cycles: number | null;
  disturbances: number | null;
  respiratory_rate: number | null;
  sleep_debt_hours: number | null;
  sleep_need_hours: number | null;
  nap_count: number;
  total_nap_time_hours: number;
  
  // Strain/Activity metrics
  cycle_id: number | null;
  strain: number | null;
  kilojoules: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
  
  // Workout metrics
  workout_count: number;
  total_workout_strain: number;
  total_workout_duration_minutes: number;
  workout_sports: string[];
  calories_burned: number;
  distance_meters: number;
  altitude_gain_meters: number;
  
  // Heart Rate Zones (total time across all activities)
  zone_0_minutes: number;
  zone_1_minutes: number;
  zone_2_minutes: number;
  zone_3_minutes: number;
  zone_4_minutes: number;
  zone_5_minutes: number;
  
  // BLE Data (if available)
  ble_data_available: boolean;
  ble_session_count: number;
  ble_data_quality: number | null;
  raw_heart_rate_samples: number;
  raw_motion_samples: number;
}

export interface WeeklyStats {
  week_start: string;
  week_end: string;
  year: number;
  week_number: number;
  
  // Averages
  avg_recovery_score: number;
  avg_sleep_performance: number;
  avg_sleep_duration_hours: number;
  avg_sleep_efficiency: number;
  avg_strain: number;
  avg_resting_heart_rate: number;
  avg_hrv: number;
  avg_respiratory_rate: number;
  avg_skin_temp: number;
  avg_spo2: number;
  
  // Totals
  total_workouts: number;
  total_workout_time_minutes: number;
  total_calories: number;
  total_distance_km: number;
  total_strain: number;
  total_sleep_debt_hours: number;
  
  // Consistency metrics
  sleep_consistency_score: number;
  workout_frequency: number; // workouts per day
  recovery_consistency: number; // std dev of recovery scores
  
  // Best/Worst days
  best_recovery_day: string;
  worst_recovery_day: string;
  longest_sleep_day: string;
  highest_strain_day: string;
  
  // Weekly trends
  recovery_trend: 'improving' | 'declining' | 'stable';
  sleep_trend: 'improving' | 'declining' | 'stable';
  strain_trend: 'increasing' | 'decreasing' | 'stable';
}

export interface MonthlyStats {
  month: string;
  year: number;
  weeks: WeeklyStats[];
  daily_stats: DailyStats[];
  
  // Monthly summary
  summary: {
    total_days: number;
    scored_days: number;
    data_completeness: number;
    
    // Recovery summary
    avg_recovery_score: number;
    recovery_score_range: [number, number];
    recovery_trend: 'improving' | 'declining' | 'stable';
    days_above_recovery_baseline: number;
    
    // Sleep summary
    avg_sleep_duration_hours: number;
    avg_sleep_performance: number;
    avg_sleep_efficiency: number;
    sleep_consistency_score: number;
    total_sleep_debt_hours: number;
    best_sleep_week: string;
    
    // Activity summary
    avg_daily_strain: number;
    total_workouts: number;
    total_workout_time_hours: number;
    total_calories: number;
    total_distance_km: number;
    most_active_week: string;
    favorite_sports: string[];
    
    // Health metrics
    avg_resting_heart_rate: number;
    rhr_trend: 'improving' | 'declining' | 'stable';
    avg_hrv: number;
    hrv_trend: 'improving' | 'declining' | 'stable';
    avg_respiratory_rate: number;
    avg_skin_temperature: number;
    avg_spo2: number;
    
    // Correlations
    sleep_recovery_correlation: number;
    strain_recovery_correlation: number;
    sleep_strain_correlation: number;
    hrv_recovery_correlation: number;
    
    // Notable achievements
    best_recovery_day: string;
    worst_recovery_day: string;
    longest_sleep_day: string;
    highest_strain_day: string;
    most_active_day: string;
    
    // BLE insights (if available)
    ble_data_days: number;
    ble_vs_api_accuracy: number | null;
  };
}

// ===============================
// Chart Configuration Models
// ===============================

export interface ChartTheme {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  light: string;
  dark: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
}

export interface ChartConfig {
  width: number;
  height: number;
  theme: ChartTheme;
  responsive: boolean;
  animations: boolean;
  title?: string;
  subtitle?: string;
}

export interface ChartSeries {
  name: string;
  data: (number | null)[];
  color?: string;
  type?: 'line' | 'area' | 'column' | 'scatter';
  yAxis?: number;
  visible?: boolean;
}

export interface ChartDataset {
  labels: string[];
  series: ChartSeries[];
  categories?: string[];
  yAxes?: Array<{
    title: string;
    min?: number;
    max?: number;
    opposite?: boolean;
  }>;
}

// ===============================
// Dashboard Models
// ===============================

export interface DashboardCard {
  id: string;
  title: string;
  type: 'metric' | 'chart' | 'table' | 'insight';
  size: 'small' | 'medium' | 'large' | 'full';
  position: { x: number; y: number; w: number; h: number };
  data: any;
  config?: any;
  visible: boolean;
  refreshInterval?: number; // seconds
}

export interface DashboardLayout {
  id: string;
  name: string;
  description?: string;
  cards: DashboardCard[];
  theme: 'light' | 'dark' | 'auto';
  refreshInterval: number;
  lastUpdated: string;
}

export interface DashboardFilters {
  dateRange: {
    start: string;
    end: string;
    preset?: '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';
  };
  metrics: string[];
  includeNaps: boolean;
  includeBLE: boolean;
  smoothing: 'none' | 'light' | 'moderate' | 'heavy';
  aggregation: 'daily' | 'weekly' | 'monthly';
}

// ===============================
// Export Utilities
// ===============================

export interface ExportOptions {
  format: 'pdf' | 'xlsx' | 'csv' | 'json';
  includeCharts: boolean;
  includeRawData: boolean;
  includeBLEData: boolean;
  dateRange: {
    start: string;
    end: string;
  };
  compression?: 'none' | 'gzip' | 'zip';
}

export interface ExportResult {
  filename: string;
  filepath: string;
  size: number;
  format: string;
  generatedAt: string;
  downloadUrl?: string;
}
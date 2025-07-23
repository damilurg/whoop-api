import fs from 'fs';
import path from 'path';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval } from 'date-fns';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { DataFetchAgent } from '../api/dataFetchAgent.js';
import {
  RecoveryData,
  SleepData,
  WorkoutData,
  CycleData,
  DailyStats,
  WeeklyPerformance,
  MonthlyPerformance,
} from '../../models/whoop.js';

export class DataNormalizationAgent {
  private dataFetchAgent: DataFetchAgent;
  private readonly dataDir: string;

  constructor() {
    this.dataFetchAgent = new DataFetchAgent();
    this.dataDir = config.storage.dataDir;
  }

  /**
   * Convert milliseconds to hours
   */
  private millisecondsToHours(milliseconds: number): number {
    return milliseconds / (1000 * 60 * 60);
  }

  /**
   * Convert date string to YYYY-MM-DD format
   */
  private normalizeDate(dateString: string): string {
    return format(parseISO(dateString), 'yyyy-MM-dd');
  }

  /**
   * Find recovery data for a specific date
   */
  private findRecoveryForDate(recoveryData: RecoveryData[], date: string): RecoveryData | null {
    return recoveryData.find(r => 
      this.normalizeDate(r.created_at) === date && 
      r.score_state === 'SCORED'
    ) || null;
  }

  /**
   * Find sleep data for a specific date
   */
  private findSleepForDate(sleepData: SleepData[], date: string): SleepData | null {
    return sleepData.find(s => 
      this.normalizeDate(s.end) === date && 
      s.score_state === 'SCORED' &&
      !s.nap // Exclude naps, focus on main sleep
    ) || null;
  }

  /**
   * Find cycle data for a specific date
   */
  private findCycleForDate(cycleData: CycleData[], date: string): CycleData | null {
    return cycleData.find(c => 
      this.normalizeDate(c.start) === date && 
      c.score_state === 'SCORED'
    ) || null;
  }

  /**
   * Calculate total calories from workouts for a specific date
   */
  private calculateDayCalories(workoutData: WorkoutData[], date: string): number {
    const dayWorkouts = workoutData.filter(w => 
      this.normalizeDate(w.start) === date && 
      w.score_state === 'SCORED'
    );

    return dayWorkouts.reduce((total, workout) => 
      total + (workout.score.kilojoule * 0.239006), // Convert kJ to calories
      0
    );
  }

  /**
   * Normalize daily data
   */
  normalizeDailyData(
    recoveryData: RecoveryData[],
    sleepData: SleepData[],
    workoutData: WorkoutData[],
    cycleData: CycleData[],
    startDate: string,
    endDate: string
  ): DailyStats[] {
    logger.agent('NORMALIZE', `Normalizing daily data from ${startDate} to ${endDate}...`);

    const dateRange = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    });

    const dailyStats: DailyStats[] = dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const recovery = this.findRecoveryForDate(recoveryData, dateStr);
      const sleep = this.findSleepForDate(sleepData, dateStr);
      const cycle = this.findCycleForDate(cycleData, dateStr);
      const calories = this.calculateDayCalories(workoutData, dateStr);

      const stats: DailyStats = {
        date: dateStr,
        recovery_score: recovery?.score.recovery_score || null,
        sleep_performance: sleep?.score.sleep_performance_percentage || null,
        sleep_duration_hours: sleep ? 
          this.millisecondsToHours(
            sleep.score.stage_summary.total_in_bed_time_milli - 
            sleep.score.stage_summary.total_awake_time_milli
          ) : null,
        strain: cycle?.score.strain || null,
        resting_heart_rate: recovery?.score.resting_heart_rate || null,
        hrv: recovery?.score.hrv_rmssd_milli || null,
        calories: calories > 0 ? calories : null,
        sleep_efficiency: sleep?.score.sleep_efficiency_percentage || null,
        sleep_consistency: sleep?.score.sleep_consistency_percentage || null,
      };

      return stats;
    });

    logger.success(`Normalized ${dailyStats.length} daily entries`);
    return dailyStats;
  }

  /**
   * Calculate weekly averages
   */
  calculateWeeklyPerformance(dailyStats: DailyStats[]): WeeklyPerformance[] {
    logger.agent('NORMALIZE', 'Calculating weekly performance...');

    if (dailyStats.length === 0) {
      return [];
    }

    const firstDate = parseISO(dailyStats[0].date);
    const lastDate = parseISO(dailyStats[dailyStats.length - 1].date);

    const weeks = eachWeekOfInterval({
      start: firstDate,
      end: lastDate,
    }, { weekStartsOn: 1 }); // Start week on Monday

    const weeklyPerformance: WeeklyPerformance[] = weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      const weekData = dailyStats.filter(day => {
        const dayDate = parseISO(day.date);
        return dayDate >= weekStart && dayDate <= weekEnd;
      });

      const validData = weekData.filter(day => 
        day.recovery_score !== null ||
        day.sleep_performance !== null ||
        day.strain !== null
      );

      if (validData.length === 0) {
        return {
          week_start: weekStartStr,
          week_end: weekEndStr,
          avg_recovery: 0,
          avg_sleep_performance: 0,
          avg_sleep_duration: 0,
          avg_strain: 0,
          avg_rhr: 0,
          avg_hrv: 0,
          total_calories: 0,
        };
      }

      const calculateAverage = (values: (number | null)[]): number => {
        const validValues = values.filter(v => v !== null) as number[];
        return validValues.length > 0 ? 
          validValues.reduce((sum, val) => sum + val, 0) / validValues.length : 0;
      };

      const calculateSum = (values: (number | null)[]): number => {
        const validValues = values.filter(v => v !== null) as number[];
        return validValues.reduce((sum, val) => sum + val, 0);
      };

      return {
        week_start: weekStartStr,
        week_end: weekEndStr,
        avg_recovery: calculateAverage(weekData.map(d => d.recovery_score)),
        avg_sleep_performance: calculateAverage(weekData.map(d => d.sleep_performance)),
        avg_sleep_duration: calculateAverage(weekData.map(d => d.sleep_duration_hours)),
        avg_strain: calculateAverage(weekData.map(d => d.strain)),
        avg_rhr: calculateAverage(weekData.map(d => d.resting_heart_rate)),
        avg_hrv: calculateAverage(weekData.map(d => d.hrv)),
        total_calories: calculateSum(weekData.map(d => d.calories)),
      };
    });

    logger.success(`Calculated ${weeklyPerformance.length} weekly performance entries`);
    return weeklyPerformance;
  }

  /**
   * Calculate monthly summary
   */
  calculateMonthlySummary(dailyStats: DailyStats[], weeklyPerformance: WeeklyPerformance[]): MonthlyPerformance['summary'] {
    const validDays = dailyStats.filter(day => 
      day.recovery_score !== null ||
      day.sleep_performance !== null ||
      day.strain !== null
    );

    if (validDays.length === 0) {
      return {
        avg_recovery: 0,
        avg_sleep_performance: 0,
        avg_sleep_duration: 0,
        avg_strain: 0,
        avg_rhr: 0,
        avg_hrv: 0,
        total_calories: 0,
        best_recovery_day: '',
        worst_recovery_day: '',
        longest_sleep: '',
        highest_strain: '',
      };
    }

    const calculateAverage = (values: (number | null)[]): number => {
      const validValues = values.filter(v => v !== null) as number[];
      return validValues.length > 0 ? 
        validValues.reduce((sum, val) => sum + val, 0) / validValues.length : 0;
    };

    const calculateSum = (values: (number | null)[]): number => {
      const validValues = values.filter(v => v !== null) as number[];
      return validValues.reduce((sum, val) => sum + val, 0);
    };

    // Find best/worst days
    const recoveryDays = dailyStats.filter(d => d.recovery_score !== null);
    const sleepDays = dailyStats.filter(d => d.sleep_duration_hours !== null);
    const strainDays = dailyStats.filter(d => d.strain !== null);

    const bestRecoveryDay = recoveryDays.reduce((best, current) => 
      (current.recovery_score || 0) > (best.recovery_score || 0) ? current : best
    , recoveryDays[0] || { date: '', recovery_score: 0 });

    const worstRecoveryDay = recoveryDays.reduce((worst, current) => 
      (current.recovery_score || 100) < (worst.recovery_score || 100) ? current : worst
    , recoveryDays[0] || { date: '', recovery_score: 100 });

    const longestSleepDay = sleepDays.reduce((longest, current) => 
      (current.sleep_duration_hours || 0) > (longest.sleep_duration_hours || 0) ? current : longest
    , sleepDays[0] || { date: '', sleep_duration_hours: 0 });

    const highestStrainDay = strainDays.reduce((highest, current) => 
      (current.strain || 0) > (highest.strain || 0) ? current : highest
    , strainDays[0] || { date: '', strain: 0 });

    return {
      avg_recovery: calculateAverage(dailyStats.map(d => d.recovery_score)),
      avg_sleep_performance: calculateAverage(dailyStats.map(d => d.sleep_performance)),
      avg_sleep_duration: calculateAverage(dailyStats.map(d => d.sleep_duration_hours)),
      avg_strain: calculateAverage(dailyStats.map(d => d.strain)),
      avg_rhr: calculateAverage(dailyStats.map(d => d.resting_heart_rate)),
      avg_hrv: calculateAverage(dailyStats.map(d => d.hrv)),
      total_calories: calculateSum(dailyStats.map(d => d.calories)),
      best_recovery_day: bestRecoveryDay.date,
      worst_recovery_day: worstRecoveryDay.date,
      longest_sleep: longestSleepDay.date,
      highest_strain: highestStrainDay.date,
    };
  }

  /**
   * Main normalization method
   */
  async normalizeAllData(): Promise<MonthlyPerformance> {
    logger.agent('NORMALIZE', 'Starting data normalization...');

    try {
      // Load cached data
      const cachedData = this.dataFetchAgent.loadCachedData();
      
      if (!cachedData.user) {
        throw new Error('No user data found. Please fetch data first.');
      }

      const { recovery, sleep, workouts, cycles } = cachedData;

      if (recovery.length === 0 && sleep.length === 0 && cycles.length === 0) {
        throw new Error('No WHOOP data found. Please fetch data first.');
      }

      // Determine date range from data
      const allDates = [
        ...recovery.map(r => this.normalizeDate(r.created_at)),
        ...sleep.map(s => this.normalizeDate(s.end)),
        ...cycles.map(c => this.normalizeDate(c.start)),
      ].filter(Boolean).sort();

      if (allDates.length === 0) {
        throw new Error('No valid dates found in data');
      }

      const startDate = allDates[0];
      const endDate = allDates[allDates.length - 1];

      logger.info(`Data range: ${startDate} to ${endDate}`);

      // Normalize daily data
      const dailyStats = this.normalizeDailyData(
        recovery, sleep, workouts, cycles, startDate, endDate
      );

      // Calculate weekly performance
      const weeklyPerformance = this.calculateWeeklyPerformance(dailyStats);

      // Calculate monthly summary
      const summary = this.calculateMonthlySummary(dailyStats, weeklyPerformance);

      // Create monthly performance object
      const startDateObj = parseISO(startDate);
      const monthlyPerformance: MonthlyPerformance = {
        month: format(startDateObj, 'MMMM'),
        year: startDateObj.getFullYear(),
        weeks: weeklyPerformance,
        daily_stats: dailyStats,
        summary,
      };

      // Save normalized data
      const normalizedPath = path.join(this.dataDir, 'normalized_data.json');
      fs.writeFileSync(normalizedPath, JSON.stringify(monthlyPerformance, null, 2));

      logger.success(`Normalized data saved to ${normalizedPath}`);
      logger.info(`Normalization summary:
        - Daily entries: ${dailyStats.length}
        - Weekly entries: ${weeklyPerformance.length}
        - Date range: ${startDate} to ${endDate}
        - Average recovery: ${summary.avg_recovery.toFixed(1)}%
        - Average sleep performance: ${summary.avg_sleep_performance.toFixed(1)}%
        - Average sleep duration: ${summary.avg_sleep_duration.toFixed(1)}h
        - Average strain: ${summary.avg_strain.toFixed(1)}`);

      return monthlyPerformance;

    } catch (error: any) {
      logger.error(`Data normalization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load normalized data from file
   */
  loadNormalizedData(): MonthlyPerformance | null {
    try {
      const normalizedPath = path.join(this.dataDir, 'normalized_data.json');
      if (fs.existsSync(normalizedPath)) {
        const data = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
        return data as MonthlyPerformance;
      }
    } catch (error) {
      logger.warn(`Failed to load normalized data: ${error}`);
    }
    return null;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DataNormalizationAgent();
  
  agent.normalizeAllData()
    .then((monthlyData) => {
      logger.success('✅ Data normalization completed!');
      logger.info(`Monthly data for ${monthlyData.month} ${monthlyData.year} is ready for visualization`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Data normalization failed: ${error.message}`);
      process.exit(1);
    });
}
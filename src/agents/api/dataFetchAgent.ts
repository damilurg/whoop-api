import axios, { AxiosResponse } from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { Agent } from '../base/agent';
import { Logger } from '../../utils/logger';
import { config } from '../../config';
import {
  WhoopTokens,
  WhoopAPIResponse,
  CycleData,
  SleepData,
  RecoveryData,
  WorkoutData,
  WhoopUser,
  BodyMeasurements,
  DailyStats
} from '../../models/whoop';

interface FetchOptions {
  start?: string;
  end?: string;
  limit?: number;
  types?: string[];
}

interface DateRangeParams {
  start: string;
  end: string;
  limit?: number;
}

export class DataFetchAgent extends Agent {
  private readonly API_BASE_URL = 'https://api.prod.whoop.com/developer/v2';
  private readonly MAX_REQUESTS_PER_MINUTE = 100;
  private readonly PAGINATION_LIMIT = 25; // Max allowed by WHOOP API

  private requestQueue: Array<() => Promise<any>> = [];
  private requestTimestamps: number[] = [];
  private isProcessingQueue = false;

  constructor() {
    super('DataFetch', new Logger('DataFetch'));
  }

  /**
   * Main method to fetch all WHOOP data for a date range
   */
  async fetchDateRangeData(tokens: WhoopTokens, startDate: string, endDate: string): Promise<{
    user: WhoopUser;
    measurements: BodyMeasurements;
    cycles: CycleData[];
    recovery: RecoveryData[];
    sleep: SleepData[];
    workouts: WorkoutData[];
  }> {
    this.logger.info(`📊 Fetching WHOOP data from ${startDate} to ${endDate}`);

    try {
      // Fetch all data in parallel
      const [user, measurements, cycles, recovery, sleep, workouts] = await Promise.all([
        this.getUserProfile(tokens),
        this.getBodyMeasurements(tokens),
        this.getCycles(tokens, { start: startDate, end: endDate }),
        this.getRecovery(tokens, { start: startDate, end: endDate }),
        this.getSleep(tokens, { start: startDate, end: endDate }),
        this.getWorkouts(tokens, { start: startDate, end: endDate })
      ]);

      this.logger.success(`✅ Fetched complete dataset: ${cycles.length} cycles, ${sleep.length} sleep records, ${workouts.length} workouts`);

      return {
        user,
        measurements,
        cycles,
        recovery,
        sleep,
        workouts
      };
    } catch (error) {
      this.logger.error('❌ Failed to fetch date range data:', error);
      throw error;
    }
  }

  /**
   * Fetch monthly data
   */
  async fetchMonthlyData(tokens: WhoopTokens, params: { month: number; year: number }): Promise<any> {
    const startDate = new Date(params.year, params.month - 1, 1).toISOString();
    const endDate = new Date(params.year, params.month, 0, 23, 59, 59).toISOString();
    
    return this.fetchDateRangeData(tokens, startDate, endDate);
  }

  /**
   * Fetch latest data (last 7 days)
   */
  async fetchLatestData(tokens: WhoopTokens): Promise<any> {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    return this.fetchDateRangeData(tokens, startDate, endDate);
  }

  /**
   * Fetch historical data with custom options
   */
  async fetchHistoricalData(tokens: WhoopTokens, options: FetchOptions): Promise<any> {
    const { start, end, types = ['cycles', 'recovery', 'sleep', 'workouts'] } = options;
    
    if (!start || !end) {
      throw new Error('Start and end dates are required');
    }

    this.logger.info(`📊 Fetching historical data for types: ${types.join(', ')}`);

    const results: any = {};

    // Always include user info
    results.user = await this.getUserProfile(tokens);
    results.measurements = await this.getBodyMeasurements(tokens);

    // Fetch requested data types
    const promises: Promise<any>[] = [];
    const keys: string[] = [];

    if (types.includes('cycles')) {
      promises.push(this.getCycles(tokens, { start, end }));
      keys.push('cycles');
    }

    if (types.includes('recovery')) {
      promises.push(this.getRecovery(tokens, { start, end }));
      keys.push('recovery');
    }

    if (types.includes('sleep')) {
      promises.push(this.getSleep(tokens, { start, end }));
      keys.push('sleep');
    }

    if (types.includes('workouts')) {
      promises.push(this.getWorkouts(tokens, { start, end }));
      keys.push('workouts');
    }

    const data = await Promise.all(promises);
    keys.forEach((key, index) => {
      results[key] = data[index];
    });

    return results;
  }

  /**
   * Get user profile
   */
  async getUserProfile(tokens: WhoopTokens): Promise<WhoopUser> {
    return this.makeAPIRequest(async () => {
      this.logger.info('👤 Fetching user profile...');
      
      const response: AxiosResponse<WhoopUser> = await axios.get(
        `${this.API_BASE_URL}/user/profile/basic`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success('✅ User profile fetched');
      return response.data;
    });
  }

  /**
   * Get body measurements
   */
  async getBodyMeasurements(tokens: WhoopTokens): Promise<BodyMeasurements> {
    return this.makeAPIRequest(async () => {
      this.logger.info('📏 Fetching body measurements...');
      
      const response: AxiosResponse<BodyMeasurements> = await axios.get(
        `${this.API_BASE_URL}/user/measurement/body`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success('✅ Body measurements fetched');
      return response.data;
    });
  }

  /**
   * Get cycles data with pagination
   */
  async getCycles(tokens: WhoopTokens, params: DateRangeParams): Promise<CycleData[]> {
    return this.makeAPIRequest(async () => {
      this.logger.info('🔄 Fetching cycles data...');
      
      const allCycles: CycleData[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.fetchPaginatedData<CycleData>(
          `${this.API_BASE_URL}/cycle`,
          tokens,
          { ...params, nextToken }
        );

        allCycles.push(...response.records);
        nextToken = response.next_token;
        
        this.logger.info(`📦 Fetched ${response.records.length} cycles (total: ${allCycles.length})`);
      } while (nextToken);

      this.logger.success(`✅ Fetched ${allCycles.length} cycles`);
      return allCycles;
    });
  }

  /**
   * Get specific cycle by ID
   */
  async getCycleById(tokens: WhoopTokens, cycleId: number): Promise<CycleData> {
    return this.makeAPIRequest(async () => {
      this.logger.info(`🔄 Fetching cycle ${cycleId}...`);
      
      const response: AxiosResponse<CycleData> = await axios.get(
        `${this.API_BASE_URL}/cycle/${cycleId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Fetched cycle ${cycleId}`);
      return response.data;
    });
  }

  /**
   * Get recovery data with pagination
   */
  async getRecovery(tokens: WhoopTokens, params: DateRangeParams): Promise<RecoveryData[]> {
    return this.makeAPIRequest(async () => {
      this.logger.info('💚 Fetching recovery data...');
      
      const allRecovery: RecoveryData[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.fetchPaginatedData<RecoveryData>(
          `${this.API_BASE_URL}/recovery`,
          tokens,
          { ...params, nextToken }
        );

        allRecovery.push(...response.records);
        nextToken = response.next_token;
        
        this.logger.info(`📦 Fetched ${response.records.length} recovery records (total: ${allRecovery.length})`);
      } while (nextToken);

      this.logger.success(`✅ Fetched ${allRecovery.length} recovery records`);
      return allRecovery;
    });
  }

  /**
   * Get recovery for specific cycle
   */
  async getRecoveryForCycle(tokens: WhoopTokens, cycleId: number): Promise<RecoveryData> {
    return this.makeAPIRequest(async () => {
      this.logger.info(`💚 Fetching recovery for cycle ${cycleId}...`);
      
      const response: AxiosResponse<RecoveryData> = await axios.get(
        `${this.API_BASE_URL}/cycle/${cycleId}/recovery`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Fetched recovery for cycle ${cycleId}`);
      return response.data;
    });
  }

  /**
   * Get sleep data with pagination
   */
  async getSleep(tokens: WhoopTokens, params: DateRangeParams): Promise<SleepData[]> {
    return this.makeAPIRequest(async () => {
      this.logger.info('😴 Fetching sleep data...');
      
      const allSleep: SleepData[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.fetchPaginatedData<SleepData>(
          `${this.API_BASE_URL}/activity/sleep`,
          tokens,
          { ...params, nextToken }
        );

        allSleep.push(...response.records);
        nextToken = response.next_token;
        
        this.logger.info(`📦 Fetched ${response.records.length} sleep records (total: ${allSleep.length})`);
      } while (nextToken);

      this.logger.success(`✅ Fetched ${allSleep.length} sleep records`);
      return allSleep;
    });
  }

  /**
   * Get specific sleep by ID
   */
  async getSleepById(tokens: WhoopTokens, sleepId: string): Promise<SleepData> {
    return this.makeAPIRequest(async () => {
      this.logger.info(`😴 Fetching sleep ${sleepId}...`);
      
      const response: AxiosResponse<SleepData> = await axios.get(
        `${this.API_BASE_URL}/activity/sleep/${sleepId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Fetched sleep ${sleepId}`);
      return response.data;
    });
  }

  /**
   * Get sleep for specific cycle
   */
  async getSleepForCycle(tokens: WhoopTokens, cycleId: number): Promise<SleepData> {
    return this.makeAPIRequest(async () => {
      this.logger.info(`😴 Fetching sleep for cycle ${cycleId}...`);
      
      const response: AxiosResponse<SleepData> = await axios.get(
        `${this.API_BASE_URL}/cycle/${cycleId}/sleep`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Fetched sleep for cycle ${cycleId}`);
      return response.data;
    });
  }

  /**
   * Get workout data with pagination
   */
  async getWorkouts(tokens: WhoopTokens, params: DateRangeParams): Promise<WorkoutData[]> {
    return this.makeAPIRequest(async () => {
      this.logger.info('💪 Fetching workout data...');
      
      const allWorkouts: WorkoutData[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.fetchPaginatedData<WorkoutData>(
          `${this.API_BASE_URL}/activity/workout`,
          tokens,
          { ...params, nextToken }
        );

        allWorkouts.push(...response.records);
        nextToken = response.next_token;
        
        this.logger.info(`📦 Fetched ${response.records.length} workouts (total: ${allWorkouts.length})`);
      } while (nextToken);

      this.logger.success(`✅ Fetched ${allWorkouts.length} workouts`);
      return allWorkouts;
    });
  }

  /**
   * Get specific workout by ID
   */
  async getWorkoutById(tokens: WhoopTokens, workoutId: string): Promise<WorkoutData> {
    return this.makeAPIRequest(async () => {
      this.logger.info(`💪 Fetching workout ${workoutId}...`);
      
      const response: AxiosResponse<WorkoutData> = await axios.get(
        `${this.API_BASE_URL}/activity/workout/${workoutId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Fetched workout ${workoutId}`);
      return response.data;
    });
  }

  /**
   * Generic paginated data fetching
   */
  private async fetchPaginatedData<T>(
    endpoint: string,
    tokens: WhoopTokens,
    params: DateRangeParams & { nextToken?: string }
  ): Promise<WhoopAPIResponse<T>> {
    const queryParams = new URLSearchParams();
    
    if (params.start) queryParams.append('start', params.start);
    if (params.end) queryParams.append('end', params.end);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.nextToken) queryParams.append('nextToken', params.nextToken);
    
    queryParams.append('limit', this.PAGINATION_LIMIT.toString());

    const url = `${endpoint}?${queryParams.toString()}`;
    
    const response: AxiosResponse<WhoopAPIResponse<T>> = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    return response.data;
  }

  /**
   * Rate limiting and request queue management
   */
  private async makeAPIRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processRequestQueue();
    });
  }

  /**
   * Process request queue with rate limiting
   */
  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Clean old timestamps (older than 1 minute)
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => now - timestamp < 60000
      );

      // Check if we can make another request
      if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
        const oldestRequest = Math.min(...this.requestTimestamps);
        const waitTime = 60000 - (now - oldestRequest);
        
        this.logger.info(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
        continue;
      }

      // Execute next request
      const request = this.requestQueue.shift();
      if (request) {
        this.requestTimestamps.push(now);
        await request();
      }

      // Small delay between requests
      await this.sleep(100);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Get data summary/statistics
   */
  async getDataSummary(tokens: WhoopTokens): Promise<{
    totalCycles: number;
    totalSleep: number;
    totalWorkouts: number;
    dateRange: { start: string; end: string };
    lastUpdated: string;
  }> {
    this.logger.info('📊 Fetching data summary...');

    // Get recent data to determine available range
    const recent = await this.fetchLatestData(tokens);
    
    return {
      totalCycles: recent.cycles.length,
      totalSleep: recent.sleep.length,
      totalWorkouts: recent.workouts.length,
      dateRange: {
        start: recent.cycles.length > 0 ? recent.cycles[recent.cycles.length - 1].start : '',
        end: recent.cycles.length > 0 ? recent.cycles[0].start : ''
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Cache data to file system
   */
  async cacheData(key: string, data: any, ttl: number = 3600000): Promise<void> {
    const cacheDir = path.join(config.dataDir, 'cache');
    const cacheFile = path.join(cacheDir, `${key}.json`);
    
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      
      const cacheData = {
        data,
        timestamp: Date.now(),
        ttl
      };
      
      await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
      this.logger.info(`💾 Cached data with key: ${key}`);
    } catch (error) {
      this.logger.warn('Failed to cache data:', error);
    }
  }

  /**
   * Load data from cache
   */
  async loadFromCache(key: string): Promise<any | null> {
    const cacheFile = path.join(config.dataDir, 'cache', `${key}.json`);
    
    try {
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      const cacheData = JSON.parse(cacheContent);
      
      if (Date.now() - cacheData.timestamp < cacheData.ttl) {
        this.logger.info(`📁 Loaded data from cache: ${key}`);
        return cacheData.data;
      } else {
        // Cache expired, delete file
        await fs.unlink(cacheFile);
        return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    const cacheDir = path.join(config.dataDir, 'cache');
    
    try {
      const files = await fs.readdir(cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(cacheDir, file)))
      );
      this.logger.success('🗑️ Cache cleared');
    } catch (error) {
      this.logger.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Export data to JSON file
   */
  async exportData(data: any, filename: string): Promise<string> {
    const exportDir = path.join(config.dataDir, 'exports');
    const filepath = path.join(exportDir, `${filename}.json`);
    
    try {
      await fs.mkdir(exportDir, { recursive: true });
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
      
      this.logger.success(`📤 Data exported to: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('Failed to export data:', error);
      throw error;
    }
  }

  /**
   * Get API usage statistics
   */
  getAPIStats(): {
    requestsInLastMinute: number;
    totalRequestsToday: number;
    queueLength: number;
    rateLimitRemaining: number;
  } {
    const now = Date.now();
    const requestsInLastMinute = this.requestTimestamps.filter(
      timestamp => now - timestamp < 60000
    ).length;

    return {
      requestsInLastMinute,
      totalRequestsToday: this.requestTimestamps.length,
      queueLength: this.requestQueue.length,
      rateLimitRemaining: this.MAX_REQUESTS_PER_MINUTE - requestsInLastMinute
    };
  }

  /**
   * Utility method for sleeping
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test API connectivity
   */
  async testConnection(tokens: WhoopTokens): Promise<boolean> {
    try {
      await this.getUserProfile(tokens);
      return true;
    } catch (error) {
      this.logger.error('API connection test failed:', error);
      return false;
    }
  }

  /**
   * Validate API response
   */
  private validateResponse(data: any, expectedFields: string[]): boolean {
    return expectedFields.every(field => data.hasOwnProperty(field));
  }
}
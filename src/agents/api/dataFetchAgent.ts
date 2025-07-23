import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import path from 'path';
import { subDays, format } from 'date-fns';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { WhoopAuthAgent } from '../auth/whoopAuthAgent.js';
import {
  WhoopAPIResponse,
  RecoveryData,
  SleepData,
  WorkoutData,
  CycleData,
  WhoopUser,
  WhoopError
} from '../../models/whoop.js';

export class DataFetchAgent {
  private authAgent: WhoopAuthAgent;
  private readonly apiBaseUrl: string;
  private readonly dataDir: string;

  constructor() {
    this.authAgent = new WhoopAuthAgent();
    this.apiBaseUrl = config.whoop.apiBaseUrl;
    this.dataDir = config.storage.dataDir;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const accessToken = await this.authAgent.getValidAccessToken();
    
    const url = new URL(endpoint, this.apiBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response: AxiosResponse<T> = await axios.get(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token might be invalid, try refreshing
        logger.warn('Received 401, attempting to refresh token...');
        const newToken = await this.authAgent.getValidAccessToken();
        
        const retryResponse: AxiosResponse<T> = await axios.get(url.toString(), {
          headers: {
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        return retryResponse.data;
      }

      if (error.response?.data) {
        const whoopError: WhoopError = error.response.data;
        throw new Error(`WHOOP API Error: ${whoopError.error} - ${whoopError.error_description}`);
      }
      
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  /**
   * Get all data with pagination
   */
  private async getAllData<T>(endpoint: string, startDate: string, endDate: string): Promise<T[]> {
    const allData: T[] = [];
    let nextToken: string | undefined;

    do {
      const params: Record<string, string> = {
        start: startDate,
        end: endDate,
      };
      
      if (nextToken) {
        params.nextToken = nextToken;
      }

      logger.debug(`Fetching ${endpoint} with params:`, params);
      
      const response = await this.makeRequest<WhoopAPIResponse<T>>(endpoint, params);
      
      allData.push(...response.data);
      nextToken = response.next_token;
      
      logger.debug(`Fetched ${response.data.length} items, next_token: ${nextToken}`);
      
      // Add small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } while (nextToken);

    return allData;
  }

  /**
   * Fetch user profile
   */
  async fetchUserProfile(): Promise<WhoopUser> {
    logger.agent('FETCH', 'Fetching user profile...');
    
    const user = await this.makeRequest<WhoopUser>('/user/profile/basic');
    
    // Save user profile
    const userPath = path.join(this.dataDir, 'user.json');
    fs.writeFileSync(userPath, JSON.stringify(user, null, 2));
    
    logger.success(`User profile saved to ${userPath}`);
    return user;
  }

  /**
   * Fetch recovery data
   */
  async fetchRecoveryData(startDate: string, endDate: string): Promise<RecoveryData[]> {
    logger.agent('FETCH', `Fetching recovery data from ${startDate} to ${endDate}...`);
    
    const recoveryData = await this.getAllData<RecoveryData>('/recovery', startDate, endDate);
    
    // Save recovery data
    const recoveryPath = path.join(this.dataDir, 'recovery.json');
    fs.writeFileSync(recoveryPath, JSON.stringify(recoveryData, null, 2));
    
    logger.success(`Fetched ${recoveryData.length} recovery entries, saved to ${recoveryPath}`);
    return recoveryData;
  }

  /**
   * Fetch sleep data
   */
  async fetchSleepData(startDate: string, endDate: string): Promise<SleepData[]> {
    logger.agent('FETCH', `Fetching sleep data from ${startDate} to ${endDate}...`);
    
    const sleepData = await this.getAllData<SleepData>('/activity/sleep', startDate, endDate);
    
    // Save sleep data
    const sleepPath = path.join(this.dataDir, 'sleep.json');
    fs.writeFileSync(sleepPath, JSON.stringify(sleepData, null, 2));
    
    logger.success(`Fetched ${sleepData.length} sleep entries, saved to ${sleepPath}`);
    return sleepData;
  }

  /**
   * Fetch workout data
   */
  async fetchWorkoutData(startDate: string, endDate: string): Promise<WorkoutData[]> {
    logger.agent('FETCH', `Fetching workout data from ${startDate} to ${endDate}...`);
    
    const workoutData = await this.getAllData<WorkoutData>('/activity/workout', startDate, endDate);
    
    // Save workout data
    const workoutPath = path.join(this.dataDir, 'workouts.json');
    fs.writeFileSync(workoutPath, JSON.stringify(workoutData, null, 2));
    
    logger.success(`Fetched ${workoutData.length} workout entries, saved to ${workoutPath}`);
    return workoutData;
  }

  /**
   * Fetch cycle data (daily summaries)
   */
  async fetchCycleData(startDate: string, endDate: string): Promise<CycleData[]> {
    logger.agent('FETCH', `Fetching cycle data from ${startDate} to ${endDate}...`);
    
    const cycleData = await this.getAllData<CycleData>('/cycle', startDate, endDate);
    
    // Save cycle data
    const cyclePath = path.join(this.dataDir, 'cycles.json');
    fs.writeFileSync(cyclePath, JSON.stringify(cycleData, null, 2));
    
    logger.success(`Fetched ${cycleData.length} cycle entries, saved to ${cyclePath}`);
    return cycleData;
  }

  /**
   * Fetch all WHOOP data for a date range
   */
  async fetchAllData(startDate?: string, endDate?: string): Promise<{
    user: WhoopUser;
    recovery: RecoveryData[];
    sleep: SleepData[];
    workouts: WorkoutData[];
    cycles: CycleData[];
  }> {
    // Default to last 30 days if no dates provided
    const end = endDate || format(new Date(), 'yyyy-MM-dd');
    const start = startDate || format(subDays(new Date(), 30), 'yyyy-MM-dd');

    logger.agent('FETCH', `Starting full data fetch from ${start} to ${end}...`);

    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      // Fetch all data types in parallel for better performance
      const [user, recovery, sleep, workouts, cycles] = await Promise.all([
        this.fetchUserProfile(),
        this.fetchRecoveryData(start, end),
        this.fetchSleepData(start, end),
        this.fetchWorkoutData(start, end),
        this.fetchCycleData(start, end),
      ]);

      // Save metadata about the fetch
      const metadata = {
        fetched_at: new Date().toISOString(),
        date_range: { start, end },
        counts: {
          recovery: recovery.length,
          sleep: sleep.length,
          workouts: workouts.length,
          cycles: cycles.length,
        },
      };

      const metadataPath = path.join(this.dataDir, 'fetch_metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      logger.success('✅ All WHOOP data fetched successfully!');
      logger.info(`Data summary:
        - Recovery entries: ${recovery.length}
        - Sleep entries: ${sleep.length}
        - Workout entries: ${workouts.length}
        - Cycle entries: ${cycles.length}
        - Date range: ${start} to ${end}`);

      return { user, recovery, sleep, workouts, cycles };

    } catch (error: any) {
      logger.error(`Failed to fetch WHOOP data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if cached data exists and is recent
   */
  isCacheValid(maxAgeHours: number = 24): boolean {
    const metadataPath = path.join(this.dataDir, 'fetch_metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      return false;
    }

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const fetchedAt = new Date(metadata.fetched_at);
      const now = new Date();
      const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
      
      return ageHours < maxAgeHours;
    } catch {
      return false;
    }
  }

  /**
   * Load cached data
   */
  loadCachedData(): {
    user: WhoopUser | null;
    recovery: RecoveryData[];
    sleep: SleepData[];
    workouts: WorkoutData[];
    cycles: CycleData[];
  } {
    const loadJsonFile = <T>(filename: string): T[] => {
      const filePath = path.join(this.dataDir, filename);
      try {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (error) {
        logger.warn(`Failed to load ${filename}: ${error}`);
      }
      return [];
    };

    const loadUserFile = (): WhoopUser | null => {
      const filePath = path.join(this.dataDir, 'user.json');
      try {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (error) {
        logger.warn(`Failed to load user.json: ${error}`);
      }
      return null;
    };

    return {
      user: loadUserFile(),
      recovery: loadJsonFile<RecoveryData>('recovery.json'),
      sleep: loadJsonFile<SleepData>('sleep.json'),
      workouts: loadJsonFile<WorkoutData>('workouts.json'),
      cycles: loadJsonFile<CycleData>('cycles.json'),
    };
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DataFetchAgent();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const startDateIndex = args.indexOf('--start');
  const endDateIndex = args.indexOf('--end');
  const forceRefresh = args.includes('--force');
  
  const startDate = startDateIndex >= 0 ? args[startDateIndex + 1] : undefined;
  const endDate = endDateIndex >= 0 ? args[endDateIndex + 1] : undefined;

  // Check cache first unless force refresh
  if (!forceRefresh && agent.isCacheValid()) {
    logger.info('Using cached data (use --force to refresh)');
    const cachedData = agent.loadCachedData();
    logger.info(`Cached data summary:
      - Recovery entries: ${cachedData.recovery.length}
      - Sleep entries: ${cachedData.sleep.length}
      - Workout entries: ${cachedData.workouts.length}
      - Cycle entries: ${cachedData.cycles.length}`);
    process.exit(0);
  }

  agent.fetchAllData(startDate, endDate)
    .then(() => {
      logger.success('✅ Data fetch completed!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Data fetch failed: ${error.message}`);
      process.exit(1);
    });
}
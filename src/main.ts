#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import { WhoopAuthAgent } from './agents/auth/whoopAuthAgent';
import { DataFetchAgent } from './agents/api/dataFetchAgent';
import { NormalizationAgent } from './agents/data/normalizationAgent';
import { ChartRenderAgent } from './agents/charts/chartRenderAgent';
import { ReportAgent } from './agents/report/reportAgent';
import { BLEAgent } from './agents/ble/bleAgent';
import { WhoopDashboardServer } from './web/server';
import { Logger } from './utils/logger';
import { config } from './config';
import { WhoopTokens, MonthlyStats } from './models/whoop';
import path from 'path';
import { promises as fs } from 'fs';

const logger = new Logger('Main');

class WhoopAnalyticsSystem {
  private authAgent: WhoopAuthAgent;
  private dataAgent: DataFetchAgent;
  private normAgent: NormalizationAgent;
  private chartAgent: ChartRenderAgent;
  private reportAgent: ReportAgent;
  private bleAgent: BLEAgent;
  private dashboardServer?: WhoopDashboardServer;

  constructor() {
    this.authAgent = new WhoopAuthAgent();
    this.dataAgent = new DataFetchAgent();
    this.normAgent = new NormalizationAgent();
    this.chartAgent = new ChartRenderAgent();
    this.reportAgent = new ReportAgent();
    this.bleAgent = new BLEAgent();
  }

  /**
   * Initialize the system and ensure dependencies
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing WHOOP Analytics System...');
    
    // Ensure directories exist
    await this.ensureDirectories();
    
    // Check system requirements
    await this.checkSystemRequirements();
    
    logger.success('✅ System initialized successfully');
  }

  /**
   * Ensure all required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      config.dataDir,
      config.reportsDir,
      config.chartsDir,
      path.join(config.dataDir, 'cache'),
      path.join(config.dataDir, 'exports'),
      path.join(config.dataDir, 'ble_sessions'),
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        logger.warn(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  /**
   * Check system requirements and capabilities
   */
  private async checkSystemRequirements(): Promise<void> {
    const status = {
      node_version: process.version,
      platform: process.platform,
      ble_support: this.bleAgent.isSupported(),
      ble_state: this.bleAgent.getState(),
      memory: process.memoryUsage(),
    };

    logger.info('System Status:', status);
  }

  /**
   * Interactive CLI mode
   */
  async runInteractive(): Promise<void> {
    logger.info('🎮 Starting interactive mode...');

    try {
      // Main menu
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🚀 Launch Web Dashboard', value: 'dashboard' },
            { name: '🔐 Authenticate with WHOOP', value: 'auth' },
            { name: '📊 Generate Analytics Report', value: 'report' },
            { name: '📱 BLE Device Management', value: 'ble' },
            { name: '📈 Generate Charts Only', value: 'charts' },
            { name: '🔄 Sync Latest Data', value: 'sync' },
            { name: '⚙️ System Status', value: 'status' },
            { name: '🚪 Exit', value: 'exit' }
          ]
        }
      ]);

      switch (action) {
        case 'dashboard':
          await this.launchDashboard();
          break;
        case 'auth':
          await this.handleAuthentication();
          break;
        case 'report':
          await this.generateReport();
          break;
        case 'ble':
          await this.handleBLE();
          break;
        case 'charts':
          await this.generateCharts();
          break;
        case 'sync':
          await this.syncLatestData();
          break;
        case 'status':
          await this.showSystemStatus();
          break;
        case 'exit':
          logger.info('👋 Goodbye!');
          process.exit(0);
          break;
      }
    } catch (error) {
      logger.error('Interactive mode error:', error);
    }
  }

  /**
   * Launch web dashboard
   */
  async launchDashboard(): Promise<void> {
    logger.info('🌐 Launching web dashboard...');

    try {
      this.dashboardServer = new WhoopDashboardServer();
      const port = parseInt(process.env.WEB_PORT || '3001');
      
      this.dashboardServer.start(port);
      
      logger.success(`🚀 Dashboard started at http://localhost:${port}`);
      logger.info('Press Ctrl+C to stop the server');
      
      // Keep the process alive
      await new Promise((resolve) => {
        process.on('SIGINT', () => {
          logger.info('Shutting down dashboard...');
          resolve(void 0);
        });
      });
    } catch (error) {
      logger.error('Failed to launch dashboard:', error);
    }
  }

  /**
   * Handle authentication flow
   */
  async handleAuthentication(): Promise<void> {
    logger.info('🔐 Starting authentication...');

    try {
      const tokens = await this.authAgent.authenticate();
      
      // Test connection
      const success = await this.authAgent.testConnection(tokens);
      if (success) {
        logger.success('✅ Authentication successful!');
        
        // Get user info
        const user = await this.authAgent.getUserProfile(tokens);
        const measurements = await this.authAgent.getBodyMeasurements(tokens);
        
        logger.info(`👤 Authenticated as: ${user.first_name} ${user.last_name}`);
        logger.info(`📏 Height: ${measurements.height_meter}m, Weight: ${measurements.weight_kilogram}kg`);
      }
    } catch (error) {
      logger.error('Authentication failed:', error);
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateReport(): Promise<void> {
    logger.info('📊 Generating analytics report...');

    try {
      // Get date range
      const { timeframe } = await inquirer.prompt([
        {
          type: 'list',
          name: 'timeframe',
          message: 'Select timeframe for the report:',
          choices: [
            { name: 'Last 7 days', value: '7d' },
            { name: 'Last 30 days', value: '30d' },
            { name: 'Last 3 months', value: '3m' },
            { name: 'Custom range', value: 'custom' }
          ]
        }
      ]);

      let startDate: string, endDate: string;
      
      if (timeframe === 'custom') {
        const { start, end } = await inquirer.prompt([
          {
            type: 'input',
            name: 'start',
            message: 'Start date (YYYY-MM-DD):',
            validate: (input: string) => {
              return new Date(input).toString() !== 'Invalid Date' || 'Please enter a valid date';
            }
          },
          {
            type: 'input',
            name: 'end',
            message: 'End date (YYYY-MM-DD):',
            validate: (input: string) => {
              return new Date(input).toString() !== 'Invalid Date' || 'Please enter a valid date';
            }
          }
        ]);
        startDate = start;
        endDate = end;
      } else {
        endDate = new Date().toISOString();
        const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
        startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }

      // Authenticate
      const tokens = await this.authAgent.authenticate();
      
      // Fetch data
      logger.info('📥 Fetching WHOOP data...');
      const rawData = await this.dataAgent.fetchDateRangeData(tokens, startDate, endDate);
      
      // Normalize data
      logger.info('🔄 Processing data...');
      const normalizedData = await this.normAgent.normalizeMonthlyData(rawData);
      
      // Generate charts
      logger.info('📊 Creating visualizations...');
      const chartPaths = await this.chartAgent.generateReportCharts(normalizedData, {
        dateRange: { start: startDate, end: endDate },
        metrics: ['recovery', 'sleep', 'strain', 'hrv'],
        includeNaps: true,
        includeBLE: false,
        smoothing: 'light',
        aggregation: 'daily'
      });
      
      // Generate report
      logger.info('📄 Generating report...');
      const report = await this.reportAgent.generateReport(
        normalizedData,
        chartPaths,
        {
          format: 'pdf',
          includeCharts: true,
          includeRawData: false,
          includeBLEData: false,
          dateRange: { start: startDate, end: endDate }
        }
      );
      
      logger.success(`✅ Report generated: ${report.filepath}`);
      logger.info(`📁 Report saved as: ${path.basename(report.filepath)}`);
      
    } catch (error) {
      logger.error('Report generation failed:', error);
    }
  }

  /**
   * Handle BLE device management
   */
  async handleBLE(): Promise<void> {
    if (!this.bleAgent.isSupported()) {
      logger.warn('⚠️ BLE is not supported on this system');
      return;
    }

    const { bleAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'bleAction',
        message: 'BLE Device Management:',
        choices: [
          { name: '🔍 Scan for WHOOP devices', value: 'scan' },
          { name: '🔗 Connect to device', value: 'connect' },
          { name: '📊 Start data session', value: 'session' },
          { name: '📋 View device status', value: 'status' },
          { name: '📁 List saved sessions', value: 'sessions' },
          { name: '🔙 Back to main menu', value: 'back' }
        ]
      }
    ]);

    try {
      switch (bleAction) {
        case 'scan':
          await this.scanBLEDevices();
          break;
        case 'connect':
          await this.connectBLEDevice();
          break;
        case 'session':
          await this.startBLESession();
          break;
        case 'status':
          await this.showBLEStatus();
          break;
        case 'sessions':
          await this.listBLESessions();
          break;
        case 'back':
          await this.runInteractive();
          break;
      }
    } catch (error) {
      logger.error('BLE operation failed:', error);
    }
  }

  /**
   * Scan for BLE devices
   */
  private async scanBLEDevices(): Promise<void> {
    logger.info('🔍 Scanning for WHOOP devices...');
    
    const devices = await this.bleAgent.startScanning(30000);
    
    if (devices.length === 0) {
      logger.warn('No WHOOP devices found');
    } else {
      logger.success(`Found ${devices.length} device(s):`);
      devices.forEach(device => {
        logger.info(`📱 ${device.name} (${device.id}) - RSSI: ${device.rssi}dBm`);
      });
    }
  }

  /**
   * Connect to BLE device
   */
  private async connectBLEDevice(): Promise<void> {
    // Implementation would allow device selection and connection
    logger.info('🔗 BLE connection feature coming soon...');
  }

  /**
   * Start BLE data session
   */
  private async startBLESession(): Promise<void> {
    // Implementation would start a data collection session
    logger.info('📊 BLE session feature coming soon...');
  }

  /**
   * Show BLE status
   */
  private async showBLEStatus(): Promise<void> {
    const status = this.bleAgent.getStatus();
    logger.info('📱 BLE Status:', status);
  }

  /**
   * List BLE sessions
   */
  private async listBLESessions(): Promise<void> {
    const sessions = await this.bleAgent.listSessions();
    if (sessions.length === 0) {
      logger.info('No saved BLE sessions found');
    } else {
      logger.info(`Found ${sessions.length} saved session(s):`);
      sessions.forEach(session => {
        logger.info(`📁 ${session}`);
      });
    }
  }

  /**
   * Generate charts only
   */
  async generateCharts(): Promise<void> {
    logger.info('📈 Generating charts...');

    try {
      const tokens = await this.authAgent.authenticate();
      const data = await this.dataAgent.fetchLatestData(tokens);
      const normalizedData = await this.normAgent.normalizeMonthlyData(data);
      
      const chartPaths = await this.chartAgent.generateReportCharts(normalizedData, {
        dateRange: { start: '', end: '' },
        metrics: ['recovery', 'sleep', 'strain'],
        includeNaps: true,
        includeBLE: false,
        smoothing: 'none',
        aggregation: 'daily'
      });
      
      logger.success(`✅ Generated ${chartPaths.length} charts`);
      chartPaths.forEach(path => {
        logger.info(`📊 ${path}`);
      });
      
    } catch (error) {
      logger.error('Chart generation failed:', error);
    }
  }

  /**
   * Sync latest data
   */
  async syncLatestData(): Promise<void> {
    logger.info('🔄 Syncing latest data...');

    try {
      const tokens = await this.authAgent.authenticate();
      const data = await this.dataAgent.fetchLatestData(tokens);
      
      logger.success('✅ Data synchronized');
      logger.info(`📊 Summary: ${data.cycles.length} cycles, ${data.sleep.length} sleep records, ${data.workouts.length} workouts`);
      
    } catch (error) {
      logger.error('Data sync failed:', error);
    }
  }

  /**
   * Show system status
   */
  async showSystemStatus(): Promise<void> {
    logger.info('⚙️ System Status:');

    try {
      const authStatus = await this.authAgent.getAuthStatus();
      const bleStatus = this.bleAgent.getStatus();
      
      const status = {
        authentication: authStatus.authenticated,
        user: authStatus.user?.first_name + ' ' + authStatus.user?.last_name,
        ble_support: bleStatus.supported,
        ble_state: bleStatus.state,
        connected_devices: bleStatus.connected_devices,
        active_session: bleStatus.active_session,
        system: {
          node_version: process.version,
          platform: process.platform,
          memory_usage: process.memoryUsage(),
          uptime: process.uptime()
        }
      };

      console.table(status);
      
    } catch (error) {
      logger.error('Failed to get system status:', error);
    }
  }

  /**
   * Run automated pipeline
   */
  async runAutomated(options: {
    timeframe?: string;
    format?: string;
    includeBLE?: boolean;
    skipAuth?: boolean;
  } = {}): Promise<void> {
    logger.info('🤖 Running automated pipeline...');

    try {
      const {
        timeframe = '30d',
        format = 'pdf',
        includeBLE = false,
        skipAuth = false
      } = options;

      // Authentication
      if (!skipAuth) {
        logger.info('🔐 Authenticating...');
        await this.authAgent.authenticate();
      }

      // Calculate date range
      const endDate = new Date().toISOString();
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Data pipeline
      logger.info('📥 Fetching data...');
      const tokens = await this.authAgent.authenticate();
      const rawData = await this.dataAgent.fetchDateRangeData(tokens, startDate, endDate);

      logger.info('🔄 Processing data...');
      const normalizedData = await this.normAgent.normalizeMonthlyData(rawData);

      logger.info('📊 Generating charts...');
      const chartPaths = await this.chartAgent.generateReportCharts(normalizedData, {
        dateRange: { start: startDate, end: endDate },
        metrics: ['recovery', 'sleep', 'strain', 'hrv'],
        includeNaps: true,
        includeBLE,
        smoothing: 'light',
        aggregation: 'daily'
      });

      logger.info('📄 Generating report...');
      const report = await this.reportAgent.generateReport(
        normalizedData,
        chartPaths,
        {
          format: format as any,
          includeCharts: true,
          includeRawData: false,
          includeBLEData: includeBLE,
          dateRange: { start: startDate, end: endDate }
        }
      );

      logger.success('✅ Automated pipeline completed successfully!');
      logger.info(`📁 Report: ${report.filepath}`);
      logger.info(`📊 Charts: ${chartPaths.length} generated`);
      logger.info(`📈 Data points: ${normalizedData.daily_stats.length} days`);

    } catch (error) {
      logger.error('Automated pipeline failed:', error);
      throw error;
    }
  }
}

// CLI Setup
program
  .name('whoop-analytics')
  .description('Advanced WHOOP Analytics System with BLE Integration')
  .version('2.0.0');

program
  .command('dashboard')
  .description('Launch the web dashboard')
  .option('-p, --port <port>', 'Dashboard port', '3001')
  .action(async (options) => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    process.env.WEB_PORT = options.port;
    await system.launchDashboard();
  });

program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    await system.runInteractive();
  });

program
  .command('auth')
  .description('Authenticate with WHOOP API')
  .action(async () => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    await system.handleAuthentication();
  });

program
  .command('report')
  .description('Generate analytics report')
  .option('-t, --timeframe <timeframe>', 'Timeframe (7d, 30d, 3m)', '30d')
  .option('-f, --format <format>', 'Output format (pdf, html)', 'pdf')
  .option('--ble', 'Include BLE data')
  .option('--skip-auth', 'Skip authentication (use cached tokens)')
  .action(async (options) => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    await system.runAutomated({
      timeframe: options.timeframe,
      format: options.format,
      includeBLE: options.ble,
      skipAuth: options.skipAuth
    });
  });

program
  .command('ble')
  .description('BLE device management')
  .option('-s, --scan', 'Scan for devices')
  .option('--status', 'Show BLE status')
  .action(async (options) => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    
    if (options.scan) {
      await system.scanBLEDevices();
    } else if (options.status) {
      await system.showBLEStatus();
    } else {
      await system.handleBLE();
    }
  });

program
  .command('status')
  .description('Show system status')
  .action(async () => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    await system.showSystemStatus();
  });

// Default to interactive mode if no command specified
if (process.argv.length === 2) {
  (async () => {
    const system = new WhoopAnalyticsSystem();
    await system.initialize();
    await system.runInteractive();
  })();
} else {
  program.parse();
}

export { WhoopAnalyticsSystem };
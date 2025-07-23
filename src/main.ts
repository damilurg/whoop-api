#!/usr/bin/env node

import inquirer from 'inquirer';
import { logger, LogLevel } from './utils/logger.js';
import { config, ensureDirectories } from './config/index.js';
import { WhoopAuthAgent } from './agents/auth/whoopAuthAgent.js';
import { DataFetchAgent } from './agents/api/dataFetchAgent.js';
import { DataNormalizationAgent } from './agents/data/normalizationAgent.js';
import { ChartRenderAgent } from './agents/charts/chartRenderAgent.js';
import { ReportAgent } from './agents/report/reportAgent.js';

interface CLIOptions {
  skipAuth?: boolean;
  skipFetch?: boolean;
  skipNormalize?: boolean;
  skipCharts?: boolean;
  skipReport?: boolean;
  verbose?: boolean;
  manual?: boolean;
  forceRefresh?: boolean;
}

export class WhoopAnalyticsMain {
  private authAgent: WhoopAuthAgent;
  private fetchAgent: DataFetchAgent;
  private normalizationAgent: DataNormalizationAgent;
  private chartAgent: ChartRenderAgent;
  private reportAgent: ReportAgent;

  constructor() {
    this.authAgent = new WhoopAuthAgent();
    this.fetchAgent = new DataFetchAgent();
    this.normalizationAgent = new DataNormalizationAgent();
    this.chartAgent = new ChartRenderAgent();
    this.reportAgent = new ReportAgent();
  }

  /**
   * Parse command line arguments
   */
  private parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    
    return {
      skipAuth: args.includes('--skip-auth'),
      skipFetch: args.includes('--skip-fetch'),
      skipNormalize: args.includes('--skip-normalize'),
      skipCharts: args.includes('--skip-charts'),
      skipReport: args.includes('--skip-report'),
      verbose: args.includes('--verbose') || args.includes('-v'),
      manual: args.includes('--manual'),
      forceRefresh: args.includes('--force'),
    };
  }

  /**
   * Display welcome message and system info
   */
  private displayWelcome(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    🏃‍♂️ WHOOP Analytics Agents                   ║
║                                                              ║
║  Comprehensive WHOOP data analysis with intelligent agents  ║
║  📊 Charts | 📈 Analytics | 📋 Reports | 🔍 Insights        ║
╚══════════════════════════════════════════════════════════════╝
`);

    logger.info(`Configuration:
  📂 Data Directory: ${config.storage.dataDir}
  📊 Charts Directory: ${config.storage.chartOutputDir}
  🔧 Config Directory: ${config.storage.configDir}
`);
  }

  /**
   * Check system prerequisites
   */
  private async checkPrerequisites(): Promise<boolean> {
    logger.info('🔍 Checking system prerequisites...');

    try {
      // Check if environment variables are set
      if (!config.whoop.clientId || !config.whoop.clientSecret) {
        logger.error('❌ WHOOP API credentials not configured');
        logger.info('Please set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in your .env file');
        return false;
      }

      // Ensure directories exist
      ensureDirectories();

      logger.success('✅ System prerequisites check passed');
      return true;

    } catch (error: any) {
      logger.error(`❌ Prerequisites check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Interactive mode for user selections
   */
  private async interactiveMode(): Promise<CLIOptions> {
    console.log('\\n🤖 Interactive Agent Execution Mode\\n');

    const { operations } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'operations',
        message: 'Select operations to run:',
        choices: [
          { name: '🔐 Authentication (WHOOP API)', value: 'auth', checked: true },
          { name: '📥 Data Fetch (API calls)', value: 'fetch', checked: true },
          { name: '🔄 Data Normalization', value: 'normalize', checked: true },
          { name: '📊 Chart Generation', value: 'charts', checked: true },
          { name: '📋 Report Generation', value: 'report', checked: true },
        ],
        validate: (answer) => {
          if (answer.length < 1) {
            return 'You must choose at least one operation.';
          }
          return true;
        },
      },
    ]);

    const { authMode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'authMode',
        message: 'Authentication mode:',
        choices: [
          { name: 'Automatic (local server)', value: 'auto' },
          { name: 'Manual (copy authorization code)', value: 'manual' },
        ],
        when: () => operations.includes('auth'),
      },
    ]);

    const { forceRefresh } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'forceRefresh',
        message: 'Force refresh data even if cache is valid?',
        default: false,
        when: () => operations.includes('fetch'),
      },
    ]);

    return {
      skipAuth: !operations.includes('auth'),
      skipFetch: !operations.includes('fetch'),
      skipNormalize: !operations.includes('normalize'),
      skipCharts: !operations.includes('charts'),
      skipReport: !operations.includes('report'),
      manual: authMode === 'manual',
      forceRefresh: forceRefresh || false,
    };
  }

  /**
   * Run authentication agent
   */
  private async runAuthAgent(options: CLIOptions): Promise<boolean> {
    if (options.skipAuth) {
      logger.info('⏭️ Skipping authentication step');
      return true;
    }

    try {
      logger.agent('MAIN', '🔐 Starting Authentication Agent...');
      await this.authAgent.authenticate(options.manual);
      logger.success('✅ Authentication completed');
      return true;

    } catch (error: any) {
      logger.error(`❌ Authentication failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Run data fetch agent
   */
  private async runDataFetchAgent(options: CLIOptions): Promise<boolean> {
    if (options.skipFetch) {
      logger.info('⏭️ Skipping data fetch step');
      return true;
    }

    try {
      logger.agent('MAIN', '📥 Starting Data Fetch Agent...');

      // Check cache unless force refresh
      if (!options.forceRefresh && this.fetchAgent.isCacheValid()) {
        logger.info('💾 Using cached data (use --force to refresh)');
        return true;
      }

      await this.fetchAgent.fetchAllData();
      logger.success('✅ Data fetch completed');
      return true;

    } catch (error: any) {
      logger.error(`❌ Data fetch failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Run data normalization agent
   */
  private async runNormalizationAgent(options: CLIOptions): Promise<boolean> {
    if (options.skipNormalize) {
      logger.info('⏭️ Skipping data normalization step');
      return true;
    }

    try {
      logger.agent('MAIN', '🔄 Starting Data Normalization Agent...');
      await this.normalizationAgent.normalizeAllData();
      logger.success('✅ Data normalization completed');
      return true;

    } catch (error: any) {
      logger.error(`❌ Data normalization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Run chart rendering agent
   */
  private async runChartAgent(options: CLIOptions): Promise<boolean> {
    if (options.skipCharts) {
      logger.info('⏭️ Skipping chart generation step');
      return true;
    }

    try {
      logger.agent('MAIN', '📊 Starting Chart Rendering Agent...');
      await this.chartAgent.generateAllCharts();
      logger.success('✅ Chart generation completed');
      return true;

    } catch (error: any) {
      logger.error(`❌ Chart generation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Run report generation agent
   */
  private async runReportAgent(options: CLIOptions): Promise<boolean> {
    if (options.skipReport) {
      logger.info('⏭️ Skipping report generation step');
      return true;
    }

    try {
      logger.agent('MAIN', '📋 Starting Report Generation Agent...');
      const result = await this.reportAgent.generateCompleteReport();
      
      logger.success('✅ Report generation completed');
      logger.info(`📄 Reports generated:
        - HTML: ${result.html}
        - PDF: ${result.pdf}`);
      
      return true;

    } catch (error: any) {
      logger.error(`❌ Report generation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Display execution summary
   */
  private displaySummary(success: boolean, startTime: number): void {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\\n${'='.repeat(60)}`);
    
    if (success) {
      console.log(`🎉 WHOOP Analytics Pipeline Completed Successfully!`);
      console.log(`⏱️  Total execution time: ${duration} seconds`);
      console.log(`\\n📊 Generated outputs:`);
      console.log(`   - Normalized data: ${config.storage.dataDir}/normalized_data.json`);
      console.log(`   - Charts: ${config.storage.chartOutputDir}/`);
      console.log(`   - HTML Report: ${config.storage.chartOutputDir}/monthly_report.html`);
      console.log(`   - PDF Report: ${config.storage.chartOutputDir}/monthly_report.pdf`);
    } else {
      console.log(`❌ WHOOP Analytics Pipeline Failed`);
      console.log(`⏱️  Execution time: ${duration} seconds`);
      console.log(`\\n🔍 Check the logs above for error details`);
    }
    
    console.log(`\\n📚 Need help? Check the README.md file`);
    console.log(`${'='.repeat(60)}\\n`);
  }

  /**
   * Main execution pipeline
   */
  async run(): Promise<void> {
    const startTime = Date.now();
    let success = false;

    try {
      this.displayWelcome();

      // Parse command line options
      const cliOptions = this.parseArgs();
      
      // Set verbose logging if requested
      if (cliOptions.verbose) {
        logger.setLevel(LogLevel.DEBUG);
      }

      // Check prerequisites
      if (!(await this.checkPrerequisites())) {
        process.exit(1);
      }

      // Determine execution options
      let options: CLIOptions;
      
      if (process.argv.length === 2) {
        // No arguments provided, run interactive mode
        options = await this.interactiveMode();
      } else {
        options = cliOptions;
      }

      logger.info('🚀 Starting WHOOP Analytics Agent Pipeline...');

      // Execute agent pipeline
      const authSuccess = await this.runAuthAgent(options);
      if (!authSuccess) {
        process.exit(1);
      }

      const fetchSuccess = await this.runDataFetchAgent(options);
      if (!fetchSuccess) {
        process.exit(1);
      }

      const normalizeSuccess = await this.runNormalizationAgent(options);
      if (!normalizeSuccess) {
        process.exit(1);
      }

      const chartSuccess = await this.runChartAgent(options);
      if (!chartSuccess) {
        process.exit(1);
      }

      const reportSuccess = await this.runReportAgent(options);
      if (!reportSuccess) {
        process.exit(1);
      }

      success = true;

    } catch (error: any) {
      logger.error(`❌ Pipeline execution failed: ${error.message}`);
      if (cliOptions?.verbose) {
        console.error(error.stack);
      }
    } finally {
      this.displaySummary(success, startTime);
      process.exit(success ? 0 : 1);
    }
  }
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
WHOOP Analytics Agents - Command Line Interface

USAGE:
  npm run dev                          Run in interactive mode
  npm run dev -- [OPTIONS]            Run with specific options

OPTIONS:
  --skip-auth          Skip authentication step
  --skip-fetch         Skip data fetching step  
  --skip-normalize     Skip data normalization step
  --skip-charts        Skip chart generation step
  --skip-report        Skip report generation step
  --manual             Use manual authentication flow
  --force              Force refresh data even if cache is valid
  --verbose, -v        Enable verbose logging
  --help, -h           Show this help message

EXAMPLES:
  npm run dev                                    # Interactive mode
  npm run dev -- --skip-auth --force           # Skip auth, force data refresh
  npm run dev -- --manual --verbose            # Manual auth with verbose logging
  npm run dev -- --skip-fetch --skip-normalize # Generate charts from existing data

INDIVIDUAL AGENTS:
  npm run auth         Run authentication agent only
  npm run fetch        Run data fetch agent only  
  npm run normalize    Run normalization agent only
  npm run charts       Run chart generation agent only
  npm run report       Run report generation agent only

ENVIRONMENT SETUP:
  Copy .env.example to .env and configure your WHOOP API credentials:
  - WHOOP_CLIENT_ID
  - WHOOP_CLIENT_SECRET
  - WHOOP_REDIRECT_URI (optional)

For more information, visit: https://developer.whoop.com/
`);
}

// CLI execution
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    displayHelp();
    process.exit(0);
  }

  const app = new WhoopAnalyticsMain();
  app.run().catch((error) => {
    logger.error(\`Fatal error: \${error.message}\`);
    process.exit(1);
  });
}
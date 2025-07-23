import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Import agents
import { WhoopAuthAgent } from '../agents/auth/whoopAuthAgent';
import { DataFetchAgent } from '../agents/api/dataFetchAgent';
import { NormalizationAgent } from '../agents/data/normalizationAgent';
import { ChartRenderAgent } from '../agents/charts/chartRenderAgent';
import { ReportAgent } from '../agents/report/reportAgent';

// Import models and utilities
import { Logger } from '../utils/logger';
import { config } from '../config';
import { WhoopTokens, DashboardFilters, ExportOptions, MonthlyStats } from '../models/whoop';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhoopDashboardServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private logger: Logger;
  
  // Agents
  private authAgent: WhoopAuthAgent;
  private dataAgent: DataFetchAgent;
  private normalizationAgent: NormalizationAgent;
  private chartAgent: ChartRenderAgent;
  private reportAgent: ReportAgent;

  // Cache
  private dataCache = new Map<string, any>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.app = express();
    this.logger = new Logger('DashboardServer');
    this.initializeAgents();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private initializeAgents(): void {
    this.authAgent = new WhoopAuthAgent();
    this.dataAgent = new DataFetchAgent();
    this.normalizationAgent = new NormalizationAgent();
    this.chartAgent = new ChartRenderAgent();
    this.reportAgent = new ReportAgent();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    }));

    this.app.use(compression());
    this.app.use(morgan('combined'));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files
    const clientPath = path.join(__dirname, 'client', 'dist');
    this.app.use(express.static(clientPath));
    this.app.use('/reports', express.static(config.reportsDir));
    this.app.use('/charts', express.static(config.chartsDir));
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api/auth', this.createAuthRoutes());
    this.app.use('/api/data', this.createDataRoutes());
    this.app.use('/api/analytics', this.createAnalyticsRoutes());
    this.app.use('/api/reports', this.createReportRoutes());
    this.app.use('/api/charts', this.createChartRoutes());
    this.app.use('/api/health', this.createHealthRoutes());

    // Serve React app for all other routes
    this.app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
    });

    // Error handling
    this.app.use(this.errorHandler.bind(this));
  }

  private createAuthRoutes(): express.Router {
    const router = express.Router();

    // Get authentication status
    router.get('/status', async (req: Request, res: Response) => {
      try {
        const status = await this.authAgent.getAuthStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get auth status' });
      }
    });

    // Start authentication
    router.post('/authenticate', async (req: Request, res: Response) => {
      try {
        const tokens = await this.authAgent.authenticate();
        res.json({ success: true, message: 'Authentication successful' });
      } catch (error: any) {
        res.status(401).json({ error: error.message });
      }
    });

    // Test API connection
    router.post('/test', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const success = await this.authAgent.testConnection(tokens);
        res.json({ success });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Logout
    router.post('/logout', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (tokens) {
          await this.authAgent.revoke(tokens);
        }
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private createDataRoutes(): express.Router {
    const router = express.Router();

    // Get latest data
    router.get('/latest', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const cacheKey = 'latest_data';
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        const data = await this.dataAgent.fetchLatestData(tokens);
        this.setCache(cacheKey, data);
        
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get historical data
    router.post('/historical', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { startDate, endDate, dataTypes } = req.body;
        const cacheKey = `historical_${startDate}_${endDate}_${dataTypes?.join(',')}`;
        
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        const data = await this.dataAgent.fetchHistoricalData(tokens, {
          start: startDate,
          end: endDate,
          types: dataTypes
        });

        this.setCache(cacheKey, data);
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get data summary
    router.get('/summary', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const cacheKey = 'data_summary';
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        const summary = await this.dataAgent.getDataSummary(tokens);
        this.setCache(cacheKey, summary);
        
        res.json(summary);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private createAnalyticsRoutes(): express.Router {
    const router = express.Router();

    // Get monthly analytics
    router.post('/monthly', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { month, year, includeComparisons } = req.body;
        const cacheKey = `analytics_monthly_${year}_${month}`;
        
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        // Fetch raw data
        const rawData = await this.dataAgent.fetchMonthlyData(tokens, { month, year });
        
        // Normalize data
        const normalizedData = await this.normalizationAgent.normalizeMonthlyData(rawData);
        
        this.setCache(cacheKey, normalizedData);
        res.json(normalizedData);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get weekly analytics
    router.post('/weekly', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { startDate, endDate } = req.body;
        const cacheKey = `analytics_weekly_${startDate}_${endDate}`;
        
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        const rawData = await this.dataAgent.fetchDateRangeData(tokens, startDate, endDate);
        const weeklyStats = await this.normalizationAgent.normalizeWeeklyData(rawData);
        
        this.setCache(cacheKey, weeklyStats);
        res.json(weeklyStats);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get correlations
    router.post('/correlations', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { metrics, timeframe } = req.body;
        const correlations = await this.normalizationAgent.calculateCorrelations(metrics, timeframe);
        
        res.json(correlations);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get trends
    router.post('/trends', async (req: Request, res: Response) => {
      try {
        const { metric, timeframe, smoothing } = req.body;
        const trends = await this.normalizationAgent.calculateTrends(metric, timeframe, smoothing);
        
        res.json(trends);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private createReportRoutes(): express.Router {
    const router = express.Router();

    // Generate PDF report
    router.post('/generate', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const filters: DashboardFilters = req.body.filters;
        const exportOptions: ExportOptions = req.body.options;

        // Emit progress update
        this.io.emit('report:progress', { stage: 'fetching', progress: 0 });

        // Fetch data
        const rawData = await this.dataAgent.fetchDateRangeData(
          tokens, 
          filters.dateRange.start, 
          filters.dateRange.end
        );

        this.io.emit('report:progress', { stage: 'processing', progress: 25 });

        // Normalize data
        const normalizedData = await this.normalizationAgent.normalizeMonthlyData(rawData);

        this.io.emit('report:progress', { stage: 'charts', progress: 50 });

        // Generate charts if requested
        let chartPaths: string[] = [];
        if (exportOptions.includeCharts) {
          chartPaths = await this.chartAgent.generateReportCharts(normalizedData, filters);
        }

        this.io.emit('report:progress', { stage: 'generating', progress: 75 });

        // Generate report
        const reportResult = await this.reportAgent.generateReport(
          normalizedData,
          chartPaths,
          exportOptions
        );

        this.io.emit('report:progress', { stage: 'complete', progress: 100 });

        res.json({
          success: true,
          report: reportResult,
          downloadUrl: `/api/reports/download/${path.basename(reportResult.filepath)}`
        });

      } catch (error: any) {
        this.io.emit('report:error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Download generated report
    router.get('/download/:filename', (req: Request, res: Response) => {
      const filename = req.params.filename;
      const filepath = path.join(config.reportsDir, filename);
      
      res.download(filepath, (err) => {
        if (err) {
          res.status(404).json({ error: 'Report not found' });
        }
      });
    });

    // List available reports
    router.get('/list', async (req: Request, res: Response) => {
      try {
        const reports = await this.reportAgent.listReports();
        res.json(reports);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete report
    router.delete('/:filename', async (req: Request, res: Response) => {
      try {
        await this.reportAgent.deleteReport(req.params.filename);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private createChartRoutes(): express.Router {
    const router = express.Router();

    // Generate individual chart
    router.post('/generate', async (req: Request, res: Response) => {
      try {
        const { chartType, data, config: chartConfig } = req.body;
        
        const chartPath = await this.chartAgent.generateChart(
          chartType,
          data,
          chartConfig
        );

        res.json({
          success: true,
          chartPath: `/charts/${path.basename(chartPath)}`,
          chartUrl: `${req.protocol}://${req.get('host')}/charts/${path.basename(chartPath)}`
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get chart data for frontend
    router.post('/data', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        if (!tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { chartType, timeframe, metrics } = req.body;
        const data = await this.chartAgent.prepareChartData(chartType, timeframe, metrics);
        
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private createHealthRoutes(): express.Router {
    const router = express.Router();

    // Health check
    router.get('/check', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // System status
    router.get('/status', async (req: Request, res: Response) => {
      try {
        const tokens = await this.loadTokens();
        const authStatus = await this.authAgent.getAuthStatus();
        
        res.json({
          server: 'running',
          authentication: authStatus.authenticated,
          ble_support: authStatus.bleSupported,
          cache_size: this.dataCache.size,
          agents: {
            auth: 'ready',
            data_fetch: 'ready',
            normalization: 'ready',
            charts: 'ready',
            reports: 'ready'
          }
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  private setupWebSocket(): void {
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://your-domain.com'] 
          : ['http://localhost:3000', 'http://localhost:5173'],
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      this.logger.info(`Client connected: ${socket.id}`);

      // Real-time data updates
      socket.on('subscribe:data', (callback) => {
        socket.join('data_updates');
        callback({ success: true });
      });

      // Report generation updates
      socket.on('subscribe:reports', (callback) => {
        socket.join('report_updates');
        callback({ success: true });
      });

      socket.on('disconnect', () => {
        this.logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    // Periodic data updates
    setInterval(async () => {
      try {
        const tokens = await this.loadTokens();
        if (tokens) {
          const latestData = await this.dataAgent.fetchLatestData(tokens);
          this.io.to('data_updates').emit('data:update', latestData);
        }
      } catch (error) {
        // Silently fail - client will handle reconnection
      }
    }, 60000); // Every minute
  }

  private async loadTokens(): Promise<WhoopTokens | null> {
    try {
      return await this.authAgent.authenticate();
    } catch {
      return null;
    }
  }

  private getFromCache(key: string): any {
    const cached = this.dataCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.dataCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
    this.logger.error('Server error:', error);
    
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
      timestamp: new Date().toISOString()
    });
  }

  public start(port: number = 3001): void {
    this.server.listen(port, () => {
      this.logger.success(`🚀 WHOOP Dashboard Server running on port ${port}`);
      this.logger.info(`📊 Dashboard: http://localhost:${port}`);
      this.logger.info(`🔌 API: http://localhost:${port}/api`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, shutting down gracefully');
      this.server.close(() => {
        process.exit(0);
      });
    });
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WhoopDashboardServer();
  const port = parseInt(process.env.PORT || '3001');
  server.start(port);
}

export { WhoopDashboardServer };
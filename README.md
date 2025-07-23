# WHOOP Analytics Agents 🏃‍♂️📊

> **Advanced WHOOP Analytics System with BLE Integration and Web Dashboard**

A comprehensive, modular system for analyzing WHOOP health and fitness data using TypeScript agents, featuring direct BLE device integration, real-time web dashboard, and automated PDF report generation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![WHOOP API v2](https://img.shields.io/badge/WHOOP_API-v2-red)](https://developer.whoop.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Features

### 🔐 Advanced Authentication
- **WHOOP API v2** OAuth2 integration with automatic token refresh
- **BLE Direct Connection** to WHOOP devices for real-time data
- Secure token management and session handling
- Multi-authentication method support

### 📊 Comprehensive Data Analytics
- **Complete Data Coverage**: Recovery, Sleep, Strain, Workouts, Cycles
- **Real-time Processing**: Live data streaming and analysis
- **Advanced Normalization**: Daily, weekly, monthly aggregations
- **Correlation Analysis**: Identify patterns between metrics
- **Trend Detection**: Machine learning-powered insights

### 🌐 Interactive Web Dashboard
- **Real-time Visualizations**: Dynamic charts and graphs
- **Responsive Design**: Desktop and mobile optimized
- **Live Data Updates**: WebSocket-powered real-time updates
- **Customizable Layout**: Drag-and-drop dashboard configuration
- **Export Capabilities**: PDF, Excel, CSV report generation

### 📱 BLE Integration
- **Direct Device Connection**: Connect to WHOOP 4.0 via Bluetooth
- **Raw Data Collection**: Heart rate, motion, environmental sensors
- **Real-time Streaming**: Live data processing and analysis
- **Data Quality Monitoring**: Connection quality and reliability metrics

### 📈 Advanced Visualization
- **Multiple Chart Types**: Line, bar, scatter, area charts
- **Interactive Features**: Zoom, pan, tooltips, animations
- **Custom Themes**: Light/dark mode with customizable colors
- **High-Resolution Exports**: SVG, PNG, PDF chart exports

### 📄 Automated Reporting
- **PDF Generation**: Professional health reports with charts
- **Custom Templates**: Handlebars-based report customization
- **Scheduled Reports**: Automated weekly/monthly summaries
- **Correlation Analysis**: Comprehensive metric relationships
- **Personalized Insights**: AI-powered recommendations

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- WHOOP Developer Account ([Register here](https://developer.whoop.com/))
- BLE-enabled system (optional, for direct device integration)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/whoop-analytics-agents.git
cd whoop-analytics-agents

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your WHOOP API credentials
```

### Environment Configuration

```bash
# WHOOP API v2 Configuration
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret
WHOOP_REDIRECT_URI=http://localhost:3000/callback

# Data Storage
DATA_DIR=./data
CACHE_DIR=./data/cache
REPORTS_DIR=./reports
CHARTS_DIR=./charts

# Web Dashboard
WEB_PORT=3001
NODE_ENV=development

# BLE Configuration (optional)
ENABLE_BLE=true
BLE_SCAN_TIMEOUT=30000
```

### Launch Dashboard

```bash
# Start the web dashboard
npm run dashboard

# Or run in development mode with auto-reload
npm run dev:web
```

Visit `http://localhost:3001` to access the dashboard.

## 🏗️ Architecture

### Agent-Based System
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Agent    │    │  Data Agent     │    │  BLE Agent      │
│                 │    │                 │    │                 │
│ • OAuth2 Flow   │    │ • API v2 Calls  │    │ • Device Scan   │
│ • Token Mgmt    │    │ • Pagination    │    │ • Data Stream   │
│ • Validation    │    │ • Rate Limiting │    │ • Raw Parsing   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────┐    ┌▼────────────────┐    ┌─────────────────┐
         │ Normalize Agent │    │  Chart Agent    │    │ Report Agent    │
         │                 │    │                 │    │                 │
         │ • Data Cleaning │    │ • D3.js Charts  │    │ • PDF Reports   │
         │ • Aggregation   │    │ • Visualizations│    │ • Templates     │
         │ • Correlations  │    │ • SVG Export    │    │ • Scheduling    │
         └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow
```
WHOOP Device ──BLE──┐
                   ├──► Data Processing ──► Analytics ──► Dashboard
WHOOP API v2 ───────┘                                  └──► Reports
```

## 📊 Dashboard Features

### 🎛️ Real-time Metrics
- **Recovery Score**: Current and historical trends
- **Sleep Performance**: Efficiency, stages, consistency
- **Strain Analysis**: Daily and workout strain tracking
- **Heart Rate Variability**: HRV trends and insights
- **Biometric Tracking**: Temperature, SpO2, respiratory rate

### 📈 Advanced Analytics
- **Correlation Matrix**: Identify relationships between metrics
- **Trend Analysis**: Detect improving/declining patterns
- **Performance Zones**: Time spent in different HR zones
- **Sleep Debt Tracking**: Recovery recommendations
- **Workout Analysis**: Strain by sport, duration, intensity

### 🎨 Customization
- **Dashboard Layout**: Drag-and-drop widget positioning
- **Theme Selection**: Light, dark, or custom themes
- **Chart Configuration**: Colors, scales, animations
- **Data Filters**: Date ranges, metric selection, smoothing
- **Export Options**: Multiple formats and quality settings

## 🔧 API Usage

### Programmatic Access

```typescript
import { 
  WhoopAuthAgent, 
  DataFetchAgent, 
  NormalizationAgent,
  ChartRenderAgent,
  ReportAgent 
} from './src/agents';

// Initialize agents
const authAgent = new WhoopAuthAgent();
const dataAgent = new DataFetchAgent();
const normAgent = new NormalizationAgent();

// Authenticate
const tokens = await authAgent.authenticate();

// Fetch data
const data = await dataAgent.fetchMonthlyData(tokens, {
  month: 12,
  year: 2023
});

// Normalize and analyze
const insights = await normAgent.normalizeMonthlyData(data);

console.log('Monthly insights:', insights.summary);
```

### REST API Endpoints

```bash
# Authentication
POST /api/auth/authenticate
GET  /api/auth/status

# Data Access
GET  /api/data/latest
POST /api/data/historical
GET  /api/data/summary

# Analytics
POST /api/analytics/monthly
POST /api/analytics/correlations
POST /api/analytics/trends

# Reports
POST /api/reports/generate
GET  /api/reports/download/:filename
GET  /api/reports/list

# Charts
POST /api/charts/generate
POST /api/charts/data

# Health Monitoring
GET  /api/health/check
GET  /api/health/status
```

## 🔌 BLE Integration

### Device Connection

```typescript
import { BLEAgent } from './src/agents/ble/bleAgent';

const bleAgent = new BLEAgent();

// Scan for WHOOP devices
const devices = await bleAgent.startScanning(30000);

// Connect to device
const deviceInfo = await bleAgent.connectToDevice(devices[0].id);

// Start data collection session
const sessionId = await bleAgent.startSession(devices[0].id);

// Subscribe to real-time data
await bleAgent.subscribeToCharacteristics(devices[0].id);

// Stop session and save data
const session = await bleAgent.stopSession();
```

### Supported Data Types
- **Heart Rate**: Real-time HR with RR intervals
- **Motion Data**: 3-axis accelerometer and gyroscope
- **Environmental**: Skin temperature, ambient conditions
- **Biometric**: SpO2, respiratory rate, stress indicators

## 📊 Report Generation

### PDF Reports

```typescript
import { ReportAgent } from './src/agents/report/reportAgent';

const reportAgent = new ReportAgent();

// Generate comprehensive monthly report
const report = await reportAgent.generateReport(
  normalizedData,
  chartPaths,
  {
    format: 'pdf',
    includeCharts: true,
    includeRawData: false,
    dateRange: {
      start: '2023-12-01',
      end: '2023-12-31'
    }
  }
);

console.log('Report generated:', report.downloadUrl);
```

### Report Features
- **Executive Summary**: Key metrics and insights
- **Detailed Analytics**: Comprehensive metric breakdowns
- **Visual Charts**: High-quality embedded visualizations
- **Correlations**: Relationship analysis between metrics
- **Recommendations**: Personalized improvement suggestions
- **Trends**: Historical pattern analysis

## 🛠️ Development

### Project Structure
```
whoop-analytics-agents/
├── src/
│   ├── agents/           # Core agent modules
│   │   ├── auth/         # Authentication agent
│   │   ├── api/          # Data fetching agent  
│   │   ├── data/         # Normalization agent
│   │   ├── charts/       # Chart rendering agent
│   │   ├── report/       # Report generation agent
│   │   └── ble/          # BLE integration agent
│   ├── models/           # TypeScript data models
│   ├── utils/            # Utility functions
│   ├── config/           # Configuration management
│   ├── web/              # Web dashboard
│   │   ├── server.ts     # Express server
│   │   └── client/       # React frontend
│   └── main.ts           # CLI entry point
├── data/                 # Data storage
├── reports/              # Generated reports
├── charts/               # Chart exports
└── docs/                 # Documentation
```

### Building and Testing

```bash
# Development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Testing
npm run test

# Web dashboard development
npm run dev:web
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📈 Performance & Scalability

### Optimization Features
- **Request Rate Limiting**: Automatic API throttling
- **Intelligent Caching**: Multi-level data caching
- **Pagination Handling**: Efficient large dataset processing
- **Connection Pooling**: Optimized database connections
- **Background Processing**: Async report generation
- **Memory Management**: Efficient data structure usage

### Scalability Considerations
- **Horizontal Scaling**: Multiple server instance support
- **Database Optimization**: Indexed queries and partitioning
- **CDN Integration**: Static asset delivery optimization
- **Microservice Architecture**: Modular, deployable agents
- **Load Balancing**: Request distribution capabilities

## 🔒 Security & Privacy

### Data Protection
- **OAuth2 Security**: Industry-standard authentication
- **Token Encryption**: Secure credential storage
- **Data Anonymization**: Personal information protection
- **Audit Logging**: Comprehensive access tracking
- **HTTPS Enforcement**: Encrypted data transmission

### Privacy Compliance
- **GDPR Compliance**: European privacy regulation adherence
- **Data Minimization**: Only necessary data collection
- **User Consent**: Explicit permission handling
- **Data Retention**: Configurable retention policies
- **Export/Delete**: User data control capabilities

## 🚧 Roadmap

### Near Term (Q1 2024)
- [ ] **Enhanced BLE Protocol**: Full WHOOP 4.0 command support
- [ ] **Machine Learning**: Predictive analytics and recommendations
- [ ] **Mobile App**: React Native companion application
- [ ] **Real-time Alerts**: Health threshold notifications
- [ ] **Team Analytics**: Multi-user organization features

### Medium Term (Q2-Q3 2024)
- [ ] **Wearable Integration**: Apple Watch, Garmin, Fitbit support
- [ ] **Health Platform APIs**: HealthKit, Google Fit integration
- [ ] **Advanced ML Models**: Injury prediction, training optimization
- [ ] **Social Features**: Community challenges and comparisons
- [ ] **Professional Tools**: Coach and athlete management

### Long Term (Q4 2024+)
- [ ] **AI Assistant**: Natural language query interface
- [ ] **Research Platform**: Anonymous data contribution
- [ ] **Enterprise Features**: Organization-wide health insights
- [ ] **Global Health Insights**: Population-level analytics
- [ ] **Integration Marketplace**: Third-party plugin ecosystem

## 📞 Support & Community

### Getting Help
- **Documentation**: Comprehensive guides and API reference
- **GitHub Issues**: Bug reports and feature requests
- **Discord Community**: Real-time chat and support
- **Email Support**: Direct technical assistance

### Resources
- [WHOOP Developer Documentation](https://developer.whoop.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://reactjs.org/docs/)
- [D3.js Tutorials](https://d3js.org/)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **WHOOP Team**: For providing comprehensive health data APIs
- **Open Source Community**: For the amazing tools and libraries
- **Beta Testers**: For invaluable feedback and testing
- **Contributors**: For code, documentation, and feature ideas

---

**Made with ❤️ for the health and fitness community**

*Transform your WHOOP data into actionable insights with advanced analytics, beautiful visualizations, and automated reporting.*

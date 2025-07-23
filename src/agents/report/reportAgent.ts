import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { DataNormalizationAgent } from '../data/normalizationAgent.js';
import { ChartRenderAgent } from '../charts/chartRenderAgent.js';
import { MonthlyPerformance } from '../../models/whoop.js';

export class ReportAgent {
  private normalizationAgent: DataNormalizationAgent;
  private chartRenderAgent: ChartRenderAgent;
  private readonly dataDir: string;
  private readonly chartOutputDir: string;

  constructor() {
    this.normalizationAgent = new DataNormalizationAgent();
    this.chartRenderAgent = new ChartRenderAgent();
    this.dataDir = config.storage.dataDir;
    this.chartOutputDir = config.storage.chartOutputDir;
  }

  /**
   * Calculate insights and correlations
   */
  private generateInsights(monthlyData: MonthlyPerformance): any {
    const { daily_stats, summary } = monthlyData;

    // Find correlations
    const validData = daily_stats.filter(day => 
      day.sleep_duration_hours !== null && 
      day.recovery_score !== null &&
      day.strain !== null
    );

    // Sleep-Recovery correlation
    const sleepRecoveryCorrelation = this.calculateCorrelation(
      validData.map(d => d.sleep_duration_hours!),
      validData.map(d => d.recovery_score!)
    );

    // Sleep-Strain correlation
    const sleepStrainCorrelation = this.calculateCorrelation(
      validData.map(d => d.sleep_duration_hours!),
      validData.map(d => d.strain!)
    );

    // Recovery-Strain correlation (next day)
    const recoveryStrainData = daily_stats.filter((day, index) => {
      const nextDay = daily_stats[index + 1];
      return day.recovery_score !== null && nextDay?.strain !== null;
    });

    const recoveryStrainCorrelation = recoveryStrainData.length > 0 ? 
      this.calculateCorrelation(
        recoveryStrainData.map(d => d.recovery_score!),
        recoveryStrainData.map((d, index) => daily_stats[index + 1].strain!)
      ) : 0;

    // Find best and worst weeks
    const weeksWithData = monthlyData.weeks.filter(w => 
      w.avg_recovery > 0 && w.avg_sleep_performance > 0
    );

    const bestWeek = weeksWithData.reduce((best, current) => 
      current.avg_recovery > best.avg_recovery ? current : best,
      weeksWithData[0]
    );

    const worstWeek = weeksWithData.reduce((worst, current) => 
      current.avg_recovery < worst.avg_recovery ? current : worst,
      weeksWithData[0]
    );

    // Sleep consistency analysis
    const sleepDurations = daily_stats
      .map(d => d.sleep_duration_hours)
      .filter(d => d !== null) as number[];
    
    const sleepVariability = sleepDurations.length > 0 ? 
      this.calculateStandardDeviation(sleepDurations) : 0;

    // Recovery trend analysis
    const recoveryScores = daily_stats
      .map(d => d.recovery_score)
      .filter(d => d !== null) as number[];
    
    const recoveryTrend = this.calculateTrend(recoveryScores);

    return {
      correlations: {
        sleep_recovery: {
          value: sleepRecoveryCorrelation,
          interpretation: this.interpretCorrelation(sleepRecoveryCorrelation, 'sleep', 'recovery'),
        },
        sleep_strain: {
          value: sleepStrainCorrelation,
          interpretation: this.interpretCorrelation(sleepStrainCorrelation, 'sleep', 'strain'),
        },
        recovery_strain: {
          value: recoveryStrainCorrelation,
          interpretation: this.interpretCorrelation(recoveryStrainCorrelation, 'recovery', 'next-day strain'),
        },
      },
      weekly_analysis: {
        best_week: bestWeek,
        worst_week: worstWeek,
        improvement: bestWeek && worstWeek ? 
          ((bestWeek.avg_recovery - worstWeek.avg_recovery) / worstWeek.avg_recovery * 100).toFixed(1) : '0',
      },
      sleep_analysis: {
        variability: sleepVariability.toFixed(2),
        consistency_rating: this.getSleepConsistencyRating(sleepVariability),
        avg_bedtime_variation: sleepVariability > 1 ? 'High' : sleepVariability > 0.5 ? 'Moderate' : 'Low',
      },
      recovery_trend: {
        direction: recoveryTrend > 0.1 ? 'Improving' : recoveryTrend < -0.1 ? 'Declining' : 'Stable',
        strength: Math.abs(recoveryTrend).toFixed(2),
      },
      recommendations: this.generateRecommendations(monthlyData, {
        sleepVariability,
        recoveryTrend,
        sleepRecoveryCorrelation,
      }),
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate trend (simple linear regression slope)
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope || 0;
  }

  /**
   * Interpret correlation value
   */
  private interpretCorrelation(correlation: number, var1: string, var2: string): string {
    const abs = Math.abs(correlation);
    let strength = '';
    
    if (abs >= 0.7) strength = 'strong';
    else if (abs >= 0.3) strength = 'moderate';
    else if (abs >= 0.1) strength = 'weak';
    else return `No significant correlation between ${var1} and ${var2}`;

    const direction = correlation > 0 ? 'positive' : 'negative';
    return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation between ${var1} and ${var2}`;
  }

  /**
   * Get sleep consistency rating
   */
  private getSleepConsistencyRating(variability: number): string {
    if (variability < 0.5) return 'Excellent';
    if (variability < 1.0) return 'Good';
    if (variability < 1.5) return 'Fair';
    return 'Needs Improvement';
  }

  /**
   * Generate personalized recommendations
   */
  private generateRecommendations(monthlyData: MonthlyPerformance, insights: any): string[] {
    const recommendations: string[] = [];
    const { summary } = monthlyData;

    // Sleep recommendations
    if (summary.avg_sleep_duration < 7) {
      recommendations.push('Aim for 7-9 hours of sleep per night to optimize recovery');
    }
    
    if (insights.sleepVariability > 1) {
      recommendations.push('Maintain a consistent bedtime and wake time to improve sleep quality');
    }

    if (summary.avg_sleep_performance < 85) {
      recommendations.push('Focus on sleep hygiene: cool, dark room and avoid screens before bed');
    }

    // Recovery recommendations
    if (summary.avg_recovery < 70) {
      recommendations.push('Consider reducing training intensity and increasing recovery time');
    }

    if (insights.recoveryTrend < -0.1) {
      recommendations.push('Your recovery trend is declining - prioritize stress management and sleep');
    }

    // Strain recommendations
    if (summary.avg_strain > 15) {
      recommendations.push('High average strain detected - ensure adequate recovery between sessions');
    }

    // Correlation-based recommendations
    if (insights.sleepRecoveryCorrelation > 0.3) {
      recommendations.push('Strong sleep-recovery correlation found - prioritize sleep quality for better recovery');
    }

    // HRV recommendations
    if (summary.avg_hrv < 30) {
      recommendations.push('Consider stress reduction techniques to improve heart rate variability');
    }

    // Default recommendations if none generated
    if (recommendations.length === 0) {
      recommendations.push('Great job! Your metrics look balanced. Continue your current routine.');
      recommendations.push('Consider tracking additional metrics like nutrition and stress levels.');
    }

    return recommendations;
  }

  /**
   * Generate HTML report template
   */
  private getHTMLTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WHOOP Analytics Report - {{month}} {{year}}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            font-size: 1.2em;
            opacity: 0.9;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
        .section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .section h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .chart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .chart-container {
            text-align: center;
        }
        .chart-container img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .insights-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .insight-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .recommendations {
            background: #e8f5e8;
            border-left: 4px solid #28a745;
            padding: 20px;
            border-radius: 8px;
        }
        .recommendations ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .correlation {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .correlation-value {
            font-weight: bold;
            color: #667eea;
        }
        .footer {
            text-align: center;
            color: #666;
            margin-top: 40px;
            padding: 20px;
            border-top: 1px solid #ddd;
        }
        .best-worst {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .week-card {
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .best-week {
            background: #d4edda;
            border: 1px solid #c3e6cb;
        }
        .worst-week {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>WHOOP Analytics Report</h1>
        <p>{{month}} {{year}} Performance Summary</p>
        <p>Generated on {{generated_date}}</p>
    </div>

    <div class="summary-grid">
        <div class="metric-card">
            <div class="metric-value">{{summary.avg_recovery}}%</div>
            <div class="metric-label">Average Recovery</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{{summary.avg_sleep_duration}}h</div>
            <div class="metric-label">Average Sleep</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{{summary.avg_strain}}</div>
            <div class="metric-label">Average Strain</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{{summary.avg_hrv}}ms</div>
            <div class="metric-label">Average HRV</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{{summary.avg_rhr}} bpm</div>
            <div class="metric-label">Resting Heart Rate</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">{{summary.total_calories}}</div>
            <div class="metric-label">Total Calories</div>
        </div>
    </div>

    <div class="section">
        <h2>📊 Performance Charts</h2>
        <div class="chart-grid">
            <div class="chart-container">
                <img src="{{charts.recovery}}" alt="Recovery Trends">
            </div>
            <div class="chart-container">
                <img src="{{charts.sleep}}" alt="Sleep Analysis">
            </div>
            <div class="chart-container">
                <img src="{{charts.strain}}" alt="Strain & Activity">
            </div>
            <div class="chart-container">
                <img src="{{charts.hrv}}" alt="HRV Trends">
            </div>
            <div class="chart-container">
                <img src="{{charts.weekly}}" alt="Weekly Summary">
            </div>
            <div class="chart-container">
                <img src="{{charts.correlation}}" alt="Sleep vs Recovery">
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🔍 Key Insights</h2>
        <div class="insights-grid">
            <div>
                <h3>📈 Correlations</h3>
                <div class="correlation">
                    <span>Sleep → Recovery:</span>
                    <span class="correlation-value">{{insights.correlations.sleep_recovery.value}}</span>
                </div>
                <div class="correlation">
                    <span>Sleep → Strain:</span>
                    <span class="correlation-value">{{insights.correlations.sleep_strain.value}}</span>
                </div>
                <div class="correlation">
                    <span>Recovery → Next Day Strain:</span>
                    <span class="correlation-value">{{insights.correlations.recovery_strain.value}}</span>
                </div>
            </div>
            <div>
                <h3>📊 Trends</h3>
                <div class="insight-item">
                    <strong>Recovery Trend:</strong> {{insights.recovery_trend.direction}}
                </div>
                <div class="insight-item">
                    <strong>Sleep Consistency:</strong> {{insights.sleep_analysis.consistency_rating}}
                </div>
                <div class="insight-item">
                    <strong>Sleep Variability:</strong> {{insights.sleep_analysis.variability}} hours
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🏆 Best vs Worst Week</h2>
        <div class="best-worst">
            <div class="week-card best-week">
                <h3>Best Week</h3>
                <p><strong>{{insights.weekly_analysis.best_week.week_start}}</strong></p>
                <p>Recovery: {{insights.weekly_analysis.best_week.avg_recovery}}%</p>
                <p>Sleep: {{insights.weekly_analysis.best_week.avg_sleep_duration}}h</p>
                <p>Strain: {{insights.weekly_analysis.best_week.avg_strain}}</p>
            </div>
            <div class="week-card worst-week">
                <h3>Worst Week</h3>
                <p><strong>{{insights.weekly_analysis.worst_week.week_start}}</strong></p>
                <p>Recovery: {{insights.weekly_analysis.worst_week.avg_recovery}}%</p>
                <p>Sleep: {{insights.weekly_analysis.worst_week.avg_sleep_duration}}h</p>
                <p>Strain: {{insights.weekly_analysis.worst_week.avg_strain}}</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>💡 Personalized Recommendations</h2>
        <div class="recommendations">
            <h3>Based on your data analysis:</h3>
            <ul>
                {{#each insights.recommendations}}
                <li>{{this}}</li>
                {{/each}}
            </ul>
        </div>
    </div>

    <div class="footer">
        <p>Generated by WHOOP Analytics Agents | Data reflects {{month}} {{year}}</p>
        <p>This report is based on your personal WHOOP data and provides insights to optimize your performance.</p>
    </div>
</body>
</html>`;
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(monthlyData: MonthlyPerformance, chartPaths: any): Promise<string> {
    logger.agent('REPORT', 'Generating HTML report...');

    const insights = this.generateInsights(monthlyData);
    const template = Handlebars.compile(this.getHTMLTemplate());

    const templateData = {
      month: monthlyData.month,
      year: monthlyData.year,
      generated_date: new Date().toLocaleDateString(),
      summary: {
        avg_recovery: monthlyData.summary.avg_recovery.toFixed(1),
        avg_sleep_duration: monthlyData.summary.avg_sleep_duration.toFixed(1),
        avg_strain: monthlyData.summary.avg_strain.toFixed(1),
        avg_hrv: monthlyData.summary.avg_hrv.toFixed(1),
        avg_rhr: monthlyData.summary.avg_rhr.toFixed(1),
        total_calories: Math.round(monthlyData.summary.total_calories),
      },
      charts: chartPaths,
      insights,
    };

    const html = template(templateData);
    const htmlPath = path.join(this.chartOutputDir, 'monthly_report.html');
    fs.writeFileSync(htmlPath, html);

    logger.success(`HTML report saved: ${htmlPath}`);
    return htmlPath;
  }

  /**
   * Convert HTML to PDF
   */
  async generatePDFReport(htmlPath: string): Promise<string> {
    logger.agent('REPORT', 'Converting HTML to PDF...');

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

      const pdfPath = path.join(this.chartOutputDir, 'monthly_report.pdf');
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      await browser.close();

      logger.success(`PDF report saved: ${pdfPath}`);
      return pdfPath;

    } catch (error: any) {
      logger.error(`PDF generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate complete report (HTML + PDF)
   */
  async generateCompleteReport(): Promise<{
    html: string;
    pdf: string;
    insights: any;
  }> {
    logger.agent('REPORT', 'Starting complete report generation...');

    try {
      // Load normalized data
      const monthlyData = this.normalizationAgent.loadNormalizedData();
      if (!monthlyData) {
        throw new Error('No normalized data found. Please run data normalization first.');
      }

      // Generate charts if they don't exist
      let chartPaths: any;
      const chartMetadataPath = path.join(this.chartOutputDir, 'charts_metadata.json');
      
      if (fs.existsSync(chartMetadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(chartMetadataPath, 'utf8'));
        chartPaths = metadata.charts;
        logger.info('Using existing charts');
      } else {
        logger.info('Charts not found, generating...');
        chartPaths = await this.chartRenderAgent.generateAllCharts();
      }

      // Generate insights
      const insights = this.generateInsights(monthlyData);

      // Generate HTML report
      const htmlPath = await this.generateHTMLReport(monthlyData, chartPaths);

      // Generate PDF report
      const pdfPath = await this.generatePDFReport(htmlPath);

      // Save insights separately
      const insightsPath = path.join(this.dataDir, 'insights.json');
      fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));

      logger.success('✅ Complete report generation finished!');
      logger.info(`Report files:
        - HTML: ${htmlPath}
        - PDF: ${pdfPath}
        - Insights: ${insightsPath}`);

      return {
        html: htmlPath,
        pdf: pdfPath,
        insights,
      };

    } catch (error: any) {
      logger.error(`Report generation failed: ${error.message}`);
      throw error;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ReportAgent();
  
  agent.generateCompleteReport()
    .then((result) => {
      logger.success('✅ Report generation completed!');
      logger.info(`Reports generated:
        - HTML: ${result.html}
        - PDF: ${result.pdf}`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Report generation failed: ${error.message}`);
      process.exit(1);
    });
}
import fs from 'fs';
import path from 'path';
import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { DataNormalizationAgent } from '../data/normalizationAgent.js';
import { MonthlyPerformance } from '../../models/whoop.js';

export class ChartRenderAgent {
  private normalizationAgent: DataNormalizationAgent;
  private readonly chartOutputDir: string;
  private readonly chartWidth: number;
  private readonly chartHeight: number;

  constructor() {
    this.normalizationAgent = new DataNormalizationAgent();
    this.chartOutputDir = config.storage.chartOutputDir;
    this.chartWidth = config.chart.width;
    this.chartHeight = config.chart.height;
  }

  /**
   * Generate color palette for charts
   */
  private getColorPalette(): string[] {
    return [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Gold
      '#BB8FCE', // Purple
      '#85C1E9', // Light Blue
    ];
  }

  /**
   * Create SVG document with D3
   */
  private createSVGDocument(): { dom: JSDOM; svg: any; document: Document } {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    const document = dom.window.document;
    global.document = document;
    global.window = dom.window as any;

    const svg = d3.select(document.body)
      .append('svg')
      .attr('width', this.chartWidth)
      .attr('height', this.chartHeight)
      .attr('style', 'background: white; font-family: Arial, sans-serif;');

    return { dom, svg, document };
  }

  /**
   * Save SVG to file
   */
  private async saveSVG(svgElement: any, filename: string): Promise<string> {
    try {
      const svgString = svgElement.node().outerHTML;
      const filePath = path.join(this.chartOutputDir, `${filename}.svg`);
      
      // Add proper SVG namespace and styling
      const fullSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.chartWidth}" height="${this.chartHeight}" style="background: white; font-family: Arial, sans-serif;">
${svgElement.html()}
</svg>`;
      
      fs.writeFileSync(filePath, fullSVG);
      logger.success(`Chart saved: ${filePath}`);
      
      return filePath;
    } catch (error: any) {
      logger.error(`Failed to save chart ${filename}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create line chart with D3
   */
  private createLineChart(
    title: string,
    data: Array<{
      date: string;
      datasets: Array<{
        label: string;
        value: number | null;
        color: string;
      }>;
    }>
  ): any {
    const { svg } = this.createSVGDocument();
    const margin = { top: 60, right: 150, bottom: 80, left: 80 };
    const width = this.chartWidth - margin.left - margin.right;
    const height = this.chartHeight - margin.top - margin.bottom;

    // Create chart container
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append('text')
      .attr('x', this.chartWidth / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .text(title);

    // Parse dates
    const parseTime = d3.timeParse('%Y-%m-%d');
    const formatTime = d3.timeFormat('%m/%d');

    // Prepare data
    const processedData = data.map(d => ({
      date: parseTime(d.date)!,
      ...d.datasets.reduce((acc, dataset, i) => {
        acc[`value${i}`] = dataset.value;
        acc[`label${i}`] = dataset.label;
        acc[`color${i}`] = dataset.color;
        return acc;
      }, {} as any)
    })).filter(d => d.date);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(processedData, d => d.date) as [Date, Date])
      .range([0, width]);

    // Find all non-null values for y scale
    const allValues: number[] = [];
    data[0].datasets.forEach((_, i) => {
      processedData.forEach(d => {
        if (d[`value${i}`] !== null && d[`value${i}`] !== undefined) {
          allValues.push(d[`value${i}`]);
        }
      });
    });

    const yScale = d3.scaleLinear()
      .domain(d3.extent(allValues) as [number, number])
      .nice()
      .range([height, 0]);

    // Create line generator
    const line = d3.line<any>()
      .defined(d => d.value !== null && d.value !== undefined)
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Add axes
    chart.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(formatTime as any))
      .selectAll('text')
      .style('font-size', '12px');

    chart.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '12px');

    // Add grid lines
    chart.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale)
        .tickSize(-height)
        .tickFormat('' as any)
      )
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    chart.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickSize(-width)
        .tickFormat('' as any)
      )
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    // Draw lines for each dataset
    data[0].datasets.forEach((dataset, i) => {
      const lineData = processedData.map(d => ({
        date: d.date,
        value: d[`value${i}`]
      })).filter(d => d.value !== null);

      if (lineData.length > 0) {
        chart.append('path')
          .datum(lineData)
          .attr('fill', 'none')
          .attr('stroke', dataset.color)
          .attr('stroke-width', 2)
          .attr('d', line);

        // Add dots
        chart.selectAll(`.dot-${i}`)
          .data(lineData)
          .enter().append('circle')
          .attr('class', `dot-${i}`)
          .attr('cx', d => xScale(d.date))
          .attr('cy', d => yScale(d.value))
          .attr('r', 4)
          .attr('fill', dataset.color);
      }
    });

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${this.chartWidth - 140}, 60)`);

    data[0].datasets.forEach((dataset, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 25})`);

      legendRow.append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', dataset.color);

      legendRow.append('text')
        .attr('x', 24)
        .attr('y', 14)
        .style('font-size', '12px')
        .style('fill', '#333')
        .text(dataset.label);
    });

    return svg;
  }

  /**
   * Create bar chart with D3
   */
  private createBarChart(
    title: string,
    labels: string[],
    datasets: Array<{
      label: string;
      data: (number | null)[];
      color: string;
    }>
  ): any {
    const { svg } = this.createSVGDocument();
    const margin = { top: 60, right: 150, bottom: 80, left: 80 };
    const width = this.chartWidth - margin.left - margin.right;
    const height = this.chartHeight - margin.top - margin.bottom;

    // Create chart container
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append('text')
      .attr('x', this.chartWidth / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .text(title);

    // Prepare data
    const data = labels.map((label, i) => ({
      label,
      values: datasets.map(dataset => ({
        value: dataset.data[i] || 0,
        color: dataset.color,
        label: dataset.label
      }))
    }));

    // Create scales
    const x0 = d3.scaleBand()
      .domain(labels)
      .range([0, width])
      .padding(0.1);

    const x1 = d3.scaleBand()
      .domain(datasets.map(d => d.label))
      .range([0, x0.bandwidth()])
      .padding(0.05);

    const allValues = datasets.flatMap(d => d.data.filter(v => v !== null)) as number[];
    const y = d3.scaleLinear()
      .domain([0, d3.max(allValues) || 100])
      .nice()
      .range([height, 0]);

    // Add axes
    chart.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x0))
      .selectAll('text')
      .style('font-size', '12px')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    chart.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('font-size', '12px');

    // Add bars
    const barGroups = chart.selectAll('.bar-group')
      .data(data)
      .enter().append('g')
      .attr('class', 'bar-group')
      .attr('transform', d => `translate(${x0(d.label)},0)`);

    barGroups.selectAll('rect')
      .data(d => d.values)
      .enter().append('rect')
      .attr('x', d => x1(d.label)!)
      .attr('y', d => y(d.value))
      .attr('width', x1.bandwidth())
      .attr('height', d => height - y(d.value))
      .attr('fill', d => d.color);

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${this.chartWidth - 140}, 60)`);

    datasets.forEach((dataset, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 25})`);

      legendRow.append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', dataset.color);

      legendRow.append('text')
        .attr('x', 24)
        .attr('y', 14)
        .style('font-size', '12px')
        .style('fill', '#333')
        .text(dataset.label);
    });

    return svg;
  }

  /**
   * Create scatter plot with D3
   */
  private createScatterPlot(
    title: string,
    data: Array<{ x: number; y: number }>,
    xLabel: string,
    yLabel: string
  ): any {
    const { svg } = this.createSVGDocument();
    const margin = { top: 60, right: 50, bottom: 80, left: 80 };
    const width = this.chartWidth - margin.left - margin.right;
    const height = this.chartHeight - margin.top - margin.bottom;

    // Create chart container
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append('text')
      .attr('x', this.chartWidth / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .text(title);

    // Create scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.x) as [number, number])
      .nice()
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.y) as [number, number])
      .nice()
      .range([height, 0]);

    // Add axes
    chart.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .style('font-size', '12px');

    chart.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '12px');

    // Add axis labels
    chart.append('text')
      .attr('transform', `translate(${width / 2}, ${height + 50})`)
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('fill', '#666')
      .text(xLabel);

    chart.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', -height / 2)
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('fill', '#666')
      .text(yLabel);

    // Add dots
    chart.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 6)
      .attr('fill', '#45B7D1')
      .attr('opacity', 0.7);

    return svg;
  }

  /**
   * Generate recovery trend chart
   */
  async generateRecoveryChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating recovery trend chart...');

    const colors = this.getColorPalette();
    const data = monthlyData.daily_stats.map(day => ({
      date: day.date,
      datasets: [
        {
          label: 'Recovery Score (%)',
          value: day.recovery_score,
          color: colors[1], // Teal
        },
        {
          label: 'Resting Heart Rate (bpm)',
          value: day.resting_heart_rate,
          color: colors[0], // Red
        },
      ]
    }));

    const svg = this.createLineChart(
      `Recovery Trends - ${monthlyData.month} ${monthlyData.year}`,
      data
    );

    return await this.saveSVG(svg, 'recovery_trends');
  }

  /**
   * Generate sleep analysis chart
   */
  async generateSleepChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating sleep analysis chart...');

    const colors = this.getColorPalette();
    const data = monthlyData.daily_stats.map(day => ({
      date: day.date,
      datasets: [
        {
          label: 'Sleep Duration (hours)',
          value: day.sleep_duration_hours,
          color: colors[2], // Blue
        },
        {
          label: 'Sleep Performance (%)',
          value: day.sleep_performance,
          color: colors[3], // Green
        },
        {
          label: 'Sleep Efficiency (%)',
          value: day.sleep_efficiency,
          color: colors[4], // Yellow
        },
      ]
    }));

    const svg = this.createLineChart(
      `Sleep Analysis - ${monthlyData.month} ${monthlyData.year}`,
      data
    );

    return await this.saveSVG(svg, 'sleep_analysis');
  }

  /**
   * Generate strain and activity chart
   */
  async generateStrainChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating strain and activity chart...');

    const colors = this.getColorPalette();
    const data = monthlyData.daily_stats.map(day => ({
      date: day.date,
      datasets: [
        {
          label: 'Daily Strain',
          value: day.strain,
          color: colors[0], // Red
        },
        {
          label: 'Calories (x100)',
          value: day.calories ? day.calories / 100 : null,
          color: colors[5], // Plum
        },
      ]
    }));

    const svg = this.createLineChart(
      `Strain & Activity - ${monthlyData.month} ${monthlyData.year}`,
      data
    );

    return await this.saveSVG(svg, 'strain_activity');
  }

  /**
   * Generate HRV chart
   */
  async generateHRVChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating HRV chart...');

    const colors = this.getColorPalette();
    const data = monthlyData.daily_stats.map(day => ({
      date: day.date,
      datasets: [
        {
          label: 'HRV (ms)',
          value: day.hrv,
          color: colors[6], // Mint
        },
      ]
    }));

    const svg = this.createLineChart(
      `Heart Rate Variability - ${monthlyData.month} ${monthlyData.year}`,
      data
    );

    return await this.saveSVG(svg, 'hrv_trends');
  }

  /**
   * Generate weekly summary bar chart
   */
  async generateWeeklySummaryChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating weekly summary chart...');

    const colors = this.getColorPalette();
    const labels = monthlyData.weeks.map(week => 
      `Week ${week.week_start.split('-')[2]}/${week.week_start.split('-')[1]}`
    );

    const datasets = [
      {
        label: 'Avg Recovery (%)',
        data: monthlyData.weeks.map(week => week.avg_recovery),
        color: colors[1], // Teal
      },
      {
        label: 'Avg Sleep Performance (%)',
        data: monthlyData.weeks.map(week => week.avg_sleep_performance),
        color: colors[3], // Green
      },
      {
        label: 'Avg Strain',
        data: monthlyData.weeks.map(week => week.avg_strain),
        color: colors[0], // Red
      },
    ];

    const svg = this.createBarChart(
      `Weekly Summary - ${monthlyData.month} ${monthlyData.year}`,
      labels,
      datasets
    );

    return await this.saveSVG(svg, 'weekly_summary');
  }

  /**
   * Generate correlation chart
   */
  async generateCorrelationChart(monthlyData: MonthlyPerformance): Promise<string> {
    logger.agent('CHARTS', 'Generating correlation chart...');

    // Create scatter plot showing relationship between sleep and recovery
    const validData = monthlyData.daily_stats.filter(day => 
      day.sleep_duration_hours !== null && day.recovery_score !== null
    );

    const scatterData = validData.map(day => ({
      x: day.sleep_duration_hours!,
      y: day.recovery_score!,
    }));

    const svg = this.createScatterPlot(
      `Sleep Duration vs Recovery Score - ${monthlyData.month} ${monthlyData.year}`,
      scatterData,
      'Sleep Duration (hours)',
      'Recovery Score (%)'
    );

    return await this.saveSVG(svg, 'sleep_recovery_correlation');
  }

  /**
   * Generate all charts
   */
  async generateAllCharts(): Promise<{
    recovery: string;
    sleep: string;
    strain: string;
    hrv: string;
    weekly: string;
    correlation: string;
  }> {
    logger.agent('CHARTS', 'Starting chart generation...');

    try {
      // Ensure chart output directory exists
      if (!fs.existsSync(this.chartOutputDir)) {
        fs.mkdirSync(this.chartOutputDir, { recursive: true });
      }

      // Load normalized data
      const monthlyData = this.normalizationAgent.loadNormalizedData();
      if (!monthlyData) {
        throw new Error('No normalized data found. Please run data normalization first.');
      }

      logger.info(`Generating charts for ${monthlyData.month} ${monthlyData.year}...`);

      // Generate all charts in parallel
      const [recovery, sleep, strain, hrv, weekly, correlation] = await Promise.all([
        this.generateRecoveryChart(monthlyData),
        this.generateSleepChart(monthlyData),
        this.generateStrainChart(monthlyData),
        this.generateHRVChart(monthlyData),
        this.generateWeeklySummaryChart(monthlyData),
        this.generateCorrelationChart(monthlyData),
      ]);

      logger.success('✅ All charts generated successfully!');
      logger.info(`Charts saved to: ${this.chartOutputDir}`);

      return {
        recovery,
        sleep,
        strain,
        hrv,
        weekly,
        correlation,
      };

    } catch (error: any) {
      logger.error(`Chart generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get chart metadata
   */
  getChartMetadata(chartPaths: { [key: string]: string }): any {
    const metadata = {
      generated_at: new Date().toISOString(),
      chart_count: Object.keys(chartPaths).length,
      output_directory: this.chartOutputDir,
      chart_dimensions: {
        width: this.chartWidth,
        height: this.chartHeight,
      },
      charts: chartPaths,
    };

    // Save metadata
    const metadataPath = path.join(this.chartOutputDir, 'charts_metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return metadata;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ChartRenderAgent();
  
  agent.generateAllCharts()
    .then((chartPaths) => {
      const metadata = agent.getChartMetadata(chartPaths);
      
      logger.success('✅ Chart generation completed!');
      logger.info(`Generated ${metadata.chart_count} charts:`);
      
      Object.entries(chartPaths).forEach(([type, path]) => {
        logger.info(`  - ${type}: ${path}`);
      });
      
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Chart generation failed: ${error.message}`);
      process.exit(1);
    });
}
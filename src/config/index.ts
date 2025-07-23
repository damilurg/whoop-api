import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

export interface AppConfig {
  whoop: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    apiBaseUrl: string;
  };
  storage: {
    dataDir: string;
    configDir: string;
    chartOutputDir: string;
  };
  chart: {
    width: number;
    height: number;
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

export const config: AppConfig = {
  whoop: {
    clientId: getEnvVar('WHOOP_CLIENT_ID'),
    clientSecret: getEnvVar('WHOOP_CLIENT_SECRET'),
    redirectUri: getEnvVar('WHOOP_REDIRECT_URI', 'http://localhost:3000/callback'),
    apiBaseUrl: getEnvVar('WHOOP_API_BASE_URL', 'https://api.prod.whoop.com/developer/v1'),
  },
  storage: {
    dataDir: getEnvVar('DATA_DIR', './data'),
    configDir: getEnvVar('CONFIG_DIR', './config'),
    chartOutputDir: getEnvVar('CHART_OUTPUT_DIR', './charts'),
  },
  chart: {
    width: parseInt(getEnvVar('CHART_WIDTH', '800')),
    height: parseInt(getEnvVar('CHART_HEIGHT', '600')),
  },
};

// Ensure directories exist
export function ensureDirectories(): void {
  const dirs = [
    config.storage.dataDir,
    config.storage.configDir,
    config.storage.chartOutputDir,
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Token file path
export const TOKEN_FILE_PATH = path.join(config.storage.configDir, 'tokens.json');
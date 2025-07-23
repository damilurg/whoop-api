import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${new Date().toISOString()} - ${message}`), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue(`[INFO] ${new Date().toISOString()} - ${message}`), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.log(chalk.yellow(`[WARN] ${new Date().toISOString()} - ${message}`), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.log(chalk.red(`[ERROR] ${new Date().toISOString()} - ${message}`), ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    console.log(chalk.green(`[SUCCESS] ${new Date().toISOString()} - ${message}`), ...args);
  }

  agent(agentName: string, message: string, ...args: any[]): void {
    console.log(chalk.cyan(`[${agentName.toUpperCase()}] ${new Date().toISOString()} - ${message}`), ...args);
  }
}

export const logger = new Logger();
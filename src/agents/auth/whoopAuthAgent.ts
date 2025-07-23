import axios from 'axios';
import fs from 'fs';
import { createServer } from 'http';
import { URL } from 'url';
import inquirer from 'inquirer';
import { config, TOKEN_FILE_PATH, ensureDirectories } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { WhoopTokens, WhoopError } from '../../models/whoop.js';

export class WhoopAuthAgent {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly apiBaseUrl: string;

  constructor() {
    this.clientId = config.whoop.clientId;
    this.clientSecret = config.whoop.clientSecret;
    this.redirectUri = config.whoop.redirectUri;
    this.apiBaseUrl = config.whoop.apiBaseUrl;
  }

  /**
   * Generate OAuth2 authorization URL
   */
  private generateAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'read:recovery read:sleep read:workout read:cycles read:body_measurement read:profile',
      state: 'whoop-analytics-agent',
    });

    return `https://api.prod.whoop.com/oauth/oauth2/auth/?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<WhoopTokens> {
    logger.agent('AUTH', 'Exchanging authorization code for tokens...');

    try {
      const response = await axios.post(
        'https://api.prod.whoop.com/oauth/oauth2/token/',
        {
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
          redirect_uri: this.redirectUri,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokens: WhoopTokens = {
        ...response.data,
        expires_at: Date.now() + (response.data.expires_in * 1000),
      };

      logger.success('Tokens obtained successfully');
      return tokens;
    } catch (error: any) {
      if (error.response?.data) {
        const whoopError: WhoopError = error.response.data;
        throw new Error(`WHOOP API Error: ${whoopError.error} - ${whoopError.error_description}`);
      }
      throw new Error(`Failed to exchange code for tokens: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<WhoopTokens> {
    logger.agent('AUTH', 'Refreshing access token...');

    try {
      const response = await axios.post(
        'https://api.prod.whoop.com/oauth/oauth2/token/',
        {
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokens: WhoopTokens = {
        ...response.data,
        expires_at: Date.now() + (response.data.expires_in * 1000),
      };

      logger.success('Tokens refreshed successfully');
      return tokens;
    } catch (error: any) {
      if (error.response?.data) {
        const whoopError: WhoopError = error.response.data;
        throw new Error(`WHOOP API Error: ${whoopError.error} - ${whoopError.error_description}`);
      }
      throw new Error(`Failed to refresh tokens: ${error.message}`);
    }
  }

  /**
   * Save tokens to file
   */
  private async saveTokens(tokens: WhoopTokens): Promise<void> {
    ensureDirectories();
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokens, null, 2));
    logger.success(`Tokens saved to ${TOKEN_FILE_PATH}`);
  }

  /**
   * Load tokens from file
   */
  loadTokens(): WhoopTokens | null {
    try {
      if (!fs.existsSync(TOKEN_FILE_PATH)) {
        return null;
      }
      const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf8'));
      return tokens as WhoopTokens;
    } catch (error) {
      logger.error('Failed to load tokens from file');
      return null;
    }
  }

  /**
   * Check if current tokens are valid
   */
  isTokenValid(tokens: WhoopTokens): boolean {
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() < (tokens.expires_at - bufferTime);
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = this.loadTokens();
    
    if (!tokens) {
      throw new Error('No tokens found. Please run authentication first.');
    }

    if (this.isTokenValid(tokens)) {
      return tokens.access_token;
    }

    logger.agent('AUTH', 'Token expired, refreshing...');
    const newTokens = await this.refreshTokens(tokens.refresh_token);
    await this.saveTokens(newTokens);
    return newTokens.access_token;
  }

  /**
   * Start OAuth2 flow with local server
   */
  private async startAuthServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost:3000`);
        
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          
          if (error) {
            res.end(`<h1>Error: ${error}</h1><p>Authorization failed. You can close this window.</p>`);
            reject(new Error(`Authorization error: ${error}`));
            return;
          }

          if (code) {
            res.end('<h1>Success!</h1><p>Authorization successful. You can close this window.</p>');
            server.close();
            resolve(code);
            return;
          }

          res.end('<h1>Error</h1><p>No authorization code received.</p>');
          reject(new Error('No authorization code received'));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(3000, () => {
        logger.agent('AUTH', 'Authorization server started on http://localhost:3000');
      });

      server.on('error', (err) => {
        reject(new Error(`Server error: ${err.message}`));
      });
    });
  }

  /**
   * Manual authorization flow (for environments without local server)
   */
  private async manualAuthFlow(): Promise<string> {
    const authUrl = this.generateAuthUrl();
    
    console.log('\n' + '='.repeat(80));
    console.log('MANUAL AUTHORIZATION REQUIRED');
    console.log('='.repeat(80));
    console.log('\n1. Open this URL in your browser:');
    console.log(`   ${authUrl}`);
    console.log('\n2. Authorize the application');
    console.log('3. Copy the authorization code from the redirect URL');
    console.log('   (it will be in the URL parameter "code=...")');
    console.log('\n' + '='.repeat(80) + '\n');

    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Enter the authorization code:',
        validate: (input: string) => {
          return input.trim().length > 0 || 'Authorization code is required';
        }
      }
    ]);

    return code.trim();
  }

  /**
   * Main authentication method
   */
  async authenticate(useManualFlow: boolean = false): Promise<WhoopTokens> {
    logger.agent('AUTH', 'Starting WHOOP API authentication...');

    // Check if we already have valid tokens
    const existingTokens = this.loadTokens();
    if (existingTokens && this.isTokenValid(existingTokens)) {
      logger.success('Valid tokens already exist');
      return existingTokens;
    }

    try {
      let authCode: string;

      if (useManualFlow) {
        authCode = await this.manualAuthFlow();
      } else {
        const authUrl = this.generateAuthUrl();
        console.log(`\nPlease open this URL in your browser to authorize the application:`);
        console.log(`${authUrl}\n`);
        
        authCode = await this.startAuthServer();
      }

      const tokens = await this.exchangeCodeForTokens(authCode);
      await this.saveTokens(tokens);
      
      logger.success('Authentication completed successfully!');
      return tokens;

    } catch (error: any) {
      logger.error(`Authentication failed: ${error.message}`);
      throw error;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new WhoopAuthAgent();
  
  // Check for manual flow flag
  const useManualFlow = process.argv.includes('--manual');
  
  agent.authenticate(useManualFlow)
    .then(() => {
      logger.success('✅ WHOOP API authentication completed!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Authentication failed: ${error.message}`);
      process.exit(1);
    });
}
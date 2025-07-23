import axios, { AxiosResponse } from 'axios';
import { promises as fs } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { Agent } from '../base/agent';
import { WhoopTokens, WhoopError, WhoopUser, BodyMeasurements } from '../../models/whoop';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import * as readline from 'readline';

export class WhoopAuthAgent extends Agent {
  private readonly API_BASE_URL = 'https://api.prod.whoop.com';
  private readonly REDIRECT_URI = 'http://localhost:3000/callback';
  private readonly SCOPES = [
    'read:profile',
    'read:body_measurement', 
    'read:cycles',
    'read:recovery',
    'read:sleep',
    'read:workout'
  ];

  constructor() {
    super('WhoopAuth', new Logger('WhoopAuth'));
  }

  /**
   * Main authentication flow - attempts to load existing tokens or start OAuth flow
   */
  async authenticate(): Promise<WhoopTokens> {
    this.logger.info('🔐 Starting WHOOP authentication process...');

    try {
      // Try to load existing valid tokens
      const existingTokens = await this.loadTokens();
      if (existingTokens && await this.validateTokens(existingTokens)) {
        this.logger.success('✅ Using existing valid tokens');
        return existingTokens;
      }

      // Try to refresh if we have refresh token
      if (existingTokens?.refresh_token) {
        this.logger.info('🔄 Attempting to refresh tokens...');
        try {
          const refreshedTokens = await this.refreshTokens(existingTokens.refresh_token);
          await this.saveTokens(refreshedTokens);
          this.logger.success('✅ Successfully refreshed tokens');
          return refreshedTokens;
        } catch (error) {
          this.logger.warn('⚠️ Token refresh failed, starting new OAuth flow');
        }
      }

      // Start new OAuth flow
      this.logger.info('🌐 Starting OAuth 2.0 authorization flow...');
      const newTokens = await this.startOAuthFlow();
      await this.saveTokens(newTokens);
      this.logger.success('✅ Successfully completed OAuth flow');
      
      return newTokens;
    } catch (error) {
      this.logger.error('❌ Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Start OAuth 2.0 authorization flow
   */
  private async startOAuthFlow(): Promise<WhoopTokens> {
    const state = this.generateState();
    const authUrl = this.buildAuthUrl(state);
    
    this.logger.info('📱 Please visit the following URL to authorize the application:');
    this.logger.info(`🔗 ${authUrl}`);
    
    // Try to start local server first, fallback to manual input
    try {
      const authCode = await this.startLocalServer(state);
      return await this.exchangeCodeForTokens(authCode);
    } catch (serverError) {
      this.logger.warn('⚠️ Local server failed, using manual code input');
      return await this.manualCodeInput(state);
    }
  }

  /**
   * Build OAuth authorization URL
   */
  private buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.whoop.clientId,
      redirect_uri: this.REDIRECT_URI,
      response_type: 'code',
      scope: this.SCOPES.join(' '),
      state: state
    });

    return `${this.API_BASE_URL}/oauth/oauth2/auth?${params.toString()}`;
  }

  /**
   * Start local HTTP server to capture OAuth callback
   */
  private async startLocalServer(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url) {
          const urlParts = parse(req.url, true);
          
          if (urlParts.pathname === '/callback') {
            const { code, state, error } = urlParts.query;
            
            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`<h1>Authorization Error</h1><p>${error}</p>`);
              server.close();
              reject(new Error(`OAuth error: ${error}`));
              return;
            }
            
            if (state !== expectedState) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Invalid State</h1><p>State parameter mismatch</p>');
              server.close();
              reject(new Error('State parameter mismatch'));
              return;
            }
            
            if (code && typeof code === 'string') {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <h1>✅ Authorization Successful!</h1>
                <p>You can close this window and return to your terminal.</p>
                <script>window.close();</script>
              `);
              server.close();
              resolve(code);
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Missing Authorization Code</h1>');
              server.close();
              reject(new Error('No authorization code received'));
            }
          }
        }
      });

      server.listen(3000, () => {
        this.logger.info('🌐 Local server started on http://localhost:3000');
        this.logger.info('⏳ Waiting for OAuth callback...');
      });

      server.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timeout - no callback received within 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Manual code input fallback
   */
  private async manualCodeInput(expectedState: string): Promise<WhoopTokens> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      rl.question('📝 Please enter the authorization code from the callback URL: ', async (code) => {
        rl.close();
        
        try {
          const tokens = await this.exchangeCodeForTokens(code.trim());
          resolve(tokens);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<WhoopTokens> {
    this.logger.info('🔄 Exchanging authorization code for tokens...');
    
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.whoop.clientId,
      client_secret: config.whoop.clientSecret,
      redirect_uri: this.REDIRECT_URI,
      code: code
    });

    try {
      const response: AxiosResponse = await axios.post(
        `${this.API_BASE_URL}/oauth/oauth2/token`,
        data,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokens: WhoopTokens = {
        ...response.data,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      this.logger.success('✅ Successfully obtained access tokens');
      return tokens;
    } catch (error: any) {
      this.logger.error('❌ Failed to exchange code for tokens:', error.response?.data || error.message);
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access tokens using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<WhoopTokens> {
    this.logger.info('🔄 Refreshing access tokens...');
    
    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.whoop.clientId,
      client_secret: config.whoop.clientSecret,
      refresh_token: refreshToken
    });

    try {
      const response: AxiosResponse = await axios.post(
        `${this.API_BASE_URL}/oauth/oauth2/token`,
        data,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokens: WhoopTokens = {
        ...response.data,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      this.logger.success('✅ Successfully refreshed tokens');
      return tokens;
    } catch (error: any) {
      this.logger.error('❌ Failed to refresh tokens:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Validate tokens by making a test API call
   */
  private async validateTokens(tokens: WhoopTokens): Promise<boolean> {
    if (!tokens.access_token || Date.now() >= tokens.expires_at) {
      return false;
    }

    try {
      await axios.get(`${this.API_BASE_URL}/developer/v2/user/profile/basic`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(tokens: WhoopTokens): Promise<WhoopUser> {
    this.logger.info('👤 Fetching user profile...');
    
    try {
      const response: AxiosResponse<WhoopUser> = await axios.get(
        `${this.API_BASE_URL}/developer/v2/user/profile/basic`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success(`✅ Retrieved profile for ${response.data.first_name} ${response.data.last_name}`);
      return response.data;
    } catch (error: any) {
      this.logger.error('❌ Failed to fetch user profile:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user body measurements
   */
  async getBodyMeasurements(tokens: WhoopTokens): Promise<BodyMeasurements> {
    this.logger.info('📏 Fetching body measurements...');
    
    try {
      const response: AxiosResponse<BodyMeasurements> = await axios.get(
        `${this.API_BASE_URL}/developer/v2/user/measurement/body`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        }
      );

      this.logger.success('✅ Retrieved body measurements');
      return response.data;
    } catch (error: any) {
      this.logger.error('❌ Failed to fetch body measurements:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Save tokens to file
   */
  private async saveTokens(tokens: WhoopTokens): Promise<void> {
    try {
      await fs.writeFile(config.tokenFilePath, JSON.stringify(tokens, null, 2));
      this.logger.info('💾 Tokens saved successfully');
    } catch (error) {
      this.logger.error('❌ Failed to save tokens:', error);
      throw error;
    }
  }

  /**
   * Load tokens from file
   */
  private async loadTokens(): Promise<WhoopTokens | null> {
    try {
      const data = await fs.readFile(config.tokenFilePath, 'utf-8');
      const tokens: WhoopTokens = JSON.parse(data);
      this.logger.info('📁 Loaded existing tokens');
      return tokens;
    } catch (error) {
      this.logger.info('📁 No existing tokens found');
      return null;
    }
  }

  /**
   * Generate random state parameter for OAuth security
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Test API connectivity and authentication
   */
  async testConnection(tokens: WhoopTokens): Promise<boolean> {
    this.logger.info('🔍 Testing API connection...');
    
    try {
      const profile = await this.getUserProfile(tokens);
      const measurements = await this.getBodyMeasurements(tokens);
      
      this.logger.success('✅ API connection test successful');
      this.logger.info(`Connected as: ${profile.first_name} ${profile.last_name} (${profile.email})`);
      this.logger.info(`Height: ${measurements.height_meter}m, Weight: ${measurements.weight_kilogram}kg`);
      
      return true;
    } catch (error) {
      this.logger.error('❌ API connection test failed');
      return false;
    }
  }

  /**
   * Revoke tokens (logout)
   */
  async revoke(tokens: WhoopTokens): Promise<void> {
    this.logger.info('🚪 Revoking access tokens...');
    
    try {
      await axios.post(
        `${this.API_BASE_URL}/oauth/oauth2/revoke`,
        new URLSearchParams({
          token: tokens.access_token,
          client_id: config.whoop.clientId,
          client_secret: config.whoop.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Delete local token file
      try {
        await fs.unlink(config.tokenFilePath);
      } catch {}

      this.logger.success('✅ Successfully revoked tokens');
    } catch (error: any) {
      this.logger.error('❌ Failed to revoke tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * BLE Integration Methods
   */

  /**
   * Get BLE device pairing information (placeholder for future implementation)
   */
  async getBLEPairingInfo(): Promise<{ uuid: string; name: string; characteristics: string[] }> {
    this.logger.info('📡 Getting BLE device information...');
    
    // Based on reverse engineering research
    return {
      uuid: 'WHOOP-4.0', // Device name pattern
      name: 'WHOOP 4.0',
      characteristics: [
        '61080002-8d6d-82b8-614a-1c8cb0f8dcc6', // Main data characteristic
        '61080003-8d6d-82b8-614a-1c8cb0f8dcc6', // Heart rate data
        '61080004-8d6d-82b8-614a-1c8cb0f8dcc6', // Motion data
        '61080005-8d6d-82b8-614a-1c8cb0f8dcc6', // Environmental data
      ]
    };
  }

  /**
   * Check if BLE integration is supported
   */
  isBLESupported(): boolean {
    // Check if we're in a Node.js environment that supports BLE
    try {
      require('noble');
      return true;
    } catch {
      this.logger.warn('⚠️ BLE support not available - noble package not installed');
      return false;
    }
  }

  /**
   * Initialize BLE connection (placeholder for future implementation)
   */
  async initializeBLE(): Promise<boolean> {
    if (!this.isBLESupported()) {
      return false;
    }

    this.logger.info('📡 Initializing BLE connection...');
    
    // This would be implemented with the BLE agent
    // For now, return false to indicate BLE is not yet implemented
    this.logger.warn('⚠️ BLE integration coming in future iteration');
    return false;
  }

  /**
   * Get current authentication status
   */
  async getAuthStatus(): Promise<{
    authenticated: boolean;
    user?: WhoopUser;
    measurements?: BodyMeasurements;
    tokenExpiry?: string;
    bleSupported: boolean;
    bleConnected: boolean;
  }> {
    try {
      const tokens = await this.loadTokens();
      if (!tokens || !await this.validateTokens(tokens)) {
        return {
          authenticated: false,
          bleSupported: this.isBLESupported(),
          bleConnected: false
        };
      }

      const [user, measurements] = await Promise.all([
        this.getUserProfile(tokens),
        this.getBodyMeasurements(tokens)
      ]);

      return {
        authenticated: true,
        user,
        measurements,
        tokenExpiry: new Date(tokens.expires_at).toISOString(),
        bleSupported: this.isBLESupported(),
        bleConnected: await this.initializeBLE()
      };
    } catch (error) {
      return {
        authenticated: false,
        bleSupported: this.isBLESupported(),
        bleConnected: false
      };
    }
  }
}
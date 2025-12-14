import axios, { AxiosError } from 'axios';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { efecteConfig, getApiUrl } from '../utils/config.js';
import { ApiResponse, ApiException } from '../types/efecte.js';

export class AuthManager {
  private tokenCache: Cache<string>;
  private tokenExpiresAt: number = 0;
  private authPromise: Promise<string> | null = null; // Prevent concurrent auth requests

  constructor() {
    this.tokenCache = new Cache<string>('auth-token');
  }

  async getToken(): Promise<string> {
    const cachedToken = this.tokenCache.get('token');
    
    if (cachedToken && this.tokenExpiresAt > Date.now() + efecteConfig.security.tokenRefreshThreshold * 1000) {
      logger.debug('Using cached authentication token');
      return cachedToken;
    }

    // If authentication is already in progress, wait for it
    if (this.authPromise) {
      logger.debug('Authentication already in progress, waiting...');
      return await this.authPromise;
    }

    logger.info('Fetching new authentication token');
    this.authPromise = this.authenticate().finally(() => {
      // Clear the promise when done (success or failure)
      this.authPromise = null;
    });
    
    return await this.authPromise;
  }

  async authenticate(): Promise<string> {
    const startTime = Date.now();
    
    try {
      const formData = new URLSearchParams();
      formData.append('login', efecteConfig.username);
      formData.append('password', efecteConfig.password);

      const response = await axios.post<ApiResponse>(
        getApiUrl('users/login'),
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: efecteConfig.timeout,
        }
      );

      const token = response.data.token || response.headers['authorization'];
      
      if (!token) {
        throw new Error('No token received from authentication endpoint');
      }

      const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      
      this.tokenCache.set('token', bearerToken, efecteConfig.caching.authTokenTTL);
      this.tokenExpiresAt = Date.now() + efecteConfig.caching.authTokenTTL;

      logger.performance('authenticate', Date.now() - startTime);
      logger.info('Authentication successful');
      
      return bearerToken;
    } catch (error) {
      logger.error('Authentication failed', error);
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiException>;
        if (axiosError.response?.status === 401) {
          throw new Error('Invalid credentials');
        }
        throw new Error(`Authentication failed: ${axiosError.message}`);
      }
      
      throw error;
    }
  }

  clearToken(): void {
    this.tokenCache.delete('token');
    this.tokenExpiresAt = 0;
    this.authPromise = null; // Cancel any pending auth
    logger.info('Authentication token cleared');
  }

  isAuthenticated(): boolean {
    return this.tokenCache.get('token') !== null && this.tokenExpiresAt > Date.now();
  }
}
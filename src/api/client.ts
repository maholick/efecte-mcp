import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import FormData from 'form-data';
import { AuthManager } from './auth.js';
import { logger } from '../utils/logger.js';
import { efecteConfig, getApiUrl } from '../utils/config.js';
import { ApiException } from '../types/efecte.js';

export class EfecteApiClient {
  private client: AxiosInstance;
  private authManager: AuthManager;

  constructor() {
    this.authManager = new AuthManager();
    
    this.client = axios.create({
      timeout: efecteConfig.timeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      async (config) => {
        if (config.url && !config.url.includes('/users/login') && !config.url.includes('/echo')) {
          const token = await this.authManager.getToken();
          config.headers['Authorization'] = token;
        }
        
        // Ensure timeout is set (use config timeout or default)
        if (!config.timeout) {
          config.timeout = efecteConfig.timeout;
        }
        
        logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
          timeout: config.timeout,
        });
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      async (error: AxiosError<ApiException>) => {
        const requestUrl = error.config?.url || 'unknown';
        const requestMethod = error.config?.method?.toUpperCase() || 'UNKNOWN';
        
        // Handle timeout errors
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          const timeout = error.config?.timeout || efecteConfig.timeout;
          logger.error(`API Request timeout: ${requestMethod} ${requestUrl}`, {
            timeout: `${timeout}ms`,
            message: `Request exceeded timeout of ${timeout}ms`,
          });
          
          const timeoutError = new Error(
            `Request to ${requestUrl} timed out after ${timeout}ms. The server may be slow or unreachable.`
          );
          (timeoutError as any).code = 'ETIMEDOUT';
          (timeoutError as any).isTimeout = true;
          return Promise.reject(timeoutError);
        }
        
        // Handle network errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
          logger.error(`API Network error: ${requestMethod} ${requestUrl}`, {
            code: error.code,
            message: error.message,
          });
          
          const networkError = new Error(
            `Network error connecting to ${requestUrl}: ${error.message}. Please check your connection and server availability.`
          );
          (networkError as any).code = error.code;
          (networkError as any).isNetworkError = true;
          return Promise.reject(networkError);
        }
        
        if (error.response) {
          logger.error(`API Error: ${error.response.status} ${requestUrl}`, {
            status: error.response.status,
            data: error.response.data,
          });

          if (error.response.status === 401 && !error.config?.url?.includes('/users/login')) {
            logger.info('Token expired, re-authenticating...');
            this.authManager.clearToken();
            
            if (error.config && !error.config.headers['X-Retry']) {
              error.config.headers['X-Retry'] = 'true';
              const token = await this.authManager.getToken();
              error.config.headers['Authorization'] = token;
              return this.client.request(error.config);
            }
          }
        } else {
          logger.error(`API Request failed: ${requestMethod} ${requestUrl}`, {
            code: error.code,
            message: error.message,
          });
        }
        
        return Promise.reject(error);
      }
    );
  }

  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(getApiUrl(path), config);
    return response.data;
  }

  async post<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(getApiUrl(path), data, config);
    return response.data;
  }

  async put<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(getApiUrl(path), data, config);
    return response.data;
  }

  async patch<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(getApiUrl(path), data, config);
    return response.data;
  }

  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(getApiUrl(path), config);
    return response.data;
  }

  async uploadFile(path: string, file: Buffer, fileName: string, mimeType?: string, timeout?: number): Promise<any> {
    const formData = new FormData();
    formData.append('fileUpload', file, {
      filename: fileName,
      contentType: mimeType || 'application/octet-stream',
    });
    formData.append('fileName', fileName);

    // Use longer timeout for file uploads if not specified
    const uploadTimeout = timeout || efecteConfig.timeout * 3; // 3x default timeout for uploads

    const response = await this.client.post(getApiUrl(path), formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: uploadTimeout,
    });
    
    return response.data;
  }

  async downloadFile(path: string, timeout?: number): Promise<Buffer> {
    // Use longer timeout for file downloads if not specified
    const downloadTimeout = timeout || efecteConfig.timeout * 3; // 3x default timeout for downloads
    
    const response = await this.client.get(getApiUrl(path), {
      responseType: 'arraybuffer',
      timeout: downloadTimeout,
    });
    
    return Buffer.from(response.data);
  }

  getAuthManager(): AuthManager {
    return this.authManager;
  }
}

export const apiClient = new EfecteApiClient();
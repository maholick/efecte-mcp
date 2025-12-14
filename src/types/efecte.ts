export interface ApiResponse {
  code: number;
  message: string;
  timestamp: string;
  token?: string;
}

export interface ApiException {
  code: number;
  message?: string;
  error: string;
  url: string;
  timestamp: string;
}

export interface DataCardInfoElement {
  dataCardId: string;
  name: string;
  url: string;
}

export interface RESTError {
  attributeCode?: string;
  attributeType?: string;
  message: string;
  error: string;
}

export interface RESTMetaData {
  timestamp: string;
  url: string;
  errors?: RESTError[];
  createdReferences?: CreatedReference[];
  importResult?: ImportResult;
}

export interface ImportResult {
  handledDataCards: number;
  savedDataCards: number;
  notSavedDataCards: number;
}

export interface CreatedReference {
  dataCard: DataCardInfoElement;
  errors?: RESTError[];
}

export interface RESTDataCardResponse {
  meta: RESTMetaData;
  dataCard?: RESTPaginatedData;
}

export interface RESTPaginatedData {
  dataCardId: string;
  [key: string]: any;
}

export interface PaginationMetaInfo {
  count: number;
  limit: number;
  links?: {
    next?: string;
    [key: string]: string | undefined;
  };
}

export interface RESTPaginatedDataCardsInfo {
  meta: PaginationMetaInfo;
  data: DataCardInfoElement[];
}

export interface RESTDataCardElement {
  name?: string;
  type: 'string' | 'number' | 'date' | 'worklog' | 'reference' | 'external-reference' | 'static-value';
  values: RESTValueElement[];
}

export interface RESTValueElement {
  value?: any;
  code?: string;
  name?: string;
  dataCardId?: string;
  templateName?: string;
  templateCode?: string;
  location?: string;
  download?: string;
  author?: string;
  date?: string;
  url?: string;
  hidden?: boolean;
  deleted?: boolean;
}

export interface RESTDataCard {
  name?: string;
  dataCardId?: string;
  templateName?: string;
  templateCode: string;
  templateId?: string;
  folderName?: string;
  folderCode: string;
  data: {
    [key: string]: RESTDataCardElement;
  };
  hidden?: boolean;
  deleted?: boolean;
}

export interface RESTDataCardCreateRequest {
  folderCode: string;
  data?: {
    [key: string]: {
      values: RESTValueElement[];
    };
  };
}

export interface RESTDataCardModifyRequest {
  dataCardId: string;
  folderCode?: string;
  data?: {
    [key: string]: {
      values: RESTValueElement[];
    };
  };
}

export interface RESTTemplateInfoElement {
  name: string;
  templateCode: string;
  url: string;
}

export interface RESTAttribute {
  name: string;
  multiValue: boolean;
  type: string;
  file?: boolean;
  values?: RESTStaticValueInfo[];
  target?: string[];
}

export interface RESTStaticValueInfo {
  code: string;
  value: any;
}

export interface RESTFolderInfo {
  folderName: string;
  folderCode: string;
}

export interface RESTTemplateInfo {
  name: string;
  code: string;
  allowedFolders: RESTFolderInfo[];
  attributes: {
    [key: string]: RESTAttribute;
  };
}

export interface EfecteConfig {
  baseUrl: string;
  apiPath: string;
  username: string;
  password: string;
  timeout: number;
  caching: {
    templatesTTL: number;
    authTokenTTL: number;
  };
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };
  transport: {
    default: 'stdio' | 'http';
    http: {
      enabled: boolean;
      port: number;
      host: string;
      allowedOrigins?: string[];
      sessionTimeout?: number;
    };
  };
  logging: {
    level: string;
    enableStructured: boolean;
    enablePerformanceMetrics: boolean;
  };
  security: {
    enableAuditLogging: boolean;
    maxRequestsPerMinute: number;
    tokenRefreshThreshold: number;
  };
}
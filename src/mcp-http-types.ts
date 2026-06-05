export interface HttpToken {
  token: string;
  subject: string;
  audience: string;
  scopes: string[];
  issuer?: string;
  expiresAt?: string;
}

export interface HttpConfig {
  host: string;
  port: number;
  endpointPath: string;
  resource: string;
  authorizationServers: string[];
  allowedOrigins: string[];
  allowedHosts: string[];
  rateLimitPerMinute: number;
  maxBodyBytes: number;
  root: string;
  tokens: HttpToken[];
}

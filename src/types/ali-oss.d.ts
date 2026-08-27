/* ============================================================
 * ali-oss 最小类型声明（官方包未内置完整类型）
 * 只声明本项目用到的 API：构造、signatureUrl、head、delete、list
 * ============================================================ */

declare module "ali-oss" {
  export interface OSSOptions {
    region?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    bucket?: string;
    stsToken?: string;
    [key: string]: unknown;
  }

  export interface SignUrlOptions {
    method?: string;
    expires?: number;
    "Content-Type"?: string;
    [key: string]: unknown;
  }

  export interface HeadResult {
    status?: number;
    headers?: Record<string, string>;
    meta?: Record<string, unknown>;
    res?: { headers?: Record<string, string>; [k: string]: unknown };
    [key: string]: unknown;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    /** 生成预签名 URL（method 支持 GET/PUT） */
    signatureUrl(name: string, options?: SignUrlOptions): string;
    head(name: string): Promise<HeadResult>;
    delete(name: string): Promise<unknown>;
    list(query?: Record<string, unknown>): Promise<{ objects?: unknown[]; [k: string]: unknown }>;
  }
}

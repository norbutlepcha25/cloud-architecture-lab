import type { Runtime } from '../services/operations.ts';
export interface OperationSettings { action: string; callerId?: string; resource: Record<string, any>; request: Record<string, any> }
export interface OperationOutput { response: Record<string, unknown>; runtime?: Runtime; code?: number; notes?: string[] }
export class OperationError extends Error { code: number; constructor(code: number, message: string) { super(message); this.code = code; } }
export const reject = (message: string): never => { throw new OperationError(400, message); };
export const unsupported = (message: string): never => { throw new OperationError(501, message); };
export const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
export const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseObject(value: unknown, field: string): Record<string, any> {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (object(parsed)) return parsed; } catch { /* specific error below */ }
  return reject(`${field} must be a JSON object.`);
}

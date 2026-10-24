/**
 * @file TenantResolutionService.ts
 * @description Pre-Authentication Tenant Resolution Service for A.N ERP (v7.2)
 * Strictly implements Section 2.3 of docs/tenant-resolution-policy.md:
 * Resolves tenant via:
 * 1. Explicit body payload: req.body.tenantCode || req.body.tenantId
 * 2. Request header: req.headers['x-tenant-code'] || req.headers['x-tenant-id']
 * 3. Subdomain extracted from Host header: e.g. tenant1.an-erp.sa or tenant1.localhost
 *
 * Rejects silent fallbacks (400 if missing, 404 if unknown tenant).
 */

import { Request } from 'express';
import { StoragePort, TenantCompany, RFC7807Problem } from '../storage/StoragePort';

export class TenantResolutionService {
  /**
   * Extracts tenant subdomain from Host header (or hostname).
   * Examples:
   * - "tenant1.an-erp.sa" -> "tenant1"
   * - "tenant1.localhost:3000" -> "tenant1"
   * - "tenant-corp.an-erp.com" -> "tenant-corp"
   * Returns null for direct IP addresses, plain "localhost", or missing host.
   */
  public static extractSubdomainFromHost(rawHost?: string): string | null {
    if (!rawHost) return null;
    const hostWithoutPort = rawHost.split(':')[0].trim().toLowerCase();

    // Skip IP addresses
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostWithoutPort)) return null;
    // Skip plain localhost
    if (hostWithoutPort === 'localhost') return null;

    const parts = hostWithoutPort.split('.');
    if (parts.length >= 2) {
      // e.g. "tenant1.localhost" -> parts = ["tenant1", "localhost"]
      if (parts[parts.length - 1] === 'localhost' && parts.length === 2) {
        return parts[0];
      }
      // e.g. "tenant1.an-erp.sa" (3 parts) -> parts[0] is "tenant1"
      if (parts.length >= 3) {
        // If prefixed by www/api/app, check if next part is the tenant
        if (parts[0] === 'www' || parts[0] === 'api' || parts[0] === 'app') {
          return parts.length > 3 ? parts[1] : null;
        }
        return parts[0];
      }
    }
    return null;
  }

  /**
   * Extracts the raw tenant identifier from request in priority order:
   * 1. req.body.tenantCode || req.body.tenantId
   * 2. req.headers['x-tenant-code'] || req.headers['x-tenant-id']
   * 3. Subdomain from Host header
   */
  public static extractTenantIdentifier(req: Request): string | null {
    // 1. JSON Body
    const bodyIdentifier = (req.body?.tenantCode || req.body?.tenantId)?.toString().trim();
    if (bodyIdentifier) return bodyIdentifier;

    // 2. HTTP Headers
    const headerIdentifier = (
      (req.headers['x-tenant-code'] || req.headers['x-tenant-id']) as string
    )?.trim();
    if (headerIdentifier) return headerIdentifier;

    // 3. Subdomain from Host
    const host = (req.headers['host'] || req.hostname || '') as string;
    const subdomain = this.extractSubdomainFromHost(host);
    if (subdomain) return subdomain;

    return null;
  }

  /**
   * Resolves tenant against masterStorage registry without silent fallback.
   * Returns RFC 7807 problem details if missing (400) or not found (404).
   */
  public static async resolveTenantFromRequest(
    masterStorage: StoragePort,
    req: Request
  ): Promise<{ success: boolean; tenant?: TenantCompany; error?: RFC7807Problem }> {
    const identifier = this.extractTenantIdentifier(req);

    if (!identifier) {
      return {
        success: false,
        error: {
          type: 'https://api.an-erp.local/errors/missing-tenant-identifier',
          title: 'معرف المنشأة إلزامي',
          status: 400,
          detail: 'رمز المنشأة أو المستأجر إلزامي لحسم بيئة العمل (البند 4.6C والبند 2 من سياسة حسم المستأجر).',
        },
      };
    }

    // Lookup by ID first
    const directRes = await masterStorage.getTenant(identifier);
    if (directRes.success && directRes.data) {
      if (directRes.data.status !== 'ACTIVE') {
        return {
          success: false,
          error: {
            type: 'https://api.an-erp.local/errors/tenant-inactive',
            title: 'المنشأة موقوفة',
            status: 403,
            detail: `المنشأة ذات الرمز أو المعرف (${identifier}) موقوفة حالياً ولا يمكن الوصول إليها.`,
          },
        };
      }
      return { success: true, tenant: directRes.data };
    }

    // Lookup by code or case-insensitive ID in tenants list
    const allRes = await masterStorage.listTenants();
    if (allRes.success && allRes.data) {
      const match = allRes.data.find(
        (t) =>
          t.id.toLowerCase() === identifier.toLowerCase() ||
          t.code?.toLowerCase() === identifier.toLowerCase()
      );
      if (match) {
        if (match.status !== 'ACTIVE') {
          return {
            success: false,
            error: {
              type: 'https://api.an-erp.local/errors/tenant-inactive',
              title: 'المنشأة موقوفة',
              status: 403,
              detail: `المنشأة ذات الرمز أو المعرف (${identifier}) موقوفة حالياً ولا يمكن الوصول إليها.`,
            },
          };
        }
        return { success: true, tenant: match };
      }
    }

    return {
      success: false,
      error: {
        type: 'https://api.an-erp.local/errors/tenant-not-found',
        title: 'المنشأة غير مسجلة',
        status: 404,
        detail: `المنشأة ذات الرمز أو المعرف (${identifier}) غير مسجلة بالنظام.`,
      },
    };
  }
}

import { auth } from '../firebase';
import { AppUser } from '../types';

export interface ProvisioningResult<T = any> {
  success: boolean;
  user?: T;
  temporaryPassword?: string;
  message?: string;
}

export interface CreateManagedUserPayload {
  email: string;
  name?: string;
  full_name?: string;
  username?: string;
  role: string;
  company_id?: string;
  region_id?: string | null;
  station_id?: string | null;
  org_unit_id?: string | null;
  assigned_org_unit_ids?: string[];
  permissions?: any;
  custom_roles?: string[];
  password?: string;
  must_change_password?: boolean;
}

export interface UpdateManagedUserPayload {
  name?: string;
  full_name?: string;
  username?: string;
  role?: string;
  company_id?: string;
  region_id?: string | null;
  station_id?: string | null;
  org_unit_id?: string | null;
  assigned_org_unit_ids?: string[];
  permissions?: any;
  custom_roles?: string[];
  is_active?: boolean;
  password?: string;
  must_change_password?: boolean;
}

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[getAuthHeaders] Could not acquire ID token:', err);
  }
  return headers;
};

/**
 * Creates a new managed user via the secure backend provisioning API.
 * Ensures consistent authentication headers, payload validation, and structured return format.
 */
export async function createManagedUser(payload: CreateManagedUserPayload): Promise<ProvisioningResult<AppUser>> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.message || `Failed to create user (${res.status})`
      };
    }
    return {
      success: true,
      user: data.user,
      temporaryPassword: data.temporaryPassword,
      message: data.message
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network or unexpected error while creating user'
    };
  }
}

/**
 * Updates an existing managed user via the secure backend provisioning API.
 * Supports updating user profiles, access scopes, activation status, and password resets.
 */
export async function updateManagedUser(userId: string, payload: UpdateManagedUserPayload): Promise<ProvisioningResult<AppUser>> {
  try {
    const id = encodeURIComponent(userId);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.message || `Failed to update user (${res.status})`
      };
    }
    return {
      success: true,
      user: data.user,
      message: data.message
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network or unexpected error while updating user'
    };
  }
}

/**
 * Deletes a managed user via the secure backend provisioning API.
 * Reserved for platform administrators with strict privilege checks.
 */
export async function deleteManagedUser(userId: string): Promise<ProvisioningResult<void>> {
  try {
    const id = encodeURIComponent(userId);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.message || `Failed to delete user (${res.status})`
      };
    }
    return {
      success: true,
      message: data.message
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network or unexpected error while deleting user'
    };
  }
}

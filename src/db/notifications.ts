import { Notification } from '../types';
import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { DEFAULT_NOTIFICATIONS } from './defaults';

export class NotificationsModule {
  static getNotifications(): Notification[] {
    return StorageEngine.getStored<Notification[]>('Notifications', DEFAULT_NOTIFICATIONS);
  }

  static async saveNotificationAsync(notification: Notification): Promise<{ success: boolean; error?: string }> {
    const res = await syncWriteWithOfflineFallback('Notifications', notification.id, notification);
    if (!res.success) {
      console.warn(`[saveNotificationAsync] Warning: ${res.error}`);
      return { success: false, error: res.error };
    }

    const notifications = NotificationsModule.getNotifications();
    const index = notifications.findIndex(n => n.id === notification.id);
    if (index > -1) {
      notifications[index] = notification;
    } else {
      notifications.unshift(notification);
    }
    StorageEngine.setStored('Notifications', notifications);
    return { success: true };
  }

  static saveNotification(notification: Notification): void {
    const notifications = NotificationsModule.getNotifications();
    const index = notifications.findIndex(n => n.id === notification.id);
    if (index > -1) {
      notifications[index] = notification;
    } else {
      notifications.unshift(notification);
    }
    StorageEngine.setStored('Notifications', notifications);
    syncWriteWithOfflineFallback('Notifications', notification.id, notification).catch(err => {
      console.warn(`[saveNotification] Background sync warning for notification ${notification.id}:`, err);
    });
  }

  static markNotificationAsRead(id: string): void {
    const notifications = NotificationsModule.getNotifications();
    const notification = notifications.find(n => n.id === id);
    if (notification) {
      notification.is_read = true;
      NotificationsModule.saveNotification(notification);
    }
  }
}

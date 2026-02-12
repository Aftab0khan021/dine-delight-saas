/**
 * Order Notification Service
 * Handles browser notifications and audio alerts for new orders
 */

class OrderNotificationService {
    private audioContext: AudioContext | null = null;
    private permissionGranted: boolean = false;

    constructor() {
        this.ensureAudioContext();
        this.checkPermission();
    }

    /**
     * Lazily create (and reuse) a single AudioContext.
     */
    private ensureAudioContext(): AudioContext | null {
        try {
            if (this.audioContext) return this.audioContext;
            const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctor) return null;
            this.audioContext = new Ctor();
            return this.audioContext;
        } catch (error) {
            console.error('Failed to create AudioContext:', error);
            return null;
        }
    }

    /**
     * Check if notification permission is granted
     */
    private checkPermission() {
        if ('Notification' in window) {
            this.permissionGranted = Notification.permission === 'granted';
        }
    }

    /**
     * Request notification permission from user
     */
    async requestPermission(): Promise<boolean> {
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permissionGranted = true;
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.permissionGranted = permission === 'granted';
            return this.permissionGranted;
        }

        return false;
    }

    /**
     * Play notification sound
     */
    playSound() {
        try {
            const audioContext = this.ensureAudioContext();
            if (!audioContext) return;

            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {
                    // Ignore resume failures; user gesture may be required
                });
            }

            // Use Web Audio API to generate a short beep
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('Failed to play sound:', error);
        }
    }

    /**
     * Show desktop notification
     */
    showNotification(title: string, options?: NotificationOptions) {
        if (!this.permissionGranted) {
            console.warn('Notification permission not granted');
            return null;
        }

        try {
            const notification = new Notification(title, {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                requireInteraction: true,
                ...options,
            });

            // Auto-close after 10 seconds
            setTimeout(() => notification.close(), 10000);

            return notification;
        } catch (error) {
            console.error('Failed to show notification:', error);
            return null;
        }
    }

    /**
     * Notify about a new order
     */
    notifyNewOrder(order: {
        id: string;
        table_label?: string;
        total_cents: number;
        items_count?: number;
    }) {
        // Play sound
        this.playSound();

        // Show desktop notification
        const tableInfo = order.table_label ? ` - Table ${order.table_label}` : '';
        const itemsInfo = order.items_count ? ` (${order.items_count} items)` : '';

        this.showNotification('🔔 New Order Received!', {
            body: `Order #${order.id.slice(0, 8)}${tableInfo}${itemsInfo}\nTotal: $${(order.total_cents / 100).toFixed(2)}`,
            tag: `order-${order.id}`,
            data: { orderId: order.id },
        });
    }

    /**
     * Check if notifications are supported
     */
    isSupported(): boolean {
        return 'Notification' in window;
    }

    /**
     * Get current permission status
     */
    getPermissionStatus(): NotificationPermission {
        return Notification.permission;
    }
}

// Export singleton instance
export const orderNotificationService = new OrderNotificationService();

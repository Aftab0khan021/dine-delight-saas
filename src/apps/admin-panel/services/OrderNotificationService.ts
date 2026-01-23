/**
 * Order Notification Service
 * Handles browser notifications and audio alerts for new orders
 */

class OrderNotificationService {
    private audio: HTMLAudioElement | null = null;
    private permissionGranted: boolean = false;

    constructor() {
        this.initializeAudio();
        this.checkPermission();
    }

    /**
     * Initialize audio element with notification sound
     */
    private initializeAudio() {
        try {
            // Create audio element with data URL (base64 encoded notification sound)
            // Using a simple beep tone generated programmatically
            this.audio = new Audio();

            // Generate a simple notification beep using Web Audio API
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800; // Frequency in Hz
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            // We'll use a simple approach: play system notification sound
            // For a custom sound, you would load an MP3 file
        } catch (error) {
            console.error('Failed to initialize audio:', error);
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
            // Use Web Audio API to generate a beep
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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

'use client';

import { useState, useEffect } from 'react';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.data?.unreadCount || 0);
        setNotifications(json.data?.notifications || []);
      }
    } catch {
      // Ignore background notification fetch errors
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="button button-outline"
        style={{ padding: '0.4rem 0.75rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        id="notification-bell-btn"
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span
            className="badge badge-primary"
            style={{
              borderRadius: '999px',
              padding: '0.1rem 0.4rem',
              fontSize: '0.75rem',
              backgroundColor: 'hsl(var(--danger))',
              color: '#fff',
            }}
            id="unread-count-badge"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: '2.5rem',
            width: '320px',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            padding: '0.75rem',
          }}
          id="notification-dropdown"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
            <span>Notifications</span>
            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.6)' }}>{unreadCount} unread</span>
          </div>

          {notifications.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--foreground) / 0.5)', textAlign: 'center', margin: '1rem 0' }}>
              No notifications yet
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={String(n.id)}
                onClick={() => !n.read && markAsRead(String(n.id))}
                style={{
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: n.read ? 'transparent' : 'hsl(var(--primary) / 0.08)',
                  marginBottom: '0.4rem',
                  cursor: n.read ? 'default' : 'pointer',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{String(n.title || '')}</div>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.7)', marginTop: '0.2rem' }}>{String(n.message || '')}</div>
                <div style={{ fontSize: '0.6875rem', color: 'hsl(var(--foreground) / 0.4)', marginTop: '0.25rem' }}>
                  {new Date(String(n.createdAt || '')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

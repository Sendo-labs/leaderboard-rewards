import { Logger } from './logger.js';

export interface MetricEvent {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface AlertEvent {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  context?: Record<string, any>;
}

export class MonitoringService {
  private metrics: MetricEvent[] = [];
  private alerts: AlertEvent[] = [];
  private readonly maxMetricsHistory = 1000;
  private readonly maxAlertsHistory = 100;

  constructor(private logger: Logger) {}

  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    const event: MetricEvent = {
      name,
      value,
      timestamp: Date.now(),
      tags,
    };

    this.metrics.push(event);
    
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    this.logger.debug(`Metric: ${name}=${value}`, tags);
  }

  alert(level: AlertEvent['level'], message: string, context?: Record<string, any>) {
    const event: AlertEvent = {
      level,
      message,
      timestamp: Date.now(),
      context,
    };

    this.alerts.push(event);
    
    if (this.alerts.length > this.maxAlertsHistory) {
      this.alerts.shift();
    }

    switch (level) {
      case 'critical':
      case 'error':
        this.logger.error(message, context);
        this.sendWebhookAlert(event);
        break;
      case 'warning':
        this.logger.warn(message, context);
        break;
      case 'info':
        this.logger.info(message, context);
        break;
    }
  }

  private async sendWebhookAlert(alert: AlertEvent) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 ${alert.level.toUpperCase()}: ${alert.message}`,
          timestamp: alert.timestamp,
          context: alert.context,
        }),
      });
    } catch (error) {
      this.logger.error('Failed to send webhook alert:', error);
    }
  }

  getMetrics(name?: string, since?: number): MetricEvent[] {
    let filtered = this.metrics;

    if (name) {
      filtered = filtered.filter(m => m.name === name);
    }

    if (since) {
      filtered = filtered.filter(m => m.timestamp >= since);
    }

    return filtered;
  }

  getAlerts(level?: AlertEvent['level'], since?: number): AlertEvent[] {
    let filtered = this.alerts;

    if (level) {
      filtered = filtered.filter(a => a.level === level);
    }

    if (since) {
      filtered = filtered.filter(a => a.timestamp >= since);
    }

    return filtered;
  }

  getStats() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;

    return {
      totalMetrics: this.metrics.length,
      metricsLast24h: this.metrics.filter(m => m.timestamp >= last24h).length,
      totalAlerts: this.alerts.length,
      alertsLast24h: this.alerts.filter(a => a.timestamp >= last24h).length,
      alertsByLevel: {
        info: this.alerts.filter(a => a.level === 'info').length,
        warning: this.alerts.filter(a => a.level === 'warning').length,
        error: this.alerts.filter(a => a.level === 'error').length,
        critical: this.alerts.filter(a => a.level === 'critical').length,
      },
    };
  }

  reset() {
    this.metrics = [];
    this.alerts = [];
  }
}


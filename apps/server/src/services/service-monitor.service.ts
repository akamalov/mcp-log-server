import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import axios from 'axios';

const execAsync = promisify(exec);

export interface ServiceConfig {
  name: string;
  type: 'docker' | 'process' | 'http' | 'port';
  // Docker service config
  containerName?: string;
  dockerImage?: string;
  dockerComposeFile?: string;
  dockerComposeService?: string;
  // Process config
  processName?: string;
  startCommand?: string;
  workingDirectory?: string;
  pidFile?: string;
  // HTTP service config
  healthCheckUrl?: string;
  expectedStatusCode?: number;
  // Port config
  port?: number;
  host?: string;
  // Monitoring config
  healthCheckInterval?: number; // seconds
  maxFailures?: number;
  restartDelay?: number; // seconds
  enabled?: boolean;
  tags?: string[];
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'stopped' | 'starting' | 'unknown';
  lastCheck: Date;
  failureCount: number;
  uptime?: number;
  pid?: number;
  containerId?: string;
  lastError?: string;
  restartCount: number;
  lastRestart?: Date;
  responseTime?: number;
}

export interface MonitoringStats {
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  stoppedServices: number;
  totalRestarts: number;
  avgResponseTime: number;
  uptime: number;
}

export class ServiceMonitorService extends EventEmitter {
  private services = new Map<string, ServiceConfig>();
  private serviceStatuses = new Map<string, ServiceStatus>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();
  private isRunning = false;
  private startTime = new Date();
  private monitoringInterval = 30000; // 30 seconds default
  private logFile?: string;

  constructor(logFile?: string) {
    super();
    this.logFile = logFile;
    this.setupDefaultServices();
  }

  /**
   * Setup default services to monitor
   */
  private setupDefaultServices(): void {
    // Default services for MCP Log Server
    const defaultServices: ServiceConfig[] = [
      {
        name: 'postgresql',
        type: 'docker',
        containerName: 'mcp-postgres',
        dockerComposeFile: 'docker-compose.dev.yml',
        dockerComposeService: 'postgres',
        port: 5432,
        healthCheckInterval: 30,
        maxFailures: 3,
        restartDelay: 10,
        enabled: true,
        tags: ['database', 'critical']
      },
      {
        name: 'clickhouse',
        type: 'docker',
        containerName: 'mcp-clickhouse',
        dockerComposeFile: 'docker-compose.dev.yml',
        dockerComposeService: 'clickhouse',
        port: 8123,
        healthCheckUrl: 'http://localhost:8123/ping',
        expectedStatusCode: 200,
        healthCheckInterval: 30,
        maxFailures: 3,
        restartDelay: 15,
        enabled: true,
        tags: ['database', 'analytics', 'critical']
      },
      {
        name: 'redis',
        type: 'docker',
        containerName: 'mcp-redis',
        dockerComposeFile: 'docker-compose.dev.yml',
        dockerComposeService: 'redis',
        port: 6379,
        healthCheckInterval: 30,
        maxFailures: 3,
        restartDelay: 5,
        enabled: true,
        tags: ['cache', 'session']
      },
      {
        name: 'elasticsearch',
        type: 'docker',
        containerName: 'mcp-elasticsearch',
        dockerComposeFile: 'docker-compose.dev.yml',
        dockerComposeService: 'elasticsearch',
        port: 9200,
        healthCheckUrl: 'http://localhost:9200/_cluster/health',
        expectedStatusCode: 200,
        healthCheckInterval: 45,
        maxFailures: 3,
        restartDelay: 30,
        enabled: true,
        tags: ['search', 'analytics']
      },
      {
        name: 'mcp-log-server',
        type: 'process',
        processName: 'tsx',
        port: 3001,
        healthCheckUrl: 'http://localhost:3001/api/health',
        expectedStatusCode: 200,
        healthCheckInterval: 20,
        maxFailures: 5,
        restartDelay: 10,
        enabled: true,
        tags: ['api', 'critical']
      }
    ];

    defaultServices.forEach(service => {
      this.addService(service);
    });
  }

  /**
   * Add a service to monitor
   */
  addService(service: ServiceConfig): void {
    this.services.set(service.name, {
      healthCheckInterval: 30,
      maxFailures: 3,
      restartDelay: 10,
      enabled: true,
      ...service
    });

    // Initialize status
    this.serviceStatuses.set(service.name, {
      name: service.name,
      status: 'unknown',
      lastCheck: new Date(),
      failureCount: 0,
      restartCount: 0
    });

    this.log(`📊 Added service to monitor: ${service.name} (${service.type})`);

    // Start monitoring if the monitor is already running
    if (this.isRunning && service.enabled) {
      this.startServiceMonitoring(service.name);
    }
  }

  /**
   * Remove a service from monitoring
   */
  removeService(serviceName: string): void {
    this.stopServiceMonitoring(serviceName);
    this.services.delete(serviceName);
    this.serviceStatuses.delete(serviceName);
    this.log(`🗑️ Removed service from monitor: ${serviceName}`);
  }

  /**
   * Start monitoring all enabled services
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      this.log('🔍 Service monitor already running');
      return;
    }

    this.log('🚀 Starting service monitor...');
    this.isRunning = true;
    this.startTime = new Date();

    // Start monitoring each enabled service
    for (const [serviceName, service] of this.services) {
      if (service.enabled) {
        this.startServiceMonitoring(serviceName);
      }
    }

    // Emit monitoring started event
    this.emit('monitoring-started', {
      timestamp: new Date(),
      serviceCount: Array.from(this.services.values()).filter(s => s.enabled).length
    });

    this.log(`✅ Service monitor started for ${Array.from(this.services.values()).filter(s => s.enabled).length} services`);
  }

  /**
   * Stop monitoring all services
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.log('🛑 Stopping service monitor...');
    this.isRunning = false;

    // Stop all monitoring intervals
    for (const [serviceName] of this.services) {
      this.stopServiceMonitoring(serviceName);
    }

    // Emit monitoring stopped event
    this.emit('monitoring-stopped', {
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime()
    });

    this.log('✅ Service monitor stopped');
  }

  /**
   * Start monitoring a specific service
   */
  private startServiceMonitoring(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (!service || !service.enabled) {
      return;
    }

    // Clear existing interval if any
    this.stopServiceMonitoring(serviceName);

    // Perform initial health check
    this.performHealthCheck(serviceName);

    // Set up regular health checks
    const interval = setInterval(() => {
      this.performHealthCheck(serviceName);
    }, (service.healthCheckInterval || 30) * 1000);

    this.monitoringIntervals.set(serviceName, interval);
    this.log(`👀 Started monitoring ${serviceName} (interval: ${service.healthCheckInterval}s)`);
  }

  /**
   * Stop monitoring a specific service
   */
  private stopServiceMonitoring(serviceName: string): void {
    const interval = this.monitoringIntervals.get(serviceName);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(serviceName);
      this.log(`⏹️ Stopped monitoring ${serviceName}`);
    }
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    const status = this.serviceStatuses.get(serviceName);
    
    if (!service || !status) {
      return;
    }

    const startTime = Date.now();
    let newStatus: ServiceStatus['status'] = 'unknown';
    let error: string | undefined;
    let pid: number | undefined;
    let containerId: string | undefined;

    try {
      switch (service.type) {
        case 'docker':
          ({ status: newStatus, containerId, error } = await this.checkDockerService(service));
          break;
        case 'process':
          ({ status: newStatus, pid, error } = await this.checkProcessService(service));
          break;
        case 'http':
          ({ status: newStatus, error } = await this.checkHttpService(service));
          break;
        case 'port':
          ({ status: newStatus, error } = await this.checkPortService(service));
          break;
        default:
          newStatus = 'unknown';
          error = `Unknown service type: ${service.type}`;
      }
    } catch (err) {
      newStatus = 'unhealthy';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;

    // Update status
    const wasHealthy = status.status === 'healthy';
    const isHealthy = newStatus === 'healthy';

    status.status = newStatus;
    status.lastCheck = new Date();
    status.lastError = error;
    status.responseTime = responseTime;
    status.pid = pid;
    status.containerId = containerId;

    // Handle failure count
    if (isHealthy) {
      status.failureCount = 0;
    } else if (!isHealthy && newStatus !== 'starting') {
      status.failureCount++;
    }

    // Emit status change events
    if (wasHealthy && !isHealthy) {
      this.emit('service-unhealthy', { serviceName, status: { ...status }, error });
      this.log(`❌ Service ${serviceName} became unhealthy: ${error || 'Unknown reason'}`);
    } else if (!wasHealthy && isHealthy) {
      this.emit('service-healthy', { serviceName, status: { ...status } });
      this.log(`✅ Service ${serviceName} is now healthy`);
    }

    // Check if restart is needed
    if (status.failureCount >= (service.maxFailures || 3) && service.enabled) {
      this.log(`🔄 Service ${serviceName} failed ${status.failureCount} times, attempting restart...`);
      await this.restartService(serviceName);
    }
  }

  /**
   * Check Docker service health
   */
  private async checkDockerService(service: ServiceConfig): Promise<{
    status: ServiceStatus['status'];
    containerId?: string;
    error?: string;
  }> {
    try {
      // Check if container exists and is running
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect ${service.containerName} --format='{{.State.Status}},{{.Id}}'`
      );
      
      const [containerStatus, containerId] = inspectOutput.trim().split(',');
      
      if (containerStatus === 'running') {
        // If we have a health check URL, test it
        if (service.healthCheckUrl) {
          try {
            const response = await axios.get(service.healthCheckUrl, {
              timeout: 5000,
              validateStatus: (status) => status === (service.expectedStatusCode || 200)
            });
            return { status: 'healthy', containerId };
          } catch (httpError) {
            return { 
              status: 'unhealthy', 
              containerId, 
              error: `HTTP health check failed: ${httpError instanceof Error ? httpError.message : 'Unknown error'}` 
            };
          }
        }

        // If we have a port, check if it's accessible
        if (service.port) {
          const portOpen = await this.checkPort(service.host || 'localhost', service.port);
          return { 
            status: portOpen ? 'healthy' : 'unhealthy', 
            containerId,
            error: portOpen ? undefined : `Port ${service.port} not accessible`
          };
        }

        return { status: 'healthy', containerId };
      } else if (containerStatus === 'exited') {
        return { status: 'stopped', containerId, error: 'Container exited' };
      } else {
        return { status: 'unhealthy', containerId, error: `Container status: ${containerStatus}` };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such object')) {
        return { status: 'stopped', error: 'Container not found' };
      }
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check process service health
   */
  private async checkProcessService(service: ServiceConfig): Promise<{
    status: ServiceStatus['status'];
    pid?: number;
    error?: string;
  }> {
    try {
      // Check by process name
      if (service.processName) {
        const { stdout } = await execAsync(`pgrep -f "${service.processName}"`);
        const pids = stdout.trim().split('\n').filter(pid => pid).map(pid => parseInt(pid, 10));
        
        if (pids.length === 0) {
          return { status: 'stopped', error: 'Process not found' };
        }

        // Check if processes are zombies
        for (const pid of pids) {
          try {
            const { stdout: statOutput } = await execAsync(`ps -p ${pid} -o stat=`);
            const stat = statOutput.trim();
            if (stat.includes('Z')) {
              return { status: 'unhealthy', pid, error: 'Process is zombie' };
            }
          } catch {
            // Process might have disappeared
            continue;
          }
        }

        const mainPid = pids[0];

        // If we have an HTTP endpoint, test it
        if (service.healthCheckUrl) {
          try {
            await axios.get(service.healthCheckUrl, {
              timeout: 5000,
              validateStatus: (status) => status === (service.expectedStatusCode || 200)
            });
            return { status: 'healthy', pid: mainPid };
          } catch (httpError) {
            return { 
              status: 'unhealthy', 
              pid: mainPid, 
              error: `HTTP health check failed: ${httpError instanceof Error ? httpError.message : 'Unknown error'}` 
            };
          }
        }

        // If we have a port, check if it's accessible
        if (service.port) {
          const portOpen = await this.checkPort(service.host || 'localhost', service.port);
          return { 
            status: portOpen ? 'healthy' : 'unhealthy', 
            pid: mainPid,
            error: portOpen ? undefined : `Port ${service.port} not accessible`
          };
        }

        return { status: 'healthy', pid: mainPid };
      }

      // Check by PID file
      if (service.pidFile) {
        try {
          const pidContent = await fs.readFile(service.pidFile, 'utf8');
          const pid = parseInt(pidContent.trim(), 10);
          
          if (isNaN(pid)) {
            return { status: 'stopped', error: 'Invalid PID file' };
          }

          // Check if process exists
          try {
            process.kill(pid, 0); // Signal 0 just checks if process exists
            
            // Check if it's a zombie
            const { stdout: statOutput } = await execAsync(`ps -p ${pid} -o stat=`);
            const stat = statOutput.trim();
            if (stat.includes('Z')) {
              return { status: 'unhealthy', pid, error: 'Process is zombie' };
            }

            return { status: 'healthy', pid };
          } catch {
            return { status: 'stopped', error: 'Process not running' };
          }
        } catch {
          return { status: 'stopped', error: 'PID file not found or unreadable' };
        }
      }

      return { status: 'unknown', error: 'No process identification method configured' };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check HTTP service health
   */
  private async checkHttpService(service: ServiceConfig): Promise<{
    status: ServiceStatus['status'];
    error?: string;
  }> {
    if (!service.healthCheckUrl) {
      return { status: 'unknown', error: 'No health check URL configured' };
    }

    try {
      const response = await axios.get(service.healthCheckUrl, {
        timeout: 10000,
        validateStatus: (status) => status === (service.expectedStatusCode || 200)
      });

      return { status: 'healthy' };
    } catch (error) {
      let errorMessage = 'HTTP request failed';
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Request timeout';
        } else if (error.response) {
          errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return { status: 'unhealthy', error: errorMessage };
    }
  }

  /**
   * Check port service health
   */
  private async checkPortService(service: ServiceConfig): Promise<{
    status: ServiceStatus['status'];
    error?: string;
  }> {
    if (!service.port) {
      return { status: 'unknown', error: 'No port configured' };
    }

    const portOpen = await this.checkPort(service.host || 'localhost', service.port);
    return {
      status: portOpen ? 'healthy' : 'unhealthy',
      error: portOpen ? undefined : `Port ${service.port} not accessible`
    };
  }

  /**
   * Check if a port is open
   */
  private async checkPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  /**
   * Restart a service
   */
  private async restartService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    const status = this.serviceStatuses.get(serviceName);
    
    if (!service || !status) {
      return;
    }

    this.log(`🔄 Restarting service: ${serviceName}`);
    status.status = 'starting';
    status.lastRestart = new Date();
    status.restartCount++;

    this.emit('service-restarting', { serviceName, restartCount: status.restartCount });

    try {
      switch (service.type) {
        case 'docker':
          await this.restartDockerService(service);
          break;
        case 'process':
          await this.restartProcessService(service);
          break;
        default:
          throw new Error(`Cannot restart service type: ${service.type}`);
      }

      // Wait for restart delay
      if (service.restartDelay) {
        await new Promise(resolve => setTimeout(resolve, service.restartDelay! * 1000));
      }

      this.log(`✅ Service ${serviceName} restart initiated`);
      this.emit('service-restarted', { serviceName, restartCount: status.restartCount });

      // Reset failure count after successful restart initiation
      status.failureCount = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`❌ Failed to restart service ${serviceName}: ${errorMessage}`);
      status.status = 'unhealthy';
      status.lastError = `Restart failed: ${errorMessage}`;
      this.emit('service-restart-failed', { serviceName, error: errorMessage });
    }
  }

  /**
   * Restart Docker service
   */
  private async restartDockerService(service: ServiceConfig): Promise<void> {
    if (service.dockerComposeFile && service.dockerComposeService) {
      // Use docker-compose restart
      await execAsync(`docker-compose -f ${service.dockerComposeFile} restart ${service.dockerComposeService}`);
    } else if (service.containerName) {
      // Use docker restart
      await execAsync(`docker restart ${service.containerName}`);
    } else {
      throw new Error('No restart method configured for Docker service');
    }
  }

  /**
   * Restart process service
   */
  private async restartProcessService(service: ServiceConfig): Promise<void> {
    // First, try to kill existing processes
    if (service.processName) {
      try {
        await execAsync(`pkill -f "${service.processName}"`);
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force kill if still running
        try {
          await execAsync(`pkill -9 -f "${service.processName}"`);
        } catch {
          // Ignore errors, process might already be dead
        }
      } catch {
        // Ignore errors, process might not be running
      }
    }

    // Start the process if we have a start command
    if (service.startCommand) {
      const workingDir = service.workingDirectory || process.cwd();
      
      // Start the process in background
      const child = spawn('sh', ['-c', service.startCommand], {
        detached: true,
        stdio: 'ignore',
        cwd: workingDir
      });
      
      child.unref(); // Allow parent to exit without waiting for child
    } else {
      throw new Error('No start command configured for process service');
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName: string): ServiceStatus | undefined {
    return this.serviceStatuses.get(serviceName);
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): ServiceStatus[] {
    return Array.from(this.serviceStatuses.values());
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): MonitoringStats {
    const statuses = Array.from(this.serviceStatuses.values());
    const totalServices = statuses.length;
    const healthyServices = statuses.filter(s => s.status === 'healthy').length;
    const unhealthyServices = statuses.filter(s => s.status === 'unhealthy').length;
    const stoppedServices = statuses.filter(s => s.status === 'stopped').length;
    const totalRestarts = statuses.reduce((sum, s) => sum + s.restartCount, 0);
    const responseTimes = statuses.filter(s => s.responseTime).map(s => s.responseTime!);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length 
      : 0;

    return {
      totalServices,
      healthyServices,
      unhealthyServices,
      stoppedServices,
      totalRestarts,
      avgResponseTime: Math.round(avgResponseTime),
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  /**
   * Enable/disable monitoring for a service
   */
  setServiceEnabled(serviceName: string, enabled: boolean): void {
    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }

    service.enabled = enabled;

    if (this.isRunning) {
      if (enabled) {
        this.startServiceMonitoring(serviceName);
      } else {
        this.stopServiceMonitoring(serviceName);
      }
    }

    this.log(`🔧 Service ${serviceName} monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get list of managed services
   */
  getServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  /**
   * Log message with timestamp
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ServiceMonitor] ${message}`;
    
    console.log(logMessage);
    
    if (this.logFile) {
      // Async write to log file (fire and forget)
      fs.appendFile(this.logFile, logMessage + '\n').catch(() => {
        // Ignore file write errors
      });
    }
  }

  /**
   * Clean shutdown
   */
  async shutdown(): Promise<void> {
    await this.stopMonitoring();
    this.removeAllListeners();
  }
}
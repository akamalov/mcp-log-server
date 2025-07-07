import { promises as fs } from 'fs';
import { EventEmitter } from 'events';

/**
 * Path validation utilities for log watcher service
 */
export class LogWatcherValidation extends EventEmitter {
  private watchers: Map<string, any>;

  constructor(watchers: Map<string, any>) {
    super();
    this.watchers = watchers;
  }

  /**
   * Validate all currently watched paths and stop monitoring invalid ones
   */
  public async validateWatchedPaths(): Promise<{ validPaths: string[], invalidPaths: string[] }> {
    console.log('🔍 Validating all currently watched paths...');
    
    const validPaths: string[] = [];
    const invalidPaths: string[] = [];
    const pathsToRemove: string[] = [];
    
    for (const [filePath, watchedFile] of this.watchers) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory() || stat.isFile()) {
          validPaths.push(filePath);
          // Reset error count for valid paths
          watchedFile.errorCount = 0;
          watchedFile.isHealthy = true;
        } else {
          invalidPaths.push(filePath);
          pathsToRemove.push(filePath);
        }
      } catch (error) {
        invalidPaths.push(filePath);
        pathsToRemove.push(filePath);
        console.log(`❌ Path no longer exists: ${filePath}`);
      }
    }
    
    // Remove watchers for invalid paths
    for (const pathToRemove of pathsToRemove) {
      const watchedFile = this.watchers.get(pathToRemove);
      if (watchedFile) {
        console.log(`🚫 Stopping watcher for invalid path: ${pathToRemove}`);
        try {
          watchedFile.watcher.close();
        } catch (error) {
          console.warn(`⚠️  Error closing watcher for ${pathToRemove}:`, error);
        }
        this.watchers.delete(pathToRemove);
        
        // Emit event for path removal
        this.emit('path-removed', { 
          agentId: watchedFile.agentId, 
          path: pathToRemove, 
          reason: 'path-invalid' 
        });
      }
    }
    
    if (invalidPaths.length > 0) {
      console.log(`⚠️  Removed ${invalidPaths.length} invalid watchers`);
      this.emit('paths-cleaned', { validCount: validPaths.length, invalidCount: invalidPaths.length });
    }
    
    console.log(`✅ Path validation complete: ${validPaths.length} valid, ${invalidPaths.length} invalid`);
    
    return { validPaths, invalidPaths };
  }
  
  /**
   * Start periodic path validation (runs every 5 minutes)
   */
  public startPeriodicValidation(intervalMs: number = 300000): NodeJS.Timeout {
    console.log(`🔄 Starting periodic path validation (every ${intervalMs/1000}s)`);
    
    const validationInterval = setInterval(async () => {
      try {
        await this.validateWatchedPaths();
      } catch (error) {
        console.warn('⚠️  Error during periodic path validation:', error);
      }
    }, intervalMs);
    
    return validationInterval;
  }
}
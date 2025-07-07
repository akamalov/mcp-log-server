import { ClickHouseClient } from '@clickhouse/client';
import type { LogEntry } from '@mcp-log-server/types';
import { LogAnalyticsService, LogPattern, AnomalyAlert } from './log-analytics.service';

// Enhanced interfaces for advanced analytics
export interface EnhancedLogPattern extends LogPattern {
  regex?: string;
  confidence: number; // 0-1 confidence score
  relatedPatterns: string[]; // IDs of related patterns
  agents: string[]; // Agents where this pattern appears
  trend: 'increasing' | 'decreasing' | 'stable';
  metadata: Record<string, any>;
}

export interface LogCluster {
  id: string;
  centroid: string;
  members: string[];
  size: number;
  similarity: number;
  timeRange: { start: string; end: string };
  dominantLevel: string;
  dominantAgent: string;
}

export interface SequencePattern {
  id: string;
  sequence: string[];
  frequency: number;
  avgDuration: number;
  agents: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'workflow' | 'error_chain' | 'performance_degradation' | 'security_incident';
  examples: Array<{
    timestamp: string;
    duration: number;
    agent: string;
    logs: string[];
  }>;
}

export interface CrossAgentCorrelation {
  agents: string[];
  pattern: string;
  strength: number;
  timeWindow: string;
  category: 'cascading_failure' | 'distributed_error' | 'synchronized_event';
}

export interface LogAggregationConfig {
  timeWindow: number;
  similarityThreshold: number;
  patternConfidenceThreshold: number;
  sequenceMinLength: number;
  sequenceMaxGap: number;
  anomalyThresholds: {
    volumeSpikeMultiplier: number;
    errorRateThreshold: number;
    silenceThreshold: number;
    patternDeviationThreshold: number;
  };
}

export class EnhancedLogAnalyticsService extends LogAnalyticsService {
  private config: LogAggregationConfig;
  private patternCache: Map<string, EnhancedLogPattern> = new Map();

  constructor(clickhouseConfig: any, config?: Partial<LogAggregationConfig>) {
    super(clickhouseConfig);
    this.config = {
      timeWindow: 60,
      similarityThreshold: 0.7,
      patternConfidenceThreshold: 0.6,
      sequenceMinLength: 2,
      sequenceMaxGap: 30,
      anomalyThresholds: {
        volumeSpikeMultiplier: 2.5,
        errorRateThreshold: 0.05,
        silenceThreshold: 300,
        patternDeviationThreshold: 0.3
      },
      ...config
    };
  }

  /**
   * Enhanced pattern detection with regex and clustering
   */
  async detectEnhancedPatterns(timeRange: { start: Date; end: Date }): Promise<EnhancedLogPattern[]> {
    const startTime = this.formatTimestamp(timeRange.start);
    const endTime = this.formatTimestamp(timeRange.end);

    // Get all logs for analysis using the proper ClickHouse client method
    const logs = await this.clickhouse.getLogEntries({
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 10000, // Limit for performance
      sortBy: 'timestamp',
      sortOrder: 'ASC'
    });
    
    // 1. Enhanced regex-based pattern extraction
    const regexPatterns = await this.extractEnhancedRegexPatterns(logs);
    
    // 2. Semantic clustering patterns
    const clusterPatterns = await this.extractClusterPatterns(logs);
    
    // 3. Statistical frequency patterns
    const frequencyPatterns = await this.extractFrequencyPatterns(logs);
    
    // 4. Cross-agent correlation patterns
    const correlationPatterns = await this.extractCorrelationPatterns(logs);

    // Merge and rank all patterns
    const allPatterns = [...regexPatterns, ...clusterPatterns, ...frequencyPatterns, ...correlationPatterns];
    const mergedPatterns = this.mergeAndRankPatterns(allPatterns);
    
    // Update cache
    mergedPatterns.forEach(pattern => {
      this.patternCache.set(pattern.id, pattern);
    });

    return mergedPatterns;
  }

  /**
   * Enhanced regex pattern extraction with confidence scoring
   */
  private async extractEnhancedRegexPatterns(logs: any[]): Promise<EnhancedLogPattern[]> {
    const patterns: EnhancedLogPattern[] = [];
    
    const regexDefinitions = [
      // Error patterns
      { regex: /(\w+Error|Exception|Fatal):\s*(.+)/g, category: 'error', name: 'Exception Patterns' },
      { regex: /failed to (connect|authenticate|authorize|load|save|process)(.+)/gi, category: 'error', name: 'Operation Failures' },
      { regex: /timeout(?:\s+(?:after|in|waiting))?(?:\s+(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?))?/gi, category: 'error', name: 'Timeout Patterns' },
      
      // Performance patterns
      { regex: /(?:slow|latency|delay).*?(\d+(?:\.\d+)?)\s*(ms|seconds?)/gi, category: 'performance', name: 'Performance Issues' },
      { regex: /(?:memory|ram|heap).*?(\d+(?:\.\d+)?)\s*(mb|gb|kb)/gi, category: 'performance', name: 'Memory Usage' },
      { regex: /(?:cpu|processor).*?(\d+(?:\.\d+)?)\s*%/gi, category: 'performance', name: 'CPU Usage' },
      
      // Security patterns
      { regex: /(?:login|authentication|signin).*?(?:failed|success|attempt)/gi, category: 'security', name: 'Authentication Events' },
      { regex: /(?:unauthorized|403|forbidden|access denied)/gi, category: 'security', name: 'Access Denied' },
      
      // Business patterns
      { regex: /(?:ai|model|completion|prompt|token).*?(?:generated|processed|failed)/gi, category: 'business', name: 'AI Operations' },
      { regex: /(?:wsl|windows|linux|ubuntu).*?(?:detected|mounted|error)/gi, category: 'business', name: 'WSL Operations' },
      
      // System patterns
      { regex: /(?:service|daemon|process).*?(?:started|stopped|crashed)/gi, category: 'system', name: 'Service Management' },
      { regex: /(?:config|configuration).*?(?:loaded|error|missing)/gi, category: 'system', name: 'Configuration Events' }
    ];

    for (const def of regexDefinitions) {
      const matches = logs.filter(log => def.regex.test(log.message));
      
      if (matches.length > 0) {
        const agents = [...new Set(matches.map(m => m.source))];
        const timestamps = matches.map(m => new Date(m.timestamp).getTime());
        
        patterns.push({
          id: `enhanced-${def.category}-${def.name.replace(/\s+/g, '-').toLowerCase()}`,
          pattern: def.name,
          regex: def.regex.source,
          count: matches.length,
          percentage: (matches.length / logs.length) * 100,
          firstSeen: new Date(Math.min(...timestamps)).toISOString(),
          lastSeen: new Date(Math.max(...timestamps)).toISOString(),
          severity: this.calculateEnhancedSeverity(def.category, matches.length, logs.length),
          confidence: this.calculatePatternConfidence(matches, def.regex),
          relatedPatterns: [],
          agents,
          trend: this.calculateTrend(timestamps),
          metadata: {
            regexPattern: def.regex.source,
            category: def.category,
            sampleMatches: matches.slice(0, 3).map(m => m.message),
            levelDistribution: this.calculateLevelDistribution(matches)
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Extract patterns using log clustering
   */
  private async extractClusterPatterns(logs: any[]): Promise<EnhancedLogPattern[]> {
    const clusters = this.clusterLogsBySimilarity(logs);
    const patterns: EnhancedLogPattern[] = [];
    
    for (const cluster of clusters) {
      if (cluster.size >= 3) {
        const clusterLogs = logs.filter(log => cluster.members.includes(log.message));
        const agents = [...new Set(clusterLogs.map(log => log.source))];
        const timestamps = clusterLogs.map(log => new Date(log.timestamp).getTime());
        
        patterns.push({
          id: `cluster-${cluster.id}`,
          pattern: `Similar logs: ${cluster.centroid.substring(0, 80)}...`,
          count: cluster.size,
          percentage: (cluster.size / logs.length) * 100,
          firstSeen: cluster.timeRange.start,
          lastSeen: cluster.timeRange.end,
          severity: this.calculateClusterSeverity(cluster),
          confidence: cluster.similarity,
          relatedPatterns: [],
          agents,
          trend: this.calculateTrend(timestamps),
          metadata: {
            clusterCentroid: cluster.centroid,
            averageSimilarity: cluster.similarity,
            dominantLevel: cluster.dominantLevel,
            dominantAgent: cluster.dominantAgent
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Extract patterns based on frequency analysis
   */
  private async extractFrequencyPatterns(logs: any[]): Promise<EnhancedLogPattern[]> {
    const patterns: EnhancedLogPattern[] = [];
    
    // Extract common n-grams (2-4 word sequences)
    const ngramFrequencies = this.extractNGramFrequencies(logs, 2, 4);
    
    for (const [ngram, data] of ngramFrequencies) {
      if (data.frequency >= 3 && data.significance > 0.02) {
        const matchingLogs = logs.filter(log => 
          log.message.toLowerCase().includes(ngram.toLowerCase())
        );
        
        const agents = [...new Set(matchingLogs.map(log => log.source))];
        const timestamps = matchingLogs.map(log => new Date(log.timestamp).getTime());
        
        patterns.push({
          id: `frequency-${ngram.replace(/\s+/g, '-').toLowerCase()}`,
          pattern: `Frequent sequence: "${ngram}"`,
          count: data.frequency,
          percentage: (data.frequency / logs.length) * 100,
          firstSeen: new Date(Math.min(...timestamps)).toISOString(),
          lastSeen: new Date(Math.max(...timestamps)).toISOString(),
          severity: this.calculateFrequencySeverity(data.frequency, logs.length),
          confidence: data.significance,
          relatedPatterns: [],
          agents,
          trend: this.calculateTrend(timestamps),
          metadata: {
            ngramSequence: ngram,
            significance: data.significance,
            contexts: data.contexts.slice(0, 3)
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Extract cross-agent correlation patterns
   */
  private async extractCorrelationPatterns(logs: any[]): Promise<EnhancedLogPattern[]> {
    const patterns: EnhancedLogPattern[] = [];
    
    // Group logs by 5-minute time windows
    const timeWindows = this.groupLogsByTimeWindows(logs, 5);
    
    for (const window of timeWindows) {
      const correlations = this.findCrossAgentCorrelations(window.logs);
      
      for (const correlation of correlations) {
        patterns.push({
          id: `correlation-${correlation.pattern.replace(/\s+/g, '-').toLowerCase()}`,
          pattern: `Cross-agent: ${correlation.pattern}`,
          count: correlation.strength * 10, // Scale for display
          percentage: (correlation.strength * 10) / logs.length * 100,
          firstSeen: window.start,
          lastSeen: window.end,
          severity: this.calculateCorrelationSeverity(correlation),
          confidence: correlation.strength,
          relatedPatterns: [],
          agents: correlation.agents,
          trend: 'stable' as const,
          metadata: {
            correlationType: correlation.category,
            timeWindow: correlation.timeWindow,
            agentCount: correlation.agents.length
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Detect sequence patterns across logs
   */
  async detectSequencePatterns(timeRange: { start: Date; end: Date }): Promise<SequencePattern[]> {
    const startTime = this.formatTimestamp(timeRange.start);
    const endTime = this.formatTimestamp(timeRange.end);

    // Use the proper ClickHouse client method
    const logs = await this.clickhouse.getLogEntries({
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 10000,
      sortBy: 'timestamp',
      sortOrder: 'ASC'
    });
    
    // Group logs by session/agent
    const sessionGroups = this.groupLogsBySession(logs);
    const sequencePatterns: SequencePattern[] = [];
    
    for (const [sessionId, sessionLogs] of sessionGroups) {
      const sequences = this.extractLogSequences(sessionLogs);
      
      for (const sequence of sequences) {
        if (sequence.frequency >= 2) {
          sequencePatterns.push({
            id: `sequence-${sessionId}-${sequence.pattern.replace(/\s+/g, '-')}`,
            sequence: sequence.steps,
            frequency: sequence.frequency,
            avgDuration: sequence.avgDuration,
            agents: sequence.agents,
            severity: this.calculateSequenceSeverity(sequence),
            category: this.inferSequenceCategory(sequence),
            examples: sequence.examples.slice(0, 3)
          });
        }
      }
    }

    return sequencePatterns;
  }

  /**
   * Enhanced anomaly detection with multiple algorithms
   */
  async detectEnhancedAnomalies(): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    
    // 1. Statistical anomaly detection
    const statisticalAnomalies = await this.detectStatisticalAnomalies();
    alerts.push(...statisticalAnomalies);
    
    // 2. Pattern deviation detection
    const patternDeviations = await this.detectPatternDeviations();
    alerts.push(...patternDeviations);
    
    // 3. Sequence break detection
    const sequenceBreaks = await this.detectSequenceBreaks();
    alerts.push(...sequenceBreaks);
    
    // 4. Cross-agent anomalies
    const crossAgentAnomalies = await this.detectCrossAgentAnomalies();
    alerts.push(...crossAgentAnomalies);

    return alerts;
  }

  // Helper methods
  private calculateEnhancedSeverity(category: string, count: number, totalLogs: number): 'low' | 'medium' | 'high' | 'critical' {
    const percentage = (count / totalLogs) * 100;
    
    if (category === 'error' || category === 'security') {
      if (percentage > 15) return 'critical';
      if (percentage > 8) return 'high';
      if (percentage > 3) return 'medium';
      return 'low';
    } else if (category === 'performance') {
      if (percentage > 25) return 'critical';
      if (percentage > 15) return 'high';
      if (percentage > 8) return 'medium';
      return 'low';
    } else {
      if (percentage > 40) return 'critical';
      if (percentage > 25) return 'high';
      if (percentage > 15) return 'medium';
      return 'low';
    }
  }

  private calculatePatternConfidence(matches: any[], regex: RegExp): number {
    const regexComplexity = Math.min(1, regex.source.length / 100);
    const matchQuality = matches.length > 0 ? 1 : 0;
    const levelConsistency = this.calculateLevelConsistency(matches);
    
    return (regexComplexity + matchQuality + levelConsistency) / 3;
  }

  private calculateTrend(timestamps: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (timestamps.length < 3) return 'stable';
    
    const sorted = timestamps.sort((a, b) => a - b);
    const midPoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midPoint);
    const secondHalf = sorted.slice(midPoint);
    
    const firstAvg = firstHalf.reduce((sum, t) => sum + t, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t, 0) / secondHalf.length;
    
    const hourDiff = (secondAvg - firstAvg) / (1000 * 60 * 60);
    
    if (hourDiff > 0.5) return 'increasing';
    if (hourDiff < -0.5) return 'decreasing';
    return 'stable';
  }

  private calculateLevelConsistency(matches: any[]): number {
    if (matches.length === 0) return 0;
    
    const levelCounts = matches.reduce((acc, match) => {
      acc[match.level] = (acc[match.level] || 0) + 1;
      return acc;
    }, {});
    
    const maxCount = Math.max(...Object.values(levelCounts));
    return maxCount / matches.length;
  }

  private calculateLevelDistribution(matches: any[]): Record<string, number> {
    return matches.reduce((acc, match) => {
      acc[match.level] = (acc[match.level] || 0) + 1;
      return acc;
    }, {});
  }

  private clusterLogsBySimilarity(logs: any[]): LogCluster[] {
    const clusters: LogCluster[] = [];
    const processed = new Set<string>();
    
    for (const log of logs) {
      if (processed.has(log.message)) continue;
      
      const similar = logs.filter(l => 
        !processed.has(l.message) && 
        this.calculateTextSimilarity(log.message, l.message) > this.config.similarityThreshold
      );
      
      if (similar.length >= 2) {
        const timestamps = similar.map(s => new Date(s.timestamp).getTime());
        
        const cluster: LogCluster = {
          id: `cluster-${clusters.length}`,
          centroid: this.findCentroid(similar.map(s => s.message)),
          members: similar.map(s => s.message),
          size: similar.length,
          similarity: this.calculateAverageSimilarity(similar.map(s => s.message)),
          timeRange: {
            start: new Date(Math.min(...timestamps)).toISOString(),
            end: new Date(Math.max(...timestamps)).toISOString()
          },
          dominantLevel: this.findDominantLevel(similar),
          dominantAgent: this.findDominantAgent(similar)
        };
        
        clusters.push(cluster);
        similar.forEach(s => processed.add(s.message));
      }
    }
    
    return clusters;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private findCentroid(messages: string[]): string {
    let bestMessage = messages[0];
    let bestScore = 0;
    
    for (const message of messages) {
      const score = messages.reduce((sum, other) => 
        sum + this.calculateTextSimilarity(message, other), 0
      ) / messages.length;
      
      if (score > bestScore) {
        bestScore = score;
        bestMessage = message;
      }
    }
    
    return bestMessage;
  }

  private calculateAverageSimilarity(messages: string[]): number {
    if (messages.length < 2) return 1;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < messages.length; i++) {
      for (let j = i + 1; j < messages.length; j++) {
        totalSimilarity += this.calculateTextSimilarity(messages[i], messages[j]);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private findDominantLevel(logs: any[]): string {
    const levelCounts = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(levelCounts).sort(([,a], [,b]) => b - a)[0][0];
  }

  private findDominantAgent(logs: any[]): string {
    const agentCounts = logs.reduce((acc, log) => {
      acc[log.source] = (acc[log.source] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(agentCounts).sort(([,a], [,b]) => b - a)[0][0];
  }

  private calculateClusterSeverity(cluster: LogCluster): 'low' | 'medium' | 'high' | 'critical' {
    if (cluster.dominantLevel === 'error' || cluster.dominantLevel === 'fatal') {
      return cluster.size > 15 ? 'critical' : cluster.size > 8 ? 'high' : 'medium';
    } else if (cluster.dominantLevel === 'warn') {
      return cluster.size > 25 ? 'high' : cluster.size > 15 ? 'medium' : 'low';
    } else {
      return cluster.size > 50 ? 'medium' : 'low';
    }
  }

  private extractNGramFrequencies(logs: any[], minN: number, maxN: number): Map<string, any> {
    const ngramCounts = new Map<string, any>();
    
    for (let n = minN; n <= maxN; n++) {
      for (const log of logs) {
        const words = log.message.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
        
        for (let i = 0; i <= words.length - n; i++) {
          const ngram = words.slice(i, i + n).join(' ');
          
          if (!ngramCounts.has(ngram)) {
            ngramCounts.set(ngram, {
              frequency: 0,
              contexts: []
            });
          }
          
          const data = ngramCounts.get(ngram);
          data.frequency++;
          data.contexts.push(log.message);
        }
      }
    }
    
    // Calculate significance
    for (const [ngram, data] of ngramCounts) {
      data.significance = data.frequency / logs.length;
    }
    
    return ngramCounts;
  }

  private calculateFrequencySeverity(frequency: number, totalLogs: number): 'low' | 'medium' | 'high' | 'critical' {
    const percentage = (frequency / totalLogs) * 100;
    
    if (percentage > 25) return 'critical';
    if (percentage > 15) return 'high';
    if (percentage > 8) return 'medium';
    return 'low';
  }

  private groupLogsByTimeWindows(logs: any[], windowMinutes: number): any[] {
    const windows = [];
    const windowSize = windowMinutes * 60 * 1000;
    
    if (logs.length === 0) return windows;
    
    const startTime = new Date(logs[0].timestamp).getTime();
    const endTime = new Date(logs[logs.length - 1].timestamp).getTime();
    
    for (let windowStart = startTime; windowStart < endTime; windowStart += windowSize) {
      const windowEnd = windowStart + windowSize;
      const windowLogs = logs.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime >= windowStart && logTime < windowEnd;
      });
      
      if (windowLogs.length > 0) {
        windows.push({
          start: new Date(windowStart).toISOString(),
          end: new Date(windowEnd).toISOString(),
          logs: windowLogs
        });
      }
    }
    
    return windows;
  }

  private findCrossAgentCorrelations(logs: any[]): CrossAgentCorrelation[] {
    const correlations: CrossAgentCorrelation[] = [];
    const agentGroups = this.groupLogsByAgent(logs);
    
    const agents = Array.from(agentGroups.keys());
    
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agent1Logs = agentGroups.get(agents[i])!;
        const agent2Logs = agentGroups.get(agents[j])!;
        
        // Find similar error patterns
        const errorCorrelation = this.findErrorCorrelation(agent1Logs, agent2Logs);
        
        if (errorCorrelation.strength > 0.7) {
          correlations.push({
            agents: [agents[i], agents[j]],
            pattern: errorCorrelation.pattern,
            strength: errorCorrelation.strength,
            timeWindow: '5 minutes',
            category: 'cascading_failure'
          });
        }
      }
    }
    
    return correlations;
  }

  private groupLogsByAgent(logs: any[]): Map<string, any[]> {
    const agentGroups = new Map<string, any[]>();
    
    for (const log of logs) {
      if (!agentGroups.has(log.source)) {
        agentGroups.set(log.source, []);
      }
      agentGroups.get(log.source)!.push(log);
    }
    
    return agentGroups;
  }

  private findErrorCorrelation(logs1: any[], logs2: any[]): { pattern: string; strength: number } {
    const errors1 = logs1.filter(log => log.level === 'error');
    const errors2 = logs2.filter(log => log.level === 'error');
    
    if (errors1.length === 0 || errors2.length === 0) {
      return { pattern: 'No errors', strength: 0 };
    }
    
    let maxSimilarity = 0;
    let bestPattern = '';
    
    for (const error1 of errors1) {
      for (const error2 of errors2) {
        const similarity = this.calculateTextSimilarity(error1.message, error2.message);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestPattern = `Similar errors: ${error1.message.substring(0, 50)}...`;
        }
      }
    }
    
    return { pattern: bestPattern, strength: maxSimilarity };
  }

  private calculateCorrelationSeverity(correlation: CrossAgentCorrelation): 'low' | 'medium' | 'high' | 'critical' {
    if (correlation.category === 'cascading_failure' && correlation.strength > 0.8) {
      return 'critical';
    } else if (correlation.strength > 0.7) {
      return 'high';
    } else if (correlation.strength > 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private groupLogsBySession(logs: any[]): Map<string, any[]> {
    const sessionGroups = new Map<string, any[]>();
    
    for (const log of logs) {
      const sessionId = log.sessionId || log.source;
      
      if (!sessionGroups.has(sessionId)) {
        sessionGroups.set(sessionId, []);
      }
      sessionGroups.get(sessionId)!.push(log);
    }
    
    return sessionGroups;
  }

  private extractLogSequences(logs: any[]): any[] {
    const sequences = [];
    
    for (let i = 0; i < logs.length - 1; i++) {
      const sequence = [logs[i]];
      
      for (let j = i + 1; j < logs.length; j++) {
        const timeDiff = new Date(logs[j].timestamp).getTime() - new Date(logs[j-1].timestamp).getTime();
        const maxGap = this.config.sequenceMaxGap * 60 * 1000;
        
        if (timeDiff <= maxGap) {
          sequence.push(logs[j]);
        } else {
          break;
        }
      }
      
      if (sequence.length >= this.config.sequenceMinLength) {
        const pattern = sequence.map(log => this.extractLogPattern(log.message)).join(' -> ');
        const duration = new Date(sequence[sequence.length - 1].timestamp).getTime() - 
                        new Date(sequence[0].timestamp).getTime();
        
        sequences.push({
          pattern,
          steps: sequence.map(log => this.extractLogPattern(log.message)),
          frequency: 1,
          avgDuration: duration,
          agents: [...new Set(sequence.map(log => log.source))],
          examples: [{
            timestamp: sequence[0].timestamp,
            duration,
            agent: sequence[0].source,
            logs: sequence.map(log => log.message)
          }]
        });
      }
    }
    
    return sequences;
  }

  private extractLogPattern(message: string): string {
    return message.replace(/\d+/g, 'N').replace(/\b\w{32,}\b/g, 'HASH').substring(0, 50);
  }

  private calculateSequenceSeverity(sequence: any): 'low' | 'medium' | 'high' | 'critical' {
    const hasErrors = sequence.steps.some(step => step.toLowerCase().includes('error'));
    const hasFailures = sequence.steps.some(step => step.toLowerCase().includes('fail'));
    
    if (hasErrors && hasFailures) return 'critical';
    if (hasErrors || hasFailures) return 'high';
    if (sequence.frequency > 10) return 'medium';
    return 'low';
  }

  private inferSequenceCategory(sequence: any): 'workflow' | 'error_chain' | 'performance_degradation' | 'security_incident' {
    const steps = sequence.steps.join(' ').toLowerCase();
    
    if (steps.includes('error') || steps.includes('fail')) {
      return 'error_chain';
    } else if (steps.includes('slow') || steps.includes('performance')) {
      return 'performance_degradation';
    } else if (steps.includes('security') || steps.includes('auth')) {
      return 'security_incident';
    } else {
      return 'workflow';
    }
  }

  private async detectStatisticalAnomalies(): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Volume spike detection with Z-score
    const recentVolume = await this.getLogCount(oneHourAgo, now);
    const historicalVolumes = await this.getHistoricalVolumes(7); // Last 7 days
    
    if (historicalVolumes.length > 0) {
      const mean = historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;
      const variance = historicalVolumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / historicalVolumes.length;
      const stdDev = Math.sqrt(variance);
      const zScore = (recentVolume - mean) / stdDev;
      
      if (zScore > 2.5) { // 2.5 standard deviations above mean
        alerts.push({
          id: `statistical-volume-spike-${Date.now()}`,
          type: 'volume_spike',
          message: `Statistical volume anomaly detected: ${recentVolume} logs (Z-score: ${zScore.toFixed(2)})`,
          severity: zScore > 3 ? 'critical' : 'warning',
          timestamp: now.toISOString(),
          confidence: Math.min(1, zScore / 5),
          metadata: {
            currentVolume: recentVolume,
            historicalMean: mean,
            zScore,
            stdDev
          }
        });
      }
    }
    
    return alerts;
  }

  private async detectPatternDeviations(): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    
    // Check for deviations in cached patterns
    for (const [patternId, pattern] of this.patternCache) {
      const recentCount = await this.getPatternCount(patternId, 1); // Last hour
      const historicalCount = await this.getPatternCount(patternId, 24); // Last 24 hours
      
      if (historicalCount > 0) {
        const expectedRate = historicalCount / 24;
        const deviation = Math.abs(recentCount - expectedRate) / expectedRate;
        
        if (deviation > this.config.anomalyThresholds.patternDeviationThreshold) {
          alerts.push({
            id: `pattern-deviation-${patternId}-${Date.now()}`,
            type: 'pattern_anomaly',
            message: `Pattern deviation detected: ${pattern.pattern} (${deviation.toFixed(2)}x expected rate)`,
            severity: deviation > 0.5 ? 'critical' : 'warning',
            timestamp: new Date().toISOString(),
            confidence: Math.min(1, deviation),
            relatedPatterns: [patternId],
            metadata: {
              patternId,
              recentCount,
              expectedRate,
              deviation
            }
          });
        }
      }
    }
    
    return alerts;
  }

  private async detectSequenceBreaks(): Promise<AnomalyAlert[]> {
    // Mock implementation - would detect when expected sequences are broken
    return [];
  }

  private async detectCrossAgentAnomalies(): Promise<AnomalyAlert[]> {
    // Mock implementation - would detect anomalies across multiple agents
    return [];
  }

  private async getLogCount(start: Date, end: Date): Promise<number> {
    return await this.clickhouse.getLogCount({
      startTime: start,
      endTime: end
    });
  }

  private async getHistoricalVolumes(days: number): Promise<number[]> {
    const volumes = [];
    const now = new Date();
    
    for (let i = 1; i <= days; i++) {
      const start = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const volume = await this.getLogCount(start, end);
      volumes.push(volume);
    }
    
    return volumes;
  }

  private async getPatternCount(patternId: string, hours: number): Promise<number> {
    // Mock implementation - would count pattern occurrences
    return Math.floor(Math.random() * 10);
  }

  private mergeAndRankPatterns(patterns: EnhancedLogPattern[]): EnhancedLogPattern[] {
    const uniquePatterns = new Map<string, EnhancedLogPattern>();
    
    for (const pattern of patterns) {
      const key = pattern.pattern.toLowerCase();
      
      if (!uniquePatterns.has(key) || 
          uniquePatterns.get(key)!.confidence < pattern.confidence) {
        uniquePatterns.set(key, pattern);
      }
    }
    
    return Array.from(uniquePatterns.values())
      .sort((a, b) => {
        const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        
        if (severityDiff !== 0) return severityDiff;
        return b.confidence - a.confidence;
      })
      .slice(0, 30);
  }
} 
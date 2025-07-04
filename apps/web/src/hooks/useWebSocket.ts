'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface RealtimeMessage {
  type: 'log-entry' | 'analytics-update' | 'agent-status' | 'pattern-alert' | 'health-update' | 'ping' | 'pong';
  timestamp: string;
  data: any;
}

interface UseWebSocketOptions {
  url: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: RealtimeMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  reconnectAttempts: number;
  lastMessage: RealtimeMessage | null;
  connectionId: string | null;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    autoReconnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0,
    lastMessage: null,
    connectionId: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(false);

  const connect = useCallback(() => {
    // Only connect on client side
    if (typeof window === 'undefined') {
      console.log('🚫 WebSocket: Server-side environment detected, skipping connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || state.isConnecting) {
      return;
    }

    console.log('🔄 WebSocket: Attempting to connect to:', url);
    console.log('🔄 WebSocket: Browser details:', {
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A',
      protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
      port: typeof window !== 'undefined' ? window.location.port : 'N/A'
    });
    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      console.log('🔄 WebSocket: Created WebSocket object, readyState:', ws.readyState);

      ws.onopen = () => {
        console.log('✅ WebSocket connected to:', url);
        reconnectAttemptsRef.current = 0;
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          reconnectAttempts: 0
        }));
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          console.log('📡 WebSocket message received:', message.type);
          setState(prev => ({ ...prev, lastMessage: message }));
          onMessage?.(message);
        } catch (error) {
          console.warn('❌ Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          url: url
        });
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          connectionId: null
        }));

        onDisconnect?.();

        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts && mountedRef.current) {
          reconnectAttemptsRef.current += 1;
          console.log(`🔄 WebSocket: Reconnection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} (reason: ${event.reason || 'No reason provided'})`);
          setState(prev => ({ ...prev, reconnectAttempts: reconnectAttemptsRef.current }));
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error('❌ WebSocket: Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', {
          type: error.type,
          target: error.target?.readyState,
          readyState: ws.readyState,
          url: url,
          error: error,
          // Additional debugging information
          socketState: {
            0: 'CONNECTING',
            1: 'OPEN', 
            2: 'CLOSING',
            3: 'CLOSED'
          }[ws.readyState],
          timestamp: new Date().toISOString()
        });
        setState(prev => ({ ...prev, isConnecting: false }));
        onError?.(error);
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', {
        url: url,
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      setState(prev => ({ ...prev, isConnecting: false }));
    }
  }, [url, autoReconnect, maxReconnectAttempts, reconnectInterval, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
    setState({
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      lastMessage: null,
      connectionId: null
    });
  }, []);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('⚠️ WebSocket not connected, cannot send message:', message);
    return false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    // Only connect on client side after component mounts
    if (typeof window !== 'undefined') {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [url]);

  return {
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    reconnectAttempts: state.reconnectAttempts,
    connectionId: state.connectionId,
    lastMessage: state.lastMessage,
    connect,
    disconnect,
    send
  };
} 
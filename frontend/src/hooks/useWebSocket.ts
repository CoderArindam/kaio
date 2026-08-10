import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useNotificationStore } from '../store/notificationStore';
import { useTaskStore } from '../store/taskStore';
import { useOrganizationStore } from '../store/organizationStore';

// Determine WebSocket URL from environment
function getWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (apiBase) {
    // e.g. http://localhost:8000/api/v1 → ws://localhost:8000/api/v1/ws
    return apiBase.replace(/^http/, 'ws') + '/ws';
  }
  // Same-origin production: derive from window.location
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/v1/ws`;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const PING_INTERVAL_MS = 30_000;

// Module-level singleton socket reference — shared safely via the exported sendWsMessage util
let _ws: WebSocket | null = null;
const pendingQueue: object[] = [];

/**
 * Send a message on the shared WebSocket connection.
 * Queues message if socket is currently connecting; sends immediately if open.
 */
export function sendWsMessage(msg: object): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  } else if (_ws?.readyState === WebSocket.CONNECTING) {
    pendingQueue.push(msg);
  }
}

/**
 * useWebSocket — owns the lifecycle of the shared WebSocket connection.
 * Mount ONCE in AppLayout. Returns { isConnected }.
 */
export function useWebSocket(): { isConnected: boolean } {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setWsConnected = useUiStore((s) => s.setWsConnected);
  const wsConnected = useUiStore((s) => s.wsConnected);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const applyWsEvent = useTaskStore((s) => s.applyWsEvent);
  const boardId = useTaskStore((s) => s.boardView.boardId);

  const backoffRef = useRef<number>(MIN_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldConnectRef = useRef<boolean>(false);
  const boardIdRef = useRef<number | null>(boardId);

  // Keep boardIdRef in sync and send subscription when boardId changes
  useEffect(() => {
    boardIdRef.current = boardId;
    if (boardId) {
      sendWsMessage({ type: 'subscribe_board', board_id: boardId });
    }
  }, [boardId]);

  const stopPing = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const startPing = useCallback(() => {
    stopPing();
    pingTimerRef.current = setInterval(() => {
      sendWsMessage({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }, [stopPing]);

  // Forward-declare connect so it can reference itself in onclose
  const connectRef = useRef<() => void>(() => void 0);

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    // Guard: don't open a second socket
    if (_ws && _ws.readyState <= WebSocket.OPEN) return;

    const url = getWsUrl();
    const ws = new WebSocket(url);
    _ws = ws;

    ws.onopen = () => {
      backoffRef.current = MIN_BACKOFF_MS;
      setWsConnected(true);
      startPing();

      // Automatically re-subscribe to current board on socket open/reconnect
      if (boardIdRef.current) {
        sendWsMessage({ type: 'subscribe_board', board_id: boardIdRef.current });
      }

      // Flush queued pending messages
      while (pendingQueue.length > 0) {
        const msg = pendingQueue.shift();
        if (msg && _ws?.readyState === WebSocket.OPEN) {
          _ws.send(JSON.stringify(msg));
        }
      }
    };

    ws.onclose = () => {
      if (_ws === ws) _ws = null;
      setWsConnected(false);
      stopPing();
      if (!shouldConnectRef.current) return;
      // Exponential backoff
      reconnectTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connectRef.current();
      }, backoffRef.current);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const type = msg.type as string;

      switch (type) {
        case 'task_created':
        case 'task_updated':
        case 'task_moved':
        case 'task_deleted':
        case 'task.updated':
        case 'column_created':
        case 'column_updated':
        case 'column_deleted':
        case 'column_reordered': {
          const eventBoardId = msg.board_id as number | undefined;
          const activeBoardId = boardIdRef.current;
          if (eventBoardId && activeBoardId && eventBoardId === activeBoardId) {
            applyWsEvent(type, msg);
          }
          fetchNotifications();
          break;
        }

        case 'notification.new': {
          fetchNotifications();
          break;
        }

        case 'comment_updated': {
          window.dispatchEvent(new CustomEvent('kaio:comment_updated', { detail: msg }));
          fetchNotifications();
          break;
        }

        case 'label_created':
        case 'label_updated':
        case 'label_deleted': {
          window.dispatchEvent(new CustomEvent('kaio:label_changed', { detail: msg }));
          break;
        }

        case 'proposal.ready': {
          toast.success('New meeting proposals are ready for review.', { duration: 5000 });
          break;
        }

        case 'meeting.status_changed': {
          const status = msg.status as string | undefined;
          if (status === 'FAILED') {
            toast.error('A meeting failed to process. Check the meetings page for details.', { duration: 6000 });
          }
          break;
        }

        case 'dashboard_refresh': {
          window.dispatchEvent(new CustomEvent('kaio:dashboard_refresh'));
          break;
        }

        case 'pong':
          break;

        case 'organization_deletion_scheduled':
        case 'organization_deletion_cancelled': {
          useOrganizationStore.getState().fetchDeletionStatus();
          break;
        }

        default:
          break;
      }
    };
  }, [setWsConnected, startPing, stopPing, fetchNotifications, applyWsEvent]);

  // Keep connectRef current so onclose closures always call the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopPing();
    if (_ws) {
      _ws.close();
      _ws = null;
    }
    setWsConnected(false);
  }, [setWsConnected, stopPing]);

  useEffect(() => {
    if (isAuthenticated) {
      shouldConnectRef.current = true;
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return { isConnected: wsConnected };
}

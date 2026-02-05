/**
 * Type definitions for GhostInput Chrome Extension
 * @module types
 */

/** Supported action types */
export type ActionType = 'key' | 'mouse';

/** Supported time units */
export type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours';

/** Supported mouse actions */
export type MouseAction = 'leftClick' | 'rightClick' | 'middleClick' | 'doubleClick';

/** Modifier keys */
export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';

/** Key information for keyboard events */
export interface KeyInfo {
  code: string;
  keyCode: number;
  key: string;
}

/** Action instance for multi-tab support */
export interface ActionInstance {
  enabled: boolean;
  executionCount: number;
  startedAt: number;
  tabTitle: string;
  nextExecution?: number;
  lastExecuted?: number;
}

/** Main action structure */
export interface Action {
  id: string;
  name: string;
  type: ActionType;
  key?: string;
  keyInfo?: KeyInfo;
  mouseAction?: MouseAction;
  modifiers: Modifier[];
  interval: number;
  timeUnit: TimeUnit;
  randomize: boolean;
  randomizeMin: number;
  randomizeMax: number;
  urlFilter: string | null;
  repeatLimit: number | null;
  timeLimit: number | null;
  instances: Record<string, ActionInstance>;
  createdAt: number;
}

/** Profile structure for saving/loading action sets */
export interface Profile {
  id: string;
  name: string;
  actions: Action[];
  createdAt: number;
}

/** Extension settings */
export interface Settings {
  theme: 'dark' | 'light';
  notifications: boolean;
  sound: boolean;
  globalEnabled: boolean;
  showOverlay: boolean;
  maxLogs: number;
}

/** Default settings values */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  notifications: true,
  sound: false,
  globalEnabled: true,
  showOverlay: true,
  maxLogs: 100
};

/** Log entry structure */
export interface LogEntry {
  actionId: string;
  actionName: string;
  type: ActionType;
  key?: string;
  success: boolean;
  error?: string;
  timestamp: number;
  tabId?: number;
}

/** Timer information for active actions */
export interface TimerInfo {
  timerId: ReturnType<typeof setTimeout>;
  nextExecution: number;
  intervalMs: number;
  actionId: string;
  tabId: number;
}

/** AI Response types for step templates */
export type TemplateType = 
  | 'choice'
  | 'free_text' 
  | 'explanation'
  | 'final_output'
  | 'manual_action';

/** Chrome message types */
export type MessageType =
  | 'START_ACTION'
  | 'STOP_ACTION'
  | 'TOGGLE_ACTION'
  | 'STOP_ACTION_ON_TAB'
  | 'GET_ACTION_INSTANCES'
  | 'REFRESH_TIMERS'
  | 'TOGGLE_GLOBAL'
  | 'GET_STATUS'
  | 'GET_COUNTDOWN'
  | 'GET_OVERLAY_SETTING'
  | 'SHOULD_SHOW_OVERLAY'
  | 'TOGGLE_OVERLAY'
  | 'SET_OVERLAY_VISIBLE'
  | 'GET_CURRENT_TAB'
  | 'GET_MY_TAB_ID'
  | 'OVERLAY_HIDDEN'
  | 'SHOW_OVERLAY'
  | 'HIDE_OVERLAY';

/** Message payload structure */
export interface MessagePayload {
  type: MessageType;
  actionId?: string;
  targetTabId?: number;
  tabId?: number;
  enabled?: boolean;
  visible?: boolean;
}

/** Export data structure */
export interface ExportData {
  version: string;
  exportedAt: string;
  actions: Action[];
  profiles: Profile[];
  settings: Settings;
}

/** Storage keys enumeration */
export enum StorageKeys {
  ACTIONS = 'actions',
  PROFILES = 'profiles',
  SETTINGS = 'settings',
  ACTIVE_PROFILE = 'activeProfile',
  LOGS = 'actionLogs'
}

/** Error types for better error handling */
export class GhostInputError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GhostInputError';
  }
}

export class StorageError extends GhostInputError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class ValidationError extends GhostInputError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends GhostInputError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

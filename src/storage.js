/**
 * Enhanced Storage Module with Error Handling and Transaction Safety
 * @module storage
 */

import {
  StorageKeys,
  DEFAULT_SETTINGS,
  StorageError,
  ValidationError
} from './types.js';

/** @typedef {import('./types').Action} Action */
/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').Settings} Settings */
/** @typedef {import('./types').LogEntry} LogEntry */
/** @typedef {import('./types').ExportData} ExportData */

/**
 * Maximum number of instances per action to prevent memory issues
 * @constant {number}
 */
const MAX_INSTANCES_PER_ACTION = 5;

/**
 * Maximum storage operations retry attempts
 * @constant {number}
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Delay between retry attempts (ms)
 * @constant {number}
 */
const RETRY_DELAY_MS = 100;

/**
 * Pending storage operations queue for transaction safety
 * @type {Map<string, Promise<any>>}
 */
const pendingOperations = new Map();

/**
 * Execute storage operation with retry logic
 * @template T
 * @param {string} operationId - Unique operation identifier
 * @param {() => Promise<T>} operation - Async operation to execute
 * @returns {Promise<T>} Operation result
 * @throws {StorageError} When operation fails after retries
 */
async function executeWithRetry(operationId, operation) {
  // Check for pending operation with same ID (transaction safety)
  const pendingOp = pendingOperations.get(operationId);
  if (pendingOp) {
    await pendingOp;
  }

  let lastError;
  
  const operationPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Storage operation ${operationId} failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}):`, error);
        
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        }
      }
    }
    
    throw new StorageError(
      `Operation ${operationId} failed after ${MAX_RETRY_ATTEMPTS} attempts`,
      { originalError: lastError?.message, operationId }
    );
  })();

  pendingOperations.set(operationId, operationPromise);
  
  try {
    const result = await operationPromise;
    return result;
  } finally {
    pendingOperations.delete(operationId);
  }
}

/**
 * Validate action data before storage
 * @param {Action} action - Action to validate
 * @throws {ValidationError} When action is invalid
 */
function validateAction(action) {
  if (!action || typeof action !== 'object') {
    throw new ValidationError('Action must be an object', { action });
  }
  
  if (!action.id || typeof action.id !== 'string') {
    throw new ValidationError('Action must have a valid id', { action });
  }
  
  if (!action.name || typeof action.name !== 'string') {
    throw new ValidationError('Action must have a valid name', { action: action.id });
  }
  
  if (!['key', 'mouse'].includes(action.type)) {
    throw new ValidationError('Action must have a valid type (key or mouse)', { 
      action: action.id, 
      type: action.type 
    });
  }
  
  if (typeof action.interval !== 'number' || action.interval < 1) {
    throw new ValidationError('Action must have a valid interval >= 1', { 
      action: action.id, 
      interval: action.interval 
    });
  }
  
  // Validate instances limit
  if (action.instances) {
    const instanceCount = Object.keys(action.instances).length;
    if (instanceCount > MAX_INSTANCES_PER_ACTION) {
      throw new ValidationError(
        `Action ${action.id} exceeds maximum instances limit`,
        { count: instanceCount, max: MAX_INSTANCES_PER_ACTION }
      );
    }
  }
}

/**
 * Validate settings before storage
 * @param {Partial<Settings>} settings - Settings to validate
 * @throws {ValidationError} When settings are invalid
 */
function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Settings must be an object');
  }
  
  if (settings.theme && !['dark', 'light'].includes(settings.theme)) {
    throw new ValidationError('Theme must be "dark" or "light"', { theme: settings.theme });
  }
  
  if (settings.maxLogs !== undefined) {
    const maxLogs = settings.maxLogs;
    if (typeof maxLogs !== 'number' || maxLogs < 10 || maxLogs > 10000) {
      throw new ValidationError('maxLogs must be between 10 and 10000', { maxLogs });
    }
  }
  
  if (settings.notifications !== undefined && typeof settings.notifications !== 'boolean') {
    throw new ValidationError('notifications must be a boolean', { notifications: settings.notifications });
  }
}

// Actions CRUD Operations

/**
 * Get all actions from storage
 * @returns {Promise<Action[]>} Array of actions
 * @throws {StorageError} When storage operation fails
 */
export async function getActions() {
  return executeWithRetry('getActions', async () => {
    const result = await chrome.storage.local.get(StorageKeys.ACTIONS);
    const actions = result[StorageKeys.ACTIONS];
    
    if (!Array.isArray(actions)) {
      console.warn('Stored actions is not an array, returning empty array');
      return [];
    }
    
    // Validate and filter out corrupted actions
    const validActions = actions.filter(action => {
      try {
        validateAction(action);
        return true;
      } catch (e) {
        console.warn('Filtering out invalid action:', e.message, action);
        return false;
      }
    });
    
    return validActions;
  });
}

/**
 * Save actions array to storage
 * @param {Action[]} actions - Actions to save
 * @returns {Promise<void>}
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When actions data is invalid
 */
export async function saveActions(actions) {
  if (!Array.isArray(actions)) {
    throw new ValidationError('Actions must be an array');
  }
  
  // Validate all actions before saving
  actions.forEach(validateAction);
  
  return executeWithRetry('saveActions', async () => {
    await chrome.storage.local.set({ [StorageKeys.ACTIONS]: actions });
  });
}

/**
 * Add a new action
 * @param {Action} action - Action to add
 * @returns {Promise<Action[]>} Updated actions array
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When action is invalid
 */
export async function addAction(action) {
  validateAction(action);
  
  return executeWithRetry('addAction', async () => {
    const actions = await getActions();
    
    // Check for duplicate IDs
    if (actions.some(a => a.id === action.id)) {
      throw new ValidationError(`Action with id ${action.id} already exists`);
    }
    
    actions.push(action);
    await saveActions(actions);
    return actions;
  });
}

/**
 * Update an existing action
 * @param {string} actionId - ID of action to update
 * @param {Partial<Action>} updates - Fields to update
 * @returns {Promise<Action[]>} Updated actions array
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When update data is invalid
 */
export async function updateAction(actionId, updates) {
  if (!actionId || typeof actionId !== 'string') {
    throw new ValidationError('actionId must be a non-empty string');
  }
  
  return executeWithRetry('updateAction', async () => {
    const actions = await getActions();
    const index = actions.findIndex(a => a.id === actionId);
    
    if (index === -1) {
      throw new ValidationError(`Action with id ${actionId} not found`);
    }
    
    // Merge updates
    const updatedAction = { ...actions[index], ...updates };
    validateAction(updatedAction);
    
    actions[index] = updatedAction;
    await saveActions(actions);
    return actions;
  });
}

/**
 * Delete an action by ID
 * @param {string} actionId - ID of action to delete
 * @returns {Promise<Action[]>} Updated actions array
 * @throws {StorageError} When storage operation fails
 */
export async function deleteAction(actionId) {
  if (!actionId || typeof actionId !== 'string') {
    throw new ValidationError('actionId must be a non-empty string');
  }
  
  return executeWithRetry('deleteAction', async () => {
    const actions = await getActions();
    const filtered = actions.filter(a => a.id !== actionId);
    
    if (filtered.length === actions.length) {
      console.warn(`Action ${actionId} not found for deletion`);
    }
    
    await saveActions(filtered);
    return filtered;
  });
}

// Instance Management

/**
 * Add or update an action instance for a specific tab
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @param {string} tabTitle - Tab title
 * @returns {Promise<Action|null>} Updated action or null
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When limits exceeded
 */
export async function addActionInstance(actionId, tabId, tabTitle) {
  if (!actionId || typeof actionId !== 'string') {
    throw new ValidationError('actionId must be a non-empty string');
  }
  
  if (typeof tabId !== 'number' || tabId <= 0) {
    throw new ValidationError('tabId must be a positive number');
  }
  
  return executeWithRetry('addActionInstance', async () => {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    
    if (!action) {
      throw new ValidationError(`Action ${actionId} not found`);
    }

    if (!action.instances) {
      action.instances = {};
    }

    // Check max instances limit
    const currentCount = Object.keys(action.instances).length;
    if (currentCount >= MAX_INSTANCES_PER_ACTION && !action.instances[tabId]) {
      throw new ValidationError(
        `Max ${MAX_INSTANCES_PER_ACTION} tabs per action`,
        { currentCount, max: MAX_INSTANCES_PER_ACTION }
      );
    }

    action.instances[tabId] = {
      enabled: true,
      executionCount: 0,
      startedAt: Date.now(),
      tabTitle: tabTitle || `Tab ${tabId}`
    };

    await saveActions(actions);
    return action;
  });
}

/**
 * Remove an action instance for a specific tab
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @returns {Promise<Action|null>} Updated action or null
 * @throws {StorageError} When storage operation fails
 */
export async function removeActionInstance(actionId, tabId) {
  return executeWithRetry('removeActionInstance', async () => {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    
    if (!action || !action.instances) {
      return null;
    }

    delete action.instances[tabId];
    await saveActions(actions);
    return action;
  });
}

/**
 * Update an action instance
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @param {Partial<import('./types').ActionInstance>} updates - Fields to update
 * @returns {Promise<Action|null>} Updated action or null
 * @throws {StorageError} When storage operation fails
 */
export async function updateActionInstance(actionId, tabId, updates) {
  return executeWithRetry('updateActionInstance', async () => {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    
    if (!action || !action.instances || !action.instances[tabId]) {
      return null;
    }

    action.instances[tabId] = { ...action.instances[tabId], ...updates };
    await saveActions(actions);
    return action;
  });
}

/**
 * Get all instances for an action
 * @param {string} actionId - Action ID
 * @returns {Promise<Record<string, import('./types').ActionInstance>>} Instances record
 * @throws {StorageError} When storage operation fails
 */
export async function getActionInstances(actionId) {
  return executeWithRetry('getActionInstances', async () => {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    return action?.instances || {};
  });
}

/**
 * Check if action has any active instances
 * @param {string} actionId - Action ID
 * @returns {Promise<boolean>} True if has active instances
 * @throws {StorageError} When storage operation fails
 */
export async function hasActiveInstances(actionId) {
  const instances = await getActionInstances(actionId);
  return Object.values(instances).some(i => i.enabled);
}

// Profile Operations

/**
 * Get all profiles
 * @returns {Promise<Profile[]>} Array of profiles
 * @throws {StorageError} When storage operation fails
 */
export async function getProfiles() {
  return executeWithRetry('getProfiles', async () => {
    const result = await chrome.storage.local.get(StorageKeys.PROFILES);
    return result[StorageKeys.PROFILES] || [];
  });
}

/**
 * Save a profile
 * @param {Profile} profile - Profile to save
 * @returns {Promise<Profile[]>} Updated profiles array
 * @throws {StorageError} When storage operation fails
 */
export async function saveProfile(profile) {
  if (!profile || !profile.id || !profile.name) {
    throw new ValidationError('Profile must have id and name');
  }
  
  return executeWithRetry('saveProfile', async () => {
    const profiles = await getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    
    if (index !== -1) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    
    await chrome.storage.local.set({ [StorageKeys.PROFILES]: profiles });
    return profiles;
  });
}

/**
 * Delete a profile
 * @param {string} profileId - Profile ID to delete
 * @returns {Promise<Profile[]>} Updated profiles array
 * @throws {StorageError} When storage operation fails
 */
export async function deleteProfile(profileId) {
  return executeWithRetry('deleteProfile', async () => {
    const profiles = await getProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);
    await chrome.storage.local.set({ [StorageKeys.PROFILES]: filtered });
    return filtered;
  });
}

/**
 * Load a profile and set as active actions
 * @param {string} profileId - Profile ID to load
 * @returns {Promise<Profile|null>} Loaded profile or null
 * @throws {StorageError} When storage operation fails
 */
export async function loadProfile(profileId) {
  return executeWithRetry('loadProfile', async () => {
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    
    if (profile) {
      await saveActions(profile.actions);
      await chrome.storage.local.set({ [StorageKeys.ACTIVE_PROFILE]: profileId });
    }
    
    return profile;
  });
}

// Settings Operations

/**
 * Get current settings with defaults
 * @returns {Promise<Settings>} Settings object
 * @throws {StorageError} When storage operation fails
 */
export async function getSettings() {
  return executeWithRetry('getSettings', async () => {
    const result = await chrome.storage.local.get(StorageKeys.SETTINGS);
    const stored = result[StorageKeys.SETTINGS] || {};
    return { ...DEFAULT_SETTINGS, ...stored };
  });
}

/**
 * Save settings
 * @param {Partial<Settings>} settings - Settings to save
 * @returns {Promise<Settings>} Updated settings
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When settings are invalid
 */
export async function saveSettings(settings) {
  validateSettings(settings);
  
  return executeWithRetry('saveSettings', async () => {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await chrome.storage.local.set({ [StorageKeys.SETTINGS]: updated });
    return updated;
  });
}

// Activity Logs

/**
 * Get all logs
 * @returns {Promise<LogEntry[]>} Array of log entries
 * @throws {StorageError} When storage operation fails
 */
export async function getLogs() {
  return executeWithRetry('getLogs', async () => {
    const result = await chrome.storage.local.get(StorageKeys.LOGS);
    return result[StorageKeys.LOGS] || [];
  });
}

/**
 * Add a log entry
 * @param {Omit<LogEntry, 'timestamp'>} logEntry - Log entry data (without timestamp)
 * @returns {Promise<LogEntry[]>} Updated logs array
 * @throws {StorageError} When storage operation fails
 */
export async function addLog(logEntry) {
  if (!logEntry || typeof logEntry !== 'object') {
    throw new ValidationError('logEntry must be an object');
  }
  
  return executeWithRetry('addLog', async () => {
    const settings = await getSettings();
    let logs = await getLogs();
    
    const newEntry = {
      ...logEntry,
      timestamp: Date.now()
    };
    
    logs.unshift(newEntry);
    
    // Keep only maxLogs entries
    if (logs.length > settings.maxLogs) {
      logs = logs.slice(0, settings.maxLogs);
    }
    
    await chrome.storage.local.set({ [StorageKeys.LOGS]: logs });
    return logs;
  });
}

/**
 * Clear all logs
 * @returns {Promise<void>}
 * @throws {StorageError} When storage operation fails
 */
export async function clearLogs() {
  return executeWithRetry('clearLogs', async () => {
    await chrome.storage.local.set({ [StorageKeys.LOGS]: [] });
  });
}

// Import/Export

/**
 * Export all data
 * @returns {Promise<ExportData>} Export data object
 * @throws {StorageError} When storage operation fails
 */
export async function exportData() {
  return executeWithRetry('exportData', async () => {
    const [actions, profiles, settings] = await Promise.all([
      getActions(),
      getProfiles(),
      getSettings()
    ]);
    
    return {
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      actions,
      profiles,
      settings
    };
  });
}

/**
 * Import data from export object
 * @param {ExportData} data - Data to import
 * @returns {Promise<boolean>} True on success
 * @throws {StorageError} When storage operation fails
 * @throws {ValidationError} When data format is invalid
 */
export async function importData(data) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Import data must be an object');
  }
  
  if (!data.version) {
    throw new ValidationError('Invalid import file format: missing version');
  }
  
  // Validate version compatibility
  const version = data.version.split('.')[0];
  if (version !== '1') {
    console.warn(`Importing from different major version: ${data.version}`);
  }
  
  return executeWithRetry('importData', async () => {
    // Validate arrays
    if (data.actions && !Array.isArray(data.actions)) {
      throw new ValidationError('actions must be an array');
    }
    if (data.profiles && !Array.isArray(data.profiles)) {
      throw new ValidationError('profiles must be an array');
    }
    
    // Validate all actions before importing
    if (data.actions) {
      data.actions.forEach(validateAction);
    }
    
    await chrome.storage.local.set({
      [StorageKeys.ACTIONS]: data.actions || [],
      [StorageKeys.PROFILES]: data.profiles || [],
      [StorageKeys.SETTINGS]: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
    });
    
    return true;
  });
}

/**
 * Clear all extension data
 * @returns {Promise<void>}
 * @throws {StorageError} When storage operation fails
 */
export async function clearAllData() {
  return executeWithRetry('clearAllData', async () => {
    await chrome.storage.local.clear();
  });
}

/**
 * Get storage usage statistics
 * @returns {Promise<{used: number, total: number, percentage: number}>} Usage stats
 */
export async function getStorageStats() {
  return executeWithRetry('getStorageStats', async () => {
    const data = await chrome.storage.local.get(null);
    const used = new Blob([JSON.stringify(data)]).size;
    const total = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
    
    return {
      used,
      total,
      percentage: Math.round((used / total) * 100)
    };
  });
}

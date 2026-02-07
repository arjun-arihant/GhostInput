// Popup JavaScript - UI Logic and Storage Management

import {
    getActions, addAction, updateAction, deleteAction,
    getProfiles, saveProfile, deleteProfile, loadProfile,
    getSettings, saveSettings,
    exportData, importData
} from './storage.js';

import { generateId, getKeyInfo } from './constants.js';

// DOM Elements
const elements = {
    // Header & Nav
    globalToggle: document.getElementById('globalToggle'),
    navTabs: document.querySelectorAll('.nav-tab'),
    tabPanels: document.querySelectorAll('.tab-panel'),

    // Add Action Form
    addActionForm: document.getElementById('addActionForm'),
    actionName: document.getElementById('actionName'),
    actionType: document.getElementById('actionType'),
    keySelectGroup: document.getElementById('keySelectGroup'),
    keySelect: document.getElementById('keySelect'),
    mouseSelectGroup: document.getElementById('mouseSelectGroup'),
    mouseSelect: document.getElementById('mouseSelect'),
    modifierBtns: document.querySelectorAll('.modifier-btn'),
    interval: document.getElementById('interval'),
    timeUnit: document.getElementById('timeUnit'),

    // Advanced Options
    advancedToggle: document.getElementById('advancedToggle'),
    advancedOptions: document.getElementById('advancedOptions'),
    randomize: document.getElementById('randomize'),
    randomizeSettings: document.getElementById('randomizeSettings'),
    randomizeMin: document.getElementById('randomizeMin'),
    randomizeMax: document.getElementById('randomizeMax'),
    urlFilter: document.getElementById('urlFilter'),
    repeatLimit: document.getElementById('repeatLimit'),
    timeLimit: document.getElementById('timeLimit'),

    // Lists
    currentTabLabel: document.getElementById('currentTabLabel'),
    startAllBtn: document.getElementById('startAllBtn'),
    stopAllBtn: document.getElementById('stopAllBtn'),
    actionSearch: document.getElementById('actionSearch'),
    clearSearch: document.getElementById('clearSearch'),
    actionsSummary: document.getElementById('actionsSummary'),
    actionsList: document.getElementById('actionsList'),
    emptyState: document.getElementById('emptyState'),
    profilesList: document.getElementById('profilesList'),

    // Profiles Modal
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    saveProfileModal: document.getElementById('saveProfileModal'),
    profileName: document.getElementById('profileName'),
    cancelProfileBtn: document.getElementById('cancelProfileBtn'),
    confirmSaveProfileBtn: document.getElementById('confirmSaveProfileBtn'),

    // Edit Modal
    editActionModal: document.getElementById('editActionModal'),
    editActionId: document.getElementById('editActionId'),
    editActionName: document.getElementById('editActionName'),
    editActionType: document.getElementById('editActionType'),
    editKeySelectGroup: document.getElementById('editKeySelectGroup'),
    editKeySelect: document.getElementById('editKeySelect'),
    editMouseSelectGroup: document.getElementById('editMouseSelectGroup'),
    editMouseSelect: document.getElementById('editMouseSelect'),
    editModifierBtns: document.querySelectorAll('.edit-modifier-btn'),
    editInterval: document.getElementById('editInterval'),
    editTimeUnit: document.getElementById('editTimeUnit'),
    editRandomize: document.getElementById('editRandomize'),
    editRandomizeSettings: document.getElementById('editRandomizeSettings'),
    editRandomizeMin: document.getElementById('editRandomizeMin'),
    editRandomizeMax: document.getElementById('editRandomizeMax'),
    editUrlFilter: document.getElementById('editUrlFilter'),
    editRepeatLimit: document.getElementById('editRepeatLimit'),
    editTimeLimit: document.getElementById('editTimeLimit'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    confirmEditBtn: document.getElementById('confirmEditBtn'),

    // Settings
    notificationsSetting: document.getElementById('notificationsSetting'),
    showOverlaySetting: document.getElementById('showOverlaySetting'),
    themeToggle: document.getElementById('themeToggle'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// State
let selectedModifiers = [];
let editModifiers = [];
let currentTabId = null;
let currentTabTitle = null;
let actionSearchTerm = '';

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Capture the current tab ID immediately
    const tabInfo = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });
    currentTabId = tabInfo?.tabId;
    currentTabTitle = tabInfo?.tabTitle;

    if (elements.currentTabLabel) {
        elements.currentTabLabel.textContent = currentTabTitle || 'Current tab';
    }

    await loadSettings();
    await loadActionsList();
    await loadProfilesList();
    await updateGlobalToggleState();

    setupEventListeners();
}

function setupEventListeners() {
    // Navigation
    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Global Toggle
    elements.globalToggle.addEventListener('click', handleGlobalToggle);

    // Form Interactions
    elements.actionType.addEventListener('change', () => toggleActionTypeInputs(false));
    elements.editActionType.addEventListener('change', () => toggleActionTypeInputs(true));

    elements.modifierBtns.forEach(btn =>
        btn.addEventListener('click', () => toggleModifier(btn, selectedModifiers))
    );
    elements.editModifierBtns.forEach(btn =>
        btn.addEventListener('click', () => toggleModifier(btn, editModifiers))
    );

    // Advanced Toggles
    elements.advancedToggle.addEventListener('click', () => {
        const expanded = elements.advancedToggle.getAttribute('aria-expanded') === 'true';
        elements.advancedToggle.setAttribute('aria-expanded', !expanded);
        elements.advancedOptions.classList.toggle('hidden', expanded);
    });

    elements.randomize.addEventListener('change', () => {
        elements.randomizeSettings.classList.toggle('hidden', !elements.randomize.checked);
    });

    elements.editRandomize.addEventListener('change', () => {
        elements.editRandomizeSettings.classList.toggle('hidden', !elements.editRandomize.checked);
    });

    elements.actionSearch.addEventListener('input', () => {
        actionSearchTerm = elements.actionSearch.value.trim().toLowerCase();
        elements.clearSearch.classList.toggle('hidden', !actionSearchTerm);
        loadActionsList();
    });

    elements.clearSearch.addEventListener('click', () => {
        elements.actionSearch.value = '';
        actionSearchTerm = '';
        elements.clearSearch.classList.add('hidden');
        loadActionsList();
    });

    elements.startAllBtn.addEventListener('click', () => handleBulkToggle(true));
    elements.stopAllBtn.addEventListener('click', () => handleBulkToggle(false));

    // Form Submission
    elements.addActionForm.addEventListener('submit', handleAddAction);

    // Profiles
    elements.saveProfileBtn.addEventListener('click', () => showModal(elements.saveProfileModal));
    elements.cancelProfileBtn.addEventListener('click', () => hideModal(elements.saveProfileModal));
    elements.confirmSaveProfileBtn.addEventListener('click', handleSaveProfile);

    // Edit Modal
    elements.cancelEditBtn.addEventListener('click', () => hideModal(elements.editActionModal));
    elements.confirmEditBtn.addEventListener('click', handleEditAction);

    // Settings
    elements.notificationsSetting.addEventListener('change', handleNotificationsChange);
    elements.showOverlaySetting.addEventListener('change', handleOverlayChange);
    elements.themeToggle?.addEventListener('click', handleThemeToggle);
    elements.exportBtn.addEventListener('click', handleExport);
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', handleImport);

    // Close Modals on Backdrop Click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => hideModal(backdrop.closest('.modal')));
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.tab-dropdown-wrapper')) {
            closeAllDropdowns();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllDropdowns();
            document.querySelectorAll('.modal').forEach(modal => hideModal(modal));
        }
    });
}

// Logic
function switchTab(tabName) {
    elements.navTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
    elements.tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `${tabName}-tab`));

    if (tabName === 'profiles') loadProfilesList();
    if (tabName === 'actions') loadActionsList();
}

async function handleGlobalToggle() {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_GLOBAL' });
    await updateGlobalToggleState();
    const isActive = elements.globalToggle.classList.contains('active');
    showToast(`Global actions ${isActive ? 'resumed' : 'paused'}`);
}

async function updateGlobalToggleState() {
    const settings = await getSettings();
    elements.globalToggle.classList.toggle('active', settings.globalEnabled);
}

function toggleActionTypeInputs(isEdit) {
    const typeSelect = isEdit ? elements.editActionType : elements.actionType;
    const keyGroup = isEdit ? elements.editKeySelectGroup : elements.keySelectGroup;
    const mouseGroup = isEdit ? elements.editMouseSelectGroup : elements.mouseSelectGroup;
    const modGroup = isEdit ? document.querySelector('.edit-modifiers-group') : document.querySelector('.modifiers-group');

    const isKey = typeSelect.value === 'key';

    keyGroup.classList.toggle('hidden', !isKey);
    mouseGroup.classList.toggle('hidden', isKey);
    if (modGroup) modGroup.classList.toggle('hidden', !isKey);
}

function toggleModifier(btn, modifiersArray) {
    const modifier = btn.dataset.modifier;
    btn.classList.toggle('active');

    const index = modifiersArray.indexOf(modifier);
    if (btn.classList.contains('active')) {
        if (index === -1) modifiersArray.push(modifier);
    } else {
        if (index !== -1) modifiersArray.splice(index, 1);
    }
}

// Actions
async function handleAddAction(e) {
    e.preventDefault();

    const isKey = elements.actionType.value === 'key';
    const key = isKey ? elements.keySelect.value : null;
    const keyInfo = key ? getKeyInfo(key) : null;
    const randomRange = normalizeRandomRange(
        elements.randomize.checked,
        elements.randomizeMin.value,
        elements.randomizeMax.value,
        elements.randomizeMin,
        elements.randomizeMax
    );

    // Determine Name
    let name = elements.actionName.value.trim();
    if (!name) {
        name = isKey ? `Press ${key}` : elements.mouseSelect.options[elements.mouseSelect.selectedIndex].text;
    }

    const action = {
        id: generateId(),
        name: name,
        type: elements.actionType.value,
        key: key,
        keyInfo: keyInfo,
        mouseAction: isKey ? null : elements.mouseSelect.value,
        modifiers: isKey ? [...selectedModifiers] : [],
        interval: parseInt(elements.interval.value),
        timeUnit: elements.timeUnit.value,

        // Randomization
        randomize: elements.randomize.checked,
        randomizeMin: randomRange.min,
        randomizeMax: randomRange.max,

        // Limits & Filters
        urlFilter: elements.urlFilter.value.trim() || null,
        repeatLimit: elements.repeatLimit.value ? parseInt(elements.repeatLimit.value) : null,
        timeLimit: elements.timeLimit.value ? parseInt(elements.timeLimit.value) : null,

        // Multi-tab instances (start empty, will be populated by startAction)
        instances: {},
        createdAt: Date.now()
    };

    await addAction(action);

    // Start the action on current tab
    await chrome.runtime.sendMessage({
        type: 'START_ACTION',
        actionId: action.id,
        targetTabId: currentTabId
    });

    await loadActionsList();

    // Reset UI
    elements.addActionForm.reset();
    selectedModifiers = [];
    elements.modifierBtns.forEach(btn => btn.classList.remove('active'));
    elements.advancedOptions.classList.add('hidden');
    elements.advancedToggle.setAttribute('aria-expanded', 'false');
    elements.randomizeSettings.classList.add('hidden');

    showToast('Action added', 'success');
}

async function loadActionsList() {
    const actions = await getActions();
    const filteredActions = actionSearchTerm
        ? actions.filter(action => {
            const meta = [
                action.name,
                action.key,
                action.mouseAction,
                action.urlFilter
            ].filter(Boolean).join(' ').toLowerCase();
            return meta.includes(actionSearchTerm);
        })
        : actions;

    if (actions.length === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.querySelector('p').textContent = 'No active actions';
        elements.emptyState.querySelector('span').textContent = 'Create one above to get started';
        elements.actionsList.innerHTML = '';
        elements.actionsList.appendChild(elements.emptyState);
        elements.actionsSummary.textContent = '0 actions';
        return;
    }

    if (filteredActions.length === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.querySelector('p').textContent = 'No matches found';
        elements.emptyState.querySelector('span').textContent = 'Try a different search term.';
        elements.actionsList.innerHTML = '';
        elements.actionsList.appendChild(elements.emptyState);
        elements.actionsSummary.textContent = `0 of ${actions.length}`;
        return;
    }

    elements.emptyState.classList.add('hidden');
    elements.actionsSummary.textContent = actionSearchTerm
        ? `${filteredActions.length} of ${actions.length}`
        : `${actions.length} action${actions.length === 1 ? '' : 's'}`;

    elements.actionsList.innerHTML = filteredActions.map(action => {
        const instances = action.instances || {};
        const instanceEntries = Object.entries(instances);
        const activeCount = instanceEntries.filter(([, i]) => i.enabled).length;
        const isActiveOnCurrentTab = instances[currentTabId]?.enabled;
        const statusLabel = isActiveOnCurrentTab
            ? '<span class="status-pill active">Active here</span>'
            : '<span class="status-pill">Inactive here</span>';

        // Dropdown for active tabs
        const tabDropdownHtml = activeCount > 0 ? `
            <div class="tab-dropdown-wrapper">
                <button class="tab-dropdown-btn" data-action="${action.id}" title="View active tabs">
                    <span class="tab-count-badge">${activeCount}</span>
                    <span>tab${activeCount > 1 ? 's' : ''}</span>
                    <svg class="dropdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <div class="tab-dropdown-panel hidden" data-action="${action.id}">
                    ${instanceEntries.map(([tabId, inst]) => `
                        <div class="tab-dropdown-item ${inst.enabled ? 'active' : ''}">
                            <span class="tab-title" title="${escapeHtml(inst.tabTitle)}">${escapeHtml(inst.tabTitle?.substring(0, 25) || 'Tab')}</span>
                            <button class="tab-remove" data-action="${action.id}" data-tab="${tabId}" title="Stop on this tab">×</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        return `
        <div class="action-card ${activeCount > 0 ? 'enabled' : ''}">
            <div class="action-icon">
                ${getActionIcon(action)}
            </div>
            <div class="action-details">
                <div class="action-name">${escapeHtml(action.name)}</div>
                <div class="action-meta">
                   <span>Every ${action.interval} ${getUnitLabel(action.timeUnit)}</span>
                   ${statusLabel}
                   ${action.randomize ? `<span title="Randomized ±">🎲</span>` : ''}
                   ${tabDropdownHtml}
                </div>
            </div>
            
            <div class="action-controls">
                <button class="btn-icon-toggle btn-icon-sm action-toggle ${isActiveOnCurrentTab ? 'active' : ''}" data-id="${action.id}" title="${isActiveOnCurrentTab ? 'Stop on this tab' : 'Start on this tab'}">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      <line x1="12" y1="2" x2="12" y2="12" />
                   </svg>
                </button>
                <button class="btn-icon-sm action-edit" data-id="${action.id}" title="Edit">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                   </svg>
                </button>
                <button class="btn-icon-sm delete action-delete" data-id="${action.id}" title="Delete">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                   </svg>
                </button>
            </div>
        </div>
    `}).join('');

    // Re-attach listeners
    attachActionListeners();
}

function attachActionListeners() {
    // Toggle on current tab
    elements.actionsList.querySelectorAll('.action-toggle').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const actions = await getActions();
            const action = actions.find(a => a.id === id);
            if (action) {
                const isActiveOnCurrentTab = action.instances?.[currentTabId]?.enabled;
                const newEnabled = !isActiveOnCurrentTab;

                await chrome.runtime.sendMessage({
                    type: 'TOGGLE_ACTION',
                    actionId: id,
                    enabled: newEnabled,
                    targetTabId: currentTabId
                });

                // Sync global toggle state (may have been auto-enabled)
                await updateGlobalToggleState();
                await loadActionsList();
                showToast(newEnabled ? `Started on this tab` : `Stopped on this tab`);
            }
        });
    });

    // Dropdown toggle for tab list
    elements.actionsList.querySelectorAll('.tab-dropdown-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const actionId = btn.dataset.action;
            const panel = document.querySelector(`.tab-dropdown-panel[data-action="${actionId}"]`);
            if (panel) {
                // Close other dropdowns first
                document.querySelectorAll('.tab-dropdown-panel').forEach(p => {
                    if (p !== panel) p.classList.add('hidden');
                });
                panel.classList.toggle('hidden');
                btn.classList.toggle('open', !panel.classList.contains('hidden'));
            }
        });
    });

    // Remove from specific tab
    elements.actionsList.querySelectorAll('.tab-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const actionId = btn.dataset.action;
            const tabId = parseInt(btn.dataset.tab);

            await chrome.runtime.sendMessage({
                type: 'STOP_ACTION_ON_TAB',
                actionId,
                tabId
            });

            await loadActionsList();
            showToast('Stopped on tab');
        });
    });

    // Edit
    elements.actionsList.querySelectorAll('.action-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    // Delete (stops on all tabs)
    elements.actionsList.querySelectorAll('.action-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({ type: 'STOP_ACTION', actionId: btn.dataset.id });
            await deleteAction(btn.dataset.id);
            await loadActionsList();
            showToast('Action removed');
        });
    });
}

async function openEditModal(id) {
    const actions = await getActions();
    const action = actions.find(a => a.id === id);
    if (!action) return;

    elements.editActionId.value = action.id;
    elements.editActionName.value = action.name;
    elements.editActionType.value = action.type;
    elements.editKeySelect.value = action.key || 'Space';
    elements.editMouseSelect.value = action.mouseAction || 'leftClick';
    elements.editInterval.value = action.interval;
    elements.editTimeUnit.value = action.timeUnit;

    elements.editRandomize.checked = action.randomize || false;
    elements.editRandomizeMin.value = action.randomizeMin || '';
    elements.editRandomizeMax.value = action.randomizeMax || '';

    elements.editUrlFilter.value = action.urlFilter || '';
    elements.editRepeatLimit.value = action.repeatLimit || '';
    elements.editTimeLimit.value = action.timeLimit || '';

    // Modifiers
    editModifiers = [...(action.modifiers || [])];
    elements.editModifierBtns.forEach(btn => {
        btn.classList.toggle('active', editModifiers.includes(btn.dataset.modifier));
    });

    // UI State
    toggleActionTypeInputs(true);
    elements.editRandomizeSettings.classList.toggle('hidden', !action.randomize);

    showModal(elements.editActionModal);
}

async function handleEditAction() {
    const id = elements.editActionId.value;
    const isKey = elements.editActionType.value === 'key';
    const key = isKey ? elements.editKeySelect.value : null;
    const randomRange = normalizeRandomRange(
        elements.editRandomize.checked,
        elements.editRandomizeMin.value,
        elements.editRandomizeMax.value,
        elements.editRandomizeMin,
        elements.editRandomizeMax
    );

    const updates = {
        name: elements.editActionName.value,
        type: elements.editActionType.value,
        key: key,
        keyInfo: key ? getKeyInfo(key) : null,
        mouseAction: isKey ? null : elements.editMouseSelect.value,
        modifiers: isKey ? [...editModifiers] : [],
        interval: parseInt(elements.editInterval.value),
        timeUnit: elements.editTimeUnit.value,

        randomize: elements.editRandomize.checked,
        randomizeMin: randomRange.min,
        randomizeMax: randomRange.max,

        urlFilter: elements.editUrlFilter.value.trim() || null,
        repeatLimit: elements.editRepeatLimit.value ? parseInt(elements.editRepeatLimit.value) : null,
        timeLimit: elements.editTimeLimit.value ? parseInt(elements.editTimeLimit.value) : null
    };

    await updateAction(id, updates);
    await chrome.runtime.sendMessage({ type: 'REFRESH_TIMERS' });
    hideModal(elements.editActionModal);
    await loadActionsList();
    showToast('Changes saved', 'success');
}

// Helpers
function getActionIcon(action) {
    if (action.type === 'mouse') return `🖱️`;
    const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    if (arrows[action.key]) return arrows[action.key];
    if (action.key === 'Space') return '␣';
    if (action.key === 'Enter') return '⏎';
    return action.key || '?';
}

function getUnitLabel(unit) {
    const units = { seconds: 's', minutes: 'm', hours: 'h', milliseconds: 'ms' };
    return units[unit] || unit;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showModal(modal) {
    modal.classList.remove('hidden');
}

function hideModal(modal) {
    modal.classList.add('hidden');
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function closeAllDropdowns() {
    document.querySelectorAll('.tab-dropdown-panel').forEach(panel => panel.classList.add('hidden'));
    document.querySelectorAll('.tab-dropdown-btn').forEach(button => button.classList.remove('open'));
}

function normalizeRandomRange(enabled, minValue, maxValue, minInput, maxInput) {
    if (!enabled) return { min: 0, max: 0 };
    let min = parseInt(minValue || 0);
    let max = parseInt(maxValue || 0);
    if (Number.isNaN(min)) min = 0;
    if (Number.isNaN(max)) max = 0;

    if (min > max) {
        max = min;
        if (maxInput) maxInput.value = max;
        showToast('Randomize max adjusted to match min', 'warning');
    }
    return { min, max };
}

async function handleBulkToggle(enable) {
    if (!currentTabId) {
        showToast('No active tab detected', 'error');
        return;
    }
    const actions = await getActions();
    await Promise.all(actions.map(action => chrome.runtime.sendMessage({
        type: 'TOGGLE_ACTION',
        actionId: action.id,
        enabled: enable,
        targetTabId: currentTabId
    })));
    await updateGlobalToggleState();
    await loadActionsList();
    showToast(enable ? 'Running all actions on this tab' : 'Paused all actions on this tab');
}

// Settings
async function loadSettings() {
    const settings = await getSettings();
    elements.notificationsSetting.checked = settings.notifications !== false;
    elements.showOverlaySetting.checked = settings.showOverlay !== false;

    // Apply saved theme
    const savedTheme = localStorage.getItem('akp-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

async function handleNotificationsChange() {
    await saveSettings({ notifications: elements.notificationsSetting.checked });
}

async function handleOverlayChange() {
    const visible = elements.showOverlaySetting.checked;
    await chrome.runtime.sendMessage({ type: 'SET_OVERLAY_VISIBLE', visible });
    showToast(visible ? 'Overlay on' : 'Overlay off');
}

function handleThemeToggle() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('akp-theme', newTheme);
    showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode`);
}

async function handleExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akp-backup.json`;
    a.click();
    showToast('Config exported');
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        await importData(JSON.parse(text));
        await chrome.runtime.sendMessage({ type: 'REFRESH_TIMERS' });
        await init();
        showToast('Config imported');
    } catch (err) {
        showToast('Import failed', 'error');
    }
}

// Profiles (Simplified)
async function loadProfilesList() {
    const profiles = await getProfiles();
    renderProfiles(profiles);
}

function renderProfiles(profiles) {
    if (!profiles.length) {
        elements.profilesList.innerHTML = '<div class="empty-state"><p>No saved profiles</p></div>';
        return;
    }

    elements.profilesList.innerHTML = profiles.map(p => `
        <div class="action-card">
           <div class="action-details">
              <div class="action-name">${escapeHtml(p.name)}</div>
              <div class="action-meta">${p.actions.length} actions • ${new Date(p.createdAt).toLocaleDateString()}</div>
           </div>
           <div class="action-controls">
               <button class="btn-icon-sm profile-load" data-id="${p.id}" title="Load Profile">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
               </button>
               <button class="btn-icon-sm delete profile-delete" data-id="${p.id}" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
               </button>
           </div>
        </div>
    `).join('');

    elements.profilesList.querySelectorAll('.profile-load').forEach(btn =>
        btn.addEventListener('click', async () => {
            await loadProfile(btn.dataset.id);
            await chrome.runtime.sendMessage({ type: 'REFRESH_TIMERS' });
            await loadActionsList();
            switchTab('actions');
            showToast('Profile loaded');
        })
    );

    elements.profilesList.querySelectorAll('.profile-delete').forEach(btn =>
        btn.addEventListener('click', async () => {
            await deleteProfile(btn.dataset.id);
            await loadProfilesList();
            showToast('Profile deleted');
        })
    );
}

async function handleSaveProfile() {
    const name = elements.profileName.value.trim();
    if (!name) return;
    const actions = await getActions();
    await saveProfile({ id: generateId(), name, actions, createdAt: Date.now() });
    hideModal(elements.saveProfileModal);
    elements.profileName.value = '';
    await loadProfilesList();
    showToast('Profile saved');
}

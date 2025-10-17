'use strict';

// Import the calendar API functions
import { initializeApi, getAccessToken } from './calendar-api.js';

// Get elements
const elements = {
    showDuration: document.getElementById('showDuration'),
    status: document.querySelector('.status'),
    statusText: document.querySelector('.status span'),
    connectButton: document.querySelector('.connect-button'),
    disconnectButton: document.querySelector('.disconnect-button'),
    options: document.querySelector('.options')
};

// Default settings
const defaultSettings = {
    showDuration: true,
    isAuthenticated: false
};

// Update UI status
function updateStatus(isActive, message, isError = false) {
    elements.status.classList.toggle('active', isActive && !isError);
    elements.status.classList.toggle('error', isError);
    elements.statusText.textContent = message;
    elements.options.classList.toggle('active', isActive && !isError);
}

// Handle authentication
async function handleAuth() {
    try {
        updateStatus(false, 'Authenticating...', false);
        elements.connectButton.disabled = true;

        // Request a new token
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'getAuthToken' }, resolve);
        });

        if (response.error) {
            throw new Error(response.error?.message || response.error || 'Authentication failed');
        }

        if (!response.token) {
            throw new Error('No token received');
        }

        // Test the token against the API
        const testResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: {
                'Authorization': `Bearer ${response.token}`
            }
        });

        if (!testResponse.ok) {
            throw new Error('Failed to validate access');
        }

        updateStatus(true, 'Connected to Google Calendar', false);
        await chrome.storage.sync.set({ isAuthenticated: true });
    } catch (error) {
        console.error('Auth Error:', error);
        await clearAuth();
        updateStatus(false, error.message || 'Authentication failed', true);
    } finally {
        elements.connectButton.disabled = false;
    }
}

// Handle logout
async function clearAuth() {
    try {
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'clearAuth' }, resolve);
        });
        // Reset both authentication and duration display settings
        await chrome.storage.sync.set({ 
            isAuthenticated: false,
            showDuration: false 
        });
        // Update UI to reflect changes
        elements.showDuration.checked = false;
        updateStatus(false, 'Connect to Google Calendar', false);
    } catch (error) {
        console.error('Logout Error:', error);
        updateStatus(false, 'Failed to logout', true);
    } finally {
        elements.connectButton.disabled = false;
    }
}

// Save settings and notify content script
async function saveSettings(value) {
    try {
        await chrome.storage.sync.set({ showDuration: value });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('calendar.google.com')) {
            updateStatus(false, 'Open Google Calendar to use this extension', true);
            return;
        }
        
        try {
            // Send message and wait for response with timeout
            const response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, {
                    type: 'settingsUpdated',
                    settings: { showDuration: value }
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Communication timeout')), 5000)
                )
            ]);
            
            if (!response?.success) {
                throw new Error('Invalid response from content script');
            }
        } catch (error) {
            console.error('Failed to communicate with content script:', error);
            // Don't throw - the setting was saved, content script will pick it up on reload
        }
    } catch (error) {
        console.error('Settings Error:', error);
        // Keep the previous UI state since the save failed
        elements.showDuration.checked = !value;
        updateStatus(true, 'Error saving settings', true);
    }
}

// Initialize popup
async function initializePopup() {
    try {
        const items = await chrome.storage.sync.get(defaultSettings);
        elements.showDuration.checked = items.showDuration;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isCalendarTab = tab?.url?.includes('calendar.google.com');
        
        if (!isCalendarTab) {
            updateStatus(false, 'Open Google Calendar to use this extension', true);
            elements.showDuration.disabled = true;
            elements.connectButton.style.display = 'none';
            return;
        }

        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'getAuthToken' }, resolve);
        });

        if (!response.token) {
            throw new Error('Not connected');
        }

        const testResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: {
                'Authorization': `Bearer ${response.token}`
            }
        });

        if (!testResponse.ok) {
            throw new Error('API access failed');
        }

        updateStatus(true, 'Connected to Google Calendar', false);
        await chrome.storage.sync.set({ isAuthenticated: true });
    } catch (error) {
        console.error('Initialization Error:', error);
        updateStatus(false, 'Connect to Google Calendar', false);
        await chrome.storage.sync.set({ isAuthenticated: false });
    }
}

// Add event listeners
document.addEventListener('DOMContentLoaded', initializePopup);
elements.showDuration.addEventListener('change', e => saveSettings(e.target.checked));
elements.connectButton.addEventListener('click', handleAuth);
elements.disconnectButton.addEventListener('click', clearAuth);

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isAuthenticated) {
        updateStatus(changes.isAuthenticated.newValue, 
            changes.isAuthenticated.newValue ? 'Connected to Google Calendar' : 'Connect to Google Calendar',
            false);
    }
});


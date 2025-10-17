// Handle authentication state
let authState = {
    token: null,
    isAuthenticated: false
};

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Extension installed');
    await chrome.storage.sync.set({ isAuthenticated: false });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getAuthToken') {
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }
            if (!token) {
                sendResponse({ error: 'No token received' });
                return;
            }
            authState.token = token;
            authState.isAuthenticated = true;
            chrome.storage.sync.set({ isAuthenticated: true });
            sendResponse({ token });
        });
        return true; // Keep the message channel open for async response
    }
    
    if (message.type === 'invalidateToken') {
        if (message.token) {
            chrome.identity.removeCachedAuthToken({ token: message.token }, () => {
                console.log('Removed invalid token');
                authState.token = null;
                authState.isAuthenticated = false;
                chrome.storage.sync.set({ isAuthenticated: false });
            });
        }
        return true;
    }

    if (message.type === 'checkAuth') {
        sendResponse({ isAuthenticated: authState.isAuthenticated });
        return true;
    }

    if (message.type === 'clearAuth') {
        if (authState.token) {
            chrome.identity.removeCachedAuthToken({ token: authState.token }, () => {
                authState.token = null;
                authState.isAuthenticated = false;
                chrome.storage.sync.set({ isAuthenticated: false });
                sendResponse({ success: true });
            });
        } else {
            sendResponse({ success: true });
        }
        return true;
    }
}); 

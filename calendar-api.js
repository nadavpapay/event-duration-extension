// Google Calendar API client
const API_KEY = '<YOUR_API_KEY>';

async function initializeApi() {
    try {
        const token = await getAccessToken();
        // Test the token with a simple API call
        const response = await fetch(
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    key: API_KEY
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Failed to validate token');
        }
        
        // Store authentication state
        await chrome.storage.sync.set({ isAuthenticated: true });
        return true;
    } catch (error) {
        console.error('Failed to initialize API:', error);
        await chrome.storage.sync.set({ isAuthenticated: false });
        return false;
    }
}

async function getAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'getAuthToken' }, response => {
            if (chrome.runtime.lastError) {
                console.error('Auth Error:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response || response.error) {
                const errorMessage = response?.error?.message || response?.error || 'Failed to get auth token';
                reject(new Error(errorMessage));
                return;
            }
            resolve(response.token);
        });
    });
}

async function isEventInPast(eventId) {
    try {
        const token = await getAccessToken();
        
        // Extract calendar ID and event ID from the combined ID
        const [calendarId, realEventId] = eventId.split('_');
        if (!calendarId || !realEventId) {
            console.error('Invalid event ID format:', eventId);
            return false;
        }

        // Get event details from the API
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(realEventId)}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    key: API_KEY
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch event details');
        }

        const event = await response.json();
        const now = new Date();
        const endTime = new Date(event.end.dateTime || event.end.date);

        return endTime < now;
    } catch (error) {
        console.error('Error checking if event is past:', error);
        return false;
    }
}

export {
    initializeApi,
    getAccessToken,
    isEventInPast
}; 

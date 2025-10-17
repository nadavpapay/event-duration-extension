'use strict';

let setupCalendarObserver;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settingsUpdated') {
        settings = message.settings;
        processEvents();
        sendResponse({ success: true });
        return true; // Keep the message channel open for the async response
    }
});

// Dynamically import the observer module
(async () => {
    const observerModule = await import(chrome.runtime.getURL('utils/observer.js'));
    setupCalendarObserver = observerModule.setupCalendarObserver;
    // Initialize after module is loaded
    initialize();
})();

// Settings and state
let settings = { showDuration: true };
let observer = null;
let processingFrame = null;

const selectors = {
    events: '[role="button"][data-eventchip]:not([aria-hidden="true"]):not(.placeholder)',
    duration: '.event-duration'
};

function extractEventTimes(eventElement) {
    const titleText = eventElement.textContent.trim();
    const timeMatch = titleText.match(/(\d{1,2}:\d{2})\s*(?:–|-)\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) return null;
    
    return {
        start: timeMatch[1],
        end: timeMatch[2]
    };
}

function getEventDateTime(eventElement) {
    const eventTitle = eventElement.textContent.trim();
    const isTestEvent = eventTitle.includes('Test 1') || eventTitle.includes('Test 2');
    if (isTestEvent) console.log('Getting date for:', eventTitle);
    
    const datePattern = /(April|May|June|July|August|September|October|November|December|January|February|March)\s+(\d{1,2}),\s+(\d{4})/;
    const match = eventTitle.match(datePattern);
    if (isTestEvent) console.log('Date match:', match);
    
    if (match) {
        const [_, month, day, year] = match;
        const dateStr = `${month} ${day}, ${year}`;
        if (isTestEvent) console.log('Date string:', dateStr);
        
        const eventDate = new Date(dateStr);
        if (!isNaN(eventDate.getTime())) {
            const times = extractEventTimes(eventElement);
            if (!times || !times.start) return null;
            
            const [endHourStr, endMinuteStrWithMaybeAMPM] = times.end.split(':');
            const [endMinuteStr, endPeriod] = endMinuteStrWithMaybeAMPM.split(/(?=[AP]M)/i);
            
            let endHour = parseInt(endHourStr, 10);
            let endMinute = parseInt(endMinuteStr, 10);
            
            if (endPeriod) {
                if (endPeriod.toUpperCase() === 'PM' && endHour < 12) {
                    endHour += 12;
                } else if (endPeriod.toUpperCase() === 'AM' && endHour === 12) {
                    endHour = 0;
                }
            }
            
            eventDate.setHours(endHour, endMinute, 0, 0);
            if (isTestEvent) console.log('Final event date:', eventDate);
            return eventDate;
        }
    }
    
    if (isTestEvent) console.log('Could not parse date');
    return null;
}

function isEventVisuallyPast(eventElement) {
    const eventTitle = eventElement.textContent.trim();
    const isTestEvent = eventTitle.includes('Test 1') || eventTitle.includes('Test 2');
    
    const now = new Date();
    if (isTestEvent) console.log('Current time:', now);
    
    const eventDate = getEventDateTime(eventElement);
    const isPast = eventDate ? eventDate < now : false;
    if (isTestEvent) console.log('Is event past?', isPast, 'Event date:', eventDate);
    return isPast;
}

function calculateDuration(startTime, endTime) {
    // Parse times in 24-hour format
    const [startHour, startMinute] = startTime.split(':').map(n => parseInt(n, 10));
    let [endHour, endMinuteWithPeriod] = endTime.split(':');
    endHour = parseInt(endHour, 10);
    
    // Handle AM/PM if present
    const period = endMinuteWithPeriod.match(/[AP]M/i);
    const endMinute = parseInt(endMinuteWithPeriod, 10);
    
    if (period) {
        if (period[0].toUpperCase() === 'PM' && endHour < 12) {
            endHour += 12;
        } else if (period[0].toUpperCase() === 'AM' && endHour === 12) {
            endHour = 0;
        }
    }
    
    // Calculate total minutes
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const durationMinutes = endTotalMinutes - startTotalMinutes;
    
    // Convert to decimal hours
    const hours = durationMinutes / 60;
    
    // Format with one decimal place if not a whole number
    if (hours === Math.floor(hours)) {
        return `${hours}h`;
    } else {
        return `${hours.toFixed(1)}h`;
    }
}

function processEvents() {
    if (!settings.showDuration) {
        document.querySelectorAll(selectors.duration).forEach(el => el.remove());
        return;
    }

    const events = document.querySelectorAll(selectors.events);
    
    for (const event of events) {
        const eventTitle = event.textContent.trim();
        const isTestEvent = eventTitle.includes('Test 1') || eventTitle.includes('Test 2');
        if (isTestEvent) {
            console.log('\nProcessing test event:', eventTitle);
        }
        
        const times = extractEventTimes(event);
        if (!times) {
            if (isTestEvent) console.log('No times found for event');
            continue;
        }
        if (isTestEvent) console.log('Times found:', times);

        const isPast = isEventVisuallyPast(event);
        if (isTestEvent) console.log('Is past?', isPast);
        
        // Try multiple selectors to find time elements
        const timeElements = event.querySelectorAll('div[class*="gVNoLb"], div[class*="Jmftzc"]');
        if (isTestEvent) {
            console.log('Time elements found:', timeElements.length);
            console.log('Event HTML structure:', event.innerHTML);
            Array.from(timeElements).forEach((el, i) => {
                console.log(`Time element ${i} classes:`, el.className);
                console.log(`Time element ${i} text:`, el.textContent.trim());
            });
        }
        
        const timeElement = Array.from(timeElements).find(el => {
            const text = el.textContent.trim();
            if (isTestEvent) console.log('Checking time element:', text);
            return text.includes('–') || text.includes('-') || text.match(/\d{1,2}:\d{2}/);
        });

        if (!timeElement) {
            if (isTestEvent) console.log('No matching time element found');
            continue;
        }
        if (isTestEvent) console.log('Found time element:', timeElement.textContent);
        
        let existingDuration = Array.from(timeElement.childNodes)
            .find(node => node.classList?.contains('event-duration'));
        
        const duration = calculateDuration(times.start, times.end);
        
        if (existingDuration) {
            if (isTestEvent) console.log('Updating existing duration');
            existingDuration.classList.remove('past', 'future');
            existingDuration.classList.add(isPast ? 'past' : 'future');
            existingDuration.textContent = ` (${duration})`;
            if (isTestEvent) console.log('Updated classes:', existingDuration.className);
            continue;
        }

        if (isTestEvent) console.log('Creating new duration element');
        const durationElement = document.createElement('span');
        durationElement.className = `event-duration ${isPast ? 'past' : 'future'}`;
        durationElement.textContent = ` (${duration})`;
        timeElement.appendChild(durationElement);
        if (isTestEvent) console.log('Added duration element. Time element now contains:', timeElement.innerHTML);
    }
}

async function initialize() {
    try {
        const items = await chrome.storage.sync.get({ showDuration: true });
        settings = items;
        // tear down old observer if exists
        if (observer) observer.disconnect();
        // use the shared observer util:
        observer = setupCalendarObserver({
            calendarSelector: 'body',
            eventSelector: selectors.events,
            onChanges: () => requestAnimationFrame(processEvents)
        });
        // also run once on load
        processEvents();
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.showDuration) {
        settings.showDuration = changes.showDuration.newValue;
        processEvents();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (!settings.showDuration) return;
    processEvents();
}, { passive: true });

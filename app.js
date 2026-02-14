// ==============================================
// FIREBASE CONFIGURATION
// ==============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, push, child, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJBwF80s_3to-kNB7-TU9BZtkNQIOhEis",
    authDomain: "ipl-auction-70480.firebaseapp.com",
    databaseURL: "https://ipl-auction-70480-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ipl-auction-70480",
    storageBucket: "ipl-auction-70480.firebasestorage.app",
    messagingSenderId: "648990395623",
    appId: "1:648990395623:web:c40c1a80d9efca9cc48e6e"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ==============================================
// GLOBAL VARIABLES
// ==============================================
let currentRoomId = null;
let currentParticipantId = null;
let currentTeamName = null;
let currentUserName = null;
let previousParticipants = {};
let timerInterval = null;
let timeLeft = 10;

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

// Generate unique participant ID
function generateParticipantId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==============================================
// PARTICIPANT MANAGEMENT
// ==============================================

// Setup presence detection
function setupPresence(roomId, participantId) {
    const participantRef = ref(database, `rooms/${roomId}/participants/${participantId}`);
    
    // Mark as online
    set(child(participantRef, 'isOnline'), true);
    
    // Handle disconnect
    const disconnectRef = ref(database, `rooms/${roomId}/participants/${participantId}/isOnline`);
    onDisconnect(disconnectRef).set(false);
    
    // Update last seen on disconnect
    const lastSeenRef = ref(database, `rooms/${roomId}/participants/${participantId}/lastSeen`);
    onDisconnect(lastSeenRef).set(Date.now());
    
    console.log('✅ Presence setup complete for:', participantId);
}

// Listen for participant changes in real-time
function listenToParticipants(roomId) {
    const participantsRef = ref(database, `rooms/${roomId}/participants`);
    
    let firstLoad = true;
    onValue(participantsRef, (snapshot) => {
        const participants = snapshot.val() || {};
        
        if (!firstLoad) {
            // Check for new participants
            for (let pId in participants) {
                if (participants[pId].isOnline && !previousParticipants[pId]) {
                    showNotification(`${participants[pId].name} joined the auction! 🎉`);
                    if (window.speechSynthesis && voiceEnabled) {
                        speak(`${participants[pId].name} has joined the auction!`);
                    }
                }
            }
            
            // Check for participants who went offline
            for (let pId in previousParticipants) {
                if (previousParticipants[pId].isOnline && participants[pId] && !participants[pId].isOnline) {
                    showNotification(`${participants[pId].name} left the auction 👋`);
                }
            }
        }
        
        previousParticipants = JSON.parse(JSON.stringify(participants)); // Deep copy
        firstLoad = false;
        updateParticipantsList(participants);
    });
}

// Update participants list in UI
function updateParticipantsList(participants) {
    console.log('📋 Current Participants:', participants);
    
    // Display participants in the UI
    displayParticipants(participants);
    
    // Update team ownership in the teams panel
    updateTeamOwnership(participants);
}

// Display participants
function displayParticipants(participants) {
    const participantsList = document.getElementById('participantsList');
    if (!participantsList) return;
    
    participantsList.innerHTML = '';
    
    const sortedParticipants = Object.entries(participants).sort((a, b) => {
        // Host first
        if (a[1].isHost && !b[1].isHost) return -1;
        if (!a[1].isHost && b[1].isHost) return 1;
        // Online before offline
        if (a[1].isOnline && !b[1].isOnline) return -1;
        if (!a[1].isOnline && b[1].isOnline) return 1;
        // Then by join time
        return a[1].joinedAt - b[1].joinedAt;
    });
    
    for (let [pId, p] of sortedParticipants) {
        const isOnline = p.isOnline === true;
        const isMe = pId === currentParticipantId;
        
        const participantCard = document.createElement('div');
        participantCard.style.cssText = `
            padding: 10px 15px;
            background: ${isMe ? '#fff3cd' : (isOnline ? '#e8f5e9' : '#f5f5f5')};
            border-radius: 6px;
            border-left: 4px solid ${isMe ? '#ffc107' : (isOnline ? '#4caf50' : '#9e9e9e')};
            min-width: 150px;
            ${isMe ? 'box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);' : ''}
        `;
        
        participantCard.innerHTML = `
            <div style="font-weight: bold; color: #333; margin-bottom: 5px;">
                ${isOnline ? '🟢' : '⚫'} ${p.name}
                ${p.isHost ? ' 👑' : ''}
                ${isMe ? ' (You)' : ''}
            </div>
            <div style="font-size: 0.85em; color: #666;">
                ${p.team}
            </div>
            <div style="font-size: 0.75em; color: #999; margin-top: 3px;">
                ${isOnline ? 'Online' : 'Offline'}
            </div>
        `;
        
        participantsList.appendChild(participantCard);
    }
}

// Update team ownership
function updateTeamOwnership(participants) {
    const teamElements = document.querySelectorAll('.team-card');
    
    teamElements.forEach(teamEl => {
        const teamName = teamEl.querySelector('.team-name')?.textContent;
        
        // Find participant with this team
        let owner = null;
        for (let pId in participants) {
            if (participants[pId].team === teamName && participants[pId].isOnline) {
                owner = participants[pId];
                break;
            }
        }
        
        // Add owner badge to team card
        let ownerBadge = teamEl.querySelector('.owner-badge');
        if (!ownerBadge) {
            ownerBadge = document.createElement('div');
            ownerBadge.className = 'owner-badge';
            ownerBadge.style.cssText = `
                font-size: 0.8em;
                color: #666;
                margin-top: 5px;
                font-style: italic;
            `;
            teamEl.appendChild(ownerBadge);
        }
        
        ownerBadge.textContent = owner ? `👤 ${owner.name}` : '⚪ Available';
        
        // Highlight if this is my team
        if (owner && owner.team === currentTeamName) {
            teamEl.style.border = '2px solid #ffc107';
            teamEl.style.boxShadow = '0 2px 8px rgba(255, 193, 7, 0.3)';
        }
    });
}

// Show notification
function showNotification(message) {
    const historyLog = document.getElementById('auctionHistory');
    if (historyLog) {
        const entry = document.createElement('div');
        entry.style.cssText = `
            padding: 8px; 
            background: #e3f2fd; 
            border-radius: 4px; 
            margin-bottom: 5px;
            color: #1976d2;
            font-size: 0.9em;
        `;
        entry.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong> - ${message}`;
        historyLog.insertBefore(entry, historyLog.firstChild);
    }
}

// ==============================================
// ROOM MANAGEMENT
// ==============================================

// Create room
async function createRoom(roomId, password, teamName, userName) {
    try {
        // Check if room already exists
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        
        if (snapshot.exists()) {
            alert('Room ID already exists! Please choose a different Room ID.');
            return false;
        }
        
        // Generate unique participant ID
        currentParticipantId = generateParticipantId();
        currentRoomId = roomId;
        currentTeamName = teamName;
        currentUserName = userName;
        
        // Save to localStorage for session persistence
        localStorage.setItem('participantId', currentParticipantId);
        localStorage.setItem('roomId', roomId);
        localStorage.setItem('teamName', teamName);
        localStorage.setItem('userName', userName);
        
        console.log('Creating room with participant:', {
            id: currentParticipantId,
            name: userName,
            team: teamName
        });
        
        // Create room with participant data
        const roomData = {
            password: password,
            createdAt: Date.now(),
            createdBy: userName,
            participants: {
                [currentParticipantId]: {
                    name: userName,
                    team: teamName,
                    joinedAt: Date.now(),
                    isOnline: true,
                    isHost: true
                }
            },
            teams: initializeTeams(),
            players: await loadPlayersFromSheet(),
            currentPlayer: null,
            history: []
        };
        
        // Save to Firebase
        await set(roomRef, roomData);
        
        // Setup presence detection
        setupPresence(roomId, currentParticipantId);
        
        // Listen for participant changes
        listenToParticipants(roomId);
        
        // Listen for room data changes
        listenToRoomData(roomId);
        
        console.log('✅ Room created successfully with participant:', userName);
        
        // Show auction screen
        showAuctionScreen(roomId, teamName, userName);
        
        return true;
    } catch (error) {
        console.error('❌ Error creating room:', error);
        alert('Error creating room: ' + error.message);
        return false;
    }
}

// Join room
async function joinRoom(roomId, password, teamName, userName) {
    try {
        // Check if room exists
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        
        if (!snapshot.exists()) {
            alert('Room not found! Please check the Room ID.');
            return false;
        }
        
        const roomData = snapshot.val();
        
        // Verify password
        if (roomData.password !== password) {
            alert('Incorrect password! Please try again.');
            return false;
        }
        
        // Check if team is already taken
        const participants = roomData.participants || {};
        for (let pId in participants) {
            if (participants[pId].team === teamName && participants[pId].isOnline) {
                alert(`Team ${teamName} is already taken! Please select a different team.`);
                return false;
            }
        }
        
        // Generate unique participant ID
        currentParticipantId = generateParticipantId();
        currentRoomId = roomId;
        currentTeamName = teamName;
        currentUserName = userName;
        
        // Save to localStorage for session persistence
        localStorage.setItem('participantId', currentParticipantId);
        localStorage.setItem('roomId', roomId);
        localStorage.setItem('teamName', teamName);
        localStorage.setItem('userName', userName);
        
        console.log('Joining room as participant:', {
            id: currentParticipantId,
            name: userName,
            team: teamName
        });
        
        // Add participant to room
        await set(ref(database, `rooms/${roomId}/participants/${currentParticipantId}`), {
            name: userName,
            team: teamName,
            joinedAt: Date.now(),
            isOnline: true,
            isHost: false
        });
        
        // Setup presence detection
        setupPresence(roomId, currentParticipantId);
        
        // Listen for participant changes
        listenToParticipants(roomId);
        
        // Listen for room data changes
        listenToRoomData(roomId);
        
        console.log('✅ Joined room successfully as:', userName);
        
        // Show auction screen
        showAuctionScreen(roomId, teamName, userName);
        
        return true;
    } catch (error) {
        console.error('❌ Error joining room:', error);
        alert('Error joining room: ' + error.message);
        return false;
    }
}

// Listen to room data changes
function listenToRoomData(roomId) {
    const roomRef = ref(database, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateAuctionUI(data);
        }
    });
}

// Initialize teams
function initializeTeams() {
    const teamNames = [
        'Mumbai Indians',
        'Chennai Super Kings',
        'Royal Challengers Bangalore',
        'Kolkata Knight Riders',
        'Delhi Capitals',
        'Punjab Kings',
        'Rajasthan Royals',
        'Sunrisers Hyderabad'
    ];
    
    return teamNames.map(name => ({
        name: name,
        purse: 100,
        players: []
    }));
}

// Load players from Google Sheets
async function loadPlayersFromSheet() {
    try {
        const sheetId = '1i4NQmcynf76DoKbqestur9T3Bu4AI6Ka1AAh66winh8';
        const sheetName = 'Sheet1';
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
        
        const response = await fetch(url);
        const csvText = await response.text();
        
        const players = parseCSV(csvText);
        console.log('✅ Loaded', players.length, 'players from Google Sheets');
        return players;
    } catch (error) {
        console.error('❌ Error loading players:', error);
        alert('Error loading players from Google Sheets');
        return [];
    }
}

// Parse CSV
function parseCSV(csv) {
    const lines = csv.split('\n');
    const players = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(',').map(col => col.replace(/^"|"$/g, '').trim());
        
        if (cols.length >= 7) {
            players.push({
                id: parseInt(cols[0]) || i,
                name: cols[1] || 'Unknown',
                role: cols[2] || 'All-rounder',
                country: cols[3] || 'India',
                basePrice: parseFloat(cols[4]) || 0.5,
                style: cols[5] || '',
                photoUrl: cols[6] || '',
                status: 'unsold',
                soldTo: '',
                soldPrice: 0
            });
        }
    }
    
    return players;
}

// ==============================================
// UI FUNCTIONS
// ==============================================

// Show auction screen
function showAuctionScreen(roomId, teamName, userName) {
    document.getElementById('roomScreen').style.display = 'none';
    document.getElementById('auctionScreen').style.display = 'block';
    
    // Update room info
    document.getElementById('roomIdDisplay').textContent = roomId;
    document.getElementById('teamDisplay').textContent = teamName;
    document.getElementById('ownerDisplay').textContent = userName;
}

// Update auction UI with room data
function updateAuctionUI(roomData) {
    // Update teams
    const teamsContainer = document.getElementById('teamsContainer');
    if (teamsContainer && roomData.teams) {
        // Update teams display
        renderTeams(roomData.teams);
    }
    
    // Update players
    const playersContainer = document.getElementById('playersContainer');
    if (playersContainer && roomData.players) {
        renderPlayers(roomData.players);
    }
    
    // Update current player
    if (roomData.currentPlayer) {
        renderCurrentPlayer(roomData.currentPlayer, roomData.teams);
    }
    
    // Update history
    if (roomData.history) {
        renderHistory(roomData.history);
    }
}

// ... (rest of your existing UI rendering functions)

// ==============================================
// INITIALIZATION
// ==============================================

// Check for existing session on page load
window.addEventListener('load', () => {
    const savedRoomId = localStorage.getItem('roomId');
    const savedParticipantId = localStorage.getItem('participantId');
    const savedTeamName = localStorage.getItem('teamName');
    const savedUserName = localStorage.getItem('userName');
    
    if (savedRoomId && savedParticipantId && savedTeamName && savedUserName) {
        // Try to rejoin room automatically
        console.log('🔄 Found saved session, attempting to rejoin...');
        
        currentRoomId = savedRoomId;
        currentParticipantId = savedParticipantId;
        currentTeamName = savedTeamName;
        currentUserName = savedUserName;
        
        // Restore presence
        setupPresence(savedRoomId, savedParticipantId);
        listenToParticipants(savedRoomId);
        listenToRoomData(savedRoomId);
        
        // Show auction screen
        showAuctionScreen(savedRoomId, savedTeamName, savedUserName);
    }
});

// Export functions for HTML to use
window.createRoom = createRoom;
window.joinRoom = joinRoom;

console.log('✅ App initialized with participant tracking!');

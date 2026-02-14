// IPL Auction 2026 - Firebase Real-Time Sync with Host/Player Roles
// Random player sets, Ready system, 15-second auto-sell

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJBwF80s_3to-kNB7-TU9BZtkNQIOhEis",
  authDomain: "ipl-auction-70480.firebaseapp.com",
  databaseURL: "https://ipl-auction-70480-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ipl-auction-70480",
  storageBucket: "ipl-auction-70480.firebasestorage.app",
  messagingSenderId: "494392409078",
  appId: "1:494392409078:web:551592b7ddb0fa7b2ce5d7",
  measurementId: "G-SYJKC7VH1V"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let teams = [
    { name: "Mumbai Indians", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Chennai Super Kings", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Royal Challengers Bangalore", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Kolkata Knight Riders", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Delhi Capitals", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Rajasthan Royals", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Punjab Kings", owner: "", purse: 120, players: [], spent: 0 },
    { name: "Sunrisers Hyderabad", owner: "", purse: 120, players: [], spent: 0 }
];

let allPlayers = [];
let currentSet = [];
let currentSetNumber = 1;
let players = [];
let currentUser = null;
let isHost = false;
let currentRoomId = null;
let currentRoomPassword = null;
let currentPlayerOnAuction = null;
let currentBid = 0;
let highestBidder = null;
let voiceEnabled = true;
let auctionHistory = [];
let participants = {};
let participantId = null;

let auctionTimer = null;
let timeRemaining = 15;
let lastBidTime = null;
let timerDisplay = null;
let roomDataListener = null;

window.onload = function() {
    // Populate teams immediately
    populateTeamSelect();
    
    loadPlayersFromCSV().then(() => {
        console.log('✅ App initialized');
        
        // Check if URL has room parameters
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        const password = urlParams.get('pass');
        
        if (roomId && password) {
            // Auto-fill the form
            setTimeout(() => {
                const roomIdInput = document.getElementById('roomId');
                const passwordInput = document.getElementById('roomPassword');
                
                if (roomIdInput) roomIdInput.value = roomId;
                if (passwordInput) passwordInput.value = password;
                
                // Show helpful message
                const loginBox = document.querySelector('.login-box');
                if (loginBox) {
                    const notice = document.createElement('div');
                    notice.style.cssText = 'background: rgba(76, 175, 80, 0.2); border: 2px solid #4CAF50; border-radius: 10px; padding: 15px; margin-bottom: 20px; text-align: center;';
                    notice.innerHTML = `
                        <strong style="color: #4CAF50; font-size: 1.1em;">✅ Room Credentials Loaded!</strong>
                        <p style="color: #aaa; margin-top: 8px; font-size: 0.9em;">Just select your team and enter your name to join!</p>
                    `;
                    loginBox.insertBefore(notice, loginBox.children[2]);
                }
                
                console.log('🔗 Auto-filled room credentials from URL');
            }, 100);
        }
    });
};

function populateTeamSelect() {
    const select = document.getElementById('teamSelect');
    if (!select) {
        console.error('❌ Team select element not found');
        return;
    }
    
    // Clear all existing options
    select.innerHTML = '';
    
    // Add placeholder
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a team...';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    
    // Add all teams
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.name;
        option.textContent = team.name;
        select.appendChild(option);
    });
    
    console.log('✅ Populated team select with', teams.length, 'teams');
}

async function loadPlayersFromCSV() {
    try {
        console.log('📥 Loading players from CSV file...');
        
        const response = await fetch('players.csv');
        
        if (!response.ok) {
            throw new Error('Failed to load players.csv file');
        }
        
        const csvText = await response.text();
        
        if (!csvText || csvText.trim().length === 0) {
            throw new Error('CSV file is empty');
        }
        
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('CSV has no player data');
        }
        
        allPlayers = [];
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            try {
                const values = parseCSVLine(lines[i]);
                
                // Skip empty rows
                if (!values[0] || values[0].trim() === '') continue;
                
                const player = {
                    id: parseInt(values[0]) || i,
                    name: values[1] || 'Unknown Player',
                    role: values[2] || 'Batsman',
                    country: values[3] || 'India',
                    basePrice: parseFloat(values[4]) || 1.0,
                    style: values[5] || 'Right-hand',
                    photoUrl: values[6] || '',
                    status: 'unsold',
                    soldTo: null,
                    soldPrice: 0
                };
                allPlayers.push(player);
            } catch (rowError) {
                console.warn(`Skipping row ${i} due to error:`, rowError);
                continue;
            }
        }
        
        if (allPlayers.length === 0) {
            throw new Error('No valid players found in CSV');
        }
        
        console.log(`✅ Loaded ${allPlayers.length} players from CSV file`);
        
    } catch (error) {
        console.error('❌ Error loading CSV:', error);
        alert(`Error loading players from CSV file:\n\n${error.message}\n\nMake sure players.csv is in the same folder as index.html!`);
        
        // Initialize with empty array to prevent crashes
        allPlayers = [];
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Generate random player sets (27 players each, well distributed)
function generatePlayerSets() {
    const batsmen = allPlayers.filter(p => p.role === 'Batsman');
    const bowlers = allPlayers.filter(p => p.role === 'Bowler');
    const allrounders = allPlayers.filter(p => p.role === 'All-rounder');
    const keepers = allPlayers.filter(p => p.role === 'Wicket-keeper');
    
    // Shuffle each category
    shuffle(batsmen);
    shuffle(bowlers);
    shuffle(allrounders);
    shuffle(keepers);
    
    const sets = [];
    const totalPlayers = allPlayers.length;
    const numSets = Math.ceil(totalPlayers / 27);
    
    // Distribution per set: ~10 batsmen, ~9 bowlers, ~5 all-rounders, ~3 keepers
    for (let setNum = 0; setNum < numSets; setNum++) {
        const set = [];
        
        // Add batsmen
        for (let i = 0; i < 10 && batsmen.length > 0; i++) {
            set.push(batsmen.shift());
        }
        
        // Add bowlers
        for (let i = 0; i < 9 && bowlers.length > 0; i++) {
            set.push(bowlers.shift());
        }
        
        // Add all-rounders
        for (let i = 0; i < 5 && allrounders.length > 0; i++) {
            set.push(allrounders.shift());
        }
        
        // Add keepers
        for (let i = 0; i < 3 && keepers.length > 0; i++) {
            set.push(keepers.shift());
        }
        
        // Add remaining to reach 27 (or less for last set)
        while (set.length < 27 && (batsmen.length > 0 || bowlers.length > 0 || allrounders.length > 0 || keepers.length > 0)) {
            if (batsmen.length > 0) set.push(batsmen.shift());
            else if (bowlers.length > 0) set.push(bowlers.shift());
            else if (allrounders.length > 0) set.push(allrounders.shift());
            else if (keepers.length > 0) set.push(keepers.shift());
        }
        
        shuffle(set); // Shuffle the set
        sets.push(set);
    }
    
    return sets;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

window.createRoom = async function() {
    const roomId = document.getElementById('roomId').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const teamName = document.getElementById('teamSelect').value;
    const username = document.getElementById('username').value.trim();
    
    if (!roomId || !roomPassword || !teamName || !username) {
        alert('Please fill all fields!');
        return;
    }
    
    try {
        // Make sure players are loaded
        if (allPlayers.length === 0) {
            console.log('⏳ Waiting for players to load...');
            await loadPlayersFromCSV();
        }
        
        if (allPlayers.length === 0) {
            alert('❌ No players loaded!\n\nPlayers.csv file is not loading.\n\nPossible fixes:\n1. Make sure players.csv is uploaded to GitHub\n2. Clear your browser cache (Ctrl+Shift+R)\n3. Check console (F12) for errors');
            console.error('❌ CRITICAL: allPlayers is empty!');
            console.error('Check if players.csv exists at:', window.location.origin + window.location.pathname.replace('index.html', '') + 'players.csv');
            return;
        }
        
        console.log(`📊 ${allPlayers.length} players loaded, creating room...`);
        
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        
        if (snapshot.exists()) {
            alert('❌ Room ID already exists! Choose a different ID or join existing room.');
            return;
        }
        
        currentRoomId = roomId;
        currentRoomPassword = roomPassword;
        isHost = true;
        
        const team = teams.find(t => t.name === teamName);
        team.owner = username;
        currentUser = { team: teamName, username: username, isHost: true };
        
        // Generate unique participant ID
        participantId = `${username}_${Date.now()}`;
        
        // Generate random sets from loaded players
        const playerSets = generatePlayerSets();
        console.log(`✅ Generated ${playerSets.length} player sets`);
        
        // Initialize participants structure with presence tracking
        participants = {};
        participants[participantId] = {
            username: username,
            team: teamName,
            ready: false,
            isHost: true,
            online: true,
            joinedAt: Date.now()
        };
        
        await set(roomRef, {
            password: roomPassword,
            host: username,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
            teams: teams,
            playerSets: playerSets,
            currentSetNumber: 1,
            currentSet: playerSets[0] || [],
            auctionStarted: false,
            currentPlayer: null,
            history: [],
            participants: participants
        });
        
        // Setup presence system for disconnect detection
        setupPresenceSystem();
        
        console.log('✅ Room created:', roomId);
        speak(`Welcome host ${username}! Waiting for players to join.`);
        
        showApp();
        setupFirebaseListeners();
        
    } catch (error) {
        console.error('Error creating room:', error);
        alert(`Error creating room: ${error.message}\n\nPlease check Firebase database rules are set correctly.`);
    }
}

window.joinRoom = async function() {
    const roomId = document.getElementById('roomId').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const teamName = document.getElementById('teamSelect').value;
    const username = document.getElementById('username').value.trim();
    
    if (!roomId || !roomPassword || !teamName || !username) {
        alert('Please fill all fields!');
        return;
    }
    
    try {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        
        if (!snapshot.exists()) {
            alert('❌ Room not found! Check Room ID or create a new room.');
            return;
        }
        
        const roomData = snapshot.val();
        
        // Check if room has expired (24 hours old)
        if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
            // Delete the expired room
            await remove(roomRef);
            alert('❌ This room has expired (rooms are deleted after 24 hours).\n\nPlease create a new room!');
            return;
        }
        
        if (roomData.password !== roomPassword) {
            alert('❌ Incorrect password!');
            return;
        }
        
        currentRoomId = roomId;
        currentRoomPassword = roomPassword;
        isHost = false;
        
        // Get teams from room data
        teams = roomData.teams || teams;
        const team = teams.find(t => t.name === teamName);
        
        if (!team) {
            alert(`❌ Team ${teamName} not found!`);
            return;
        }
        
        // Check if team is already taken
        participants = roomData.participants || {};
        const teamTaken = Object.values(participants).some(p => p.team === teamName && p.online);
        
        if (teamTaken) {
            const existingOwner = Object.values(participants).find(p => p.team === teamName && p.online);
            alert(`❌ ${teamName} is already taken by ${existingOwner.username}!\n\nPlease choose a different team.`);
            return;
        }
        
        team.owner = username;
        currentUser = { team: teamName, username: username, isHost: false };
        
        // Generate unique participant ID
        participantId = `${username}_${Date.now()}`;
        
        // Check if username already exists and is online
        const usernameTaken = Object.values(participants).some(p => 
            p.username === username && p.online && p.team !== teamName
        );
        
        if (usernameTaken) {
            alert(`❌ Username "${username}" is already in use!\n\nPlease choose a different name.`);
            return;
        }
        
        // Add participant with presence tracking
        participants[participantId] = {
            username: username,
            team: teamName,
            ready: false,
            isHost: false,
            online: true,
            joinedAt: Date.now()
        };
        
        console.log('Updating room with new participant:', username);
        
        await update(ref(database, `rooms/${roomId}`), {
            teams: teams,
            participants: participants
        });
        
        // Setup presence system for disconnect detection
        setupPresenceSystem();
        
        // Announce join
        await addToHistory(`${username} joined as ${teamName}`, 'info');
        
        console.log('✅ Joined room:', roomId);
        speak(`Welcome ${username}! Click Ready when you're set.`);
        
        showApp();
        setupFirebaseListeners();
        
    } catch (error) {
        console.error('Error joining room:', error);
        alert(`Error joining room: ${error.message}\n\nPlease try again or check your internet connection.`);
    }
}

// Setup presence system to track online/offline status
function setupPresenceSystem() {
    if (!currentRoomId || !participantId) return;
    
    const participantRef = ref(database, `rooms/${currentRoomId}/participants/${participantId}`);
    
    // When user disconnects, mark as offline
    onDisconnect(participantRef).update({
        online: false,
        leftAt: Date.now()
    });
    
    // Set online status
    update(participantRef, {
        online: true
    });
    
    console.log('✅ Presence system setup for participant:', participantId);
}

function setupFirebaseListeners() {
    const roomRef = ref(database, `rooms/${currentRoomId}`);
    
    roomDataListener = onValue(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            alert('Room has been deleted!');
            logout();
            return;
        }
        
        const data = snapshot.val();
        
        // Check if room expired
        if (data.expiresAt && Date.now() > data.expiresAt) {
            alert('⏰ This room has expired (24 hours old).\n\nRooms are automatically deleted after 1 day.');
            remove(roomRef);
            logout();
            return;
        }
        
        teams = data.teams;
        renderTeams();
        updatePurse();
        
        currentSet = data.currentSet || [];
        currentSetNumber = data.currentSetNumber || 1;
        players = currentSet;
        
        // Only render if we have players
        if (players && players.length > 0) {
            renderPlayers();
            updateStats();
        } else {
            console.warn('⚠️ No players in current set');
            const container = document.getElementById('playersList');
            if (container) {
                container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No players loaded yet. Waiting for host to start...</p>';
            }
        }
        
        auctionHistory = data.history || [];
        renderHistory();
        
        // Track previous participants for join/leave notifications
        const previousParticipants = { ...participants };
        participants = data.participants || {};
        
        // Check for new joins or leaves
        checkParticipantChanges(previousParticipants, participants);
        
        renderParticipants();
        
        console.log('📊 Current participants:', participants);
        console.log('👤 Current user:', currentUser);
        console.log('🎮 Total participants:', Object.keys(participants).length);
        
        // Update current user's ready button state
        if (currentUser && participantId && participants[participantId]) {
            const readyBtn = document.getElementById('readyBtn');
            if (readyBtn) {
                const isReady = participants[participantId].ready || false;
                readyBtn.textContent = isReady ? '✅ Ready!' : '⏸️ Not Ready';
                readyBtn.style.background = isReady ? '#4CAF50' : '#ff9800';
            }
        }
        
        // Check if all ready and show popup to host
        if (isHost && !data.auctionStarted) {
            checkAllReady();
        }
        
        // Update auction started state
        if (data.auctionStarted && !currentPlayerOnAuction && !data.currentPlayer) {
            // Auction started but no player selected - show message
            document.getElementById('noPlayerMessage').style.display = 'block';
        }
        
        if (data.currentPlayer) {
            const savedPlayer = data.currentPlayer;
            const player = players.find(p => p.id === savedPlayer.id);
            
            if (player && player.status === 'unsold') {
                const bidChanged = (currentBid !== savedPlayer.currentBid) || 
                                 (highestBidder !== savedPlayer.highestBidder);
                
                currentPlayerOnAuction = player;
                currentBid = savedPlayer.currentBid;
                highestBidder = savedPlayer.highestBidder;
                lastBidTime = savedPlayer.lastBidTime || Date.now();
                
                displayCurrentPlayer();
                
                if (bidChanged || !auctionTimer) {
                    startAuctionTimer();
                }
            }
        } else if (currentPlayerOnAuction) {
            stopAuctionTimer();
            resetAuction();
        }
    });
    
    console.log('✅ Firebase listeners setup');
}

// Check for participant changes and show notifications
function checkParticipantChanges(previous, current) {
    if (!previous || Object.keys(previous).length === 0) return;
    
    // Check for new joins (online participants that weren't in previous)
    Object.keys(current).forEach(pid => {
        if (current[pid].online && (!previous[pid] || !previous[pid].online)) {
            // Someone joined or came online
            if (pid !== participantId) { // Don't notify for self
                showNotification(`${current[pid].username} joined the room`, 'join');
            }
        }
    });
    
    // Check for leaves (was online, now offline)
    Object.keys(previous).forEach(pid => {
        if (previous[pid].online && current[pid] && !current[pid].online) {
            // Someone left or went offline
            if (pid !== participantId) { // Don't notify for self
                showNotification(`${previous[pid].username} left the room`, 'leave');
            }
        }
    });
}

// Show notification toast
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'join' ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' : 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)'};
        color: white;
        border-radius: 10px;
        font-weight: bold;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = `${type === 'join' ? '➕' : '➖'} ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    document.getElementById('currentTeamName').textContent = currentUser.team;
    document.getElementById('currentUsername').textContent = currentUser.username;
    document.getElementById('currentRoomId').textContent = `Room: ${currentRoomId}`;
    document.getElementById('userRole').textContent = isHost ? '👑 HOST' : '👤 PLAYER';
    
    // Initialize ready button state
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn && participantId && participants[participantId]) {
        const isReady = participants[participantId].ready;
        readyBtn.textContent = isReady ? '✅ Ready!' : '⏸️ Not Ready';
        readyBtn.style.background = isReady ? '#4CAF50' : '#ff9800';
    }
    
    // Show/hide host controls
    if (!isHost) {
        const hostControls = document.querySelectorAll('.host-only');
        hostControls.forEach(el => el.style.display = 'none');
    }
    
    renderTeams();
    renderPlayers();
    updateStats();
    updatePurse();
    renderHistory();
    renderParticipants();
}

window.shareRoom = function() {
    if (!currentRoomId || !currentRoomPassword) {
        alert('No room to share!');
        return;
    }
    
    // Create shareable URL with room credentials as URL parameters
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?room=${encodeURIComponent(currentRoomId)}&pass=${encodeURIComponent(currentRoomPassword)}`;
    
    // Create a beautiful share modal
    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; justify-content: center; align-items: center;';
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%); border: 4px solid #d4af37; border-radius: 20px; padding: 40px; max-width: 600px; width: 90%; box-shadow: 0 20px 60px rgba(212, 175, 55, 0.5);">
            <h2 style="color: #d4af37; text-align: center; margin-bottom: 25px; font-size: 2em;">📤 Share Auction Room</h2>
            
            <div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; margin-bottom: 25px; border: 2px solid #444;">
                <div style="margin-bottom: 15px;">
                    <label style="color: #888; font-size: 0.9em; display: block; margin-bottom: 5px;">Room ID</label>
                    <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; color: #d4af37; font-size: 1.2em; font-weight: bold; font-family: monospace;">
                        ${currentRoomId}
                    </div>
                </div>
                <div>
                    <label style="color: #888; font-size: 0.9em; display: block; margin-bottom: 5px;">Password</label>
                    <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; color: #d4af37; font-size: 1.2em; font-weight: bold; font-family: monospace;">
                        ${currentRoomPassword}
                    </div>
                </div>
            </div>
            
            <div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; margin-bottom: 25px; border: 2px solid #444;">
                <label style="color: #888; font-size: 0.9em; display: block; margin-bottom: 10px;">🔗 Direct Join Link</label>
                <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; color: #fff; font-size: 0.95em; word-break: break-all; font-family: monospace; max-height: 80px; overflow-y: auto;">
                    ${shareUrl}
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <button onclick="copyToClipboard('${shareUrl.replace(/'/g, "\\'")}', 'link')" style="padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border: none; border-radius: 10px; color: white; font-size: 1.1em; font-weight: bold; cursor: pointer; transition: all 0.3s;">
                    📋 Copy Link
                </button>
                <button onclick="shareViaApps('${shareUrl.replace(/'/g, "\\'")}', '${currentRoomId}', '${currentRoomPassword}')" style="padding: 15px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border: none; border-radius: 10px; color: white; font-size: 1.1em; font-weight: bold; cursor: pointer; transition: all 0.3s;">
                    📱 Share
                </button>
            </div>
            
            <button onclick="document.getElementById('shareModal').remove()" style="width: 100%; padding: 15px; background: #ff4444; border: none; border-radius: 10px; color: white; font-size: 1.1em; font-weight: bold; cursor: pointer; transition: all 0.3s;">
                Close
            </button>
            
            <p style="text-align: center; color: #666; margin-top: 20px; font-size: 0.85em;">
                💡 Friends can click the link to join directly with credentials pre-filled!
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

window.copyToClipboard = async function(text, type) {
    try {
        await navigator.clipboard.writeText(text);
        
        // Show success message
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = type === 'link' ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
        }, 2000);
        
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        alert('Copied to clipboard!');
    }
}

window.shareViaApps = function(url, roomId, password) {
    const shareText = `🏏 Join my IPL Auction!

🔗 Click here to join: ${url}

Or enter manually:
🆔 Room ID: ${roomId}
🔐 Password: ${password}

Let's start bidding! 🎉`;
    
    // Try native share API (works on mobile)
    if (navigator.share) {
        navigator.share({
            title: 'Join IPL Auction Room',
            text: shareText,
            url: url
        }).catch((error) => {
            console.log('Share cancelled or failed:', error);
        });
    } else {
        // Fallback - copy to clipboard
        copyToClipboard(shareText, 'text');
        alert('Share text copied to clipboard! You can paste it in WhatsApp, Telegram, etc.');
    }
}

window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        // Mark participant as offline before leaving
        if (currentRoomId && participantId) {
            update(ref(database, `rooms/${currentRoomId}/participants/${participantId}`), {
                online: false,
                leftAt: Date.now()
            });
        }
        
        if (roomDataListener) roomDataListener();
        if (auctionTimer) clearInterval(auctionTimer);
        
        currentUser = null;
        currentRoomId = null;
        participantId = null;
        isHost = false;
        
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        
        location.reload();
    }
}

window.toggleReady = async function() {
    if (!currentUser || !currentRoomId || !participantId) return;
    
    const currentReady = participants[participantId]?.ready || false;
    const newReady = !currentReady;
    
    // Update in Firebase
    await update(ref(database, `rooms/${currentRoomId}/participants/${participantId}`), {
        ready: newReady
    });
    
    // Update button UI
    const btn = document.getElementById('readyBtn');
    if (btn) {
        btn.textContent = newReady ? '✅ Ready!' : '⏸️ Not Ready';
        btn.style.background = newReady ? '#4CAF50' : '#ff9800';
    }
    
    console.log(`${currentUser.username} is now ${newReady ? 'ready' : 'not ready'}`);
}

function renderParticipants() {
    const container = document.getElementById('participantsList');
    if (!container) return;
    
    container.innerHTML = '<h3 style="color: #d4af37; margin-bottom: 10px;">👥 Participants</h3>';
    
    if (!participants || typeof participants !== 'object' || Object.keys(participants).length === 0) {
        container.innerHTML += '<p style="color: #666; text-align: center; padding: 10px;">Waiting for participants...</p>';
        return;
    }
    
    let validCount = 0;
    let readyCount = 0;
    let onlineCount = 0;
    
    // Filter and sort participants
    const participantList = Object.entries(participants)
        .filter(([pid, p]) => p && typeof p === 'object')
        .sort(([pidA, a], [pidB, b]) => {
            // Sort: host first, then by online status, then by join time
            if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
            if (a.online !== b.online) return a.online ? -1 : 1;
            return (a.joinedAt || 0) - (b.joinedAt || 0);
        });
    
    participantList.forEach(([pid, p]) => {
        validCount++;
        if (p.ready && p.online) readyCount++;
        if (p.online) onlineCount++;
        
        const div = document.createElement('div');
        div.style.cssText = `
            padding: 12px;
            margin: 8px 0;
            background: ${p.online ? 'rgba(76, 175, 80, 0.1)' : 'rgba(68, 68, 68, 0.3)'};
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 2px solid ${p.online ? '#4CAF50' : '#666'};
            opacity: ${p.online ? '1' : '0.5'};
            transition: all 0.3s;
        `;
        
        const isCurrentUser = participantId && pid === participantId;
        if (isCurrentUser) {
            div.style.borderColor = '#d4af37';
            div.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.3)';
        }
        
        const statusDot = p.online ? '🟢' : '⚫';
        const hostIcon = p.isHost ? '👑 ' : '';
        const youLabel = isCurrentUser ? ' <span style="color: #d4af37;">(You)</span>' : '';
        
        div.innerHTML = `
            <div>
                <div style="font-weight: bold; color: #fff; display: flex; align-items: center; gap: 5px;">
                    ${statusDot} ${hostIcon}${p.username}${youLabel}
                </div>
                <div style="font-size: 0.85em; color: #888; margin-top: 3px;">
                    ${p.team || 'No team'}
                </div>
            </div>
            <span style="color: ${p.ready ? '#4CAF50' : '#ff9800'}; font-weight: bold; font-size: 0.9em;">
                ${p.online ? (p.ready ? '✅ Ready' : '⏸️ Not Ready') : '💤 Offline'}
            </span>
        `;
        container.appendChild(div);
    });
    
    // Add summary footer
    const summary = document.createElement('div');
    summary.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 2px solid #444; text-align: center; color: #888; font-size: 0.9em;';
    summary.innerHTML = `
        <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 10px;">
            <span>👥 Total: <strong style="color: #d4af37;">${validCount}</strong></span>
            <span>🟢 Online: <strong style="color: #4CAF50;">${onlineCount}</strong></span>
            <span>✅ Ready: <strong style="color: #4CAF50;">${readyCount}</strong>/<strong style="color: #fff;">${onlineCount}</strong></span>
        </div>
    `;
    container.appendChild(summary);
}

function checkAllReady() {
    if (!participants || typeof participants !== 'object') return;
    
    const participantList = Object.values(participants).filter(p => p && typeof p === 'object' && p.online);
    
    if (participantList.length === 0) return;
    
    const allReady = participantList.every(p => p.ready);
    const hasPlayers = players && players.length > 0;
    
    if (allReady && hasPlayers && participantList.length > 0) {
        // Remove any existing popup first
        const existingPopup = document.getElementById('startAuctionPopup');
        if (existingPopup) return; // Already showing
        
        // Show popup to host
        const popup = document.createElement('div');
        popup.id = 'startAuctionPopup';
        popup.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; justify-content: center; align-items: center;';
        popup.innerHTML = `
            <div style="background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%); border: 4px solid #d4af37; border-radius: 20px; padding: 50px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(212, 175, 55, 0.5);">
                <h2 style="color: #d4af37; font-size: 2.5em; margin-bottom: 20px;">🎉 All Players Ready!</h2>
                <p style="color: #fff; margin-bottom: 15px; font-size: 1.2em;">
                    <strong>${participantList.length} participants</strong> are ready to start!
                </p>
                <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin: 20px 0; max-height: 200px; overflow-y: auto;">
                    ${participantList.map(p => `
                        <div style="padding: 8px; color: ${p.isHost ? '#d4af37' : '#fff'};">
                            ${p.isHost ? '👑' : '👤'} ${p.username} - ${p.team}
                        </div>
                    `).join('')}
                </div>
                <button onclick="startAuction()" style="width: 100%; padding: 25px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border: none; border-radius: 12px; color: white; font-size: 1.5em; font-weight: bold; cursor: pointer; margin-top: 20px; box-shadow: 0 10px 30px rgba(76, 175, 80, 0.4); transition: all 0.3s;">
                    🚀 START AUCTION NOW
                </button>
            </div>
        `;
        document.body.appendChild(popup);
        speak('All players are ready! You can start the auction now!');
    } else if (!allReady || !hasPlayers) {
        // Remove popup if conditions no longer met
        const existingPopup = document.getElementById('startAuctionPopup');
        if (existingPopup) {
            existingPopup.remove();
        }
    }
}

window.startAuction = async function() {
    if (!isHost) return;
    
    await update(ref(database, `rooms/${currentRoomId}`), {
        auctionStarted: true
    });
    
    const popup = document.getElementById('startAuctionPopup');
    if (popup) popup.remove();
    
    speak('The auction has begun! Let the bidding start!');
}

function startAuctionTimer() {
    stopAuctionTimer();
    timeRemaining = 15;
    lastBidTime = Date.now();
    updateTimerDisplay();
    
    auctionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastBidTime) / 1000);
        timeRemaining = Math.max(0, 15 - elapsed);
        updateTimerDisplay();
        
        if (timeRemaining === 0) {
            stopAuctionTimer();
            autoSellPlayer();
        }
    }, 100);
}

function stopAuctionTimer() {
    if (auctionTimer) {
        clearInterval(auctionTimer);
        auctionTimer = null;
    }
    updateTimerDisplay();
}

function updateTimerDisplay() {
    if (!timerDisplay) timerDisplay = document.getElementById('auctionTimer');
    
    if (timerDisplay && currentPlayerOnAuction) {
        if (timeRemaining > 0) {
            timerDisplay.textContent = `⏱️ ${timeRemaining}s`;
            timerDisplay.style.color = timeRemaining <= 5 ? '#ff4444' : '#d4af37';
            timerDisplay.style.animation = timeRemaining <= 5 ? 'pulse 0.5s infinite' : 'none';
        } else {
            timerDisplay.textContent = '⏱️ Time Up!';
            timerDisplay.style.color = '#ff4444';
        }
    }
}

async function autoSellPlayer() {
    if (!currentPlayerOnAuction || !currentRoomId) return;
    
    if (highestBidder && currentBid > 0) {
        const team = teams.find(t => t.name === highestBidder);
        
        if (team && team.purse >= currentBid) {
            team.purse -= currentBid;
            team.spent += currentBid;
            team.players.push({
                name: currentPlayerOnAuction.name,
                role: currentPlayerOnAuction.role,
                price: currentBid
            });
            
            const playerIndex = players.findIndex(p => p.id === currentPlayerOnAuction.id);
            players[playerIndex].status = 'sold';
            players[playerIndex].soldTo = highestBidder;
            players[playerIndex].soldPrice = currentBid;
            
            await addToHistory(`⏰ ${currentPlayerOnAuction.name} AUTO-SOLD to ${highestBidder} for ₹${currentBid.toFixed(1)}Cr`, 'sold');
            speak(`Time up! ${currentPlayerOnAuction.name} sold to ${highestBidder}!`);
            
            await saveToFirebase();
            await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
            resetAuction();
        }
    } else {
        await addToHistory(`⏰ ${currentPlayerOnAuction.name} went UNSOLD`, 'unsold');
        speak(`Time up! ${currentPlayerOnAuction.name} remains unsold.`);
        
        await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
        resetAuction();
    }
}

function renderTeams() {
    const container = document.getElementById('teamsList');
    container.innerHTML = '';
    
    teams.forEach(team => {
        const isActive = currentUser && team.name === currentUser.team;
        const card = document.createElement('div');
        card.className = `team-card ${isActive ? 'active' : ''}`;
        card.style.cursor = 'pointer';
        card.onclick = () => showTeamDetails(team);
        
        card.innerHTML = `
            <h3>${team.name}</h3>
            <div class="team-stat"><span>Owner:</span> <strong>${team.owner || 'Not Assigned'}</strong></div>
            <div class="team-stat"><span>Purse:</span> <strong style="color: ${team.purse < 20 ? '#ff4444' : '#4CAF50'};">₹${team.purse.toFixed(1)}Cr</strong></div>
            <div class="team-stat"><span>Spent:</span> <strong>₹${team.spent.toFixed(1)}Cr</strong></div>
            <div class="team-stat"><span>Players:</span> <strong>${team.players.length}</strong></div>
        `;
        container.appendChild(card);
    });
}

function showTeamDetails(team) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center;';
    
    let playersHTML = '<p style="color: #666; text-align: center;">No players bought yet</p>';
    
    if (team.players.length > 0) {
        playersHTML = '<div style="max-height: 400px; overflow-y: auto;">';
        team.players.forEach(p => {
            playersHTML += `
                <div style="padding: 12px; margin: 8px 0; background: rgba(0,0,0,0.5); border-radius: 8px; border-left: 4px solid #d4af37;">
                    <strong style="color: #d4af37; font-size: 1.1em;">${p.name}</strong>
                    <div style="color: #888; font-size: 0.9em; margin-top: 5px;">
                        ${p.role} • ₹${p.price.toFixed(1)}Cr
                    </div>
                </div>
            `;
        });
        playersHTML += '</div>';
    }
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1a1f3a 0%, #2a2f4a 100%); border: 3px solid #d4af37; border-radius: 20px; padding: 30px; max-width: 500px; width: 90%;">
            <h2 style="color: #d4af37; text-align: center; margin-bottom: 20px;">${team.name}</h2>
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span style="color: #888;">Owner:</span>
                    <strong style="color: #fff;">${team.owner || 'Not Assigned'}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span style="color: #888;">Purse Remaining:</span>
                    <strong style="color: ${team.purse < 20 ? '#ff4444' : '#4CAF50'};">₹${team.purse.toFixed(1)}Cr</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span style="color: #888;">Amount Spent:</span>
                    <strong style="color: #fff;">₹${team.spent.toFixed(1)}Cr</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span style="color: #888;">Players:</span>
                    <strong style="color: #fff;">${team.players.length}</strong>
                </div>
            </div>
            <h3 style="color: #d4af37; margin-bottom: 10px;">Squad</h3>
            ${playersHTML}
            <button onclick="this.parentElement.parentElement.remove()" style="width: 100%; margin-top: 20px; padding: 15px; background: #ff4444; border: none; border-radius: 10px; color: white; font-size: 1.1em; font-weight: bold; cursor: pointer;">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function renderPlayers() {
    const container = document.getElementById('playersList');
    container.innerHTML = '';
    
    const roleFilter = document.getElementById('roleFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    
    let filteredPlayers = players || [];
    
    if (roleFilter !== 'all') {
        filteredPlayers = filteredPlayers.filter(p => p.role === roleFilter);
    }
    
    if (statusFilter !== 'all') {
        filteredPlayers = filteredPlayers.filter(p => p.status === statusFilter);
    }
    
    if (filteredPlayers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No players match the filters</p>';
        return;
    }
    
    filteredPlayers.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.style.borderLeftColor = player.status === 'sold' ? '#4CAF50' : '#d4af37';
        
        card.innerHTML = `
            <h3>${player.name}</h3>
            <div class="player-info">
                <span>Role:</span> <strong>${player.role}</strong>
            </div>
            <div class="player-info">
                <span>Country:</span> <strong>${player.country}</strong>
            </div>
            <div class="player-info">
                <span>Base Price:</span> <strong>₹${player.basePrice}Cr</strong>
            </div>
            ${player.status === 'sold' ? `
                <div style="margin-top: 10px; padding: 10px; background: rgba(76, 175, 80, 0.2); border-radius: 5px; border: 1px solid #4CAF50;">
                    <div class="player-info">
                        <span>Sold To:</span> <strong style="color: #4CAF50;">${player.soldTo}</strong>
                    </div>
                    <div class="player-info">
                        <span>Price:</span> <strong style="color: #4CAF50;">₹${player.soldPrice.toFixed(1)}Cr</strong>
                    </div>
                </div>
            ` : ''}
        `;
        
        container.appendChild(card);
    });
}

window.filterPlayers = function() {
    renderPlayers();
}

async function selectPlayer(player) {
    if (player.status !== 'unsold') {
        alert('This player has already been sold!');
        return;
    }
    
    currentPlayerOnAuction = player;
    currentBid = player.basePrice;
    highestBidder = null;
    lastBidTime = Date.now();
    
    await update(ref(database, `rooms/${currentRoomId}/currentPlayer`), {
        id: player.id,
        name: player.name,
        currentBid: currentBid,
        highestBidder: highestBidder,
        lastBidTime: lastBidTime
    });
    
    speak(`Now on auction: ${player.name}`);
}

function displayCurrentPlayer() {
    document.getElementById('playerCard').style.display = 'block';
    document.getElementById('noPlayerMessage').style.display = 'none';
    
    const playerNameEl = document.getElementById('playerName');
    if (currentPlayerOnAuction.country !== 'India') {
        playerNameEl.innerHTML = `
            <img src="https://flagcdn.com/w40/${getCountryCode(currentPlayerOnAuction.country).toLowerCase()}.png" 
                 style="width: 30px; height: 20px; margin-right: 8px; vertical-align: middle;">
            ${currentPlayerOnAuction.name}
        `;
    } else {
        playerNameEl.textContent = currentPlayerOnAuction.name;
    }
    
    document.getElementById('playerRole').textContent = currentPlayerOnAuction.role;
    document.getElementById('playerCountry').textContent = currentPlayerOnAuction.country;
    document.getElementById('playerBasePrice').textContent = `₹${currentPlayerOnAuction.basePrice}Cr`;
    document.getElementById('playerBatting').textContent = currentPlayerOnAuction.style;
    document.getElementById('currentBidAmount').textContent = `₹${currentBid.toFixed(1)}Cr`;
    document.getElementById('highestBidder').textContent = highestBidder || 'None';
    document.getElementById('currentSetInfo').textContent = `Set ${currentSetNumber} • Player ${players.filter(p => p.status === 'sold').length + 1}/${players.length}`;
}

function getCountryCode(country) {
    const codes = {
        'India': 'IN', 'Australia': 'AU', 'England': 'GB', 'South Africa': 'ZA',
        'New Zealand': 'NZ', 'West Indies': 'WI', 'Pakistan': 'PK', 'Sri Lanka': 'LK',
        'Bangladesh': 'BD', 'Afghanistan': 'AF', 'Ireland': 'IE', 'Zimbabwe': 'ZW',
        'Netherlands': 'NL', 'Scotland': 'GB-SCT', 'UAE': 'AE', 'Nepal': 'NP',
        'Oman': 'OM', 'PNG': 'PG', 'USA': 'US', 'Canada': 'CA'
    };
    return codes[country] || 'IN';
}

window.startNextPlayer = async function() {
    if (!isHost) {
        alert('Only the host can start the next player!');
        return;
    }
    
    const availablePlayers = players.filter(p => p.status === 'unsold');
    if (availablePlayers.length > 0) {
        await selectPlayer(availablePlayers[0]);
    } else {
        alert('All players in this set are done! 🎉');
    }
}

window.placeBid = async function() {
    if (!currentPlayerOnAuction) {
        alert('No player on auction!');
        return;
    }
    
    if (!currentUser) {
        alert('Please login first!');
        return;
    }
    
    const team = teams.find(t => t.name === currentUser.team);
    const bidIncrement = 0.5;
    const newBid = currentBid + bidIncrement;
    
    if (team.purse < newBid) {
        alert(`Insufficient purse! You have ₹${team.purse.toFixed(1)}Cr remaining.`);
        return;
    }
    
    currentBid = newBid;
    highestBidder = currentUser.team;
    lastBidTime = Date.now();
    
    await update(ref(database, `rooms/${currentRoomId}/currentPlayer`), {
        currentBid: currentBid,
        highestBidder: highestBidder,
        lastBidTime: lastBidTime
    });
    
    speak(`${currentUser.team} bids ${currentBid.toFixed(1)} crore rupees!`);
}

window.soldPlayer = async function() {
    if (!isHost) {
        alert('Only the host can mark players as sold!');
        return;
    }
    
    if (!currentPlayerOnAuction) {
        alert('No player on auction!');
        return;
    }
    
    if (!highestBidder) {
        alert('No bids placed yet!');
        return;
    }
    
    const team = teams.find(t => t.name === highestBidder);
    
    if (team.purse < currentBid) {
        alert('Insufficient purse!');
        return;
    }
    
    stopAuctionTimer();
    
    team.purse -= currentBid;
    team.spent += currentBid;
    team.players.push({
        name: currentPlayerOnAuction.name,
        role: currentPlayerOnAuction.role,
        price: currentBid
    });
    
    const playerIndex = players.findIndex(p => p.id === currentPlayerOnAuction.id);
    players[playerIndex].status = 'sold';
    players[playerIndex].soldTo = highestBidder;
    players[playerIndex].soldPrice = currentBid;
    
    await addToHistory(`${currentPlayerOnAuction.name} SOLD to ${highestBidder} for ₹${currentBid.toFixed(1)}Cr`, 'sold');
    speak(`${currentPlayerOnAuction.name} sold to ${highestBidder}!`);
    
    await saveToFirebase();
    await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
    resetAuction();
}

window.unsoldPlayer = async function() {
    if (!isHost) {
        alert('Only the host can mark players as unsold!');
        return;
    }
    
    if (!currentPlayerOnAuction) {
        alert('No player on auction!');
        return;
    }
    
    stopAuctionTimer();
    
    await addToHistory(`${currentPlayerOnAuction.name} went UNSOLD`, 'unsold');
    speak(`${currentPlayerOnAuction.name} remains unsold.`);
    
    await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
    resetAuction();
}

function resetAuction() {
    currentPlayerOnAuction = null;
    currentBid = 0;
    highestBidder = null;
    
    document.getElementById('playerCard').style.display = 'none';
    document.getElementById('noPlayerMessage').style.display = 'block';
}

async function addToHistory(message, type) {
    const historyEntry = { 
        message, 
        type, 
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
    };
    
    auctionHistory.unshift(historyEntry);
    
    if (auctionHistory.length > 100) {
        auctionHistory = auctionHistory.slice(0, 100);
    }
    
    await update(ref(database, `rooms/${currentRoomId}`), {
        history: auctionHistory
    });
}

function renderHistory() {
    const container = document.getElementById('auctionHistory');
    container.innerHTML = '';
    
    if (auctionHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No history yet</p>';
        return;
    }
    
    auctionHistory.slice(0, 20).forEach(item => {
        const div = document.createElement('div');
        div.className = `history-item ${item.type}`;
        div.innerHTML = `<strong>${item.time}</strong> - ${item.message}`;
        container.appendChild(div);
    });
}

function updateStats() {
    const totalPlayersEl = document.getElementById('totalPlayers');
    const playersSoldEl = document.getElementById('playersSold');
    const playersRemainingEl = document.getElementById('playersRemaining');
    const totalSpentEl = document.getElementById('totalSpent');
    
    if (!totalPlayersEl || !playersSoldEl || !playersRemainingEl || !totalSpentEl) {
        return;
    }
    
    if (!players || !Array.isArray(players)) {
        totalPlayersEl.textContent = '0';
        playersSoldEl.textContent = '0';
        playersRemainingEl.textContent = '0';
        totalSpentEl.textContent = '₹0.0Cr';
        return;
    }
    
    totalPlayersEl.textContent = players.length;
    playersSoldEl.textContent = players.filter(p => p.status === 'sold').length;
    playersRemainingEl.textContent = players.filter(p => p.status === 'unsold').length;
    
    const totalSpent = teams.reduce((sum, team) => sum + team.spent, 0);
    totalSpentEl.textContent = `₹${totalSpent.toFixed(1)}Cr`;
}

function updatePurse() {
    if (currentUser) {
        const team = teams.find(t => t.name === currentUser.team);
        if (team) {
            document.getElementById('currentPurse').textContent = `₹${team.purse.toFixed(1)}Cr`;
        }
    }
}

async function saveToFirebase() {
    if (!currentRoomId) return;
    
    await update(ref(database, `rooms/${currentRoomId}`), {
        teams: teams,
        currentSet: players
    });
}

function speak(text) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    speechSynthesis.speak(utterance);
}

window.toggleVoice = function() {
    voiceEnabled = !voiceEnabled;
    const btn = document.querySelector('.voice-btn');
    btn.textContent = voiceEnabled ? '🔊' : '🔇';
}

window.refreshData = function() {
    renderTeams();
    renderPlayers();
    updateStats();
    updatePurse();
    renderHistory();
    renderParticipants();
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

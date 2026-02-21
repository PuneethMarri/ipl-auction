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

let auctionTimer = null;
let timeRemaining = 15;
let lastBidTime = null;
let timerDisplay = null;
let roomDataListener = null;
let auctionResolving = false;

// Run immediately at module load - DOM is ready because modules are deferred
populateTeamSelect();

window.onload = function() {
    loadPlayersFromCSV().then(async () => {
        console.log('✅ App initialized');

        // ⭐ Check for saved session - auto-rejoin on refresh
        const saved = localStorage.getItem('iplAuctionSession');
        if (saved) {
            try {
                const session = JSON.parse(saved);
                // Validate session has all required fields
                if (session.roomId && session.password && session.team && session.username) {
                    console.log('🔄 Restoring session for', session.username);
                    await autoRejoinSession(session);
                    return; // skip URL param handling below
                }
            } catch(e) {
                localStorage.removeItem('iplAuctionSession');
            }
        }
        
        // Check if URL has room parameters
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        const password = urlParams.get('pass');
        
        if (roomId && password) {
            setTimeout(() => {
                const roomIdInput = document.getElementById('roomId');
                const passwordInput = document.getElementById('roomPassword');
                
                if (roomIdInput) roomIdInput.value = roomId;
                if (passwordInput) passwordInput.value = password;
                
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
            }, 100);
        }
    });
};

async function autoRejoinSession(session) {
    try {
        const roomRef = ref(database, `rooms/${session.roomId}`);
        const snapshot = await get(roomRef);

        if (!snapshot.exists()) {
            console.log('Room no longer exists, clearing session');
            localStorage.removeItem('iplAuctionSession');
            return;
        }

        const roomData = snapshot.val();

        if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
            localStorage.removeItem('iplAuctionSession');
            return;
        }

        if (roomData.password !== session.password) {
            localStorage.removeItem('iplAuctionSession');
            return;
        }

        // Restore state
        currentRoomId = session.roomId;
        currentRoomPassword = session.password;

        teams = roomData.teams || teams;
        const isOriginalHost = roomData.host === session.username;
        isHost = isOriginalHost || (roomData.participants?.[session.username]?.isHost === true);

        currentUser = { team: session.team, username: session.username, isHost };

        // Re-mark online and restore isHost if needed
        await update(ref(database, `rooms/${session.roomId}/participants/${session.username}`), {
            online: true,
            isHost: isHost
        });

        // If original host is back, demote any temp host
        if (isOriginalHost) {
            const parts = roomData.participants || {};
            const updates = {};
            Object.keys(parts).forEach(name => {
                if (name !== session.username && parts[name].isHost) {
                    updates[`rooms/${session.roomId}/participants/${name}/isHost`] = false;
                }
            });
            if (Object.keys(updates).length > 0) await update(ref(database), updates);
            await update(ref(database, `rooms/${session.roomId}`), { host: session.username });
        }

        onDisconnect(ref(database, `rooms/${session.roomId}/participants/${session.username}/online`)).set(false);

        participants = roomData.participants || {};

        console.log('✅ Session restored for', session.username, isHost ? '(HOST)' : '');
        showApp();
        setupFirebaseListeners();

    } catch(e) {
        console.error('Auto-rejoin failed:', e);
        localStorage.removeItem('iplAuctionSession');
    }
}

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
        
        // Generate random sets from loaded players
        const playerSets = generatePlayerSets();
        console.log(`✅ Generated ${playerSets.length} player sets`);
        
        await set(roomRef, {
            password: roomPassword,
            host: username,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000),
            teams: teams,
            playerSets: playerSets,
            currentSetNumber: 1,
            currentSet: playerSets[0] || [],
            auctionStarted: false,
            currentPlayer: null,
            history: []
        });

        await update(ref(database, `rooms/${roomId}/participants/${username}`), {
            team: teamName,
            ready: false,
            isHost: true,
            online: true,
            joinedAt: Date.now()
        });

        // ⭐ Mark offline on disconnect
        onDisconnect(ref(database, `rooms/${roomId}/participants/${username}/online`)).set(false);

        console.log('✅ Room created:', roomId);
        // ⭐ Save session for refresh recovery
        localStorage.setItem('iplAuctionSession', JSON.stringify({
            roomId, password: roomPassword, team: teamName, username
        }));
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
        
        if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
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

        // Get teams from room data
        teams = roomData.teams || teams;
        const team = teams.find(t => t.name === teamName);
        
        if (!team) {
            alert(`❌ Team ${teamName} not found!`);
            return;
        }
        
        if (team.owner && team.owner !== username) {
            alert(`❌ ${teamName} is already taken by ${team.owner}!\n\nPlease choose a different team.`);
            return;
        }

        participants = roomData.participants || {};

        if (participants[username] && participants[username].team !== teamName) {
            alert(`❌ Username "${username}" is already taken!\n\nPlease use a different name.`);
            return;
        }

        // ⭐ Check if this user is the original host rejoining
        const isOriginalHost = roomData.host === username;
        isHost = isOriginalHost;

        // ⭐ If original host is rejoining, restore their host flag in all participants
        if (isOriginalHost) {
            // Demote anyone else who may have been promoted to host
            const updates = {};
            Object.keys(participants).forEach(name => {
                if (name !== username && participants[name].isHost) {
                    updates[`rooms/${roomId}/participants/${name}/isHost`] = false;
                }
            });
            if (Object.keys(updates).length > 0) await update(ref(database), updates);
            speak(`Welcome back ${username}! Host restored.`);
        } else {
            isHost = false;
            speak(`Welcome ${username}! Click Ready when you're set.`);
        }

        const updatedTeams = teams.map(t => t.name === teamName ? { ...t, owner: username } : t);
        await update(ref(database, `rooms/${roomId}`), { teams: updatedTeams });
        teams = updatedTeams;

        currentUser = { team: teamName, username: username, isHost: isHost };

        await update(ref(database, `rooms/${roomId}/participants/${username}`), {
            team: teamName,
            ready: participants[username]?.ready || false,
            isHost: isHost,
            online: true,
            joinedAt: participants[username]?.joinedAt || Date.now()
        });

        // ⭐ Mark offline on disconnect
        const presenceRef = ref(database, `rooms/${roomId}/participants/${username}/online`);
        onDisconnect(presenceRef).set(false);

        console.log('✅ Joined room:', roomId, isHost ? '(HOST)' : '');
        // ⭐ Save session for refresh recovery
        localStorage.setItem('iplAuctionSession', JSON.stringify({
            roomId, password: roomPassword, team: teamName, username
        }));
        
        showApp();
        setupFirebaseListeners();
        
    } catch (error) {
        console.error('Error joining room:', error);
        alert(`Error joining room: ${error.message}\n\nPlease try again or check your internet connection.`);
    }
}

async function checkAndTransferHost(data) {
    if (!currentRoomId || !participants) return;

    const partList = Object.entries(participants).filter(([, p]) => p && typeof p === 'object');
    if (partList.length === 0) return;

    // Find who currently has isHost = true
    const currentHostEntry = partList.find(([, p]) => p.isHost);
    const currentHostName = currentHostEntry ? currentHostEntry[0] : null;
    const currentHostData = currentHostEntry ? currentHostEntry[1] : null;

    // If host is online, nothing to do
    if (currentHostData && currentHostData.online) return;

    // Host is offline (or no host) — only the first online non-host should trigger transfer (avoid all clients doing it)
    const onlineParticipants = partList.filter(([, p]) => p.online);
    if (onlineParticipants.length === 0) return;

    // Only the "first" online participant (alphabetically) does the promotion to avoid race
    const [firstOnlineName] = onlineParticipants.sort((a, b) => a[0].localeCompare(b[0]))[0];
    if (currentUser.username !== firstOnlineName) return;

    // ⭐ Promote the first online participant to host
    const newHostName = firstOnlineName;
    console.log(`🔄 Host ${currentHostName} went offline. Promoting ${newHostName} to host.`);

    const updates = {};
    // Demote old host
    if (currentHostName) updates[`rooms/${currentRoomId}/participants/${currentHostName}/isHost`] = false;
    // Promote new host
    updates[`rooms/${currentRoomId}/participants/${newHostName}/isHost`] = true;
    // Update room's host field
    updates[`rooms/${currentRoomId}/host`] = newHostName;

    await update(ref(database), updates);

    // If WE are the new host, update local state and show host controls
    if (newHostName === currentUser.username) {
        isHost = true;
        currentUser.isHost = true;
        document.getElementById('userRole').textContent = '👑 HOST';
        document.querySelectorAll('.host-only').forEach(el => el.style.display = '');
        speak(`${currentHostName} disconnected. You are now the host!`);
        console.log('👑 You are now the host!');
    }
}

function setupFirebaseListeners() {
    const roomRef = ref(database, `rooms/${currentRoomId}`);
    
    roomDataListener = onValue(roomRef, async (snapshot) => {
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

        // ⭐ CRITICAL: If we are mid-sale, do NOT let Firebase overwrite our local state.
        // The listener fires on our own writes too — if we allow it to overwrite teams/players
        // mid-transaction, the sale gets lost and the player loops.
        if (auctionResolving) {
            console.log('⏸️ Skipping listener update — auction resolving in progress');
            return;
        }
        
        // Firebase may return teams as object with numeric keys - normalize to array
        if (data.teams) {
            teams = Array.isArray(data.teams) 
                ? data.teams 
                : Object.values(data.teams);
        }
        renderTeams();
        updatePurse();
        
        // Firebase stores arrays as objects with numeric keys - always normalize
        const rawSet = data.currentSet;
        if (!rawSet) {
            currentSet = [];
        } else if (Array.isArray(rawSet)) {
            currentSet = rawSet;
        } else {
            // Firebase converted array to object: {0: {...}, 1: {...}} → normalize back
            currentSet = Object.keys(rawSet)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => rawSet[k])
                .filter(p => p != null);
        }
        currentSetNumber = data.currentSetNumber || 1;
        players = [...currentSet];


        
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
        
        participants = (data.participants && typeof data.participants === 'object')
            ? data.participants
            : {};

        // ⭐ HOST TRANSFER: check if current host is offline and we need to promote someone
        await checkAndTransferHost(data);

        renderParticipants();
        
        console.log('📊 Current participants:', participants);
        console.log('👤 Current user:', currentUser);
        console.log('🎮 Total participants:', Object.keys(participants).length);
        
        // Update current user's ready button state
        if (currentUser && participants[currentUser.username]) {
            const readyBtn = document.getElementById('readyBtn');
            if (readyBtn) {
                const isReady = participants[currentUser.username].ready || false;
                readyBtn.textContent = isReady ? '✅ Ready!' : '⏸️ Not Ready';
                readyBtn.style.background = isReady ? '#4CAF50' : '#ff9800';
            }
        }
        
        // Check if all ready and show popup to host
        if (isHost && !data.auctionStarted) {
            checkAllReady();
        }

        // ⭐ Show auction complete screen to ALL clients
        if (data.auctionComplete && !document.getElementById('completionScreen')) {
            showCompletionScreen();
            return;
        }

        // ⭐ Show accelerated banner to non-host clients
        if (data.acceleratedAuction && !document.getElementById('accelBanner')) {
            const count = (data.acceleratedPlayers || []).length;
            showAcceleratedAuctionBanner(count);
        }
        
        // Update auction started state
        if (data.auctionStarted && !currentPlayerOnAuction && !data.currentPlayer) {
            document.getElementById('noPlayerMessage').style.display = 'block';
        }
        
        if (data.currentPlayer && !auctionResolving) {
            const savedPlayer = data.currentPlayer;
            const player = players.find(p => Number(p.id) === Number(savedPlayer.id));

            // Accept player if they are inauction or unsold (freshly selected)
            if (player && (player.status === 'inauction' || player.status === 'unsold' || !player.status)) {
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
        } else if (!data.currentPlayer && !auctionResolving && currentPlayerOnAuction) {
            stopAuctionTimer();
            resetAuction();
        }
    });
    
    console.log('✅ Firebase listeners setup');
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
    if (readyBtn && participants[currentUser.username]) {
        const isReady = participants[currentUser.username].ready;
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
        if (roomDataListener) roomDataListener();
        if (auctionTimer) clearInterval(auctionTimer);
        
        // ⭐ Clear saved session so refresh goes to login
        localStorage.removeItem('iplAuctionSession');

        currentUser = null;
        currentRoomId = null;
        isHost = false;
        
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        
        location.reload();
    }
}

window.toggleReady = async function() {
    if (!currentUser || !currentRoomId) return;
    
    const currentReady = participants[currentUser.username]?.ready || false;
    const newReady = !currentReady;
    
    // Update locally first
    if (!participants[currentUser.username]) {
        participants[currentUser.username] = {
            team: currentUser.team,
            ready: newReady,
            isHost: isHost
        };
    } else {
        participants[currentUser.username].ready = newReady;
    }
    
    // Update in Firebase
    await update(ref(database, `rooms/${currentRoomId}/participants/${currentUser.username}`), {
        ready: newReady,
        team: currentUser.team,
        isHost: isHost
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
    
    Object.keys(participants).forEach(username => {
        const p = participants[username];
        if (!p || typeof p !== 'object') return; // Skip invalid entries
        
        validCount++;
        if (p.ready) readyCount++;
        
        const div = document.createElement('div');
        div.style.cssText = 'padding: 10px; margin: 8px 0; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 2px solid #333;';
        
        const isCurrentUser = currentUser && username === currentUser.username;
        if (isCurrentUser) {
            div.style.borderColor = '#d4af37';
        }
        
        div.innerHTML = `
            <div>
                <div style="font-weight: bold; color: #fff;">
                    ${p.isHost ? '👑' : '👤'} ${username}
                </div>
                <div style="font-size: 0.85em; color: #888; margin-top: 3px;">
                    ${p.team || 'No team'}
                </div>
            </div>
            <span style="color: ${p.ready ? '#4CAF50' : '#ff9800'}; font-weight: bold; font-size: 0.9em;">
                ${p.ready ? '✅ Ready' : '⏸️ Not Ready'}
            </span>
        `;
        container.appendChild(div);
    });
    
    // Show count
    if (validCount > 0) {
        const countDiv = document.createElement('div');
        countDiv.style.cssText = 'text-align: center; color: #888; margin-top: 15px; padding-top: 15px; border-top: 2px solid #444; font-size: 0.9em;';
        countDiv.innerHTML = `${readyCount}/${validCount} Ready`;
        container.appendChild(countDiv);
    }
}

function checkAllReady() {
    if (!participants || typeof participants !== 'object') {
        console.log('No participants object');
        return;
    }
    
    const participantList = Object.values(participants).filter(p => p != null && typeof p === 'object');
    
    if (participantList.length === 0) {
        console.log('No valid participants');
        return;
    }
    
    const allReady = participantList.every(p => p.ready === true);
    const hasPlayers = participantList.length > 1;
    
    console.log(`Checking ready: ${participantList.filter(p => p.ready).length}/${participantList.length} ready, hasPlayers: ${hasPlayers}, allReady: ${allReady}`);
    
    if (allReady && hasPlayers && !document.getElementById('startAuctionPopup')) {
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
                <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin: 20px 0;">
                    ${participantList.map(p => {
                        const username = Object.keys(participants).find(k => participants[k] === p);
                        return `
                            <div style="padding: 8px; color: ${p.isHost ? '#d4af37' : '#fff'};">
                                ${p.isHost ? '👑' : '👤'} ${username} - ${p.team}
                            </div>
                        `;
                    }).join('')}
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
    if (!currentPlayerOnAuction || !currentRoomId || auctionResolving) return;
    auctionResolving = true;
    console.log("⏰ Auto-sell triggered for:", currentPlayerOnAuction.name);

    try {
        // CASE 1 — No bids
        if (!highestBidder || currentBid <= 0) {
            const playerIndex = players.findIndex(p => Number(p.id) === Number(currentPlayerOnAuction.id));
            if (playerIndex !== -1) {
                players[playerIndex].status = 'passed';
                players[playerIndex].soldTo = null;
                players[playerIndex].soldPrice = 0;
            }
            speak(`${currentPlayerOnAuction.name} remains unsold.`);
            const historyEntry = { message: `⏰ ${currentPlayerOnAuction.name} went UNSOLD (No bids)`, type: 'unsold', time: new Date().toLocaleTimeString(), timestamp: Date.now() };
            auctionHistory.unshift(historyEntry);

            await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
            await set(ref(database, `rooms/${currentRoomId}/history`), auctionHistory);
            await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
            resetAuction();
            renderPlayers(); renderHistory();

            setTimeout(async () => {
                auctionResolving = false;
                if (!isHost) return;
                const snap = await get(ref(database, `rooms/${currentRoomId}/acceleratedAuction`));
                if (snap.val() === true) {
                    const accelSnap = await get(ref(database, `rooms/${currentRoomId}/acceleratedPlayers`));
                    const accelRaw = accelSnap.val();
                    const accelPlayers = Array.isArray(accelRaw) ? accelRaw : Object.values(accelRaw || {});
                    const nextAccel = accelPlayers.find(p => !p.status || p.status === 'unsold');
                    if (nextAccel) await selectPlayerAccelerated(nextAccel);
                    else await showAuctionComplete();
                } else {
                    await startNextPlayer();
                }
            }, 1500);
            return;
        }

        // CASE 2 — Has bids
        const team = teams.find(t => t.name === highestBidder);
        if (!team) { await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`)); resetAuction(); return; }

        // CASE 3 — Insufficient purse
        if (Number(team.purse) < Number(currentBid)) {
            speak(`${highestBidder} cannot afford the player.`);
            const historyEntry = { message: `❌ ${currentPlayerOnAuction.name} AUTO-FAILED (Insufficient purse)`, type: 'unsold', time: new Date().toLocaleTimeString(), timestamp: Date.now() };
            auctionHistory.unshift(historyEntry);
            await set(ref(database, `rooms/${currentRoomId}/history`), auctionHistory);
            await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));
            resetAuction(); renderHistory();
            setTimeout(async () => {
                auctionResolving = false;
                if (!isHost) return;
                const snap = await get(ref(database, `rooms/${currentRoomId}/acceleratedAuction`));
                if (snap.val() === true) {
                    const accelSnap = await get(ref(database, `rooms/${currentRoomId}/acceleratedPlayers`));
                    const accelRaw = accelSnap.val();
                    const accelPlayers = Array.isArray(accelRaw) ? accelRaw : Object.values(accelRaw || {});
                    const nextAccel = accelPlayers.find(p => !p.status || p.status === 'unsold');
                    if (nextAccel) await selectPlayerAccelerated(nextAccel);
                    else await showAuctionComplete();
                } else {
                    await startNextPlayer();
                }
            }, 1500);
            return;
        }

        // CASE 4 — Sell it
        team.purse = Number(team.purse) - Number(currentBid);
        team.spent = Number(team.spent || 0) + Number(currentBid);
        team.players = team.players || [];
        team.players.push({ name: currentPlayerOnAuction.name, role: currentPlayerOnAuction.role, price: currentBid, photoUrl: currentPlayerOnAuction.photoUrl || '' });

        const playerIndex = players.findIndex(p => Number(p.id) === Number(currentPlayerOnAuction.id));
        if (playerIndex !== -1) {
            players[playerIndex].status = 'sold';
            players[playerIndex].soldTo = highestBidder;
            players[playerIndex].soldPrice = Number(currentBid);
        }

        const soldName = currentPlayerOnAuction.name;
        const soldTo = highestBidder;
        const soldPrice = Number(currentBid);
        speak(`Time up! ${soldName} sold to ${soldTo}!`);

        const historyEntry = { message: `⏰ ${soldName} AUTO-SOLD to ${soldTo} for ₹${soldPrice.toFixed(1)}Cr`, type: 'sold', time: new Date().toLocaleTimeString(), timestamp: Date.now() };
        auctionHistory.unshift(historyEntry);

        await set(ref(database, `rooms/${currentRoomId}/teams`), teams);
        await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
        await set(ref(database, `rooms/${currentRoomId}/history`), auctionHistory);
        await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));

        resetAuction();
        renderTeams(); renderPlayers(); updateStats(); updatePurse(); renderHistory();

        setTimeout(async () => {
            auctionResolving = false;
            if (!isHost) return;
            // Check if in accelerated mode
            const snap = await get(ref(database, `rooms/${currentRoomId}/acceleratedAuction`));
            if (snap.val() === true) {
                // Pick next accelerated player
                const accelSnap = await get(ref(database, `rooms/${currentRoomId}/acceleratedPlayers`));
                const accelRaw = accelSnap.val();
                const accelPlayers = Array.isArray(accelRaw) ? accelRaw : Object.values(accelRaw || {});
                const nextAccel = accelPlayers.find(p => !p.status || p.status === 'unsold');
                if (nextAccel) await selectPlayerAccelerated(nextAccel);
                else await showAuctionComplete();
            } else {
                await startNextPlayer();
            }
        }, 1500);

    } catch(e) {
        console.error('autoSellPlayer error:', e);
        auctionResolving = false;
    }
}


function renderTeams() {
    const container = document.getElementById('teamsList');
    if (!container) return;

    container.innerHTML = '';
    
    (teams || []).forEach(team => {

        if (!team) return;   // ⭐ prevents your crash

        const purse = Number(team.purse || 0);
        const spent = Number(team.spent || 0);
        const playersCount = (team.players || []).length;

        const isActive = currentUser && team.name === currentUser.team;
        const card = document.createElement('div');
        card.className = `team-card ${isActive ? 'active' : ''}`;
        card.style.cursor = 'pointer';
        card.onclick = () => showTeamDetails(team);
        
        card.innerHTML = `
            <h3>${team.name}</h3>
            <div class="team-stat">
                <span>Owner:</span> <strong>${team.owner || 'Not Assigned'}</strong>
            </div>
            <div class="team-stat">
                <span>Purse:</span>
                <strong style="color: ${purse < 20 ? '#ff4444' : '#4CAF50'};">
                    ₹${purse.toFixed(1)}Cr
                </strong>
            </div>
            <div class="team-stat">
                <span>Spent:</span> <strong>₹${spent.toFixed(1)}Cr</strong>
            </div>
            <div class="team-stat">
                <span>Players:</span> <strong>${playersCount}</strong>
            </div>
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
                    <span style="color: #888;">Total Players:</span>
                    <strong style="color: #fff;">${team.players.length}</strong>
                </div>
            </div>
            <h3 style="color: #d4af37; margin-bottom: 15px;">Squad:</h3>
            ${playersHTML}
            <button onclick="this.parentElement.parentElement.remove()" style="width: 100%; padding: 15px; margin-top: 20px; background: #ff4444; border: none; border-radius: 10px; color: white; font-size: 1.1em; font-weight: bold; cursor: pointer;">
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
    if (!container) return;
    
    container.innerHTML = '';
    
    // Safety check
    if (!players || !Array.isArray(players) || players.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No players available</p>';
        return;
    }
    
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    if (!roleFilter || !statusFilter) {
        console.warn('Filter elements not found');
        return;
    }
    
    let filteredPlayers = players.filter(player => {
        const roleMatch = roleFilter.value === 'all' || player.role === roleFilter.value;
        let statusMatch = false;
        if (statusFilter.value === 'all') statusMatch = true;
        else if (statusFilter.value === 'unsold') statusMatch = (!player.status || player.status === 'unsold' || player.status === 'passed');
        else statusMatch = player.status === statusFilter.value;
        return roleMatch && statusMatch;
    });
    
    filteredPlayers.forEach(player => {
        const card = document.createElement('div');
        card.className = `player-item ${player.status || 'unsold'}`;
        
        let statusBadge = '';
        if (player.status === 'sold') {
            statusBadge = `<span class="status-badge sold">SOLD → ${player.soldTo} (₹${Number(player.soldPrice).toFixed(1)}Cr)</span>`;
        } else if (player.status === 'passed') {
            statusBadge = `<span class="status-badge" style="background:#ff9800;color:#fff;">UNSOLD</span>`;
        } else {
            statusBadge = `<span class="status-badge unsold">Available</span>`;
        }
        
        card.innerHTML = `
            <strong>${player.name}</strong>
            <div style="font-size: 0.85em; color: #888; margin: 5px 0;">
                ${player.role} • ${player.country} • ₹${player.basePrice}Cr
            </div>
            ${statusBadge}
        `;
        
        // Host can click any non-sold player to manually auction them
        if (player.status !== 'sold' && isHost) {
            card.style.cursor = 'pointer';
            card.onclick = () => selectPlayer(player);
        }
        
        container.appendChild(card);
    });
}

window.filterPlayers = function() {
    renderPlayers();
}

async function selectPlayer(player) {
    if (!isHost) {
        alert('Only the host can select players!');
        return;
    }
    
    if (player.status === 'sold' || player.status === 'inauction') {
        alert('This player is not available!');
        return;
    }
    
    if (currentPlayerOnAuction) {
        alert('Finish the current auction first (Sold/Unsold) before selecting a new player!');
        return;
    }

    // ⭐ Immediately stamp 'inauction' in Firebase so no other client can pick this player
    const playerIndex = players.findIndex(p => Number(p.id) === Number(player.id));
    if (playerIndex !== -1) {
        players[playerIndex].status = 'inauction';
    }
    await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);

    currentPlayerOnAuction = player;
    currentPlayerOnAuction.status = 'inauction';
    currentBid = player.basePrice;
    highestBidder = null;
    lastBidTime = Date.now();
    
    await set(ref(database, `rooms/${currentRoomId}/currentPlayer`), {
        id: player.id,
        currentBid: currentBid,
        highestBidder: null,
        lastBidTime: lastBidTime
    });
    
    displayCurrentPlayer();
    startAuctionTimer();
    
    speak(`Now on auction: ${player.name}, ${player.role} from ${player.country}.`);
}

function displayCurrentPlayer() {
    document.getElementById('playerCard').style.display = 'block';
    document.getElementById('noPlayerMessage').style.display = 'none';
    
    const playerNameEl = document.getElementById('playerName');
    
    if (currentPlayerOnAuction.photoUrl) {
        playerNameEl.innerHTML = `
            <img src="${currentPlayerOnAuction.photoUrl}" alt="${currentPlayerOnAuction.name}" 
                 style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 20px; border: 4px solid #d4af37; box-shadow: 0 0 30px rgba(212, 175, 55, 0.5);">
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

window.startNextPlayer = async function() {
    if (!isHost) {
        alert('Only the host can start the next player!');
        return;
    }

    // Always fetch fresh data from Firebase
    let freshPlayers = [];
    try {
        const snapshot = await get(ref(database, `rooms/${currentRoomId}/currentSet`));
        if (snapshot.exists()) {
            const raw = snapshot.val();
            freshPlayers = Array.isArray(raw)
                ? raw
                : Object.keys(raw).sort((a, b) => Number(a) - Number(b)).map(k => raw[k]).filter(p => p != null);
            players = freshPlayers;
        }
    } catch (e) {
        freshPlayers = players;
    }

    const availablePlayers = freshPlayers.filter(
        p => p && (p.status === 'unsold' || p.status === null || p.status === undefined || p.status === '')
    );

    if (availablePlayers.length > 0) {
        await selectPlayer(availablePlayers[0]);
    } else {
        // All players in this set are done — show end-of-set popup
        await showSetEndPopup(freshPlayers);
    }
}

// ⭐ Show popup when a set is fully done
async function showSetEndPopup(freshPlayers) {
    if (!isHost) return;

    const passedPlayers = freshPlayers.filter(p => p && p.status === 'passed');

    // Get all sets to check if this is the last set
    const roomSnap = await get(ref(database, `rooms/${currentRoomId}`));
    const roomData = roomSnap.val();
    const allSets = roomData.playerSets || [];
    const totalSets = allSets.length;
    const isLastSet = currentSetNumber >= totalSets;

    // Tell all clients a set ended
    await update(ref(database, `rooms/${currentRoomId}`), { setEnded: true });

    const popup = document.createElement('div');
    popup.id = 'setEndPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10000;display:flex;justify-content:center;align-items:center;';

    popup.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1f3a,#2a2f4a);border:4px solid #d4af37;border-radius:20px;padding:40px;max-width:520px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(212,175,55,0.5);">
            <h2 style="color:#d4af37;font-size:2em;margin-bottom:10px;">🏏 Set ${currentSetNumber} Complete!</h2>
            <p style="color:#aaa;margin-bottom:25px;">${freshPlayers.filter(p=>p.status==='sold').length} sold · ${passedPlayers.length} unsold</p>

            ${passedPlayers.length > 0 ? `
            <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:15px;margin-bottom:25px;max-height:150px;overflow-y:auto;text-align:left;">
                <p style="color:#ff9800;font-weight:bold;margin-bottom:8px;">Unsold Players:</p>
                ${passedPlayers.map(p=>`<div style="color:#aaa;padding:4px 0;font-size:0.9em;">• ${p.name} (${p.role})</div>`).join('')}
            </div>` : ''}

            <div style="display:grid;gap:15px;">
                ${passedPlayers.length > 0 ? `
                <button onclick="reAuctionUnsold()" style="padding:18px;background:linear-gradient(135deg,#ff9800,#f57c00);border:none;border-radius:12px;color:#fff;font-size:1.1em;font-weight:bold;cursor:pointer;">
                    🔄 Re-auction ${passedPlayers.length} Unsold Player${passedPlayers.length>1?'s':''}
                </button>` : ''}

                ${!isLastSet ? `
                <button onclick="moveToNextSet()" style="padding:18px;background:linear-gradient(135deg,#4CAF50,#388e3c);border:none;border-radius:12px;color:#fff;font-size:1.1em;font-weight:bold;cursor:pointer;">
                    ➡️ Next Set (Set ${currentSetNumber + 1} of ${totalSets})
                </button>` : ''}

                ${isLastSet ? `
                <button onclick="startAcceleratedAuction()" style="padding:18px;background:linear-gradient(135deg,#e91e63,#c2185b);border:none;border-radius:12px;color:#fff;font-size:1.1em;font-weight:bold;cursor:pointer;">
                    ⚡ Start Accelerated Auction (All Unsold)
                </button>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    speak(`Set ${currentSetNumber} complete!`);
}

window.reAuctionUnsold = async function() {
    const popup = document.getElementById('setEndPopup');
    if (popup) popup.remove();

    // Reset all passed players to unsold in current set
    players.forEach(p => { if (p.status === 'passed') p.status = 'unsold'; });
    await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
    await update(ref(database, `rooms/${currentRoomId}`), { setEnded: false });

    auctionResolving = false;
    speak('Re-auctioning unsold players!');
    await startNextPlayer();
}

window.moveToNextSet = async function() {
    const popup = document.getElementById('setEndPopup');
    if (popup) popup.remove();

    const roomSnap = await get(ref(database, `rooms/${currentRoomId}`));
    const roomData = roomSnap.val();
    const allSets = roomData.playerSets || [];
    const nextSetNumber = currentSetNumber + 1;

    if (nextSetNumber > allSets.length) {
        await startAcceleratedAuction();
        return;
    }

    const nextSet = allSets[nextSetNumber - 1];

    currentSetNumber = nextSetNumber;
    players = nextSet;

    await update(ref(database, `rooms/${currentRoomId}`), {
        currentSetNumber: nextSetNumber,
        currentSet: nextSet,
        setEnded: false
    });

    auctionResolving = false;
    speak(`Starting set ${nextSetNumber}!`);
    await startNextPlayer();
}

// ⭐ Accelerated auction — 5 seconds per unsold player across ALL sets
window.startAcceleratedAuction = async function() {
    const popup = document.getElementById('setEndPopup');
    if (popup) popup.remove();

    // Collect ALL unsold/passed players from ALL sets
    const roomSnap = await get(ref(database, `rooms/${currentRoomId}`));
    const roomData = roomSnap.val();
    const allSets = roomData.playerSets || [];

    const allUnsold = [];
    allSets.forEach(set => {
        const setArr = Array.isArray(set) ? set : Object.values(set);
        setArr.forEach(p => {
            if (p && (p.status === 'passed' || p.status === 'unsold' || !p.status)) {
                allUnsold.push(p);
            }
        });
    });

    if (allUnsold.length === 0) {
        await showAuctionComplete();
        return;
    }

    // Store accelerated players in Firebase
    await update(ref(database, `rooms/${currentRoomId}`), {
        acceleratedAuction: true,
        acceleratedPlayers: allUnsold,
        setEnded: false
    });

    speak(`Accelerated auction! ${allUnsold.length} unsold players, 5 seconds each!`);
    showAcceleratedAuctionBanner(allUnsold.length);

    // Switch timer to 5 seconds for accelerated mode
    timeRemaining = 5;
    players = allUnsold;

    auctionResolving = false;
    await selectPlayerAccelerated(allUnsold[0]);
}

function showAcceleratedAuctionBanner(count) {
    const existing = document.getElementById('accelBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'accelBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:linear-gradient(135deg,#e91e63,#c2185b);color:#fff;text-align:center;padding:12px;font-size:1.1em;font-weight:bold;z-index:9999;';
    banner.innerHTML = `⚡ ACCELERATED AUCTION — ${count} unsold players — 5 seconds each!`;
    document.body.appendChild(banner);
}

async function selectPlayerAccelerated(player) {
    if (!player) {
        await showAuctionComplete();
        return;
    }

    // Temporarily override timer to 5 seconds
    const originalStart = startAuctionTimer;
    timeRemaining = 5;

    currentPlayerOnAuction = player;
    currentBid = player.basePrice;
    highestBidder = null;
    lastBidTime = Date.now();

    await set(ref(database, `rooms/${currentRoomId}/currentPlayer`), {
        id: player.id,
        currentBid: currentBid,
        highestBidder: null,
        lastBidTime: lastBidTime,
        accelerated: true
    });

    displayCurrentPlayer();

    // 5-second timer for accelerated mode
    stopAuctionTimer();
    timeRemaining = 5;
    updateTimerDisplay();
    auctionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastBidTime) / 1000);
        timeRemaining = Math.max(0, 5 - elapsed);
        updateTimerDisplay();
        if (timeRemaining === 0) {
            stopAuctionTimer();
            autoSellPlayer();
        }
    }, 100);

    speak(`${player.name}!`);
}

async function showAuctionComplete() {
    // Remove accelerated banner
    const banner = document.getElementById('accelBanner');
    if (banner) banner.remove();

    await update(ref(database, `rooms/${currentRoomId}`), {
        auctionComplete: true,
        acceleratedAuction: false
    });

    showCompletionScreen();
}

function showCompletionScreen() {
    const existing = document.getElementById('completionScreen');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'completionScreen';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;justify-content:center;align-items:center;overflow-y:auto;';

    const totalSpent = teams.reduce((s, t) => s + (t.spent || 0), 0);

    let teamsHTML = teams.map(team => `
        <div style="background:rgba(0,0,0,0.4);border:2px solid ${team.name===currentUser?.team?'#d4af37':'#444'};border-radius:12px;padding:15px;text-align:left;">
            <div style="color:#d4af37;font-weight:bold;font-size:1em;margin-bottom:5px;">${team.name}</div>
            <div style="color:#aaa;font-size:0.85em;">👤 ${team.owner||'—'} · ${(team.players||[]).length} players · ₹${(team.spent||0).toFixed(1)}Cr spent</div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1f3a,#2a2f4a);border:4px solid #d4af37;border-radius:20px;padding:40px;max-width:650px;width:94%;text-align:center;box-shadow:0 20px 60px rgba(212,175,55,0.6);margin:20px auto;">
            <div style="font-size:3em;margin-bottom:10px;">🏆</div>
            <h1 style="color:#d4af37;font-size:2em;margin-bottom:8px;">Auction Complete!</h1>
            <p style="color:#aaa;margin-bottom:25px;">₹${totalSpent.toFixed(1)}Cr total spent across all teams</p>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:30px;">
                ${teamsHTML}
            </div>

            <p style="color:#4CAF50;font-size:1.1em;margin-bottom:20px;font-weight:bold;">📥 Download your team's squad PDF below</p>

            <div style="display:grid;gap:10px;">
                ${teams.map(team => `
                    <button onclick="downloadTeamPDF('${team.name.replace(/'/g,"\\'")}')"
                        style="padding:14px;background:${team.name===currentUser?.team?'linear-gradient(135deg,#d4af37,#f4d03f)':'linear-gradient(135deg,#333,#555)'};
                        border:none;border-radius:10px;color:${team.name===currentUser?.team?'#000':'#fff'};
                        font-size:1em;font-weight:bold;cursor:pointer;">
                        📄 ${team.name} Squad PDF ${team.name===currentUser?.team?'⭐':''}
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    speak('Congratulations! The auction is complete! Download your team PDF now!');
}

window.downloadTeamPDF = function(teamName) {
    const team = teams.find(t => t.name === teamName);
    if (!team) return;

    // Build HTML for PDF using print dialog (works in all browsers, no library needed)
    const playerRows = (team.players || []).map((p, i) => `
        <tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
            <td style="padding:8px 12px;border:1px solid #ddd;">${i+1}</td>
            <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;">${p.name}</td>
            <td style="padding:8px 12px;border:1px solid #ddd;">${p.role}</td>
            <td style="padding:8px 12px;border:1px solid #ddd;color:#1a7a4a;font-weight:bold;">₹${Number(p.price).toFixed(1)} Cr</td>
        </tr>
    `).join('');

    const totalSpent = (team.players || []).reduce((s, p) => s + Number(p.price), 0);
    const purseLeft = Number(team.purse);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${team.name} — IPL Auction 2026</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 30px; color: #222; }
            .header { background: linear-gradient(135deg, #1a1f3a, #2a2f4a); color: #d4af37; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 25px; }
            .header h1 { margin: 0 0 6px; font-size: 2em; }
            .header p { margin: 0; color: #aaa; font-size: 1em; }
            .stats { display: flex; gap: 15px; margin-bottom: 25px; }
            .stat { flex: 1; background: #f0f4ff; border-radius: 8px; padding: 15px; text-align: center; border: 2px solid #d4af37; }
            .stat .val { font-size: 1.6em; font-weight: bold; color: #1a1f3a; }
            .stat .lbl { color: #666; font-size: 0.85em; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1a1f3a; color: #d4af37; padding: 10px 12px; text-align: left; }
            tr:hover { background: #fffbea !important; }
            .footer { margin-top: 25px; text-align: center; color: #aaa; font-size: 0.85em; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🏏 ${team.name}</h1>
            <p>IPL Mega Auction 2026 — Official Squad</p>
        </div>
        <div class="stats">
            <div class="stat"><div class="val">${(team.players||[]).length}</div><div class="lbl">Players Bought</div></div>
            <div class="stat"><div class="val">₹${totalSpent.toFixed(1)} Cr</div><div class="lbl">Total Spent</div></div>
            <div class="stat"><div class="val">₹${purseLeft.toFixed(1)} Cr</div><div class="lbl">Purse Remaining</div></div>
        </div>
        <table>
            <thead><tr><th>#</th><th>Player</th><th>Role</th><th>Price</th></tr></thead>
            <tbody>${playerRows}</tbody>
        </table>
        <div class="footer">Generated on ${new Date().toLocaleDateString()} · IPL Auction 2026</div>
    </body>
    </html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
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

    if (auctionResolving) return;
    auctionResolving = true;

    try {
        if (!isHost) { alert('Only the host can mark players as sold!'); return; }
        if (!currentPlayerOnAuction) { alert('No player on auction!'); return; }
        if (!highestBidder) { alert('No bids placed yet!'); return; }
        
        const team = teams.find(t => t.name === highestBidder);
        if (!team) { console.error("❌ Invalid highestBidder:", highestBidder); return; }
        if (Number(team.purse) < Number(currentBid)) { alert('Insufficient purse!'); return; }
        
        stopAuctionTimer();
        
        // Update team
        team.purse = Number(team.purse) - Number(currentBid);
        team.spent = Number(team.spent || 0) + Number(currentBid);
        team.players = team.players || [];
        team.players.push({
            name: currentPlayerOnAuction.name,
            role: currentPlayerOnAuction.role,
            price: currentBid,
            photoUrl: currentPlayerOnAuction.photoUrl || ''
        });
        
        // Update player in local array
        const playerIndex = players.findIndex(p => Number(p.id) === Number(currentPlayerOnAuction.id));
        if (playerIndex === -1) { console.error("❌ Player not found"); return; }
        players[playerIndex].status = 'sold';
        players[playerIndex].soldTo = highestBidder;
        players[playerIndex].soldPrice = Number(currentBid);

        const soldName = currentPlayerOnAuction.name;
        const soldTo = highestBidder;
        const soldPrice = Number(currentBid);

        speak(`${soldName} sold to ${soldTo}!`);

        // ⭐ ONE atomic write: teams + currentSet + remove currentPlayer + history, all together
        const historyEntry = {
            message: `${soldName} SOLD to ${soldTo} for ₹${soldPrice.toFixed(1)}Cr`,
            type: 'sold',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        };
        auctionHistory.unshift(historyEntry);
        if (auctionHistory.length > 100) auctionHistory = auctionHistory.slice(0, 100);

        await set(ref(database, `rooms/${currentRoomId}/teams`), teams);
        await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
        await set(ref(database, `rooms/${currentRoomId}/history`), auctionHistory);
        await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));

        resetAuction();
        renderTeams();
        renderPlayers();
        updateStats();
        updatePurse();
        renderHistory();

        // ⭐ Keep auctionResolving = true while we wait, then start next player
        setTimeout(async () => {
            auctionResolving = false;
            if (!isHost) return;
            const snap = await get(ref(database, `rooms/${currentRoomId}/acceleratedAuction`));
            if (snap.val() === true) {
                const accelSnap = await get(ref(database, `rooms/${currentRoomId}/acceleratedPlayers`));
                const accelRaw = accelSnap.val();
                const accelPlayers = Array.isArray(accelRaw) ? accelRaw : Object.values(accelRaw || {});
                const nextAccel = accelPlayers.find(p => !p.status || p.status === 'unsold');
                if (nextAccel) await selectPlayerAccelerated(nextAccel);
                else await showAuctionComplete();
            } else {
                await startNextPlayer();
            }
        }, 2000);

    } catch(e) {
        console.error('soldPlayer error:', e);
        auctionResolving = false;
    }
};


window.unsoldPlayer = async function() {
    if (!isHost) { alert('Only the host can mark players as unsold!'); return; }
    if (!currentPlayerOnAuction) { alert('No player on auction!'); return; }
    if (auctionResolving) return;
    auctionResolving = true;

    try {
        stopAuctionTimer();
        
        const playerIndex = players.findIndex(p => Number(p.id) === Number(currentPlayerOnAuction.id));
        if (playerIndex !== -1) {
            players[playerIndex].status = 'passed';
            players[playerIndex].soldTo = null;
            players[playerIndex].soldPrice = 0;
        }

        const passedName = currentPlayerOnAuction.name;
        speak(`${passedName} remains unsold.`);

        const historyEntry = {
            message: `${passedName} went UNSOLD`,
            type: 'unsold',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        };
        auctionHistory.unshift(historyEntry);
        if (auctionHistory.length > 100) auctionHistory = auctionHistory.slice(0, 100);

        await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
        await set(ref(database, `rooms/${currentRoomId}/history`), auctionHistory);
        await remove(ref(database, `rooms/${currentRoomId}/currentPlayer`));

        resetAuction();
        renderPlayers();
        updateStats();
        renderHistory();

        setTimeout(async () => {
            auctionResolving = false;
            if (!isHost) return;
            const snap = await get(ref(database, `rooms/${currentRoomId}/acceleratedAuction`));
            if (snap.val() === true) {
                const accelSnap = await get(ref(database, `rooms/${currentRoomId}/acceleratedPlayers`));
                const accelRaw = accelSnap.val();
                const accelPlayers = Array.isArray(accelRaw) ? accelRaw : Object.values(accelRaw || {});
                const nextAccel = accelPlayers.find(p => !p.status || p.status === 'unsold');
                if (nextAccel) await selectPlayerAccelerated(nextAccel);
                else await showAuctionComplete();
            } else {
                await startNextPlayer();
            }
        }, 2000);

    } catch(e) {
        console.error('unsoldPlayer error:', e);
        auctionResolving = false;
    }
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
    playersRemainingEl.textContent = players.filter(p => (p.status || 'unsold') === 'unsold').length;
    
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
    // Use set() on the specific fields for atomic writes
    await set(ref(database, `rooms/${currentRoomId}/teams`), teams);
    await set(ref(database, `rooms/${currentRoomId}/currentSet`), players);
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
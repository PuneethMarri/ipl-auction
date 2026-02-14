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
    populateTeamSelect();
    loadPlayersFromCSV();
};

function populateTeamSelect() {
    const select = document.getElementById('teamSelect');
    if (!select) return;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a team...';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.name;
        option.textContent = team.name;
        select.appendChild(option);
    });
}

async function loadPlayersFromCSV() {
    try {
        const response = await fetch('players.csv');
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');

        allPlayers = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            allPlayers.push({
                id: i,
                name: values[1],
                role: values[2],
                country: values[3],
                basePrice: parseFloat(values[4]) || 1,
                style: values[5] || '',
                status: 'unsold'
            });
        }
    } catch (error) {
        console.error(error);
    }
}

window.createRoom = async function() {
    const roomId = document.getElementById('roomId').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const teamName = document.getElementById('teamSelect').value;
    const username = document.getElementById('username').value.trim();

    const roomRef = ref(database, `rooms/${roomId}`);

    currentRoomId = roomId;
    currentRoomPassword = roomPassword;
    isHost = true;

    participantId = `${username}_${Date.now()}`;

    await set(roomRef, {
        password: roomPassword,
        teams,
        history: [],
        auctionStarted: false
    });

    // ✅ Atomic participant write
    await update(ref(database, `rooms/${roomId}/participants/${participantId}`), {
        username,
        team: teamName,
        ready: false,
        isHost: true,
        online: true,
        joinedAt: Date.now()
    });

    setupPresenceSystem();
    showApp();
    setupFirebaseListeners();
};

window.joinRoom = async function() {
    const roomId = document.getElementById('roomId').value.trim();
    const roomPassword = document.getElementById('roomPassword').value.trim();
    const teamName = document.getElementById('teamSelect').value;
    const username = document.getElementById('username').value.trim();

    const roomRef = ref(database, `rooms/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
        alert("Room not found");
        return;
    }

    const data = snapshot.val();

    if (data.password !== roomPassword) {
        alert("Wrong password");
        return;
    }

    currentRoomId = roomId;
    participantId = `${username}_${Date.now()}`;

    // ✅ Atomic participant write
    await update(ref(database, `rooms/${roomId}/participants/${participantId}`), {
        username,
        team: teamName,
        ready: false,
        isHost: false,
        online: true,
        joinedAt: Date.now()
    });

    setupPresenceSystem();
    showApp();
    setupFirebaseListeners();
};

function setupPresenceSystem() {
    const participantRef = ref(database, `rooms/${currentRoomId}/participants/${participantId}`);

    onDisconnect(participantRef).update({
        online: false,
        leftAt: Date.now()
    });

    update(participantRef, { online: true });
}

function setupFirebaseListeners() {
    const roomRef = ref(database, `rooms/${currentRoomId}`);

    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();

        const previousParticipants = { ...participants };

        // ✅ Safe guard
        participants = (data.participants && typeof data.participants === 'object')
            ? data.participants
            : {};

        checkParticipantChanges(previousParticipants, participants);
        renderParticipants();
    });
}

function checkParticipantChanges(previous, current) {
    Object.keys(previous).forEach(pid => {
        if (previous[pid]?.online && current[pid] && current[pid].online === false) {
            console.log(previous[pid].username + " left");
        }
    });
}

function renderParticipants() {
    const container = document.getElementById('participantsList');
    if (!container) return;

    container.innerHTML = '';

    Object.values(participants).forEach(p => {
        const div = document.createElement('div');
        div.textContent = `${p.isHost ? '👑' : '👤'} ${p.username} - ${p.team}`;
        container.appendChild(div);
    });
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
}

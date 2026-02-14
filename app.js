// IPL Auction 2026 - Firebase Real-Time Sync with Host/Player Roles
// Random player sets, Ready system, 15-second auto-sell

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => populateTeamSelect(), 100);
});

window.onload = function() {
    console.log('🔄 Window loaded');
    populateTeamSelect();
    
    loadPlayersFromCSV().then(() => {
        console.log('✅ App initialized');
        
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        const password = urlParams.get('pass');
        
        if (roomId && password) {
            setTimeout(() => {
                const roomIdInput = document.getElementById('roomId');
                const passwordInput = document.getElementById('roomPassword');
                
                if (roomIdInput) roomIdInput.value = roomId;
                if (passwordInput) passwordInput.value = password;
            }, 100);
        }
    });
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
        const sheetId = '1i4NQmcynf76DoKbqestur9T3Bu4AI6Ka1AAh66winh8';
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        
        const response = await fetch(sheetUrl);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        allPlayers = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            
            if (!values[1]) continue;
            
            allPlayers.push({
                id: i,
                name: values[1],
                role: values[2] || 'Batsman',
                country: values[3] || 'India',
                basePrice: parseFloat(values[4]) || 1,
                style: values[5] || '',
                photoUrl: values[6] || '',
                status: 'unsold'
            });
        }
        
        players = [...allPlayers];
        
    } catch (error) {
        console.error(error);
    }
}

function parseCSVLine(line) {
    return line.split(',').map(x => x.trim());
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderParticipants() {
    const container = document.getElementById('participantsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    let validCount = 0;
    let readyCount = 0;
    
    Object.keys(participants).forEach(username => {
        const p = participants[username];
        if (!p) return;
        
        validCount++;
        if (p.ready) readyCount++;
        
        const div = document.createElement('div');
        div.textContent = `${username} - ${p.ready ? 'Ready' : 'Not Ready'}`;
        container.appendChild(div);
    });
    
    if (validCount > 0) {
        const countDiv = document.createElement('div');
        countDiv.innerHTML = `${readyCount}/${validCount} Ready`;
        container.appendChild(countDiv);
    }
}

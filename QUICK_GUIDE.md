# Quick Setup Guide - IPL Auction 2026

## 🎯 NEW FEATURES

### 1. **Host vs Players System**
- **Host** (room creator): Controls auction, selects players, marks sold/unsold
- **Players**: Can only bid, view teams, and click ready
- Host sees 👑 crown icon, players see 👤 icon

### 2. **Random Player Sets**
- 107 players divided into 4 sets
- Each set has ~27 players (last set has 26)
- **Distribution per set:**
  - ~10 Batsmen
  - ~9 Bowlers
  - ~5 All-rounders
  - ~3 Wicket-keepers
- Players randomized within each set

### 3. **Ready System**
- All participants must click "Ready" button
- When everyone is ready, **host gets a popup** to start auction
- Only then can the auction begin

### 4. **15-Second Timer**
- Timer starts when player goes on auction
- Resets to 15s with each bid
- Turns RED and pulses at 5 seconds
- Auto-sells at 0 seconds

### 5. **Team Details View**
- **Click on any team** to see their squad
- Shows:
  - Team owner
  - Purse remaining
  - Amount spent
  - Complete player list with roles and prices

## 🚀 HOW TO START

### Step 1: Host Creates Room
1. Open the app
2. Enter Room ID (e.g., `ipl2026`)
3. Enter Room Password (e.g., `cricket123`)
4. Select your team
5. Enter your name
6. Click **"🆕 Create Room"**
7. You are now the **HOST** (see 👑 icon)

### Step 2: Players Join
1. Share Room ID and Password with friends
2. They open the app
3. Enter same Room ID and Password
4. Select their team (must be different)
5. Enter their name
6. Click **"🚪 Join Room"**
7. They are now **PLAYERS** (see 👤 icon)

### Step 3: Get Ready
1. Each participant clicks **"Ready"** button
2. Button turns green: ✅ Ready!
3. Host can see who is ready in the participants list

### Step 4: Host Starts Auction
1. When everyone is ready, **host gets a popup**
2. Popup says: "🎉 All Players Ready!"
3. Host clicks **"🚀 START AUCTION"**
4. Auction begins!

### Step 5: Auction Process

**Host Controls:**
- Select next player (click on player or "Start Next Player")
- Mark player as SOLD (✅ button)
- Mark player as UNSOLD (❌ button)
- Move to next player (➡️ button)

**All Players Can:**
- Place bids (💰 Bid +₹0.5Cr button)
- View team details (click on any team)
- See live updates instantly

**Auto-Sell:**
- If no bids for 15 seconds → Player marked UNSOLD
- If bids placed but timer expires → Automatically SOLD to highest bidder

## 📊 WHAT YOU SEE

### Participants Panel (Left Side, Bottom)
Shows all joined players with:
- 👑 Icon for host
- 👤 Icon for players
- Team name
- Ready status (✅ Ready or ⏸️ Not Ready)

### Team Cards (Left Side, Top)
Click any team to see:
- Complete squad
- Players bought
- Prices paid
- Purse remaining

### Current Set Info
Shows above player card:
- "Set 1 • Player 5/27"
- Tracks progress through current set

### Timer Display
- Gold: 15s → 6s (normal)
- Red + Pulsing: 5s → 0s (urgent!)

## 🎮 TIPS FOR SMOOTH AUCTION

### Before Starting:
1. Host creates room first
2. Share Room ID + Password clearly
3. Wait for all players to join
4. Everyone clicks "Ready"
5. Host starts when popup appears

### During Auction:
1. Host selects players one by one
2. Everyone can bid freely
3. Watch the 15-second timer
4. Click teams to see their squads
5. Check auction history for past sales

### Host Best Practices:
- Select players quickly
- Let bidding happen naturally
- Use manual SOLD if everyone agrees
- Use auto-timer for fairness
- Move to next player after each sale

### Player Best Practices:
- Click Ready when you're set
- Bid before timer expires
- Watch your team's purse
- Check other teams' squads
- Stay engaged!

## 🔧 TROUBLESHOOTING

**"Only host can select players"**
- This is correct! Only the room creator (host) controls player selection

**"Only host can mark sold/unsold"**
- Correct! Players can only bid, not control sales

**Popup not appearing for host?**
- Make sure all participants clicked "Ready"
- Check participants list to see who's not ready
- Need at least 2 people (host + 1 player)

**Can't see team details?**
- Click directly on the team card
- A popup will show their complete squad

**Timer not resetting?**
- Bid might not have registered
- Check your internet connection
- Try refreshing the page

## 📱 SHARING YOUR AUCTION

### For Local Network:
```
Share: http://YOUR_IP:5500/
Example: http://192.168.1.5:5500/
```

### For Internet (Hosted):
```
Share: https://yoursite.com/
Example: https://ipl-auction.netlify.app/
```

## 🎯 KEY DIFFERENCES FROM OLD VERSION

| Feature | Old | New |
|---------|-----|-----|
| **Roles** | Everyone equal | Host controls, players bid |
| **Players** | All 107 at once | 4 randomized sets |
| **Starting** | Anyone starts | All ready → Host popup |
| **Timer** | 10 seconds | 15 seconds |
| **Team View** | Just stats | Click to see full squad |
| **Participants** | Not visible | Live participant list |

## 🏏 ENJOY YOUR AUCTION!

The auction is now more organized with clear roles, random player distribution, and a proper ready system. Have fun! 🎉

---

**Need Help?**
- Check browser console (F12) for errors
- Make sure everyone uses same Room ID + Password
- Host should wait for everyone to be ready
- If stuck, refresh the page and rejoin

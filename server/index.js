const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://marketmakinggame.netlify.app' : 'http://localhost:3000',
  methods: ['GET', 'POST'],
}));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const { InMemorySessionStore } = require("./sessionStore");
const sessionStore = new InMemorySessionStore();

// Session and Room State Management
const rooms = new Set();
const adminToRoom = {};
const playerToRoom = {};
const roomToAdmin = {};
const roomsData = {};
const adminHeartbeats = {};

function randomId() {
  return Math.random().toString(36).substring(2, 12);
}

function initRoomData(adminID) {
  return {
    admin: adminID,
    usernames: {},       // userID -> username
    started: false,
    gameOver: false,
    startTime: null,
    roundInterval: null, // reference to the 30s interval
    positions: {},       // userID -> { cash, calls, portfolioHistory: [] }
    bids: {},            // userID -> last submitted bid
    promptCount: 0,      // how many rounds so far
    strikePrice: 100,
    currentPromptType: "sell-call", // either "sell-call" or "buy-call"
    // --- NEW ---
    marketPrice: 0,      // track the “last trade” market price for the call
  };
}

// --- NEW UTILITY: Sharpe ratio function ---
function computeSharpeRatio(history) {
  // history is an array of portfolio values over time
  if (!history || history.length < 2) return 0;

  // Step returns: (V_t - V_{t-1}) / V_{t-1}
  const returns = [];
  for (let i = 1; i < history.length; i++) {
    const r = (history[i] - history[i - 1]) / history[i - 1];
    returns.push(r);
  }

  const avgR = returns.reduce((a, b) => a + b, 0) / returns.length;
  // 5% annual, 30 min = 1 year, so each 30s round is 1/60 year => per-step risk-free
  const rfStep = 0.05 / 60;

  // standard deviation
  const sqDiffs = returns.map((r) => (r - avgR) ** 2);
  const variance = sqDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1 || 1);
  const stdev = Math.sqrt(variance);

  const STDEV_THRESHOLD = 1e-10; // Adjust this threshold as needed
  if (stdev < STDEV_THRESHOLD) return 0;

  if (stdev === 0) return 0;
  // (avgReturn - riskFreePerStep) / stdev
  return (avgR - rfStep) / stdev;
}

// Helper to apply risk-free compounding to each player and record portfolio value
function applyRiskFreeAndRecord(room) {
  const data = roomsData[room];
  if (!data) return;

  // each 30s step is 1/60 of a year => discrete compounding with 5% annual
  const rfStep = 0.05 / 60;

  Object.entries(data.positions).forEach(([userID, pos]) => {
    // Ensure we have portfolioHistory array
    if (!pos.portfolioHistory) {
      pos.portfolioHistory = [];
    }

    // 1) Apply risk-free growth to cash
    pos.cash *= (1 + rfStep);

    // 2) Mark calls to “marketPrice”
    const portfolioVal = pos.cash + (pos.calls * data.marketPrice);

    // 3) Record in portfolioHistory
    pos.portfolioHistory.push(portfolioVal);
  });
}

function broadcastPositionsAndSharpe(room) {
  const data = roomsData[room];

  // 1) Apply risk-free growth & record portfolio
  applyRiskFreeAndRecord(room);

  // 2) Compute Sharpe for each player
  Object.entries(data.positions).forEach(([uid, pos]) => {
    pos.sharpe = computeSharpeRatio(pos.portfolioHistory);
  });

  // 3) Build an object that includes marketPrice & sharpe for each user
  const broadcastPositions = {};
  for (const [uid, pos] of Object.entries(data.positions)) {
    broadcastPositions[uid] = {
      ...pos,
      marketPrice: data.marketPrice,
      sharpe: pos.sharpe,
    };
  }

  // 4) Emit updated positions to everyone
  io.to(room).emit("positionsUpdated", broadcastPositions);
}

function processRoundBids(room) {
  const data = roomsData[room];
  const allBids = Object.entries(data.bids);

  if (!allBids.length) {
    // If no bids this round, just apply risk-free, compute Sharpe, and broadcast
    broadcastPositionsAndSharpe(room);
    return;
  }

  let sorted;
  if (data.currentPromptType === "sell-call") {
    // Computer SELLING calls => highest bids get filled
    sorted = allBids.sort((a, b) => b[1] - a[1]);
  } else {
    // Computer BUYING calls => lowest bids get filled
    sorted = allBids.sort((a, b) => a[1] - b[1]);
  }

  // Calculate the median index - rounded up if odd number
  const medianIndex = Math.ceil(sorted.length / 2) - 1;
  const medianPrice = sorted[medianIndex][1];
  
  console.log(`Round: ${data.promptCount}, Type: ${data.currentPromptType}, Bids: ${sorted.length}, Median Index: ${medianIndex}, Median Price: ${medianPrice}`);
  
  // For sell-call: execute bids at or above median
  // For buy-call: execute bids at or below median
  const tradeResults = {};
  
  sorted.forEach(([userID, bidPx], index) => {
    // Determine if the bid should be executed
    let execute = false;
    
    if (data.currentPromptType === "sell-call") {
      // Computer selling calls: execute bids >= median price
      execute = bidPx >= medianPrice;
    } else {
      // Computer buying calls: execute bids <= median price
      execute = bidPx <= medianPrice;
    }
    
    // Execute the trade if conditions are met
    if (execute) {
      if (!data.positions[userID]) {
        data.positions[userID] = { cash: 0, calls: 0, portfolioHistory: [] };
      }
      const pos = data.positions[userID];

      if (data.currentPromptType === "sell-call") {
        // user is BUYING calls at their bid price from the computer
        pos.cash -= bidPx;
        pos.calls += 1;
      } else {
        // user is SELLING calls at their bid price to the computer
        pos.cash += bidPx;
        pos.calls -= 1;
      }

      tradeResults[userID] = { executed: true, price: bidPx };
    } else {
      tradeResults[userID] = { executed: false };
    }
  });

  // Set the market price to the median execution price
  data.marketPrice = medianPrice;

  // Let everyone know which trades got executed
  io.to(room).emit("tradeResults", tradeResults);

  // Then apply risk-free, compute Sharpe, and broadcast updated positions
  broadcastPositionsAndSharpe(room);

  // Clear bids for next round
  data.bids = {};
}


// Destroy a room (if admin disconnects or time out)
function destroyRoom(room, adminID) {
  if (!room || !roomsData[room]) return;
  console.log('destroying room ', room);
  rooms.delete(room);

  const idList = Object.keys(roomsData[room].usernames);
  for (let id of idList) {
    delete playerToRoom[id];
  }

  io.to(room).emit('roomClosed', room);
  io.socketsLeave(room);
  delete roomsData[room];

  delete roomToAdmin[room];
  delete adminToRoom[adminID];
  clearTimeout(adminHeartbeats[adminID]);
}

// Set up a heartbeat to check admin presence
setInterval(() => {
  io.to('adminRoom').emit('heartbeat');
}, 5000);

function setHeartbeatTimeout(ID) {
  adminHeartbeats[ID] = setTimeout(() => {
    console.log('no response from admin ' + ID + ' for room ' + adminToRoom[ID] + ' , deleting...');
    destroyRoom(adminToRoom[ID], ID);
  }, 60000);
}

io.use((socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const session = sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      return next();
    }
  }
  socket.sessionID = randomId();
  socket.userID = randomId();
  next();
});

io.on("connection", (socket) => {
  socket.join(socket.userID);

  // Persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
  });

  // We do a naive inference to guess state on reconnect
  let inferredState = 0;
  let possibleClientBehind = false;

  const maybeAdminRoom = adminToRoom[socket.userID];
  if (maybeAdminRoom) {
    socket.join(maybeAdminRoom);
    socket.join('adminRoom');
    if (roomsData[maybeAdminRoom].started) {
      inferredState = 4; // admin in game
      possibleClientBehind = true;
    } else {
      inferredState = 1; // admin in pre-game
    }
  } else {
    const maybePlayerRoom = playerToRoom[socket.userID];
    if (maybePlayerRoom) {
      socket.join(maybePlayerRoom);
      if (roomsData[maybePlayerRoom].started) {
        inferredState = 5; // player in game
        possibleClientBehind = true;
      } else {
        inferredState = 3; // player in pre-game
      }
    }
  }

  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
    pageState: inferredState,
    clientBehind: possibleClientBehind,
  });

  // Listen for heartbeat
  socket.on('heartbeatResponse', (userID) => {
    clearTimeout(adminHeartbeats[userID]);
    setHeartbeatTimeout(userID);
  });

  // Admin "creates" a room (but game not started yet)
  socket.on("room-start", (room, userID) => {
    if (!room || room.length === 0) return;

    if (rooms.has(room)) {
      socket.leave(room);
      console.log('room name taken');
      io.to(socket.id).emit('roomNameTaken');
    } else {
      setHeartbeatTimeout(userID);
      console.log('start heartbeat for', room, userID);

      const roomData = initRoomData(userID);
      rooms.add(room);

      socket.join(room);
      socket.join('adminRoom');

      adminToRoom[userID] = room;
      roomToAdmin[room] = userID;
      roomsData[room] = roomData;

      io.to(socket.id).emit('roomStartSuccess');
    }
  });

  // Admin starts the game
  socket.on("startGame", (adminID) => {
    const room = adminToRoom[adminID];
    if (!room) return;

    const data = roomsData[room];
    if (!data || data.started) return;

    data.started = true;
    data.startTime = Date.now();

    // Initialize each player's portfolioHistory with an initial value
    Object.entries(data.positions).forEach(([uid, pos]) => {
      if (!pos.portfolioHistory) pos.portfolioHistory = [];
      const initVal = pos.cash + pos.calls * data.marketPrice;
      pos.portfolioHistory.push(initVal);
    });

    // NO 30-second setInterval here anymore—admin will trigger each round.

    // Indicate the game has started
    io.to(room).emit("gameStartedPlayer");
    io.to(socket.id).emit("gameStartedAdmin");

    setTimeout(() => {
      console.log(`Sending initial prompt to room ${room}: ${data.currentPromptType}`);
      io.to(room).emit("newTradePrompt", {
        promptType: data.currentPromptType,
        round: data.promptCount,
      });
    }, 1000);

    // Optionally set a starting round count and prompt type:
    data.promptCount = 1;
    data.currentPromptType = "sell-call";  // for example

    // Immediately send the first prompt (just like before)
    io.to(room).emit("newTradePrompt", {
      promptType: data.currentPromptType,
      round: data.promptCount,
    });
  });

  // Admin triggers the next round
  socket.on("roundUpdate", (adminID) => {
    const room = adminToRoom[adminID];
    if (!room) return;

    const data = roomsData[room];

    // Process prior round's bids (executes trades, updates marketPrice, Sharpe, etc.)
    processRoundBids(room);

    // Move to the next round
    data.promptCount++;
    data.currentPromptType =
      data.promptCount % 2 === 0 ? "sell-call" : "buy-call";

    // Announce the new trade prompt, just like the old code did
    console.log("Emitting newTradePrompt with:", data.currentPromptType);
    io.to(room).emit("newTradePrompt", {
      promptType: data.currentPromptType,
      round: data.promptCount,
    });
  });

  socket.on('tryRoom', (room) => {
    if (rooms.has(room)) {
      io.to(socket.id).emit('roomExists');
    } else {
      io.to(socket.id).emit('noSuchRoom');
    }
  });

  // Player joins the room
  socket.on("join-room", (room, username, userID) => {
    console.log(`>>> join-room called: userID=${userID} username=${username} => room=${room}`);
    if (!username || !rooms.has(room)) {
      socket.emit("noSuchRoom");
      return;
    }
    const data = roomsData[room];
    if (!data) return;

    if (data.started && data.gameOver) {
      socket.emit("gameAlreadyStarted");
      return;
    }

    // check if username is taken
    if (Object.values(data.usernames).includes(username)) {
      socket.emit("usernameTaken");
      return;
    }

    data.usernames[userID] = username;
    playerToRoom[userID] = room;

    // Ensure positions object with $100
    if (!data.positions[userID]) {
      data.positions[userID] = { cash: 100, calls: 0, portfolioHistory: [] };
    }

    socket.join(room);
    io.to(room).emit("updateUserDisp", Object.entries(data.usernames));
    socket.emit("joinApproved");
    console.log(`User ${username} joined room ${room}`);
  });

  // Player submits a bid
  socket.on("submitBid", (bidPrice, userID) => {
    const room = playerToRoom[userID];
    if (!room) return;

    const data = roomsData[room];
    if (!data || !data.started || data.gameOver) return;

    data.bids[userID] = bidPrice;
  });

  // Admin finalizes the game with final underlying price
  socket.on("finalizeGame", (adminID, finalPx) => {
    const room = adminToRoom[adminID];
    if (!room) return;
  
    const data = roomsData[room];
    if (!data) return;
  
    data.gameOver = true;
    if (data.roundInterval) {
      clearInterval(data.roundInterval);
    }
  
    const strike = 100; // Hard-coded strike price for all calls
    const results = {};
  
    for (const [uid, pos] of Object.entries(data.positions)) {
      // Calculate intrinsic value of calls (max of 0 and underlying price minus strike)
      const callIntrinsicValue = Math.max(0, finalPx - strike);
      
      // Final cash includes the liquidation value of any calls at intrinsic value
      const finalCash = pos.cash + (pos.calls * callIntrinsicValue);
  
      // Calculate last portfolio value for Sharpe ratio
      if (!pos.portfolioHistory) {
        pos.portfolioHistory = [];
      }
      
      // Add final portfolio value with calls at intrinsic value
      pos.portfolioHistory.push(finalCash);
      
      // Compute final Sharpe ratio
      const shrp = computeSharpeRatio(pos.portfolioHistory);
  
      // Add detailed results
      results[uid] = {
        username: data.usernames[uid],
        finalCash,
        sharpe: shrp,
        calls: pos.calls,
        callIntrinsicValue,
        portfolioHistory: pos.portfolioHistory,
        finalStockPrice: finalPx
      };
    }
  
    console.log(`Game finalized in room ${room} with final price ${finalPx} and strike ${strike}`);
    console.log(`Call intrinsic value: ${Math.max(0, finalPx - strike)}`);
    
    io.to(room).emit("finalResults", results);
  });

  // If admin disconnects, destroy the room
  socket.on("disconnect", () => {
    const room = adminToRoom[socket.userID];
    if (room) {
      destroyRoom(room, socket.userID);
    }
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

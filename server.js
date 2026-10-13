const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const iskembedenData = require('./data/iskembedenData');
const monoData = require('./data/monopolyData');
const monopolyBoard = (monoData && monoData.monopolyBoard) ? monoData.monopolyBoard : [];
const sansKartlari = (monoData && monoData.sansKartlari) ? monoData.sansKartlari : [];
const kamuFonuKartlari = (monoData && monoData.kamuFonuKartlari) ? monoData.kamuFonuKartlari : [];
const rawTabuKartlari = require('./data/tabuData');
const rawImposterKelimeler = require('./data/imposterData');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

function shuffleArray(array) { const arr = [...array]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

let players = [];
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

function broadcastMonoLog(msg) { monoState.log.unshift(msg); io.emit('monoGlobalAlert', msg); }

const usedQuestionMemory = { celebrity: new Set(), market: new Set(), car: new Set() };
let guessState = { active: false, mode: 'celebrity', currentQuestionIndex: 0, questions: [], timer: null, timeLeft: 15, guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: 5 };
let monoState = { active: false, board: monopolyBoard.length ? JSON.parse(JSON.stringify(monopolyBoard)) : [], players: [], turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, mustResolveDebt: false, log: [] };
let raceState = { active: false, cars: {}, items: [], itemBoxes: [ { id: 1, x: 380, y: 640, active: true, respawnTimer: 0 }, { id: 2, x: 1060, y: 380, active: true, respawnTimer: 0 }, { id: 3, x: 620, y: 160, active: true, respawnTimer: 0 } ], loopInterval: null, totalLaps: 3, winner: null };
let stickState = { active: false, runners: {}, obstacles: [], platforms: [], pads: [], boxes: [], projectiles: [], finishLine: 7500, loopInterval: null, winner: null };
let currentTabuDeck = [];
let tabuState = { scores: { red: 0, blue: 0 }, currentCard: null, describerId: null, currentTeam: 'red', passCount: 3, timer: null, timeLeft: 60, roundActive: false, isIntermission: false, intermissionTimer: null, maxRounds: 5, currentRound: 1, teamTurnCount: 0 };
let currentImposterDeck = [];
let imposterState = { word: '', imposterId: '', imposterName: '', votes: {}, timer: null };
let wormsState = { active: false, worms: {}, turnId: null, turnOrder: [], wind: 0, activeProjectile: null, terrainHeights: Array(1000).fill(600), loopInterval: null, winner: null, projectileFired: false };
let casusState = { active: false, players: {}, phase: 'play', resolveMessage: '', winner: null };

function checkAndResetEmptyRooms() {
    const counts = { guess: 0, monopoly: 0, race: 0, stickrun: 0, tabu: 0, imposter: 0, worms: 0, casus: 0 };
    players.forEach(p => { if (counts[p.lobby] !== undefined) counts[p.lobby]++; });
    if (counts.guess === 0 && guessState.active) { guessState.active = false; clearInterval(guessState.timer); guessState.timer = null; }
    if (counts.monopoly === 0 && monoState.active) { monoState.active = false; }
    if (counts.race === 0 && raceState.active) { raceState.active = false; clearInterval(raceState.loopInterval); raceState.loopInterval = null; }
    if (counts.stickrun === 0 && stickState.active) { stickState.active = false; clearInterval(stickState.loopInterval); stickState.loopInterval = null; }
    if (counts.worms === 0 && wormsState.active) { wormsState.active = false; clearInterval(wormsState.loopInterval); wormsState.loopInterval = null; }
    if (counts.casus === 0 && casusState.active) { casusState.active = false; }
    if (counts.tabu === 0 && (tabuState.roundActive || tabuState.isIntermission)) { tabuState.roundActive = false; tabuState.isIntermission = false; clearInterval(tabuState.timer); clearInterval(tabuState.intermissionTimer); }
    if (counts.imposter === 0 && imposterState.timer) { clearInterval(imposterState.timer); imposterState.timer = null; }
}

const trackWaypoints = [ { x: 550, y: 640 }, { x: 920, y: 640 }, { x: 1080, y: 520 }, { x: 1080, y: 260 }, { x: 920, y: 140 }, { x: 680, y: 140 }, { x: 580, y: 320 }, { x: 420, y: 320 }, { x: 320, y: 140 }, { x: 140, y: 240 }, { x: 130, y: 520 }, { x: 320, y: 640 }, { x: 550, y: 640 } ];
function distToSegment(p, v, w) { const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y); if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y); let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y))); }
function isCarOnTrack(x, y) { let minDist = 9999; for (let i = 0; i < trackWaypoints.length - 1; i++) { const d = distToSegment({ x, y }, trackWaypoints[i], trackWaypoints[i + 1]); if (d < minDist) minDist = d; } return minDist <= 65; }

function generateStickParkour() {
    const obstacles = [], platforms = [], pads = [], boxes = [];
    for (let x = 600; x < 7100; x += 330) {
        const rand = Math.random();
        if (rand < 0.30) { platforms.push({ x: x + 40, y: 235, w: 190 }); pads.push({ x: x - 20, w: 40, type: 'jump' }); obstacles.push({ x: x + 90, w: 44, type: 'saw' }); boxes.push({ id: x, x: x + 135, y: 185, active: true, respawnTimer: 0 }); } 
        else if (rand < 0.55) { pads.push({ x: x - 30, w: 65, type: 'speed' }); obstacles.push({ x: x + 80, w: 45, type: 'high' }); boxes.push({ id: x, x: x + 200, y: 310, active: true, respawnTimer: 0 }); } 
        else { const obsType = Math.random() < 0.5 ? 'saw' : 'low'; obstacles.push({ x: x + 30, w: 50, type: obsType }); if (Math.random() < 0.7) boxes.push({ id: x, x: x + 160, y: 215, active: true, respawnTimer: 0 }); }
    } return { obstacles, platforms, pads, boxes };
}

function generateWormsTerrain() {
    let terrain = new Array(1000).fill(0);
    let seed1 = Math.random() * 100; let seed2 = Math.random() * 100; let seed3 = Math.random() * 100;
    for(let x=0; x<1000; x++) {
        let h = 400; 
        h += Math.sin(x / 150 + seed1) * 120; h += Math.sin(x / 50 + seed2) * 60; h += Math.sin(x / 15 + seed3) * 20; h += (Math.random() - 0.5) * 15;
        if(h < 150) h = 150; if(h > 580) h = 580; terrain[x] = h;
    }
    for(let passes = 0; passes < 3; passes++) { let temp = [...terrain]; for(let i=1; i<999; i++) terrain[i] = (temp[i-1] + temp[i] + temp[i+1]) / 3; }
    return terrain;
}

function generateCasusDeck() {
    const deck = [];
    const types = [
        { name: 'Casus', power: 1, type: 'support' },
        { name: 'Miladi Piyade', power: 2, type: 'army' },
        { name: 'Mızraklı', power: 3, type: 'army' },
        { name: 'Kılıçlı', power: 4, type: 'army' },
        { name: 'Okçu', power: 5, type: 'army' },
        { name: 'Arbaletçi', power: 6, type: 'army' },
        { name: 'Hafif Süvari', power: 7, type: 'army' },
        { name: 'Ağır Süvari', power: 8, type: 'army' },
        { name: 'Kuşatma', power: 9, type: 'army' },
        { name: 'Şövalye', power: 10, type: 'army' }
    ];
    for (let i = 0; i < 2; i++) { types.forEach(t => deck.push({...t})); }
    return shuffleArray(deck);
}

function getRentDetails(tile, diceSum) {
    if (tile.type === 'property') {
        const groupTiles = monoState.board.filter(t => t.type === 'property' && t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => t.owner === tile.owner);
        const isMonopoly = groupTiles.length === ownedInGroup.length;
        let baseR = Math.floor(tile.price * 0.20); if (baseR < 1) baseR = 1;
        return { rent: isMonopoly ? (baseR * 2) : baseR, isMonopoly, note: isMonopoly ? '🔥 TEKEL ZAMMI (x2 Kira)' : 'Standart Kira' };
    }
    if (tile.type === 'pitch') {
        const ownedPitches = monoState.board.filter(t => t.type === 'pitch' && t.owner === tile.owner).length;
        return { rent: [0, 25, 50, 100, 200][ownedPitches] || 25, isMonopoly: ownedPitches === 4, note: `⚽ ${ownedPitches} Halısaha Sahibi` };
    }
    if (tile.type === 'utility') {
        const ownedUtils = monoState.board.filter(t => t.type === 'utility' && t.owner === tile.owner).length;
        const multiplier = ownedUtils === 2 ? 10 : 4; return { rent: diceSum * multiplier, isMonopoly: ownedUtils === 2, note: `💡 ${ownedUtils} Kamu Binası (Zar x ${multiplier})` };
    } return { rent: 0, isMonopoly: false, note: '' };
}

function checkHalısahaWin(ownerId, ownerName) {
    if (monoState.board.filter(t => t.type === 'pitch' && t.owner === ownerId).length === 4) {
        monoState.active = false; broadcastMonoLog(`🏆🏆 GOLDEN GOAL! ${ownerName} 4 HALISAHAIN HEPSİNİ ALARAK OYUNU KAZANDI! 🏆🏆`); io.emit('monopolyStateUpdated', monoState); return true;
    } return false;
}
function checkSideWin(ownerId, ownerName) {
    const sides = [ [1, 3, 5, 6, 8, 9], [11, 12, 13, 14, 15, 16, 18, 19], [21, 23, 24, 25, 26, 27, 28, 29], [31, 32, 34, 35, 37, 39] ];
    for (let side of sides) {
        if (side.every(id => monoState.board[id].owner === ownerId)) {
            monoState.active = false; broadcastMonoLog(`🏆🏆 İMPARATORLUK! ${ownerName} BİR KENARIN TAMAMINI SATIN ALARAK OYUNU KAZANDI! 🏆🏆`); io.emit('monopolyStateUpdated', monoState); return true;
        }
    } return false;
}
function checkBankruptcy(player) {
    if (player.money < 0) {
        player.bankrupt = true; broadcastMonoLog(`💀 ${player.name} İFLAS ETTİ ve elendi! Tüm tapuları boşa düştü.`);
        monoState.board.forEach(t => { if (t.owner === player.id) { delete t.owner; delete t.ownerName; delete t.buyoutCount; } });
    }
}

io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10 kişi)');
        players.push({ id: socket.id, name, team: 'red', ready: false, lobby: 'main', color: playerColors[players.length % playerColors.length] });
        io.emit('updateLobby', { players });
    });

    socket.on('selectGame', (gameType) => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.lobby = gameType; p.ready = false; checkAndResetEmptyRooms();
            socket.emit('gameSelected', gameType); io.emit('updateLobbyStatuses', { players });
            if (gameType === 'tabu') socket.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) { p.ready = !p.ready; io.emit('updateLobbyStatuses', { players }); if (p.lobby === 'tabu') io.emit('updateTabuLobby', { players, tabuState }); }
    });

    socket.on('backToLobby', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) { p.lobby = 'main'; p.ready = false; }
        checkAndResetEmptyRooms(); socket.emit('gameSelected', 'lobby'); io.emit('updateLobby', { players });
    });

    // Casus Belli
    socket.on('startCasusGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'casus');
        if (gamePlayers.length !== 2) return socket.emit('errorMsg', 'Casus Belli tam olarak 2 kişiyle oynanır!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        casusState.active = true; casusState.players = {}; casusState.phase = 'play'; casusState.winner = null;
        gamePlayers.forEach(p => {
            const deck = generateCasusDeck(); const hand = deck.splice(0, 5);
            casusState.players[p.id] = { id: p.id, name: p.name, deck: deck, hand: hand, trash: [], playedCard: null, hasPlayed: false };
        });
        io.emit('casusStarted'); sendCasusUpdate();
    });

    socket.on('casusPlayCard', (handIndex) => {
        if (!casusState.active || casusState.phase !== 'play') return;
        const p = casusState.players[socket.id];
        if (!p || p.hasPlayed || !p.hand[handIndex]) return;
        p.playedCard = p.hand.splice(handIndex, 1)[0]; p.hasPlayed = true;
        if (Object.values(casusState.players).every(player => player.hasPlayed)) { resolveCasusTurn(); } else { sendCasusUpdate(); }
    });

    function resolveCasusTurn() {
        casusState.phase = 'resolve';
        const pIds = Object.keys(casusState.players);
        const p1 = casusState.players[pIds[0]]; const p2 = casusState.players[pIds[1]];
        const c1 = p1.playedCard; const c2 = p2.playedCard;
        let winnerId = null; let msg = '';

        if (c1.power === 1 && c2.power === 10) winnerId = p1.id;
        else if (c2.power === 1 && c1.power === 10) winnerId = p2.id;
        else if (c1.power > c2.power) winnerId = p1.id;
        else if (c2.power > c1.power) winnerId = p2.id;

        if (winnerId === p1.id) { p1.deck.unshift(c1); p2.trash.push(c2); msg = `⚔️ ${p1.name} (${c1.name}: ${c1.power}), ${p2.name}'i (${c2.name}: ${c2.power}) yendi!`; } 
        else if (winnerId === p2.id) { p2.deck.unshift(c2); p1.trash.push(c1); msg = `⚔️ ${p2.name} (${c2.name}: ${c2.power}), ${p1.name}'i (${c1.name}: ${c1.power}) yendi!`; } 
        else { p1.trash.push(c1); p2.trash.push(c2); msg = `⚔️ İki taraf da denk güçte (${c1.power})! İki kart da çöpe gitti.`; }

        casusState.resolveMessage = msg; sendCasusUpdate();

        setTimeout(() => {
            [p1, p2].forEach(p => {
                p.playedCard = null; p.hasPlayed = false;
                if (p.hand.length < 5 && p.deck.length > 0) p.hand.push(p.deck.pop());
            });
            const p1Alive = p1.hand.length > 0 || p1.deck.length > 0;
            const p2Alive = p2.hand.length > 0 || p2.deck.length > 0;
            if (!p1Alive && !p2Alive) { casusState.active = false; io.emit('casusFinished', { winner: 'BERABERE' }); } 
            else if (!p1Alive) { casusState.active = false; io.emit('casusFinished', { winner: p2.name }); } 
            else if (!p2Alive) { casusState.active = false; io.emit('casusFinished', { winner: p1.name }); } 
            else { casusState.phase = 'play'; casusState.resolveMessage = ''; sendCasusUpdate(); }
        }, 4000);
    }

    function sendCasusUpdate() {
        const safePlayers = {};
        for (let id in casusState.players) {
            const p = casusState.players[id];
            safePlayers[id] = { id: p.id, name: p.name, deckCount: p.deck.length, trashCount: p.trash.length, handCount: p.hand.length, hasPlayed: p.hasPlayed, playedCard: casusState.phase === 'resolve' ? p.playedCard : null };
        }
        for (let id in casusState.players) {
            const p = casusState.players[id]; io.to(id).emit('casusUpdate', { phase: casusState.phase, resolveMessage: casusState.resolveMessage, players: safePlayers, myHand: p.hand });
        }
    }

    // İşkembeden Sallama
    socket.on('startGuessGame', (data) => {
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        let subMode = data && data.mode ? data.mode : 'celebrity';
        let requestedRounds = data && data.rounds ? parseInt(data.rounds) : 5;
        const fullPool = iskembedenData[subMode] || iskembedenData.celebrity;
        let availablePool = fullPool.filter(q => !usedQuestionMemory[subMode].has(q.title));
        if (availablePool.length < requestedRounds) { usedQuestionMemory[subMode].clear(); availablePool = [...fullPool]; }
        const chosenQuestions = shuffleArray(availablePool).slice(0, requestedRounds);
        chosenQuestions.forEach(q => usedQuestionMemory[subMode].add(q.title));
        guessState = { active: true, mode: subMode, currentQuestionIndex: 0, questions: chosenQuestions, timer: null, timeLeft: 15, guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: requestedRounds };
        gamePlayers.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {}; guessState.readyForNextRound = {}; guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];
        io.emit('guessRoundStarted', { mode: guessState.mode, questionIndex: guessState.currentQuestionIndex + 1, maxQuestions: guessState.maxQuestions, question: { title: q.title, hint: q.hint, img: q.img, wiki: q.wiki, wikiLang: q.wikiLang }, timeLeft: guessState.timeLeft });
        if (guessState.timer) clearInterval(guessState.timer);
        guessState.timer = setInterval(() => { guessState.timeLeft--; io.emit('guessTimerTick', guessState.timeLeft); if (guessState.timeLeft <= 0) { clearInterval(guessState.timer); endGuessRound(); } }, 1000);
    }

    socket.on('submitGuess', (val) => {
        if (!guessState.active || guessState.guesses[socket.id]) return;
        const num = parseFloat(val); if (isNaN(num)) return;
        guessState.guesses[socket.id] = { value: num, timeLeft: guessState.timeLeft, scoreGained: 0 };
        socket.emit('guessLockedNotice');
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        if (Object.keys(guessState.guesses).length === gamePlayers.length) { clearInterval(guessState.timer); endGuessRound(); }
    });

    function endGuessRound() {
        const q = guessState.questions[guessState.currentQuestionIndex]; const actual = q.actual; const roundResults = [];
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        gamePlayers.forEach(p => {
            const userGuess = guessState.guesses[p.id]; let score = 0;
            if (userGuess) {
                const diff = Math.abs(userGuess.value - actual); let accuracyScore = 0;
                if (guessState.mode === 'celebrity') { accuracyScore = Math.max(0, 1000 - (diff * 120)); } 
                else { const ratio = diff / actual; accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio)); }
                score = Math.round(accuracyScore * (0.5 + (0.5 * (userGuess.timeLeft / 15))));
                userGuess.scoreGained = score; guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }
            roundResults.push({ id: p.id, name: p.name, guess: userGuess ? userGuess.value : 'Tahmin Yok', scoreGained: score, totalScore: guessState.totalScores[p.id] || 0 });
        });
        roundResults.sort((a, b) => b.totalScore - a.totalScore);
        guessState.readyForNextRound = {};
        io.emit('guessRoundEnded', { actual, unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL', results: roundResults, isLastQuestion: (guessState.currentQuestionIndex + 1 >= guessState.maxQuestions), readyStatus: gamePlayers.map(p => ({ id: p.id, name: p.name, ready: false })) });
    }

    socket.on('guessNextRoundReadyToggle', () => {
        if (!guessState.active) return;
        guessState.readyForNextRound[socket.id] = !guessState.readyForNextRound[socket.id];
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        const readyList = gamePlayers.map(p => ({ id: p.id, name: p.name, ready: !!guessState.readyForNextRound[p.id] }));
        io.emit('guessNextRoundReadyUpdate', readyList);
        if (gamePlayers.every(p => guessState.readyForNextRound[p.id])) {
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) { startGuessRound(); } 
            else {
                guessState.active = false;
                const finalLeaderboard = gamePlayers.map(p => ({ name: p.name, totalScore: guessState.totalScores[p.id] || 0 })).sort((a, b) => b.totalScore - a.totalScore);
                io.emit('guessGameOver', { finalLeaderboard });
            }
        }
    });

    // Araba Yarışı
    socket.on('startRaceGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'race');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);
        raceState.active = true; raceState.winner = null; raceState.cars = {}; raceState.items = [];
        gamePlayers.forEach((p, idx) => {
            raceState.cars[p.id] = { id: p.id, name: p.name, color: p.color, x: 480 - (idx * 35), y: 640, angle: 0, speed: 0, vx: 0, vy: 0, lap: 1, checkpoints: [false, false, false], heldItem: null, isSpinning: false, spinAngleSpeed: 0, finished: false, inputs: { up: false, down: false, left: false, right: false } };
        });
        io.emit('raceStarted', { totalLaps: raceState.totalLaps });
        raceState.loopInterval = setInterval(() => {
            if (!raceState.active) return;
            raceState.itemBoxes.forEach(box => { if (!box.active) { box.respawnTimer--; if (box.respawnTimer <= 0) box.active = true; } });
            for (let i = raceState.items.length - 1; i >= 0; i--) {
                const item = raceState.items[i];
                if (item.type === 'rocket') {
                    item.x += Math.cos(item.angle) * 14; item.y += Math.sin(item.angle) * 14; item.life--;
                    for (let id in raceState.cars) {
                        const car = raceState.cars[id];
                        if (id !== item.ownerId && !car.finished && Math.hypot(car.x - item.x, car.y - item.y) < 28) {
                            car.isSpinning = true; car.spinAngleSpeed = 0.35; car.vx = Math.cos(item.angle) * 4; car.vy = Math.sin(item.angle) * 4;
                            car.speed = Math.max(1.5, car.speed * 0.6); item.life = 0; io.emit('monoGlobalAlert', `💥 ${item.ownerName}'in Roketi ${car.name}'i savurdu!`); break;
                        }
                    }
                    if (item.life <= 0 || item.x < 0 || item.x > 1200 || item.y < 0 || item.y > 750) raceState.items.splice(i, 1);
                }
            }
            for (let id in raceState.cars) {
                const car = raceState.cars[id];
                if (car.finished) continue;
                const onTrack = isCarOnTrack(car.x, car.y); const maxSpeed = onTrack ? 7.2 : 2.6;
                if (car.isSpinning) {
                    car.angle += car.spinAngleSpeed; car.spinAngleSpeed *= 0.94; car.speed *= 0.94; car.x += car.vx; car.y += car.vy; car.vx *= 0.94; car.vy *= 0.94;
                    if (Math.abs(car.spinAngleSpeed) < 0.03) { car.isSpinning = false; car.spinAngleSpeed = 0; }
                } else {
                    if (car.inputs.up) car.speed += onTrack ? 0.28 : 0.09;
                    if (car.inputs.down) car.speed -= 0.2;
                    car.speed *= onTrack ? 0.96 : 0.88;
                    if (car.speed > maxSpeed) car.speed = maxSpeed; if (car.speed < -2.0) car.speed = -2.0;
                    if (Math.abs(car.speed) > 0.1) {
                        const dir = car.speed > 0 ? 1 : -1;
                        if (car.inputs.left) car.angle -= 0.065 * dir;
                        if (car.inputs.right) car.angle += 0.065 * dir;
                    }
                    car.vx = Math.cos(car.angle) * car.speed; car.vy = Math.sin(car.angle) * car.speed; car.x += car.vx; car.y += car.vy;
                }
                car.x = Math.max(20, Math.min(1180, car.x)); car.y = Math.max(20, Math.min(730, car.y));
                raceState.itemBoxes.forEach(box => {
                    if (box.active && Math.hypot(car.x - box.x, car.y - box.y) < 30) { box.active = false; box.respawnTimer = 150; if (!car.heldItem) car.heldItem = Math.random() < 0.5 ? 'banana' : 'rocket'; }
                });
                for (let i = raceState.items.length - 1; i >= 0; i--) {
                    const item = raceState.items[i];
                    if (item.type === 'banana' && Math.hypot(car.x - item.x, car.y - item.y) < 22) {
                        car.isSpinning = true; car.spinAngleSpeed = 0.38; car.vx = Math.cos(car.angle) * (car.speed * 0.8); car.vy = Math.sin(car.angle) * (car.speed * 0.8);
                        car.speed *= 0.7; raceState.items.splice(i, 1); io.emit('monoGlobalAlert', `🍌 ${car.name} muza bastı ve drift attı!`); break;
                    }
                }
                if (car.x > 950 && car.y < 350) car.checkpoints[0] = true; if (car.x < 650 && car.x > 500 && car.y < 380) car.checkpoints[1] = true; if (car.x < 250 && car.y > 350) car.checkpoints[2] = true;
                if (car.checkpoints[0] && car.checkpoints[1] && car.checkpoints[2] && car.x > 570 && car.x < 605 && car.y > 580) {
                    car.checkpoints = [false, false, false]; car.lap++;
                    if (car.lap > raceState.totalLaps) {
                        car.finished = true;
                        if (!raceState.winner) { raceState.winner = car.name; raceState.active = false; clearInterval(raceState.loopInterval); io.emit('raceFinished', { winner: car.name }); break; }
                    }
                }
            }
            io.emit('raceUpdate', { cars: raceState.cars, items: raceState.items, boxes: raceState.itemBoxes });
        }, 1000 / 30);
    });

    socket.on('raceInput', (inputs) => { if (raceState.active && raceState.cars[socket.id]) raceState.cars[socket.id].inputs = inputs; });
    socket.on('raceUseItem', () => {
        if (!raceState.active || !raceState.cars[socket.id]) return; const car = raceState.cars[socket.id];
        if (!car.heldItem || car.isSpinning) return;
        if (car.heldItem === 'banana') raceState.items.push({ type: 'banana', x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26 });
        else if (car.heldItem === 'rocket') raceState.items.push({ type: 'rocket', ownerId: car.id, ownerName: car.name, x: car.x + Math.cos(car.angle) * 28, y: car.y + Math.sin(car.angle) * 28, angle: car.angle, life: 100 });
        car.heldItem = null;
    });

    // Stick Run
    socket.on('startStickGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'stickrun');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan koşu başlamaz!');
        if (stickState.loopInterval) clearInterval(stickState.loopInterval);
        const parkour = generateStickParkour();
        stickState.active = true; stickState.winner = null; stickState.obstacles = parkour.obstacles; stickState.platforms = parkour.platforms;
        stickState.pads = parkour.pads; stickState.boxes = parkour.boxes; stickState.projectiles = []; stickState.runners = {};
        gamePlayers.forEach((p, idx) => { stickState.runners[p.id] = { id: p.id, name: p.name, color: p.color, x: 100 - (idx * 22), y: 350, vy: 0, speed: 6.2, onGround: true, jumpsLeft: 2, ducking: false, heldItem: null, boostTimer: 0, shieldTimer: 0, stunTimer: 0, hitCooldown: 0 }; });
        io.emit('stickStarted', { obstacles: stickState.obstacles, platforms: stickState.platforms, pads: stickState.pads, boxes: stickState.boxes, finishLine: stickState.finishLine });
        stickState.loopInterval = setInterval(() => {
            if (!stickState.active) return;
            stickState.boxes.forEach(b => { if (!b.active) { b.respawnTimer--; if (b.respawnTimer <= 0) b.active = true; } });
            for (let i = stickState.projectiles.length - 1; i >= 0; i--) {
                const proj = stickState.projectiles[i];
                if (proj.type === 'rocket') { proj.x += 13.5; proj.life--; }
                let hitSomeone = false;
                for (let id in stickState.runners) {
                    const r = stickState.runners[id];
                    if (id !== proj.ownerId && r.shieldTimer <= 0 && r.hitCooldown <= 0) {
                        if (Math.abs(r.x - proj.x) < 26 && Math.abs((r.y - 25) - proj.y) < 38) {
                            r.stunTimer = 38; r.hitCooldown = 50; r.vy = -9; r.onGround = false; r.x -= 35; hitSomeone = true;
                            io.emit('stickEffect', { type: 'hit', x: r.x, y: r.y - 20, id: r.id }); io.emit('monoGlobalAlert', `💥 ${proj.ownerName}'in ${proj.type === 'trap' ? 'Mayını' : 'Füzesi'} ${r.name}'i havaya uçurdu!`); break;
                        }
                    }
                }
                if (hitSomeone || (proj.type === 'rocket' && proj.life <= 0)) stickState.projectiles.splice(i, 1);
            }
            for (let id in stickState.runners) {
                const r = stickState.runners[id];
                if (r.boostTimer > 0) r.boostTimer--; if (r.shieldTimer > 0) r.shieldTimer--; if (r.stunTimer > 0) r.stunTimer--; if (r.hitCooldown > 0) r.hitCooldown--;
                if (r.stunTimer > 0) { r.speed = 0.8; } else if (r.boostTimer > 0) { r.speed = 11.2; } else { r.speed = r.ducking && r.onGround ? 4.8 : 6.4; }
                const prevY = r.y; r.x += r.speed; r.y += r.vy; r.vy += 0.82; r.onGround = false;
                if (r.vy >= 0) { stickState.platforms.forEach(plat => { if (r.x >= plat.x - 10 && r.x <= plat.x + plat.w + 10 && prevY <= plat.y + 4 && r.y >= plat.y) { r.y = plat.y; r.vy = 0; r.onGround = true; r.jumpsLeft = 2; } }); }
                if (r.y >= 350) { r.y = 350; r.vy = 0; r.onGround = true; r.jumpsLeft = 2; }
                if (r.y >= 340) {
                    stickState.pads.forEach(pad => {
                        if (r.x >= pad.x && r.x <= pad.x + pad.w) {
                            if (pad.type === 'jump' && r.vy >= 0) { r.vy = -17.5; r.onGround = false; r.jumpsLeft = 1; io.emit('stickEffect', { type: 'bounce', x: r.x, y: 345 }); } 
                            else if (pad.type === 'speed') { r.boostTimer = Math.max(r.boostTimer, 25); }
                        }
                    });
                }
                const centerY = r.y - (r.ducking ? 15 : 28);
                stickState.boxes.forEach(box => { if (box.active && Math.abs(r.x - box.x) < 30 && Math.abs(centerY - box.y) < 36) { box.active = false; box.respawnTimer = 110; if (!r.heldItem) r.heldItem = ['boost', 'lightning', 'shield', 'trap', 'rocket'][Math.floor(Math.random() * 5)]; } });
                let landedOnBox = false;
                if (r.shieldTimer <= 0 && r.hitCooldown <= 0) {
                    stickState.obstacles.forEach(obs => {
                        if (r.x + 10 > obs.x && r.x - 10 < obs.x + obs.w) {
                            if (obs.type === 'low') {
                                if (r.vy >= 0 && prevY <= 298 && r.y >= 290) { r.y = 290; r.vy = 0; r.onGround = true; r.jumpsLeft = 2; landedOnBox = true; } 
                                else if (!landedOnBox && r.y > 295) { r.stunTimer = 22; r.hitCooldown = 35; r.x -= 30; io.emit('stickEffect', { type: 'hit', x: r.x, y: r.y - 15, id: r.id }); }
                            } 
                            else if (obs.type === 'saw' && r.y > 296) { r.stunTimer = 25; r.hitCooldown = 40; r.vy = -7; r.onGround = false; r.x -= 35; io.emit('stickEffect', { type: 'hit', x: r.x, y: r.y - 15, id: r.id }); } 
                            else if (obs.type === 'high' && r.y > 250 && (!r.ducking || r.y < 335)) { r.stunTimer = 25; r.hitCooldown = 40; r.x -= 35; io.emit('stickEffect', { type: 'hit', x: r.x, y: r.y - 35, id: r.id }); }
                        }
                    });
                }
                if (r.x >= stickState.finishLine && !stickState.winner) {
                    stickState.winner = r.name; stickState.active = false; clearInterval(stickState.loopInterval); io.emit('stickFinished', { winner: r.name }); io.emit('monoGlobalAlert', `🏆 ${r.name} Stick Run parkurunu 1. tamamladı!`); break;
                }
            }
            io.emit('stickUpdate', { runners: stickState.runners, boxes: stickState.boxes, projectiles: stickState.projectiles });
        }, 1000 / 30);
    });

    socket.on('stickInput', (data) => {
        const r = stickState.runners[socket.id]; if (!stickState.active || !r) return;
        if (data.action === 'jump' && r.jumpsLeft > 0 && r.stunTimer <= 0) {
            if (r.onGround || r.jumpsLeft === 2) { r.vy = -13.5; r.onGround = false; r.jumpsLeft = 1; } else if (r.jumpsLeft === 1) { r.vy = -12.5; r.jumpsLeft = 0; io.emit('stickEffect', { type: 'doubleJump', x: r.x, y: r.y }); }
            r.ducking = false;
        } else if (data.action === 'duck') { r.ducking = !!data.state; if (r.ducking && !r.onGround) r.vy += 3; } 
        else if (data.action === 'item' && r.heldItem) {
            const item = r.heldItem; r.heldItem = null;
            if (item === 'boost') { r.boostTimer = 70; io.emit('monoGlobalAlert', `🔥 ${r.name} Nitro Turbo bastı!`); } else if (item === 'shield') { r.shieldTimer = 140; io.emit('monoGlobalAlert', `🛡️ ${r.name} Enerji Kalkanı açtı!`); } else if (item === 'trap') { stickState.projectiles.push({ type: 'trap', ownerId: r.id, ownerName: r.name, x: r.x - 30, y: 345 }); } else if (item === 'rocket') { stickState.projectiles.push({ type: 'rocket', ownerId: r.id, ownerName: r.name, x: r.x + 25, y: r.y - 28, life: 90 }); } 
            else if (item === 'lightning') {
                const struckTargets = [];
                for (let otherId in stickState.runners) { const target = stickState.runners[otherId]; if (otherId !== socket.id && target.x > r.x && target.shieldTimer <= 0) { target.stunTimer = 45; struckTargets.push(target.x); } }
                io.emit('stickEffect', { type: 'lightning', targets: struckTargets }); io.emit('monoGlobalAlert', `⚡ ${r.name} Yıldırım çaktı ve öndeki ${struckTargets.length} kişiyi çarptı!`);
            }
        }
    });

    // Monopoly
    socket.on('startMonopolyGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'monopoly');
        if (gamePlayers.length < 2) return socket.emit('errorMsg', 'En az 2 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');
        monoState = {
            active: true, board: JSON.parse(JSON.stringify(monopolyBoard)),
            players: gamePlayers.map((p, idx) => ({ id: p.id, name: p.name, color: playerColors[idx % playerColors.length], money: 1500, position: 0, inJail: false, jailTurns: 0, jailCardCount: 0, bankrupt: false })),
            turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, mustResolveDebt: false, log: []
        };
        broadcastMonoLog('KTÜ Monopoly başladı! İlk oyuncu zar atabilir.'); io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyRollDice', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (!cp || socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (monoState.waitingForDecision || monoState.waitingForDoblo || monoState.mustResolveDebt) return socket.emit('errorMsg', 'Önce kararını tamamla!');
        const d1 = Math.floor(Math.random() * 6) + 1; const d2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = d1 === d2; const total = d1 + d2; monoState.dice = [d1, d2];
        if (cp.inJail) {
            cp.jailTurns++;
            if (cp.jailTurns < 3) {
                broadcastMonoLog(`🚨 ${cp.name} Blok derste çift atmayı denedi [${cp.jailTurns}. Hak]: ${d1}-${d2}`);
                if (isDouble) { cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`🎉 ÇİFT ZAR! ${cp.name} bedava çıktı!`); advanceMonoPlayer(cp, total, isDouble); return; } 
                else { broadcastMonoLog(`🔒 Çift gelmedi! ${cp.name} blok derste kaldı.`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; }
            } else { cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`⚖️ 3. TUR BİTTİ! ${cp.name} serbest kalarak [${total}] ilerliyor.`); advanceMonoPlayer(cp, total, isDouble); return; }
        }
        if (isDouble) {
            monoState.doubleRollCount++; broadcastMonoLog(`🎲 ${cp.name} ÇİFT ZAR ATTI! (${d1}-${d2})`);
            if (monoState.doubleRollCount === 3) { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; broadcastMonoLog(`🚨 3 çift atıldı, ${cp.name} BLOK DERSE GİTTİ!`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; }
        } else { monoState.doubleRollCount = 0; }
        advanceMonoPlayer(cp, total, isDouble);
    });

    function advanceMonoPlayer(cp, total, isDouble) {
        const oldPos = cp.position; let newPos = (oldPos + total) % 40;
        if (newPos < oldPos) { cp.money += 200; broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti ve 200₺ yolluk aldı.`); }
        cp.position = newPos; handleMonoTile(cp, newPos, isDouble, total);
    }

    function handleMonoTile(cp, pos, isDouble, diceSum) {
        const tile = monoState.board[pos];
        if (tile.type === 'doblo') { monoState.waitingForDoblo = true; io.to(cp.id).emit('monopolyDobloPrompt', { board: monoState.board.map(t => ({ id: t.id, name: t.name })) }); io.emit('monopolyStateUpdated', monoState); return; } 
        else if (tile.type === 'go_to_jail') { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; broadcastMonoLog(`🚨 ${cp.name} BLOK DERSE GİTTİ!`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; } 
        else if (tile.type === 'tax') { cp.money -= tile.amount; broadcastMonoLog(`💸 ${cp.name} vergi ödedi: -${tile.amount}₺`); postMonoAction(isDouble); return; } 
        else if (tile.type === 'chance' || tile.type === 'chest') { const deck = tile.type === 'chance' ? sansKartlari : kamuFonuKartlari; const card = deck[Math.floor(Math.random() * deck.length)]; broadcastMonoLog(`📦 [${tile.type === 'chance' ? 'ŞANS' : 'KAMU FONU'}]: "${card.text}"`); executeMonoCard(cp, card.action, isDouble); return; } 
        else if (tile.owner && tile.owner !== cp.id) {
            const owner = monoState.players.find(p => p.id === tile.owner);
            if (owner && !owner.bankrupt) {
                const rentInfo = getRentDetails(tile, diceSum || (monoState.dice[0] + monoState.dice[1])); cp.money -= rentInfo.rent; owner.money += rentInfo.rent;
                broadcastMonoLog(`⚠️ ${cp.name}, ${owner.name}'in mülküne bastı! ${rentInfo.note} ➜ Ödenen Kira: ${rentInfo.rent}₺`);
                const buyoutPrice = Math.floor(tile.price * 1.5);
                if (cp.money >= buyoutPrice && !cp.bankrupt && (tile.buyoutCount || 0) < 3) { monoState.waitingForDecision = true; io.to(cp.id).emit('monopolyBuyoutPrompt', { tile, buyoutPrice, ownerName: owner.name }); io.emit('monopolyStateUpdated', monoState); return; }
            }
            postMonoAction(isDouble); return;
        }
        if ((tile.type === 'property' || tile.type === 'pitch' || tile.type === 'utility') && !tile.owner && cp.money >= tile.price) { monoState.waitingForDecision = true; io.to(cp.id).emit('monopolyBuyPrompt', { tile }); } 
        else { postMonoAction(isDouble); }
        io.emit('monopolyStateUpdated', monoState);
    }

    function executeMonoCard(cp, action, isDouble) {
        const others = monoState.players.filter(p => p.id !== cp.id && !p.bankrupt);
        if (action === 'go_to_go') { cp.position = 0; cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'go_to_thanos') { cp.position = 39; handleMonoTile(cp, 39, isDouble, 7); }
        else if (action === 'nearest_pitch') { const pitches = [5, 15, 25, 35]; let nextPitch = pitches.find(p => p > cp.position); if (!nextPitch) { nextPitch = 5; cp.money += 200; } cp.position = nextPitch; handleMonoTile(cp, nextPitch, isDouble, 7); }
        else if (action === 'forward_3') { cp.position = (cp.position + 3) % 40; handleMonoTile(cp, cp.position, isDouble, 7); }
        else if (action === 'go_to_jail') { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; finishMonoTurn(); }
        else if (action === 'get_jail_card') { cp.jailCardCount = (cp.jailCardCount || 0) + 1; postMonoAction(isDouble); }
        else if (action === 'pay_each_50') { others.forEach(p => { cp.money -= 50; p.money += 50; }); postMonoAction(isDouble); }
        else if (action === 'collect_each_10') { others.forEach(p => { p.money -= 10; cp.money += 10; }); postMonoAction(isDouble); }
        else if (action === 'gain_50') { cp.money += 50; postMonoAction(isDouble); }
        else if (action === 'gain_100') { cp.money += 100; postMonoAction(isDouble); }
        else if (action === 'gain_150') { cp.money += 150; postMonoAction(isDouble); }
        else if (action === 'gain_200') { cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'pay_15') { cp.money -= 15; postMonoAction(isDouble); }
        else if (action === 'pay_50') { cp.money -= 50; postMonoAction(isDouble); }
        else if (action === 'pay_100') { cp.money -= 100; postMonoAction(isDouble); }
        else if (action === 'pay_150') { cp.money -= 150; postMonoAction(isDouble); }
        else { postMonoAction(isDouble); }
        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyDobloDrive', (targetTileId) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id || !monoState.waitingForDoblo) return;
        const targetId = parseInt(targetTileId); if (isNaN(targetId) || targetId < 0 || targetId >= 40) return;
        monoState.waitingForDoblo = false; if (targetId < cp.position) { cp.money += 200; } cp.position = targetId;
        const isDouble = (monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3; handleMonoTile(cp, targetId, isDouble, 7);
    });

    socket.on('monopolyBuyDecision', (buy) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id) return;
        monoState.waitingForDecision = false; const tile = monoState.board[cp.position];
        if (buy && tile && !tile.owner && cp.money >= tile.price) {
            cp.money -= tile.price; tile.owner = cp.id; tile.ownerName = cp.name; broadcastMonoLog(`🛒 ${cp.name}, ${tile.name} tapusunu ${tile.price}₺ bedelle satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return; if (checkSideWin(cp.id, cp.name)) return;
        }
        postMonoAction((monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3);
    });

    socket.on('monopolyBuyoutDecision', (buyout) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id) return;
        monoState.waitingForDecision = false; const tile = monoState.board[cp.position];
        const buyoutPrice = Math.floor(tile.price * 1.5); const prevOwner = monoState.players.find(p => p.id === tile.owner);
        if (buyout && prevOwner && cp.money >= buyoutPrice) {
            cp.money -= buyoutPrice; prevOwner.money += buyoutPrice; tile.owner = cp.id; tile.ownerName = cp.name;
            tile.price = buyoutPrice; tile.buyoutCount = (tile.buyoutCount || 0) + 1;
            broadcastMonoLog(`💥 ${cp.name}, mülkü zorla aldı! Yeni değer: ${buyoutPrice}₺`);
            if (checkHalısahaWin(cp.id, cp.name)) return; if (checkSideWin(cp.id, cp.name)) return;
        }
        postMonoAction((monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3);
    });

    socket.on('initiateTradeOffer', (data) => {
        const buyer = monoState.players.find(p => p.id === socket.id); const tile = monoState.board.find(t => t.id === data.tileId);
        if (!buyer || !tile || !tile.owner || tile.owner === socket.id) return;
        const amount = parseInt(data.offerAmount); if (isNaN(amount) || amount <= 0 || buyer.money < amount) return socket.emit('errorMsg', 'Geçersiz teklif!');
        const seller = monoState.players.find(p => p.id === tile.owner); if (!seller) return;
        monoState.activeTrade = { buyerId: buyer.id, buyerName: buyer.name, sellerId: seller.id, tileId: tile.id, tileName: tile.name, offerAmount: amount };
        broadcastMonoLog(`📢 DİKKAT: ${buyer.name}, ${seller.name}'e ${tile.name} tapusu için teklif sundu!`);
        io.to(seller.id).emit('incomingTradeOffer', monoState.activeTrade); socket.emit('tradePendingNotice', `Teklif (${amount}₺) iletildi.`);
    });

    socket.on('respondTradeOffer', (accepted) => {
        if (!monoState.activeTrade || socket.id !== monoState.activeTrade.sellerId) return;
        const trade = monoState.activeTrade; const buyer = monoState.players.find(p => p.id === trade.buyerId); const seller = monoState.players.find(p => p.id === trade.sellerId); const tile = monoState.board.find(t => t.id === trade.tileId);
        if (accepted && buyer && seller && buyer.money >= trade.offerAmount && tile.owner === seller.id) {
            buyer.money -= trade.offerAmount; seller.money += trade.offerAmount; tile.owner = buyer.id; tile.ownerName = buyer.name;
            broadcastMonoLog(`🤝 ANLAŞMA SAĞLANDI! ${buyer.name}, tapuyu ${trade.offerAmount}₺ bedelle aldı!`); io.emit('monopolyStateUpdated', monoState);
            checkHalısahaWin(buyer.id, buyer.name); checkSideWin(buyer.id, buyer.name);
        } else {
            broadcastMonoLog(`❌ Pazarlık reddedildi.`); if (buyer) io.to(buyer.id).emit('errorMsg', `Teklif kabul edilmedi.`); io.emit('monopolyStateUpdated', monoState);
        }
        monoState.activeTrade = null;
    });

    socket.on('monopolyPayJailBail', () => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id || !cp.inJail || cp.money < 100) return;
        cp.money -= 100; cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`🔓 ${cp.name} 100₺ kefalet ödedi ve serbest kaldı! Artık zar atabilir.`); io.emit('monopolyStateUpdated', monoState); 
    });

    socket.on('monopolyUseJailCard', () => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id || !cp.inJail || cp.jailCardCount <= 0) return;
        cp.jailCardCount--; cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`🎟️ ${cp.name} Konferans Kartını kullandı ve serbest kaldı! Artık zar atabilir.`); io.emit('monopolyStateUpdated', monoState); 
    });

    socket.on('monopolySellProperty', (tileId) => {
        const cp = monoState.players.find(p => p.id === socket.id); if (!cp) return; const tile = monoState.board.find(t => t.id === tileId); if (!tile || tile.owner !== cp.id) return;
        const sellValue = Math.floor(tile.price * 0.70); cp.money += sellValue; delete tile.owner; delete tile.ownerName; tile.buyoutCount = 0;
        const origTile = monopolyBoard.find(t => t.id === tileId); if(origTile) tile.price = origTile.price; 
        broadcastMonoLog(`📉 ${cp.name}, ${tile.name} tapusunu bankaya ${sellValue}₺ bedelle sattı.`);
        if (monoState.mustResolveDebt && cp.money >= 0) { monoState.mustResolveDebt = false; broadcastMonoLog(`✅ ${cp.name} borcunu kapattı, tur devam ediyor.`); const isDouble = (monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3; if (!isDouble) finishMonoTurn(); }
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyDeclareBankruptcy', () => {
        const cp = monoState.players.find(p => p.id === socket.id); if (!cp) return; cp.bankrupt = true; broadcastMonoLog(`🏳️ ${cp.name} İFLAS BAYRAĞINI ÇEKTİ ve elendi!`);
        monoState.board.forEach(t => { if (t.owner === cp.id) { delete t.owner; delete t.ownerName; delete t.buyoutCount; const orig = monopolyBoard.find(x => x.id === t.id); if (orig) t.price = orig.price; } });
        if (monoState.players[monoState.turnIndex].id === cp.id) { monoState.mustResolveDebt = false; finishMonoTurn(); }
        io.emit('monopolyStateUpdated', monoState);
    });

    function postMonoAction(isDouble) {
        const cp = monoState.players[monoState.turnIndex];
        if (cp.money < 0 && !cp.bankrupt) { monoState.mustResolveDebt = true; broadcastMonoLog(`⚠️ ${cp.name} BORCA GİRDİ! Mülk satarak nakit yaratmalı veya iflas etmeli.`); io.emit('monopolyStateUpdated', monoState); return; }
        if (isDouble && !cp.bankrupt && !cp.inJail) { broadcastMonoLog(`🎲 Çift attığın için tekrar zar atabilirsin!`); } else { finishMonoTurn(); }
        io.emit('monopolyStateUpdated', monoState);
    }

    function finishMonoTurn() {
        monoState.doubleRollCount = 0; monoState.waitingForDecision = false; monoState.waitingForDoblo = false; monoState.mustResolveDebt = false;
        let attempts = 0; do { monoState.turnIndex = (monoState.turnIndex + 1) % monoState.players.length; attempts++; } while (monoState.players[monoState.turnIndex].bankrupt && attempts < monoState.players.length);
        const activePlayers = monoState.players.filter(p => !p.bankrupt); if (activePlayers.length <= 1 && monoState.players.length > 1) { monoState.active = false; if (activePlayers[0]) broadcastMonoLog(`👑 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`); }
    }

    // Tabu
    socket.on('switchTabuTeam', (newTeam) => {
        const p = players.find(x => x.id === socket.id);
        if (p && (newTeam === 'red' || newTeam === 'blue')) { p.team = newTeam; p.ready = false; const gamePlayers = players.filter(pl => pl.lobby === 'tabu'); io.emit('updateTabuLobby', { players: gamePlayers, tabuState }); }
    });

    socket.on('startTabuGame', (selectedMaxRounds) => {
        const gamePlayers = players.filter(p => p.lobby === 'tabu');
        const redTeam = gamePlayers.filter(p => p.team === 'red'); const blueTeam = gamePlayers.filter(p => p.team === 'blue');
        if (redTeam.length === 0 || blueTeam.length === 0) return socket.emit('errorMsg', 'Her takımda en az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');
        currentTabuDeck = shuffleArray(rawTabuKartlari); tabuState.scores = { red: 0, blue: 0 }; tabuState.currentTeam = 'red'; tabuState.maxRounds = parseInt(selectedMaxRounds) || 5; tabuState.currentRound = 1; tabuState.teamTurnCount = 0;
        triggerTabuIntermission(gamePlayers);
    });

    function triggerTabuIntermission(gamePlayers) {
        const teamPlayers = gamePlayers.filter(p => p.team === tabuState.currentTeam);
        const describer = teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
        tabuState.describerId = describer.id; tabuState.roundActive = false; tabuState.isIntermission = true; let prepTime = 10;
        io.emit('tabuIntermissionStart', { team: tabuState.currentTeam, describerName: describer.name, describerId: describer.id, prepTime, currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds, scores: tabuState.scores });
        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        tabuState.intermissionTimer = setInterval(() => {
            prepTime--; io.emit('tabuIntermissionTick', prepTime);
            if (prepTime <= 0) { clearInterval(tabuState.intermissionTimer); tabuState.isIntermission = false; startTabuActualRound(describer, gamePlayers); }
        }, 1000);
    }

    function startTabuActualRound(describer, gamePlayers) {
        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        const card = currentTabuDeck.pop(); tabuState.currentCard = card; tabuState.timeLeft = 60; tabuState.passCount = 3; tabuState.roundActive = true;
        gamePlayers.forEach(p => {
            const isDescriber = p.id === describer.id; const isPlayingTeam = p.team === tabuState.currentTeam;
            io.to(p.id).emit('tabuTurnStarted', { describerId: describer.id, describerName: describer.name, currentTeam: tabuState.currentTeam, card: isDescriber ? card : null, scores: tabuState.scores, passCount: tabuState.passCount, currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds, role: isDescriber ? 'describer' : (isPlayingTeam ? 'guesser' : 'opponent') });
        });
        if (tabuState.timer) clearInterval(tabuState.timer);
        tabuState.timer = setInterval(() => {
            tabuState.timeLeft--; io.emit('tabuTimer', tabuState.timeLeft);
            if (tabuState.timeLeft <= 0) { clearInterval(tabuState.timer); endTabuTurn(gamePlayers); }
        }, 1000);
    }

    function endTabuTurn(gamePlayers) {
        tabuState.roundActive = false; tabuState.teamTurnCount++; if (tabuState.teamTurnCount % 2 === 0) tabuState.currentRound++;
        if (tabuState.currentRound > tabuState.maxRounds) {
            let winnerTeam = 'BERABERE'; if (tabuState.scores.red > tabuState.scores.blue) winnerTeam = 'KIRMIZI'; else if (tabuState.scores.blue > tabuState.scores.red) winnerTeam = 'MAVİ';
            io.emit('tabuMatchOver', { scores: tabuState.scores, winner: winnerTeam, maxRounds: tabuState.maxRounds });
        } else {
            tabuState.currentTeam = tabuState.currentTeam === 'red' ? 'blue' : 'red';
            io.emit('tabuTurnEnded', { scores: tabuState.scores, nextTeam: tabuState.currentTeam, currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds });
        }
    }

    socket.on('tabuNextTurn', () => { const gamePlayers = players.filter(p => p.lobby === 'tabu'); if (!tabuState.roundActive && !tabuState.isIntermission) triggerTabuIntermission(gamePlayers); });

    socket.on('tabuAction', (action) => {
        if (!tabuState.roundActive || socket.id !== tabuState.describerId) return;
        if (action === 'correct') tabuState.scores[tabuState.currentTeam] += 1;
        else if (action === 'taboo') tabuState.scores[tabuState.currentTeam] -= 1;
        else if (action === 'pass') { if (tabuState.passCount <= 0) return socket.emit('errorMsg', 'Pas hakkın kalmadı!'); tabuState.passCount -= 1; }
        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        tabuState.currentCard = currentTabuDeck.pop();
        io.emit('tabuScoreUpdated', { scores: tabuState.scores, passCount: tabuState.passCount }); io.to(tabuState.describerId).emit('tabuNewCardForDescriber', tabuState.currentCard);
    });

    // İmposter
    socket.on('startImposter', () => {
        const gamePlayers = players.filter(p => p.lobby === 'imposter');
        if (gamePlayers.length < 3) return socket.emit('errorMsg', 'İmposter için en az 3 oyuncu gerekir!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');
        if (imposterState.timer) clearInterval(imposterState.timer);
        currentImposterDeck = shuffleArray(rawImposterKelimeler);
        const secilen = currentImposterDeck[Math.floor(Math.random() * currentImposterDeck.length)];
        const imposter = gamePlayers[Math.floor(Math.random() * gamePlayers.length)];
        imposterState = { word: secilen.kelime.trim().toUpperCase('tr-TR'), imposterId: imposter.id, imposterName: imposter.name, votes: {}, timer: null };
        gamePlayers.forEach(p => {
            if (p.id === imposter.id) io.to(p.id).emit('imposterRole', { isImposter: true, info: `Sen IMPOSTER'sın! İpucun: "${secilen.ipucu}"` });
            else io.to(p.id).emit('imposterRole', { isImposter: false, info: `Gizli Kelime: "${secilen.kelime}"` });
        });
        let timeLeft = 30; io.emit('imposterTimer', timeLeft);
        imposterState.timer = setInterval(() => {
            timeLeft--; io.emit('imposterTimer', timeLeft);
            if (timeLeft <= 0) { clearInterval(imposterState.timer); io.emit('imposterStartVoting', gamePlayers); }
        }, 1000);
    });

    socket.on('imposterVote', (votedId) => {
        imposterState.votes[socket.id] = votedId; const gamePlayers = players.filter(p => p.lobby === 'imposter');
        if (Object.keys(imposterState.votes).length === gamePlayers.length) {
            const counts = {}; Object.values(imposterState.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            let mostVoted = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            const votedP = gamePlayers.find(p => p.id === mostVoted);
            if (mostVoted === imposterState.imposterId) {
                io.to(imposterState.imposterId).emit('imposterLastChance');
                gamePlayers.forEach(p => { if (p.id !== imposterState.imposterId) io.to(p.id).emit('imposterWaitGuess', votedP ? votedP.name : ''); });
            } else { io.emit('imposterResult', { winner: 'IMPOSTER', msg: `Yanlış kişi (${votedP ? votedP.name : 'Kimse'}) seçildi!`, imposterName: imposterState.imposterName, word: imposterState.word }); }
        }
    });

    socket.on('imposterGuess', (guess) => {
        const correct = guess.trim().toUpperCase('tr-TR') === imposterState.word;
        io.emit('imposterResult', { winner: correct ? 'IMPOSTER' : 'CIVILIANS', msg: correct ? `İmposter bildi! ("${guess}")` : `İmposter bilemedi! ("${guess}")`, imposterName: imposterState.imposterName, word: imposterState.word });
    });

    // Worms
    socket.on('startWormsGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'worms');
        if (gamePlayers.length < 2) return socket.emit('errorMsg', 'Worms için en az 2 oyuncu gerekir!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan savaş başlamaz!');
        if (wormsState.loopInterval) clearInterval(wormsState.loopInterval);

        const terrainHeights = generateWormsTerrain();
        wormsState.active = true; wormsState.winner = null; wormsState.terrainHeights = terrainHeights;
        wormsState.worms = {}; wormsState.turnOrder = []; wormsState.activeProjectile = null; wormsState.projectileFired = false;
        wormsState.wind = (Math.random() - 0.5) * 8; 

        gamePlayers.forEach((p, idx) => {
            const startX = 100 + (idx * (800 / (gamePlayers.length - 1 || 1)));
            const startY = terrainHeights[Math.floor(startX)] - 5;
            wormsState.worms[p.id] = { id: p.id, name: p.name, color: p.color, x: startX, y: startY, hp: 100, aimAngle: -Math.PI / 4, aimDirection: 1 };
            wormsState.turnOrder.push(p.id);
        });

        wormsState.turnId = wormsState.turnOrder[0];

        io.emit('wormsStarted', { terrainHeights: wormsState.terrainHeights, worms: wormsState.worms, turnId: wormsState.turnId, wind: Math.round(wormsState.wind) });

        wormsState.loopInterval = setInterval(() => {
            if (!wormsState.active) return;

            if (wormsState.activeProjectile) {
                let p = wormsState.activeProjectile;
                p.x += p.vx; p.y += p.vy;
                p.vy += 0.18; p.vx += wormsState.wind * 0.012; 

                let ix = Math.floor(p.x); let iy = Math.floor(p.y);
                if (ix >= 0 && ix < 1000 && iy >= wormsState.terrainHeights[ix]) {
                     explodeWormProjectile(ix, iy, p.ownerId);
                } else if (p.y > 650 || p.x < -100 || p.x > 1100) {
                     wormsState.activeProjectile = null;
                     setTimeout(nextWormsTurn, 1000);
                }
            }
            io.emit('wormsUpdate', { worms: wormsState.worms, turnId: wormsState.turnId, wind: Math.round(wormsState.wind), activeProjectile: wormsState.activeProjectile });
        }, 1000 / 30);
    });

    function explodeWormProjectile(ex, ey, ownerId) {
        io.emit('wormsExplosionSync', { x: ex, y: ey, radius: 45 });
        for (let x = Math.max(0, ex - 45); x < Math.min(1000, ex + 45); x++) {
            let dx = x - ex; let dy = Math.sqrt(45 * 45 - dx * dx);
            if (ey - dy < wormsState.terrainHeights[x]) { wormsState.terrainHeights[x] = ey + dy; }
        }
        for (let id in wormsState.worms) {
            let w = wormsState.worms[id];
            if (w.hp > 0) {
                let dist = Math.hypot(w.x - ex, w.y - ey);
                if (dist < 60) {
                    w.hp -= Math.floor(45 * (1 - dist / 60)); 
                    if(w.hp <= 0) { w.hp = 0; broadcastMonoLog(`💀 ${w.name} havaya uçtu!`); }
                }
                w.y = wormsState.terrainHeights[Math.floor(w.x)] - 5;
            }
        }
        wormsState.activeProjectile = null;
        setTimeout(nextWormsTurn, 1500); 
    }

    function nextWormsTurn() {
        let alive = Object.values(wormsState.worms).filter(w => w.hp > 0);
        if (alive.length <= 1 && Object.keys(wormsState.worms).length > 1) {
            wormsState.active = false; clearInterval(wormsState.loopInterval);
            io.emit('wormsFinished', { winner: alive[0] ? alive[0].name : 'BERABERE' }); return;
        }
        let currIdx = wormsState.turnOrder.indexOf(wormsState.turnId);
        do { currIdx = (currIdx + 1) % wormsState.turnOrder.length; wormsState.turnId = wormsState.turnOrder[currIdx]; } 
        while (wormsState.worms[wormsState.turnId].hp <= 0);
        wormsState.wind = (Math.random() - 0.5) * 8; 
        wormsState.projectileFired = false;
    }

    socket.on('wormsInput', (inputs) => {
        if (!wormsState.active || wormsState.turnId !== socket.id || wormsState.projectileFired) return;
        let w = wormsState.worms[socket.id];
        if (inputs.left) { w.x -= 2; w.aimDirection = -1; }
        if (inputs.right) { w.x += 2; w.aimDirection = 1; }
        if (inputs.up) { w.aimAngle -= 0.05; }
        if (inputs.down) { w.aimAngle += 0.05; }
        w.x = Math.max(10, Math.min(990, w.x));
        w.y = wormsState.terrainHeights[Math.floor(w.x)] - 5; 
    });

    socket.on('wormsFire', (data) => {
        if (!wormsState.active || wormsState.turnId !== socket.id || wormsState.projectileFired) return;
        let w = wormsState.worms[socket.id];
        wormsState.projectileFired = true;
        wormsState.activeProjectile = {
            x: w.x + Math.cos(w.aimAngle) * 15, y: w.y + Math.sin(w.aimAngle) * 15,
            vx: Math.cos(w.aimAngle) * (data.power * 0.45), vy: Math.sin(w.aimAngle) * (data.power * 0.45),
            ownerId: socket.id
        };
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete raceState.cars[socket.id]; delete stickState.runners[socket.id]; delete guessState.totalScores[socket.id]; delete guessState.guesses[socket.id];
        checkAndResetEmptyRooms();
        io.emit('updateLobby', { players });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda aktif ve çalışıyor!`); });
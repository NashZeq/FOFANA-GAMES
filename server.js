const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Modüler veri aktarımları
const iskembedenData = require('./data/iskembedenData');
const { monopolyBoard, sansKartlari, kamuFonuKartlari } = require('./data/monopolyData');
const rawTabuKartlari = require('./data/tabuData');
const rawImposterKelimeler = require('./data/imposterData');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

let players = [];
let currentGame = null;
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

function broadcastMonoLog(msg) {
    monoState.log.unshift(msg);
    io.emit('monoGlobalAlert', msg);
}

// İŞKEMBEDEN SALLAMA STATE
const usedQuestionMemory = { celebrity: new Set(), market: new Set(), car: new Set() };
let guessState = {
    active: false, mode: 'celebrity', currentQuestionIndex: 0, questions: [],
    timer: null, timeLeft: 15, guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: 5
};

// MONOPOLY STATE
let monoState = {
    active: false, board: JSON.parse(JSON.stringify(monopolyBoard)),
    players: [], turnIndex: 0, dice: [1, 1], doubleRollCount: 0,
    waitingForDecision: false, waitingForDoblo: false, activeTrade: null, log: []
};

function getRentDetails(tile, diceSum) {
    if (tile.type === 'property') {
        const groupTiles = monoState.board.filter(t => t.type === 'property' && t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => t.owner === tile.owner);
        const isMonopoly = groupTiles.length === ownedInGroup.length;
        const finalRent = isMonopoly ? (tile.baseRent * 2) : tile.baseRent;
        return { rent: finalRent, isMonopoly, note: isMonopoly ? '🔥 TEKEL ZAMMI (x2 Kat Kira)' : 'Standart Kira' };
    }
    if (tile.type === 'pitch') {
        const ownedPitches = monoState.board.filter(t => t.type === 'pitch' && t.owner === tile.owner).length;
        let r = 25;
        if (ownedPitches === 2) r = 50;
        if (ownedPitches === 3) r = 100;
        if (ownedPitches === 4) r = 200;
        return { rent: r, isMonopoly: ownedPitches === 4, note: `⚽ ${ownedPitches} Halısaha Sahibi` };
    }
    if (tile.type === 'utility') {
        const ownedUtils = monoState.board.filter(t => t.type === 'utility' && t.owner === tile.owner).length;
        const multiplier = ownedUtils === 2 ? 10 : 4;
        return { rent: diceSum * multiplier, isMonopoly: ownedUtils === 2, note: `💡 ${ownedUtils} Kamu Binası (Zar x ${multiplier})` };
    }
    return { rent: 0, isMonopoly: false, note: '' };
}

function checkHalısahaWin(ownerId, ownerName) {
    const pitchCount = monoState.board.filter(t => t.type === 'pitch' && t.owner === ownerId).length;
    if (pitchCount === 4) {
        monoState.active = false;
        broadcastMonoLog(`🏆🏆 GOLDEN GOAL! ${ownerName} 4 HALISAHAIN HEPSİNİ ALARAK OYUNU KAZANDI! 🏆🏆`);
        io.emit('monopolyStateUpdated', monoState);
        return true;
    }
    return false;
}

// 1200x750 ARABA YARIŞI STATE
let raceState = {
    active: false, cars: {}, items: [],
    itemBoxes: [
        { id: 1, x: 380, y: 640, active: true, respawnTimer: 0 },
        { id: 2, x: 1060, y: 380, active: true, respawnTimer: 0 },
        { id: 3, x: 620, y: 160, active: true, respawnTimer: 0 },
        { id: 4, x: 160, y: 340, active: true, respawnTimer: 0 },
        { id: 5, x: 580, y: 320, active: true, respawnTimer: 0 }
    ],
    loopInterval: null, totalLaps: 3, winner: null
};

const trackWaypoints = [
    { x: 550, y: 640 }, { x: 920, y: 640 }, { x: 1080, y: 520 }, { x: 1080, y: 260 },
    { x: 920, y: 140 }, { x: 680, y: 140 }, { x: 580, y: 320 }, { x: 420, y: 320 },
    { x: 320, y: 140 }, { x: 140, y: 240 }, { x: 130, y: 520 }, { x: 320, y: 640 },
    { x: 550, y: 640 }
];

function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function isCarOnTrack(x, y) {
    let minDist = 9999;
    for (let i = 0; i < trackWaypoints.length - 1; i++) {
        const d = distToSegment({ x, y }, trackWaypoints[i], trackWaypoints[i + 1]);
        if (d < minDist) minDist = d;
    }
    return minDist <= 65;
}

// TABU & İMPOSTER STATE
let currentTabuDeck = [];
let tabuState = {
    scores: { red: 0, blue: 0 }, currentCard: null, describerId: null,
    currentTeam: 'red', passCount: 3, timer: null, timeLeft: 60,
    roundActive: false, isIntermission: false, intermissionTimer: null,
    maxRounds: 5, currentRound: 1, teamTurnCount: 0
};

let currentImposterDeck = [];
let imposterState = { word: '', imposterId: '', imposterName: '', votes: {}, timer: null };

io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10)');
        players.push({
            id: socket.id, name, team: 'red', ready: false,
            color: playerColors[players.length % playerColors.length]
        });
        io.emit('updateLobby', { players, currentGame });
    });

    socket.on('selectGame', (gameType) => {
        currentGame = gameType;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', gameType);
        io.emit('updateLobbyStatuses', { players, gameType });
        if (gameType === 'tabu') io.emit('updateTabuLobby', { players, tabuState });
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.ready = !p.ready;
            io.emit('updateLobbyStatuses', { players, gameType: currentGame });
            if (currentGame === 'tabu') io.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('backToLobby', () => {
        currentGame = null;
        if (guessState.timer) clearInterval(guessState.timer);
        if (tabuState.timer) clearInterval(tabuState.timer);
        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);
        if (imposterState.timer) clearInterval(imposterState.timer);
        guessState.active = false;
        raceState.active = false;
        tabuState.roundActive = false;
        tabuState.isIntermission = false;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', 'lobby');
        io.emit('updateLobby', { players, currentGame });
    });

    // 1. İŞKEMBEDEN SALLAMA
    socket.on('startGuessGame', (data) => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');

        let subMode = 'celebrity';
        let requestedRounds = 5;
        if (typeof data === 'object' && data !== null) {
            subMode = data.mode || 'celebrity';
            requestedRounds = parseInt(data.rounds) || 5;
        }

        const fullPool = iskembedenData[subMode] || iskembedenData.celebrity;
        let availablePool = fullPool.filter(q => !usedQuestionMemory[subMode].has(q.title));

        if (availablePool.length < requestedRounds) {
            usedQuestionMemory[subMode].clear();
            availablePool = [...fullPool];
        }

        const chosenQuestions = shuffleArray(availablePool).slice(0, requestedRounds);
        chosenQuestions.forEach(q => usedQuestionMemory[subMode].add(q.title));

        guessState = {
            active: true, mode: subMode, currentQuestionIndex: 0,
            questions: chosenQuestions, timer: null, timeLeft: 15,
            guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: requestedRounds
        };

        players.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {};
        guessState.readyForNextRound = {};
        guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];

        io.emit('guessRoundStarted', {
            mode: guessState.mode,
            questionIndex: guessState.currentQuestionIndex + 1,
            maxQuestions: guessState.maxQuestions,
            question: { title: q.title, hint: q.hint, img: q.img },
            timeLeft: guessState.timeLeft
        });

        if (guessState.timer) clearInterval(guessState.timer);
        guessState.timer = setInterval(() => {
            guessState.timeLeft--;
            io.emit('guessTimerTick', guessState.timeLeft);
            if (guessState.timeLeft <= 0) {
                clearInterval(guessState.timer);
                endGuessRound();
            }
        }, 1000);
    }

    socket.on('submitGuess', (val) => {
        if (!guessState.active || guessState.guesses[socket.id]) return;
        const num = parseFloat(val);
        if (isNaN(num)) return;
        guessState.guesses[socket.id] = { value: num, timeLeft: guessState.timeLeft, scoreGained: 0 };
        socket.emit('guessLockedNotice');
        if (Object.keys(guessState.guesses).length === players.length) {
            clearInterval(guessState.timer);
            endGuessRound();
        }
    });

    function endGuessRound() {
        const q = guessState.questions[guessState.currentQuestionIndex];
        const actual = q.actual;
        const roundResults = [];

        players.forEach(p => {
            const userGuess = guessState.guesses[p.id];
            let score = 0;
            if (userGuess) {
                const diff = Math.abs(userGuess.value - actual);
                let accuracyScore = 0;
                if (guessState.mode === 'celebrity') {
                    accuracyScore = Math.max(0, 1000 - (diff * 120));
                } else {
                    const ratio = diff / actual;
                    accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio));
                }
                const speedMult = 0.5 + (0.5 * (userGuess.timeLeft / 15));
                score = Math.round(accuracyScore * speedMult);
                userGuess.scoreGained = score;
                guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }
            roundResults.push({
                id: p.id, name: p.name,
                guess: userGuess ? userGuess.value : 'Tahmin Yok',
                scoreGained: score, totalScore: guessState.totalScores[p.id] || 0
            });
        });

        roundResults.sort((a, b) => b.totalScore - a.totalScore);
        guessState.readyForNextRound = {};

        io.emit('guessRoundEnded', {
            actual, unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL',
            results: roundResults,
            isLastQuestion: (guessState.currentQuestionIndex + 1 >= guessState.maxQuestions),
            readyStatus: players.map(p => ({ id: p.id, name: p.name, ready: false }))
        });
    }

    socket.on('guessNextRoundReadyToggle', () => {
        if (!guessState.active) return;
        guessState.readyForNextRound[socket.id] = true;
        const readyList = players.map(p => ({ id: p.id, name: p.name, ready: !!guessState.readyForNextRound[p.id] }));
        io.emit('guessNextRoundReadyUpdate', readyList);

        if (players.every(p => guessState.readyForNextRound[p.id])) {
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) {
                startGuessRound();
            } else {
                guessState.active = false;
                const finalLeaderboard = players.map(p => ({
                    name: p.name, totalScore: guessState.totalScores[p.id] || 0
                })).sort((a, b) => b.totalScore - a.totalScore);
                io.emit('guessGameOver', { finalLeaderboard });
            }
        }
    });

    // 2. YARIŞ MOTORU
    socket.on('startRaceGame', () => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);

        raceState.active = true;
        raceState.winner = null;
        raceState.cars = {};
        raceState.items = [];

        players.forEach((p, idx) => {
            raceState.cars[p.id] = {
                id: p.id, name: p.name, color: p.color,
                x: 480 - (idx * 35), y: 640, angle: 0,
                speed: 0, vx: 0, vy: 0, lap: 1,
                checkpoints: [false, false, false],
                heldItem: null, isSpinning: false, spinAngleSpeed: 0,
                finished: false,
                inputs: { up: false, down: false, left: false, right: false }
            };
        });

        io.emit('raceStarted', { totalLaps: raceState.totalLaps });

        raceState.loopInterval = setInterval(() => {
            if (!raceState.active) return;

            raceState.itemBoxes.forEach(box => {
                if (!box.active) {
                    box.respawnTimer--;
                    if (box.respawnTimer <= 0) box.active = true;
                }
            });

            for (let i = raceState.items.length - 1; i >= 0; i--) {
                const item = raceState.items[i];
                if (item.type === 'rocket') {
                    item.x += Math.cos(item.angle) * 14;
                    item.y += Math.sin(item.angle) * 14;
                    item.life--;
                    for (let id in raceState.cars) {
                        const car = raceState.cars[id];
                        if (id !== item.ownerId && !car.finished) {
                            if (Math.hypot(car.x - item.x, car.y - item.y) < 28) {
                                car.isSpinning = true;
                                car.spinAngleSpeed = 0.35;
                                car.vx = Math.cos(item.angle) * 4;
                                car.vy = Math.sin(item.angle) * 4;
                                car.speed = Math.max(1.5, car.speed * 0.6);
                                item.life = 0;
                                io.emit('monoGlobalAlert', `💥 ${item.ownerName}'in Roketi ${car.name}'i savurdu!`);
                                break;
                            }
                        }
                    }
                    if (item.life <= 0 || item.x < 0 || item.x > 1200 || item.y < 0 || item.y > 750) {
                        raceState.items.splice(i, 1);
                    }
                }
            }

            for (let id in raceState.cars) {
                const car = raceState.cars[id];
                if (car.finished) continue;

                const onTrack = isCarOnTrack(car.x, car.y);
                const maxSpeed = onTrack ? 7.2 : 2.6;

                if (car.isSpinning) {
                    car.angle += car.spinAngleSpeed;
                    car.spinAngleSpeed *= 0.94;
                    car.speed *= 0.94;
                    car.x += car.vx;
                    car.y += car.vy;
                    car.vx *= 0.94;
                    car.vy *= 0.94;
                    if (Math.abs(car.spinAngleSpeed) < 0.03) {
                        car.isSpinning = false;
                        car.spinAngleSpeed = 0;
                    }
                } else {
                    if (car.inputs.up) car.speed += onTrack ? 0.28 : 0.09;
                    if (car.inputs.down) car.speed -= 0.2;
                    car.speed *= onTrack ? 0.96 : 0.88;
                    if (car.speed > maxSpeed) car.speed = maxSpeed;
                    if (car.speed < -2.0) car.speed = -2.0;

                    if (Math.abs(car.speed) > 0.1) {
                        const dir = car.speed > 0 ? 1 : -1;
                        if (car.inputs.left) car.angle -= 0.065 * dir;
                        if (car.inputs.right) car.angle += 0.065 * dir;
                    }
                    car.vx = Math.cos(car.angle) * car.speed;
                    car.vy = Math.sin(car.angle) * car.speed;
                    car.x += car.vx;
                    car.y += car.vy;
                }

                car.x = Math.max(20, Math.min(1180, car.x));
                car.y = Math.max(20, Math.min(730, car.y));

                raceState.itemBoxes.forEach(box => {
                    if (box.active && Math.hypot(car.x - box.x, car.y - box.y) < 30) {
                        box.active = false;
                        box.respawnTimer = 150;
                        if (!car.heldItem) car.heldItem = Math.random() < 0.5 ? 'banana' : 'rocket';
                    }
                });

                for (let i = raceState.items.length - 1; i >= 0; i--) {
                    const item = raceState.items[i];
                    if (item.type === 'banana') {
                        if (Math.hypot(car.x - item.x, car.y - item.y) < 22) {
                            car.isSpinning = true;
                            car.spinAngleSpeed = 0.38;
                            car.vx = Math.cos(car.angle) * (car.speed * 0.8);
                            car.vy = Math.sin(car.angle) * (car.speed * 0.8);
                            car.speed *= 0.7;
                            raceState.items.splice(i, 1);
                            io.emit('monoGlobalAlert', `🍌 ${car.name} muza bastı ve drift attı!`);
                            break;
                        }
                    }
                }

                if (car.x > 950 && car.y < 350) car.checkpoints[0] = true;
                if (car.x < 650 && car.x > 500 && car.y < 380) car.checkpoints[1] = true;
                if (car.x < 250 && car.y > 350) car.checkpoints[2] = true;

                if (car.checkpoints[0] && car.checkpoints[1] && car.checkpoints[2]) {
                    if (car.x > 570 && car.x < 605 && car.y > 580) {
                        car.checkpoints = [false, false, false];
                        car.lap++;
                        if (car.lap > raceState.totalLaps) {
                            car.finished = true;
                            if (!raceState.winner) {
                                raceState.winner = car.name;
                                raceState.active = false;
                                clearInterval(raceState.loopInterval);
                                io.emit('raceFinished', { winner: car.name });
                                break;
                            }
                        }
                    }
                }
            }

            io.emit('raceUpdate', { cars: raceState.cars, items: raceState.items, boxes: raceState.itemBoxes });
        }, 1000 / 30);
    });

    socket.on('raceInput', (inputs) => {
        if (raceState.active && raceState.cars[socket.id]) raceState.cars[socket.id].inputs = inputs;
    });

    socket.on('raceUseItem', () => {
        if (!raceState.active || !raceState.cars[socket.id]) return;
        const car = raceState.cars[socket.id];
        if (!car.heldItem || car.isSpinning) return;

        if (car.heldItem === 'banana') {
            raceState.items.push({ type: 'banana', x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26 });
        } else if (car.heldItem === 'rocket') {
            raceState.items.push({ type: 'rocket', ownerId: car.id, ownerName: car.name, x: car.x + Math.cos(car.angle) * 28, y: car.y + Math.sin(car.angle) * 28, angle: car.angle, life: 100 });
        }
        car.heldItem = null;
    });

    // 3. MONOPOLY MOTORU
    socket.on('startMonopolyGame', () => {
        if (players.length < 2) return socket.emit('errorMsg', 'En az 2 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');

        monoState = {
            active: true, board: JSON.parse(JSON.stringify(monopolyBoard)),
            players: players.map((p, idx) => ({
                id: p.id, name: p.name, color: playerColors[idx % playerColors.length],
                money: 1500, position: 0, inJail: false, jailTurns: 0, jailCardCount: 0, bankrupt: false
            })),
            turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, log: []
        };
        broadcastMonoLog('KTÜ Monopoly başladı! İlk oyuncu zar atabilir.');
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyRollDice', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (monoState.waitingForDecision || monoState.waitingForDoblo) return;

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = d1 === d2;
        const total = d1 + d2;
        monoState.dice = [d1, d2];

        if (cp.inJail) {
            cp.jailTurns++;
            if (cp.jailTurns < 3) {
                broadcastMonoLog(`🚨 ${cp.name} Blok derste çift atmayı denedi [${cp.jailTurns}. Hak]: ${d1}-${d2}`);
                if (isDouble) {
                    cp.inJail = false; cp.jailTurns = 0;
                    broadcastMonoLog(`🎉 ÇİFT ZAR! ${cp.name} dersten serbest kaldı!`);
                    advanceMonoPlayer(cp, total, isDouble);
                    return;
                } else {
                    finishMonoTurn();
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            } else {
                cp.inJail = false; cp.jailTurns = 0;
                broadcastMonoLog(`⚖️ 3. Tur bitti, ${cp.name} serbest kalarak [${total}] ilerliyor.`);
                advanceMonoPlayer(cp, total, isDouble);
                return;
            }
        }

        if (isDouble) {
            monoState.doubleRollCount++;
            broadcastMonoLog(`🎲 ${cp.name} ÇİFT ZAR ATTI! (${d1}-${d2})`);
            if (monoState.doubleRollCount === 3) {
                cp.position = 10; cp.inJail = true; cp.jailTurns = 0;
                broadcastMonoLog(`🚨 3 kez çift atan ${cp.name} BLOK DERSE GÖNDERİLDİ!`);
                finishMonoTurn();
                io.emit('monopolyStateUpdated', monoState);
                return;
            }
        } else {
            monoState.doubleRollCount = 0;
        }

        advanceMonoPlayer(cp, total, isDouble);
    });

    function advanceMonoPlayer(cp, total, isDouble) {
        const oldPos = cp.position;
        let newPos = (oldPos + total) % 40;
        if (newPos < oldPos) {
            cp.money += 200;
            broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti ve 200₺ yolluk aldı.`);
        }
        cp.position = newPos;
        handleMonoTile(cp, newPos, isDouble, total);
    }

    function handleMonoTile(cp, pos, isDouble, diceSum) {
        const tile = monoState.board[pos];
        if (tile.type === 'doblo') {
            broadcastMonoLog(`🚐 ${cp.name} DOBLO ZAMANI DOSTUM karesine bastı! İstediğin yere sür dostum!`);
            monoState.waitingForDoblo = true;
            io.to(cp.id).emit('monopolyDobloPrompt', { board: monoState.board.map(t => ({ id: t.id, name: t.name })) });
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'go_to_jail') {
            cp.position = 10; cp.inJail = true; cp.jailTurns = 0;
            broadcastMonoLog(`🚨 ${cp.name} BLOK DERSE GİTTİ!`);
            finishMonoTurn();
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'tax') {
            cp.money -= tile.amount;
            broadcastMonoLog(`💸 ${cp.name} vergi ödedi: -${tile.amount}₺`);
            if (cp.money < 0) cp.bankrupt = true;
            postMonoAction(isDouble);
            return;
        } else if (tile.type === 'chance') {
            const card = sansKartlari[Math.floor(Math.random() * sansKartlari.length)];
            broadcastMonoLog(`🎲 [ŞANS - ${cp.name}]: "${card.text}"`);
            executeMonoCard(cp, card.action, isDouble);
            return;
        } else if (tile.type === 'chest') {
            const card = kamuFonuKartlari[Math.floor(Math.random() * kamuFonuKartlari.length)];
            broadcastMonoLog(`📦 [KAMU FONU - ${cp.name}]: "${card.text}"`);
            executeMonoCard(cp, card.action, isDouble);
            return;
        } else if (tile.owner && tile.owner !== cp.id) {
            const owner = monoState.players.find(p => p.id === tile.owner);
            if (owner && !owner.bankrupt) {
                const rentInfo = getRentDetails(tile, diceSum);
                cp.money -= rentInfo.rent;
                owner.money += rentInfo.rent;
                broadcastMonoLog(`⚠️ ${cp.name}, ${owner.name}'in ${tile.name} mülküne bastı! ${rentInfo.note} ➜ Ödenen Kira: ${rentInfo.rent}₺`);
                if (cp.money < 0) cp.bankrupt = true;

                const buyoutPrice = Math.floor(tile.price * 1.5);
                if (cp.money >= buyoutPrice && !cp.bankrupt) {
                    monoState.waitingForDecision = true;
                    io.to(cp.id).emit('monopolyBuyoutPrompt', { tile, buyoutPrice, ownerName: owner.name });
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            }
            postMonoAction(isDouble);
            return;
        }

        const canBuy = (tile.type === 'property' || tile.type === 'pitch' || tile.type === 'utility') && !tile.owner;
        if (canBuy && cp.money >= tile.price) {
            monoState.waitingForDecision = true;
            io.to(cp.id).emit('monopolyBuyPrompt', { tile });
        } else {
            postMonoAction(isDouble);
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    function executeMonoCard(cp, action, isDouble) {
        const others = monoState.players.filter(p => p.id !== cp.id && !p.bankrupt);
        if (action === 'go_to_go') { cp.position = 0; cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'go_to_thanos') { cp.position = 39; handleMonoTile(cp, 39, isDouble, 7); }
        else if (action === 'nearest_pitch') {
            const pitches = [5, 15, 25, 35];
            let nextPitch = pitches.find(p => p > cp.position) || 5;
            if (nextPitch === 5) cp.money += 200;
            cp.position = nextPitch;
            handleMonoTile(cp, nextPitch, isDouble, 7);
        }
        else if (action === 'forward_3') { cp.position = (cp.position + 3) % 40; handleMonoTile(cp, cp.position, isDouble, 7); }
        else if (action === 'go_to_jail') { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; finishMonoTurn(); }
        else if (action === 'get_jail_card') { cp.jailCardCount = (cp.jailCardCount || 0) + 1; broadcastMonoLog(`🎟️ ${cp.name} Konferans Kartı kazandı!`); postMonoAction(isDouble); }
        else if (action === 'pay_each_50') { others.forEach(p => { cp.money -= 50; p.money += 50; }); if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'collect_each_10') { others.forEach(p => { p.money -= 10; cp.money += 10; }); postMonoAction(isDouble); }
        else if (action === 'gain_10') { cp.money += 10; postMonoAction(isDouble); }
        else if (action === 'gain_50') { cp.money += 50; postMonoAction(isDouble); }
        else if (action === 'gain_100') { cp.money += 100; postMonoAction(isDouble); }
        else if (action === 'gain_150') { cp.money += 150; postMonoAction(isDouble); }
        else if (action === 'gain_200') { cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'pay_15') { cp.money -= 15; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'pay_20') { cp.money -= 20; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'pay_50') { cp.money -= 50; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'pay_100') { cp.money -= 100; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'pay_150') { cp.money -= 150; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else if (action === 'pay_175') { cp.money -= 175; if (cp.money < 0) cp.bankrupt = true; postMonoAction(isDouble); }
        else { postMonoAction(isDouble); }
        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyDobloDrive', (targetTileId) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !monoState.waitingForDoblo) return;
        const targetId = parseInt(targetTileId);
        monoState.waitingForDoblo = false;
        if (targetId < cp.position) { cp.money += 200; broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti (+200₺)`); }
        cp.position = targetId;
        broadcastMonoLog(`🚐💨 ${cp.name} Doblo ile [${monoState.board[targetId].name}] karesine yanaştı!`);
        handleMonoTile(cp, targetId, false, 7);
    });

    socket.on('monopolyBuyDecision', (buy) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return;
        monoState.waitingForDecision = false;
        const tile = monoState.board[cp.position];
        if (buy && tile && !tile.owner && cp.money >= tile.price) {
            cp.money -= tile.price;
            tile.owner = cp.id;
            tile.ownerName = cp.name;
            broadcastMonoLog(`🛒 ${cp.name}, ${tile.name} tapusunu ${tile.price}₺ bedelle satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }
        postMonoAction(false);
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyBuyoutDecision', (buyout) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return;
        monoState.waitingForDecision = false;
        const tile = monoState.board[cp.position];
        const buyoutPrice = Math.floor(tile.price * 1.5);
        const prevOwner = monoState.players.find(p => p.id === tile.owner);
        if (buyout && prevOwner && cp.money >= buyoutPrice) {
            cp.money -= buyoutPrice;
            prevOwner.money += buyoutPrice;
            tile.owner = cp.id;
            tile.ownerName = cp.name;
            broadcastMonoLog(`💥 EL DEĞİŞTİRDİ! ${cp.name}, ${prevOwner.name}'in ${tile.name} mülkünü 1.5 katı bedelle (${buyoutPrice}₺) zorla satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }
        postMonoAction(false);
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('initiateTradeOffer', (data) => {
        const buyer = monoState.players.find(p => p.id === socket.id);
        const tile = monoState.board.find(t => t.id === data.tileId);
        if (!buyer || !tile || !tile.owner || tile.owner === socket.id) return;
        const amount = parseInt(data.offerAmount);
        if (isNaN(amount) || amount <= 0 || buyer.money < amount) return socket.emit('errorMsg', 'Geçersiz teklif tutarı!');
        const seller = monoState.players.find(p => p.id === tile.owner);
        if (!seller) return;
        monoState.activeTrade = { buyerId: buyer.id, buyerName: buyer.name, sellerId: seller.id, tileId: tile.id, tileName: tile.name, offerAmount: amount };
        io.to(seller.id).emit('incomingTradeOffer', monoState.activeTrade);
        socket.emit('tradePendingNotice', `Teklif (${amount}₺) ${seller.name} oyuncusuna iletildi.`);
    });

    socket.on('respondTradeOffer', (accepted) => {
        if (!monoState.activeTrade || socket.id !== monoState.activeTrade.sellerId) return;
        const trade = monoState.activeTrade;
        const buyer = monoState.players.find(p => p.id === trade.buyerId);
        const seller = monoState.players.find(p => p.id === trade.sellerId);
        const tile = monoState.board.find(t => t.id === trade.tileId);

        if (accepted && buyer.money >= trade.offerAmount && tile.owner === seller.id) {
            buyer.money -= trade.offerAmount;
            seller.money += trade.offerAmount;
            tile.owner = buyer.id;
            tile.ownerName = buyer.name;
            broadcastMonoLog(`🤝 ANLAŞMA! ${buyer.name}, ${seller.name}'den ${tile.name} tapusunu ${trade.offerAmount}₺ bedelle satın aldı!`);
            io.emit('monopolyStateUpdated', monoState);
            checkHalısahaWin(buyer.id, buyer.name);
        } else {
            broadcastMonoLog(`❌ ${seller.name}, ${buyer.name}'in ${tile.name} için yaptığı ${trade.offerAmount}₺ teklifini reddetti.`);
            io.to(buyer.id).emit('errorMsg', `${seller.name} teklifini kabul etmedi.`);
            io.emit('monopolyStateUpdated', monoState);
        }
        monoState.activeTrade = null;
    });

    socket.on('monopolyPayJailBail', () => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !cp.inJail || cp.money < 100) return;
        cp.money -= 100; cp.inJail = false; cp.jailTurns = 0;
        broadcastMonoLog(`🔓 ${cp.name} 100₺ kefalet ödedi ve dersten kaçtı!`);
        advanceMonoPlayer(cp, 4, false);
    });

    socket.on('monopolyUseJailCard', () => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !cp.inJail || cp.jailCardCount <= 0) return;
        cp.jailCardCount--; cp.inJail = false; cp.jailTurns = 0;
        broadcastMonoLog(`🎟️ ${cp.name} Konferans Kartını kullanarak blok dersten kaçtı!`);
        advanceMonoPlayer(cp, 5, false);
    });

    function postMonoAction(isDouble) {
        if (isDouble && !monoState.players[monoState.turnIndex].bankrupt && !monoState.players[monoState.turnIndex].inJail) {
            broadcastMonoLog(`🎲 Çift attığın için tekrar zar atabilirsin!`);
        } else {
            finishMonoTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    function finishMonoTurn() {
        monoState.doubleRollCount = 0;
        monoState.waitingForDecision = false;
        monoState.waitingForDoblo = false;
        let attempts = 0;
        do {
            monoState.turnIndex = (monoState.turnIndex + 1) % monoState.players.length;
            attempts++;
        } while (monoState.players[monoState.turnIndex].bankrupt && attempts < monoState.players.length);

        const activePlayers = monoState.players.filter(p => !p.bankrupt);
        if (activePlayers.length <= 1) {
            monoState.active = false;
            broadcastMonoLog(`👑 KAZANAN: ${activePlayers[0].name}!`);
        }
    }

    // 4. TABU MOTORU
    socket.on('switchTabuTeam', (newTeam) => {
        const p = players.find(x => x.id === socket.id);
        if (p && (newTeam === 'red' || newTeam === 'blue')) {
            p.team = newTeam;
            p.ready = false;
            io.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('startTabuGame', (selectedMaxRounds) => {
        const redTeam = players.filter(p => p.team === 'red');
        const blueTeam = players.filter(p => p.team === 'blue');
        if (redTeam.length === 0 || blueTeam.length === 0) return socket.emit('errorMsg', 'Her takımda en az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');

        currentTabuDeck = shuffleArray(rawTabuKartlari);
        tabuState.scores = { red: 0, blue: 0 };
        tabuState.currentTeam = 'red';
        tabuState.maxRounds = parseInt(selectedMaxRounds) || 5;
        tabuState.currentRound = 1;
        tabuState.teamTurnCount = 0;
        triggerTabuIntermission();
    });

    function triggerTabuIntermission() {
        const teamPlayers = players.filter(p => p.team === tabuState.currentTeam);
        const describer = teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
        tabuState.describerId = describer.id;
        tabuState.roundActive = false;
        tabuState.isIntermission = true;
        let prepTime = 10;

        io.emit('tabuIntermissionStart', {
            team: tabuState.currentTeam, describerName: describer.name, describerId: describer.id,
            prepTime, currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds, scores: tabuState.scores
        });

        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        tabuState.intermissionTimer = setInterval(() => {
            prepTime--;
            io.emit('tabuIntermissionTick', prepTime);
            if (prepTime <= 0) {
                clearInterval(tabuState.intermissionTimer);
                tabuState.isIntermission = false;
                startTabuActualRound(describer);
            }
        }, 1000);
    }

    function startTabuActualRound(describer) {
        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        const card = currentTabuDeck.pop();
        tabuState.currentCard = card;
        tabuState.timeLeft = 60;
        tabuState.passCount = 3;
        tabuState.roundActive = true;

        players.forEach(p => {
            const isDescriber = p.id === describer.id;
            const isPlayingTeam = p.team === tabuState.currentTeam;
            io.to(p.id).emit('tabuTurnStarted', {
                describerId: describer.id, describerName: describer.name, currentTeam: tabuState.currentTeam,
                card: isDescriber ? card : null, scores: tabuState.scores, passCount: tabuState.passCount,
                currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds,
                role: isDescriber ? 'describer' : (isPlayingTeam ? 'guesser' : 'opponent')
            });
        });

        if (tabuState.timer) clearInterval(tabuState.timer);
        tabuState.timer = setInterval(() => {
            tabuState.timeLeft--;
            io.emit('tabuTimer', tabuState.timeLeft);
            if (tabuState.timeLeft <= 0) {
                clearInterval(tabuState.timer);
                endTabuTurn();
            }
        }, 1000);
    }

    function endTabuTurn() {
        tabuState.roundActive = false;
        tabuState.teamTurnCount++;
        if (tabuState.teamTurnCount % 2 === 0) tabuState.currentRound++;

        if (tabuState.currentRound > tabuState.maxRounds) {
            let winnerTeam = 'BERABERE';
            if (tabuState.scores.red > tabuState.scores.blue) winnerTeam = 'KIRMIZI';
            else if (tabuState.scores.blue > tabuState.scores.red) winnerTeam = 'MAVİ';
            io.emit('tabuMatchOver', { scores: tabuState.scores, winner: winnerTeam, maxRounds: tabuState.maxRounds });
        } else {
            tabuState.currentTeam = tabuState.currentTeam === 'red' ? 'blue' : 'red';
            io.emit('tabuTurnEnded', {
                scores: tabuState.scores, nextTeam: tabuState.currentTeam,
                currentRound: tabuState.currentRound, maxRounds: tabuState.maxRounds
            });
        }
    }

    socket.on('tabuNextTurn', () => {
        if (!tabuState.roundActive && !tabuState.isIntermission) triggerTabuIntermission();
    });

    socket.on('tabuAction', (action) => {
        if (!tabuState.roundActive || socket.id !== tabuState.describerId) return;
        if (action === 'correct') tabuState.scores[tabuState.currentTeam] += 1;
        else if (action === 'taboo') tabuState.scores[tabuState.currentTeam] -= 1;
        else if (action === 'pass') {
            if (tabuState.passCount <= 0) return socket.emit('errorMsg', 'Pas kalmadı!');
            tabuState.passCount -= 1;
        }

        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        tabuState.currentCard = currentTabuDeck.pop();
        io.emit('tabuScoreUpdated', { scores: tabuState.scores, passCount: tabuState.passCount });
        io.to(tabuState.describerId).emit('tabuNewCardForDescriber', tabuState.currentCard);
    });

    // 5. İMPOSTER MOTORU
    socket.on('startImposter', () => {
        if (players.length < 3) return socket.emit('errorMsg', 'En az 3 oyuncu gerekir!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        if (imposterState.timer) clearInterval(imposterState.timer);

        currentImposterDeck = shuffleArray(rawImposterKelimeler);
        const secilen = currentImposterDeck[Math.floor(Math.random() * currentImposterDeck.length)];
        const imposter = players[Math.floor(Math.random() * players.length)];

        imposterState = {
            word: secilen.kelime.trim().toUpperCase('tr-TR'),
            imposterId: imposter.id, imposterName: imposter.name, votes: {}, timer: null
        };

        players.forEach(p => {
            if (p.id === imposter.id) io.to(p.id).emit('imposterRole', { isImposter: true, info: `Sen IMPOSTER'sın! İpucun: "${secilen.ipucu}"` });
            else io.to(p.id).emit('imposterRole', { isImposter: false, info: `Gizli Kelime: "${secilen.kelime}"` });
        });

        let timeLeft = 30;
        io.emit('imposterTimer', timeLeft);
        imposterState.timer = setInterval(() => {
            timeLeft--;
            io.emit('imposterTimer', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(imposterState.timer);
                io.emit('imposterStartVoting', players);
            }
        }, 1000);
    });

    socket.on('imposterVote', (votedId) => {
        imposterState.votes[socket.id] = votedId;
        if (Object.keys(imposterState.votes).length === players.length) {
            const counts = {};
            Object.values(imposterState.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            let mostVoted = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            const votedP = players.find(p => p.id === mostVoted);

            if (mostVoted === imposterState.imposterId) {
                io.to(imposterState.imposterId).emit('imposterLastChance');
                players.forEach(p => {
                    if (p.id !== imposterState.imposterId) io.to(p.id).emit('imposterWaitGuess', votedP ? votedP.name : '');
                });
            } else {
                io.emit('imposterResult', {
                    winner: 'IMPOSTER',
                    msg: `Yanlış kişi (${votedP ? votedP.name : 'Kimse'}) seçildi!`,
                    imposterName: imposterState.imposterName, word: imposterState.word
                });
            }
        }
    });

    socket.on('imposterGuess', (guess) => {
        const correct = guess.trim().toUpperCase('tr-TR') === imposterState.word;
        io.emit('imposterResult', {
            winner: correct ? 'IMPOSTER' : 'CIVILIANS',
            msg: correct ? `İmposter bildi! ("${guess}")` : `İmposter bilemedi! ("${guess}")`,
            imposterName: imposterState.imposterName, word: imposterState.word
        });
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete raceState.cars[socket.id];
        delete guessState.totalScores[socket.id];
        delete guessState.guesses[socket.id];
        io.emit('updateLobby', { players, currentGame });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});
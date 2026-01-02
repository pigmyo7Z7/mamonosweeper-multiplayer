import { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, set, onValue, get, update, runTransaction } from 'firebase/database';
import './App.css';

// モード設定（本家準拠）
const GAME_MODES = {
  easy: { 
    name: 'EASY', 
    icon: '🌱',
    description: '初心者はこちら',
    rows: 16,
    cols: 16,
    maxLevel: 5, 
    hp: 10,
    monsters: { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 },
    expTable: [0, 7, 20, 50, 82, 999]
  },
  normal: { 
    name: 'NORMAL', 
    icon: '⚔️',
    description: '慣れてきたらどうぞ',
    rows: 16,
    cols: 30,
    maxLevel: 5, 
    hp: 10,
    monsters: { 1: 33, 2: 27, 3: 20, 4: 13, 5: 6 },
    expTable: [0, 10, 50, 167, 271, 999]
  },
  extreme: { 
    name: 'EXTREME', 
    icon: '🔥',
    description: '激ムズ',
    rows: 16,
    cols: 30,
    maxLevel: 5, 
    hp: 10,
    monsters: { 1: 25, 2: 25, 3: 25, 4: 25, 5: 25 },
    expTable: [0, 10, 50, 167, 271, 999]
  },
  huge: { 
    name: 'HUGE', 
    icon: '🐉',
    description: 'MAP・マモノ増量版',
    rows: 25,
    cols: 50,
    maxLevel: 9, 
    hp: 30,
    monsters: { 1: 50, 2: 46, 3: 39, 4: 36, 5: 29, 6: 24, 7: 18, 8: 13, 9: 1 },
    expTable: [0, 10, 90, 250, 500, 850, 1300, 1850, 2500, 9999]
  },
  hugeExtreme: { 
    name: 'HUGE×EX', 
    icon: '☠️',
    description: 'やらないほうがいい',
    rows: 25,
    cols: 50,
    maxLevel: 9, 
    hp: 10,
    monsters: { 1: 36, 2: 36, 3: 36, 4: 36, 5: 36, 6: 36, 7: 36, 8: 36, 9: 36 },
    expTable: [0, 3, 10, 150, 400, 750, 1200, 1750, 2400, 9999]
  }
};

// 魔物アイコン（Lv1〜9）
const MONSTER_ICONS = {
  1: '🐛', // いもむし
  2: '🦀', // カニ
  3: '🐺', // オオカミ
  4: '🦅', // ワシ
  5: '🦁', // ライオン
  6: '👻', // ゴースト
  7: '👹', // 鬼
  8: '🦄', // ユニコーン
  9: '🐲'  // ドラゴン
};

// 8人分のカラーパレット
const PLAYER_COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

// 経験値計算（敵LV → 獲得EX: 2^(LV-1)）
const getExpForLevel = (monsterLevel) => Math.pow(2, monsterLevel - 1);

// 次のレベルまでの必要経験値（累計）
const getExpToNextLevel = (playerLevel, mode) => {
  const table = GAME_MODES[mode]?.expTable || [0, 10, 50, 167, 271, 999];
  return table[playerLevel] || 9999;
};

// 効果音：ダメージ
const playDamageSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
  
  gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
  
  oscillator.type = 'sawtooth';
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
};

// 効果音：レベルアップ
const playLevelUpSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [523, 659, 784, 1047];
  
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
    gain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.15);
    
    osc.type = 'square';
    osc.start(audioContext.currentTime + i * 0.1);
    osc.stop(audioContext.currentTime + i * 0.1 + 0.15);
  });
};

// 効果音：魔物撃破
const playDefeatSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
  
  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  
  oscillator.type = 'sine';
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.15);
};

// 効果音：クリア
const playWinSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [
    { freq: 523, time: 0, duration: 0.15 },
    { freq: 659, time: 0.15, duration: 0.15 },
    { freq: 784, time: 0.3, duration: 0.15 },
    { freq: 1047, time: 0.45, duration: 0.4 },
  ];
  
  notes.forEach(note => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(note.freq, audioContext.currentTime + note.time);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime + note.time);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + note.time + note.duration);
    
    osc.type = 'square';
    osc.start(audioContext.currentTime + note.time);
    osc.stop(audioContext.currentTime + note.time + note.duration);
  });
};

// 効果音：ゲームオーバー
const playGameOverSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [400, 350, 300, 200];
  
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.2);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.2 + 0.3);
    
    osc.type = 'sawtooth';
    osc.start(audioContext.currentTime + i * 0.2);
    osc.stop(audioContext.currentTime + i * 0.2 + 0.3);
  });
};

// ボード生成
function createBoard(mode, safeRow = -1, safeCol = -1) {
  const modeConfig = GAME_MODES[mode];
  const { rows, cols, maxLevel, monsters } = modeConfig;
  
  const newBoard = Array(rows).fill(null).map((_, r) =>
    Array(cols).fill(null).map((_, c) => ({
      isMonster: false,
      monsterLevel: 0,
      monsterHp: 0, // 魔物のHP（=魔物LV）
      monsterMaxHp: 0,
      isRevealed: false,
      isDead: false, // 魔物が倒されたか
      showNumber: false, // 倒した魔物で数値表示するか
      mark: 0,
      markBy: null, // マーキングした人
      pinned: false, // ピン挿し
      pinnedBy: null, // ピンを挿した人
      neighborSum: 0,
      revealedBy: null
    }))
  );

  // 魔物配置
  for (let lv = 1; lv <= maxLevel; lv++) {
    const count = monsters[lv] || 0;
    let placed = 0;
    let attempts = 0;
    const maxAttempts = rows * cols * 10;
    
    while (placed < count && attempts < maxAttempts) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      const isSafeZone = Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1;
      
      if (!newBoard[r][c].isMonster && !isSafeZone) {
        newBoard[r][c].isMonster = true;
        newBoard[r][c].monsterLevel = lv;
        newBoard[r][c].monsterHp = lv; // HP = LV
        newBoard[r][c].monsterMaxHp = lv;
        placed++;
      }
      attempts++;
    }
  }

  // 周囲の魔物レベル合計を計算（自分自身は除外）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue; // 自分自身をスキップ
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newBoard[nr][nc].isMonster) {
            sum += newBoard[nr][nc].monsterLevel;
          }
        }
      }
      newBoard[r][c].neighborSum = sum;
    }
  }

  return newBoard;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ダメージエフェクト
function DamageEffect({ x, y, damage, onComplete }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="damage-effect" style={{ left: x, top: y }}>
      <div className="damage-text">-{damage}</div>
    </div>
  );
}

// レベルアップエフェクト
function LevelUpEffect({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="levelup-overlay">
      <div className="levelup-text">LEVEL UP!</div>
    </div>
  );
}

// クリア時の紙吹雪エフェクト
function ConfettiEffect() {
  const colors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD', '#F8B500'];
  const confetti = [...Array(50)].map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    color: colors[i % colors.length],
    size: 8 + Math.random() * 8,
    rotation: Math.random() * 360
  }));

  return (
    <div className="confetti-container">
      {confetti.map(c => (
        <div
          key={c.id}
          className="confetti"
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            backgroundColor: c.color,
            width: `${c.size}px`,
            height: `${c.size}px`,
            transform: `rotate(${c.rotation}deg)`
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState({});
  const [board, setBoard] = useState(null);
  const [gameState, setGameState] = useState('waiting');
  const [mode, setMode] = useState('normal');
  const [isHost, setIsHost] = useState(false);
  const [firstClick, setFirstClick] = useState(true);
  
  // ゲームステータス（全員共通）
  const [hp, setHp] = useState(10);
  const [maxHp, setMaxHp] = useState(10);
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [time, setTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  
  // エフェクト
  const [damageEffects, setDamageEffects] = useState([]);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  
  // マーキング用
  const [rightClickStart, setRightClickStart] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, text: '', x: 0, y: 0 });
  const [ripples, setRipples] = useState([]); // 波紋エフェクト
  const lastDamageEventIdRef = useRef(null); // 最後に処理したダメージイベント
  const longPressTimerRef = useRef(null);
  
  const boardRef = useRef(null);
  const prevGameStateRef = useRef(gameState);
  const prevLevelRef = useRef(level);

  const modeConfig = GAME_MODES[mode];
  
  // 次のレベルまでの必要経験値
  const expToNext = getExpToNextLevel(level, mode);
  const expNeeded = expToNext - exp;

  // プレイヤー名から色を取得
  const getColorForPlayer = (pName) => {
    const playersList = Object.values(players);
    const player = playersList.find(p => p.name === pName);
    return player?.color || '#666';
  };

  // タイマー
  useEffect(() => {
    let interval;
    if (timerRunning && gameState === 'playing') {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, gameState]);

  // レベルアップ検知
  useEffect(() => {
    if (prevLevelRef.current < level && level > 1) {
      playLevelUpSound();
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 1500);
    }
    prevLevelRef.current = level;
  }, [level]);

  // ゲーム終了検知
  useEffect(() => {
    if (prevGameStateRef.current !== 'won' && gameState === 'won') {
      playWinSound();
      setShowConfetti(true);
      setTimerRunning(false);
      setTimeout(() => setShowConfetti(false), 4000);
    }
    if (prevGameStateRef.current !== 'lost' && gameState === 'lost') {
      playGameOverSound();
      setTimerRunning(false);
    }
    prevGameStateRef.current = gameState;
  }, [gameState]);

  // Firebase同期
  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.players) setPlayers(data.players);
        if (data.board) setBoard(data.board);
        if (data.gameState) setGameState(data.gameState);
        if (data.mode) setMode(data.mode);
        if (data.firstClick !== undefined) setFirstClick(data.firstClick);
        if (data.hp !== undefined) setHp(data.hp);
        if (data.maxHp !== undefined) setMaxHp(data.maxHp);
        if (data.level !== undefined) setLevel(data.level);
        if (data.exp !== undefined) setExp(data.exp);
        if (data.time !== undefined) setTime(data.time);
        if (data.timerRunning !== undefined) setTimerRunning(data.timerRunning);
        
        // 波紋エフェクトを同期
        if (data.ripples) {
          const now = Date.now();
          const activeRipples = Object.entries(data.ripples)
            .filter(([_, r]) => now - r.timestamp < 3000) // 3秒以内のもの
            .map(([id, r]) => ({ id, ...r }));
          setRipples(activeRipples);
        } else {
          setRipples([]);
        }
        
        // ダメージイベントを同期（効果音再生）
        if (data.damageEvent && data.damageEvent.id !== lastDamageEventIdRef.current) {
          const event = data.damageEvent;
          const now = Date.now();
          // 3秒以内のイベントのみ処理
          if (now - event.timestamp < 3000) {
            lastDamageEventIdRef.current = event.id;
            if (event.type === 'damage') {
              playDamageSound();
              // ダメージエフェクト表示
              if (boardRef.current && event.row !== undefined && event.col !== undefined) {
                const cellEl = boardRef.current.querySelector(`[data-pos="${event.row}-${event.col}"]`);
                if (cellEl) {
                  const rect = cellEl.getBoundingClientRect();
                  const boardRect = boardRef.current.getBoundingClientRect();
                  setDamageEffects(prev => [...prev, {
                    id: event.id,
                    x: rect.left - boardRect.left + rect.width / 2,
                    y: rect.top - boardRect.top,
                    damage: event.damage
                  }]);
                }
              }
            } else if (event.type === 'defeat') {
              playDefeatSound();
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  const getPlayerColor = (existingPlayers) => {
    const usedColors = Object.values(existingPlayers || {}).map(p => p.color);
    return PLAYER_COLORS.find(c => !usedColors.includes(c)) || PLAYER_COLORS[0];
  };

  const createRoom = async () => {
    if (!playerName.trim()) {
      alert('名前を入力してね！');
      return;
    }

    const newRoomId = generateRoomId();
    const roomRef = ref(database, `rooms/${newRoomId}`);
    const initialMode = 'normal';
    const initialHp = GAME_MODES[initialMode].hp;
    
    await set(roomRef, {
      players: {
        [playerName]: { name: playerName, color: PLAYER_COLORS[0], isHost: true }
      },
      board: null,
      gameState: 'waiting',
      mode: initialMode,
      firstClick: true,
      hp: initialHp,
      maxHp: initialHp,
      level: 1,
      exp: 0,
      time: 0,
      timerRunning: false,
      createdAt: Date.now()
    });

    setRoomId(newRoomId);
    setIsHost(true);
    setScreen('game');
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      alert('名前を入力してね！');
      return;
    }
    if (!inputRoomId.trim()) {
      alert('ルームIDを入力してね！');
      return;
    }

    const roomRef = ref(database, `rooms/${inputRoomId.toUpperCase()}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
      alert('ルームが見つからない…');
      return;
    }

    const roomData = snapshot.val();
    const playerColor = getPlayerColor(roomData.players);

    const playerRef = ref(database, `rooms/${inputRoomId.toUpperCase()}/players/${playerName}`);
    await set(playerRef, { name: playerName, color: playerColor, isHost: false });

    setRoomId(inputRoomId.toUpperCase());
    setIsHost(false);
    setScreen('game');
  };

  const startGame = async () => {
    const newBoard = createBoard(mode, -1, -1);
    const initialHp = GAME_MODES[mode].hp;
    
    await update(ref(database, `rooms/${roomId}`), {
      board: newBoard,
      gameState: 'playing',
      firstClick: true,
      hp: initialHp,
      maxHp: initialHp,
      level: 1,
      exp: 0,
      time: 0,
      timerRunning: true
    });
  };

  const revealCellRecursive = (board, row, col, rows, cols, pName, updates) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    const cell = board[row][col];
    if (cell.isRevealed || cell.mark > 0) return;
    if (cell.isMonster) return;

    cell.isRevealed = true;
    cell.revealedBy = pName;
    updates[`${row}_${col}`] = cell;

    if (cell.neighborSum === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          revealCellRecursive(board, row + dr, col + dc, rows, cols, pName, updates);
        }
      }
    }
  };

  const checkWin = (board) => {
    for (const row of board) {
      for (const cell of row) {
        if (cell.isMonster && !cell.isDead) return false;
      }
    }
    return true;
  };

  const handleClick = async (row, col) => {
    if (gameState !== 'playing' || !board) return;

    const boardDbRef = ref(database, `rooms/${roomId}`);
    
    try {
      const result = await runTransaction(boardDbRef, (currentData) => {
        if (!currentData || currentData.gameState !== 'playing') return currentData;
        
        let currentBoard = currentData.board;
        const currentMode = currentData.mode;
        const { rows, cols } = GAME_MODES[currentMode];
        
        if (currentData.firstClick) {
          currentBoard = createBoard(currentMode, row, col);
          currentData.firstClick = false;
          currentData.board = currentBoard;
        }

        const cell = currentBoard[row][col];
        
        // 既に開いているが、HPが残っている魔物には再攻撃可能
        if (cell.isRevealed && !(cell.isMonster && !cell.isDead && cell.monsterHp > 0)) {
          return currentData;
        }

        if (cell.isMonster && !cell.isDead) {
          cell.isRevealed = true;
          cell.revealedBy = playerName;
          
          const playerLv = currentData.level;
          const monsterLv = cell.monsterLevel;
          
          // 自分が先制攻撃（自分のLV分のダメージ）
          cell.monsterHp -= playerLv;
          
          if (cell.monsterHp <= 0) {
            // 魔物を倒した
            cell.monsterHp = 0;
            cell.isDead = true;
            
            // 経験値獲得
            const gainedExp = getExpForLevel(monsterLv);
            currentData.exp += gainedExp;
            
            // レベルアップ判定（1回だけ）
            const nextLevelExp = getExpToNextLevel(currentData.level, currentMode);
            if (currentData.exp >= nextLevelExp && currentData.level < 9) {
              currentData.level += 1;
            }
          } else {
            // 魔物が反撃（魔物LV分のダメージ）
            const damage = monsterLv;
            currentData.hp = Math.max(0, currentData.hp - damage);
            
            if (currentData.hp <= 0) {
              // ゲームオーバー
              currentBoard.forEach(r => r.forEach(c => {
                if (c.isMonster) {
                  c.isRevealed = true;
                }
              }));
              currentData.gameState = 'lost';
              currentData.timerRunning = false;
            }
          }
          
          currentData.board = currentBoard;
          
          if (currentData.gameState === 'playing' && checkWin(currentBoard)) {
            currentData.gameState = 'won';
            currentData.timerRunning = false;
          }
          
          return currentData;
        }

        const updates = {};
        revealCellRecursive(currentBoard, row, col, rows, cols, playerName, updates);
        currentData.board = currentBoard;
        
        return currentData;
      });

      if (result.committed && result.snapshot.val()) {
        const data = result.snapshot.val();
        const cell = data.board?.[row]?.[col];
        
        if (cell?.isMonster && cell?.isRevealed) {
          const eventId = Date.now();
          const damageEventRef = ref(database, `rooms/${roomId}/damageEvent`);
          
          if (cell.isDead) {
            // 撃破イベントをFirebaseに保存
            await set(damageEventRef, {
              id: eventId,
              type: 'defeat',
              row,
              col,
              timestamp: eventId
            });
          } else {
            // ダメージイベントをFirebaseに保存
            await set(damageEventRef, {
              id: eventId,
              type: 'damage',
              row,
              col,
              damage: cell.monsterLevel,
              timestamp: eventId
            });
          }
        }
      }
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  // 右クリックのcontextmenuを無効化
  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  // 右クリック処理
  const handleRightMouseDown = async (e, row, col) => {
    if (e.button !== 2) return;
    e.preventDefault();
    
    if (gameState !== 'playing' || !board) return;
    
    const cell = board[row][col];
    
    // 倒した魔物の場合はトグル
    if (cell.isMonster && cell.isDead) {
      const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
      await runTransaction(cellRef, (currentCell) => {
        if (!currentCell) return currentCell;
        currentCell.showNumber = !currentCell.showNumber;
        return currentCell;
      });
      return;
    }
    
    if (cell.isRevealed) return;
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    
    setRightClickStart({ row, col });
    
    // 長押しタイマー開始（300msで解除）
    longPressTimerRef.current = setTimeout(async () => {
      const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
      await runTransaction(cellRef, (currentCell) => {
        if (!currentCell || currentCell.isRevealed) return currentCell;
        currentCell.mark = 0;
        currentCell.markBy = null;
        return currentCell;
      });
      setRightClickStart(null);
    }, 300);
    
    // 押した瞬間にマーキング
    const maxMark = modeConfig.maxLevel;
    const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
    await runTransaction(cellRef, (currentCell) => {
      if (!currentCell || currentCell.isRevealed) return currentCell;
      let newMark = currentCell.mark + 1;
      if (newMark > maxMark) newMark = 0;
      currentCell.mark = newMark;
      currentCell.markBy = newMark > 0 ? playerName : null;
      return currentCell;
    });
  };

  const handleRightMouseUp = (e, row, col) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setRightClickStart(null);
  };

  // マウスがセルに入ったとき
  const handleMouseEnter = (e, row, col) => {
    setHoveredCell({ row, col });
    
    // ツールチップ表示（生きている魔物のみ）
    const cell = board?.[row]?.[col];
    if (cell?.isMonster && cell?.isRevealed && !cell?.isDead) {
      const rect = e.target.getBoundingClientRect();
      setTooltip({
        show: true,
        text: `Lv${cell.monsterLevel} HP:${cell.monsterHp}/${cell.monsterMaxHp}`,
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      });
    }
  };

  // マウスがセルから出たとき
  const handleMouseLeave = () => {
    setHoveredCell(null);
    setTooltip({ show: false, text: '', x: 0, y: 0 });
  };

  // ホイールクリック（中クリック）でピン挿し
  const handleMiddleClick = async (e, row, col) => {
    if (e.button !== 1) return; // 中クリックのみ
    e.preventDefault();
    
    if (gameState !== 'playing' || !board) return;
    
    // 現在のピン状態を確認
    const currentCell = board[row]?.[col];
    const wasNotPinned = !currentCell?.pinned;
    
    const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
    await runTransaction(cellRef, (currentCell) => {
      if (!currentCell) return currentCell;
      // トグル
      if (currentCell.pinned) {
        currentCell.pinned = false;
        currentCell.pinnedBy = null;
      } else {
        currentCell.pinned = true;
        currentCell.pinnedBy = playerName;
      }
      return currentCell;
    });
    
    // ピンを挿すときだけ波紋エフェクトをFirebaseに保存（2回分）
    if (wasNotPinned) {
      const color = getColorForPlayer(playerName);
      const now = Date.now();
      
      // 1回目の波紋
      const ripple1Ref = ref(database, `rooms/${roomId}/ripples/${now}`);
      await set(ripple1Ref, {
        row,
        col,
        color,
        timestamp: now
      });
      
      // 3秒後に削除
      setTimeout(async () => {
        await set(ripple1Ref, null);
      }, 3000);
      
      // 2回目の波紋（1秒後）
      setTimeout(async () => {
        const now2 = Date.now();
        const ripple2Ref = ref(database, `rooms/${roomId}/ripples/${now2}`);
        await set(ripple2Ref, {
          row,
          col,
          color,
          timestamp: now2
        });
        
        // 3秒後に削除
        setTimeout(async () => {
          await set(ripple2Ref, null);
        }, 3000);
      }, 1000);
    }
  };

  // キーボードで数字入力
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (gameState !== 'playing' || !board || !hoveredCell) return;
      
      const key = e.key;
      const num = parseInt(key, 10);
      
      if (isNaN(num)) return;
      
      const maxMark = modeConfig.maxLevel;
      if (num !== 0 && (num < 1 || num > maxMark)) return;
      
      const { row, col } = hoveredCell;
      const cell = board[row]?.[col];
      if (!cell || cell.isRevealed) return;
      
      const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
      await runTransaction(cellRef, (currentCell) => {
        if (!currentCell || currentCell.isRevealed) return currentCell;
        currentCell.mark = num;
        currentCell.markBy = num > 0 ? playerName : null;
        return currentCell;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, board, hoveredCell, roomId, modeConfig, playerName]);

  const changeMode = async (newMode) => {
    if (gameState === 'playing') return;
    
    const newHp = GAME_MODES[newMode].hp;
    
    await update(ref(database, `rooms/${roomId}`), {
      mode: newMode,
      hp: newHp,
      maxHp: newHp
    });
  };

  const resetGame = async () => {
    if (!window.confirm('リセットしますか？')) return;
    await doReset();
  };

  const doReset = async () => {
    const initialHp = GAME_MODES[mode].hp;
    await update(ref(database, `rooms/${roomId}`), {
      board: null,
      gameState: 'waiting',
      firstClick: true,
      hp: initialHp,
      maxHp: initialHp,
      level: 1,
      exp: 0,
      time: 0,
      timerRunning: false
    });
    setDamageEffects([]);
  };

  const leaveRoom = async () => {
    if (!window.confirm('ルームから退出しますか？')) return;
    const playerRef = ref(database, `rooms/${roomId}/players/${playerName}`);
    await set(playerRef, null);
    setScreen('lobby');
    setRoomId('');
  };

  const removeDamageEffect = (id) => {
    setDamageEffects(prev => prev.filter(e => e.id !== id));
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getCellClass = (cell) => {
    let cls = 'cell';
    if (!cell.isRevealed) {
      cls += cell.mark > 0 ? ' cell-marked' : ' cell-hidden';
    } else if (cell.isMonster) {
      cls += cell.isDead ? ' cell-monster-dead' : ' cell-monster-alive';
    } else {
      cls += ' cell-revealed';
    }
    if (cell.pinned) {
      cls += ' cell-pinned';
    }
    return cls;
  };

  const getCellStyle = (cell) => {
    const style = {};
    if (cell.isRevealed && cell.revealedBy) {
      const color = getColorForPlayer(cell.revealedBy);
      style.borderColor = color;
      style.boxShadow = `inset 0 0 0 2px ${color}40`;
    }
    if (!cell.isRevealed && cell.mark > 0 && cell.markBy) {
      const color = getColorForPlayer(cell.markBy);
      style.backgroundColor = color;
    }
    return style;
  };

  const getCellContent = (cell, row, col) => {
    if (!cell.isRevealed) {
      return cell.mark > 0 ? cell.mark : '';
    }
    if (cell.isMonster) {
      if (cell.showNumber) {
        // 倒した魔物の数字表示（0も表示）
        return (
          <span className="dead-monster-number">
            {cell.neighborSum}
          </span>
        );
      }
      
      // 倒した魔物にホバー中ならLV表示
      const isHovered = hoveredCell && hoveredCell.row === row && hoveredCell.col === col;
      if (cell.isDead && isHovered) {
        return (
          <div className="monster-cell">
            <span className="monster-lv-overlay">Lv{cell.monsterLevel}</span>
          </div>
        );
      }
      
      return (
        <div className="monster-cell">
          <span className={`monster-icon ${cell.isDead ? 'dead' : ''}`}>
            {MONSTER_ICONS[cell.monsterLevel]}
          </span>
          {!cell.isDead && (
            <div className="monster-hp-bar">
              <div 
                className="monster-hp-fill" 
                style={{ width: `${(cell.monsterHp / cell.monsterMaxHp) * 100}%` }}
              />
            </div>
          )}
        </div>
      );
    }
    return cell.neighborSum > 0 ? cell.neighborSum : '';
  };

  // 魔物のツールチップ
  const getTooltip = (cell) => {
    if (cell.isMonster && cell.isRevealed && !cell.isDead) {
      return `Lv${cell.monsterLevel} HP:${cell.monsterHp}/${cell.monsterMaxHp}`;
    }
    return '';
  };

  // 残り魔物数
  const remainingMonsters = board 
    ? board.flat().filter(c => c.isMonster && !c.isDead).length 
    : 0;

  // 種類別の残り魔物数
  const getRemainingByLevel = (lv) => {
    if (!board) return 0;
    return board.flat().filter(c => c.isMonster && c.monsterLevel === lv && !c.isDead).length;
  };

  if (screen === 'lobby') {
    return (
      <div className="lobby">
        <h1>🐲 マモノスイーパー</h1>
        <p className="subtitle">協力マルチプレイ</p>
        
        <div className="lobby-form">
          <input
            type="text"
            placeholder="あなたの名前"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={10}
          />

          <div className="divider">ルームに参加する場合</div>

          <input
            type="text"
            placeholder="ルームID"
            value={inputRoomId}
            onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button onClick={joinRoom} className="btn-secondary">
            ルームに参加
          </button>

          <div className="divider">または</div>

          <button onClick={createRoom} className="btn-primary">
            ルームを作成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {showLevelUp && <LevelUpEffect onComplete={() => setShowLevelUp(false)} />}
      {showConfetti && <ConfettiEffect />}
      {showCopyToast && <div className="copy-toast">コピーしました！</div>}

      <div className="game-header">
        <h1>🐲 マモノスイーパー</h1>
        <div className="room-info">
          ルームID: <span className="room-id">{roomId}</span>
          <button onClick={() => {
            navigator.clipboard.writeText(roomId);
            setShowCopyToast(true);
            setTimeout(() => setShowCopyToast(false), 1500);
          }} className="btn-small" title="コピー">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="players-list">
        {Object.values(players).map((p) => (
          <div 
            key={p.name} 
            className="player-tag"
            style={{ backgroundColor: p.color }}
          >
            {p.name} {p.isHost && '👑'}
          </div>
        ))}
      </div>

      {gameState === 'waiting' && (
        <div className="waiting-room">
          <p>プレイヤーを待っています...</p>
          
          <div className="setting-section">
            <label className="setting-label">モード</label>
            <div className="mode-select">
              {Object.entries(GAME_MODES).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => changeMode(key)}
                  className={`btn-mode ${mode === key ? 'active' : ''}`}
                >
                  <span className="mode-icon">{val.icon}</span>
                  <span className="mode-name">{val.name}</span>
                  <span className="mode-desc">{val.description}</span>
                  <span className="mode-info">{val.cols}×{val.rows} HP:{val.hp}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={startGame} className="btn-start">
            ゲーム開始！
          </button>
        </div>
      )}

      {board && gameState !== 'waiting' && (
        <>
          <div className="status-bar">
            <div className="status-item">
              <span className="status-label">HP</span>
              <span className="status-value">{hp}/{maxHp}</span>
              <div className="hp-bar">
                <div className="hp-fill" style={{ width: `${(hp / maxHp) * 100}%` }}></div>
              </div>
            </div>
            <div className="status-item">
              <span className="status-label">LV</span>
              <span className="status-value level-value">{level}</span>
            </div>
            <div className="status-item">
              <span className="status-label">EX</span>
              <span className="status-value">{exp}</span>
            </div>
            <div className="status-item">
              <span className="status-label">NE</span>
              <span className="status-value">{expNeeded > 0 ? expNeeded : 0}</span>
            </div>
            <div className="status-item">
              <span className="status-label">T</span>
              <span className="status-value">{formatTime(time)}</span>
            </div>
            <div className="status-item">
              <span className="status-label">🐲</span>
              <span className="status-value">{remainingMonsters}</span>
            </div>
            <button onClick={resetGame} className="btn-reset-small">🔄</button>
          </div>

          <div className="monster-guide">
            <div className="monster-guide-title">🐲 魔物図鑑（残り {remainingMonsters} 匹）</div>
            <div className="monster-list">
              {Object.entries(MONSTER_ICONS).slice(0, modeConfig?.maxLevel || 5).map(([lv, icon]) => {
                const remaining = getRemainingByLevel(parseInt(lv));
                return (
                  <div key={lv} className={`monster-entry ${remaining === 0 ? 'cleared' : ''}`}>
                    <span className="monster-icon-small">{icon}</span>
                    <span className="monster-lv">Lv{lv}</span>
                    <span className="monster-remaining">×{remaining}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {(gameState === 'won' || gameState === 'lost') && (
            <div className={`game-result ${gameState}`}>
              {gameState === 'won' ? '🎉 全魔物討伐！クリア！' : '💀 ゲームオーバー...'}
            </div>
          )}

          <div className="board-container" ref={boardRef}>
            {tooltip.show && (
              <div 
                className="custom-tooltip"
                style={{ 
                  left: tooltip.x, 
                  top: tooltip.y,
                  position: 'fixed',
                  transform: 'translate(-50%, -100%)'
                }}
              >
                {tooltip.text}
              </div>
            )}
            <div 
              className="board"
              style={{ 
                gridTemplateColumns: `repeat(${modeConfig.cols}, 28px)`,
                gridTemplateRows: `repeat(${modeConfig.rows}, 28px)`
              }}
            >
              {board.map((row, r) =>
                row.map((cell, c) => (
                  <div
                    key={`${r}-${c}`}
                    data-pos={`${r}-${c}`}
                    className={getCellClass(cell)}
                    style={getCellStyle(cell)}
                    onClick={() => handleClick(r, c)}
                    onContextMenu={handleContextMenu}
                    onMouseDown={(e) => {
                      handleRightMouseDown(e, r, c);
                      handleMiddleClick(e, r, c);
                    }}
                    onMouseUp={(e) => handleRightMouseUp(e, r, c)}
                    onMouseEnter={(e) => handleMouseEnter(e, r, c)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {getCellContent(cell, r, c)}
                    {cell.pinned && <div className="pin-marker" style={{ borderColor: getColorForPlayer(cell.pinnedBy) }}>📍</div>}
                  </div>
                ))
              )}
            </div>
            {damageEffects.map(eff => (
              <DamageEffect
                key={eff.id}
                x={eff.x}
                y={eff.y}
                damage={eff.damage}
                onComplete={() => removeDamageEffect(eff.id)}
              />
            ))}
            {ripples.map(ripple => {
              // row, colからセルの位置を計算
              const cellEl = boardRef.current?.querySelector(`[data-pos="${ripple.row}-${ripple.col}"]`);
              if (!cellEl || !boardRef.current) return null;
              const rect = cellEl.getBoundingClientRect();
              const boardRect = boardRef.current.getBoundingClientRect();
              const x = rect.left - boardRect.left + rect.width / 2;
              const y = rect.top - boardRect.top + rect.height / 2;
              
              // タイムスタンプから経過時間を計算し、アニメーション開始時間を調整
              const elapsed = Date.now() - ripple.timestamp;
              const animationDelay = -elapsed / 1000; // 経過分だけ遅らせる（マイナスで進める）
              
              return (
                <div
                  key={ripple.id}
                  className="ripple-effect"
                  style={{
                    left: x,
                    top: y,
                    borderColor: ripple.color,
                    animationDelay: `${animationDelay}s`
                  }}
                />
              );
            })}
          </div>

          <div className="game-controls">
            {(gameState === 'won' || gameState === 'lost') && (
              <button onClick={doReset} className="btn-reset">
                🔄 リセット
              </button>
            )}
            <button onClick={leaveRoom} className="btn-leave">
              🚪 退出
            </button>
          </div>
        </>
      )}

      <div className="help-text">
        左クリック: 開く ｜ 右クリック: マーキング ｜ 長押し: 解除 ｜ 数字キー: 直接入力 ｜ ホイールクリック: ピン
      </div>
    </div>
  );
}

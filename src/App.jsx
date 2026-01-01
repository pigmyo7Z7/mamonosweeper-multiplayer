import { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, set, onValue, get, update, runTransaction } from 'firebase/database';
import './App.css';

// モード設定（本家準拠：モード選択でマップサイズ・敵数・HP全て決まる）
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
  1: '🦠', // スライム
  2: '🐛', // いもむし
  3: '🐀', // ネズミ
  4: '🦇', // コウモリ
  5: '🐺', // ウルフ
  6: '🦁', // ライオン
  7: '🐲', // ワイバーン
  8: '👹', // デーモン
  9: '☠️'  // 死神
};

// 8人分のカラーパレット
const PLAYER_COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

// 経験値計算（敵LV = 獲得EX）
const getExpForLevel = (monsterLevel) => monsterLevel;

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

// ボード生成（本家準拠）
function createBoard(mode, safeRow = -1, safeCol = -1) {
  const modeConfig = GAME_MODES[mode];
  const { rows, cols, maxLevel, monsters } = modeConfig;
  
  const newBoard = Array(rows).fill(null).map((_, r) =>
    Array(cols).fill(null).map((_, c) => ({
      isMonster: false,
      monsterLevel: 0,
      isRevealed: false,
      mark: 0,
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
        placed++;
      }
      attempts++;
    }
  }

  // 周囲の魔物レベル合計を計算
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
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
  const longPressTimerRef = useRef(null);
  
  const boardRef = useRef(null);
  const prevGameStateRef = useRef(gameState);
  const prevLevelRef = useRef(level);

  const modeConfig = GAME_MODES[mode];
  
  // 次のレベルまでの必要経験値
  const expToNext = getExpToNextLevel(level, mode);
  const expNeeded = expToNext - exp;

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
        if (cell.isMonster && !cell.isRevealed) return false;
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
        
        if (cell.isRevealed) return currentData;
        if (cell.mark > 0) return currentData;

        if (cell.isMonster) {
          const monsterLv = cell.monsterLevel;
          const playerLv = currentData.level;
          
          cell.isRevealed = true;
          cell.revealedBy = playerName;
          
          if (monsterLv > playerLv) {
            const damage = monsterLv - playerLv;
            currentData.hp = Math.max(0, currentData.hp - damage);
            
            if (currentData.hp <= 0) {
              currentBoard.forEach(r => r.forEach(c => {
                if (c.isMonster) c.isRevealed = true;
              }));
              currentData.gameState = 'lost';
              currentData.timerRunning = false;
            }
          }
          
          // 経験値獲得（敵LV = 獲得EX）
          const gainedExp = getExpForLevel(monsterLv);
          currentData.exp += gainedExp;
          
          // レベルアップ判定（累計経験値方式）
          const nextLevelExp = getExpToNextLevel(currentData.level, currentMode);
          while (currentData.exp >= nextLevelExp && currentData.level < 9) {
            currentData.level += 1;
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
          if (cell.monsterLevel > data.level) {
            if (boardRef.current) {
              const cellEl = boardRef.current.querySelector(`[data-pos="${row}-${col}"]`);
              if (cellEl) {
                const rect = cellEl.getBoundingClientRect();
                const boardRect = boardRef.current.getBoundingClientRect();
                setDamageEffects(prev => [...prev, {
                  id: Date.now(),
                  x: rect.left - boardRect.left + rect.width / 2,
                  y: rect.top - boardRect.top,
                  damage: cell.monsterLevel - data.level
                }]);
              }
            }
            playDamageSound();
          } else {
            playDefeatSound();
          }
        }
      }
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  const handleRightClick = async (e, row, col) => {
    e.preventDefault();
    if (gameState !== 'playing' || !board) return;

    const cell = board[row][col];
    if (cell.isRevealed) return;

    const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
    await runTransaction(cellRef, (currentCell) => {
      if (!currentCell || currentCell.isRevealed) return currentCell;
      currentCell.mark = (currentCell.mark + 1) % 10;
      return currentCell;
    });
  };

  const handleWheel = async (e, row, col) => {
    if (gameState !== 'playing' || !board) return;

    const cell = board[row][col];
    if (cell.isRevealed || cell.mark === 0) return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;

    const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
    await runTransaction(cellRef, (currentCell) => {
      if (!currentCell || currentCell.isRevealed || currentCell.mark === 0) return currentCell;
      let newMark = currentCell.mark + delta;
      if (newMark > 9) newMark = 1;
      if (newMark < 1) newMark = 9;
      currentCell.mark = newMark;
      return currentCell;
    });
  };

  // 右クリック長押し：マーキング解除（長押し判定の瞬間に発動）
  const handleRightMouseDown = async (e, row, col) => {
    if (e.button !== 2) return;
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    
    setRightClickStart({ row, col });
    
    longPressTimerRef.current = setTimeout(async () => {
      const cellRef = ref(database, `rooms/${roomId}/board/${row}/${col}`);
      await runTransaction(cellRef, (currentCell) => {
        if (!currentCell || currentCell.isRevealed) return currentCell;
        currentCell.mark = 0;
        return currentCell;
      });
      setRightClickStart(null);
    }, 500);
  };

  const handleRightMouseUp = (e, row, col) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setRightClickStart(null);
  };

  const changeMode = async (newMode) => {
    if (!isHost || gameState === 'playing') return;
    
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
      cls += ` cell-monster cell-monster-${cell.monsterLevel}`;
    } else {
      cls += ' cell-revealed';
    }
    return cls;
  };

  const getCellContent = (cell) => {
    if (!cell.isRevealed) {
      return cell.mark > 0 ? cell.mark : '';
    }
    if (cell.isMonster) {
      return MONSTER_ICONS[cell.monsterLevel];
    }
    return cell.neighborSum > 0 ? cell.neighborSum : '';
  };

  const remainingMonsters = board 
    ? board.flat().filter(c => c.isMonster && !c.isRevealed).length 
    : 0;

  if (screen === 'lobby') {
    return (
      <div className="lobby">
        <h1>👹 マモノスイーパー</h1>
        <p className="subtitle">協力マルチプレイ</p>
        
        <div className="lobby-form">
          <input
            type="text"
            placeholder="あなたの名前"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={10}
          />

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
        <h1>👹 マモノスイーパー</h1>
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
          
          {isHost && (
            <>
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
            </>
          )}
          
          {!isHost && (
            <div className="waiting-info">
              <p className="waiting-text">ホストがゲームを開始するのを待っています...</p>
              <p className="settings-preview">
                モード: {modeConfig?.icon} {modeConfig?.name} ｜
                {modeConfig?.cols}×{modeConfig?.rows} ｜
                HP: {modeConfig?.hp}
              </p>
            </div>
          )}
        </div>
      )}

      {board && gameState !== 'waiting' && (
        <>
          <div className="status-bar">
            <div className="status-item hp">
              <span className="status-label">HP</span>
              <span className="status-value">{hp}</span>
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
              <span className="status-label">👹</span>
              <span className="status-value">{remainingMonsters}</span>
            </div>
            <button onClick={resetGame} className="btn-reset-small">🔄</button>
          </div>

          {(gameState === 'won' || gameState === 'lost') && (
            <div className={`game-result ${gameState}`}>
              {gameState === 'won' ? '🎉 全魔物討伐！クリア！' : '💀 ゲームオーバー...'}
            </div>
          )}

          <div className="board-container" ref={boardRef}>
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
                    onClick={() => handleClick(r, c)}
                    onContextMenu={(e) => handleRightClick(e, r, c)}
                    onMouseDown={(e) => handleRightMouseDown(e, r, c)}
                    onMouseUp={(e) => handleRightMouseUp(e, r, c)}
                    onWheel={(e) => handleWheel(e, r, c)}
                  >
                    {getCellContent(cell)}
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
        左クリック: 開く ｜ 右クリック: マーキング(1-9) ｜ ホイール: 数値変更 ｜ 長押し: 解除
      </div>
      
      <div className="monster-guide">
        <div className="monster-guide-title">👹 魔物図鑑</div>
        <div className="monster-list">
          {Object.entries(MONSTER_ICONS).slice(0, modeConfig?.maxLevel || 5).map(([lv, icon]) => (
            <div key={lv} className="monster-entry">
              <span className="monster-icon">{icon}</span>
              <span className="monster-lv">Lv{lv}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

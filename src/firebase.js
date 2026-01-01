import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBcqkbd8dMOapP3g1ss5ciru8bgWvuR86o",
  authDomain: "minesweeper-multiplayer-435a0.firebaseapp.com",
  databaseURL: "https://minesweeper-multiplayer-435a0-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "minesweeper-multiplayer-435a0",
  storageBucket: "minesweeper-multiplayer-435a0.firebasestorage.app",
  messagingSenderId: "620752201502",
  appId: "1:620752201502:web:705396e2219e25cffa4b0f"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

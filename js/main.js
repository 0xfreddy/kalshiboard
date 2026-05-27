import { Board } from './Board.js?v=16';
import { SoundEngine } from './SoundEngine.js?v=16';
import { KeyboardController } from './KeyboardController.js?v=16';
import { runKalshiRotation } from './KalshiFeed.js?v=16';

const UNAVAILABLE_MESSAGE = [
  '',
  '',
  '',
  'KALSHI MARKETS',
  'UNAVAILABLE',
  '',
  'TRY AGAIN LATER'
];

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const soundEngine = new SoundEngine();
  const board = new Board(boardContainer, soundEngine);
  new KeyboardController(soundEngine);

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    soundEngine.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  runKalshiRotation(board).catch(error => {
    console.error(error);
    board.displayMessage(UNAVAILABLE_MESSAGE);
  });
});

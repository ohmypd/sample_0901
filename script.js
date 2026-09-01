"use strict";

const INITIAL_ITEMS = [
  {
    id: "vr",
    label: "VR",
    icon: "design/icon image/icon_03_VR.png",
    result: "design/result image/03_VR.jpg",
  },
  {
    id: "art",
    label: "예술",
    icon: "design/icon image/icon_05_예술.png",
    result: "design/result image/05_예술.jpg",
  },
  {
    id: "code",
    label: "코딩",
    icon: "design/icon image/icon_04_코딩.png",
    result: "design/result image/04_코딩.jpg",
  },
  {
    id: "think",
    label: "생각",
    icon: "design/icon image/icon_01_생각.png",
    result: "design/result image/01_생각.jpg",
  },
  {
    id: "book",
    label: "책",
    icon: "design/icon image/icon_02_책.png",
    result: "design/result image/02_책.jpg",
  },
  {
    id: "brain",
    label: "뇌",
    icon: "design/icon image/icon_06_뇌.png",
    result: "design/result image/06_뇌.jpg",
  },
];

const SECTOR_CENTERS = [30, 90, 150, 210, 270, 330];

const wheel = document.querySelector("#rouletteWheel");
const pointer = document.querySelector("#roulettePointer");
const startButton = document.querySelector("#startButton");
const shuffleButton = document.querySelector("#shuffleButton");
const resetButton = document.querySelector("#resetButton");
const resultOverlay = document.querySelector("#resultOverlay");
const resultDialog = resultOverlay.querySelector(".result-dialog");
const resultImage = document.querySelector("#resultImage");
const celebration = document.querySelector("#celebration");
const statusMessage = document.querySelector("#statusMessage");

const iconSlots = [
  wheel.querySelector(".roulette__icon--vr"),
  wheel.querySelector(".roulette__icon--art"),
  wheel.querySelector(".roulette__icon--code"),
  wheel.querySelector(".roulette__icon--think"),
  wheel.querySelector(".roulette__icon--book"),
  wheel.querySelector(".roulette__icon--brain"),
];

let items = INITIAL_ITEMS.map((item) => ({ ...item }));
let currentRotation = 0;
let isSpinning = false;
let isShuffling = false;
let modalCloseTimer = 0;
let audioContext = null;
let masterGain = null;

function randomUnit() {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }

  return Math.random();
}

function randomInteger(max) {
  return Math.floor(randomUnit() * max);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function renderItems() {
  iconSlots.forEach((slot, index) => {
    const item = items[index];
    slot.src = item.icon;
    slot.alt = item.label;
    slot.dataset.itemId = item.id;
  });
}

function setControlsDisabled(disabled) {
  startButton.disabled = disabled;
  shuffleButton.disabled = disabled;
  resetButton.disabled = disabled;
  startButton.setAttribute("aria-busy", String(disabled));
}

async function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.52;
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return true;
}

function playTone(frequency, delaySeconds, duration, volume, type = "sine") {
  if (!audioContext || !masterGain) return;

  const startsAt = audioContext.currentTime + delaySeconds;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + Math.min(0.025, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.04);
}

function playStartSound() {
  playTone(220, 0, 0.12, 0.18, "triangle");
  playTone(330, 0.08, 0.18, 0.16, "triangle");
}

function playTickSound() {
  if (!audioContext || !masterGain) return;

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(430, now);
  oscillator.frequency.exponentialRampToValueAtTime(155, now + 0.045);
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.055);
}

function startSpinSound(durationMilliseconds) {
  if (!audioContext || !masterGain) return;

  const now = audioContext.currentTime;
  const duration = durationMilliseconds / 1000;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(78, now);
  oscillator.frequency.exponentialRampToValueAtTime(145, now + duration * 0.28);
  oscillator.frequency.exponentialRampToValueAtTime(92, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.18);
  gain.gain.setValueAtTime(0.028, now + duration * 0.65);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);
}

function playResultSound() {
  playTone(523.25, 0, 0.38, 0.17, "sine");
  playTone(659.25, 0.1, 0.42, 0.16, "sine");
  playTone(783.99, 0.2, 0.55, 0.18, "sine");
  playTone(1046.5, 0.34, 0.7, 0.12, "triangle");
}

function bouncePointer() {
  pointer.classList.remove("is-bouncing");
  void pointer.offsetWidth;
  pointer.classList.add("is-bouncing");
}

function getRenderedWheelAngle() {
  const transform = window.getComputedStyle(wheel).transform;
  if (!transform || transform === "none") return 0;

  const matrix = new DOMMatrixReadOnly(transform);
  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI + 360;
}

function watchSectorBoundaries() {
  let previousSector = null;
  let lastSoundAt = 0;
  let stopped = false;
  let frameId = 0;

  const update = (timestamp) => {
    if (stopped) return;

    const angle = getRenderedWheelAngle() % 360;
    const sector = Math.floor(angle / 60) % 6;

    if (previousSector !== null && sector !== previousSector) {
      bouncePointer();

      if (timestamp - lastSoundAt > 42) {
        playTickSound();
        lastSoundAt = timestamp;
      }
    }

    previousSector = sector;
    frameId = window.requestAnimationFrame(update);
  };

  frameId = window.requestAnimationFrame(update);

  return () => {
    stopped = true;
    window.cancelAnimationFrame(frameId);
    pointer.classList.remove("is-bouncing");
  };
}

function createConfetti() {
  celebration.replaceChildren();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reduceMotion ? 24 : 78;
  const colors = ["#FFD200", "#FFFFFF", "#111111", "#BDBDBD"];

  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${randomUnit() * 100}%`);
    piece.style.setProperty("--size", `${6 + randomUnit() * 8}px`);
    piece.style.setProperty("--color", colors[randomInteger(colors.length)]);
    piece.style.setProperty("--duration", `${1.8 + randomUnit() * 2.2}s`);
    piece.style.setProperty("--delay", `${randomUnit() * 0.75}s`);
    piece.style.setProperty("--drift", `${-90 + randomUnit() * 180}px`);
    piece.style.setProperty("--spin", `${360 + randomUnit() * 900}deg`);
    celebration.append(piece);
  }
}

function showResult(item) {
  window.clearTimeout(modalCloseTimer);
  resultImage.src = item.result;
  resultImage.alt = `${item.label} 결과 삽화`;
  resultOverlay.hidden = false;
  document.body.classList.add("has-modal");
  createConfetti();

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resultOverlay.classList.add("is-visible"));
  });

  statusMessage.textContent = `오늘의 선택 결과는 ${item.label}입니다.`;
  playResultSound();
}

function hideResult(immediate = false) {
  if (resultOverlay.hidden) return;

  window.clearTimeout(modalCloseTimer);
  resultOverlay.classList.remove("is-visible");
  document.body.classList.remove("has-modal");

  const finish = () => {
    resultOverlay.hidden = true;
    celebration.replaceChildren();
  };

  if (immediate) {
    finish();
  } else {
    modalCloseTimer = window.setTimeout(finish, 360);
  }
}

async function spinRoulette() {
  if (isSpinning || isShuffling) return;

  isSpinning = true;
  hideResult(true);
  setControlsDisabled(true);
  statusMessage.textContent = "룰렛이 회전하고 있습니다.";

  await ensureAudio();
  playStartSound();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduceMotion ? 1100 : 5200 + randomInteger(700);
  const targetSlot = randomInteger(items.length);
  const safeJitter = (randomUnit() - 0.5) * 24;
  const targetCenter = SECTOR_CENTERS[targetSlot] + safeJitter;
  const desiredRotation = (360 - targetCenter + 360) % 360;
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const alignment = (desiredRotation - normalizedCurrent + 360) % 360;
  const fullTurns = (reduceMotion ? 2 : 7 + randomInteger(3)) * 360;
  const finalRotation = currentRotation + fullTurns + alignment;
  const travel = finalRotation - currentRotation;

  startSpinSound(duration);
  const stopWatching = watchSectorBoundaries();

  const animation = wheel.animate(
    [
      {
        transform: `rotate(${currentRotation}deg)`,
        easing: "cubic-bezier(0.42, 0, 0.78, 0.58)",
      },
      {
        offset: 0.14,
        transform: `rotate(${currentRotation + travel * 0.09}deg)`,
        easing: "cubic-bezier(0.08, 0.72, 0.05, 1)",
      },
      { transform: `rotate(${finalRotation}deg)` },
    ],
    { duration, fill: "forwards" },
  );

  try {
    await animation.finished;
  } finally {
    stopWatching();
  }

  currentRotation = finalRotation;
  wheel.style.transform = `rotate(${currentRotation}deg)`;
  animation.cancel();

  isSpinning = false;
  setControlsDisabled(false);
  showResult(items[targetSlot]);
}

async function shuffleItems() {
  if (isSpinning || isShuffling) return;

  isShuffling = true;
  setControlsDisabled(true);
  wheel.classList.add("is-shuffling");

  await delay(210);

  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  renderItems();
  statusMessage.textContent = "룰렛 항목의 위치를 섞었습니다.";
  await delay(250);

  wheel.classList.remove("is-shuffling");
  isShuffling = false;
  setControlsDisabled(false);
}

function resetRoulette() {
  if (isSpinning || isShuffling) return;

  hideResult(true);
  items = INITIAL_ITEMS.map((item) => ({ ...item }));
  currentRotation = 0;
  wheel.getAnimations().forEach((animation) => animation.cancel());
  pointer.classList.remove("is-bouncing");
  wheel.classList.remove("is-shuffling");
  wheel.style.transform = "rotate(0deg)";
  renderItems();
  statusMessage.textContent = "룰렛을 처음 상태로 초기화했습니다.";
}

startButton.addEventListener("click", spinRoulette);
shuffleButton.addEventListener("click", shuffleItems);
resetButton.addEventListener("click", resetRoulette);
resultOverlay.addEventListener("click", hideResult);
resultDialog.addEventListener("click", hideResult);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !resultOverlay.hidden) hideResult();
});

renderItems();

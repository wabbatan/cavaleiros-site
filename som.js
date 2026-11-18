// Som do site: a música e os efeitos do próprio jogo.
// O navegador só deixa tocar som depois de um clique ou toque na página; até lá o botão mostra "Ligar som".
// A escolha de ligar ou desligar fica guardada no navegador de quem visita.

const PASTA = 'assets/som/';
const EFEITOS = ['pulo_a', 'pulo_b', 'queda_a', 'queda_b', 'torre', 'estrela', 'ovelha_a', 'ovelha_b', 'ovelha_c', 'dragao_passos', 'clique', 'trompete'];
// volumes iguais aos do jogo (KnightsAudio.cs)
const VOLUME = { queda_a: 0.75, queda_b: 0.75, torre: 0.7, estrela: 0.34, clique: 0.35, trompete: 0.9, dragao_passos: 0.85 };
const MUSICA = 0.32;

let ctx = null;
let mestre, musicaGanho, efeitosGanho;
const buffers = {};
let musicaFonte = null;
let querLigado = lerPreferencia();
let destravado = false;
const ouvintes = new Set();

function lerPreferencia() {
  try { return localStorage.getItem('cavaleiros_site_som') !== '0'; } catch { return true; }
}
function gravarPreferencia(v) {
  try { localStorage.setItem('cavaleiros_site_som', v ? '1' : '0'); } catch { /* sem armazenamento: tudo bem */ }
}

function criarContexto() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  mestre = ctx.createGain();
  mestre.gain.value = querLigado ? 1 : 0;
  mestre.connect(ctx.destination);
  musicaGanho = ctx.createGain();
  musicaGanho.gain.value = MUSICA;
  musicaGanho.connect(mestre);
  efeitosGanho = ctx.createGain();
  efeitosGanho.connect(mestre);
  carregarTudo();
}

async function carregar(nome) {
  try {
    const r = await fetch(PASTA + nome + '.mp3');
    buffers[nome] = await ctx.decodeAudioData(await r.arrayBuffer());
  } catch { /* sem esse som */ }
}

async function carregarTudo() {
  await carregar('musica');
  if (destravado) iniciarMusica();
  await Promise.all(EFEITOS.map(carregar));
}

// a música do jogo em laço, sem o silêncio que o MP3 põe no começo e no fim
function iniciarMusica() {
  const b = buffers.musica;
  if (!b || musicaFonte) return;
  const dados = b.getChannelData(0);
  let ini = 0, fim = dados.length - 1;
  while (ini < dados.length && Math.abs(dados[ini]) < 1e-4) ini++;
  while (fim > ini && Math.abs(dados[fim]) < 1e-4) fim--;
  musicaFonte = ctx.createBufferSource();
  musicaFonte.buffer = b;
  musicaFonte.loop = true;
  musicaFonte.loopStart = ini / b.sampleRate;
  musicaFonte.loopEnd = (fim + 1) / b.sampleRate;
  musicaFonte.connect(musicaGanho);
  musicaGanho.gain.setValueAtTime(0, ctx.currentTime);
  musicaGanho.gain.linearRampToValueAtTime(MUSICA, ctx.currentTime + 1.5);
  musicaFonte.start(0, musicaFonte.loopStart);
}

function destravar() {
  criarContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!destravado) {
    destravado = true;
    iniciarMusica();
    avisar();
  }
}

function avisar() { ouvintes.forEach((f) => f(estado())); }

export function estado() {
  return { ligado: querLigado && destravado, querLigado, destravado };
}

export function aoMudar(f) { ouvintes.add(f); f(estado()); }

export function alternar() {
  if (!destravado) { querLigado = true; gravarPreferencia(true); destravar(); }
  else { querLigado = !querLigado; gravarPreferencia(querLigado); }
  if (mestre) mestre.gain.setTargetAtTime(querLigado ? 1 : 0, ctx.currentTime, 0.08);
  avisar();
}

// toca um efeito; variar = muda um pouco o tom, como o jogo faz nos pulos e quedas
export function tocar(nome, { variar = false, volume = 1 } = {}) {
  if (!ctx || !destravado || !querLigado || ctx.state !== 'running') return;
  const b = buffers[nome];
  if (!b) return;
  const fonte = ctx.createBufferSource();
  fonte.buffer = b;
  if (variar) fonte.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = ctx.createGain();
  g.gain.value = (VOLUME[nome] ?? 0.8) * volume;
  fonte.connect(g).connect(efeitosGanho);
  fonte.start();
}

export const sortear = (...nomes) => nomes[Math.floor(Math.random() * nomes.length)];

// o primeiro clique, toque ou tecla em qualquer lugar da página liga o som (se a pessoa não o desligou antes)
function primeiroGesto(e) {
  if (e.target.closest?.('[data-som]')) return; // o próprio botão de som cuida disso
  if (!querLigado) return;
  destravar();
  // só para de escutar quando o som de fato começou (no iPhone o primeiro toque às vezes não basta)
  if (ctx && ctx.state === 'running') GESTOS.forEach((t) => window.removeEventListener(t, primeiroGesto, true));
}
// no iPhone o som só destrava no fim do toque (touchend/click), por isso escuta os quatro
const GESTOS = ['pointerdown', 'touchend', 'click', 'keydown'];
GESTOS.forEach((t) => window.addEventListener(t, primeiroGesto, true));
criarContexto();

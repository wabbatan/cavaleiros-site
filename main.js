// Esboço A: voo sobre a ilha.
// A ilha do jogo vira um diorama 3D; a rolagem leva a câmera de cima da ilha até o tabuleiro,
// depois ao castelo e acima das nuvens. Os sprites do jogo ficam de pé, sempre virados para a câmera.
import * as THREE from 'three';
import { montarBotoesLoja, montarRodape, movimentoReduzido } from './comum.js';
import { INSTAGRAM, INSTAGRAM_ESTUDIO, ESTUDIO } from './config.js';
import * as som from './som.js';

/* ---------------- Página ---------------- */
document.querySelectorAll('[data-lojas]').forEach(montarBotoesLoja);
montarRodape(document.getElementById('rodape'));
document.querySelectorAll('[data-instagram]').forEach((a) => { a.href = INSTAGRAM; });
document.querySelectorAll('[data-estudio]').forEach((a) => {
  a.href = INSTAGRAM_ESTUDIO || ESTUDIO;
  a.target = '_blank';
  a.rel = 'noopener';
});

const topo = document.querySelector('.topo');

const botaoSom = document.querySelector('[data-som]');
botaoSom.addEventListener('click', () => som.alternar());
som.aoMudar(({ ligado }) => {
  botaoSom.setAttribute('aria-pressed', String(ligado));
  botaoSom.querySelector('span').textContent = ligado ? 'Som' : 'Ligar som';
});
const carregando = document.getElementById('carregando');
const regras = [...document.querySelectorAll('.regras li')];

const dialogo = document.getElementById('tela-grande');
document.querySelectorAll('.galeria button').forEach((b) => b.addEventListener('click', () => {
  const img = b.querySelector('img');
  const grande = dialogo.querySelector('img');
  grande.src = img.src;
  grande.alt = img.alt;
  dialogo.showModal();
}));
dialogo.querySelector('.fechar').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });

const video = document.querySelector('.celular video');
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) video.play().catch(() => {});
  else video.pause();
}, { threshold: 0.3 }).observe(video);

/* ---------------- 3D ---------------- */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('cena'), antialias: true });
} catch (erro) {
  document.body.classList.add('sem-3d');
  carregando.classList.add('saiu');
}
if (renderer) iniciar3D(renderer);

function iniciar3D(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const cena = new THREE.Scene();
  const CEU = new THREE.Color('#a9dedb');
  cena.background = CEU;
  cena.fog = new THREE.Fog(CEU, 70, 170);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
  Object.assign(window, { renderer, cena, camera });

  /* ----- Texturas ----- */
  const gerente = new THREE.LoadingManager();
  const carregador = new THREE.TextureLoader(gerente);
  const SPR = 'assets/sprites/';
  const tex = {};
  const NOMES = [
    'torre_vazia', 'torre_conquistada', 'torre_vazia_frente', 'torre_conquistada_frente', 'pedra_1', 'pedra_musgo', 'barco',
    'nuvem_1', 'nuvem_2', 'nuvem_3',
    'ovelha_parada', 'ovelha_pastando', 'ovelha_andando_1', 'ovelha_andando_2', 'ovelha_andando_3', 'ovelha_andando_4',
    'dragao_lado_andando_1', 'dragao_lado_andando_2', 'dragao_lado_deitado', 'dragao_lado_fumaca',
  ];
  for (const cor of ['azul', 'vermelho', 'amarelo', 'roxo']) {
    for (const pose of ['parado', 'pulando', 'agachado', 'comemorando']) NOMES.push(`cavaleiro_${cor}_${pose}`);
  }
  for (let i = 1; i <= 6; i++) NOMES.push(`cavaleiro_roxo_andando_${i}`);

  const anis = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function carregar(nome, caminho) {
    const t = carregador.load(caminho);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anis;
    t.magFilter = THREE.NearestFilter; // ampliado, o pixel fica nítido
    tex[nome] = t;
  }
  NOMES.forEach((n) => carregar(n, `${SPR}${n}.webp`));
  carregar('ilha', 'assets/ilha.webp');

  // texturas desenhadas aqui: poeirinha do pouso e moldura de destaque de casa
  tex.poeira = texturaPixel(12, (g) => {
    g.fillStyle = '#fff6e2';
    [[4, 1, 4, 1], [2, 2, 8, 2], [1, 4, 10, 4], [2, 8, 8, 2], [4, 10, 4, 1]].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
  });
  tex.moldura = texturaPixel(16, (g) => {
    g.fillStyle = '#f2b630';
    g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16);
  });

  /* ----- Mar ----- */
  const nevoa = { uNevoa: { value: CEU }, uPerto: { value: cena.fog.near }, uLonge: { value: cena.fog.far } };
  const marMat = new THREE.ShaderMaterial({
    uniforms: {
      uTempo: { value: 0 },
      uFundo: { value: new THREE.Color('#3f949e') },
      uEscuro: { value: new THREE.Color('#2f8190') },
      uClaro: { value: new THREE.Color('#4fa6a2') },
      uEspuma: { value: new THREE.Color('#e3f6f1') },
      ...nevoa,
    },
    vertexShader: /* glsl */`
      varying vec2 vMundo; varying float vDist;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vMundo = w.xz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTempo; uniform vec3 uFundo, uEscuro, uClaro, uEspuma, uNevoa; uniform float uPerto, uLonge;
      varying vec2 vMundo; varying float vDist;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float px = 0.1;
        vec2 p = floor(vMundo / px) * px;
        float t = uTempo;
        float n = 0.5 * sin(p.x * 0.33 + t * 0.22) + 0.5 * sin(p.y * 0.41 - t * 0.18 + p.x * 0.12);
        vec3 c = mix(uEscuro, uFundo, smoothstep(-0.9, 0.1, n));
        c = mix(c, uClaro, smoothstep(0.45, 1.0, n) * 0.7);
        // tracinhos de onda que aparecem e somem, como na arte da ilha
        vec2 q = p + vec2(t * 0.12, 0.0);
        vec2 tam = vec2(2.6, 1.1);
        vec2 cel = floor(q / tam);
        vec2 l = fract(q / tam);
        float h = hash(cel);
        float curva = 0.5 + 0.12 * sin(l.x * 6.2832 + h * 6.0);
        float onda = step(0.45, h) * step(abs(l.y - curva), 0.045) * step(0.12, l.x) * step(l.x, 0.18 + 0.45 * h);
        onda *= smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(t * 0.7 + h * 40.0));
        c = mix(c, uEspuma, onda * 0.6);
        gl_FragColor = vec4(mix(c, uNevoa, smoothstep(uPerto, uLonge, vDist)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), marMat);
  mar.rotation.x = -Math.PI / 2;
  mar.position.y = -0.06;
  mar.renderOrder = 0;
  cena.add(mar);

  /* ----- Ilha (a arte do jogo, com as bordas se misturando ao mar) ----- */
  const ILHA_L = 15.36, ILHA_A = 27.52; // 1 unidade = 100 px da arte
  const ilhaMat = new THREE.ShaderMaterial({
    uniforms: { uMapa: { value: tex.ilha }, ...nevoa },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vDist;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMapa; uniform vec3 uNevoa; uniform float uPerto, uLonge;
      varying vec2 vUv; varying float vDist;
      void main() {
        vec4 c = texture2D(uMapa, vUv);
        // o mar pintado na arte vira transparente, para o mar animado aparecer até o pé das pedras
        vec3 s = pow(c.rgb, vec3(1.0 / 2.2)) * 255.0; // de volta ao sRGB para comparar com as cores da arte
        float azulado = min(s.g, s.b) - s.r;
        float terra = 1.0 - smoothstep(42.0, 66.0, azulado);
        float bx = smoothstep(0.0, 0.035, min(vUv.x, 1.0 - vUv.x));
        float by = smoothstep(0.0, 0.1, min(vUv.y, 1.0 - vUv.y));
        gl_FragColor = vec4(mix(c.rgb, uNevoa, smoothstep(uPerto, uLonge, vDist)), terra * bx * by);
        #include <colorspace_fragment>
      }`,
  });
  const ilha = new THREE.Mesh(new THREE.PlaneGeometry(ILHA_L, ILHA_A), ilhaMat);
  ilha.rotation.x = -Math.PI / 2;
  ilha.renderOrder = 1;
  cena.add(ilha);

  // centro de cada casa do tabuleiro pintado na arte (coluna, linha; linha 0 = em cima)
  const casa = (c, l) => new THREE.Vector3(-2.025 + c * 1.01, 0, -1.962 + l * 0.996);
  const TORRES = [[0, 0], [4, 0], [2, 2], [0, 4], [4, 4]];
  const ehTorre = (c, l) => TORRES.some(([x, y]) => x === c && y === l);

  /* ----- Sprites de pé (billboards) ----- */
  const DENSIDADE = [
    [/^cavaleiro_.*_andando/, 1 / 529], [/^cavaleiro_/, 1 / 360],
    [/^ovelha_andando/, 0.78 / 360], [/^ovelha_/, 0.78 / 271],
    [/^dragao_lado/, 1.9 / 770], [/^torre_/, 1.4 / 520],
    [/^pedra/, 0.62 / 245], [/^barco/, 0.9 / 133], [/^poeira/, 0.5 / 12], [/^nuvem/, 1 / 70],
  ];
  const densidade = (nome) => (DENSIDADE.find(([r]) => r.test(nome)) || [0, 1 / 300])[1];
  const viradas = []; // tudo que encara a câmera

  class Boneco {
    constructor(nome, pai, { escala = 1, transparente = false } = {}) {
      this.mat = new THREE.MeshBasicMaterial({ map: tex[nome], alphaTest: transparente ? 0.02 : 0.5, transparent: transparente, depthWrite: !transparente, side: THREE.DoubleSide });
      this.malha = new THREE.Mesh(BASE, this.mat);
      this.escala = escala;
      this.pop = 1;
      this.virado = 1; // 1 = para a direita, -1 = espelhado
      this.nome = '';
      this.trocar(nome);
      pai.add(this.malha);
      viradas.push(this.malha);
    }
    trocar(nome) {
      if (nome === this.nome) return;
      this.nome = nome;
      this.mat.map = tex[nome];
      const img = tex[nome].image;
      if (!img) { this.l = this.a = 0.001; this.aplicarEscala(); return; } // ainda carregando
      const d = densidade(nome) * this.escala;
      this.l = img.width * d;
      this.a = img.height * d;
      this.aplicarEscala();
    }
    aplicarEscala() {
      const p = Math.max(this.pop, 0.0001) * (this.fator ?? 1);
      this.malha.scale.set(this.l * this.virado * p, this.a * p, 1);
    }
    em(v, altura = 0) {
      this.malha.position.set(v.x, 0.02 + altura, v.z + 0.32);
      return this;
    }
  }
  const BASE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

  /* ----- Grupos que aparecem e somem conforme a seção ----- */
  const grupos = {};
  function grupo(nome) {
    const g = new THREE.Group();
    g.userData = { alvo: 0, pop: 0, bonecos: [] };
    cena.add(g);
    grupos[nome] = g;
    return g;
  }
  function boneco(g, nome, c, l, opcoes) {
    const b = new Boneco(nome, g, opcoes).em(casa(c, l));
    g.userData.bonecos.push(b);
    return b;
  }

  // Torres vazias fixas (somem só na vitória, que tem as suas)
  const gTorres = grupo('torres');
  const torres = TORRES.map(([c, l]) => boneco(gTorres, 'torre_vazia', c, l));
  // frente da torre (parede e ameias da frente), desenhada na frente do cavaleiro que está dentro, como no jogo
  const torresFrente = TORRES.map(([c, l]) => boneco(gTorres, 'torre_vazia_frente', c, l));
  function trocarTorre(i, conquistada) {
    torres[i].trocar(conquistada ? 'torre_conquistada' : 'torre_vazia');
    torresFrente[i].trocar(conquistada ? 'torre_conquistada_frente' : 'torre_vazia_frente');
  }

  // Fase parada, como uma fase esperando o jogador
  const gFase = grupo('fase');
  boneco(gFase, 'cavaleiro_azul_parado', 1, 0);
  boneco(gFase, 'cavaleiro_vermelho_parado', 3, 4).virado = -1;
  boneco(gFase, 'cavaleiro_amarelo_parado', 4, 2).virado = -1;
  boneco(gFase, 'ovelha_parada', 2, 1);
  boneco(gFase, 'pedra_1', 1, 3);
  const dragaoFase = new Boneco('dragao_lado_andando_1', gFase);
  dragaoFase.malha.position.copy(casa(2.5, 3)).add(new THREE.Vector3(0, 0.02, 0.32));
  gFase.userData.bonecos.push(dragaoFase);

  // Vitória: torres conquistadas e cavaleiros comemorando
  const gVitoria = grupo('vitoria');
  TORRES.forEach(([c, l]) => boneco(gVitoria, 'torre_conquistada', c, l));
  const festa = [['azul', 1, 1], ['vermelho', 3, 1], ['amarelo', 1, 3], ['roxo', 3, 3]]
    .map(([cor, c, l], i) => ({ b: boneco(gVitoria, `cavaleiro_${cor}_comemorando`, c, l), fase: i * 0.7, c, l }));
  festa[1].b.virado = -1; festa[3].b.virado = -1;

  /* ----- Demonstrações das regras (uma por regra, em laço) ----- */
  // Cada demo tem peças e uma lista de lances. Um lance leva DUR_MOV segundos e depois espera DUR_ESPERA.
  const DUR_MOV = 0.8, DUR_ESPERA = 0.9;
  // cavaleiro dentro da torre: os pés ficam logo abaixo das ameias da frente, as pernas aparecem
  const DENTRO = 0.78;
  const cimaCam = new THREE.Vector3(0, 1, 0), paraCam = new THREE.Vector3(0, 0, 1), paraTorre = new THREE.Vector3();
  // o pulo passa por cima de alguma torre (só dá para pular torre ocupada)?
  function passaPorTorre([c1, l1], [c2, l2]) {
    const passos = Math.max(Math.abs(c2 - c1), Math.abs(l2 - l1));
    for (let k = 1; k < passos; k++) {
      if (ehTorre(c1 + Math.sign(c2 - c1) * k, l1 + Math.sign(l2 - l1) * k)) return true;
    }
    return false;
  }
  const demos = [];
  function demo(pecas, lances, destaques = []) {
    const g = grupo(`demo${demos.length}`);
    const ps = pecas.map(([nome, c, l, tipo]) => {
      const inicial = tipo === 'cav' ? `${nome}_parado` : tipo === 'drag' ? `${nome}_andando_1` : nome;
      const b = boneco(g, inicial, c, l);
      return { b, base: nome, tipo, inicio: [c, l] };
    });
    const molduras = destaques.map(([c, l]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ map: tex.moldura, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(casa(c, l)).setY(0.03);
      g.add(m);
      return m;
    });
    const poeira = new Boneco('poeira', g, { transparente: true });
    poeira.pop = 0; poeira.aplicarEscala();
    const d = { g, ps, lances, molduras, poeira };
    demos.push(d);
    return d;
  }

  // (as torres escondem a casa logo atrás delas, por isso as demos evitam (2,1), (0,3) e (4,3))
  // Regra 0: cavaleiro pula por cima de ovelha e pedra, ida e volta
  demo(
    [['cavaleiro_azul', 1, 4, 'cav'], ['ovelha_parada', 1, 3], ['pedra_1', 1, 2]],
    [{ p: 0, para: [1, 1] }, { p: 0, para: [1, 4] }],
  );
  // Regra 1: o dragão desliza e abre caminho; o cavaleiro pula ovelha e dragão, volta, e o dragão volta
  demo(
    [['dragao_lado', 1.5, 3, 'drag'], ['cavaleiro_vermelho', 3, 1, 'cav'], ['ovelha_parada', 3, 2]],
    [{ p: 0, para: [2.5, 3] }, { p: 1, para: [3, 4] }, { p: 1, para: [3, 1] }, { p: 0, para: [1.5, 3] }],
  );
  // Regra 2: ovelha e pedra ficam onde estão, mesmo com o cavaleiro pulando por cima
  demo(
    [['cavaleiro_amarelo', 1, 0, 'cav'], ['ovelha_pastando', 1, 1], ['pedra_musgo', 3, 3], ['cavaleiro_roxo', 3, 4, 'cav']],
    [{ p: 0, para: [1, 2] }, { p: 3, para: [3, 2] }, { p: 0, para: [1, 0] }, { p: 3, para: [3, 4] }],
    [[1, 1], [3, 3]],
  );
  // Regra 3: entra na torre, a torre vira peça, o outro pula por cima dela e da ovelha
  demo(
    [['cavaleiro_amarelo', 0, 2, 'cav'], ['ovelha_parada', 1, 2], ['cavaleiro_vermelho', 3, 2, 'cav']],
    [{ p: 0, para: [2, 2] }, { p: 2, para: [0, 2] }, { p: 2, para: [3, 2] }, { p: 0, para: [0, 2] }],
  );

  // t = segundos desde o começo da animação; negativo = as peças acabaram de aparecer e ainda esperam paradas
  function animarDemo(d, t) {
    const passo = DUR_MOV + DUR_ESPERA;
    const total = d.lances.length * passo;
    const antes = t < 0;
    const tc = Math.max(0, t);
    const ciclo = Math.floor(tc / total);
    const tt = tc - ciclo * total;
    const atual = Math.floor(tt / passo);
    const local = tt - atual * passo;
    const f = antes ? 0 : Math.min(1, local / DUR_MOV); // 0..1 dentro do movimento
    const movendo = !antes && f < 1;
    const desde = local - DUR_MOV; // tempo desde que pousou

    // posições no começo do lance atual
    const pos = d.ps.map((p) => [...p.inicio]);
    const dir = d.ps.map(() => 1);
    for (let i = 0; i < atual; i++) {
      const { p, para } = d.lances[i];
      if (para[0] !== pos[p][0]) dir[p] = Math.sign(para[0] - pos[p][0]);
      pos[p] = [...para];
    }
    const lance = d.lances[atual];
    const ocupadas = new Set();
    d.poeira.mat.opacity = 0;
    d.ps.forEach((peca, i) => {
      let [c, l] = pos[i];
      let subida = 0; // altura ao longo do "para cima" da câmera (o sprite sobe na tela)
      let pose = peca.tipo === 'drag' ? 'andando_1' : 'parado';
      const ehLance = !antes && i === lance.p;
      const deTorre = peca.tipo === 'cav' && ehTorre(c, l);
      if (ehLance) {
        const [c2, l2] = lance.para;
        if (c2 !== c) dir[i] = Math.sign(c2 - c);
        const e = movendo ? suave(f) : 1;
        if (peca.tipo === 'cav') {
          // dentro da torre o cavaleiro fica de pé lá em cima; por cima de uma torre ocupada o pulo é mais alto
          const s0 = deTorre ? DENTRO : 0;
          const s1 = ehTorre(c2, l2) ? DENTRO : 0;
          const arco = passaPorTorre([c, l], [c2, l2]) ? 2.1 : 1.3;
          subida = movendo ? s0 + (s1 - s0) * e + Math.sin(Math.PI * f) * arco : s1;
          pose = movendo ? 'pulando' : (desde < 0.14 ? 'agachado' : 'parado');
        } else if (peca.tipo === 'drag' && movendo) {
          pose = Math.floor(tt * 8) % 2 ? 'andando_2' : 'andando_1';
        }
        c += (c2 - c) * e;
        l += (l2 - l) * e;
        // poeirinha quando o cavaleiro pousa no chão
        if (peca.tipo === 'cav' && !movendo && desde < 0.5 && !ehTorre(c2, l2)) {
          const k = desde / 0.5;
          d.poeira.pop = 1 + k * 0.8;
          d.poeira.mat.opacity = 1 - k;
          d.poeira.em(casa(c2, l2));
          d.poeira.malha.position.z += 0.1;
        }
      } else if (deTorre) {
        subida = DENTRO;
      }
      const nome = peca.tipo === 'cav' || peca.tipo === 'drag' ? `${peca.base}_${pose}` : peca.base;
      peca.b.trocar(nome);
      peca.b.virado = dir[i];
      const naTorre = peca.tipo === 'cav' && !(ehLance && movendo) && Number.isInteger(c) && Number.isInteger(l) && ehTorre(c, l);
      if (naTorre) ocupadas.add(`${c},${l}`);

      // posição: base da casa + subida na direção "para cima" da câmera
      const base = casa(c, l).add(new THREE.Vector3(0, 0.02, 0.32));
      const torre = TORRES.find(([x, y]) => Math.hypot(c - x, l - y) < 0.45);
      const m = peca.b.malha.position.copy(base).addScaledVector(cimaCam, subida);
      // perto da torre o cavaleiro fica entre o fundo da torre e a frente dela
      if (peca.tipo === 'cav' && torre) m.addScaledVector(paraCam, 0.08);
    });
    d.torresOcupadas = ocupadas;
    d.poeira.aplicarEscala();
    d.molduras.forEach((m) => { m.material.opacity = 0.55 + 0.45 * Math.sin(tc * 5); });

    // sons: pulo quando sai do chão, queda quando pousa, torre e estrela quando entra na torre
    if (!antes) {
      const chave = `${ciclo}:${atual}:${movendo ? 'm' : 'p'}`;
      if (chave !== d.chaveSom) {
        d.chaveSom = chave;
        const peca = d.ps[lance.p];
        if (movendo) {
          if (peca.tipo === 'cav') som.tocar(som.sortear('pulo_a', 'pulo_b'), { variar: true });
          else if (peca.tipo === 'drag') som.tocar('dragao_passos');
        } else if (peca.tipo === 'cav') {
          som.tocar(som.sortear('queda_a', 'queda_b'), { variar: true });
          if (ehTorre(...lance.para)) {
            setTimeout(() => som.tocar('torre'), 120);
            setTimeout(() => som.tocar('estrela'), 380);
          }
        }
      }
    }
  }

  /* ----- Vida na ilha (sempre animada) ----- */
  const gVida = grupo('vida');
  gVida.userData.alvo = 1;
  const pos = (x, z) => new THREE.Vector3(x, 0, z);
  const dragaoSoneca = new Boneco('dragao_lado_deitado', gVida).em(pos(1.9, -7.4));
  const barco = new Boneco('barco', gVida).em(pos(6.3, -6.3));
  const ovelhaPasseio = { b: new Boneco('ovelha_andando_1', gVida), de: pos(2.9, 2.2), ate: pos(4.9, 2.2), vel: 0.35, x: 0, ida: 1 };
  const cavPasseio = { b: new Boneco('cavaleiro_roxo_andando_1', gVida), de: pos(-2.6, 4.75), ate: pos(0.4, 4.75), vel: 0.6, x: 0, ida: 1 };
  [dragaoSoneca, barco, ovelhaPasseio.b, cavPasseio.b].forEach((b) => gVida.userData.bonecos.push(b));

  function passear(p, dt, quadros, prefixo, fps) {
    const dist = p.de.distanceTo(p.ate);
    p.x += p.ida * p.vel * dt / dist;
    if (p.x > 1) { p.x = 1; p.ida = -1; }
    if (p.x < 0) { p.x = 0; p.ida = 1; }
    const v = p.de.clone().lerp(p.ate, p.x);
    p.b.trocar(`${prefixo}${1 + Math.floor(relogio * fps) % quadros}`);
    p.b.virado = p.ida;
    p.b.em(v);
  }

  /* ----- Nuvens e suas sombras ----- */
  const nuvens = [];
  const sombraMat = (t) => new THREE.MeshBasicMaterial({ map: t, color: 0x0d4450, transparent: true, opacity: 0.16, depthWrite: false });
  // nuvens baixas: sempre ali, em volta da ilha, com sombra no chão
  const BAIXAS = [
    [-13, 6, -9], [-9, 7, 9], [10, 6, -13], [13, 7.5, 5], [-16, 6.5, 0], [5, 8, 16], [16, 5.5, -4], [-4, 8.5, -17],
  ];
  BAIXAS.forEach(([x, y, z], i) => {
    const nome = `nuvem_${1 + (i % 3)}`;
    const b = new Boneco(nome, cena, { escala: 0.55 + (i % 3) * 0.15 });
    b.malha.position.set(x, y, z);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sombraMat(tex[nome]));
    sombra.rotation.x = -Math.PI / 2;
    sombra.renderOrder = 2;
    cena.add(sombra);
    nuvens.push({ b, sombra, vel: 0.22 + (i % 4) * 0.07 });
  });

  /* ----- Câmera guiada pela rolagem ----- */
  // Uma parada por seção: posição da câmera e ponto para onde ela olha.
  const PARADAS = [
    { pos: [-6.2, 31, 6], alvo: [-6.2, 0, 0.8] }, // herói: a ilha inteira de cima, à direita do texto
    { pos: [3.2, 13.5, 15.5], alvo: [-3.3, 0, -2.2] }, // o jogo: ilha em 3/4 vista do sul
    { pos: [1.1, 8.6, 6.6], alvo: [-1.9, 0, -0.2] }, // como jogar: perto do tabuleiro
    { pos: [-1.5, 6.5, 1.2], alvo: [1.0, 0.6, -8.5] }, // trailer: voa até o castelo
    { pos: [5.5, 27, 12], alvo: [3.5, 0, -1.5] }, // estúdio: bem alto, a ilha pequena lá embaixo
    { pos: [0, 17, 9], alvo: [0, 0, -2.6] }, // final: o tabuleiro em festa, abaixo do texto
  ].map((p) => ({ pos: new THREE.Vector3(...p.pos), alvo: new THREE.Vector3(...p.alvo) }));
  // celular em pé: a ilha centralizada; o assunto fica na parte da tela que os painéis deixam livre
  const PARADAS_RETRATO = [
    { pos: [0, 34, 3], alvo: [0, 0, -10.5] }, // herói: texto em cima, a ilha aparece embaixo
    { pos: [2, 15, 14], alvo: [0, 0, -3] }, // o jogo
    { pos: [0, 12, 8.4], alvo: [0, 0, 1.7] }, // como jogar: o tabuleiro em cima do cartão das regras
    { pos: [0, 9, 2], alvo: [0, 0.5, -8.5] }, // trailer: o castelo
    { pos: [1, 30, 11], alvo: [0.5, 0, -1] }, // estúdio
    { pos: [0, 16, 11], alvo: [0, 0, -2.8] }, // final: o pergaminho em cima, a festa embaixo
  ].map((p) => ({ pos: new THREE.Vector3(...p.pos), alvo: new THREE.Vector3(...p.alvo) }));
  let retrato = false;
  let P = PARADAS;
  function ajustarFormato() {
    retrato = window.innerWidth / window.innerHeight < 0.85;
    P = retrato ? PARADAS_RETRATO : PARADAS;
    camera.fov = retrato ? 50 : 38; // em pé a tela é estreita: abre mais o ângulo para caber o tabuleiro
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  ajustarFormato();

  const secoes = [...document.querySelectorAll('[data-camera]')];
  const comoJogar = document.getElementById('como-jogar');
  let chaves = [];
  let cjInicio = 0, cjTamanho = 1;
  function medir() {
    const vh = window.innerHeight;
    chaves = secoes.map((s, i) => (i === 0 ? 0 : s.offsetTop - vh * 0.3));
    cjInicio = comoJogar.offsetTop - vh * 0.3;
    cjTamanho = comoJogar.offsetHeight - vh * 0.9;
  }
  medir();

  const camPos = P[0].pos.clone();
  const camAlvo = P[0].alvo.clone();
  const alvoPos = new THREE.Vector3();
  const alvoOlhar = new THREE.Vector3();
  let paradaAtiva = 0;
  let regraAtiva = 0;

  function lerRolagem() {
    medir(); // barato, e acompanha qualquer mudança de layout (fontes, imagens, tamanho da janela)
    const s = window.scrollY;
    let i = 0;
    while (i < chaves.length - 1 && s >= chaves[i + 1]) i++;
    let e = 0;
    if (i < chaves.length - 1) {
      // a câmera fica parada no começo de cada seção (data-segura) e só depois voa para a próxima
      const segura = parseFloat(secoes[i].dataset.segura || '0.35');
      const u = (s - chaves[i]) / (chaves[i + 1] - chaves[i]);
      e = suave(Math.min(1, Math.max(0, (u - segura) / (1 - segura))));
    }
    const j = Math.min(i + 1, P.length - 1);
    alvoPos.copy(P[i].pos).lerp(P[j].pos, e);
    alvoOlhar.copy(P[i].alvo).lerp(P[j].alvo, e);
    if (movimentoReduzido) {
      const k = e < 0.5 ? i : j;
      alvoPos.copy(P[k].pos);
      alvoOlhar.copy(P[k].alvo);
    }
    paradaAtiva = e < 0.5 ? i : j;

    // regra em destaque dentro de "Como jogar"
    const vh = window.innerHeight;
    const u = (s - cjInicio) / cjTamanho;
    regraAtiva = Math.min(3, Math.max(0, Math.floor(u * 4)));
    regras.forEach((li, k) => li.classList.toggle('ativa', k === regraAtiva));
    topo.classList.toggle('rolou', s > vh * 0.6);
  }

  /* ----- Laço ----- */
  const timer = new THREE.Timer();
  timer.connect(document);
  let relogio = 0;
  let pronto = false;

  gerente.onLoad = () => { pronto = true; montarDepoisDeCarregar(); carregando.classList.add('saiu'); };
  gerente.onError = () => { carregando.classList.add('saiu'); };

  function montarDepoisDeCarregar() {
    // os Bonecos foram criados antes das imagens chegarem; agora ajusta os tamanhos
    Object.values(grupos).forEach((g) => g.userData.bonecos.forEach((b) => { const n = b.nome; b.nome = ''; b.trocar(n); }));
    nuvens.forEach(({ b }) => { const n = b.nome; b.nome = ''; b.trocar(n); });
    medir();
    lerRolagem();
    camPos.copy(alvoPos);
    camAlvo.copy(alvoOlhar);
  }

  // qual conteúdo o tabuleiro deve mostrar agora
  let conteudoMostrado = 'fase';
  let inicioAnim = 0;
  let proximoBalido = 0;
  const ESPERA_ANIM = 1.0;
  gFase.userData.alvo = 1;
  gTorres.userData.alvo = 1;
  function conteudoQuerido() {
    if (paradaAtiva === 2) return `demo${regraAtiva}`;
    if (paradaAtiva === 5) return 'vitoria';
    return 'fase';
  }
  function entrouConteudo(nome) {
    if (nome.startsWith('demo')) {
      demos[+nome.slice(4)].chaveSom = undefined;
      som.tocar('clique');
      proximoBalido = relogio + 1.2; // a ovelha da regra dela bale logo que aparece
    } else if (nome === 'vitoria') {
      som.tocar('trompete');
      [900, 1250, 1600].forEach((ms) => setTimeout(() => som.tocar('estrela'), ms));
    }
  }

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
    if (!pronto) return;
    relogio += movimentoReduzido ? 0 : dt;

    lerRolagem();
    const k = movimentoReduzido ? 1 : 1 - Math.exp(-dt * 3.2);
    camPos.lerp(alvoPos, k);
    camAlvo.lerp(alvoOlhar, k);
    camera.position.copy(camPos);
    camera.lookAt(camAlvo);
    cimaCam.set(0, 1, 0).applyQuaternion(camera.quaternion);
    paraCam.set(0, 0, 1).applyQuaternion(camera.quaternion);

    marMat.uniforms.uTempo.value = relogio;

    // Conteúdo do tabuleiro: um de cada vez. Na troca, o que está lá some inteiro, o novo aparece,
    // e a animação só começa ESPERA_ANIM segundos depois de as peças surgirem.
    const querido = conteudoQuerido();
    if (conteudoMostrado !== querido) {
      const velho = grupos[conteudoMostrado];
      if (velho) velho.userData.alvo = 0;
      if (!velho || velho.userData.pop < 0.03) {
        conteudoMostrado = querido;
        grupos[querido].userData.alvo = 1;
        inicioAnim = relogio + 0.45 + ESPERA_ANIM;
        entrouConteudo(querido);
      }
    }
    grupos.torres.userData.alvo = conteudoMostrado === 'vitoria' || querido === 'vitoria' ? 0 : 1;
    const rapidez = movimentoReduzido ? 1 : 1 - Math.exp(-dt * 9);
    Object.entries(grupos).forEach(([nome, g]) => {
      if (nome === 'vida') return;
      g.userData.pop += (g.userData.alvo - g.userData.pop) * rapidez;
      const p = g.userData.alvo ? elastico(g.userData.pop) : g.userData.pop;
      g.visible = g.userData.pop > 0.01;
      g.userData.bonecos.forEach((b) => { b.pop = b.escondido ? 0 : p; b.aplicarEscala(); });
    });

    // demonstração da regra que está no tabuleiro
    const d = conteudoMostrado.startsWith('demo') ? demos[+conteudoMostrado.slice(4)] : null;
    if (d) {
      animarDemo(d, relogio - inicioAnim);
      TORRES.forEach(([c, l], i) => trocarTorre(i, d.torresOcupadas.has(`${c},${l}`)));
      // a ovelha bale de vez em quando na regra dela
      if (conteudoMostrado === 'demo2' && relogio > proximoBalido) {
        som.tocar(som.sortear('ovelha_a', 'ovelha_b', 'ovelha_c'));
        proximoBalido = relogio + 4 + Math.random() * 3;
      }
    } else {
      TORRES.forEach((_, i) => trocarTorre(i, false));
    }

    // festa da vitória
    festa.forEach((f) => {
      const pulo = Math.max(0, Math.sin(relogio * 5 + f.fase)) * 0.35;
      f.b.em(casa(f.c, f.l), pulo);
    });

    // vida na ilha
    passear(ovelhaPasseio, dt, 4, 'ovelha_andando_', 6);
    passear(cavPasseio, dt, 6, 'cavaleiro_roxo_andando_', 9);
    dragaoSoneca.trocar(relogio % 7 > 5.8 ? 'dragao_lado_fumaca' : 'dragao_lado_deitado');
    barco.malha.position.y = 0.04 + Math.sin(relogio * 1.6) * 0.04;
    barco.malha.rotation.z = Math.sin(relogio * 1.3) * 0.05;

    // nuvens andando com as sombras no chão
    nuvens.forEach((n) => {
      const p = n.b.malha.position;
      p.x += n.vel * dt;
      if (p.x > 26) p.x = -26;
      n.sombra.position.set(p.x + p.y * 0.12, 0.04, p.z + p.y * 0.18);
      n.sombra.scale.set(n.b.l, n.b.a * 0.9, 1);
    });

    // a frente vem 0,16 na direção da câmera e encolhe na mesma proporção: na tela fica exatamente em cima da torre
    torresFrente.forEach((fb, i) => {
      const p = torres[i].malha.position;
      const raio = paraTorre.subVectors(camera.position, p);
      const dist = raio.length();
      fb.malha.position.copy(p).addScaledVector(raio, 0.16 / dist);
      fb.fator = (dist - 0.16) / dist;
      fb.aplicarEscala();
    });

    // tudo que é sprite encara a câmera
    viradas.forEach((m) => m.quaternion.copy(camera.quaternion));

    renderer.render(cena, camera);
  });

  window.addEventListener('resize', () => {
    ajustarFormato();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    medir();
  });
}

/* ---------------- utilidades ---------------- */
function suave(x) { return x * x * (3 - 2 * x); }
function elastico(x) {
  if (x <= 0 || x >= 1) return x;
  return 1 + Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) * 0.6;
}
function texturaPixel(tam, desenhar) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  desenhar(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Peças comuns a todas as versões do site: botões das lojas e rodapé.
import { LOJAS, INSTAGRAM, SUPORTE, PRIVACIDADE, ESTUDIO } from './config.js';

// Botões "Baixe agora". Enquanto a loja não aprovar (noAr: false), mostram "Em breve" e não levam a lugar nenhum.
export function montarBotoesLoja(el) {
  el.classList.add('lojas');
  el.innerHTML = Object.entries(LOJAS).map(([id, l]) => {
    const conteudo = `<span class="loja-texto"><small>${l.noAr ? 'Baixe na' : l.sistema}</small><b>${l.nome}</b></span>` +
      (l.noAr ? '' : '<span class="selo-em-breve">Em breve</span>');
    return l.noAr
      ? `<a class="botao-loja" href="${l.link}" target="_blank" rel="noopener">${conteudo}</a>`
      : `<span class="botao-loja em-breve" aria-disabled="true" title="${l.nome}: em breve">${conteudo}</span>`;
  }).join('');
}

export function montarRodape(el) {
  el.classList.add('rodape');
  el.innerHTML = `
    <div class="rodape-linhas">
      <p><b>Suporte:</b> <a href="mailto:${SUPORTE}">${SUPORTE}</a></p>
      <p><a href="${PRIVACIDADE}">Política de privacidade</a></p>
      <p><a href="${INSTAGRAM}" target="_blank" rel="noopener">Instagram @cavaleiros_da_ilha</a></p>
    </div>
    <p class="rodape-assinatura">© 2026 <a href="${ESTUDIO}">Daenamu Studio</a></p>`;
}

export const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

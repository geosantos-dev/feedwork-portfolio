"use strict";
/**
 * Filtro de palavras do FeedWork.
 *
 * Cadastrando UMA palavra (ex.: "puta"), o filtro já reconhece sozinho:
 *   - maiúsculas e acentos ........ PÚTA, Puta
 *   - letras repetidas ............. puuuuta, porrrra
 *   - números/símbolos no lugar .... p0rra, m3rd4, c4ralh0, put@
 *   - letras separadas ............. p u t a, p.u.t.a, p-u-t-a, p_u_t_a
 *   - letra escondida por símbolo .. p*ta, f#da, m*rda   (no máximo 1 a cada 3 letras)
 *   - caracteres invisíveis (zero-width) no meio do texto
 *   - letras "parecidas" de outros alfabetos (a cirílico no lugar do a latino)
 * Vale só para a palavra INTEIRA (por isso "computador" não é barrado por "puta").
 * Um "*" no fim da palavra cadastrada bloqueia também as derivadas (ex.: "putaria*").
 */

const HOMOGLIFOS = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0443": "y",
  "\u0456": "i", "\u0455": "s", "\u0458": "j",                       // cirílico
  "\u03b1": "a", "\u03b5": "e", "\u03bf": "o", "\u03bd": "v", "\u03c4": "t", "\u03c1": "p", "\u03ba": "k", // grego
};
const HOMOGLIFOS_RE = new RegExp("[" + Object.keys(HOMOGLIFOS).join("") + "]", "g");
const INVISIVEIS = /[\u200b-\u200f\u2060\ufeff\u00ad]/g;

// O que cada letra pode ser quando alguém troca por número ou símbolo
const LEET = { a: "a4@", b: "b8", e: "e3", i: "i1!", l: "l1", o: "o0", s: "s5$", t: "t7", z: "z2" };
const MASCARA = "[*#%&]";          // símbolos usados para "esconder" uma letra

/** Minúsculas, sem acentos, sem caracteres invisíveis, letras estilizadas viram normais. */
function prep(s, noLugarDoInvisivel = "") {
  return String(s)
    .replace(INVISIVEIS, noLugarDoInvisivel)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(HOMOGLIFOS_RE, (c) => HOMOGLIFOS[c]);
}

/** Junta letras soltas: "p u t a" e "p.u.t.a" viram "puta". Só mexe em sequências de 3+ letras sozinhas. */
function juntar(t) {
  return t
    .replace(/(?<![a-z0-9])[a-z0-9@$!](?:[ \t]+[a-z0-9@$!]){2,}(?![a-z0-9@$!])/g, (m) => m.replace(/\s+/g, ""))
    .replace(/(?<![a-z0-9])[a-z0-9@$!](?:[._\-][a-z0-9@$!]){2,}(?![a-z0-9@$!])/g, (m) => m.replace(/[._\-]/g, ""));
}

/** Transforma uma palavra cadastrada em expressão regular. Retorna null se for inválida. */
function compilar(palavra) {
  const prefixo = /\*\s*$/.test(palavra);                       // "idiot*" = tudo que começa com "idiot"
  const base = prep(String(palavra).replace(/\*+\s*$/, ""));
  const partes = base.split(/[^a-z0-9]+/).filter(Boolean);       // aceita expressões: "mau gestor"
  if (!partes.length) return null;
  const grupo = (parte) => {
    let out = "", anterior = "";
    for (const ch of parte) {
      if (ch === anterior) continue;                             // letra repetida = "uma ou mais"
      anterior = ch;
      out += `(?:[${LEET[ch] || ch}]+|${MASCARA})`;
    }
    return out;
  };
  const re = new RegExp(
    "(?:^|[^a-z0-9])(" + partes.map(grupo).join("[^a-z0-9]+") + (prefixo ? "[a-z0-9]*" : "") + ")(?=$|[^a-z0-9])", "g");
  return { palavra, re, maxMascara: Math.floor(partes.join("").length / 3) };
}

/** Cria o verificador a partir da lista de palavras. */
function criar(palavras) {
  const lista = palavras.map(compilar).filter(Boolean);
  return {
    total: lista.length,
    /** Retorna o trecho encontrado (ou null se o texto estiver limpo). */
    achar(texto) {
      if (!lista.length || !texto) return null;
      // Caractere invisível pode estar dentro da palavra (some) ou entre duas palavras (vira espaço): testa os dois
      const base = [prep(texto)];
      if (new RegExp(INVISIVEIS.source).test(texto)) base.push(prep(texto, " "));
      const alvos = [...new Set(base.flatMap((t) => [t, juntar(t)]))];
      for (const f of lista) {
        for (const alvo of alvos) {
          f.re.lastIndex = 0;
          let m;
          while ((m = f.re.exec(alvo))) {
            const mascaras = (m[1].match(/[*#%&]/g) || []).length;
            if (mascaras <= f.maxMascara) return m[1];
            if (m[0].length === 0) f.re.lastIndex++;
          }
        }
      }
      return null;
    },
  };
}

module.exports = { prep, juntar, compilar, criar };

'use strict';
// Hash de senha com scrypt (nativo do Node, sem dependências).
const crypto = require('node:crypto');

const OPTS = { N: 16384, r: 8, p: 1 };

function hash(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64, OPTS);
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}

function verificar(senha, guardado) {
  try {
    const [alg, s, h] = String(guardado).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(h, 'base64');
    const calculado = crypto.scryptSync(senha, Buffer.from(s, 'base64'), esperado.length, OPTS);
    return crypto.timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

// Usado quando o e-mail não existe, para o tempo de resposta ser parecido.
const FALSO = hash('senha-falsa-para-igualar-tempo');

module.exports = { hash, verificar, FALSO };

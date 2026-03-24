/**
 * Copia el IDL generado por Anchor al backend.
 * Uso (desde la carpeta backend): npm run sync:idl
 * Requiere haber ejecutado `anchor build` en ../contract antes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcIdl = path.join(
  root,
  '..',
  'contract',
  'target',
  'idl',
  'trustpay.json',
);
const dstIdl = path.join(root, 'src', 'solana', 'idl', 'trustpay.json');

if (!fs.existsSync(srcIdl)) {
  console.error('No existe:', srcIdl);
  console.error('Ejecutá `anchor build` en la carpeta contract primero.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dstIdl), { recursive: true });
fs.copyFileSync(srcIdl, dstIdl);
console.log('IDL copiado a', dstIdl);

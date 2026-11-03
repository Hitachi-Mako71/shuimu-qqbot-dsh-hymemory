import tls from 'node:tls';

// Some paths stall Node 24's automatic TLS group negotiation. Use conventional
// ECDHE groups in the dedicated QQ process; retain TLS 1.3 and certificate checks.
// Respect an operator's explicit curve choice and allow the system default.
export function installTLSCompatibility() {
  if(process.env.QQBOT_TLS_CURVE_MODE==='system'||tls.DEFAULT_ECDH_CURVE!=='auto')return false;
  tls.DEFAULT_ECDH_CURVE='X25519:P-256';
  return true;
}

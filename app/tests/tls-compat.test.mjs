import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import {installTLSCompatibility} from '../dsh-hymemory-plugin/tls-compat.js';

test('QQ TLS compatibility retains protocol bounds, cipher and certificate settings',()=>{
  const curve=tls.DEFAULT_ECDH_CURVE,mode=process.env.QQBOT_TLS_CURVE_MODE;
  const before={min:tls.DEFAULT_MIN_VERSION,max:tls.DEFAULT_MAX_VERSION,ciphers:tls.DEFAULT_CIPHERS,verify:process.env.NODE_TLS_REJECT_UNAUTHORIZED};
  try{
    delete process.env.QQBOT_TLS_CURVE_MODE;tls.DEFAULT_ECDH_CURVE='auto';
    assert.equal(installTLSCompatibility(),true);
    assert.equal(tls.DEFAULT_ECDH_CURVE,'X25519:P-256');
    assert.deepEqual({min:tls.DEFAULT_MIN_VERSION,max:tls.DEFAULT_MAX_VERSION,ciphers:tls.DEFAULT_CIPHERS,verify:process.env.NODE_TLS_REJECT_UNAUTHORIZED},before);
    assert.equal(installTLSCompatibility(),false);
    tls.DEFAULT_ECDH_CURVE='P-384';assert.equal(installTLSCompatibility(),false);assert.equal(tls.DEFAULT_ECDH_CURVE,'P-384');
    tls.DEFAULT_ECDH_CURVE='auto';process.env.QQBOT_TLS_CURVE_MODE='system';
    assert.equal(installTLSCompatibility(),false);assert.equal(tls.DEFAULT_ECDH_CURVE,'auto');
  }finally{tls.DEFAULT_ECDH_CURVE=curve;if(mode===undefined)delete process.env.QQBOT_TLS_CURVE_MODE;else process.env.QQBOT_TLS_CURVE_MODE=mode;}
});

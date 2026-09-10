import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTarget,
  confirmHost,
  clearConfirmedHosts,
  isHostConfirmed,
  isPrivateOrLoopbackIPv4,
  isLinkLocalIPv4,
} from './requestPolicy';

describe('requestPolicy', () => {
  beforeEach(() => {
    clearConfirmedHosts();
  });

  it('allows loopback addresses with confirmation on first use', () => {
    const targets = [
      'http://localhost:5000/api',
      'https://127.0.0.1:8080/v1',
      'http://127.0.0.2:3000',
    ];

    for (const target of targets) {
      const url = new URL(target);
      const decision = evaluateTarget(url);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresConfirmation).toBe(true);

      // Confirm host and re-evaluate
      const hostKey = `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
      confirmHost(hostKey);
      const secondDecision = evaluateTarget(url);
      expect(secondDecision.allowed).toBe(true);
      expect(secondDecision.requiresConfirmation).toBe(false);
    }
  });

  it('allows RFC1918 private IPv4 addresses', () => {
    const targets = [
      'http://10.20.30.40:8000',
      'http://192.168.1.10:8080',
      'http://172.16.0.1:4000',
      'http://172.31.255.254:9000',
    ];

    for (const target of targets) {
      const url = new URL(target);
      const decision = evaluateTarget(url);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresConfirmation).toBe(true);
    }
  });

  it('denies public IPv4 addresses by default', () => {
    const targets = [
      'http://8.8.8.8:53',
      'http://93.184.216.34',
      'http://172.32.0.1:80', // outside RFC1918 172.16-31
    ];

    for (const target of targets) {
      const url = new URL(target);
      const decision = evaluateTarget(url);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('blocked by default policy');
    }
  });

  it('denies public hostnames by default', () => {
    const url = new URL('https://example.com/api');
    const decision = evaluateTarget(url);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Public domain example.com is blocked');
  });

  it('denies link-local addresses (169.254.x.x / fe80::)', () => {
    const url = new URL('http://169.254.1.1:80');
    const decision = evaluateTarget(url);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Link-local addresses');
  });

  it('denies targets bearing username/password credentials in URL', () => {
    const url = new URL('http://admin:secret@localhost:8080');
    const decision = evaluateTarget(url);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('URL credentials');
  });

  it('allows approved DNS suffixes (.local, .internal, .test)', () => {
    const url = new URL('http://my-service.local:3000');
    const decision = evaluateTarget(url);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
  });
});

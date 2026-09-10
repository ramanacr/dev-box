export interface RequestPolicy {
  allowedDnsSuffixes?: string[];
  allowPublic?: boolean;
}

export interface TargetDecision {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
}

// Session memory of confirmed hosts
const confirmedHosts = new Set<string>();

export function isHostConfirmed(host: string): boolean {
  return confirmedHosts.has(host.toLowerCase());
}

export function confirmHost(host: string): void {
  confirmedHosts.add(host.toLowerCase());
}

export function clearConfirmedHosts(): void {
  confirmedHosts.clear();
}

/**
 * Checks if an IPv4 address string falls within private or loopback ranges.
 * 127.0.0.0/8 (Loopback)
 * 10.0.0.0/8 (RFC1918)
 * 172.16.0.0/12 (RFC1918)
 * 192.168.0.0/16 (RFC1918)
 */
export function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  if (a === 127) return true; // Loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;

}

export function isLinkLocalIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  return parts[0] === 169 && parts[1] === 254; // 169.254.0.0/16
}

export function evaluateTarget(url: URL, policy: RequestPolicy = {}): TargetDecision {
  // Reject URL credentials (e.g. http://user:pass@host)
  if (url.username || url.password) {
    return {
      allowed: false,
      reason: 'URL credentials in authority (username/password) are forbidden.',
      requiresConfirmation: false,
    };
  }

  const hostname = url.hostname.toLowerCase();

  // Link-local address check
  if (isLinkLocalIPv4(hostname) || hostname === 'fe80::' || hostname.startsWith('fe80:')) {
    return {
      allowed: false,
      reason: 'Link-local addresses (169.254.x.x / fe80::) are denied.',
      requiresConfirmation: false,
    };
  }

  // Loopback check
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.');

  if (isLoopback) {
    const hostKey = `${hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
    const requiresConfirmation = !isHostConfirmed(hostKey);
    return {
      allowed: true,
      requiresConfirmation,
    };
  }

  // Check if it's a literal IPv4 address
  const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  if (isIpv4) {
    if (isPrivateOrLoopbackIPv4(hostname)) {
      const hostKey = `${hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
      const requiresConfirmation = !isHostConfirmed(hostKey);
      return {
        allowed: true,
        requiresConfirmation,
      };
    } else {
      return {
        allowed: false,
        reason: `Public IP destination ${hostname} is blocked by default policy.`,
        requiresConfirmation: false,
      };
    }
  }

  // Check approved private DNS suffixes (.local, .internal, etc.)
  const allowedSuffixes = policy.allowedDnsSuffixes || ['local', 'internal', 'test', 'home.arpa'];
  const hasApprovedSuffix = allowedSuffixes.some((suffix) => {
    const s = suffix.startsWith('.') ? suffix.slice(1) : suffix;
    return hostname === s || hostname.endsWith('.' + s);
  });

  if (hasApprovedSuffix) {
    const hostKey = `${hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
    const requiresConfirmation = !isHostConfirmed(hostKey);
    return {
      allowed: true,
      requiresConfirmation,
    };
  }

  // Fallback: public domain or unauthorized target
  if (policy.allowPublic) {
    const hostKey = `${hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
    const requiresConfirmation = !isHostConfirmed(hostKey);
    return {
      allowed: true,
      requiresConfirmation,
    };
  }

  return {
    allowed: false,
    reason: `Public domain ${hostname} is blocked by default request security policy. Only local and private addresses are permitted.`,
    requiresConfirmation: false,
  };
}

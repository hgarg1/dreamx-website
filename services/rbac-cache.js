/**
 * RBAC Caching Service
 * 
 * High-performance caching layer for RBAC operations:
 * - Effective permissions cache
 * - Role inheritance chain cache
 * - Permission groups cache
 * - Auto-invalidation on updates
 */

class RbacCache {
  constructor(options = {}) {
    // Cache configuration
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 10000;
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute
    
    // Cache stores
    this.effectivePermissionsCache = new Map();
    this.roleInheritanceCache = new Map();
    this.permissionGroupsCache = new Map();
    this.userRolesCache = new Map();
    this.rolePermissionsCache = new Map();
    
    // Cache metadata for LRU and stats
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.lastCleanup = Date.now();
    
    // Version tracking for invalidation
    this.version = 1;
    this.roleVersions = new Map();
    this.permissionVersions = new Map();
    this.userVersions = new Map();
    
    // Start cleanup timer
    this._startCleanupTimer();
  }
  
  /**
   * Start periodic cleanup of expired entries
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);
    
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Cleanup expired cache entries
   */
  _cleanup() {
    const now = Date.now();
    
    for (const [store, cache] of [
      ['effectivePermissions', this.effectivePermissionsCache],
      ['roleInheritance', this.roleInheritanceCache],
      ['permissionGroups', this.permissionGroupsCache],
      ['userRoles', this.userRolesCache],
      ['rolePermissions', this.rolePermissionsCache]
    ]) {
      let expiredCount = 0;
      for (const [key, entry] of cache.entries()) {
        if (now > entry.expiresAt) {
          cache.delete(key);
          expiredCount++;
        }
      }
    }
    
    this.lastCleanup = now;
  }
  
  /**
   * Generate cache key
   */
  _key(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}:v${this.version}`;
  }
  
  /**
   * Set value in cache
   */
  _set(cache, key, value) {
    // Enforce max size with LRU eviction
    if (cache.size >= this.maxSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttl,
      accessCount: 0
    });
  }
  
  /**
   * Get value from cache
   */
  _get(cache, key) {
    const entry = cache.get(key);
    
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    entry.accessCount++;
    this.cacheHits++;
    return entry.value;
  }
  
  // =========================================================================
  // EFFECTIVE PERMISSIONS CACHE
  // =========================================================================
  
  /**
   * Get cached effective permissions for a user
   */
  getEffectivePermissions(userId, scope = null) {
    const key = this._key('ep', userId, scope || 'global');
    const userVersion = this.userVersions.get(userId) || 0;
    
    const entry = this.effectivePermissionsCache.get(key);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    
    // Check if user version has changed
    if (entry.userVersion !== userVersion) {
      this.effectivePermissionsCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.effectivePermissionsCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    return entry.value;
  }
  
  /**
   * Set cached effective permissions for a user
   */
  setEffectivePermissions(userId, scope = null, permissions) {
    const key = this._key('ep', userId, scope || 'global');
    const userVersion = this.userVersions.get(userId) || 0;
    
    this._set(this.effectivePermissionsCache, key, permissions);
    this.effectivePermissionsCache.get(key).userVersion = userVersion;
  }
  
  // =========================================================================
  // ROLE INHERITANCE CACHE
  // =========================================================================
  
  /**
   * Get cached role inheritance chain
   */
  getRoleInheritanceChain(roleId) {
    const key = this._key('ri', roleId);
    const roleVersion = this.roleVersions.get(roleId) || 0;
    
    const entry = this.roleInheritanceCache.get(key);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    
    if (entry.roleVersion !== roleVersion) {
      this.roleInheritanceCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.roleInheritanceCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    return entry.value;
  }
  
  /**
   * Set cached role inheritance chain
   */
  setRoleInheritanceChain(roleId, chain) {
    const key = this._key('ri', roleId);
    const roleVersion = this.roleVersions.get(roleId) || 0;
    
    this._set(this.roleInheritanceCache, key, chain);
    this.roleInheritanceCache.get(key).roleVersion = roleVersion;
  }
  
  // =========================================================================
  // PERMISSION GROUPS CACHE
  // =========================================================================
  
  /**
   * Get cached permission groups
   */
  getPermissionGroups(includeDisabled = false, includeDeleted = false) {
    const key = this._key('pg', includeDisabled, includeDeleted);
    return this._get(this.permissionGroupsCache, key);
  }
  
  /**
   * Set cached permission groups
   */
  setPermissionGroups(includeDisabled, includeDeleted, groups) {
    const key = this._key('pg', includeDisabled, includeDeleted);
    this._set(this.permissionGroupsCache, key, groups);
  }
  
  // =========================================================================
  // USER ROLES CACHE
  // =========================================================================
  
  /**
   * Get cached user roles
   */
  getUserRoles(userId) {
    const key = this._key('ur', userId);
    const userVersion = this.userVersions.get(userId) || 0;
    
    const entry = this.userRolesCache.get(key);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    
    if (entry.userVersion !== userVersion) {
      this.userRolesCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.userRolesCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    return entry.value;
  }
  
  /**
   * Set cached user roles
   */
  setUserRoles(userId, roles) {
    const key = this._key('ur', userId);
    const userVersion = this.userVersions.get(userId) || 0;
    
    this._set(this.userRolesCache, key, roles);
    this.userRolesCache.get(key).userVersion = userVersion;
  }
  
  // =========================================================================
  // ROLE PERMISSIONS CACHE
  // =========================================================================
  
  /**
   * Get cached role permissions
   */
  getRolePermissions(roleId, includeInherited = true) {
    const key = this._key('rp', roleId, includeInherited);
    const roleVersion = this.roleVersions.get(roleId) || 0;
    
    const entry = this.rolePermissionsCache.get(key);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    
    if (entry.roleVersion !== roleVersion) {
      this.rolePermissionsCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.rolePermissionsCache.delete(key);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    return entry.value;
  }
  
  /**
   * Set cached role permissions
   */
  setRolePermissions(roleId, includeInherited, permissions) {
    const key = this._key('rp', roleId, includeInherited);
    const roleVersion = this.roleVersions.get(roleId) || 0;
    
    this._set(this.rolePermissionsCache, key, permissions);
    this.rolePermissionsCache.get(key).roleVersion = roleVersion;
  }
  
  // =========================================================================
  // CACHE INVALIDATION
  // =========================================================================
  
  /**
   * Invalidate all caches for a user
   */
  invalidateUser(userId) {
    this.userVersions.set(userId, (this.userVersions.get(userId) || 0) + 1);
    
    // Also clear direct cache entries
    for (const key of this.effectivePermissionsCache.keys()) {
      if (key.includes(`:${userId}:`)) {
        this.effectivePermissionsCache.delete(key);
      }
    }
    for (const key of this.userRolesCache.keys()) {
      if (key.includes(`:${userId}:`)) {
        this.userRolesCache.delete(key);
      }
    }
  }
  
  /**
   * Invalidate all caches for a role
   */
  invalidateRole(roleId) {
    this.roleVersions.set(roleId, (this.roleVersions.get(roleId) || 0) + 1);
    
    // Clear role-specific caches
    for (const key of this.roleInheritanceCache.keys()) {
      if (key.includes(`:${roleId}:`)) {
        this.roleInheritanceCache.delete(key);
      }
    }
    for (const key of this.rolePermissionsCache.keys()) {
      if (key.includes(`:${roleId}:`)) {
        this.rolePermissionsCache.delete(key);
      }
    }
    
    // Clear all effective permissions (role change affects all users with that role)
    this.effectivePermissionsCache.clear();
  }
  
  /**
   * Invalidate permission caches
   */
  invalidatePermission(permissionId) {
    this.permissionVersions.set(permissionId, (this.permissionVersions.get(permissionId) || 0) + 1);
    
    // Permission changes affect role permissions and effective permissions
    this.rolePermissionsCache.clear();
    this.effectivePermissionsCache.clear();
  }
  
  /**
   * Invalidate permission group caches
   */
  invalidatePermissionGroups() {
    this.permissionGroupsCache.clear();
  }
  
  /**
   * Invalidate all caches (nuclear option)
   */
  invalidateAll() {
    this.version++;
    this.effectivePermissionsCache.clear();
    this.roleInheritanceCache.clear();
    this.permissionGroupsCache.clear();
    this.userRolesCache.clear();
    this.rolePermissionsCache.clear();
  }
  
  // =========================================================================
  // CACHE STATISTICS
  // =========================================================================
  
  /**
   * Get cache statistics
   */
  getStats() {
    const totalSize = 
      this.effectivePermissionsCache.size +
      this.roleInheritanceCache.size +
      this.permissionGroupsCache.size +
      this.userRolesCache.size +
      this.rolePermissionsCache.size;
    
    const hitRate = this.cacheHits + this.cacheMisses > 0 
      ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(2)
      : 0;
    
    return {
      version: this.version,
      totalSize,
      maxSize: this.maxSize,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: `${hitRate}%`,
      ttlMs: this.ttl,
      lastCleanup: new Date(this.lastCleanup).toISOString(),
      stores: {
        effectivePermissions: this.effectivePermissionsCache.size,
        roleInheritance: this.roleInheritanceCache.size,
        permissionGroups: this.permissionGroupsCache.size,
        userRoles: this.userRolesCache.size,
        rolePermissions: this.rolePermissionsCache.size
      }
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
  
  /**
   * Stop the cache cleanup timer
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Create singleton instance
const cache = new RbacCache();

module.exports = {
  RbacCache,
  cache
};

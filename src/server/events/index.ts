import "server-only";

export type PublicServerEvent =
  | { type: "refresh" }
  | { type: "user_deleted" }
  | { type: "username_changed"; username: string }
  | { type: "avatar_updated" };

export type ServerEvent =
  | PublicServerEvent
  | { type: "auth_changed" }
  | { type: "decks_changed" }
  | { type: "sync" }
  | { type: "ai_deck_job_changed"; jobId: string };

type Listener = (event: ServerEvent) => void;
type PublicListener = (event: PublicServerEvent) => void;
type AnyListener = (event: unknown) => void;

declare global {
  // eslint-disable-next-line no-var
  var __serverEventBus: Map<string, Set<AnyListener>> | undefined;
}

function getBus() {
  if (!global.__serverEventBus) {
    global.__serverEventBus = new Map();
  }
  return global.__serverEventBus;
}

function userKey(userId: string) {
  return `user:${userId}`;
}

function publicUserKey(userId: string) {
  return `public_user:${userId}`;
}

export function publishUserEvent(userId: string, event: ServerEvent) {
  const bus = getBus();
  const listeners = bus.get(userKey(userId));
  if (!listeners || listeners.size === 0) {
    return;
  }
  for (const listener of listeners) {
    try {
      (listener as Listener)(event);
    } catch {
      // ignore
    }
  }
}

export function publishPublicUserEvent(userId: string, event: PublicServerEvent) {
  const bus = getBus();
  const listeners = bus.get(publicUserKey(userId));
  if (!listeners || listeners.size === 0) {
    return;
  }
  for (const listener of listeners) {
    try {
      (listener as PublicListener)(event);
    } catch {
      // ignore
    }
  }
}

export function subscribeUserEvents(userId: string, listener: Listener) {
  const bus = getBus();
  const key = userKey(userId);
  const listeners = bus.get(key) ?? new Set();
  listeners.add(listener as AnyListener);
  bus.set(key, listeners);

  return () => {
    const current = bus.get(key);
    if (!current) {
      return;
    }
    current.delete(listener as AnyListener);
    if (current.size === 0) {
      bus.delete(key);
    } else {
      bus.set(key, current);
    }
  };
}

export function subscribePublicUserEvents(userId: string, listener: PublicListener) {
  const bus = getBus();
  const key = publicUserKey(userId);
  const listeners = bus.get(key) ?? new Set();
  listeners.add(listener as AnyListener);
  bus.set(key, listeners);

  return () => {
    const current = bus.get(key);
    if (!current) {
      return;
    }
    current.delete(listener as AnyListener);
    if (current.size === 0) {
      bus.delete(key);
    } else {
      bus.set(key, current);
    }
  };
}

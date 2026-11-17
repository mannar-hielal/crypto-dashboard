/**
 * One request per key at a time: a caller asking while one is on its way shares it, and the key is
 * free again once it settles (either way). The habits reads and the progress checks after a
 * refusal both use it
 */
export function onePerKey<T>(
  onTheWay: Map<string, Promise<T>>,
  key: string,
  send: () => Promise<T>
): Promise<T> {
  const shared = onTheWay.get(key);
  if (shared) return shared;
  const sent = send().finally(() => {
    if (onTheWay.get(key) === sent) onTheWay.delete(key);
  });
  onTheWay.set(key, sent);
  return sent;
}

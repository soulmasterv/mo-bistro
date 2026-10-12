/** Keep unread notifications limited to requests that are still pending. */
export function reconcileRequestIds(
  pending: ReadonlySet<number>,
  previous: ReadonlySet<number> | null,
  unread: ReadonlySet<number>,
  panelOpen: boolean,
) {
  const added = [...pending].filter(id => previous !== null && !previous.has(id));
  const nextUnread = panelOpen ? new Set<number>() : new Set(
    [...unread, ...(previous === null ? pending : added)].filter(id => pending.has(id)),
  );
  return { unread: nextUnread, added };
}
